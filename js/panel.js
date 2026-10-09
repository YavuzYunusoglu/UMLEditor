'use strict';
/* Sağ panel: seçime göre özellik düzenleme */
(function (global) {
  const App = global.App;
  const { U, Store, UML, Geo } = App;
  const $t = App.$t;
  const h = U.h;
  const icon = (n, s) => App.UI.icon(n, s);

  let root;
  const COLORS = ['#4f8cff', '#b26bff', '#3ecf8e', '#f5a623', '#ff6b6b', '#2bc0d6', '#ff8a65', '#e6c34a', '#8e9bb0', '#f06292'];

  /* **kalın** ve `tuş` işaretlemeli çeviri metnini öğeye çevir */
  function rich(str) {
    const html = U.esc(str).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/`(.+?)`/g, '<kbd>$1</kbd>');
    return h('li', { html });
  }

  /* ---- alan yardımcıları: odakta tx başlat, bulanıklaşınca bitir ---- */
  function bindTx(el, apply) {
    el.addEventListener('focus', () => Store.begin());
    el.addEventListener('blur', () => { Store.end(); });
    el.addEventListener('input', () => { apply(el.type === 'checkbox' ? el.checked : el.value); App.Editor.requestRender(); });
    return el;
  }
  function section(title, ...children) {
    return h('div', { class: 'p-section' }, title ? h('div', { class: 'p-title' }, title) : null, ...children);
  }
  function field(label, control, hint) {
    return h('label', { class: 'p-field' }, h('span', { class: 'p-label' }, label), control, hint ? h('span', { class: 'p-hint' }, hint) : null);
  }
  function textInput(value, apply, opts) {
    opts = opts || {};
    const el = h('input', { class: 'input' + (opts.mono ? ' mono' : ''), type: 'text', value: value || '', placeholder: opts.placeholder || '', spellcheck: false });
    if (opts.list) el.setAttribute('list', opts.list);
    return bindTx(el, apply);
  }
  function numInput(value, apply, opts) {
    const el = h('input', { class: 'input num', type: 'number', value: Math.round(value), min: (opts && opts.min) || 10, step: 10 });
    el.addEventListener('focus', () => Store.begin());
    el.addEventListener('blur', () => Store.end());
    el.addEventListener('input', () => { const v = parseFloat(el.value); if (isFinite(v) && v >= ((opts && opts.min) || 10)) { apply(v); App.Editor.requestRender(); } });
    return el;
  }
  function textArea(value, apply, opts) {
    opts = opts || {};
    const el = h('textarea', { class: 'input area' + (opts.mono ? ' mono' : '') + (opts.wrap ? ' wrap' : ''), value: value || '', rows: opts.rows || 4, placeholder: opts.placeholder || '', spellcheck: !!opts.spellcheck, wrap: opts.wrap ? 'soft' : 'off' });
    return bindTx(el, apply);
  }
  function checkbox(label, value, apply) {
    const el = h('input', { type: 'checkbox', checked: !!value });
    el.addEventListener('change', () => { Store.begin(); apply(el.checked); Store.end(); App.Editor.requestRender(); });
    return h('label', { class: 'p-check' }, el, h('span', null, label));
  }
  function select(options, value, apply) {
    const el = h('select', { class: 'input' });
    for (const o of options) {
      const opt = h('option', { value: o.value }, o.label);
      if (o.value === value) opt.selected = true;
      el.appendChild(opt);
    }
    el.addEventListener('change', () => { Store.mutate(() => apply(el.value)); App.Editor.requestRender(); });
    return el;
  }
  function segmented(options, value, apply) {
    const wrap = h('div', { class: 'seg' });
    for (const o of options) {
      const b = h('button', { class: 'seg-btn' + (o.value === value ? ' active' : ''), title: o.title || o.label, html: (o.icon ? icon(o.icon, 15) : '') + (o.label && !o.iconOnly ? `<span>${U.esc(o.label)}</span>` : '') });
      b.addEventListener('click', () => { Store.mutate(() => apply(o.value)); App.Editor.requestRender(); render(); });
      wrap.appendChild(b);
    }
    return wrap;
  }
  function colorRow(value, apply, allowNone) {
    const wrap = h('div', { class: 'swatches' });
    const mk = (c) => {
      const b = h('button', { class: 'swatch' + ((value || '') === (c || '') ? ' active' : ''), title: c || $t('Varsayılan'), style: c ? { background: c } : null });
      if (!c) b.classList.add('none');
      b.addEventListener('click', () => { Store.mutate(() => apply(c)); App.Editor.requestRender(); render(); });
      return b;
    };
    if (allowNone !== false) wrap.appendChild(mk(''));
    COLORS.forEach((c) => wrap.appendChild(mk(c)));
    const pick = h('input', { type: 'color', class: 'swatch-pick', value: U.isHex(value) ? value : '#5b8cff', title: $t('Özel renk') });
    pick.addEventListener('focus', () => Store.begin());
    pick.addEventListener('input', () => { apply(pick.value); App.Editor.requestRender(); });
    pick.addEventListener('change', () => { Store.end(); render(); });
    wrap.appendChild(pick);
    return wrap;
  }
  function btn(label, onClick, opts) {
    opts = opts || {};
    return h('button', { class: 'btn small' + (opts.primary ? ' primary' : '') + (opts.danger ? ' danger' : ''), title: opts.title || '', onclick: onClick, html: (opts.icon ? icon(opts.icon, 14) : '') + (label ? `<span>${U.esc(label)}</span>` : '') });
  }
  function iconBtn(ic, title, onClick) {
    return h('button', { class: 'icon-btn', title, html: icon(ic, 16), onclick: onClick });
  }

  /* ---- Görünümler ---- */
  function renderDocument() {
    const tab = Store.tab;
    const nClass = tab.nodes.filter((n) => n.type === 'class').length;
    const nFlow = tab.nodes.length - nClass;
    const out = [];
    out.push(section($t('Sekme'),
      field($t('Ad'), textInput(tab.name, (v) => { tab.name = v; Store.emit('tabsChanged'); })),
      field($t('Varsayılan çizgi rotası'), segmented([
        { value: 'orthogonal', label: $t('Dik'), icon: 'routeOrth' },
        { value: 'straight', label: $t('Düz'), icon: 'routeStraight' },
        { value: 'curved', label: $t('Eğri'), icon: 'routeCurve' },
      ], tab.routing || 'orthogonal', (v) => { tab.routing = v; })),
      h('div', { class: 'p-stats' },
        stat(nClass, $t('sınıf')), stat(nFlow, $t('şekil')), stat(tab.edges.length, $t('bağlantı')))));
    out.push(section($t('Belge'),
      field($t('Belge adı'), textInput(Store.doc.name, (v) => { Store.doc.name = v; Store.emit('docName'); }))));
    out.push(section($t('İpuçları'), h('ul', { class: 'p-tips' },
      rich($t('Soldaki paletten öğeyi **sürükleyin** ya da tıklayın.')),
      rich($t('Bir şeklin üzerine gelin, kenardaki **noktadan sürükleyerek** bağlayın. Boşluğa bırakırsanız yeni şekil oluşur.')),
      rich($t('**Çift tıklama** ile metni düzenleyin; boş alana çift tıklayınca hızlı ekleme açılır.')),
      rich($t('`Boşluk` + sürükle / sağ tık sürükle ile kaydırın, tekerlek ile yakınlaştırın.')),
      rich($t('`Ctrl`+`K` komut paleti, `?` tüm kısayollar.')))));
    return out;
  }
  function stat(n, label) { return h('div', { class: 'p-stat' }, h('b', null, String(n)), h('span', null, label)); }

  function memberMenu(groups, onPick) {
    return groups.map((g) => ({ label: g.group, submenu: g.items.map((it) => ({ label: it, action: () => onPick(it) })) }));
  }

  function renderClass(n) {
    const out = [];
    const dl = h('datalist', { id: 'stereo-list' }, UML.STEREOTYPES.map((s) => h('option', { value: s.name })));
    out.push(section($t('Sınıf'),
      field($t('Ad'), textInput(n.name, (v) => { n.name = v; }, { mono: true })),
      field($t('Stereotip / Temel sınıf'), textInput(n.stereotype, (v) => { n.stereotype = v; }, { list: 'stereo-list', placeholder: 'MonoBehaviour, interface, enum…' }), $t('Listeden seçin veya yazın')),
      dl,
      h('div', { class: 'stereo-chips' }, ['MonoBehaviour', 'ScriptableObject', 'interface', 'enum', 'struct', 'Serializable', ''].map((s) => {
        const b = h('button', { class: 'chip' + ((n.stereotype || '') === s ? ' active' : ''), style: s && UML.stereoInfo(s) ? { '--chip': UML.stereoInfo(s).color } : null }, s || $t('yok'));
        b.addEventListener('click', () => { Store.mutate(() => { n.stereotype = s; }); render(); });
        return b;
      })),
      h('div', { class: 'p-row' },
        checkbox($t('Soyut (abstract)'), n.abstract, (v) => { n.abstract = v; }),
        checkbox($t('Üyeleri göster'), n.showMembers !== false, (v) => { n.showMembers = v; })),
      field('Namespace', textInput(n.namespace, (v) => { n.namespace = v; }, { mono: true, placeholder: $t('Game.Core (isteğe bağlı)') }))));

    const isEnum = String(n.stereotype).toLowerCase() === 'enum';
    const attrArea = textArea(n.attributes, (v) => { n.attributes = v; }, { mono: true, rows: Math.min(12, Math.max(3, UML.splitLines(n.attributes).length + 1)), placeholder: isEnum ? 'Idle\nRun\nJump' : '- speed : float = 5f\n+ Health : int {get; private set;}' });
    const methArea = textArea(n.methods, (v) => { n.methods = v; }, { mono: true, rows: Math.min(12, Math.max(3, UML.splitLines(n.methods).length + 1)), placeholder: '+ Move(dir : Vector3) : void\n- {static} Create() : Enemy' });
    const appendLine = (key, area) => (line) => {
      Store.mutate(() => { n[key] = (n[key] ? n[key].replace(/\s+$/, '') + '\n' : '') + line; });
      area.value = n[key];
      App.Editor.requestRender();
    };
    const attrHead = h('div', { class: 'p-title-row' }, h('div', { class: 'p-title' }, isEnum ? $t('Değerler') : $t('Alanlar / Özellikler')),
      isEnum ? null : h('button', { class: 'link-btn', html: icon('unity', 13) + `<span>${U.esc($t('Unity alanı'))}</span>`, onclick: (e) => { const r = e.currentTarget.getBoundingClientRect(); App.UI.showMenu(r.left - 60, r.bottom + 4, memberMenu(App.Templates.UNITY_FIELDS, appendLine('attributes', attrArea))); } }));
    const methHead = h('div', { class: 'p-title-row' }, h('div', { class: 'p-title' }, $t('Metotlar')),
      h('button', { class: 'link-btn', html: icon('unity', 13) + `<span>${U.esc($t('Unity metodu'))}</span>`, onclick: (e) => { const r = e.currentTarget.getBoundingClientRect(); App.UI.showMenu(r.left - 60, r.bottom + 4, memberMenu(App.Templates.UNITY_METHODS, appendLine('methods', methArea))); } }));
    out.push(h('div', { class: 'p-section' }, attrHead, attrArea));
    if (!isEnum || UML.splitLines(n.methods).length) out.push(h('div', { class: 'p-section' }, methHead, methArea));
    out.push(section(null, h('details', { class: 'p-help' }, h('summary', null, $t('Üye yazım kuralları')),
      h('div', { class: 'p-help-body', html:
        '<code>+</code> public · <code>-</code> private · <code>#</code> protected · <code>~</code> internal<br>' +
        '<code>- speed : float = 5f</code><br><code>+ Move(dir : Vector3) : void</code><br>' +
        '<code>+ {static} Instance : GameManager {get; private set;}</code><br>' +
        '<code>+ {abstract} Fire() : void</code> · <code>{override}</code> · <code>{virtual}</code><br>' +
        '<code>+ OnDie : event Action</code><br>' + U.esc($t('C# biçimi de kabul edilir:')) + ' <code>public float speed = 5f</code>' }))));
    out.push(section($t('Renk'), colorRow(n.color, (c) => { n.color = c || undefined; })));
    out.push(section('C#', h('div', { class: 'p-row wrap' },
      btn($t('Kodu göster'), () => App.Actions.showCSharp(new Set([n.id])), { icon: 'code' }),
      btn($t('.cs indir'), () => { const f = App.CSharp.generateClass(n, Store.tab); U.download(f.fileName.split('/').pop(), '﻿' + f.code, 'text/plain'); }, { icon: 'export' }))));
    out.push(nodeActions());
    return out;
  }

  function renderShape(n) {
    const out = [];
    const isFlow = UML.FLOW_TYPES.includes(n.type);
    const title = (UML.SHAPES[n.type] || {}).label || $t('Şekil');
    const children = [];
    if (isFlow) {
      children.push(field($t('Tür'), select(UML.FLOW_TYPES.map((t) => ({ value: t, label: UML.SHAPES[t].label })), n.type, (v) => {
        n.type = v;
        if (v === 'connector') { n.w = n.h = 40; }
      })));
    }
    children.push(field(n.type === 'frame' ? $t('Başlık') : $t('Metin'), n.type === 'frame' ? textInput(n.text, (v) => { n.text = v; }) : textArea(n.text, (v) => { n.text = v; }, { rows: 3 })));
    children.push(h('div', { class: 'p-row' },
      field($t('Genişlik'), numInput(n.w, (v) => { n.w = v; if (n.type === 'connector') n.h = v; })),
      field($t('Yükseklik'), numInput(n.h, (v) => { n.h = v; if (n.type === 'connector') n.w = v; }))));
    if (n.type !== 'connector' && n.type !== 'frame') {
      children.push(btn($t('Metne göre boyutla'), () => {
        Store.mutate(() => { n.h = Geo.requiredHeight(n); });
        App.Editor.requestRender(); render();
      }, { icon: 'fit' }));
    }
    out.push(section(title, ...children));
    out.push(section($t('Renk'), colorRow(n.color, (c) => { n.color = c || undefined; })));
    out.push(nodeActions());
    return out;
  }

  function nodeActions() {
    return section(null, h('div', { class: 'p-row wrap' },
      btn($t('Çoğalt'), () => App.Editor.duplicate(), { icon: 'copy', title: 'Ctrl+D' }),
      btn($t('Öne'), () => App.Editor.reorder(true), { icon: 'front' }),
      btn($t('Arkaya'), () => App.Editor.reorder(false), { icon: 'back' }),
      btn($t('Sil'), () => Store.deleteSelection(), { icon: 'trash', danger: true, title: 'Delete' })));
  }

  function renderEdge(e) {
    const out = [];
    const from = Store.node(e.from), to = Store.node(e.to);
    const isUml = from && to && from.type === 'class' && to.type === 'class';
    const typeGrid = h('div', { class: 'edge-types' });
    for (const t of Object.keys(UML.EDGE_TYPES)) {
      const meta = UML.EDGE_TYPES[t];
      const b = h('button', { class: 'edge-type' + (e.type === t ? ' active' : ''), title: meta.label, html: edgeIcon(t) + `<span>${U.esc(meta.short)}</span>` });
      b.addEventListener('click', () => { Store.mutate(() => { e.type = t; }); App.Editor.requestRender(); render(); });
      typeGrid.appendChild(b);
    }
    out.push(section($t('Bağlantı türü'), typeGrid,
      h('div', { class: 'p-hint' }, isUml ? hintFor(e.type, from, to) : (from && to ? `${short(from)} → ${short(to)}` : ''))));
    const lbl = [field($t('Etiket'), textInput(e.label, (v) => { e.label = v; }, { placeholder: e.type === 'flow' ? $t('Evet / Hayır…') : $t('ilişki adı') }))];
    if (UML.EDGE_TYPES[e.type].uml) {
      lbl.push(h('div', { class: 'p-row' },
        field($t('Kaynak çokluk'), textInput(e.srcLabel, (v) => { e.srcLabel = v; }, { placeholder: '1', list: 'mult-list' })),
        field($t('Hedef çokluk'), textInput(e.dstLabel, (v) => { e.dstLabel = v; }, { placeholder: '*', list: 'mult-list' }))));
      lbl.push(h('datalist', { id: 'mult-list' }, ['1', '0..1', '*', '0..*', '1..*'].map((v) => h('option', { value: v }))));
    }
    out.push(section($t('Etiketler'), ...lbl));
    const sideOpts = [{ value: '', label: $t('Otomatik') }, { value: 'top', label: $t('Üst') }, { value: 'right', label: $t('Sağ') }, { value: 'bottom', label: $t('Alt') }, { value: 'left', label: $t('Sol') }];
    out.push(section($t('Görünüm'),
      field($t('Rota'), segmented([
        { value: '', label: $t('Sekme'), title: $t('Sekme varsayılanı') },
        { value: 'orthogonal', label: $t('Dik'), icon: 'routeOrth', iconOnly: true, title: $t('Dik') },
        { value: 'straight', label: $t('Düz'), icon: 'routeStraight', iconOnly: true, title: $t('Düz') },
        { value: 'curved', label: $t('Eğri'), icon: 'routeCurve', iconOnly: true, title: $t('Eğri') },
      ], e.routing || '', (v) => { if (v) e.routing = v; else delete e.routing; delete e.mid; })),
      field($t('Çizgi'), segmented([
        { value: '', label: $t('Türe göre') }, { value: 'solid', label: $t('Düz çizgi') }, { value: 'dash', label: $t('Kesikli') },
      ], e.dash == null ? '' : e.dash ? 'dash' : 'solid', (v) => { if (!v) delete e.dash; else e.dash = v === 'dash'; })),
      h('div', { class: 'p-row' },
        field($t('Çıkış kenarı'), select(sideOpts, e.fromSide || '', (v) => { if (v) e.fromSide = v; else delete e.fromSide; delete e.mid; })),
        field($t('Giriş kenarı'), select(sideOpts, e.toSide || '', (v) => { if (v) e.toSide = v; else delete e.toSide; delete e.mid; }))),
      field($t('Renk'), colorRow(e.color, (c) => { e.color = c || undefined; }))));
    out.push(section(null, h('div', { class: 'p-row wrap' },
      btn($t('Yönü çevir'), () => { Store.mutate(() => { [e.from, e.to] = [e.to, e.from]; [e.fromSide, e.toSide] = [e.toSide, e.fromSide]; [e.srcLabel, e.dstLabel] = [e.dstLabel, e.srcLabel]; if (!e.fromSide) delete e.fromSide; if (!e.toSide) delete e.toSide; }); App.Editor.requestRender(); render(); }, { icon: 'swap' }),
      btn($t('Rotayı sıfırla'), () => { Store.mutate(() => { delete e.mid; delete e.points; delete e.fromSide; delete e.toSide; }); App.Editor.requestRender(); render(); }, { icon: 'routeOrth' }),
      btn($t('Sil'), () => Store.deleteSelection(), { icon: 'trash', danger: true })),
      h('ul', { class: 'p-tips' }, rich($t('Çizgiye **çift tıklayarak** bükülme noktası ekleyin; noktayı sürükleyerek taşıyın, çift tıklayarak ya da `Delete` ile silin.')))));
    return out;
  }
  function short(n) { return n.type === 'class' ? n.name : (n.text || UML.SHAPES[n.type].label).split('\n')[0]; }
  function hintFor(type, a, b) {
    const p = { a: short(a), b: short(b) };
    switch (type) {
      case 'inheritance': return $t('{a}, {b} sınıfından türer (: {b})', p);
      case 'realization': return $t('{a}, {b} arayüzünü uygular', p);
      case 'association': return $t('{a}, {b} referansı tutar', p);
      case 'dependency': return $t('{a}, {b} türünü kullanır', p);
      case 'aggregation': return $t('{a}, {b} öğelerini içerir (paylaşımlı)', p);
      case 'composition': return $t('{a}, {b} öğesine sahiptir (yaşam döngüsü bağlı)', p);
      default: return `${p.a} — ${p.b}`;
    }
  }
  function edgeIcon(t) {
    const meta = UML.EDGE_TYPES[t];
    const dash = meta.dash ? ' stroke-dasharray="3 2.5"' : '';
    let d = '';
    if (meta.end === 'triangle') d = '<path d="M20 6 26 12 20 18z" fill="var(--panel)" stroke="currentColor" stroke-width="1.5"/>';
    if (meta.end === 'open') d = '<path d="M20 7l6 5-6 5" fill="none" stroke="currentColor" stroke-width="1.6"/>';
    if (meta.end === 'filled') d = '<path d="M20 7l6 5-6 5z" fill="currentColor"/>';
    if (meta.start === 'diamond') d = '<path d="M2 12l5-4 5 4-5 4z" fill="var(--panel)" stroke="currentColor" stroke-width="1.4"/>';
    if (meta.start === 'diamondFilled') d = '<path d="M2 12l5-4 5 4-5 4z" fill="currentColor" stroke="currentColor" stroke-width="1.4"/>';
    const x1 = meta.start ? 12 : 2, x2 = meta.end === 'triangle' ? 20 : meta.end ? 25 : 26;
    return `<svg width="28" height="24" viewBox="0 0 28 24"><line x1="${x1}" y1="12" x2="${x2}" y2="12" stroke="currentColor" stroke-width="1.6"${dash}/>${d}</svg>`;
  }

  function renderMulti(nodes, edges) {
    const out = [];
    const title = edges.length ? $t('{n} şekil, {e} bağlantı seçili', { n: nodes.length, e: edges.length }) : $t('{n} şekil seçili', { n: nodes.length });
    out.push(section(title,
      h('div', { class: 'p-subtitle' }, $t('Hizala')),
      h('div', { class: 'p-row tools' },
        iconBtn('alignLeft', $t('Sola hizala'), () => App.Editor.align('left')),
        iconBtn('alignCenter', $t('Yatay ortala'), () => App.Editor.align('center')),
        iconBtn('alignRight', $t('Sağa hizala'), () => App.Editor.align('right')),
        iconBtn('alignTop', $t('Üste hizala'), () => App.Editor.align('top')),
        iconBtn('alignMiddle', $t('Dikey ortala'), () => App.Editor.align('middle')),
        iconBtn('alignBottom', $t('Alta hizala'), () => App.Editor.align('bottom'))),
      h('div', { class: 'p-subtitle' }, $t('Dağıt')),
      h('div', { class: 'p-row tools' },
        iconBtn('distH', $t('Yatay eşit dağıt (3+)'), () => App.Editor.distribute('h')),
        iconBtn('distV', $t('Dikey eşit dağıt (3+)'), () => App.Editor.distribute('v')),
        iconBtn('layout', $t('Seçimi otomatik yerleştir'), () => App.Editor.autoLayout('TB')))));
    if (nodes.length) {
      out.push(section($t('Renk (tümü)'), colorRow('', (c) => { for (const n of nodes) n.color = c || undefined; })));
    }
    const classes = nodes.filter((n) => n.type === 'class');
    const actions = [
      btn($t('Çoğalt'), () => App.Editor.duplicate(), { icon: 'copy' }),
      btn($t('Grupla'), () => App.Actions.groupSelection(), { icon: 'layout', title: $t('Seçimi bir çerçeveye al') }),
    ];
    if (classes.length) actions.push(btn($t('C# kodu'), () => App.Actions.showCSharp(new Set(classes.map((c) => c.id))), { icon: 'code' }));
    actions.push(btn($t('Sil'), () => Store.deleteSelection(), { icon: 'trash', danger: true }));
    out.push(section(null, h('div', { class: 'p-row wrap' }, ...actions)));
    return out;
  }

  function render() {
    if (!root) return;
    const scroll = root.scrollTop;
    const nodes = Store.selectedNodes();
    const edges = Store.selectedEdges();
    let content;
    const D = App.Dialogue, DUI = App.DialogueUI;
    if (nodes.length === 1 && !edges.length) content = D.isDlg(nodes[0]) ? DUI.renderNode(nodes[0]) : nodes[0].type === 'class' ? renderClass(nodes[0]) : renderShape(nodes[0]);
    else if (edges.length === 1 && !nodes.length) content = DUI.isDlgEdge(edges[0]) ? DUI.renderEdge(edges[0]) : renderEdge(edges[0]);
    else if (nodes.length + edges.length > 1) content = renderMulti(nodes, edges);
    else content = D.isDialogueTab(Store.tab) ? DUI.renderTab() : renderDocument();
    root.replaceChildren(...content);
    root.scrollTop = scroll;
  }

  function init() {
    root = document.getElementById('panelBody');
    Store.on('selection', render);
    Store.on('tab', render);
    Store.on('load', render);
    Store.on('change', () => { if (!root.contains(document.activeElement)) render(); });
  }

  App.Panel = { init, render, kit: { section, field, textInput, numInput, textArea, checkbox, select, segmented, colorRow, btn, iconBtn, rich, stat, nodeActions, bindTx } };
})(window);
