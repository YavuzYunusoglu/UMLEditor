'use strict';
/* Dosya işlemleri: kaydet/aç, PNG/SVG dışa aktarım, C# zip */
(function (global) {
  const App = (global.App = global.App || {});
  const U = App.U;
  const $t = App.$t || ((k) => k);

  const FILE_EXT = '.uml.json';
  let fileHandle = null;

  function docJSON() {
    return JSON.stringify(App.Store.doc, null, 2);
  }

  function fileBase() { return U.safeFileName(App.Store.doc.name, 'diagram'); }

  async function save(saveAs) {
    const data = docJSON();
    if (window.showSaveFilePicker) {
      try {
        if (!fileHandle || saveAs) {
          fileHandle = await window.showSaveFilePicker({
            suggestedName: fileBase() + FILE_EXT,
            types: [{ description: $t('UML Studio diyagramı'), accept: { 'application/json': ['.json'] } }],
          });
        }
        const w = await fileHandle.createWritable();
        await w.write(data);
        await w.close();
        App.Store.dirty = false;
        App.Store.emit('saved');
        App.UI.toast($t('Kaydedildi: {name}', { name: fileHandle.name }), 'ok');
        return true;
      } catch (e) {
        if (e && e.name === 'AbortError') return false;
        console.warn(e);
      }
    }
    U.download(fileBase() + FILE_EXT, data, 'application/json');
    App.Store.dirty = false;
    App.Store.emit('saved');
    App.UI.toast($t('İndirildi: {name}', { name: fileBase() + FILE_EXT }), 'ok');
    return true;
  }

  async function open() {
    if (App.Store.dirty && !(await App.UI.confirm($t('Kaydedilmemiş değişiklikler kaybolacak. Devam edilsin mi?')))) return;
    let file = null, handle = null;
    if (window.showOpenFilePicker) {
      try {
        [handle] = await window.showOpenFilePicker({ types: [{ description: $t('UML Studio diyagramı'), accept: { 'application/json': ['.json'] } }] });
        file = await handle.getFile();
      } catch (e) { if (e && e.name === 'AbortError') return; }
    }
    if (!file) {
      const files = await U.pickFiles({ accept: '.json,application/json' });
      file = files[0];
    }
    if (!file) return;
    await openFile(file, handle);
  }

  async function openFile(file, handle) {
    try {
      const doc = JSON.parse(await U.readFileText(file));
      if (!doc.name || doc.name === 'Adsız' || doc.name === 'Untitled') doc.name = file.name.replace(/(\.uml)?\.json$/i, ''); // i18n-ok: eski sürümlerin varsayılan adı
      App.Store.load(doc);
      fileHandle = handle || null;
      App.Editor.fitView();
      App.UI.toast($t('Açıldı: {name}', { name: file.name }), 'ok');
    } catch (e) {
      App.UI.toast($t('Dosya açılamadı: {msg}', { msg: e.message }), 'error');
    }
  }

  function resetHandle() { fileHandle = null; }

  /* ---------- Görsel dışa aktarım ---------- */
  function buildSVG(opts) {
    opts = opts || {};
    const tab = opts.tab || App.Store.tab;
    const T = App.Theme.themes[opts.theme] || App.Theme.current();
    const only = opts.selection && App.Store.sel.nodes.size ? new Set(App.Store.sel.nodes) : null;
    const b = App.Geo.contentBounds(tab, only);
    if (!b) return null;
    const pad = opts.padding != null ? opts.padding : 30;
    // etiketler sınırları biraz aşabilir
    const x = Math.floor(b.x - pad), y = Math.floor(b.y - pad), w = Math.ceil(b.w + pad * 2), h = Math.ceil(b.h + pad * 2);
    const out = App.Render.renderTab(tab, T, { only });
    const bg = opts.transparent ? '' : `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${T.canvas}"/>`;
    const fontFamily = U.FONT_SANS.replace(/"/g, "'");
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="${x} ${y} ${w} ${h}" font-family="${fontFamily}">` +
      bg + out.frames + out.edges + out.nodes + out.labels + '</svg>';
    return { svg, w, h };
  }

  function exportSVG(opts) {
    const r = buildSVG(opts);
    if (!r) return App.UI.toast($t('Dışa aktarılacak bir şey yok'), 'warn');
    U.download(fileBase() + '-' + U.safeFileName(App.Store.tab.name) + '.svg', '<?xml version="1.0" encoding="UTF-8"?>\n' + r.svg, 'image/svg+xml');
  }

  function svgToCanvas(r, scale) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      const url = URL.createObjectURL(new Blob([r.svg], { type: 'image/svg+xml;charset=utf-8' }));
      img.onload = () => {
        const max = 16000;
        const s = Math.min(scale, max / r.w, max / r.h);
        const c = document.createElement('canvas');
        c.width = Math.round(r.w * s); c.height = Math.round(r.h * s);
        const ctx = c.getContext('2d');
        ctx.scale(s, s);
        ctx.drawImage(img, 0, 0, r.w, r.h);
        URL.revokeObjectURL(url);
        resolve(c);
      };
      img.onerror = (e) => { URL.revokeObjectURL(url); reject(e); };
      img.src = url;
    });
  }

  async function exportPNG(opts) {
    opts = opts || {};
    const r = buildSVG(opts);
    if (!r) return App.UI.toast($t('Dışa aktarılacak bir şey yok'), 'warn');
    try {
      const canvas = await svgToCanvas(r, opts.scale || 2);
      const blob = await new Promise((res) => canvas.toBlob(res, 'image/png'));
      if (opts.clipboard && navigator.clipboard && window.ClipboardItem) {
        await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
        App.UI.toast($t('PNG panoya kopyalandı'), 'ok');
        return;
      }
      U.download(fileBase() + '-' + U.safeFileName(App.Store.tab.name) + '.png', blob);
    } catch (e) {
      console.error(e);
      App.UI.toast($t('PNG oluşturulamadı: {msg}', { msg: e.message || e }), 'error');
    }
  }

  /* ---------- C# ---------- */
  function exportCSharpZip(ids) {
    const files = App.CSharp.generateAll(App.Store.tab, ids);
    if (!files.length) return App.UI.toast($t('Bu sekmede sınıf yok'), 'warn');
    const zip = App.Zip.build(files.map((f) => ({ name: 'Scripts/' + f.fileName, data: f.code, bom: true })));
    U.download(fileBase() + '-Scripts.zip', new Blob([zip], { type: 'application/zip' }));
    App.UI.toast($t('{n} C# dosyası dışa aktarıldı', { n: files.length }), 'ok');
  }

  App.IO = { save, open, openFile, resetHandle, buildSVG, exportSVG, exportPNG, exportCSharpZip, docJSON, FILE_EXT, get hasHandle() { return !!fileHandle; } };
})(typeof window !== 'undefined' ? window : globalThis);
