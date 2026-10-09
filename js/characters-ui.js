'use strict';
/* Karakter sayfası: portre, rol, Markdown açıklama ve serbest özellikler.
   Karakterler tuvale kişi kartı olarak eklenebilir. Bu ayrıntılar oyun JSON'una gitmez. */
(function (global) {
  const App = global.App;
  const { U, Store, Model, UI } = App;
  const D = App.Dialogue, Md = App.Md;
  const $t = App.$t;
  const h = U.h;
  const icon = (n, s) => UI.icon(n, s);
  const bindTx = App.Panel.kit.bindTx;

  let page = null, selId = null, query = '', isOpen = false;
  let refreshList = () => {};

  const chars = () => D.reg(Store.doc).characters;
  const sel = () => chars().find((c) => c.id === selId) || null;

  /* Karakterin konuştuğu replikler (tüm diyalog sekmelerinde) */
  function linesOf(id) {
    const out = [];
    for (const tab of Store.doc.tabs) for (const n of tab.nodes) if (n.type === 'dlgLine' && n.speaker === id) out.push({ tab, node: n });
    return out;
  }

  function avatarEl(c, cls) {
    const el = h('span', { class: 'cp-ava ' + (cls || ''), style: { '--who': c.color } });
    if (c.portrait) el.appendChild(h('img', { src: c.portrait, alt: '' }));
    else el.textContent = (String(c.name).trim()[0] || '?').toUpperCase();
    return el;
  }

  /* ---------------- Açma / kapama ---------------- */
  function ensure() {
    if (page) return;
    page = h('section', { class: 'chars-page', id: 'charsPage', 'aria-label': $t('Karakterler') });
    document.querySelector('.main').appendChild(page);
    // odak yeni alana geçtikten sonra bak: alanlar arasında tıklarken sayfa yeniden çizilip tıklama kaybolmasın
    Store.on('change', () => setTimeout(() => { if (isOpen && !page.contains(document.activeElement)) render(); }, 0));
    Store.on('load', () => { if (isOpen) render(); });
  }
  function open(id) {
    ensure();
    if (id) selId = id;
    isOpen = true;
    document.body.classList.add('chars-open');
    document.body.classList.remove('palette-open', 'panel-open');
    if (App.Editor.editing) App.Editor.commitInline();
    render();
  }
  function close() {
    if (!isOpen) return;
    isOpen = false;
    document.body.classList.remove('chars-open');
    const a = document.activeElement;
    if (a && page.contains(a)) a.blur();
    App.Editor.requestRender();
    App.Panel.render();
  }

  /* ---------------- İşlemler ---------------- */
  function create() {
    let c;
    Store.mutate(() => { c = D.addCharacter(Store.doc, $t('Yeni karakter')); });
    selId = c.id;
    render();
    setTimeout(() => { const el = page.querySelector('.cp-name'); if (el) { el.focus(); el.select(); } }, 0);
  }

  async function remove(c) {
    const n = linesOf(c.id).length;
    const msg = n ? $t('"{name}" {n} replikte konuşuyor. Yine de silinsin mi? (Replikler konuşmacısız kalır)', { name: c.name, n }) : $t('"{name}" silinsin mi?', { name: c.name });
    if (!(await UI.confirm(msg, { ok: $t('Sil'), danger: true }))) return;
    Store.mutate(() => { D.removeCharacter(Store.doc, c); });
    selId = null;
    render();
  }

  /* Portre: kareye kırpılıp küçültülür (belge boyutu küçük kalsın) */
  async function pickPortrait(c) {
    const files = await U.pickFiles({ accept: 'image/*' });
    const file = files[0];
    if (!file) return;
    try {
      const url = await new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(file); });
      const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = url; });
      const S = 192, cv = document.createElement('canvas');
      cv.width = cv.height = S;
      const ctx = cv.getContext('2d');
      ctx.fillStyle = c.color || '#8e9bb0';
      ctx.fillRect(0, 0, S, S);
      const k = Math.max(S / img.width, S / img.height);
      ctx.drawImage(img, (S - img.width * k) / 2, (S - img.height * k) / 2, img.width * k, img.height * k);
      const data = cv.toDataURL('image/jpeg', 0.86);
      Store.mutate(() => { c.portrait = data; });
      render();
    } catch (e) {
      UI.toast($t('Resim okunamadı'), 'error');
    }
  }

  /* Kişi kartını sahneye (diyalog sekmesine) ekle */
  function addToScene(id) {
    let tab = D.isDialogueTab(Store.tab) ? Store.tab : Store.doc.tabs.find(D.isDialogueTab);
    close();
    if (!tab) {
      tab = Model.newTab($t('Diyalog'), 'dialogue');
      Store.mutate(() => { Store.doc.tabs.push(tab); });
    }
    if (tab !== Store.tab) Store.setActiveTab(tab.id);
    const item = App.Templates.byId('char:' + id);
    if (item) App.Editor.insertItem(item);
  }

  /* ---------------- Çizim ---------------- */
  function render() {
    if (!isOpen) return;
    const scroll = page.querySelector('.cp-edit') ? page.querySelector('.cp-edit').scrollTop : 0;
    const list = chars();
    if (!list.some((c) => c.id === selId)) selId = list.length ? list[0].id : null;

    const search = h('input', { class: 'input cp-search', type: 'search', value: query, placeholder: $t('Karakter ara…'), spellcheck: false });
    search.addEventListener('input', () => { query = search.value; renderList(); });
    const head = h('div', { class: 'cp-head' },
      h('button', { class: 'btn small', onclick: close, title: 'Esc', html: icon('chevronLeft', 15) + `<span>${U.esc($t('Tuvale dön'))}</span>` }),
      h('div', { class: 'cp-title' }, $t('Karakterler'), h('em', null, String(list.length))),
      search,
      h('div', { class: 'spacer' }),
      h('button', { class: 'btn small primary', onclick: create, html: icon('plus', 15) + `<span>${U.esc($t('Yeni karakter'))}</span>` }));

    const listEl = h('div', { class: 'cp-list' });
    const renderList = () => {
      const q = query.trim().toLocaleLowerCase();
      const shown = list.filter((c) => !q || (c.name + ' ' + c.id + ' ' + (c.role || '')).toLocaleLowerCase().includes(q));
      listEl.replaceChildren(...shown.map((c) => {
        const n = linesOf(c.id).length;
        const card = h('button', { class: 'cp-card' + (c.id === selId ? ' active' : ''), style: { '--who': c.color } },
          avatarEl(c),
          h('span', { class: 'cp-card-main' }, h('b', null, c.name), h('span', null, c.role ? Md.strip(c.role, true) : '@' + c.id)),
          h('span', { class: 'cp-card-n' }, $t('{n} replik', { n })));
        card.addEventListener('click', () => { selId = c.id; render(); });
        return card;
      }));
      if (!list.length) listEl.appendChild(h('div', { class: 'cp-empty' }, h('p', null, $t('Henüz karakter yok.')), h('button', { class: 'btn primary', onclick: create }, $t('İlk karakteri oluştur'))));
      else if (!shown.length) listEl.appendChild(h('div', { class: 'p-hint pad' }, $t('Sonuç yok')));
    };
    renderList();
    refreshList = renderList;

    const c = sel();
    const edit = h('div', { class: 'cp-edit' }, c ? editor(c) : h('div', { class: 'cp-empty' }, h('p', null, $t('Soldan bir karakter seçin ya da yeni karakter oluşturun.'))));
    page.replaceChildren(head, h('div', { class: 'cp-body' }, listEl, edit));
    edit.scrollTop = scroll;
  }

  function editor(c) {
    const doc = Store.doc;
    const refresh = () => App.Editor.requestRender();

    // portre ve kimlik
    const portrait = h('button', { class: 'cp-portrait', title: $t('Portre yükle'), style: { '--who': c.color }, onclick: () => pickPortrait(c) },
      c.portrait ? h('img', { src: c.portrait, alt: '' }) : h('span', null, (String(c.name).trim()[0] || '?').toUpperCase()),
      h('span', { class: 'cp-portrait-hint', html: icon('image', 16) }));
    const name = bindTx(h('input', { class: 'input cp-name', value: c.name, spellcheck: false, placeholder: $t('Ad') }), (v) => { c.name = v; });
    name.addEventListener('input', () => refreshList());
    // otomatik verilmiş kimlik ("yeni_karakter") ad değişince addan türetilir
    name.addEventListener('change', () => {
      const auto = D.slug($t('Yeni karakter'), 'character');
      if (c.id !== auto && !c.id.startsWith(auto + '_')) return;
      const taken = new Set(chars().filter((x) => x !== c).map((x) => x.id));
      const nid = D.uniqueId(D.slug(c.name, c.id), taken);
      if (nid === c.id) return;
      Store.mutate(() => { D.renameCharacter(Store.doc, c, nid); });
      selId = c.id;
      id.value = c.id;
      refreshList();
    });
    const id = h('input', { class: 'input mono', value: c.id, spellcheck: false, title: $t('Oyunda kullanılan kimlik') });
    id.addEventListener('change', () => {
      const nid = D.slug(id.value, c.id);
      let ok = false;
      Store.mutate(() => { ok = D.renameCharacter(doc, c, nid); });
      if (!ok && nid !== c.id) UI.toast($t('Bu kimlik zaten kullanılıyor'), 'warn');
      selId = c.id;
      render();
    });
    const color = h('input', { type: 'color', class: 'swatch-pick', value: U.isHex(c.color) ? c.color : '#8e9bb0', title: $t('Renk') });
    color.addEventListener('focus', () => Store.begin());
    color.addEventListener('input', () => { c.color = color.value; portrait.style.setProperty('--who', c.color); refresh(); });
    color.addEventListener('change', () => { while (Store._depth) Store.end(); render(); });
    const top = h('div', { class: 'cp-top' }, portrait,
      h('div', { class: 'cp-top-main' }, name,
        h('div', { class: 'cp-row' },
          h('label', { class: 'p-field' }, h('span', { class: 'p-label' }, $t('Kimlik')), id),
          h('label', { class: 'p-field cp-color' }, h('span', { class: 'p-label' }, $t('Renk')), color)),
        c.portrait ? h('button', { class: 'link-btn', onclick: () => { Store.mutate(() => { delete c.portrait; }); render(); } }, $t('Portreyi kaldır')) : null));

    // rol ve açıklama
    const role = bindTx(h('input', { class: 'input', value: c.role || '', placeholder: $t('ör. Köyün demircisi, eski asker') }), (v) => { if (v) c.role = v; else delete c.role; refreshList(); });
    const preview = h('div', { class: 'md-preview' });
    const setPreview = (v) => { preview.innerHTML = v && v.trim() ? Md.toHtml(v) : `<span class="p-hint">${U.esc($t('Önizleme burada görünür'))}</span>`; };
    const desc = bindTx(h('textarea', { class: 'input area wrap', rows: 7, spellcheck: true, value: c.desc || '', placeholder: $t('Geçmişi, kişiliği, nasıl konuştuğu… **Markdown** kullanabilirsiniz.') }), (v) => { if (v) c.desc = v; else delete c.desc; setPreview(v); });
    setPreview(c.desc);

    // özellikler
    const props = c.props || [];
    const rows = h('div', { class: 'cp-props' }, props.map((p, i) => {
      const key = bindTx(h('input', { class: 'input cp-key', value: p.key, placeholder: $t('Özellik'), spellcheck: false }), (v) => { p.key = v; });
      key.setAttribute('list', 'cp-prop-keys');
      const val = bindTx(h('input', { class: 'input', value: p.value, placeholder: $t('Değer (Markdown olabilir)') }), (v) => { p.value = v; });
      const move = (d) => { const j = i + d; if (j < 0 || j >= props.length) return; Store.mutate(() => { [props[i], props[j]] = [props[j], props[i]]; }); render(); };
      return h('div', { class: 'cp-prop' }, key, val,
        h('button', { class: 'icon-btn flip', title: $t('Yukarı taşı'), html: icon('chevron', 15), onclick: () => move(-1) }),
        h('button', { class: 'icon-btn danger', title: $t('Sil'), html: icon('trash', 15), onclick: () => { Store.mutate(() => { c.props.splice(i, 1); if (!c.props.length) delete c.props; }); render(); } }));
    }));
    const addProp = (key) => {
      Store.mutate(() => { (c.props = c.props || []).push({ key: key || '', value: '' }); });
      render();
      setTimeout(() => {
        const els = page.querySelectorAll('.cp-prop');
        const last = els[els.length - 1];
        const el = last && last.querySelectorAll('input')[key ? 1 : 0];
        if (el) el.focus();
      }, 0);
    };
    const suggestions = [$t('Yaş'), $t('Meslek'), $t('Köken'), $t('Kişilik'), $t('Amaç'), $t('Korku'), $t('Konuşma tarzı'), $t('İlişkiler')];
    const used = new Set(props.map((p) => p.key.trim().toLocaleLowerCase()));
    const chips = h('div', { class: 'stereo-chips' }, suggestions.filter((s) => !used.has(s.toLocaleLowerCase())).map((s) => {
      const b = h('button', { class: 'chip' }, '+ ' + s);
      b.addEventListener('click', () => addProp(s));
      return b;
    }));

    // özelliklerin koşullarda / metinde kullanılan adları (ör. merchant.yas)
    const varNames = D.charVars(doc).filter((v) => v.charId === c.id);
    const varHint = varNames.length
      ? h('div', { class: 'p-hint cp-varnames' }, $t('Koşullarda ve metinde şu adlarla:') + ' ', ...varNames.map((v) => h('code', { title: v.key + ' = ' + (v.value || '""') }, v.name)))
      : null;

    // bu karakterin diyalog sayfaları
    const pages = D.pagesOf(doc, c.id);
    const goPage = (t) => { close(); Store.setActiveTab(t.id); };
    const pageList = h('div', { class: 'cp-pages' },
      pages.map((t) => h('button', { class: 'cp-line', onclick: () => goPage(t) }, h('span', { class: 'cp-line-tab' }, $t('Sayfa')), h('span', null, t.name))),
      h('div', { class: 'p-row wrap' },
        h('button', { class: 'btn small', onclick: () => { close(); App.Actions.addCharacterPage(c.id); }, html: icon('plus', 14) + `<span>${U.esc($t('Yeni diyalog sayfası'))}</span>` })));

    // replikler
    const lines = linesOf(c.id);
    const lineList = h('div', { class: 'cp-lines' }, lines.slice(0, 30).map(({ tab, node }) => {
      const b = h('button', { class: 'cp-line' }, h('span', { class: 'cp-line-tab' }, tab.name), h('span', null, Md.strip(node.text).replace(/\s+/g, ' ') || '\u2026'));
      b.addEventListener('click', () => { close(); App.DialogueUI.locate(tab.id, node.id); });
      return b;
    }));

    return h('div', { class: 'cp-form' },
      top,
      h('section', { class: 'cp-sec' }, h('div', { class: 'p-title' }, $t('Rol / unvan')), role),
      h('section', { class: 'cp-sec' }, h('div', { class: 'p-title' }, $t('Açıklama')),
        h('div', { class: 'cp-md' }, desc, preview), mdHelp()),
      h('section', { class: 'cp-sec' }, h('div', { class: 'p-title' }, $t('Özellikler')),
        rows,
        h('datalist', { id: 'cp-prop-keys' }, suggestions.map((s) => h('option', { value: s }))),
        h('div', { class: 'p-row wrap' }, h('button', { class: 'btn small', onclick: () => addProp(''), html: icon('plus', 14) + `<span>${U.esc($t('Özellik ekle'))}</span>` })),
        chips, varHint),
      h('section', { class: 'cp-sec' }, h('div', { class: 'p-title' }, $t('Diyalog sayfaları') + ' (' + pages.length + ')'),
        h('div', { class: 'p-hint' }, $t('Bu karakterin konuşmalarını ayrı sayfalarda yazın; her sayfa ayrı JSON olarak dışa aktarılabilir.')),
        pageList),
      h('section', { class: 'cp-sec' }, h('div', { class: 'p-title' }, $t('Replikler') + ' (' + lines.length + ')'),
        lines.length ? lineList : h('div', { class: 'p-hint' }, $t('Bu karakter henüz hiçbir replikte konuşmuyor.'))),
      h('div', { class: 'cp-actions' },
        h('button', { class: 'btn primary', onclick: () => addToScene(c.id), html: icon('plus', 15) + `<span>${U.esc($t('Sahneye ekle'))}</span>` }),
        h('span', { class: 'p-hint' }, $t('Açıklama ve portre yalnızca tasarım içindir; özellikler yalnızca koşullarda ya da metinde kullanılırsa oyun JSON\'una değişken olarak gider.')),
        h('div', { class: 'spacer' }),
        h('button', { class: 'btn danger', onclick: () => remove(c), html: icon('trash', 15) + `<span>${U.esc($t('Sil'))}</span>` })));
  }

  function mdHelp() {
    return h('details', { class: 'p-help' }, h('summary', null, $t('Markdown yazımı')),
      h('div', { class: 'p-help-body', html: [
        ['**', $t('kalın'), '**'], ['*', $t('italik'), '*'], ['`', $t('kod'), '`'], ['~~', $t('çizili'), '~~'],
        ['# ', $t('Başlık'), ''], ['- ', $t('madde'), ''], ['1. ', $t('madde'), ''], ['> ', $t('alıntı'), ''],
      ].map(([a, w, b]) => '<code>' + U.esc(a + w + b) + '</code>').join(' \u00B7 ') }));
  }

  App.CharactersUI = { open, close, render, addToScene, get isOpen() { return isOpen; } };
})(window);
