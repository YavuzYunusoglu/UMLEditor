'use strict';
/* Uygulama: araç çubuğu, palet, sekmeler, eylemler, kısayollar, otomatik kayıt */
(function (global) {
  const App = global.App;
  const { U, Store, Model, Editor, UI, IO, Geo, I18n } = App;
  const $t = App.$t;
  const h = U.h;
  const icon = UI.icon;
  const AUTOSAVE_KEY = 'umlstudio.autosave';

  /* ======================= EYLEMLER ======================= */
  const Actions = App.Actions = {
    async newDoc() {
      if (Store.dirty && Store.tab.nodes.length && !(await UI.confirm($t('Yeni belge oluşturulsun mu? Kaydedilmemiş değişiklikler kaybolur (otomatik kayıt da sıfırlanır).'), { ok: $t('Yeni belge') }))) return;
      const d = Model.newDoc();
      Store.load(d);
      IO.resetHandle();
      Editor.fitView();
      autosave.flush();
    },
    open: () => IO.open(),
    save: (as) => IO.save(as),

    addTab(name, kind) {
      const t = Model.newTab(name || uniqueTabName(kind === 'flow' ? $t('Akış Şeması') : kind === 'class' ? $t('Sınıf Diyagramı') : $t('Diyagram')));
      Store.mutate(() => { Store.doc.tabs.push(t); });
      Store.setActiveTab(t.id);
      return t;
    },
    async renameTab(id) {
      const t = Store.doc.tabs.find((x) => x.id === id);
      if (!t) return;
      const v = await UI.prompt($t('Sekme adı'), t.name);
      if (v && v.trim()) { Store.mutate(() => { t.name = v.trim(); }); renderTabs(); }
    },
    duplicateTab(id) {
      const t = Store.doc.tabs.find((x) => x.id === id);
      if (!t) return;
      const c = U.clone(t);
      c.id = U.uid('tab'); c.name = uniqueTabName($t('{name} kopya', { name: t.name }));
      // düğüm/kenar id'lerini yenile
      const map = new Map();
      c.nodes.forEach((n) => { const nid = U.uid('n'); map.set(n.id, nid); n.id = nid; });
      c.edges.forEach((e) => { e.id = U.uid('e'); e.from = map.get(e.from); e.to = map.get(e.to); });
      Store.mutate(() => { Store.doc.tabs.splice(Store.doc.tabs.indexOf(t) + 1, 0, c); });
      Store.setActiveTab(c.id);
    },
    async closeTab(id) {
      const t = Store.doc.tabs.find((x) => x.id === id);
      if (!t) return;
      if (t.nodes.length && !(await UI.confirm($t('"{name}" sekmesi silinsin mi? (Geri alınabilir)', { name: t.name }), { ok: $t('Sil'), danger: true }))) return;
      Store.mutate(() => {
        const i = Store.doc.tabs.indexOf(t);
        Store.doc.tabs.splice(i, 1);
        if (!Store.doc.tabs.length) Store.doc.tabs.push(Model.newTab($t('Diyagram')));
        if (Store.doc.activeTab === id) Store.doc.activeTab = Store.doc.tabs[Math.max(0, i - 1)].id;
      });
      Store.emit('tab');
      Store.emit('selection');
    },
    moveTab(id, dir) {
      const tabs = Store.doc.tabs, i = tabs.findIndex((t) => t.id === id), j = i + dir;
      if (i < 0 || j < 0 || j >= tabs.length) return;
      Store.mutate(() => { [tabs[i], tabs[j]] = [tabs[j], tabs[i]]; });
      renderTabs();
    },

    toggleTheme() {
      App.Theme.toggle();
      Store.emit('theme');
      updateThemeButton();
    },

    /* Dil değişince sayfa yeniden yüklenir; belge otomatik kayıttan geri gelir */
    setLanguage(code) {
      if (code === I18n.lang) return;
      autosave.flush();
      try { localStorage.setItem(AUTOSAVE_KEY, JSON.stringify({ doc: Store.doc, dirty: Store.dirty, t: Date.now() })); } catch (e) { /* yok say */ }
      I18n.set(code);
      location.reload();
    },

    groupSelection() {
      const nodes = Store.selectedNodes().filter((n) => n.type !== 'frame');
      if (!nodes.length) return;
      const b = Geo.unionBounds(nodes.map(Geo.bounds));
      const f = Model.createNode('frame', b.x - 30, b.y - 50, { w: Math.round(b.w + 60), h: Math.round(b.h + 80), text: $t('Grup') });
      Store.mutate(() => { Store.tab.nodes.unshift(f); });
      Store.select([f.id], []);
      Editor.renderNow();
      Editor.startInlineEdit(f.id);
    },

    /* ---------- İçe aktarım ---------- */
    async importCSharpPick(directory) {
      const files = await U.pickFiles({ accept: '.cs', multiple: true, directory });
      const cs = files.filter((f) => /\.cs$/i.test(f.name));
      if (!cs.length) { if (files.length) UI.toast($t('Seçimde .cs dosyası bulunamadı'), 'warn'); return; }
      await Actions.importCSharpFiles(cs);
    },
    async importCSharpFiles(files) {
      const sources = [];
      for (const f of files) {
        if (/[\\/](Library|Packages|PackageCache|Temp|obj)[\\/]/.test(f.webkitRelativePath || f.fullPath || '')) continue;
        sources.push(await U.readFileText(f));
      }
      let types;
      try { types = App.CSharp.parseSources(sources); } catch (e) { UI.toast($t('C# ayrıştırılamadı: {msg}', { msg: e.message }), 'error'); return; }
      if (!types.length) { UI.toast($t('Dosyalarda sınıf/arayüz/enum bulunamadı'), 'warn'); return; }
      const count = (k) => types.filter((t) => t.kind === k).length;
      const opts = { private: true, methods: true, fields: true, relations: true };
      const chk = (key, label) => {
        const el = h('input', { type: 'checkbox', checked: opts[key] });
        el.addEventListener('change', () => { opts[key] = el.checked; });
        return h('label', { class: 'p-check' }, el, h('span', null, label));
      };
      const list = h('div', { class: 'import-list' }, types.slice(0, 400).map((t) => h('span', { class: 'chip static', style: { '--chip': kindColor(t) } }, t.name)));
      UI.modal({
        title: $t('C# script\'lerini içe aktar'),
        body: h('div', null,
          h('p', { class: 'modal-text' }, $t('{files} dosyada {classes} sınıf, {ifaces} arayüz, {structs} struct, {enums} enum bulundu.', { files: files.length, classes: count('class'), ifaces: count('interface'), structs: count('struct'), enums: count('enum') })),
          list,
          h('div', { class: 'p-row wrap', style: { marginTop: '12px' } },
            chk('fields', $t('Alanlar ve özellikler')), chk('methods', $t('Metotlar')), chk('private', $t('Private üyeler')), chk('relations', $t('Alan tiplerinden ilişkiler'))),
          h('p', { class: 'p-hint' }, $t('Kalıtım ve arayüz ilişkileri her zaman oluşturulur. Sonuç yeni bir sekmeye eklenir.'))),
        buttons: [{ spacer: true }, { label: $t('Vazgeç') }, { label: $t('İçe aktar'), primary: true, icon: 'import', action: () => {
          const frag = App.CSharp.buildDiagram(types, opts);
          App.Layout.layered(frag.nodes, frag.edges, { reverse: new Set(['inheritance', 'realization']) });
          const t = Actions.addTab(uniqueTabName($t('C# İçe Aktarım')), 'class');
          Store.mutate(() => { Store.insertFragment(frag, t); });
          Editor.renderNow();
          Editor.fitView();
          UI.toast($t('{n} tip içe aktarıldı', { n: frag.nodes.length }), 'ok');
        } }],
      });
    },
    importMermaidDialog(initial) {
      const ta = h('textarea', { class: 'input area mono', rows: 14, spellcheck: false, value: initial || '', placeholder: $t('flowchart TD\n    A([Başla]) --> B{Koşul?}\n    B -->|Evet| C[İşlem]\n    B -->|Hayır| D[Diğer]\n\nveya\n\nclassDiagram\n    Animal <|-- Dog\n    class Dog {\n      +String name\n      +bark() void\n    }') });
      let target = 'new';
      const seg = h('div', { class: 'seg' },
        ...[['new', $t('Yeni sekmeye')], ['current', $t('Bu sekmeye ekle')]].map(([v, l]) => {
          const b = h('button', { class: 'seg-btn' + (v === target ? ' active' : '') }, l);
          b.addEventListener('click', () => { target = v; seg.querySelectorAll('.seg-btn').forEach((x) => x.classList.toggle('active', x === b)); });
          return b;
        }));
      UI.modal({
        title: $t('Mermaid içe aktar'), wide: true,
        body: h('div', null, h('p', { class: 'modal-text' }, $t('Mermaid flowchart / graph veya classDiagram metnini yapıştırın.')), ta, h('div', { style: { marginTop: '10px' } }, seg)),
        buttons: [
          { label: $t('Dosyadan…'), icon: 'folder', action: () => { U.pickFiles({ accept: '.mmd,.mermaid,.md,.txt' }).then(async (fs) => { if (fs[0]) ta.value = await U.readFileText(fs[0]); }); return false; } },
          { spacer: true }, { label: $t('Vazgeç') },
          { label: $t('İçe aktar'), primary: true, icon: 'import', action: () => {
            try {
              Actions.applyMermaid(ta.value, target);
            } catch (e) { UI.toast($t('Mermaid okunamadı: {msg}', { msg: e.message }), 'error'); return false; }
          } }],
      });
    },
    applyMermaid(text, target) {
      const r = App.Mermaid.importMermaid(text);
      App.Layout.layered(r.nodes, r.edges, { direction: r.direction, reverse: new Set(['inheritance', 'realization']) });
      if (target === 'new') {
        const t = Actions.addTab(uniqueTabName(r.kind === 'flow' ? $t('Mermaid Akış') : $t('Mermaid Sınıf')), r.kind);
        Store.mutate(() => { Store.insertFragment(r, t); });
        Editor.renderNow();
        Editor.fitView();
      } else {
        const res = Editor.insertFragment(r, { at: Editor.viewCenterWorld() });
        Editor.fitView(new Set(res.nodes.map((n) => n.id)));
      }
      UI.toast($t('{n} öğe içe aktarıldı', { n: r.nodes.length }), 'ok');
    },
    async importJsonTabs() {
      const files = await U.pickFiles({ accept: '.json' });
      if (!files[0]) return;
      try {
        const doc = Model.normalize(JSON.parse(await U.readFileText(files[0])));
        Store.mutate(() => {
          for (const t of doc.tabs) {
            t.id = U.uid('tab');
            t.name = uniqueTabName(t.name);
            Store.doc.tabs.push(t);
          }
        });
        Store.setActiveTab(doc.tabs[0].id);
        Editor.fitView();
        UI.toast($t('{n} sekme eklendi', { n: doc.tabs.length }), 'ok');
      } catch (e) { UI.toast($t('JSON okunamadı: {msg}', { msg: e.message }), 'error'); }
    },
    async handleDroppedFiles(files, items) {
      // klasör sürüklendiyse içindeki .cs dosyalarını topla
      if (items && items.length && items[0].webkitGetAsEntry) {
        const entries = Array.from(items).map((i) => i.webkitGetAsEntry && i.webkitGetAsEntry()).filter(Boolean);
        if (entries.some((e) => e.isDirectory)) {
          const all = [];
          await Promise.all(entries.map((e) => collectEntries(e, all)));
          files = all;
        }
      }
      const cs = files.filter((f) => /\.cs$/i.test(f.name));
      const json = files.find((f) => /\.json$/i.test(f.name));
      const mm = files.find((f) => /\.(mmd|mermaid|md|txt)$/i.test(f.name));
      if (cs.length) return Actions.importCSharpFiles(cs);
      if (json) {
        if (Store.dirty && Store.tab.nodes.length && !(await UI.confirm($t('"{name}" açılsın mı? Mevcut belge değişir (geri alınamaz).', { name: json.name })))) return;
        return IO.openFile(json);
      }
      if (mm) return Actions.importMermaidDialog(await U.readFileText(mm));
      UI.toast($t('Desteklenen dosyalar: .cs, .json, .mmd'), 'warn');
    },

    /* ---------- Dışa aktarım ---------- */
    exportImageDialog(fmt) {
      const opts = { theme: App.Theme.name, transparent: false, scale: 2, selection: false, padding: 30 };
      const hasSel = Store.sel.nodes.size > 0;
      const seg = (key, options) => {
        const w = h('div', { class: 'seg' });
        for (const [v, l] of options) {
          const b = h('button', { class: 'seg-btn' + (opts[key] === v ? ' active' : '') }, l);
          b.addEventListener('click', () => { opts[key] = v; w.querySelectorAll('.seg-btn').forEach((x) => x.classList.toggle('active', x === b)); update(); });
          w.appendChild(b);
        }
        return w;
      };
      const preview = h('div', { class: 'export-preview' });
      const info = h('div', { class: 'p-hint' });
      const update = () => {
        const r = IO.buildSVG(opts);
        if (!r) { preview.replaceChildren(h('div', { class: 'p-hint' }, $t('Boş diyagram'))); return; }
        preview.innerHTML = r.svg;
        preview.classList.toggle('checker', opts.transparent);
        info.textContent = fmt === 'png' ? `${Math.round(r.w * opts.scale)} × ${Math.round(r.h * opts.scale)} px` : `${r.w} × ${r.h}`;
      };
      const body = h('div', { class: 'export-grid' },
        preview,
        h('div', { class: 'export-opts' },
          h('label', { class: 'p-field' }, h('span', { class: 'p-label' }, $t('Tema')), seg('theme', [['dark', $t('Koyu')], ['light', $t('Açık')]])),
          h('label', { class: 'p-field' }, h('span', { class: 'p-label' }, $t('Arka plan')), seg('transparent', [[false, $t('Dolu')], [true, $t('Şeffaf')]])),
          fmt === 'png' ? h('label', { class: 'p-field' }, h('span', { class: 'p-label' }, $t('Ölçek')), seg('scale', [[1, '1×'], [2, '2×'], [3, '3×'], [4, '4×']])) : null,
          h('label', { class: 'p-field' }, h('span', { class: 'p-label' }, $t('Kapsam')), hasSel ? seg('selection', [[false, $t('Tüm sekme')], [true, $t('Seçim')]]) : h('span', { class: 'p-hint' }, $t('Tüm sekme'))),
          info));
      const btns = [{ spacer: true }, { label: $t('Vazgeç') }];
      if (fmt === 'png' && navigator.clipboard && window.ClipboardItem) btns.push({ label: $t('Panoya kopyala'), icon: 'copy', action: () => { IO.exportPNG(Object.assign({}, opts, { clipboard: true })); } });
      btns.push({ label: fmt === 'png' ? $t('PNG indir') : $t('SVG indir'), primary: true, icon: 'export', action: () => { fmt === 'png' ? IO.exportPNG(opts) : IO.exportSVG(opts); } });
      UI.modal({ title: fmt === 'png' ? $t('PNG olarak dışa aktar') : $t('SVG olarak dışa aktar'), wide: true, body, buttons: btns, noFocus: true });
      update();
    },
    exportTextDialog(kind) {
      const tab = Store.tab;
      const text = kind === 'plantuml' ? App.Mermaid.toPlantUML(tab) : App.Mermaid.toMermaid(tab);
      if (!text.trim() || (kind === 'plantuml' && !tab.nodes.some((n) => n.type === 'class'))) {
        UI.toast(kind === 'plantuml' ? $t('PlantUML dışa aktarımı sınıf diyagramları içindir') : $t('Bu sekme boş'), 'warn');
        return;
      }
      const ta = h('textarea', { class: 'input area mono', rows: 18, spellcheck: false, readOnly: true, value: text });
      const ext = kind === 'plantuml' ? '.puml' : '.mmd';
      UI.modal({
        title: kind === 'plantuml' ? 'PlantUML' : 'Mermaid', wide: true,
        body: h('div', null, h('p', { class: 'modal-text' }, kind === 'plantuml' ? $t('PlantUML sunucusu veya eklentisiyle kullanılabilir.') : $t('GitHub, GitLab, Notion, Obsidian gibi Mermaid destekleyen yerlere yapıştırabilirsiniz.')), ta),
        buttons: [{ spacer: true },
          { label: $t('Kopyala'), icon: 'copy', action: () => { UI.copyText(kind === 'mermaid' ? '```mermaid\n' + text + '\n```' : text); return false; } },
          { label: $t('İndir ({ext})', { ext }), primary: true, icon: 'export', action: () => { U.download(U.safeFileName(Store.doc.name) + '-' + U.safeFileName(tab.name) + ext, text, 'text/plain'); } }],
        noFocus: true,
      });
    },
    showCSharp(ids) {
      const files = App.CSharp.generateAll(Store.tab, ids && ids.size ? ids : null);
      if (!files.length) { UI.toast($t('Bu sekmede sınıf yok'), 'warn'); return; }
      let cur = 0;
      const list = h('div', { class: 'code-files' });
      const code = h('pre', { class: 'code-view' });
      const show = (i) => {
        cur = i;
        code.innerHTML = UI.highlightCS(files[i].code);
        list.querySelectorAll('.code-file').forEach((el, k) => el.classList.toggle('active', k === i));
      };
      files.forEach((f, i) => list.appendChild(h('button', { class: 'code-file', onclick: () => show(i), title: f.fileName }, f.fileName)));
      UI.modal({
        title: $t('C# kodu (Unity)'), wide: true, className: 'code-modal',
        body: h('div', { class: 'code-grid' }, list, code),
        buttons: [
          { label: $t('Tümünü .zip indir'), icon: 'export', action: () => { IO.exportCSharpZip(ids && ids.size ? ids : null); return false; } },
          { spacer: true },
          { label: $t('Kopyala'), icon: 'copy', action: () => { UI.copyText(files[cur].code); return false; } },
          { label: $t('Bu dosyayı indir'), primary: true, icon: 'export', action: () => { U.download(files[cur].fileName.split('/').pop(), '﻿' + files[cur].code, 'text/plain'); return false; } }],
        noFocus: true,
      });
      show(0);
    },

    autoLayout(dir) { Editor.autoLayout(dir); },

    showShortcuts() {
      const rows = [
        [$t('Genel'), [['Ctrl+S', $t('Kaydet')], ['Ctrl+Shift+S', $t('Farklı kaydet')], ['Ctrl+O', $t('Aç')], ['Ctrl+K | /', $t('Komut paleti / hızlı ekle')], ['Ctrl+Z / Ctrl+Y', $t('Geri al / Yinele')], ['?', $t('Bu pencere')]]],
        [$t('Düzenleme'), [['Ctrl+C / X / V', $t('Kopyala / Kes / Yapıştır')], ['Ctrl+D', $t('Çoğalt')], ['Ctrl+A', $t('Tümünü seç')], ['Delete', $t('Sil')], ['F2 / Enter', $t('Metni düzenle')], [$t('Ok tuşları'), $t('Kaydır (Shift: 10px)')], ['Ctrl+G', $t('Seçimi grupla')], ['Ctrl+Enter', $t('Üye düzenlemeyi bitir')]]],
        [$t('Görünüm'), [[$t('Tekerlek'), $t('Yakınlaştır')], [$t('Boşluk + sürükle'), $t('Kaydır')], [$t('Orta / sağ tık sürükle'), $t('Kaydır')], ['Shift+1', $t('Ekrana sığdır')], ['Ctrl+0', '100%'], ['Ctrl+ + / -', $t('Yakınlaştır / uzaklaştır')], [$t('Alt + sürükle'), $t('Yapışmayı kapat')]]],
        [$t('Seçim'), [[$t('Shift / Ctrl + tık'), $t('Seçime ekle')], [$t('Sağa doğru çerçeve'), $t('Tamamen içeridekiler')], [$t('Sola doğru çerçeve'), $t('Değenler')]]],
      ];
      // tuş adları <kbd>, açıklayıcı sözcükler düz metin
      const keyParts = (k) => k.split(' ').map((p) => (/^[A-Za-z0-9+/!?.=-]+$/.test(p) && p !== '+' && p !== '/' && p !== '|' ? h('kbd', null, p) : h('span', null, ' ' + p + ' ')));
      const body = h('div', { class: 'shortcuts' }, rows.map(([title, list]) => h('div', { class: 'sc-group' }, h('div', { class: 'p-title' }, title),
        list.map(([k, d]) => h('div', { class: 'sc-row' }, h('span', { class: 'sc-keys' }, keyParts(k)), h('span', null, d))))));
      UI.modal({ title: $t('Klavye kısayolları'), wide: true, body, noFocus: true });
    },

    commandPalette(at) { openCommandPalette(at); },
  };

  function kindColor(t) {
    if (t.kind === 'interface') return '#3ecf8e';
    if (t.kind === 'enum') return '#f5a623';
    if (t.kind === 'struct') return '#2bc0d6';
    if (t.bases.includes('ScriptableObject')) return '#b26bff';
    if (t.bases.includes('MonoBehaviour')) return '#4f8cff';
    return '#8e9bb0';
  }

  function collectEntries(entry, out) {
    return new Promise((resolve) => {
      if (entry.isFile) {
        if (!/\.cs$/i.test(entry.name)) return resolve();
        entry.file((f) => { try { f.fullPath = entry.fullPath; } catch (e) { /* salt okunur */ } out.push(f); resolve(); }, () => resolve());
      } else if (entry.isDirectory) {
        if (/^(Library|Temp|obj|Logs|PackageCache|\.git)$/i.test(entry.name)) return resolve();
        const reader = entry.createReader();
        const all = [];
        const read = () => reader.readEntries((ents) => {
          if (!ents.length) { Promise.all(all.map((e) => collectEntries(e, out))).then(() => resolve()); return; }
          all.push(...ents); read();
        }, () => resolve());
        read();
      } else resolve();
    });
  }

  function uniqueTabName(base) {
    const names = new Set(Store.doc.tabs.map((t) => t.name));
    if (!names.has(base)) return base;
    let i = 2;
    while (names.has(`${base} ${i}`)) i++;
    return `${base} ${i}`;
  }

  /* ======================= ARAÇ ÇUBUĞU ======================= */
  function languageMenu() {
    return I18n.LANGS.map((l) => ({ label: l.label, checked: I18n.lang === l.code, action: () => Actions.setLanguage(l.code) }));
  }

  function buildToolbar() {
    const $ = (id) => document.getElementById(id);
    UI.dropdown($('btnFile'), () => [
      { label: $t('Yeni belge'), icon: 'file', action: Actions.newDoc },
      { sep: true },
      { header: 'Google Drive' },
      { label: $t('Drive\'dan aç…'), icon: 'cloudDown', action: () => App.Drive.openDialog() },
      { label: $t('Drive\'a kaydet'), icon: 'cloudUp', shortcut: App.Drive.linked ? 'Ctrl+S' : '', action: () => App.Drive.save() },
      { sep: true },
      { header: $t('Bu cihaz') },
      { label: $t('Dosyadan aç…'), icon: 'folder', shortcut: 'Ctrl+O', action: Actions.open },
      { label: $t('Dosyaya kaydet'), icon: 'save', shortcut: App.Drive.linked ? '' : 'Ctrl+S', action: () => Actions.save(false) },
      { label: $t('Farklı kaydet…'), shortcut: 'Ctrl+Shift+S', action: () => Actions.save(true) },
      { sep: true },
      { label: $t('Yeni sekme'), icon: 'plus', action: () => Actions.addTab() },
      { label: $t('Örnek belgeyi yükle'), icon: 'sparkle', action: async () => { if (Store.dirty && !(await UI.confirm($t('Örnek belge yüklensin mi? Mevcut belge değişir.')))) return; Store.load(sampleDoc()); Editor.fitView(); } },
    ]);
    UI.dropdown($('btnImport'), () => [
      { header: 'Unity / C#' },
      { label: $t('C# script dosyaları…'), icon: 'code', action: () => Actions.importCSharpPick(false) },
      { label: $t('C# klasörü (Assets/Scripts)…'), icon: 'folder', action: () => Actions.importCSharpPick(true) },
      { sep: true },
      { header: $t('Diğer') },
      { label: $t('Mermaid metni…'), icon: 'sparkle', action: () => Actions.importMermaidDialog() },
      { label: $t('JSON belgesinden sekmeler…'), icon: 'file', action: Actions.importJsonTabs },
      { label: $t('JSON belgesini aç…'), icon: 'folder', shortcut: 'Ctrl+O', action: Actions.open },
    ]);
    UI.dropdown($('btnExport'), () => [
      { header: $t('Görsel') },
      { label: $t('PNG resim…'), icon: 'image', action: () => Actions.exportImageDialog('png') },
      { label: $t('SVG vektör…'), icon: 'image', action: () => Actions.exportImageDialog('svg') },
      { sep: true },
      { header: $t('Kod') },
      { label: $t('C# script\'leri (.zip)'), icon: 'code', action: () => IO.exportCSharpZip() },
      { label: $t('C# kod önizleme…'), icon: 'code', action: () => Actions.showCSharp(null) },
      { sep: true },
      { header: $t('Metin / Veri') },
      { label: 'Mermaid…', icon: 'sparkle', action: () => Actions.exportTextDialog('mermaid') },
      { label: 'PlantUML…', icon: 'file', action: () => Actions.exportTextDialog('plantuml') },
      { label: $t('JSON belge (.uml.json)'), icon: 'save', action: () => U.download(U.safeFileName(Store.doc.name) + IO.FILE_EXT, IO.docJSON(), 'application/json') },
    ]);
    UI.dropdown($('btnLayout'), () => [
      { label: $t('Yukarıdan aşağı'), icon: 'layout', action: () => Actions.autoLayout('TB') },
      { label: $t('Soldan sağa'), icon: 'layout', action: () => Actions.autoLayout('LR') },
      { sep: true },
      { label: Store.sel.nodes.size >= 2 ? $t('Yalnızca seçim düzenlenir') : $t('Tüm sekme düzenlenir'), disabled: true },
    ]);
    UI.dropdown($('btnLang'), languageMenu);
    $('btnLang').querySelector('.lang-code').textContent = I18n.lang.toUpperCase();
    $('btnUndo').addEventListener('click', () => Store.undo());
    $('btnRedo').addEventListener('click', () => Store.redo());
    $('btnFit').addEventListener('click', () => Editor.fitView());
    $('btnTheme').addEventListener('click', Actions.toggleTheme);
    $('btnHelp').addEventListener('click', Actions.showShortcuts);
    $('btnCmd').addEventListener('click', () => openCommandPalette());
    $('docName').addEventListener('change', (e) => { Store.mutate(() => { Store.doc.name = e.target.value.trim() || $t('Adsız'); }); updateTitle(); });
    $('docName').addEventListener('keydown', (e) => { if (e.key === 'Enter') e.target.blur(); });
    $('zoomIn').addEventListener('click', () => Editor.zoomAt(1.2));
    $('zoomOut').addEventListener('click', () => Editor.zoomAt(1 / 1.2));
    $('zoomLabel').addEventListener('click', () => Editor.setZoom(1));
    $('toggleSnap').addEventListener('click', () => Editor.setSetting('snap', !Editor.settings.snap));
    $('toggleGrid').addEventListener('click', () => Editor.setSetting('grid', !Editor.settings.grid));
    $('togglePanel').addEventListener('click', () => togglePane('panel'));
    $('togglePalette').addEventListener('click', () => togglePane('palette'));
    $('scrim').addEventListener('click', closePanes);
    $('toggleSelect').addEventListener('click', () => Editor.setSelectMode(!Editor.selectMode));
    $('selAll').addEventListener('click', Editor.selectAll);
    $('selDup').addEventListener('click', Editor.duplicate);
    $('selDelete').addEventListener('click', () => { if (!Editor.deleteSelectedPoint()) Store.deleteSelection(); });
    $('selClear').addEventListener('click', () => Store.clearSelection());
    UI.dropdown($('btnDrive'), () => App.Drive.menuItems());
    updateThemeButton();
  }

  /* Dar ekranda palet ve panel üstten açılan çekmecelerdir; geniş ekranda gizle/göster */
  const isCompact = () => window.matchMedia('(max-width: 860px)').matches;
  function togglePane(which) {
    const b = document.body;
    if (isCompact()) {
      const cls = which + '-open';
      const open = !b.classList.contains(cls);
      b.classList.remove('palette-open', 'panel-open');
      if (open) b.classList.add(cls);
    } else b.classList.toggle(which + '-hidden');
  }
  function closePanes() { document.body.classList.remove('palette-open', 'panel-open'); }
  Actions.showPanel = () => { if (isCompact()) { closePanes(); document.body.classList.add('panel-open'); } else document.body.classList.remove('panel-hidden'); };

  function updateDriveChip() {
    const btn = document.getElementById('btnDrive');
    const info = App.Drive.statusInfo();
    btn.className = 'tb-btn drive-btn ' + info.cls;
    btn.title = info.title;
    btn.querySelector('.drive-text').textContent = info.text;
  }

  function updateThemeButton() {
    const b = document.getElementById('btnTheme');
    b.innerHTML = icon(App.Theme.name === 'dark' ? 'sun' : 'moon', 17);
    b.title = App.Theme.name === 'dark' ? $t('Açık temaya geç') : $t('Koyu temaya geç');
  }

  function updateUndoButtons() {
    document.getElementById('btnUndo').disabled = !Store.canUndo();
    document.getElementById('btnRedo').disabled = !Store.canRedo();
  }

  function updateTitle() {
    const name = Store.doc.name || $t('Adsız');
    document.title = (Store.dirty ? '• ' : '') + name + ' — UML Studio';
    const inp = document.getElementById('docName');
    if (document.activeElement !== inp) inp.value = name;
    document.getElementById('saveState').textContent = Store.dirty ? $t('Kaydedilmedi (tarayıcıda otomatik saklandı)') : $t('Kaydedildi');
    document.getElementById('saveState').classList.toggle('dirty', Store.dirty);
  }

  function updateStatus() {
    const v = Store.tab.view;
    document.getElementById('zoomLabel').textContent = Math.round(v.zoom * 100) + '%';
    document.getElementById('toggleSnap').classList.toggle('active', Editor.settings.snap);
    document.getElementById('toggleGrid').classList.toggle('active', Editor.settings.grid);
    document.getElementById('toggleSelect').classList.toggle('active', Editor.selectMode);
    const t = Store.tab;
    const sel = Store.sel.nodes.size + Store.sel.edges.size;
    document.getElementById('countLabel').textContent = $t('{n} şekil · {e} bağlantı', { n: t.nodes.length, e: t.edges.length }) + (sel ? ' · ' + $t('{n} seçili', { n: sel }) : '');
    const bar = document.getElementById('selBar');
    bar.classList.toggle('mode', Editor.selectMode);
    bar.classList.toggle('has-sel', sel > 0);
    document.getElementById('selCount').textContent = $t('{n} seçili', { n: sel });
  }

  /* ======================= PALET ======================= */
  let collapsed = {};
  try { collapsed = JSON.parse(localStorage.getItem('umlstudio.palette') || '{}'); } catch (e) { collapsed = {}; }

  function buildPalette() {
    const body = document.getElementById('paletteBody');
    const search = document.getElementById('paletteSearch');
    const render = () => {
      const q = norm(search.value.trim());
      body.replaceChildren();
      for (const sec of App.Templates.SECTIONS) {
        const items = App.Templates.items.filter((i) => i.section === sec.id && (!q || q.split(/\s+/).every((w) => norm(i.label + ' ' + sec.label + ' ' + (i.alt || '')).includes(w))));
        if (!items.length) continue;
        const isCol = !q && collapsed[sec.id];
        const head = h('button', { class: 'pal-head' + (isCol ? ' collapsed' : ''), html: icon('chevron', 14) + `<span>${U.esc(sec.label)}</span><em>${items.length}</em>` });
        head.addEventListener('click', () => { collapsed[sec.id] = !collapsed[sec.id]; try { localStorage.setItem('umlstudio.palette', JSON.stringify(collapsed)); } catch (e) { /* yok say */ } render(); });
        const grid = h('div', { class: 'pal-grid' + (sec.id === 'uml' || sec.id === 'flow' ? '' : ' list') });
        for (const it of items) {
          const el = h('div', { class: 'pal-item', draggable: 'true', title: $t('{label} — tıkla veya sürükle', { label: it.label }), tabindex: 0 },
            h('span', { class: 'pal-ico', html: UI.paletteIcon(it) }), h('span', { class: 'pal-label' }, it.label));
          el.addEventListener('click', () => { if (isCompact()) closePanes(); Editor.insertItem(it); });
          el.addEventListener('keydown', (e) => { if (e.key === 'Enter') Editor.insertItem(it); });
          el.addEventListener('dragstart', (e) => { e.dataTransfer.setData('application/x-umlstudio', it.id); e.dataTransfer.effectAllowed = 'copy'; });
          grid.appendChild(el);
        }
        body.append(h('div', { class: 'pal-section' }, head, isCol ? null : grid));
      }
      if (!body.children.length) body.appendChild(h('div', { class: 'p-hint pad' }, $t('Sonuç yok')));
    };
    search.addEventListener('input', render);
    render();
  }

  function norm(s) {
    return String(s).toLocaleLowerCase(I18n.lang === 'tr' ? 'tr' : 'en').replace(/ı/g, 'i').normalize('NFD').replace(/[̀-ͯ]/g, ''); // i18n-ok: düzenli ifade
  }

  /* ======================= SEKMELER ======================= */
  function renderTabs() {
    const bar = document.getElementById('tabList');
    bar.replaceChildren();
    for (const t of Store.doc.tabs) {
      const isFlow = t.nodes.length && t.nodes.filter((n) => n.type !== 'class').length > t.nodes.length / 2;
      const el = h('div', { class: 'tab' + (t.id === Store.doc.activeTab ? ' active' : ''), title: $t('{name} — çift tıkla: yeniden adlandır', { name: t.name }) },
        h('span', { class: 'tab-dot' + (isFlow ? ' flow' : '') }),
        h('span', { class: 'tab-name' }, t.name),
        h('button', { class: 'tab-close', title: $t('Sekmeyi kapat'), html: icon('x', 12), onclick: (e) => { e.stopPropagation(); Actions.closeTab(t.id); } }));
      el.addEventListener('pointerdown', (e) => { if (e.button === 0) Store.setActiveTab(t.id); if (e.button === 1) { e.preventDefault(); Actions.closeTab(t.id); } });
      el.addEventListener('dblclick', () => renameTabInline(el, t));
      el.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        UI.showMenu(e.clientX, e.clientY, [
          { label: $t('Yeniden adlandır'), icon: 'edit', action: () => renameTabInline(el, t) },
          { label: $t('Çoğalt'), icon: 'copy', action: () => Actions.duplicateTab(t.id) },
          { label: $t('Sola taşı'), action: () => Actions.moveTab(t.id, -1) },
          { label: $t('Sağa taşı'), action: () => Actions.moveTab(t.id, 1) },
          { sep: true },
          { label: $t('Sekmeyi sil'), icon: 'trash', action: () => Actions.closeTab(t.id) },
        ]);
      });
      bar.appendChild(el);
    }
    // etkin sekmeyi görünür yap (scrollIntoView sayfanın kendisini de kaydırabildiği için elle)
    const active = bar.querySelector('.tab.active');
    if (active) {
      const l = active.offsetLeft, r = l + active.offsetWidth;
      if (l < bar.scrollLeft) bar.scrollLeft = l;
      else if (r > bar.scrollLeft + bar.clientWidth) bar.scrollLeft = r - bar.clientWidth;
    }
  }

  function renameTabInline(el, t) {
    const nameEl = el.querySelector('.tab-name');
    const inp = h('input', { class: 'tab-input', value: t.name });
    nameEl.replaceWith(inp);
    inp.focus(); inp.select();
    let done = false;
    const finish = (ok) => {
      if (done) return; done = true;
      if (ok && inp.value.trim() && inp.value.trim() !== t.name) Store.mutate(() => { t.name = inp.value.trim(); });
      renderTabs();
    };
    inp.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Enter') finish(true); if (e.key === 'Escape') finish(false); });
    inp.addEventListener('blur', () => finish(true));
  }

  /* ======================= KOMUT PALETİ ======================= */
  function commandItems(at) {
    const items = App.Templates.items.map((it) => ({
      label: it.label, group: App.Templates.SECTIONS.find((s) => s.id === it.section).label, ico: UI.paletteIcon(it), alt: it.alt || '',
      run: () => Editor.insertItem(it, at),
    }));
    const group = $t('Komut');
    const act = (label, ic, run, kbd) => ({ label, group, ico: icon(ic, 18), run, kbd });
    items.push(
      act($t('Yeni sekme'), 'plus', () => Actions.addTab()),
      act($t('PNG olarak dışa aktar'), 'image', () => Actions.exportImageDialog('png')),
      act($t('SVG olarak dışa aktar'), 'image', () => Actions.exportImageDialog('svg')),
      act($t('C# script\'leri dışa aktar (.zip)'), 'code', () => IO.exportCSharpZip()),
      act($t('C# kodunu göster'), 'code', () => Actions.showCSharp(Store.sel.nodes.size ? new Set(Store.sel.nodes) : null)),
      act($t('C# dosyalarını içe aktar'), 'import', () => Actions.importCSharpPick(false)),
      act($t('C# klasörünü içe aktar'), 'folder', () => Actions.importCSharpPick(true)),
      act($t('Mermaid içe aktar'), 'import', () => Actions.importMermaidDialog()),
      act($t('Mermaid dışa aktar'), 'export', () => Actions.exportTextDialog('mermaid')),
      act($t('PlantUML dışa aktar'), 'export', () => Actions.exportTextDialog('plantuml')),
      act($t('Otomatik yerleşim (yukarıdan aşağı)'), 'layout', () => Actions.autoLayout('TB')),
      act($t('Otomatik yerleşim (soldan sağa)'), 'layout', () => Actions.autoLayout('LR')),
      act($t('Tema değiştir'), App.Theme.name === 'dark' ? 'sun' : 'moon', Actions.toggleTheme),
      // hedef dili konuşan biri de bulabilsin diye: "Dil: English (Language)" / "Language: Türkçe (Dil)"
      ...I18n.LANGS.filter((l) => l.code !== I18n.lang).map((l) => act($t('Dil: {lang}', { lang: l.label }) + (I18n.lang === 'tr' ? ' (Language)' : ' (Dil)'), 'globe', () => Actions.setLanguage(l.code))),
      act($t('Ekrana sığdır'), 'fit', () => Editor.fitView(), 'Shift+1'),
      act($t('Kaydet'), 'save', () => Actions.save(false), 'Ctrl+S'),
      act($t('Aç'), 'folder', Actions.open, 'Ctrl+O'),
      act($t('Klavye kısayolları'), 'keyboard', Actions.showShortcuts, '?'),
    );
    return items;
  }

  function openCommandPalette(at) {
    if (UI.topModal()) return;
    const all = commandItems(at);
    const input = h('input', { class: 'cmd-input', placeholder: $t('Şekil, Unity şablonu veya komut ara…'), spellcheck: false });
    const list = h('div', { class: 'cmd-list' });
    let filtered = all, idx = 0;
    const m = UI.modal({ title: at ? $t('Hızlı ekle') : $t('Komut paleti'), body: h('div', { class: 'cmd' }, input, list), className: 'cmd-modal' });
    const run = (it) => { m.close(); setTimeout(() => it.run(), 0); };
    const render = () => {
      const q = norm(input.value.trim());
      filtered = !q ? all : all.filter((it) => q.split(/\s+/).every((w) => norm(it.label + ' ' + it.group + ' ' + (it.alt || '')).includes(w)));
      idx = Math.min(idx, Math.max(0, filtered.length - 1));
      list.replaceChildren(...filtered.slice(0, 80).map((it, i) => {
        const row = h('div', { class: 'cmd-item' + (i === idx ? ' active' : '') },
          h('span', { class: 'cmd-ico', html: it.ico }), h('span', { class: 'cmd-label' }, it.label), h('span', { class: 'cmd-group' }, it.group), it.kbd ? h('kbd', null, it.kbd) : null);
        row.addEventListener('mousemove', () => { if (idx !== i) { idx = i; list.querySelectorAll('.cmd-item').forEach((r, k) => r.classList.toggle('active', k === i)); } });
        row.addEventListener('click', () => run(it));
        return row;
      }));
      if (!filtered.length) list.appendChild(h('div', { class: 'p-hint pad' }, $t('Sonuç yok')));
    };
    input.addEventListener('input', () => { idx = 0; render(); });
    input.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowDown') { e.preventDefault(); idx = Math.min(filtered.length - 1, idx + 1); render(); list.querySelector('.active')?.scrollIntoView({ block: 'nearest' }); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); idx = Math.max(0, idx - 1); render(); list.querySelector('.active')?.scrollIntoView({ block: 'nearest' }); }
    });
    m.onEnter = () => { if (filtered[idx]) run(filtered[idx]); };
    render();
    setTimeout(() => input.focus(), 20);
  }

  /* ======================= BAĞLAM MENÜSÜ ======================= */
  function contextMenu(kind, x, y, p) {
    const sel = Store.selectedNodes();
    const items = [];
    if (kind === 'node') {
      const n = sel[0];
      if (sel.length === 1) items.push({ label: $t('Düzenle'), icon: 'edit', shortcut: 'F2', action: () => Editor.startInlineEdit(n.id) });
      items.push(
        { label: $t('Kopyala'), icon: 'copy', shortcut: 'Ctrl+C', action: Editor.copy },
        { label: $t('Kes'), shortcut: 'Ctrl+X', action: Editor.cut },
        { label: $t('Çoğalt'), shortcut: 'Ctrl+D', action: Editor.duplicate },
        { sep: true },
        { label: $t('Öne getir'), icon: 'front', action: () => Editor.reorder(true) },
        { label: $t('Arkaya gönder'), icon: 'back', action: () => Editor.reorder(false) },
      );
      if (sel.length > 1) items.push({ label: $t('Grupla (çerçeve)'), shortcut: 'Ctrl+G', action: Actions.groupSelection });
      const classes = sel.filter((s) => s.type === 'class');
      if (classes.length) {
        items.push({ sep: true }, { label: $t('C# kodunu göster'), icon: 'code', action: () => Actions.showCSharp(new Set(classes.map((c) => c.id))) });
        if (sel.length === 1) {
          items.push({ label: $t('Stereotip'), submenu: ['', 'MonoBehaviour', 'ScriptableObject', 'interface', 'enum', 'struct', 'Serializable', 'static', 'Editor', 'EditorWindow'].map((s) => ({ label: s || $t('(yok)'), checked: (n.stereotype || '') === s, action: () => Store.mutate(() => { n.stereotype = s; }) })) });
          items.push({ label: $t('Unity metodu ekle'), icon: 'unity', submenu: App.Templates.UNITY_METHODS.map((g) => ({ label: g.group, submenu: g.items.map((m) => ({ label: m, action: () => Store.mutate(() => { n.methods = (n.methods ? n.methods + '\n' : '') + m; }) })) })) });
        }
      }
      if (sel.length === 1 && App.UML.FLOW_TYPES.includes(n.type)) {
        items.push({ sep: true }, { label: $t('Şekli değiştir'), submenu: App.UML.FLOW_TYPES.map((t) => ({ label: App.UML.SHAPES[t].label, checked: n.type === t, action: () => Store.mutate(() => { n.type = t; if (t === 'connector') n.w = n.h = 40; }) })) });
      }
      items.push({ sep: true }, { label: $t('Sil'), icon: 'trash', shortcut: 'Del', action: () => Store.deleteSelection() });
    } else if (kind === 'edge') {
      const e = Store.selectedEdges()[0];
      const sp = Editor.selectedPoint;
      if (e && sp && sp.edge === e.id) {
        items.push({ label: $t('Bükülme noktasını sil'), icon: 'trash', shortcut: 'Del', action: () => Editor.removeEdgePoint(e.id, sp.i) }, { sep: true });
      } else if (e && e.from !== e.to) {
        items.push({ label: $t('Bükülme noktası ekle'), icon: 'plus', action: () => Editor.addEdgePoint(e.id, p) });
      }
      if (e) {
        items.push(
          { label: $t('Etiketi düzenle'), icon: 'edit', action: () => Editor.startEdgeLabelEdit(e.id) },
          { label: $t('Tür'), submenu: Object.entries(App.UML.EDGE_TYPES).map(([k, m]) => ({ label: m.label, checked: e.type === k, action: () => Store.mutate(() => { e.type = k; }) })) },
          { label: $t('Rota'), submenu: [['', $t('Sekme varsayılanı')], ['orthogonal', $t('Dik')], ['straight', $t('Düz')], ['curved', $t('Eğri')]].map(([k, l]) => ({ label: l, checked: (e.routing || '') === k, action: () => Store.mutate(() => { if (k) e.routing = k; else delete e.routing; delete e.mid; }) })) },
          { label: $t('Yönü çevir'), icon: 'swap', action: () => Store.mutate(() => { [e.from, e.to] = [e.to, e.from]; const fs = e.fromSide, ts = e.toSide; delete e.fromSide; delete e.toSide; if (ts) e.fromSide = ts; if (fs) e.toSide = fs; }) },
          { label: $t('Rotayı sıfırla'), action: () => Store.mutate(() => { delete e.mid; delete e.points; delete e.fromSide; delete e.toSide; }) },
          { sep: true },
          { label: $t('Sil'), icon: 'trash', shortcut: 'Del', action: () => Store.deleteSelection() });
      }
    } else {
      items.push(
        { label: $t('Hızlı ekle…'), icon: 'plus', shortcut: 'Ctrl+K', action: () => openCommandPalette(p) },
        { label: $t('Yapıştır'), icon: 'copy', shortcut: 'Ctrl+V', action: Editor.paste },
        { label: $t('Tümünü seç'), shortcut: 'Ctrl+A', action: Editor.selectAll },
        { sep: true },
        { label: $t('Ekrana sığdır'), icon: 'fit', shortcut: 'Shift+1', action: () => Editor.fitView() },
        { label: $t('Otomatik yerleşim'), icon: 'layout', submenu: [{ label: $t('Yukarıdan aşağı'), action: () => Actions.autoLayout('TB') }, { label: $t('Soldan sağa'), action: () => Actions.autoLayout('LR') }] },
        { sep: true },
        { label: $t('PNG dışa aktar…'), icon: 'image', action: () => Actions.exportImageDialog('png') },
      );
    }
    if (kind !== 'canvas' && isCompact()) items.unshift({ label: $t('Özellikler'), icon: 'sliders', action: Actions.showPanel }, { sep: true });
    UI.showMenu(x, y, items);
  }

  /* ======================= KISAYOLLAR ======================= */
  function onKey(e) {
    if (UI.topModal()) return;
    const mod = e.ctrlKey || e.metaKey;
    const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
    if (mod && k === 's') {
      e.preventDefault();
      if (App.Drive.linked && !e.shiftKey) App.Drive.save(); else Actions.save(e.shiftKey);
      return;
    }
    if (mod && k === 'o') { e.preventDefault(); Actions.open(); return; }
    if (mod && k === 'k') { e.preventDefault(); openCommandPalette(); return; }
    if (Editor.isTyping(e.target) || Editor.editing) return;
    if (mod && k === 'z' && !e.shiftKey) { e.preventDefault(); Store.undo(); return; }
    if ((mod && k === 'y') || (mod && e.shiftKey && k === 'z')) { e.preventDefault(); Store.redo(); return; }
    if (mod && k === 'c') { e.preventDefault(); Editor.copy(); return; }
    if (mod && k === 'x') { e.preventDefault(); Editor.cut(); return; }
    if (mod && k === 'v') { e.preventDefault(); Editor.paste(); return; }
    if (mod && k === 'd') { e.preventDefault(); Editor.duplicate(); return; }
    if (mod && k === 'a') { e.preventDefault(); Editor.selectAll(); return; }
    if (mod && k === 'g') { e.preventDefault(); Actions.groupSelection(); return; }
    if (mod && (k === '0')) { e.preventDefault(); Editor.setZoom(1); return; }
    if (mod && (k === '=' || k === '+')) { e.preventDefault(); Editor.zoomAt(1.2); return; }
    if (mod && k === '-') { e.preventDefault(); Editor.zoomAt(1 / 1.2); return; }
    if (mod) return;
    if (k === 'Delete' || k === 'Backspace') { e.preventDefault(); if (!Editor.deleteSelectedPoint()) Store.deleteSelection(); return; }
    if (k === 'Escape') { Store.clearSelection(); UI.closeMenus(); closePanes(); return; }
    if (k === 'F2' || k === 'Enter') {
      const n = Store.selectedNodes();
      const ed = Store.selectedEdges();
      if (n.length === 1) { e.preventDefault(); Editor.startInlineEdit(n[0].id); }
      else if (ed.length === 1 && !n.length) { e.preventDefault(); Editor.startEdgeLabelEdit(ed[0].id); }
      return;
    }
    if (k === '?') { e.preventDefault(); Actions.showShortcuts(); return; }
    if (k === '/') { e.preventDefault(); openCommandPalette(); return; }
    if (e.shiftKey && (e.code === 'Digit1')) { e.preventDefault(); Editor.fitView(); return; }
    const step = e.shiftKey ? 10 : 1;
    if (k === 'ArrowLeft') { e.preventDefault(); Editor.nudge(-step, 0); }
    else if (k === 'ArrowRight') { e.preventDefault(); Editor.nudge(step, 0); }
    else if (k === 'ArrowUp') { e.preventDefault(); Editor.nudge(0, -step); }
    else if (k === 'ArrowDown') { e.preventDefault(); Editor.nudge(0, step); }
  }

  /* ======================= OTOMATİK KAYIT ======================= */
  const autosave = U.debounce(() => {
    try { localStorage.setItem(AUTOSAVE_KEY, JSON.stringify({ doc: Store.doc, dirty: Store.dirty, t: Date.now() })); }
    catch (e) { console.warn('autosave failed', e); }
  }, 400);

  /* ======================= ÖRNEK BELGE ======================= */
  const SAMPLE_CS = `
public interface IDamageable { void TakeDamage(float amount); }
public enum GameState { MainMenu, Playing, Paused, GameOver }
[CreateAssetMenu] public class WeaponData : ScriptableObject {
  public string weaponName; public float damage = 10f; public float fireRate = 0.2f; public GameObject projectile;
}
public class GameManager : MonoBehaviour {
  public static GameManager Instance { get; private set; }
  public GameState State { get; private set; }
  [SerializeField] private Player player;
  void Awake() {} public void ChangeState(GameState next) {}
}
public class Player : MonoBehaviour, IDamageable {
  [SerializeField] private float speed = 5f;
  [SerializeField] private Weapon weapon;
  private Rigidbody rb;
  public event System.Action<float> OnHealthChanged;
  void Awake() {} void Update() {} public void TakeDamage(float amount) {}
}
public abstract class Weapon : MonoBehaviour {
  [SerializeField] protected WeaponData data;
  public abstract void Fire();
}
public class Rifle : Weapon { public override void Fire() {} }
public class Enemy : MonoBehaviour, IDamageable {
  [SerializeField] private float health = 50f;
  public void TakeDamage(float amount) {} private void Die() {}
}`;

  function sampleDoc() {
    const doc = Model.newDoc($t('Örnek Unity Projesi'));
    const t1 = doc.tabs[0];
    t1.name = $t('Sınıf Diyagramı');
    const types = App.CSharp.parseSources([SAMPLE_CS]);
    const frag = App.CSharp.buildDiagram(types, { relations: true });
    App.Layout.layered(frag.nodes, frag.edges, { reverse: new Set(['inheritance', 'realization']) });
    t1.nodes = frag.nodes; t1.edges = frag.edges;
    const note = Model.createNode('note', 0, 0, { w: 230, h: 104, text: $t('Çift tıklayarak düzenleyin. Sağ panelden "Unity metodu" ekleyin, Dışa Aktar → C# ile script\'leri indirin.') });
    note.h = Math.max(note.h, Geo.requiredHeight(note));
    const b = Geo.unionBounds(t1.nodes.map(Geo.bounds));
    note.x = Math.round(b.x + b.w + 60); note.y = Math.round(b.y);
    t1.nodes.push(note);

    const fromTemplate = (name, templateId) => {
      const t = Model.newTab(name);
      t.routing = 'orthogonal';
      Store.insertFragment(App.Templates.byId(templateId).build(), t);
      t.nodes.forEach((n) => {
        if (n.type === 'connector') return;
        const need = Geo.requiredHeight(n);
        if (need > n.h) { n.y -= Math.round((need - n.h) / 2); n.h = need; }
      });
      return t;
    };
    doc.tabs.push(fromTemplate($t('Yaşam Döngüsü'), 'lifecycle'), fromTemplate($t('for Döngüsü'), 'for'));
    return doc;
  }

  /* ======================= BAŞLAT ======================= */
  function init() {
    document.documentElement.dataset.theme = App.Theme.name;
    I18n.applyDom(document);
    Editor.init();
    App.Panel.init();
    buildToolbar();
    buildPalette();

    Editor.onContextMenu = contextMenu;
    Editor.onCanvasDblClick = (p) => openCommandPalette(p);
    Editor.onFilesDropped = (files, items) => Actions.handleDroppedFiles(files, items);

    Store.on('change', () => { updateUndoButtons(); updateTitle(); renderTabs(); updateStatus(); autosave(); });
    Store.on('selection', updateStatus);
    Store.on('view', updateStatus);
    Store.on('viewSaved', autosave);
    Store.on('settings', updateStatus);
    Store.on('tab', () => {
      renderTabs(); updateStatus(); updateUndoButtons(); autosave();
      // ilk kez açılan sekmeyi içeriğe sığdır
      const v = Store.tab.view;
      if (!v.fit) requestAnimationFrame(() => { Editor.fitView(); v.fit = true; });
    });
    Store.on('load', () => { updateTitle(); updateUndoButtons(); renderTabs(); });
    Store.on('saved', () => { updateTitle(); autosave(); });
    Store.on('docName', () => { updateTitle(); autosave(); });
    Store.on('tabsChanged', renderTabs);
    Store.on('theme', () => { App.Panel.render(); });

    window.addEventListener('keydown', onKey);
    document.getElementById('tabAdd').addEventListener('click', (e) => {
      const r = e.currentTarget.getBoundingClientRect();
      UI.showMenu(r.left, r.bottom + 4, [
        { label: $t('Sınıf diyagramı'), icon: 'unity', action: () => Actions.addTab(null, 'class') },
        { label: $t('Akış şeması'), icon: 'layout', action: () => Actions.addTab(null, 'flow') },
      ]);
    });
    window.addEventListener('beforeunload', () => autosave.flush());

    // belgeyi yükle: otomatik kayıt > örnek
    let loaded = false;
    try {
      const raw = localStorage.getItem(AUTOSAVE_KEY);
      if (raw) {
        const saved = JSON.parse(raw);
        Store.load(saved.doc, { dirty: !!saved.dirty });
        loaded = true;
      }
    } catch (e) { console.warn('autosave read failed', e); }
    if (!loaded) {
      Store.load(sampleDoc());
      requestAnimationFrame(() => Editor.fitView());
    } else {
      Editor.applyView();
      Editor.renderNow();
    }
    updateTitle();
    updateStatus();
    updateUndoButtons();

    // Drive: ilk belge yüklendikten sonra başlat (otomatik kayıttan gelen Drive bağlantısı korunur)
    Store.on('drive', updateDriveChip);
    App.Drive.init();
    updateDriveChip();

    // çevrimdışı kullanım / ana ekrana ekleme (yalnızca http(s) üzerinde)
    if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol)) {
      navigator.serviceWorker.register('sw.js').catch((e) => console.warn('service worker', e));
    }
    document.body.classList.add('ready');
  }

  App.init = init;
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})(window);
