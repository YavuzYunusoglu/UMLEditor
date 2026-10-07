'use strict';
/* Arayüz bileşenleri: simgeler, menüler, modallar, bildirimler */
(function (global) {
  const App = (global.App = global.App || {});
  const U = App.U, h = U.h;
  const $t = App.$t || ((k) => k);

  const P = {
    file: '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5"/>',
    folder: '<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>',
    save: '<path d="M5 3h11l5 5v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z"/><path d="M7 3v5h8V3"/><rect x="7" y="13" width="10" height="7" rx="1"/>',
    undo: '<path d="M9 14 4 9l5-5"/><path d="M4 9h11a5 5 0 0 1 0 10h-3"/>',
    redo: '<path d="m15 14 5-5-5-5"/><path d="M20 9H9a5 5 0 0 0 0 10h3"/>',
    import: '<path d="M12 3v12"/><path d="m7 10 5 5 5-5"/><path d="M5 21h14"/>',
    export: '<path d="M12 15V3"/><path d="m7 8 5-5 5 5"/><path d="M5 21h14"/>',
    layout: '<rect x="9" y="3" width="6" height="5" rx="1"/><rect x="3" y="16" width="6" height="5" rx="1"/><rect x="15" y="16" width="6" height="5" rx="1"/><path d="M12 8v4M6 16v-2h12v2"/>',
    fit: '<path d="M4 9V5a1 1 0 0 1 1-1h4M15 4h4a1 1 0 0 1 1 1v4M20 15v4a1 1 0 0 1-1 1h-4M9 20H5a1 1 0 0 1-1-1v-4"/>',
    sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
    moon: '<path d="M20 14.5A8 8 0 0 1 9.5 4 8 8 0 1 0 20 14.5z"/>',
    help: '<circle cx="12" cy="12" r="9"/><path d="M9.5 9.5a2.5 2.5 0 0 1 4.9.7c0 1.7-2.4 2.2-2.4 3.8"/><path d="M12 17h.01"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    x: '<path d="M6 6l12 12M18 6 6 18"/>',
    search: '<circle cx="11" cy="11" r="6"/><path d="m20 20-4.5-4.5"/>',
    grid: '<path d="M3 9h18M3 15h18M9 3v18M15 3v18"/>',
    magnet: '<path d="M6 3v8a6 6 0 0 0 12 0V3"/><path d="M6 7h4M14 7h4"/>',
    trash: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>',
    copy: '<rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h8"/>',
    code: '<path d="m8 8-5 4 5 4M16 8l5 4-5 4M13.5 5l-3 14"/>',
    image: '<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="2"/><path d="m21 17-5-5-9 8"/>',
    chevron: '<path d="m6 9 6 6 6-6"/>',
    chevronRight: '<path d="m9 6 6 6-6 6"/>',
    zoomIn: '<circle cx="11" cy="11" r="6"/><path d="m20 20-4.5-4.5M11 8v6M8 11h6"/>',
    zoomOut: '<circle cx="11" cy="11" r="6"/><path d="m20 20-4.5-4.5M8 11h6"/>',
    routeOrth: '<path d="M4 19h7V5h9"/>',
    routeStraight: '<path d="M4 19 20 5"/>',
    routeCurve: '<path d="M4 19C12 19 12 5 20 5"/>',
    alignLeft: '<path d="M4 3v18"/><rect x="7" y="6" width="10" height="4" rx="1"/><rect x="7" y="14" width="6" height="4" rx="1"/>',
    alignCenter: '<path d="M12 3v18"/><rect x="6" y="6" width="12" height="4" rx="1"/><rect x="8" y="14" width="8" height="4" rx="1"/>',
    alignRight: '<path d="M20 3v18"/><rect x="7" y="6" width="10" height="4" rx="1"/><rect x="11" y="14" width="6" height="4" rx="1"/>',
    alignTop: '<path d="M3 4h18"/><rect x="6" y="7" width="4" height="10" rx="1"/><rect x="14" y="7" width="4" height="6" rx="1"/>',
    alignMiddle: '<path d="M3 12h18"/><rect x="6" y="6" width="4" height="12" rx="1"/><rect x="14" y="8" width="4" height="8" rx="1"/>',
    alignBottom: '<path d="M3 20h18"/><rect x="6" y="7" width="4" height="10" rx="1"/><rect x="14" y="11" width="4" height="6" rx="1"/>',
    distH: '<path d="M4 3v18M20 3v18"/><rect x="9" y="8" width="6" height="8" rx="1"/>',
    distV: '<path d="M3 4h18M3 20h18"/><rect x="8" y="9" width="8" height="6" rx="1"/>',
    swap: '<path d="M7 4 3 8l4 4M3 8h14M17 12l4 4-4 4M21 16H7"/>',
    keyboard: '<rect x="2" y="6" width="20" height="12" rx="2"/><path d="M6 10h.01M10 10h.01M14 10h.01M18 10h.01M7 14h10"/>',
    front: '<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M4 16V6a2 2 0 0 1 2-2h10"/>',
    back: '<rect x="4" y="4" width="12" height="12" rx="2"/><path d="M20 8v10a2 2 0 0 1-2 2H8"/>',
    edit: '<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="m13 7 4 4"/>',
    unity: '<path d="m12 2 8.5 5v10L12 22l-8.5-5V7z"/><path d="M12 22V12M20.5 7 12 12 3.5 7"/>',
    menu: '<path d="M4 6h16M4 12h16M4 18h16"/>',
    globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/>',
    cloud: '<path d="M7 18a4.5 4.5 0 0 1-.5-9A6 6 0 0 1 18 8.5a4.5 4.5 0 0 1-.5 9.5z"/>',
    cloudUp: '<path d="M7 18a4.5 4.5 0 0 1-.5-9A6 6 0 0 1 18 8.5a4.5 4.5 0 0 1 0 9"/><path d="M12 20v-7M9 15.5l3-3 3 3"/>',
    cloudDown: '<path d="M7 18a4.5 4.5 0 0 1-.5-9A6 6 0 0 1 18 8.5a4.5 4.5 0 0 1 0 9"/><path d="M12 12v8M9 17.5l3 3 3-3"/>',
    logout: '<path d="M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3"/><path d="M10 17l-5-5 5-5M5 12h11"/>',
    refresh: '<path d="M20 11a8 8 0 0 0-14.6-4.5L4 8"/><path d="M4 3v5h5"/><path d="M4 13a8 8 0 0 0 14.6 4.5L20 16"/><path d="M20 21v-5h-5"/>',
    select: '<path d="M4 4h3M10 4h4M17 4h3v3M20 10v4M20 17v3h-3M14 20h-4M7 20H4v-3M4 14v-4M4 7V4"/>',
    sliders: '<path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M20 18h0"/><circle cx="16" cy="6" r="2"/><circle cx="10" cy="12" r="2"/><circle cx="18" cy="18" r="2"/>',
    sparkle: '<path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M6 18l2.5-2.5M15.5 8.5 18 6"/>',
  };

  function icon(name, size) {
    const s = size || 16;
    return `<svg class="ico" width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${P[name] || ''}</svg>`;
  }
  function iconEl(name, size) { const span = document.createElement('span'); span.className = 'ico-wrap'; span.innerHTML = icon(name, size); return span; }

  /* Palet öğesi için küçük önizleme */
  function paletteIcon(item) {
    const col = item.color || (App.UML.SHAPES[item.icon] && App.UML.SHAPES[item.icon].color) || 'currentColor';
    const st = `stroke="${col === 'currentColor' ? 'currentColor' : col}" fill="${col === 'currentColor' ? 'none' : U.rgba(col, 0.18)}" stroke-width="1.6"`;
    let inner;
    switch (item.icon) {
      case 'class': inner = `<rect x="4" y="4" width="24" height="24" rx="3" ${st}/><rect x="4" y="4" width="24" height="8" rx="3" fill="${col === 'currentColor' ? 'currentColor' : col}" opacity=".55"/><path d="M4 12h24M4 20h24" stroke="${col}" stroke-width="1.2"/>`; break;
      case 'terminator': inner = `<rect x="3" y="10" width="26" height="12" rx="6" ${st}/>`; break;
      case 'process': inner = `<rect x="4" y="8" width="24" height="16" rx="2" ${st}/>`; break;
      case 'decision': inner = `<path d="M16 4 29 16 16 28 3 16z" ${st}/>`; break;
      case 'io': inner = `<path d="M8 8h21l-5 16H3z" ${st}/>`; break;
      case 'preparation': inner = `<path d="M8 8h16l5 8-5 8H8l-5-8z" ${st}/>`; break;
      case 'subprocess': inner = `<rect x="3" y="8" width="26" height="16" rx="1" ${st}/><path d="M7 8v16M25 8v16" stroke="${col}" stroke-width="1.3"/>`; break;
      case 'document': inner = `<path d="M4 6h24v16q-6-4-12 0t-12 0z" ${st}/>`; break;
      case 'connector': inner = `<circle cx="16" cy="16" r="9" ${st}/>`; break;
      case 'note': inner = `<path d="M5 5h16l6 6v16H5z" ${st}/><path d="M21 5v6h6" stroke="${col}" fill="none" stroke-width="1.3"/>`; break;
      case 'frame': inner = `<rect x="3" y="5" width="26" height="22" rx="3" ${st} stroke-dasharray="3 2"/><path d="M3 11h11V5" stroke="${col}" fill="none" stroke-width="1.3"/>`; break;
      case 'text': inner = `<path d="M8 9h16M16 9v15" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round"/>`; break;
      case 'pattern': inner = `<rect x="3" y="4" width="11" height="9" rx="2" stroke="#4f8cff" fill="${U.rgba('#4f8cff', 0.2)}" stroke-width="1.5"/><rect x="18" y="4" width="11" height="9" rx="2" stroke="#3ecf8e" fill="${U.rgba('#3ecf8e', 0.2)}" stroke-width="1.5"/><rect x="10" y="20" width="12" height="9" rx="2" stroke="#b26bff" fill="${U.rgba('#b26bff', 0.2)}" stroke-width="1.5"/><path d="M14 8.5h4M16 13v7" stroke="currentColor" stroke-width="1.3"/>`; break;
      case 'loop': inner = `<path d="M16 4 26 11 16 18 6 11z" stroke="#f5a623" fill="${U.rgba('#f5a623', 0.2)}" stroke-width="1.5"/><path d="M6 11H3v15h13v-8" stroke="currentColor" fill="none" stroke-width="1.4"/><path d="m13 21 3-3 3 3" stroke="currentColor" fill="none" stroke-width="1.4"/>`; break;
      case 'flow': inner = `<rect x="8" y="2" width="16" height="7" rx="3.5" stroke="#3ecf8e" fill="${U.rgba('#3ecf8e', 0.2)}" stroke-width="1.4"/><path d="M16 12l6 5-6 5-6-5z" stroke="#f5a623" fill="${U.rgba('#f5a623', 0.2)}" stroke-width="1.4"/><rect x="9" y="25" width="14" height="6" rx="1" stroke="currentColor" fill="none" stroke-width="1.3"/><path d="M16 9v3M16 22v3" stroke="currentColor" stroke-width="1.3"/>`; break;
      default: inner = `<rect x="4" y="8" width="24" height="16" rx="2" ${st}/>`;
    }
    return `<svg width="32" height="32" viewBox="0 0 32 32">${inner}</svg>`;
  }

  /* ---------- Menüler ---------- */
  let openMenus = [];
  function closeMenus() { openMenus.forEach((m) => m.remove()); openMenus = []; document.querySelectorAll('.tb-btn.open').forEach((b) => b.classList.remove('open')); }
  function closeDeeper(level) {
    openMenus.filter((m) => +m.dataset.level > (level || 0)).forEach((m) => m.remove());
    openMenus = openMenus.filter((m) => m.isConnected);
  }

  function showMenu(x, y, items, opts) {
    opts = opts || {};
    if (!opts.sub) closeMenus();
    const openedAt = performance.now();
    // kök menü: uzun basıştan kalkan parmak; alt menü: onu açan dokunuşun gecikmeli click'i
    const clickGuard = opts.sub ? 300 : 450;
    const menu = h('div', { class: 'menu', role: 'menu' });
    for (const it of items) {
      if (!it) continue;
      if (it.sep) { menu.appendChild(h('div', { class: 'menu-sep' })); continue; }
      if (it.header) { menu.appendChild(h('div', { class: 'menu-header' }, it.header)); continue; }
      const row = h('div', { class: 'menu-item' + (it.disabled ? ' disabled' : '') + (it.checked ? ' checked' : ''), role: 'menuitem' },
        h('span', { class: 'menu-ico', html: it.icon ? icon(it.icon, 15) : '' }),
        h('span', { class: 'menu-label' }, it.label),
        it.shortcut ? h('span', { class: 'menu-kbd' }, it.shortcut) : null,
        it.submenu ? h('span', { class: 'menu-sub', html: icon('chevronRight', 13) }) : null);
      if (it.checked) row.querySelector('.menu-ico').innerHTML = '<span class="dot"></span>';
      if (it.submenu) {
        let child = null;
        const openSub = () => {
          if (child && child.isConnected) return;
          closeDeeper(opts.level);
          menu.querySelectorAll('.menu-item.open').forEach((x) => x.classList.remove('open'));
          row.classList.add('open');
          child = showMenu(0, 0, it.submenu, { sub: true, level: (opts.level || 0) + 1, anchor: row });
        };
        row.addEventListener('mouseenter', openSub);
        // dokunmatikte mouseenter her zaman gelmez: dokunuşla da açılsın
        row.addEventListener('click', (e) => { e.stopPropagation(); openSub(); });
      } else {
        row.addEventListener('mouseenter', () => { closeDeeper(opts.level); menu.querySelectorAll('.menu-item.open').forEach((x) => x.classList.remove('open')); });
        // uzun basışla açılan menüde parmak kalkınca altta kalan öğe "tıklanmasın"
        if (!it.disabled) row.addEventListener('click', (e) => { e.stopPropagation(); if (performance.now() - openedAt < clickGuard) return; closeMenus(); it.action && it.action(); });
      }
      menu.appendChild(row);
    }
    menu.dataset.level = opts.level || 0;
    document.body.appendChild(menu);
    const r = menu.getBoundingClientRect();
    const W = window.innerWidth, H = window.innerHeight;
    let left = x, top = y;
    if (opts.anchor) {
      // alt menü: üst menünün sağına, sığmazsa soluna; dar ekranda satırın altına/üstüne
      const ar = opts.anchor.getBoundingClientRect(), pr = opts.anchor.closest('.menu').getBoundingClientRect();
      top = ar.top - 5;
      if (pr.right - 2 + r.width <= W - 6) left = pr.right - 2;
      else if (pr.left + 2 - r.width >= 6) left = pr.left + 2 - r.width;
      else {
        left = Math.min(ar.left + 16, W - r.width - 6);
        top = ar.bottom + 2 + r.height <= H - 6 ? ar.bottom + 2 : ar.top - r.height - 2;
      }
    } else if (left + r.width > W - 6) left = W - r.width - 6;
    if (top + r.height > H - 6) top = H - r.height - 6;
    top = Math.max(6, top);
    menu.style.left = Math.max(6, left) + 'px';
    menu.style.top = top + 'px';
    openMenus.push(menu);
    return menu;
  }

  function dropdown(btn, itemsFn) {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const wasOpen = btn.classList.contains('open');
      closeMenus();
      if (wasOpen) return;
      const r = btn.getBoundingClientRect();
      showMenu(r.left, r.bottom + 4, typeof itemsFn === 'function' ? itemsFn() : itemsFn);
      btn.classList.add('open');
    });
  }

  document.addEventListener('pointerdown', (e) => { if (!e.target.closest('.menu') && !e.target.closest('.tb-btn.open')) closeMenus(); });
  window.addEventListener('blur', closeMenus);

  /* ---------- Modallar ---------- */
  let modalStack = [];
  function modal(opts) {
    const overlay = h('div', { class: 'modal-overlay' });
    const box = h('div', { class: 'modal' + (opts.wide ? ' wide' : '') + (opts.className ? ' ' + opts.className : ''), role: 'dialog' });
    const close = () => { overlay.remove(); modalStack = modalStack.filter((m) => m !== api); opts.onClose && opts.onClose(); };
    const head = h('div', { class: 'modal-head' }, h('div', { class: 'modal-title' }, opts.title || ''), h('button', { class: 'icon-btn', title: $t('Kapat (Esc)'), html: icon('x'), onclick: close }));
    const body = h('div', { class: 'modal-body' });
    if (opts.body) body.appendChild(opts.body);
    box.append(head, body);
    if (opts.buttons && opts.buttons.length) {
      const foot = h('div', { class: 'modal-foot' });
      for (const b of opts.buttons) {
        if (b.spacer) { foot.appendChild(h('div', { style: { flex: 1 } })); continue; }
        foot.appendChild(h('button', { class: 'btn' + (b.primary ? ' primary' : '') + (b.danger ? ' danger' : ''), onclick: () => { const r = b.action ? b.action() : undefined; if (r !== false) close(); } }, b.icon ? h('span', { html: icon(b.icon, 15) }) : null, b.label));
      }
      box.appendChild(foot);
    }
    overlay.appendChild(box);
    overlay.addEventListener('pointerdown', (e) => { if (e.target === overlay) overlay.dataset.down = '1'; });
    overlay.addEventListener('click', (e) => { if (e.target === overlay && overlay.dataset.down === '1' && !opts.sticky) close(); overlay.dataset.down = ''; });
    document.body.appendChild(overlay);
    const api = { close, overlay, box, body, onEnter: opts.onEnter };
    modalStack.push(api);
    setTimeout(() => { const f = box.querySelector('[autofocus], input, textarea, select'); if (f && !opts.noFocus) f.focus(); }, 30);
    return api;
  }
  function topModal() { return modalStack[modalStack.length - 1] || null; }

  function confirm(message, opts) {
    opts = opts || {};
    return new Promise((resolve) => {
      let done = false;
      const m = modal({
        title: opts.title || $t('Onay'), body: h('p', { class: 'modal-text' }, message),
        buttons: [{ spacer: true }, { label: $t('Vazgeç'), action: () => { done = true; resolve(false); } }, { label: opts.ok || $t('Devam'), primary: !opts.danger, danger: opts.danger, action: () => { done = true; resolve(true); } }],
        onClose: () => { if (!done) resolve(false); },
      });
      m.onEnter = () => { done = true; resolve(true); m.close(); };
    });
  }

  function prompt(message, value, opts) {
    opts = opts || {};
    return new Promise((resolve) => {
      let done = false;
      const inp = h('input', { class: 'input', value: value || '', type: 'text' });
      const m = modal({
        title: opts.title || message, body: h('div', null, opts.title ? h('p', { class: 'modal-text' }, message) : null, inp),
        buttons: [{ spacer: true }, { label: $t('Vazgeç'), action: () => { done = true; resolve(null); } }, { label: opts.ok || $t('Tamam'), primary: true, action: () => { done = true; resolve(inp.value); } }],
        onClose: () => { if (!done) resolve(null); },
      });
      setTimeout(() => inp.select(), 40);
      m.onEnter = () => { done = true; resolve(inp.value); m.close(); };
    });
  }

  document.addEventListener('keydown', (e) => {
    const m = topModal();
    if (!m) return;
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); m.close(); }
    else if (e.key === 'Enter' && m.onEnter && e.target.tagName !== 'TEXTAREA') { e.preventDefault(); e.stopPropagation(); m.onEnter(); }
  }, true);

  /* ---------- Bildirim ---------- */
  let toastBox = null;
  function toast(msg, type, opts) {
    opts = opts || {};
    if (!toastBox) { toastBox = h('div', { class: 'toasts' }); document.body.appendChild(toastBox); }
    const t = h('div', { class: 'toast ' + (type || '') + (opts.action ? ' has-action' : '') }, h('span', null, msg));
    const hide = () => { t.classList.remove('show'); setTimeout(() => t.remove(), 300); };
    if (opts.action) {
      t.appendChild(h('button', { class: 'toast-action', onclick: () => { hide(); opts.action.fn(); } }, opts.action.label));
      t.appendChild(h('button', { class: 'toast-close', html: icon('x', 13), title: $t('Kapat'), onclick: hide }));
    }
    toastBox.appendChild(t);
    requestAnimationFrame(() => t.classList.add('show'));
    setTimeout(hide, opts.action ? 12000 : type === 'error' ? 5000 : 2600);
  }

  /* Kod kutusu (basit C# vurgulama) */
  const CS_KW = /\b(using|namespace|public|private|protected|internal|static|readonly|const|class|struct|interface|enum|void|int|float|double|bool|string|object|var|new|return|if|else|for|foreach|while|do|switch|case|break|continue|yield|null|true|false|this|base|override|virtual|abstract|sealed|get|set|event|where|typeof|in|out|ref|params|default)\b/g;
  function highlightCS(code) {
    return code.split('\n').map((line) => {
      const ci = line.indexOf('//');
      let main = ci >= 0 ? line.slice(0, ci) : line;
      const comment = ci >= 0 ? line.slice(ci) : '';
      main = U.esc(main)
        .replace(/(&quot;[^&]*?&quot;)/g, '<span class="tk-str">$1</span>')
        .replace(CS_KW, '<span class="tk-kw">$1</span>')
        .replace(/(\[)([A-Z]\w*)/g, '$1<span class="tk-attr">$2</span>')
        .replace(/\b(\d+(\.\d+)?f?)\b/g, '<span class="tk-num">$1</span>');
      return main + (comment ? `<span class="tk-com">${U.esc(comment)}</span>` : '');
    }).join('\n');
  }

  async function copyText(text) {
    try { await navigator.clipboard.writeText(text); toast($t('Panoya kopyalandı'), 'ok'); }
    catch (e) {
      const ta = h('textarea', { value: text, style: { position: 'fixed', opacity: 0 } });
      document.body.appendChild(ta); ta.select();
      try { document.execCommand('copy'); toast($t('Panoya kopyalandı'), 'ok'); } catch (e2) { toast($t('Kopyalanamadı'), 'error'); }
      ta.remove();
    }
  }

  App.UI = { icon, iconEl, paletteIcon, showMenu, closeMenus, dropdown, modal, topModal, confirm, prompt, toast, highlightCS, copyText };
})(typeof window !== 'undefined' ? window : globalThis);
