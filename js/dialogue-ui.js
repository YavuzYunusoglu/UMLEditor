'use strict';
/* Diyalog arayüzü: sağ panel görünümleri, hızlı ekleme, önizleme (oynatıcı) ve JSON dışa aktarım penceresi */
(function (global) {
  const App = global.App;
  const { U, Store, Geo, Model, UI } = App;
  const D = App.Dialogue;
  const K = App.Panel.kit;
  const $t = App.$t;
  const h = U.h;
  const icon = (n, s) => UI.icon(n, s);
  const { section, field, textInput, textArea, checkbox, select, segmented, btn, iconBtn, rich, stat, nodeActions } = K;

  const refresh = () => { App.Editor.requestRender(); App.Panel.render(); };
  const typeLabel = (n) => App.UML.SHAPES[n.type].label;

  /* Düğümün kısa tarifi (panelde ve listelerde) */
  function describe(n) {
    if (!n) return '?';
    const cut = (s, k) => { s = String(s || '').replace(/\s+/g, ' ').trim(); return s.length > k ? s.slice(0, k - 1) + '\u2026' : s; };
    switch (n.type) {
      case 'dlgLine': { const c = D.character(Store.doc, n.speaker); return (c ? c.name : n.speaker || '?') + ': ' + (cut(n.text, 38) || '\u2026'); }
      case 'dlgStart': return typeLabel(n) + ': ' + cut(n.text || n.dlgId, 30);
      case 'dlgBranch': return typeLabel(n) + ': ' + cut(n.cond, 30);
      case 'dlgJump': return typeLabel(n) + ': ' + (n.target || '?');
      case 'dlgEnd': return typeLabel(n) + (n.text ? ': ' + n.text : '');
      case 'dlgChoice': return typeLabel(n) + (n.text ? ': ' + cut(n.text, 30) : '');
      case 'dlgAction': return typeLabel(n) + ': ' + cut(n.actions.split('\n')[0], 30);
      case 'dlgCard': { const c = D.character(Store.doc, n.charId); return typeLabel(n) + ': ' + (c ? c.name : n.charId || '?'); }
    }
    return n.text ? cut(n.text, 36) : typeLabel(n);
  }

  /* Görünümü düğüme ortala (yakınlaştırmayı değiştirmeden) */
  function centerOn(node) {
    const svg = document.getElementById('canvas');
    const r = svg.getBoundingClientRect(), v = Store.tab.view, b = Geo.bounds(node);
    v.x = r.width / 2 - (b.x + b.w / 2) * v.zoom;
    v.y = r.height / 2 - (b.y + b.h / 2) * v.zoom;
    App.Editor.applyView();
    App.Editor.renderOverlay();
  }
  function locate(tabId, nodeId) {
    if (tabId && tabId !== Store.doc.activeTab) Store.setActiveTab(tabId);
    const n = nodeId && Store.node(nodeId);
    if (!n) return;
    Store.select([n.id], []);
    App.Editor.renderNow();
    centerOn(n);
  }

  /* Koşul alanının altındaki canlı ipucu */
  function exprHint(el, src) {
    const s = String(src || '').trim();
    el.className = 'p-hint dl-hint';
    if (!s) { el.textContent = ''; return; }
    const r = D.check(s);
    if (r.error) { el.textContent = '\u26A0 ' + r.error; el.classList.add('bad'); return; }
    const declared = D.declaredNames(Store.doc);
    const unknown = r.vars.filter((v) => !declared.has(v));
    if (unknown.length) { el.textContent = $t('Tanımsız değişken: {name}', { name: unknown.join(', ') }); el.classList.add('warn'); return; }
    el.textContent = '\u2713 ' + $t('Geçerli koşul');
    el.classList.add('ok');
  }
  function exprInput(value, apply, placeholder) {
    const hint = h('div', { class: 'p-hint dl-hint' });
    const inp = textInput(value, (v) => { apply(v); exprHint(hint, v); }, { mono: true, placeholder });
    exprHint(hint, value);
    return [inp, hint];
  }

  function exprHelp() {
    return h('details', { class: 'p-help' }, h('summary', null, $t('Koşul yazımı')),
      h('div', { class: 'p-help-body', html:
        '<code>gold >= 50</code> \u00B7 <code>hasKey</code> \u00B7 <code>not metBefore</code><br>' +
        '<code>reputation > 10 and questDone</code><br>' +
        '<code>class == "mage" or level >= 5</code><br>' +
        U.esc($t('Karşılaştırma: == != < > <= >= · Mantık: and / or / not (&& || !)')) }));
  }
  function actionHelp() {
    return h('details', { class: 'p-help' }, h('summary', null, $t('Eylem yazımı')),
      h('div', { class: 'p-help-body', html:
        '<code>gold -= 50</code> \u00B7 <code>+=</code> <code>*=</code> <code>/=</code><br>' +
        '<code>metBlacksmith = true</code> \u00B7 <code>visits++</code><br>' +
        '<code>playerName = "Arin"</code><br>' +
        '<code>@give_item sword 1</code> \u00B7 <code>@play_sound("door")</code><br>' +
        U.esc($t('@ ile başlayan satırlar oyuna olay olarak gider; // ile başlayanlar yorumdur.')) }));
  }

  /* ---------------- Konuşmacı ---------------- */
  async function promptCharacter() {
    const name = await UI.prompt($t('Karakter adı'), '');
    return name && name.trim() ? name.trim() : null;
  }
  function setSpeaker(n, id) { Store.mutate(() => { n.speaker = id; }); refresh(); }
  async function newSpeaker(n) {
    const name = await promptCharacter();
    if (!name) return;
    Store.mutate(() => { const c = D.addCharacter(Store.doc, name); n.speaker = c.id; });
    refresh();
  }
  function speakerMenu(n, x, y) {
    const chars = D.reg(Store.doc).characters;
    UI.showMenu(x, y, [
      { header: $t('Konuşmacı') },
      ...chars.map((c) => ({ label: c.name, checked: n.speaker === c.id, action: () => setSpeaker(n, c.id) })),
      chars.length ? { sep: true } : null,
      { label: $t('Yeni karakter…'), icon: 'plus', action: () => newSpeaker(n) },
      { label: $t('(konuşmacı yok)'), checked: !n.speaker, action: () => setSpeaker(n, '') },
    ]);
  }
  function speakerChips(n) {
    const wrap = h('div', { class: 'stereo-chips' });
    for (const c of D.reg(Store.doc).characters) {
      const b = h('button', { class: 'chip' + (n.speaker === c.id ? ' active' : ''), style: { '--chip': c.color } }, c.name);
      b.addEventListener('click', () => setSpeaker(n, n.speaker === c.id ? '' : c.id));
      wrap.appendChild(b);
    }
    const add = h('button', { class: 'chip', title: $t('Yeni karakter…') }, '+ ' + $t('Karakter'));
    add.addEventListener('click', () => newSpeaker(n));
    wrap.appendChild(add);
    return wrap;
  }

  /* ---------------- Hızlı ekleme ----------------
     Seçili düğümün ardına yeni düğüm ekler. Düğümün zaten bir sonraki adımı varsa araya girer
     ve aşağıdaki düğümler yer açmak için kaydırılır. */
  function appendAfter(src, type) {
    const tab = Store.tab;
    const out = tab.edges.filter((e) => e.from === src.id);
    const splice = out.length === 1 ? out[0] : null;
    if (splice && type === 'dlgEnd') return;
    const node = Model.createNode(type, 0, 0, type === 'dlgLine' ? { speaker: D.guessSpeaker(tab, src) } : null);
    if (type === 'dlgChoice') node.options = [D.newOption()];
    const sb = Geo.bounds(src), ns = Geo.nodeSize(node);
    const GAP = 50;
    node.x = Math.round(U.snap(sb.x + sb.w / 2, 10) - ns.w / 2);
    node.y = Math.round(U.snap(sb.y + sb.h + GAP, 10));
    Store.mutate(() => {
      if (splice) {
        // eskiden sonra gelen ve daha aşağıda duran düğümleri kaydır
        const shift = ns.h + GAP;
        const down = new Set();
        const q = [splice.to];
        const seen = new Set([src.id, splice.to]);
        while (q.length) {
          const id = q.shift();
          const m = Store.node(id);
          if (m && m.y > sb.y + sb.h - 1) down.add(id);
          for (const e of tab.edges) if (e.from === id && !seen.has(e.to)) { seen.add(e.to); q.push(e.to); }
        }
        for (const m of tab.nodes) if (down.has(m.id)) m.y += shift;
        for (const e of tab.edges) {
          if (!down.has(e.from) || !down.has(e.to)) continue;
          if (e.mid) e.mid = { x: e.mid.x, y: e.mid.y + shift };
          if (Array.isArray(e.points)) e.points = e.points.map((p) => ({ x: p.x, y: p.y + shift }));
        }
        splice.from = node.id;
        delete splice.fromSide; delete splice.mid; delete splice.points; delete splice.opt; delete splice.branch;
      }
      tab.nodes.push(node);
      const e = Model.createEdge(src.id, node.id, 'flow');
      tab.edges.push(e);
      D.onConnect(src, e, tab);
      if (splice) D.onConnect(node, splice, tab);
    });
    Store.select([node.id], []);
    App.Editor.renderNow();
    if (type !== 'dlgEnd') App.Editor.startInlineEdit(node.id);
  }

  /* Seçime yeni seçenek ve ona cevap veren bir replik ekle */
  function addOption(n) {
    const tab = Store.tab;
    const o = D.newOption();
    const line = Model.createNode('dlgLine', 0, 0, { speaker: D.guessSpeaker(tab, n) });
    const targets = tab.edges.filter((e) => e.from === n.id).map((e) => Store.node(e.to)).filter(Boolean);
    const nb = Geo.bounds(n), ls = Geo.nodeSize(line);
    if (targets.length) {
      const right = targets.reduce((a, b) => (Geo.bounds(b).x + Geo.bounds(b).w > Geo.bounds(a).x + Geo.bounds(a).w ? b : a));
      const rb = Geo.bounds(right);
      line.x = Math.round(U.snap(rb.x + rb.w + 40, 10));
      line.y = Math.round(rb.y);
    } else {
      line.x = Math.round(U.snap(nb.x + nb.w / 2, 10) - ls.w / 2);
      line.y = Math.round(U.snap(nb.y + nb.h + 60, 10));
    }
    Store.mutate(() => {
      n.options.push(o);
      tab.nodes.push(line);
      tab.edges.push(Model.createEdge(n.id, line.id, 'flow', { opt: o.id }));
    });
    focusOpt = o.id;
    refresh();
  }
  let focusOpt = null;

  function quickAdd(n) {
    const hasNext = Store.tab.edges.some((e) => e.from === n.id);
    const b = (label, type, ic) => btn(label, () => appendAfter(n, type), { icon: ic });
    return section(hasNext ? $t('Araya ekle') : $t('Ardına ekle'),
      h('div', { class: 'p-row wrap' },
        b($t('Replik'), 'dlgLine', 'chat'), b($t('Seçim'), 'dlgChoice', 'menu'), b($t('Koşul'), 'dlgBranch', 'swap'),
        b($t('Olay'), 'dlgAction', 'sparkle'), hasNext ? null : b($t('Bitiş'), 'dlgEnd', 'x')),
      hasNext ? h('div', { class: 'p-hint' }, $t('Yeni düğüm bu düğüm ile sonraki adım arasına girer.')) : null);
  }

  function playRow(n) {
    return h('div', { class: 'p-row wrap' },
      btn($t('Buradan oynat'), () => playtest(n.id), { icon: 'play', primary: true }),
      btn($t('Tüm diyalog'), () => playtest(), { icon: 'play' }));
  }

  /* ---------------- Seçenek kartı ---------------- */
  function optionCard(n, o, i, inEdgePanel) {
    const tab = Store.tab;
    const e = tab.edges.find((x) => x.from === n.id && x.opt === o.id);
    const target = e && Store.node(e.to);
    const move = (d) => {
      const j = i + d;
      if (j < 0 || j >= n.options.length) return;
      Store.mutate(() => { [n.options[i], n.options[j]] = [n.options[j], n.options[i]]; });
      refresh();
    };
    const del = () => {
      Store.mutate(() => {
        n.options = n.options.filter((x) => x !== o);
        tab.edges = tab.edges.filter((x) => !(x.from === n.id && x.opt === o.id));
      });
      Store._pruneSelection();
      refresh();
    };
    const targetEl = target
      ? h('button', { class: 'dl-target', title: $t('Hedefi seç'), onclick: () => locate(tab.id, target.id) }, '\u2192 ' + describe(target))
      : h('span', { class: 'dl-target bad' }, $t('Bağlı değil: seçimin kenarındaki noktadan sürükleyip bağlayın'));
    const head = h('div', { class: 'dl-opt-head' }, h('span', { class: 'dl-num' }, String(i + 1)), targetEl,
      inEdgePanel ? null : iconBtn('chevron', $t('Aşağı taşı'), () => move(1)),
      inEdgePanel ? null : h('button', { class: 'icon-btn flip', title: $t('Yukarı taşı'), html: icon('chevron', 16), onclick: () => move(-1) }),
      inEdgePanel ? null : h('button', { class: 'icon-btn danger', title: $t('Seçeneği sil'), html: icon('trash', 15), onclick: del }));
    const text = textInput(o.text, (v) => { o.text = v; }, { placeholder: $t('Oyuncunun söyleyeceği') });
    text.dataset.opt = o.id;
    const [cond, hint] = exprInput(o.cond, (v) => { o.cond = v; }, $t('Koşul (isteğe bağlı), ör. gold >= 50'));
    return h('div', { class: 'dl-opt' }, head, text, cond, hint, limitRow(o));
  }

  /* "[x] [3] kez seçildikten sonra gizle": sayı kutusu yalnızca kutu işaretliyken etkin */
  function limitRow(o) {
    const lim = D.pickLimit(o);
    const cb = h('input', { type: 'checkbox', checked: !!lim });
    const num = h('input', { class: 'input num dl-limit-n', type: 'number', min: 1, max: 999, step: 1, value: lim || 1, disabled: !lim, title: $t('Kaç kez seçilebilir') });
    cb.addEventListener('change', () => {
      Store.mutate(() => { if (cb.checked) o.maxPicks = Math.max(1, Math.min(999, parseInt(num.value, 10) || 1)); else delete o.maxPicks; });
      num.disabled = !cb.checked;
      if (cb.checked) { num.focus(); num.select(); }
      App.Editor.requestRender();
    });
    num.addEventListener('focus', () => Store.begin());
    num.addEventListener('blur', () => { if (!(parseInt(num.value, 10) >= 1)) num.value = D.pickLimit(o) || 1; Store.end(); });
    num.addEventListener('input', () => {
      const v = parseInt(num.value, 10);
      if (v >= 1 && v <= 999 && cb.checked) { o.maxPicks = v; App.Editor.requestRender(); }
    });
    return h('label', { class: 'p-check dl-limit' }, cb, num, h('span', null, $t('kez seçildikten sonra gizle')));
  }

  /* ---------------- Düğüm paneli ---------------- */
  function renderNode(n) {
    const out = [];
    const title = typeLabel(n);
    switch (n.type) {
      case 'dlgLine': {
        const ch = D.character(Store.doc, n.speaker);
        const warn = n.speaker && !ch
          ? h('div', { class: 'p-hint dl-hint warn' }, $t('Bilinmeyen karakter: {id}', { id: n.speaker }), ' ',
            h('button', { class: 'link-btn', onclick: () => { Store.mutate(() => { D.ensureReg(Store.doc).characters.push({ id: n.speaker, name: n.speaker, color: D.CHAR_COLORS[0] }); }); refresh(); } }, $t('Karakter olarak ekle')))
          : null;
        out.push(section(title,
          field($t('Konuşmacı'), speakerChips(n)), warn,
          h('button', { class: 'link-btn dl-chars-link', html: icon('users', 13) + `<span>${U.esc($t('Karakter sayfası'))}</span>`, onclick: () => App.CharactersUI.open(n.speaker) }),
          field($t('Replik'), textArea(n.text, (v) => { n.text = v; }, { rows: Math.min(10, Math.max(3, Math.ceil((n.text || '').length / 34) + 1)), wrap: true, spellcheck: true, placeholder: $t('Karakterin söyleyeceği') }),
            $t('{degisken} yazarak değişkenin değerini metne ekleyebilirsiniz.')),
          h('datalist', { id: 'emotion-list' }, ['neutral', 'happy', 'sad', 'angry', 'surprised', 'afraid', 'worried', 'thinking', 'whisper'].map((v) => h('option', { value: v }))),
          h('div', { class: 'p-row' },
            field($t('Duygu / portre'), textInput(n.emotion, (v) => { n.emotion = v.trim(); }, { list: 'emotion-list', placeholder: 'happy' })),
            field($t('Ses kaydı'), textInput(n.audio, (v) => { n.audio = v.trim(); }, { mono: true, placeholder: 'vo_guard_001' }))),
          field($t('Etiketler'), textInput(n.tags, (v) => { n.tags = v; }, { placeholder: 'intro, important' }), $t('Virgülle ayırın; oyuna dizi olarak gider.'))));
        out.push(quickAdd(n));
        break;
      }
      case 'dlgChoice': {
        const list = h('div', { class: 'dl-opts' }, n.options.map((o, i) => optionCard(n, o, i)));
        out.push(section(title,
          field($t('Soru / açıklama (isteğe bağlı)'), textArea(n.text, (v) => { n.text = v; }, { rows: 2, wrap: true, spellcheck: true, placeholder: $t('Seçimler gösterilirken ekranda kalan metin') }))));
        out.push(section($t('Seçenekler'), list,
          h('div', { class: 'p-row wrap' }, btn($t('Seçenek ekle'), () => addOption(n), { icon: 'plus', primary: true })),
          h('div', { class: 'p-hint' }, $t('Koşulu sağlanmayan seçenek oyuncuya gösterilmez. Kenardaki noktadan sürükleyerek de seçenek ekleyebilirsiniz.')),
          exprHelp()));
        break;
      }
      case 'dlgBranch': {
        const [cond, hint] = exprInput(n.cond, (v) => { n.cond = v; }, 'gold >= 50 and not metBefore');
        const tab = Store.tab;
        const target = (b) => { const e = tab.edges.find((x) => x.from === n.id && (b ? x.branch !== 'false' : x.branch === 'false')); return e ? Store.node(e.to) : null; };
        const row = (label, cls, t) => h('div', { class: 'dl-branch ' + cls }, h('b', null, label),
          t ? h('button', { class: 'dl-target', onclick: () => locate(tab.id, t.id) }, '\u2192 ' + describe(t)) : h('span', { class: 'dl-target bad' }, $t('bağlı değil')));
        out.push(section(title, field($t('Koşul'), cond), hint,
          row($t('Doğru'), 'yes', target(true)), row($t('Yanlış'), 'no', target(false)),
          h('div', { class: 'p-row wrap' }, btn($t('Doğru / Yanlış yer değiştir'), () => {
            Store.mutate(() => { for (const e of tab.edges) if (e.from === n.id) e.branch = e.branch === 'false' ? 'true' : 'false'; });
            refresh();
          }, { icon: 'swap' })),
          h('div', { class: 'p-hint' }, $t('Kenardaki noktadan ilk bağlanan çıkış Doğru, ikincisi Yanlış olur.')),
          exprHelp()));
        break;
      }
      case 'dlgAction': {
        const hint = h('div', { class: 'dl-errs' });
        const check = (src) => {
          const errs = D.parseActions(src).filter((a) => a.error);
          hint.replaceChildren(...errs.map((a) => h('div', { class: 'p-hint dl-hint bad' }, '\u26A0 ' + $t('Satır {n}: {msg}', { n: a.line, msg: a.error }))));
        };
        const area = textArea(n.actions, (v) => { n.actions = v; check(v); }, { mono: true, rows: Math.min(10, Math.max(3, n.actions.split('\n').length + 1)), placeholder: 'gold -= 50\nhasSword = true\n@give_item sword 1' });
        check(n.actions);
        out.push(section(title, field($t('Eylemler (her satıra bir tane)'), area), hint, actionHelp()));
        out.push(quickAdd(n));
        break;
      }
      case 'dlgStart': {
        let before = n.dlgId;
        const idEl = textInput(n.dlgId, (v) => { n.dlgId = v; }, { mono: true, placeholder: 'blacksmith_intro' });
        idEl.addEventListener('focus', () => { before = n.dlgId; });
        idEl.addEventListener('change', () => {
          const next = D.slug(n.dlgId, 'dialogue');
          Store.mutate(() => {
            n.dlgId = next;
            // bu diyaloğa atlayan düğümler yeni kimliği izlesin
            if (before && before !== next) for (const t of Store.doc.tabs) for (const m of t.nodes) if (m.type === 'dlgJump' && m.target === before) m.target = next;
          });
          idEl.value = next;
          before = next;
          App.Editor.requestRender();
        });
        out.push(section(title,
          field($t('Başlık'), textInput(n.text, (v) => { n.text = v; }, { placeholder: $t('Demirciyle tanışma') })),
          field($t('Diyalog kimliği'), idEl, $t('Oyun kodu diyaloğu bu kimlikle başlatır. Küçük harf, rakam ve _ kullanın.'))));
        out.push(quickAdd(n));
        break;
      }
      case 'dlgJump': {
        const starts = D.allStarts(Store.doc);
        const opts = [{ value: '', label: $t('(diyalog seçin)') }].concat(starts.map((s) => ({ value: s.node.dlgId, label: (s.node.text || s.node.dlgId) + ' (' + s.node.dlgId + ')' })));
        if (n.target && !starts.some((s) => s.node.dlgId === n.target)) opts.push({ value: n.target, label: n.target + ' ?' });
        const t = D.findStart(Store.doc, n.target);
        out.push(section(title,
          field($t('Hedef diyalog'), select(opts, n.target || '', (v) => { n.target = v; })),
          h('div', { class: 'p-hint' }, $t('Akış, seçilen diyaloğun başından devam eder (başka sekmede olabilir).')),
          t ? h('div', { class: 'p-row wrap' }, btn($t('Hedefe git'), () => locate(t.tab.id, t.node.id), { icon: 'fit' })) : null));
        break;
      }
      case 'dlgCard': {
        const opts = [{ value: '', label: $t('(karakter seçin)') }].concat(D.reg(Store.doc).characters.map((c) => ({ value: c.id, label: c.name })));
        if (n.charId && !D.character(Store.doc, n.charId)) opts.push({ value: n.charId, label: n.charId + ' ?' });
        out.push(section(title,
          field($t('Karakter'), select(opts, n.charId || '', (v) => { n.charId = v; })),
          h('div', { class: 'p-row wrap' },
            checkbox($t('Açıklamayı göster'), n.showDesc !== false, (v) => { n.showDesc = v; }),
            checkbox($t('Özellikleri göster'), n.showProps !== false, (v) => { n.showProps = v; })),
          h('div', { class: 'p-row wrap' }, btn($t('Karakteri düzenle'), () => App.CharactersUI.open(n.charId), { icon: 'users', primary: true })),
          h('div', { class: 'p-hint' }, $t('Kart, karakter sayfasındaki bilgileri gösterir; oyun JSON\'una girmez. Karttan boşluğa sürüklerseniz bu karakterin konuştuğu yeni bir replik oluşur.')),
          K.fontField([n])));
        out.push(nodeActions());
        return out;
      }
      case 'dlgEnd':
        out.push(section(title,
          field($t('Sonuç (isteğe bağlı)'), textInput(n.text, (v) => { n.text = v.replace(/\s+/g, '_'); }, { mono: true, placeholder: 'quest_accepted' }),
            $t('Diyalog bittiğinde oyuna döner; ör. hangi sonla bittiğini anlamak için.'))));
        break;
    }
    const issues = D.validate(Store.doc, Store.tab.id).filter((i) => i.node === n.id);
    if (issues.length) out.push(section($t('Sorunlar'), h('div', { class: 'dl-issues' }, issues.map((i) => issueRow(i, false)))));
    out.push(section(null, K.fontField([n])));
    out.push(section(null, playRow(n)));
    out.push(nodeActions());
    if (focusOpt) {
      const id = focusOpt;
      focusOpt = null;
      setTimeout(() => { const el = document.querySelector(`#panelBody input[data-opt="${id}"]`); if (el) { el.focus(); el.scrollIntoView({ block: 'nearest' }); } }, 0);
    }
    return out;
  }

  /* ---------------- Kenar paneli ---------------- */
  function isDlgEdge(e) { return D.isDlg(Store.node(e.from)); }

  function renderEdge(e) {
    const out = [];
    const src = Store.node(e.from), dst = Store.node(e.to);
    const route = field($t('Rota'), segmented([
      { value: '', label: $t('Sekme'), title: $t('Sekme varsayılanı') },
      { value: 'orthogonal', label: $t('Dik'), icon: 'routeOrth', iconOnly: true, title: $t('Dik') },
      { value: 'straight', label: $t('Düz'), icon: 'routeStraight', iconOnly: true, title: $t('Düz') },
      { value: 'curved', label: $t('Eğri'), icon: 'routeCurve', iconOnly: true, title: $t('Eğri') },
    ], e.routing || '', (v) => { if (v) e.routing = v; else delete e.routing; delete e.mid; }));
    const summary = h('div', { class: 'p-hint' }, describe(src) + '  \u2192  ' + describe(dst));
    if (src.type === 'dlgChoice') {
      const i = src.options.findIndex((o) => o.id === e.opt);
      if (i >= 0) out.push(section($t('Seçenek {n}', { n: i + 1 }), optionCard(src, src.options[i], i, true)));
    } else if (src.type === 'dlgBranch') {
      out.push(section($t('Koşul çıkışı'), segmented([
        { value: 'true', label: $t('Doğru') }, { value: 'false', label: $t('Yanlış') },
      ], e.branch === 'false' ? 'false' : 'true', (v) => { e.branch = v; }), h('div', { class: 'p-hint mono' }, src.cond)));
    }
    out.push(section($t('Bağlantı'), summary, route, h('div', { class: 'p-row wrap' },
      btn($t('Rotayı sıfırla'), () => { Store.mutate(() => { delete e.mid; delete e.points; delete e.fromSide; delete e.toSide; }); refresh(); }, { icon: 'routeOrth' }),
      btn($t('Sil'), () => Store.deleteSelection(), { icon: 'trash', danger: true }))));
    return out;
  }

  /* ---------------- Sekme paneli: karakterler, değişkenler, kontrol ---------------- */
  function charRow(c) {
    const doc = Store.doc;
    const color = h('input', { type: 'color', class: 'swatch-pick', value: U.isHex(c.color) ? c.color : '#8e9bb0', title: $t('Renk') });
    color.addEventListener('focus', () => Store.begin());
    color.addEventListener('input', () => { c.color = color.value; App.Editor.requestRender(); });
    color.addEventListener('change', () => { Store.end(); });
    color.addEventListener('blur', () => { while (Store._depth) Store.end(); });
    const name = textInput(c.name, (v) => { c.name = v; }, { placeholder: $t('Ad') });
    const id = h('input', { class: 'input mono dl-id', value: c.id, spellcheck: false, title: $t('Oyunda kullanılan kimlik') });
    id.addEventListener('change', () => {
      const nid = D.slug(id.value, c.id);
      let ok = false;
      Store.mutate(() => { ok = D.renameCharacter(doc, c, nid); });
      if (!ok && nid !== c.id) UI.toast($t('Bu kimlik zaten kullanılıyor'), 'warn');
      refresh();
    });
    const uses = doc.tabs.reduce((k, t) => k + t.nodes.filter((n) => n.type === 'dlgLine' && n.speaker === c.id).length, 0);
    const del = h('button', { class: 'icon-btn danger', title: $t('Sil'), html: icon('trash', 15), onclick: async () => {
      if (uses && !(await UI.confirm($t('"{name}" {n} replikte konuşuyor. Yine de silinsin mi? (Replikler konuşmacısız kalır)', { name: c.name, n: uses }), { ok: $t('Sil'), danger: true }))) return;
      Store.mutate(() => { D.removeCharacter(doc, c); });
      refresh();
    } });
    return h('div', { class: 'dl-row' }, color, name, del, h('div', { class: 'dl-row-sub' }, id, h('span', { class: 'p-hint' }, $t('{n} replik', { n: uses }))));
  }

  function varRow(v) {
    const doc = Store.doc;
    const name = h('input', { class: 'input mono', value: v.name, spellcheck: false });
    name.addEventListener('change', () => {
      const nn = name.value.trim().replace(/[^\w.\u00C0-\uFFFF]+/g, '_');
      if (!nn || D.reg(doc).variables.some((x) => x !== v && x.name === nn)) { name.value = v.name; return; }
      Store.mutate(() => { v.name = nn; });
      refresh();
    });
    const type = select([
      { value: 'bool', label: 'true / false' }, { value: 'number', label: '123' }, { value: 'string', label: '"abc"' },
    ], v.type, (t) => {
      v.type = t;
      v.value = t === 'number' ? String(parseFloat(v.value) || 0) : t === 'bool' ? (/^(true|1)$/i.test(v.value) ? 'true' : 'false') : v.value;
      setTimeout(refresh, 0);
    });
    const value = v.type === 'bool'
      ? select([{ value: 'false', label: 'false' }, { value: 'true', label: 'true' }], /^(true|1)$/i.test(v.value) ? 'true' : 'false', (x) => { v.value = x; })
      : textInput(v.value, (x) => { v.value = x; }, { mono: true, placeholder: v.type === 'number' ? '0' : '""' });
    const del = h('button', { class: 'icon-btn danger', title: $t('Sil'), html: icon('trash', 15), onclick: () => {
      Store.mutate(() => { const r = D.ensureReg(doc); r.variables = r.variables.filter((x) => x !== v); });
      refresh();
    } });
    return h('div', { class: 'dl-var' }, name, type, value, del);
  }

  function issueRow(i, withNode) {
    const n = i.node ? Store.node(i.node) : null;
    const row = h('button', { class: 'dl-issue ' + i.level, title: $t('Düğümü göster') },
      h('span', { class: 'dl-dot' }),
      h('span', { class: 'dl-issue-text' }, i.msg, withNode && n ? h('em', null, describe(n)) : null));
    row.addEventListener('click', () => { if (i.node) locate(i.tab, i.node); });
    return row;
  }

  function renderTab() {
    const tab = Store.tab, doc = Store.doc, R = D.reg(doc);
    const out = [];
    const cnt = (t) => tab.nodes.filter((n) => n.type === t).length;
    const owner = D.tabOwner(doc, tab);
    const ownerOpts = [{ value: '', label: $t('(karakter yok)') }].concat(R.characters.map((c) => ({ value: c.id, label: c.name })));
    if (tab.owner && !owner) ownerOpts.push({ value: tab.owner, label: tab.owner + ' ?' });
    out.push(section($t('Diyalog sekmesi'),
      field($t('Ad'), textInput(tab.name, (v) => { tab.name = v; Store.emit('tabsChanged'); })),
      field($t('Sayfanın karakteri'), select(ownerOpts, tab.owner || '', (v) => { if (v) tab.owner = v; else delete tab.owner; setTimeout(refresh, 0); }),
        $t('Bu sayfa bir karakterin konuşmalarıysa seçin; JSON\'da diyaloglar bu karakterle işaretlenir ve karakter ayrı dışa aktarılabilir.')),
      K.tabFontField(tab),
      h('div', { class: 'p-stats' }, stat(cnt('dlgStart'), $t('diyalog')), stat(cnt('dlgLine'), $t('replik')), stat(cnt('dlgChoice'), $t('seçim'))),
      h('div', { class: 'p-row wrap' },
        btn($t('Oynat'), () => playtest(), { icon: 'play', primary: true }),
        btn($t('JSON dışa aktar'), () => exportDialog(), { icon: 'export' }),
        btn($t('Unity JSON'), () => exportDialog('unity'), { icon: 'export' }))));

    out.push(section($t('Karakterler'),
      h('div', { class: 'dl-list' }, R.characters.length ? R.characters.map(charRow) : h('div', { class: 'p-hint' }, $t('Henüz karakter yok.'))),
      h('div', { class: 'p-row wrap' },
        btn($t('Karakter sayfası'), () => App.CharactersUI.open(), { icon: 'users', primary: true }),
        btn($t('Karakter ekle'), async () => {
          const name = await promptCharacter();
          if (!name) return;
          Store.mutate(() => { D.addCharacter(doc, name); });
          refresh();
        }, { icon: 'plus' })),
      h('div', { class: 'p-hint' }, $t('Portre, açıklama ve özellikleri karakter sayfasında düzenleyin; soldaki paletten karakteri sahneye sürükleyin.'))));

    out.push(section($t('Değişkenler'),
      h('div', { class: 'dl-list' }, R.variables.length ? R.variables.map(varRow) : h('div', { class: 'p-hint' }, $t('Koşullarda ve eylemlerde kullanılan oyun durumu (altın, görev aşaması, bayraklar).'))),
      h('div', { class: 'p-row wrap' }, btn($t('Değişken ekle'), () => {
        Store.mutate(() => { D.addVariable(doc, 'flag', 'bool'); });
        refresh();
        setTimeout(() => { const els = document.querySelectorAll('#panelBody .dl-var input.mono'); const el = els[els.length - 1]; if (el) { el.focus(); el.select(); } }, 0);
      }, { icon: 'plus' }))));

    const issues = D.validate(doc, tab.id);
    const errs = issues.filter((i) => i.level === 'error').length, warns = issues.length - errs;
    out.push(section($t('Kontrol'),
      issues.length
        ? h('div', { class: 'p-hint' }, $t('{e} hata, {w} uyarı', { e: errs, w: warns }))
        : h('div', { class: 'p-hint dl-hint ok' }, '\u2713 ' + $t('Sorun bulunamadı')),
      issues.length ? h('div', { class: 'dl-issues' }, issues.slice(0, 40).map((i) => issueRow(i, true))) : null,
      issues.length > 40 ? h('div', { class: 'p-hint' }, $t('+{n} sorun daha', { n: issues.length - 40 })) : null));

    out.push(section($t('İpuçları'), h('ul', { class: 'p-tips' },
      rich($t('Soldaki **Diyalog** paletinden düğüm ekleyin; kenardaki noktadan **boşluğa sürüklemek** yeni replik oluşturur.')),
      rich($t('**Oyuncu Seçimi** düğümünden çıkan her bağlantı bir seçenektir; numaralar kenar etiketinde görünür.')),
      rich($t('Replik başlığına **çift tıklayarak** konuşmacıyı değiştirin; metne çift tıklayarak yazın.')),
      rich($t('**Oynat** ile diyaloğu oyundaki gibi deneyin; değişkenleri önizleme sırasında değiştirebilirsiniz.')))));
    return out;
  }

  /* ---------------- Önizleme (oynatıcı) ---------------- */
  function playtest(fromNodeId) {
    const doc = Store.doc;
    const starts = D.allStarts(doc);
    if (!starts.length && !fromNodeId) { UI.toast($t('Önce bir Başlangıç düğümü ekleyin'), 'warn'); return; }
    // varsayılan: seçili / verilen düğüm, yoksa bu sekmedeki ilk başlangıç
    const choices = starts.map((s) => ({ value: s.node.id, label: (s.node.text || s.node.dlgId) + '  \u00B7  ' + s.tab.name }));
    let startId = fromNodeId || (starts.find((s) => s.tab === Store.tab) || starts[0]).node.id;
    if (fromNodeId && !starts.some((s) => s.node.id === fromNodeId)) {
      const n = Store.node(fromNodeId);
      choices.unshift({ value: fromNodeId, label: $t('Seçili düğümden: {name}', { name: describe(n) }) });
    }
    let runner = null, stop = null, showLocked = true;
    const logEl = h('div', { class: 'pl-log' });
    const ctrl = h('div', { class: 'pl-ctrl' });
    const varsEl = h('div', { class: 'pl-vars' });
    const picker = h('select', { class: 'input' }, choices.map((c) => h('option', { value: c.value, selected: c.value === startId }, c.label)));
    picker.addEventListener('change', () => { startId = picker.value; begin(); });
    const lockedCb = h('input', { type: 'checkbox', checked: true });
    lockedCb.addEventListener('change', () => { showLocked = lockedCb.checked; if (stop) show(stop, true); });

    const locBtn = (ev) => (ev && ev.node ? h('button', { class: 'pl-loc', title: $t('Tuvalde göster'), html: icon('fit', 13), onclick: () => { m.close(); locate(ev.tab.id, ev.node.id); } }) : null);
    const scroll = () => { logEl.scrollTop = logEl.scrollHeight; };
    const add = (el) => { logEl.appendChild(el); scroll(); };
    const sys = (ev, text, cls) => add(h('div', { class: 'pl-sys ' + (cls || '') }, h('span', null, text), locBtn(ev)));

    function logEvent(ev) {
      if (ev.kind === 'start') sys(ev, '\u25B6 ' + ev.text, 'start');
      else if (ev.kind === 'branch') sys(ev, ev.error ? '\u26A0 ' + ev.text + ' \u2014 ' + ev.error : ev.text + '  \u2192  ' + (ev.value ? $t('Doğru') : $t('Yanlış')), ev.error ? 'bad' : '');
      else if (ev.kind === 'action') sys(ev, (ev.error ? '\u26A0 ' : '') + ev.text + (ev.error ? ' \u2014 ' + ev.error : ''), ev.error ? 'bad' : ev.event ? 'event' : '');
      else if (ev.kind === 'jump') sys(ev, '\u21AA ' + ev.text, 'start');
    }
    function lineBubble(st) {
      const n = st.node, c = D.character(doc, n.speaker);
      const col = c ? c.color : '#8e9bb0';
      return h('div', { class: 'pl-line', style: { '--who': col } },
        h('div', { class: 'pl-who' }, h('span', { class: 'pl-ava' }, c && c.portrait ? h('img', { src: c.portrait, alt: '' }) : ((c ? c.name : n.speaker || '?').trim()[0] || '?').toUpperCase()),
          h('b', null, c ? c.name : n.speaker || $t('(konuşmacı yok)')), n.emotion ? h('em', null, n.emotion) : null, locBtn(st)),
        h('div', { class: 'pl-text md', html: st.text ? App.Md.toHtml(st.text) : '\u2026' }),
        n.audio ? h('div', { class: 'pl-meta' }, '\u266A ' + n.audio) : null);
    }

    function go(ref) {
      const r = runner.run(ref);
      r.log.forEach(logEvent);
      show(r.stop);
      renderVars();
    }
    function show(st, again) {
      stop = st;
      ctrl.replaceChildren();
      m.onEnter = null;
      if (st.kind === 'line') {
        if (!again) add(lineBubble(st));
        const cont = h('button', { class: 'btn primary pl-cont' }, $t('Devam'), h('span', { class: 'pl-key' }, 'Enter'));
        cont.addEventListener('click', () => go(st.next));
        ctrl.append(cont);
        m.onEnter = () => go(st.next);
      } else if (st.kind === 'choice') {
        if (!again && st.prompt) add(h('div', { class: 'pl-prompt md', html: App.Md.toHtml(st.prompt) }));
        const list = h('div', { class: 'pl-opts' });
        let k = 0;
        for (const o of st.options) {
          if (!o.available && !showLocked) continue;
          const b = h('button', { class: 'pl-opt' + (o.available ? '' : ' locked'), disabled: !o.available },
            h('span', { class: 'pl-n' }, String(o.index + 1)), h('span', { class: 'pl-otext md', html: o.text ? App.Md.toHtml(o.text, true) : U.esc($t('(boş seçenek)')) }),
            o.available ? (o.limit ? h('span', { class: 'pl-why left' }, $t('{n} hak kaldı', { n: o.left })) : null) : h('span', { class: 'pl-why' }, o.reason));
          if (o.available) {
            k++;
            b.addEventListener('click', () => pick(o));
          }
          list.appendChild(b);
        }
        ctrl.append(list);
        if (!k) ctrl.append(h('div', { class: 'p-hint dl-hint bad' }, $t('Gösterilebilecek seçenek yok: oyuncu burada takılır.')));
      } else {
        if (!again) {
          if (st.kind === 'error') add(h('div', { class: 'pl-end bad' }, '\u26A0 ' + st.text));
          else add(h('div', { class: 'pl-end' }, $t('Diyalog bitti') + (st.result ? ' \u00B7 ' + st.result : st.implicit ? ' \u00B7 ' + $t('(Bitiş düğümü yok)') : '')));
        }
        const again2 = h('button', { class: 'btn primary' }, h('span', { html: icon('refresh', 15) }), $t('Baştan oynat'));
        again2.addEventListener('click', begin);
        ctrl.append(again2);
        m.onEnter = begin;
      }
    }
    function pick(o) {
      if (!stop || stop.kind !== 'choice') return;
      add(h('div', { class: 'pl-me md', html: o.text ? App.Md.toHtml(o.text, true) : '\u2026' }));
      go(runner.choose(o));
    }
    function renderVars() {
      const declared = D.reg(doc).variables;
      const cvars = D.charVars(doc).filter((v) => !declared.some((d) => d.name === v.name));
      const cnames = new Set(cvars.map((v) => v.name));
      const names = [...new Set(declared.map((v) => v.name).concat(Object.keys(runner.vars)))].filter((nm) => !cnames.has(nm));
      const typeOf = (nm) => {
        const d = declared.find((v) => v.name === nm) || cvars.find((v) => v.name === nm);
        return d ? d.type : typeof runner.vars[nm] === 'number' ? 'number' : typeof runner.vars[nm] === 'boolean' ? 'bool' : 'string';
      };
      const control = (nm) => {
        const t = typeOf(nm), cur = runner.vars[nm];
        let ctl;
        if (t === 'bool') {
          ctl = h('input', { type: 'checkbox', checked: !!cur });
          ctl.addEventListener('change', () => { runner.vars[nm] = ctl.checked; changed(); });
        } else {
          ctl = h('input', { class: 'input mono', value: cur == null ? '' : D.fmt(cur, true) });
          ctl.addEventListener('change', () => { runner.vars[nm] = D.typedValue(t, ctl.value); changed(); });
        }
        return ctl;
      };
      // karakter özellikleri: karakter başına grup; koşullarda "karakter.özellik" adıyla
      const groups = [];
      for (const c of D.reg(doc).characters) {
        const mine = cvars.filter((v) => v.charId === c.id);
        if (!mine.length) continue;
        groups.push(h('div', { class: 'pl-char', style: { '--who': c.color } },
          h('div', { class: 'pl-char-head' }, h('span', { class: 'pl-ava' }, c.portrait ? h('img', { src: c.portrait, alt: '' }) : (String(c.name).trim()[0] || '?').toUpperCase()), h('b', null, c.name)),
          ...mine.map((v) => h('label', { class: 'pl-var', title: v.name }, h('span', null, v.key, h('em', { class: 'mono' }, v.name)), control(v.name)))));
      }
      varsEl.replaceChildren(h('div', { class: 'p-title' }, $t('Değişkenler')),
        ...(names.length ? [] : [h('div', { class: 'p-hint' }, $t('Tanımlı değişken yok.'))]),
        ...names.map((nm) => h('label', { class: 'pl-var' }, h('span', { class: 'mono' }, nm), control(nm))),
        ...(groups.length ? [h('div', { class: 'p-title pl-sub' }, $t('Karakter özellikleri'))].concat(groups) : []));
    }
    // değişken elle değişince bekleyen seçimin koşullarını yeniden hesapla
    function changed() {
      if (stop && stop.kind === 'choice') { const r = runner.run({ tab: stop.tab, node: stop.node }); show(r.stop, true); }
      renderVars();
    }
    function begin() {
      runner = new D.Runner(doc);
      logEl.replaceChildren();
      const ref = runner.locate(startId);
      if (!ref) { show({ kind: 'error', text: $t('Başlangıç bulunamadı') }); return; }
      go(ref);
    }

    const restart = h('button', { class: 'btn small', onclick: () => begin() }, h('span', { html: icon('refresh', 14) }), $t('Baştan'));
    const body = h('div', { class: 'pl-grid' },
      h('div', { class: 'pl-main' },
        h('div', { class: 'pl-top' }, picker, restart),
        logEl, ctrl),
      h('div', { class: 'pl-side' }, varsEl,
        h('label', { class: 'p-check' }, lockedCb, h('span', null, $t('Kilitli seçenekleri göster'))),
        h('div', { class: 'p-hint' }, $t('Değerleri değiştirip koşulları deneyin. Rakam tuşlarıyla seçenek seçebilirsiniz.'))));
    const onKey = (e) => {
      if (UI.topModal() !== m || App.Editor.isTyping(e.target)) return;
      if (stop && stop.kind === 'choice' && /^[1-9]$/.test(e.key)) {
        const o = stop.options.find((x) => x.index === +e.key - 1 && x.available);
        if (o) { e.preventDefault(); pick(o); }
      } else if (e.key === ' ' && stop && stop.kind === 'line') { e.preventDefault(); go(stop.next); }
    };
    window.addEventListener('keydown', onKey);
    const m = UI.modal({ title: $t('Diyalog önizleme'), wide: true, className: 'play-modal', body, noFocus: true, onClose: () => window.removeEventListener('keydown', onKey) });
    begin();
  }

  /* ---------------- JSON dışa aktarım ---------------- */
  /* target: 'full' (tüm ayrıntılar) ya da 'unity' (yalnızca diyaloglar, seçimler ve sonuçları)
     scope: 'all' | 'tab' (bu sekme) | 'char' (owner karakterinin sayfaları) */
  function exportDialog(target, scope, owner) {
    const doc = Store.doc;
    if (!doc.tabs.some(D.isDialogueTab)) { UI.toast($t('Belgede diyalog sekmesi yok'), 'warn'); return; }
    const onDlgTab = D.isDialogueTab(Store.tab);
    // sayfası olan karakterler
    const owners = D.reg(doc).characters.filter((c) => D.pagesOf(doc, c.id).length);
    const cur = D.tabOwner(doc, Store.tab);
    const opts = { scope: 'all', pretty: true, target: target === 'unity' ? 'unity' : 'full', owner: owner || (cur && owners.includes(cur) ? cur.id : owners.length ? owners[0].id : '') };
    if (scope === 'tab' && onDlgTab) opts.scope = 'tab';
    if (scope === 'char' && opts.owner) opts.scope = 'char';
    const sel = () => (opts.scope === 'tab' ? { tabId: Store.tab.id } : opts.scope === 'char' ? { owner: opts.owner } : {});
    const seg = (key, options) => {
      const w = h('div', { class: 'seg' });
      for (const [v, l] of options) {
        const b = h('button', { class: 'seg-btn' + (opts[key] === v ? ' active' : '') }, l);
        b.addEventListener('click', () => { opts[key] = v; w.querySelectorAll('.seg-btn').forEach((x) => x.classList.toggle('active', x === b)); update(); });
        w.appendChild(b);
      }
      return w;
    };
    const ta = h('textarea', { class: 'input area mono dl-json', rows: 18, spellcheck: false, readOnly: true });
    const summary = h('div', { class: 'dl-sum' });
    const intro = h('p', { class: 'modal-text' });
    let text = '';
    const ownerSel = h('select', { class: 'input dl-owner' }, owners.map((c) => h('option', { value: c.id, selected: c.id === opts.owner }, c.name)));
    ownerSel.addEventListener('change', () => { opts.owner = ownerSel.value; update(); });
    const update = () => {
      const unity = opts.target === 'unity';
      ownerSel.hidden = opts.scope !== 'char';
      const data = unity ? D.exportUnity(doc, sel()) : D.exportData(doc, sel());
      text = JSON.stringify(data, null, opts.pretty ? 2 : 0);
      ta.value = text;
      intro.textContent = unity
        ? $t('Unity için sade JSON: yalnızca diyaloglar, replikler, seçimler ve sonuçları. Renkler, karakter listesi, duygu / ses / etiket ve biçim bilgisi yazılmaz; konuşmacı adıyla gelir.')
        : $t('Oyun motorunuzun okuyacağı JSON. Her diyalog bir Başlangıç düğümüdür; düğümler kimlikleriyle birbirine bağlanır.');
      const inScope = new Set(D.exportTabs(doc, sel()).map((t) => t.id));
      const issues = D.validate(doc).filter((i) => inScope.has(i.tab));
      const errs = issues.filter((i) => i.level === 'error');
      const nodes = data.dialogues.reduce((k, d) => k + d.nodes.length, 0);
      const choices = data.dialogues.reduce((k, d) => k + d.nodes.reduce((j, n) => j + (n.choices || n.options || []).length, 0), 0);
      summary.replaceChildren(
        h('div', { class: 'p-hint' }, unity
          ? $t('{d} diyalog, {n} düğüm, {s} seçenek', { d: data.dialogues.length, n: nodes, s: choices })
          : $t('{d} diyalog, {n} düğüm, {c} karakter, {v} değişken', { d: data.dialogues.length, n: nodes, c: data.characters.length, v: data.variables.length })),
        errs.length
          ? h('div', { class: 'callout warn' }, h('b', null, $t('{n} hata var; oyunda sorun çıkarabilir:', { n: errs.length })),
            h('ul', null, errs.slice(0, 5).map((i) => h('li', null, i.msg + (i.node && Store.node(i.node, doc.tabs.find((t) => t.id === i.tab)) ? ' \u2014 ' + describe(Store.node(i.node, doc.tabs.find((t) => t.id === i.tab))) : '')))))
          : h('div', { class: 'p-hint dl-hint ok' }, '\u2713 ' + (issues.length ? $t('Hata yok ({w} uyarı)', { w: issues.length }) : $t('Sorun bulunamadı'))));
    };
    const ownerName = () => { const c = D.character(doc, opts.owner); return c ? c.name : opts.owner; };
    const fileName = () => U.safeFileName(Store.doc.name) + (opts.scope === 'tab' ? '-' + U.safeFileName(Store.tab.name) : opts.scope === 'char' ? '-' + U.safeFileName(ownerName()) : '') + (opts.target === 'unity' ? '.unity' : '') + '.dialogue.json';
    const csharp = () => (opts.target === 'unity' ? D.csharpUnityModel() : D.csharpModel());
    /* Her diyalog sayfası ayrı JSON dosyası; C# sınıfları da zip'e eklenir */
    const zipPages = () => {
      const unity = opts.target === 'unity';
      const taken = new Set();
      const files = doc.tabs.filter(D.isDialogueTab).map((t) => {
        let base = U.safeFileName(t.name, 'dialogue'), name = base, k = 2;
        while (taken.has(name.toLowerCase())) name = base + '-' + k++;
        taken.add(name.toLowerCase());
        const data = unity ? D.exportUnity(doc, { tabId: t.id }) : D.exportData(doc, { tabId: t.id });
        return { name: name + (unity ? '.unity' : '') + '.dialogue.json', data: JSON.stringify(data, null, opts.pretty ? 2 : 0) };
      });
      files.push({ name: 'DialogueData.cs', data: csharp(), bom: true });
      const zipName = U.safeFileName(doc.name) + (unity ? '-unity' : '') + '-dialogues.zip';
      U.download(zipName, new Blob([App.Zip.build(files)], { type: 'application/zip' }));
      UI.toast($t('{n} sayfa ayrı JSON olarak indirildi', { n: files.length - 1 }), 'ok');
    };
    const body = h('div', null,
      intro,
      h('div', { class: 'p-row wrap dl-export-opts' },
        h('label', { class: 'p-field' }, h('span', { class: 'p-label' }, $t('Hedef')), seg('target', [['unity', $t('Unity (sade)')], ['full', $t('Tam')]])),
        h('div', { class: 'p-field' }, h('span', { class: 'p-label' }, $t('Kapsam')),
          h('div', { class: 'p-row' }, seg('scope', [['all', $t('Tüm diyalog sekmeleri')]].concat(onDlgTab ? [['tab', $t('Yalnızca bu sekme')]] : [], owners.length ? [['char', $t('Karakter')]] : [])), ownerSel)),
        h('label', { class: 'p-field' }, h('span', { class: 'p-label' }, $t('Biçim')), seg('pretty', [[true, $t('Okunaklı')], [false, $t('Sıkıştırılmış')]]))),
      summary, ta,
      h('details', { class: 'p-help' }, h('summary', null, $t('Oyunda nasıl kullanılır?')),
        h('div', { class: 'p-help-body dl-howto', html: U.esc($t('1. Dialogue.start düğümünden başlayın. 2. line: konuşmacı ve metni gösterin, next ile devam edin. 3. choice: condition sağlanan ve maxPicks sınırına ulaşmamış seçenekleri gösterin, seçilenin next değerine gidin. 4. condition: koşulu değerlendirip ifTrue / ifFalse. 5. action: set ve event eylemlerini uygulayın. 6. jump: başka diyaloğa geçin. 7. end ya da next boşsa diyalog biter.')) })));
    UI.modal({
      title: $t('Diyalog JSON dışa aktar'), wide: true, body, noFocus: true,
      buttons: [
        { label: $t('Unity C# sınıfları'), icon: 'code', action: () => { U.download('DialogueData.cs', '\uFEFF' + csharp(), 'text/plain'); return false; } },
        { label: $t('Sayfalar ayrı ayrı (.zip)'), icon: 'export', action: () => { zipPages(); return false; } },
        { spacer: true },
        { label: $t('Kopyala'), icon: 'copy', action: () => { UI.copyText(text); return false; } },
        { label: $t('İndir (.json)'), primary: true, icon: 'export', action: () => { U.download(fileName(), text, 'application/json'); UI.toast($t('İndirildi: {name}', { name: fileName() }), 'ok'); } },
      ],
    });
    update();
  }

  App.DialogueUI = { renderNode, renderEdge, renderTab, isDlgEdge, speakerMenu, appendAfter, addOption, playtest, exportDialog, locate, describe };
})(window);
