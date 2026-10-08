'use strict';
/* Tuval: görünüm, çizim, fare/klavye etkileşimi, satır içi düzenleme */
(function (global) {
  const App = global.App;
  const { U, Store, Geo, UML, Model } = App;
  const $t = App.$t;

  const GRID = 20, SNAP = 10;
  const settings = { snap: true, grid: true };
  try { Object.assign(settings, JSON.parse(localStorage.getItem('umlstudio.settings') || '{}')); } catch (e) { /* yok say */ }
  const saveSettings = () => { try { localStorage.setItem('umlstudio.settings', JSON.stringify(settings)); } catch (e) { /* yok say */ } };

  let wrap, svg, vp, inlineEl;
  const L = {};
  let geom = new Map();
  let hover = null;
  let st = null;
  let spaceDown = false;
  let raf = 0;
  let inl = null;
  let clipboard = null;
  let pasteN = 0;
  // dokunmatik
  const pointers = new Map();
  let touchMode = false, selectMode = false;
  let longTimer = null, lastTap = null, lastTouchAt = 0;
  const moveTol = () => (touchMode ? 8 : 3);

  const view = () => Store.tab.view;
  function toWorld(cx, cy) {
    const r = svg.getBoundingClientRect(), v = view();
    return { x: (cx - r.left - v.x) / v.zoom, y: (cy - r.top - v.y) / v.zoom };
  }
  const snapOn = (e) => settings.snap && !(e && e.altKey);
  const sn = (v) => U.snap(v, SNAP);

  /* ---------------- Görünüm ---------------- */
  function applyView() {
    const v = view();
    vp.setAttribute('transform', `translate(${v.x},${v.y}) scale(${v.zoom})`);
    let g = GRID * v.zoom;
    while (g < 12) g *= 2;
    wrap.style.backgroundSize = `${g}px ${g}px`;
    wrap.style.backgroundPosition = `${v.x}px ${v.y}px`;
    wrap.classList.toggle('no-grid', !settings.grid);
    Store.emit('view');
    saveSoon();
  }
  const saveSoon = U.debounce(() => Store.emit('viewSaved'), 600);

  function zoomAt(factor, sx, sy) {
    const v = view();
    const r = svg.getBoundingClientRect();
    if (sx == null) { sx = r.width / 2; sy = r.height / 2; }
    const nz = U.clamp(v.zoom * factor, 0.1, 4);
    const k = nz / v.zoom;
    v.x = sx - (sx - v.x) * k;
    v.y = sy - (sy - v.y) * k;
    v.zoom = nz;
    applyView();
    renderOverlay();
  }
  function setZoom(z) { zoomAt(z / view().zoom); }

  function fitView(ids) {
    const tab = Store.tab;
    const b = Geo.contentBounds(tab, ids || null);
    const r = svg.getBoundingClientRect();
    const v = view();
    if (!b || !r.width) { v.x = 80; v.y = 60; v.zoom = 1; applyView(); return; }
    const z = U.clamp(Math.min((r.width - 100) / b.w, (r.height - 100) / b.h), 0.15, 1.25);
    v.zoom = z;
    v.x = (r.width - b.w * z) / 2 - b.x * z;
    v.y = (r.height - b.h * z) / 2 - b.y * z;
    applyView();
    renderOverlay();
  }

  function viewCenterWorld() {
    const r = svg.getBoundingClientRect();
    return toWorld(r.left + r.width / 2, r.top + r.height / 2);
  }

  /* ---------------- Çizim ---------------- */
  function requestRender() {
    if (raf) return;
    raf = requestAnimationFrame(() => { raf = 0; renderNow(); });
  }
  function renderNow() {
    if (raf) { cancelAnimationFrame(raf); raf = 0; }
    const T = App.Theme.current();
    const out = App.Render.renderTab(Store.tab, T, { live: true, selectedEdges: Store.sel.edges });
    L.frames.innerHTML = out.frames;
    L.edges.innerHTML = out.edges;
    L.nodes.innerHTML = out.nodes;
    L.labels.innerHTML = out.labels;
    geom = out.geom;
    renderOverlay();
    wrap.classList.toggle('empty', !Store.tab.nodes.length);
  }

  function handlePositions(n, b) {
    const all = {
      nw: [b.x, b.y], n: [b.x + b.w / 2, b.y], ne: [b.x + b.w, b.y], e: [b.x + b.w, b.y + b.h / 2],
      se: [b.x + b.w, b.y + b.h], s: [b.x + b.w / 2, b.y + b.h], sw: [b.x, b.y + b.h], w: [b.x, b.y + b.h / 2],
    };
    let keys = Object.keys(all);
    if (n.type === 'class') keys = ['e', 'w'];
    else if (n.type === 'connector') keys = ['nw', 'ne', 'se', 'sw'];
    return keys.map((k) => [k, all[k][0], all[k][1]]);
  }

  function renderOverlay() {
    if (!L.overlay) return;
    const z = view().zoom;
    const sw = 1.5 / z;
    let s = '';
    const busy = st && st.moved && (st.mode === 'drag' || st.mode === 'resize');
    const selNodes = Store.selectedNodes();
    for (const n of selNodes) {
      const b = Geo.bounds(n), p = 3 / z;
      s += `<rect class="ov-sel" x="${b.x - p}" y="${b.y - p}" width="${b.w + 2 * p}" height="${b.h + 2 * p}" rx="${6 / z}" stroke-width="${sw}"/>`;
    }
    const T = touchMode;
    const single = selNodes.length === 1 && !(st && (st.mode === 'connect' || st.mode === 'marquee' || st.mode === 'pinch')) && !busy ? selNodes[0] : null;
    if (single) {
      const b = Geo.bounds(single), hs = (T ? 15 : 8) / z;
      for (const [k, x, y] of handlePositions(single, b)) {
        s += `<rect class="ov-handle h-${k}" data-handle="${k}" x="${x - hs / 2}" y="${y - hs / 2}" width="${hs}" height="${hs}" rx="${(T ? 4 : 1.5) / z}" stroke-width="${sw}"/>`;
      }
    }
    // bağlantı noktaları: bağlanırken hedefte, fareyle üzerine gelince kenarda,
    // seçili şekilde ise tutamaçlarla çakışmasın diye biraz dışarıda (dokunmatikte asıl bağlama yolu)
    const drawPorts = (node, off) => {
      const b = Geo.bounds(node);
      for (const side of Geo.SIDES) {
        const a = Geo.anchor(node, b, side, 0.5);
        const active = st && st.targetSide === side;
        const cx = a.x + a.dx * off, cy = a.y + a.dy * off;
        if (off) s += `<line class="ov-port-stem" x1="${a.x}" y1="${a.y}" x2="${cx}" y2="${cy}" stroke-width="${1.2 / z}"/>`;
        s += `<circle class="ov-port${active ? ' active' : ''}${off ? ' out' : ''}" data-port="${side}" data-node="${node.id}" cx="${cx}" cy="${cy}" r="${(active ? 6.5 : T ? 9 : 5) / z}" stroke-width="${sw}"/>`;
      }
    };
    if (st && (st.mode === 'connect' || (st.mode === 'ehandle' && st.which !== 'mid'))) {
      if (st.target) drawPorts(Store.node(st.target), 0);
    } else if (!st || st.mode === 'edgeclick') {
      if (hover && (!single || hover !== single.id) && Store.node(hover)) drawPorts(Store.node(hover), 0);
      if (single && single.type !== 'frame') drawPorts(single, (T ? 26 : 18) / z);
    }
    // seçili kenar tutamaçları
    if (Store.sel.edges.size === 1 && !Store.sel.nodes.size && !(st && st.mode === 'ehandle' && st.which !== 'mid')) {
      const id = [...Store.sel.edges][0];
      const g = geom.get(id);
      if (g) {
        const r = (T ? 9 : 5) / z;
        s += `<circle class="ov-ehandle" data-ehandle="start" cx="${g.start.x}" cy="${g.start.y}" r="${r}" stroke-width="${sw}"/>`;
        s += `<circle class="ov-ehandle" data-ehandle="end" cx="${g.end.x}" cy="${g.end.y}" r="${r}" stroke-width="${sw}"/>`;
        if (g.routing !== 'curved') {
          const m = Geo.midPoint(g.pts), q = (T ? 9 : 5.5) / z;
          s += `<rect class="ov-ehandle mid" data-ehandle="mid" x="${m.x - q}" y="${m.y - q}" width="${2 * q}" height="${2 * q}" rx="${1.5 / z}" transform="rotate(45 ${m.x} ${m.y})" stroke-width="${sw}"/>`;
        }
      }
    }
    if (st && (st.mode === 'connect' || (st.mode === 'ehandle' && st.which !== 'mid'))) {
      let to = st.cur;
      if (st.target) {
        const tn = Store.node(st.target);
        const b = Geo.bounds(tn);
        to = Geo.anchor(tn, b, st.targetSide || Geo.sideFacing(b, st.fixed), 0.5);
      }
      s += `<line class="ov-temp" x1="${st.fixed.x}" y1="${st.fixed.y}" x2="${to.x}" y2="${to.y}" stroke-width="${2 / z}" stroke-dasharray="${6 / z} ${4 / z}"/>`;
      s += `<circle class="ov-temp-dot" cx="${to.x}" cy="${to.y}" r="${3.5 / z}"/>`;
    }
    if (st && st.mode === 'marquee' && st.moved) {
      const x = Math.min(st.x0, st.x1), y = Math.min(st.y0, st.y1), w = Math.abs(st.x1 - st.x0), h = Math.abs(st.y1 - st.y0);
      s += `<rect class="ov-marquee${st.x1 < st.x0 ? ' crossing' : ''}" x="${x}" y="${y}" width="${w}" height="${h}" stroke-width="${1 / z}"${st.x1 < st.x0 ? ` stroke-dasharray="${5 / z} ${3 / z}"` : ''}/>`;
    }
    if (st && st.guides) {
      for (const gd of st.guides) {
        if (gd.x != null) s += `<line class="ov-guide" x1="${gd.x}" y1="${gd.y1}" x2="${gd.x}" y2="${gd.y2}" stroke-width="${1 / z}"/>`;
        else s += `<line class="ov-guide" x1="${gd.x1}" y1="${gd.y}" x2="${gd.x2}" y2="${gd.y}" stroke-width="${1 / z}"/>`;
      }
    }
    L.overlay.innerHTML = s;
  }

  /* ---------------- Fare ---------------- */
  function capture(e) { try { svg.setPointerCapture(e.pointerId); } catch (err) { /* yok say */ } }

  function onDown(e) {
    if (App.UI.topModal()) return;
    // birincil işaretçi = ekrana ilk değen parmak; haritada kalanlar kaybolmuş pointerup'lardır
    // (ör. uzun basışta dokunulan öğe yeniden çizimle DOM'dan silinince). Temizlenmezse
    // sonraki tek parmak dokunuşu iki parmak (yakınlaştırma) sanılır.
    if (e.isPrimary && (pointers.size || st)) {
      pointers.clear();
      clearTimeout(longTimer);
      cancelInteraction();
      wrap.classList.remove('panning');
    }
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const isTouch = e.pointerType === 'touch' || e.pointerType === 'pen';
    if (isTouch !== touchMode) { touchMode = isTouch; wrap.classList.toggle('touch', isTouch); }
    if (isTouch) lastTouchAt = Date.now();
    if (pointers.size >= 2) { capture(e); if (pointers.size === 2) startPinch(); return; }
    if (inl) commitInline();
    App.UI.closeMenus();
    const ae = document.activeElement;
    if (ae && ae !== document.body && ae !== wrap && typeof ae.blur === 'function') ae.blur();
    wrap.focus({ preventScroll: true });
    const p = toWorld(e.clientX, e.clientY);
    if (isTouch) startLongPress(e.target, e.clientX, e.clientY, p);
    if (e.button === 1 || (e.button === 0 && spaceDown)) {
      e.preventDefault();
      st = { mode: 'pan', lx: e.clientX, ly: e.clientY };
      wrap.classList.add('panning');
      capture(e);
      return;
    }
    if (e.button === 2) {
      st = { mode: 'rpan', sx: e.clientX, sy: e.clientY, lx: e.clientX, ly: e.clientY, moved: false, target: e.target, p };
      capture(e);
      return;
    }
    if (e.button !== 0) return;
    const t = e.target;
    const hEl = t.closest('[data-handle]');
    const portEl = t.closest('[data-port]');
    const ehEl = t.closest('[data-ehandle]');
    const nodeEl = t.closest('[data-node]');
    const edgeEl = t.closest('[data-edge]');
    if (hEl) startResize(hEl.dataset.handle, p, e);
    else if (portEl) startConnect(portEl.dataset.node, portEl.dataset.port, p);
    else if (ehEl) startEdgeHandle(ehEl.dataset.ehandle, p);
    else if (nodeEl) startNodeDrag(nodeEl.dataset.node, p, e);
    else if (edgeEl) {
      const id = edgeEl.dataset.edge;
      if (e.shiftKey || e.ctrlKey || e.metaKey || selectMode) {
        const s = new Set(Store.sel.edges);
        s.has(id) ? s.delete(id) : s.add(id);
        Store.select(Store.sel.nodes, s);
      } else Store.select([], [id]);
      st = { mode: 'edgeclick' };
    } else if (isTouch && !selectMode) {
      // dokunmatik: boş alanda tek parmak kaydırır; dokunup bırakmak seçimi temizler
      st = { mode: 'tpan', sx: e.clientX, sy: e.clientY, lx: e.clientX, ly: e.clientY, moved: false };
    } else {
      const additive = e.shiftKey || e.ctrlKey || e.metaKey || selectMode;
      if (!additive) Store.clearSelection();
      st = { mode: 'marquee', x0: p.x, y0: p.y, x1: p.x, y1: p.y, additive, base: new Set(Store.sel.nodes), moved: false };
    }
    capture(e);
    requestRender();
  }

  /* ---------------- Dokunmatik yardımcıları ---------------- */
  function startLongPress(target, cx, cy, p) {
    clearTimeout(longTimer);
    longTimer = setTimeout(() => {
      if (!st || st.moved || pointers.size !== 1) return;
      cancelInteraction();
      st = { mode: 'none' };
      if (navigator.vibrate) { try { navigator.vibrate(12); } catch (err) { /* yok say */ } }
      openContextMenu(target, cx, cy, p);
    }, 550);
  }

  /* Devam eden etkileşimi değişiklik bırakmadan sonlandır */
  function cancelInteraction() {
    if (!st) return;
    if (st.mode === 'drag' || st.mode === 'resize' || (st.mode === 'ehandle' && st.which === 'mid')) Store.end();
    st = null;
    renderOverlay();
  }

  function pinchInfo() {
    const [a, b] = [...pointers.values()];
    const r = svg.getBoundingClientRect();
    return { d: Math.hypot(a.x - b.x, a.y - b.y) || 1, cx: (a.x + b.x) / 2 - r.left, cy: (a.y + b.y) / 2 - r.top };
  }
  function startPinch() {
    clearTimeout(longTimer);
    cancelInteraction();
    if (inl) commitInline();
    const v = view(), pi = pinchInfo();
    st = { mode: 'pinch', d0: pi.d, z0: v.zoom, wx: (pi.cx - v.x) / v.zoom, wy: (pi.cy - v.y) / v.zoom, moved: true };
    renderOverlay();
  }
  function updatePinch() {
    if (pointers.size < 2) return;
    const v = view(), pi = pinchInfo();
    const z = U.clamp(st.z0 * pi.d / st.d0, 0.1, 4);
    v.zoom = z;
    v.x = pi.cx - st.wx * z;
    v.y = pi.cy - st.wy * z;
    applyView();
    renderOverlay();
  }

  function handleTap(s, e) {
    // çift dokunuş = çift tıklama
    const now = Date.now();
    if (lastTap && now - lastTap.t < 380 && Math.hypot(e.clientX - lastTap.x, e.clientY - lastTap.y) < 30) {
      lastTap = null;
      const target = document.elementFromPoint(e.clientX, e.clientY) || svg;
      onDblClick({ target, clientX: e.clientX, clientY: e.clientY, synthetic: true });
      return;
    }
    lastTap = { t: now, x: e.clientX, y: e.clientY };
    if (s.mode === 'tpan') Store.clearSelection();
  }

  function startNodeDrag(id, p, e) {
    const multi = e.shiftKey || e.ctrlKey || e.metaKey || selectMode;
    const wasSel = Store.sel.nodes.has(id);
    // seçim modunda seçili şekle dokunmak hemen seçimden çıkarmaz: sürüklenirse tüm seçim taşınır,
    // sürüklenmeden bırakılırsa (onUp) seçimden çıkar
    const toggleOff = selectMode && wasSel;
    if (multi && !toggleOff) {
      const s = new Set(Store.sel.nodes);
      if (wasSel) { s.delete(id); Store.select(s, Store.sel.edges); st = { mode: 'none' }; return; }
      s.add(id);
      Store.select(s, Store.sel.edges);
    } else if (!wasSel) Store.select([id], []);
    const tab = Store.tab;
    const ids = new Set(Store.sel.nodes);
    // seçili çerçevelerin içindeki düğümler de taşınır
    for (const n of tab.nodes) {
      if (n.type !== 'frame' || !ids.has(n.id)) continue;
      const fb = Geo.bounds(n);
      for (const m of tab.nodes) {
        if (m === n || ids.has(m.id)) continue;
        const b = Geo.bounds(m);
        if (b.x >= fb.x && b.y >= fb.y && b.x + b.w <= fb.x + fb.w && b.y + b.h <= fb.y + fb.h) ids.add(m.id);
      }
    }
    const orig = new Map();
    for (const nid of ids) { const n = Store.node(nid); if (n) orig.set(nid, { x: n.x, y: n.y }); }
    const edgeMids = tab.edges.filter((ed) => ed.mid && ids.has(ed.from) && ids.has(ed.to)).map((ed) => ({ e: ed, x: ed.mid.x, y: ed.mid.y }));
    Store.begin();
    st = { mode: 'drag', id, start: p, orig, edgeMids, moved: false, clickedSel: wasSel && !multi, toggleOff, ids };
  }

  function startResize(handle, p, e) {
    const n = Store.selectedNodes()[0];
    if (!n) return;
    const b = Geo.bounds(n);
    Store.begin();
    st = { mode: 'resize', id: n.id, handle, start: p, orig: b, moved: false, contentMin: n.type === 'class' ? Geo.classLayout(Object.assign({}, n, { w: 0 })).w : 0 };
  }

  function startConnect(nodeId, side, p) {
    const n = Store.node(nodeId);
    if (!n) return;
    const a = Geo.anchor(n, Geo.bounds(n), side, 0.5);
    st = { mode: 'connect', from: nodeId, side, fixed: { x: a.x, y: a.y }, cur: p, target: null, targetSide: null, moved: false };
  }

  function startEdgeHandle(which, p) {
    const id = [...Store.sel.edges][0];
    const e = Store.edge(id), g = geom.get(id);
    if (!e || !g) return;
    if (which === 'mid') {
      Store.begin();
      st = { mode: 'ehandle', which, id, moved: false };
      return;
    }
    st = { mode: 'ehandle', which, id, fixed: which === 'start' ? g.end : g.start, cur: p, target: null, targetSide: null, moved: false };
  }

  function updateHoverTarget(p, excludeId) {
    const tab = Store.tab;
    const n = Geo.hitNode(tab, p, excludeId ? new Set([excludeId]) : null);
    st.target = n ? n.id : null;
    st.targetSide = null;
    if (n) {
      const b = Geo.bounds(n), z = view().zoom;
      for (const side of Geo.SIDES) {
        const a = Geo.anchor(n, b, side, 0.5);
        if (Math.hypot(a.x - p.x, a.y - p.y) * z < (touchMode ? 24 : 14)) { st.targetSide = side; break; }
      }
    }
  }

  /* Hizalama kılavuzları: sürüklenen düğümün merkezini/kenarlarını diğer düğümlerle eşleştir */
  function smartSnap(tab, moving, nb) {
    const z = view().zoom, tol = 6 / z;
    const others = tab.nodes.filter((n) => !moving.has(n.id) && n.type !== 'frame').map(Geo.bounds);
    let dx = 0, dy = 0, bestX = tol, bestY = tol;
    const guides = [];
    const xs = [nb.x, nb.x + nb.w / 2, nb.x + nb.w], ys = [nb.y, nb.y + nb.h / 2, nb.y + nb.h];
    let gx = null, gy = null;
    for (const o of others) {
      const oxs = [o.x, o.x + o.w / 2, o.x + o.w], oys = [o.y, o.y + o.h / 2, o.y + o.h];
      for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) {
        if (i !== j && (i === 1 || j === 1)) continue; // merkez-merkez ve kenar-kenar
        const d = oxs[j] - xs[i];
        if (Math.abs(d) < bestX) { bestX = Math.abs(d); dx = d; gx = { x: oxs[j], o }; }
        const d2 = oys[j] - ys[i];
        if (Math.abs(d2) < bestY) { bestY = Math.abs(d2); dy = d2; gy = { y: oys[j], o }; }
      }
    }
    if (gx) guides.push({ x: gx.x, y1: Math.min(gx.o.y, nb.y + dy) - 10, y2: Math.max(gx.o.y + gx.o.h, nb.y + dy + nb.h) + 10 });
    if (gy) guides.push({ y: gy.y, x1: Math.min(gy.o.x, nb.x + dx) - 10, x2: Math.max(gy.o.x + gy.o.w, nb.x + dx + nb.w) + 10 });
    return { dx: gx ? dx : null, dy: gy ? dy : null, guides };
  }

  function onMove(e) {
    if (pointers.has(e.pointerId)) pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (!st) {
      if (e.buttons || e.pointerType === 'touch') return;
      const el = e.target.closest && e.target.closest('[data-node]');
      const id = el ? el.dataset.node : null;
      if (id !== hover) { hover = id; renderOverlay(); }
      return;
    }
    if (st.mode === 'pinch') { updatePinch(); return; }
    const p = toWorld(e.clientX, e.clientY);
    const z = view().zoom;
    switch (st.mode) {
      case 'pan': case 'rpan': case 'tpan': {
        if (st.mode !== 'pan' && !st.moved && Math.hypot(e.clientX - st.sx, e.clientY - st.sy) < (st.mode === 'tpan' ? 8 : 4)) return;
        st.moved = true;
        wrap.classList.add('panning');
        const v = view();
        v.x += e.clientX - st.lx; v.y += e.clientY - st.ly;
        st.lx = e.clientX; st.ly = e.clientY;
        applyView();
        break;
      }
      case 'drag': {
        let dx = p.x - st.start.x, dy = p.y - st.start.y;
        if (!st.moved && Math.hypot(dx, dy) * z < moveTol()) return;
        st.moved = true;
        const prim = st.orig.get(st.id);
        const n = Store.node(st.id);
        const size = Geo.nodeSize(n);
        let nx = prim.x + dx, ny = prim.y + dy;
        st.guides = null;
        if (snapOn(e)) {
          // önce akıllı hizalama, yoksa ızgaraya (merkez)
          const sm = smartSnap(Store.tab, st.ids, { x: nx, y: ny, w: size.w, h: size.h });
          nx = sm.dx != null ? nx + sm.dx : sn(nx + size.w / 2) - size.w / 2;
          ny = sm.dy != null ? ny + sm.dy : sn(ny + size.h / 2) - size.h / 2;
          st.guides = sm.guides.length ? sm.guides : null;
        }
        dx = nx - prim.x; dy = ny - prim.y;
        for (const [nid, o] of st.orig) { const m = Store.node(nid); if (m) { m.x = Math.round(o.x + dx); m.y = Math.round(o.y + dy); } }
        for (const em of st.edgeMids) em.e.mid = { x: em.x + dx, y: em.y + dy };
        requestRender();
        break;
      }
      case 'resize': {
        const n = Store.node(st.id);
        if (!n) return;
        st.moved = true;
        const o = st.orig, hd = st.handle;
        let x1 = o.x, y1 = o.y, x2 = o.x + o.w, y2 = o.y + o.h;
        if (hd.includes('w')) x1 = p.x; if (hd.includes('e')) x2 = p.x;
        if (hd.includes('n')) y1 = p.y; if (hd.includes('s')) y2 = p.y;
        if (snapOn(e)) { if (hd.includes('w')) x1 = sn(x1); if (hd.includes('e')) x2 = sn(x2); if (hd.includes('n')) y1 = sn(y1); if (hd.includes('s')) y2 = sn(y2); }
        const minW = n.type === 'class' ? st.contentMin : 30, minH = 24;
        if (x2 - x1 < minW) { if (hd.includes('w')) x1 = x2 - minW; else x2 = x1 + minW; }
        if (y2 - y1 < minH) { if (hd.includes('n')) y1 = y2 - minH; else y2 = y1 + minH; }
        if (e.shiftKey && hd.length === 2) {
          const ratio = o.w / o.h;
          const w = x2 - x1, h = y2 - y1;
          if (w / h > ratio) { const nh = w / ratio; if (hd.includes('n')) y1 = y2 - nh; else y2 = y1 + nh; }
          else { const nw = h * ratio; if (hd.includes('w')) x1 = x2 - nw; else x2 = x1 + nw; }
        }
        n.x = Math.round(x1);
        if (n.type === 'class') { n.w = Math.round(x2 - x1); }
        else { n.y = Math.round(y1); n.w = Math.round(x2 - x1); n.h = Math.round(y2 - y1); }
        if (n.type === 'connector') { const s = Math.max(n.w, n.h); n.w = n.h = s; }
        requestRender();
        break;
      }
      case 'connect': {
        st.cur = p;
        st.moved = true;
        updateHoverTarget(p, st.from);
        renderOverlay();
        break;
      }
      case 'ehandle': {
        st.moved = true;
        if (st.which === 'mid') {
          const ed = Store.edge(st.id);
          if (ed) { ed.mid = { x: snapOn(e) ? sn(p.x) : p.x, y: snapOn(e) ? sn(p.y) : p.y }; requestRender(); }
        } else {
          st.cur = p;
          updateHoverTarget(p, null);
          renderOverlay();
        }
        break;
      }
      case 'marquee': {
        st.x1 = p.x; st.y1 = p.y;
        if (!st.moved && Math.hypot(st.x1 - st.x0, st.y1 - st.y0) * z < moveTol()) return;
        st.moved = true;
        const crossing = st.x1 < st.x0;
        const rx = Math.min(st.x0, st.x1), ry = Math.min(st.y0, st.y1), rw = Math.abs(st.x1 - st.x0), rh = Math.abs(st.y1 - st.y0);
        const sel = new Set(st.additive ? st.base : []);
        for (const n of Store.tab.nodes) {
          const b = Geo.bounds(n);
          const inside = b.x >= rx && b.y >= ry && b.x + b.w <= rx + rw && b.y + b.h <= ry + rh;
          const inter = b.x < rx + rw && b.x + b.w > rx && b.y < ry + rh && b.y + b.h > ry;
          if (crossing ? inter : inside) sel.add(n.id);
        }
        Store.sel.nodes = sel;
        Store.sel.edges = new Set();
        renderOverlay();
        break;
      }
    }
  }

  function onUp(e) {
    pointers.delete(e.pointerId);
    clearTimeout(longTimer);
    if (!st) return;
    if (st.mode === 'pinch') { if (!pointers.size) st = null; return; }
    const s = st;
    st = null;
    wrap.classList.remove('panning');
    const isTouch = e.pointerType === 'touch' || e.pointerType === 'pen';
    // seçim modunda dokunuşlar seçimi değiştirir; çift dokunuşla düzenleme açılmaz
    if (isTouch && e.type === 'pointerup' && !s.moved && !selectMode && (s.mode === 'drag' || s.mode === 'edgeclick' || s.mode === 'tpan')) handleTap(s, e);
    else if (isTouch) lastTap = null;
    switch (s.mode) {
      case 'rpan':
        if (!s.moved) openContextMenu(s.target, e.clientX, e.clientY, s.p);
        break;
      case 'drag':
        Store.end();
        if (!s.moved && s.toggleOff && e.type === 'pointerup') {
          const sel = new Set(Store.sel.nodes);
          sel.delete(s.id);
          Store.select(sel, Store.sel.edges);
        } else if (!s.moved && s.clickedSel && Store.sel.nodes.size > 1 && !selectMode) Store.select([s.id], []);
        break;
      case 'resize':
        Store.end();
        break;
      case 'connect': finishConnect(s); break;
      case 'ehandle':
        if (s.which === 'mid') Store.end();
        else if (s.target) {
          const ed = Store.edge(s.id);
          if (ed) {
            Store.mutate(() => {
              if (s.which === 'start') { ed.from = s.target; ed.fromSide = s.targetSide || undefined; }
              else { ed.to = s.target; ed.toSide = s.targetSide || undefined; }
              delete ed.mid;
            });
          }
        }
        break;
      case 'marquee':
        Store.emit('selection');
        break;
    }
    requestRender();
  }

  function finishConnect(s) {
    const tab = Store.tab;
    const src = Store.node(s.from);
    if (!src) return;
    const z = view().zoom;
    let target = s.target ? Store.node(s.target) : null;
    let newNode = null;
    if (!target) {
      if (!s.moved || Math.hypot(s.cur.x - s.fixed.x, s.cur.y - s.fixed.y) * z < 40) return;
      // boşluğa bırakıldı: aynı türden yeni düğüm oluştur
      let type = src.type === 'class' ? 'class' : src.type === 'note' ? 'note' : 'process';
      if (src.type === 'frame' || src.type === 'text') type = 'process';
      newNode = Model.createNode(type, 0, 0, type === 'class' ? { name: $t('YeniSinif') } : null);
      const size = Geo.nodeSize(newNode);
      newNode.x = Math.round(sn(s.cur.x) - size.w / 2);
      newNode.y = Math.round(sn(s.cur.y) - size.h / 2);
      target = newNode;
    }
    const isNote = src.type === 'note' || target.type === 'note';
    let type = isNote ? 'link' : Model.defaultEdgeType(src);
    if (src.type === 'class' && target.type !== 'class' && !isNote) type = 'dependency';
    const extra = { fromSide: s.side };
    if (s.targetSide) extra.toSide = s.targetSide;
    if (isNote) extra.dash = true;
    if (src.type === 'decision') {
      const n = tab.edges.filter((e) => e.from === src.id).length;
      extra.label = n === 0 ? $t('Evet') : n === 1 ? $t('Hayır') : '';
    }
    const edge = Model.createEdge(src.id, target.id, type, extra);
    Store.mutate(() => {
      if (newNode) tab.nodes.push(newNode);
      tab.edges.push(edge);
    });
    if (newNode) {
      Store.select([newNode.id], []);
      renderNow();
      startInlineEdit(newNode.id);
    } else Store.select([], [edge.id]);
  }

  function onDblClick(e) {
    if (App.UI.topModal()) return;
    // dokunmatikte çift dokunuşu kendimiz algılıyoruz; tarayıcının ürettiği dblclick'i yok say
    if (!e.synthetic && Date.now() - lastTouchAt < 1000) return;
    const p = toWorld(e.clientX, e.clientY);
    const nodeEl = e.target.closest('[data-node]');
    const edgeEl = e.target.closest('[data-edge]');
    if (e.target.closest('[data-port]') || e.target.closest('[data-handle]')) return;
    if (nodeEl) {
      const n = Store.node(nodeEl.dataset.node);
      if (!n) return;
      let field = null;
      if (n.type === 'class') {
        const Lc = Geo.classLayout(n);
        const ry = p.y - n.y;
        field = !Lc.show || ry < Lc.headerH ? 'name' : (Lc.methY && ry >= Lc.methY ? 'methods' : 'attributes');
      }
      Store.select([n.id], []);
      startInlineEdit(n.id, field);
    } else if (edgeEl || e.target.closest('[data-ehandle]')) {
      const id = edgeEl ? edgeEl.dataset.edge : [...Store.sel.edges][0];
      if (id) { Store.select([], [id]); startEdgeLabelEdit(id); }
    } else if (Editor.onCanvasDblClick) Editor.onCanvasDblClick(p, e);
  }

  function onWheel(e) {
    e.preventDefault();
    if (inl) commitInline();
    const r = svg.getBoundingClientRect();
    // dokunmatik yüzey kaydırması (yatay bileşen) -> kaydır; fare tekerleği / pinch -> yakınlaştır
    if (!e.ctrlKey && e.deltaMode === 0 && Math.abs(e.deltaX) > 0.5 && !e.shiftKey) {
      const v = view();
      v.x -= e.deltaX; v.y -= e.deltaY;
      applyView();
      return;
    }
    if (e.shiftKey) { const v = view(); v.x -= e.deltaY || e.deltaX; applyView(); return; }
    const d = e.deltaMode === 1 ? e.deltaY * 33 : e.deltaY;
    zoomAt(Math.exp(-d * (e.ctrlKey ? 0.01 : 0.0015)), e.clientX - r.left, e.clientY - r.top);
  }

  function openContextMenu(target, cx, cy, p) {
    const nodeEl = target && target.closest && target.closest('[data-node]');
    const edgeEl = target && target.closest && target.closest('[data-edge]');
    let kind = 'canvas';
    if (nodeEl) {
      const id = nodeEl.dataset.node;
      if (!Store.sel.nodes.has(id)) Store.select([id], []);
      kind = 'node';
    } else if (edgeEl) {
      const id = edgeEl.dataset.edge;
      if (!Store.sel.edges.has(id)) Store.select([], [id]);
      kind = 'edge';
    }
    requestRender();
    if (Editor.onContextMenu) Editor.onContextMenu(kind, cx, cy, p);
  }

  /* ---------------- Satır içi düzenleme ---------------- */
  function placeInline(rect, opts) {
    const v = view(), z = v.zoom;
    const el = inlineEl;
    el.style.left = (v.x + rect.x * z) + 'px';
    el.style.top = (v.y + rect.y * z) + 'px';
    el.style.width = Math.max(rect.w * z, opts.minW || 0) + 'px';
    el.style.height = rect.h * z + 'px';
    el.style.fontSize = (opts.fontSize || 13) * z + 'px';
    el.style.lineHeight = ((opts.lineH || 17) * z) + 'px';
    el.style.fontFamily = opts.mono ? U.FONT_MONO : U.FONT_SANS;
    el.style.fontWeight = opts.bold ? '600' : '400';
    el.style.textAlign = opts.align || 'center';
    el.style.padding = (opts.padY != null ? opts.padY * z : 4) + 'px ' + (opts.padX != null ? opts.padX * z : 6) + 'px';
  }

  function showInline(rect, value, opts, onCommit) {
    if (inl) commitInline();
    inl = { onCommit, opts, original: value, rect };
    inlineEl.value = value;
    placeInline(rect, opts);
    inlineEl.classList.add('show');
    inlineEl.classList.toggle('code', !!opts.mono);
    autoGrow();
    inlineEl.focus();
    inlineEl.select();
  }

  function autoGrow() {
    if (!inl) return;
    const z = view().zoom;
    if (inl.opts.grow) {
      inlineEl.style.height = 'auto';
      inlineEl.style.height = Math.max(inl.rect.h * z, inlineEl.scrollHeight + 2) + 'px';
    }
  }

  function commitInline(cancel) {
    if (!inl) return;
    const cur = inl;
    inl = null;
    inlineEl.classList.remove('show');
    const val = inlineEl.value;
    inlineEl.blur();
    wrap.focus({ preventScroll: true });
    if (!cancel && val !== cur.original) cur.onCommit(val);
    requestRender();
  }

  function startInlineEdit(nodeId, field) {
    const n = Store.node(nodeId);
    if (!n) return;
    renderNow();
    const b = Geo.bounds(n);
    if (n.type === 'class') {
      const Lc = Geo.classLayout(n);
      field = field || 'name';
      if (field === 'methods' && !Lc.methY) field = 'attributes';
      if (field === 'name') {
        showInline({ x: b.x, y: b.y + (Lc.stereo ? Geo.CL.stereoH : 0) + 4, w: b.w, h: Geo.CL.nameH + 12 }, n.name, { fontSize: 14, bold: true, lineH: 18, single: true, padY: 4 },
          (v) => Store.mutate(() => { n.name = v.replace(/\n/g, ' ').trim() || n.name; }));
      } else {
        const y = field === 'attributes' ? Lc.attrY : Lc.methY;
        const hgt = field === 'attributes' ? Lc.attrH : Lc.methH;
        showInline({ x: b.x, y: b.y + y, w: b.w, h: Math.max(hgt, 40) }, n[field], { mono: true, fontSize: 12, lineH: 18, align: 'left', grow: true, minW: 260, padX: Geo.CL.padX, padY: Geo.CL.compPad, members: true },
          (v) => Store.mutate(() => { n[field] = v.split('\n').map((l) => l.replace(/\s+$/, '')).filter((l) => l.trim()).join('\n'); }));
      }
      return;
    }
    const isNote = n.type === 'note';
    const pad = n.type === 'decision' ? b.w * 0.18 : 8;
    showInline({ x: b.x + pad, y: b.y, w: b.w - pad * 2, h: b.h }, n.text || '', { align: isNote ? 'left' : 'center', grow: true, padY: isNote ? 12 : Math.max(4, (b.h - 17 * Math.max(1, Geo.flowTextLines(n).length)) / 2), padX: isNote ? 4 : 2, bold: n.type === 'terminator' || n.type === 'frame' },
      (v) => Store.mutate(() => {
        n.text = v;
        if (n.type !== 'frame' && n.type !== 'connector') n.h = Math.max(n.h, Geo.requiredHeight(n));
      }));
  }

  function startEdgeLabelEdit(edgeId) {
    renderNow();
    const e = Store.edge(edgeId), g = geom.get(edgeId);
    if (!e || !g) return;
    const w = 160, h = 28;
    showInline({ x: g.labelPos.x - w / 2, y: g.labelPos.y - h / 2, w, h }, e.label || '', { fontSize: 12, lineH: 15, grow: true, padY: 5 },
      (v) => Store.mutate(() => { e.label = v.trim(); }));
  }

  function onInlineKey(e) {
    if (!inl) return;
    e.stopPropagation();
    if (e.key === 'Escape') { e.preventDefault(); commitInline(true); return; }
    if (e.key === 'Enter') {
      if (inl.opts.members) { if (e.ctrlKey || e.metaKey) { e.preventDefault(); commitInline(); } return; }
      if (!e.shiftKey) { e.preventDefault(); commitInline(); }
    }
    if (e.key === 'Tab') { e.preventDefault(); commitInline(); }
  }

  /* ---------------- Komutlar ---------------- */
  function selectAll() { Store.select(Store.tab.nodes.map((n) => n.id), Store.tab.edges.map((e) => e.id)); requestRender(); }

  function fragmentFromSelection() {
    const tab = Store.tab;
    const ids = new Set(Store.sel.nodes);
    if (!ids.size) return null;
    const nodes = tab.nodes.filter((n) => ids.has(n.id));
    const edges = tab.edges.filter((e) => ids.has(e.from) && ids.has(e.to));
    return U.clone({ nodes, edges });
  }

  function copy() {
    const frag = fragmentFromSelection();
    if (!frag) return false;
    clipboard = frag;
    pasteN = 0;
    try { localStorage.setItem('umlstudio.clipboard', JSON.stringify(frag)); } catch (e) { /* yok say */ }
    return true;
  }
  function cut() { if (copy()) Store.deleteSelection(); }
  function paste() {
    let frag = clipboard;
    if (!frag) { try { frag = JSON.parse(localStorage.getItem('umlstudio.clipboard') || 'null'); } catch (e) { frag = null; } }
    if (!frag || !frag.nodes || !frag.nodes.length) return;
    pasteN++;
    insertFragment(U.clone(frag), { offset: 20 * pasteN });
  }
  function duplicate() {
    const frag = fragmentFromSelection();
    if (frag) insertFragment(frag, { offset: 20 });
  }

  /* Bir parçayı ekle. opts.at: dünya noktası (merkez), opts.offset: kaydırma */
  function insertFragment(frag, opts) {
    opts = opts || {};
    const nodes = frag.nodes;
    for (const n of nodes) {
      if (n.type !== 'class' && n.type !== 'frame' && n.type !== 'connector' && n.text) {
        const need = Geo.requiredHeight(n);
        if (need > n.h) { n.y -= Math.round((need - n.h) / 2); n.h = need; }
      }
    }
    if (frag.layout) App.Layout.layered(nodes, frag.edges || [], { reverse: new Set(['inheritance', 'realization']) });
    let dx = 0, dy = 0;
    if (opts.at) {
      const b = Geo.unionBounds(nodes.map(Geo.bounds));
      dx = sn(opts.at.x - b.w / 2) - b.x;
      dy = sn(opts.at.y - b.h / 2) - b.y;
      // tek düğümde merkezi ızgaraya oturt
      if (nodes.length === 1) { dx = sn(opts.at.x) - b.w / 2 - b.x; dy = sn(opts.at.y) - b.h / 2 - b.y; }
    } else if (opts.offset) { dx = dy = opts.offset; }
    for (const n of nodes) { n.x = Math.round(n.x + dx); n.y = Math.round(n.y + dy); }
    let res;
    Store.mutate(() => { res = Store.insertFragment({ nodes, edges: frag.edges || [], offset: { x: dx, y: dy } }); });
    Store.select(res.nodes.map((n) => n.id), []);
    requestRender();
    return res;
  }

  function insertItem(item, at) {
    const frag = item.build();
    if (item.section === 'patterns') frag.layout = true;
    const res = insertFragment(frag, { at: at || viewCenterWorld() });
    // görünür değilse görünüme kaydır
    const b = Geo.unionBounds(res.nodes.map(Geo.bounds));
    const r = svg.getBoundingClientRect(), v = view();
    const sx = v.x + b.x * v.zoom, sy = v.y + b.y * v.zoom;
    if (sx < 0 || sy < 0 || sx + b.w * v.zoom > r.width || sy + b.h * v.zoom > r.height) {
      if (b.w * v.zoom > r.width || b.h * v.zoom > r.height) fitView(new Set(res.nodes.map((n) => n.id)));
    }
    return res;
  }

  function nudge(dx, dy) {
    if (!Store.sel.nodes.size) return;
    Store.mutate(() => { for (const n of Store.selectedNodes()) { n.x += dx; n.y += dy; } });
    requestRender();
  }

  function align(mode) {
    const nodes = Store.selectedNodes();
    if (nodes.length < 2) return;
    const bs = nodes.map(Geo.bounds);
    const u = Geo.unionBounds(bs);
    Store.mutate(() => {
      nodes.forEach((n, i) => {
        const b = bs[i];
        switch (mode) {
          case 'left': n.x = u.x; break;
          case 'center': n.x = Math.round(u.x + u.w / 2 - b.w / 2); break;
          case 'right': n.x = u.x + u.w - b.w; break;
          case 'top': n.y = u.y; break;
          case 'middle': n.y = Math.round(u.y + u.h / 2 - b.h / 2); break;
          case 'bottom': n.y = u.y + u.h - b.h; break;
        }
      });
    });
    requestRender();
  }

  function distribute(axis) {
    const nodes = Store.selectedNodes();
    if (nodes.length < 3) return;
    const items = nodes.map((n) => ({ n, b: Geo.bounds(n) }));
    const H = axis === 'h';
    items.sort((a, b) => (H ? a.b.x - b.b.x : a.b.y - b.b.y));
    const first = items[0].b, last = items[items.length - 1].b;
    const span = H ? last.x + last.w - first.x : last.y + last.h - first.y;
    const total = items.reduce((s, it) => s + (H ? it.b.w : it.b.h), 0);
    const gap = (span - total) / (items.length - 1);
    Store.mutate(() => {
      let pos = H ? first.x : first.y;
      for (const it of items) {
        if (H) it.n.x = Math.round(pos); else it.n.y = Math.round(pos);
        pos += (H ? it.b.w : it.b.h) + gap;
      }
    });
    requestRender();
  }

  function reorder(front) {
    const ids = Store.sel.nodes;
    if (!ids.size) return;
    Store.mutate(() => {
      const tab = Store.tab;
      const sel = tab.nodes.filter((n) => ids.has(n.id));
      const rest = tab.nodes.filter((n) => !ids.has(n.id));
      tab.nodes = front ? rest.concat(sel) : sel.concat(rest);
    });
    requestRender();
  }

  function autoLayout(direction) {
    const tab = Store.tab;
    const useSel = Store.sel.nodes.size >= 2;
    const nodes = useSel ? Store.selectedNodes() : tab.nodes;
    if (!nodes.length) return;
    const ids = new Set(nodes.map((n) => n.id));
    const edges = tab.edges.filter((e) => ids.has(e.from) && ids.has(e.to));
    const before = Geo.unionBounds(nodes.filter((n) => n.type !== 'frame').map(Geo.bounds));
    Store.mutate(() => {
      App.Layout.layered(nodes, edges, { direction, reverse: new Set(['inheritance', 'realization']), originX: before ? sn(before.x) : 0, originY: before ? sn(before.y) : 0 });
      edges.forEach((e) => { delete e.mid; });
    });
    renderNow();
    fitView(useSel ? ids : null);
  }

  function setSetting(k, v) { settings[k] = v; saveSettings(); applyView(); Store.emit('settings'); }

  /* ---------------- Başlatma ---------------- */
  function init() {
    wrap = document.getElementById('canvasWrap');
    svg = document.getElementById('canvas');
    vp = svg.querySelector('#viewport');
    L.frames = svg.querySelector('#layer-frames');
    L.edges = svg.querySelector('#layer-edges');
    L.nodes = svg.querySelector('#layer-nodes');
    L.labels = svg.querySelector('#layer-labels');
    L.overlay = svg.querySelector('#layer-overlay');
    svg.setAttribute('font-family', U.FONT_SANS.replace(/"/g, "'"));
    inlineEl = document.getElementById('inlineEditor');

    svg.addEventListener('pointerdown', onDown);
    svg.addEventListener('pointermove', onMove);
    svg.addEventListener('pointerup', onUp);
    svg.addEventListener('pointercancel', onUp);
    svg.addEventListener('pointerleave', () => { if (!st && hover) { hover = null; renderOverlay(); } });
    svg.addEventListener('dblclick', onDblClick);
    svg.addEventListener('wheel', onWheel, { passive: false });
    svg.addEventListener('contextmenu', (e) => e.preventDefault());
    inlineEl.addEventListener('keydown', onInlineKey);
    inlineEl.addEventListener('input', autoGrow);
    inlineEl.addEventListener('blur', () => { setTimeout(() => { if (inl && document.activeElement !== inlineEl) commitInline(); }, 0); });

    window.addEventListener('keydown', (e) => {
      if (e.key === ' ' && !isTyping(e.target) && !App.UI.topModal()) { if (!spaceDown) { spaceDown = true; wrap.classList.add('space'); } e.preventDefault(); }
    });
    window.addEventListener('keyup', (e) => { if (e.key === ' ') { spaceDown = false; wrap.classList.remove('space'); } });
    window.addEventListener('blur', () => { spaceDown = false; wrap.classList.remove('space'); });
    window.addEventListener('resize', () => renderOverlay());

    // paletten sürükle-bırak ve dosya bırakma
    wrap.addEventListener('dragover', (e) => {
      const types = Array.from(e.dataTransfer.types || []);
      if (types.includes('application/x-umlstudio') || types.includes('Files')) { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; wrap.classList.add('drop'); }
    });
    wrap.addEventListener('dragleave', (e) => { if (e.target === wrap || !wrap.contains(e.relatedTarget)) wrap.classList.remove('drop'); });
    wrap.addEventListener('drop', (e) => {
      wrap.classList.remove('drop');
      const id = e.dataTransfer.getData('application/x-umlstudio');
      if (id) {
        e.preventDefault();
        const item = App.Templates.byId(id);
        if (item) insertItem(item, toWorld(e.clientX, e.clientY));
        return;
      }
      if (e.dataTransfer.files && e.dataTransfer.files.length) {
        e.preventDefault();
        if (Editor.onFilesDropped) Editor.onFilesDropped(Array.from(e.dataTransfer.files), e.dataTransfer.items);
      }
    });

    Store.on('change', () => requestRender());
    Store.on('selection', () => requestRender());
    Store.on('tab', () => { hover = null; if (inl) commitInline(true); applyView(); renderNow(); });
    App.Theme && Store.on('theme', () => renderNow());
  }

  function isTyping(t) {
    if (!t) return false;
    const tag = t.tagName;
    return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || t.isContentEditable;
  }

  const Editor = App.Editor = {
    init, renderNow, requestRender, renderOverlay, applyView, fitView, zoomAt, setZoom, viewCenterWorld, toWorld,
    startInlineEdit, startEdgeLabelEdit, commitInline, get editing() { return !!inl; },
    selectAll, copy, cut, paste, duplicate, insertItem, insertFragment, nudge, align, distribute, reorder, autoLayout,
    settings, setSetting, isTyping, GRID, SNAP,
    get touchMode() { return touchMode; },
    get selectMode() { return selectMode; },
    setSelectMode(v) { selectMode = !!v; wrap.classList.toggle('select-mode', selectMode); Store.emit('settings'); },
    get geom() { return geom; },
    onContextMenu: null, onCanvasDblClick: null, onFilesDropped: null,
  };
})(window);
