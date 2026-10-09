'use strict';
/* Geometri: düğüm boyutları, sınıf yerleşimi, bağlantı noktaları ve kenar rotaları */
(function (global) {
  const App = (global.App = global.App || {});
  const U = App.U, UML = App.UML;

  const CL = {
    padX: 12, headTop: 8, headBot: 8, stereoH: 15, nameH: 19, compPad: 6, lineH: 18, emptyComp: 10, minW: 150,
    nameFont: (abs) => U.font(14, { bold: true, italic: abs }),
    stereoFont: U.font(11, { italic: true }),
    memberFont: (st) => U.font(12, { mono: true, italic: st && st.abstract }),
  };
  const FLOW_FONT = U.font(13);
  const FLOW_LINE = 17;

  const layoutCache = new WeakMap();

  function classLayout(n) {
    const key = [n.name, n.stereotype, n.abstract, n.attributes, n.methods, n.showMembers, n.w].join('\u0001');
    const c = layoutCache.get(n);
    if (c && c.key === key) return c.val;
    const stereo = UML.stereoLabel(n);
    const show = n.showMembers !== false;
    const attrs = show ? UML.splitLines(n.attributes).map(UML.memberDisplay) : [];
    const meths = show ? UML.splitLines(n.methods).map(UML.memberDisplay) : [];
    const isEnum = String(n.stereotype || '').toLowerCase() === 'enum';
    let w = U.measure(n.name || ' ', CL.nameFont(!!n.abstract));
    if (stereo) w = Math.max(w, U.measure(stereo, CL.stereoFont));
    const memW = (m) => U.measure((m.vis ? m.vis + ' ' : '') + m.text, CL.memberFont(m));
    for (const m of attrs) w = Math.max(w, memW(m));
    for (const m of meths) w = Math.max(w, memW(m));
    const contentW = Math.ceil(w + CL.padX * 2);
    const width = Math.max(contentW, CL.minW, n.w || 0);
    const headerH = CL.headTop + (stereo ? CL.stereoH : 0) + CL.nameH + CL.headBot;
    const compH = (k) => (k ? k * CL.lineH + CL.compPad * 2 : CL.emptyComp);
    let h = headerH;
    let attrY = 0, methY = 0, attrH = 0, methH = 0;
    if (show) {
      attrY = h; attrH = compH(attrs.length); h += attrH;
      // enum'larda metot bölmesi boşsa gösterme
      if (!(isEnum && !meths.length)) { methY = h; methH = compH(meths.length); h += methH; }
    }
    const val = { w: width, h: Math.round(h), contentW, headerH, stereo, attrs, meths, attrY, attrH, methY, methH, show, isEnum };
    layoutCache.set(n, { key, val });
    return val;
  }

  function nodeSize(n) {
    if (n.type === 'class') { const l = classLayout(n); return { w: l.w, h: l.h }; }
    if (App.Dialogue && App.Dialogue.isDlg(n)) { const l = App.Dialogue.layout(n); return { w: l.w, h: l.h }; }
    return { w: n.w, h: n.h };
  }
  function bounds(n) { const s = nodeSize(n); return { x: n.x, y: n.y, w: s.w, h: s.h }; }
  const center = (b) => ({ x: b.x + b.w / 2, y: b.y + b.h / 2 });

  function unionBounds(list) {
    if (!list.length) return null;
    let x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity;
    for (const b of list) { x1 = Math.min(x1, b.x); y1 = Math.min(y1, b.y); x2 = Math.max(x2, b.x + b.w); y2 = Math.max(y2, b.y + b.h); }
    return { x: x1, y: y1, w: x2 - x1, h: y2 - y1 };
  }

  /* Akış düğümü metni için kullanılabilir genişlik */
  function textWidthFor(n) {
    switch (n.type) {
      case 'decision': return n.w * 0.62;
      case 'io': case 'preparation': return n.w - 44;
      case 'subprocess': return n.w - 30;
      case 'terminator': return n.w - Math.min(n.h, n.w) * 0.5;
      case 'note': return n.w - 24;
      case 'connector': return n.w - 4;
      default: return n.w - 16;
    }
  }
  function flowTextLines(n) { return U.wrapText(n.text || '', FLOW_FONT, Math.max(20, textWidthFor(n))); }
  function requiredHeight(n) {
    const lines = flowTextLines(n).length;
    const extra = n.type === 'decision' ? 2.1 : 1;
    return Math.ceil((lines * FLOW_LINE) * extra + (n.type === 'decision' ? 20 : 18));
  }

  const SIDES = ['top', 'right', 'bottom', 'left'];
  const DIR = { top: { x: 0, y: -1 }, right: { x: 1, y: 0 }, bottom: { x: 0, y: 1 }, left: { x: -1, y: 0 } };

  /* Bu kenarda bağlantılar yayılabilir mi (yoksa hep orta nokta) */
  function sideSpreads(n, side) {
    switch (n.type) {
      case 'decision': case 'connector': return false;
      case 'terminator': case 'preparation': case 'io': return side === 'top' || side === 'bottom';
      default: return true;
    }
  }

  function anchor(n, b, side, t) {
    if (!sideSpreads(n, side)) t = 0.5;
    const d = DIR[side];
    let x, y;
    if (side === 'top' || side === 'bottom') {
      let span = b.w, off = 0;
      if (n.type === 'io' || n.type === 'preparation') { off = Math.min(18, b.w * 0.2); span = b.w - off * 2; }
      if (n.type === 'terminator') { off = Math.min(b.h, b.w) / 2; span = b.w - off * 2; }
      x = b.x + off + span * t;
      y = side === 'top' ? b.y : b.y + b.h;
      if (side === 'bottom' && n.type === 'document') {
        const a = Math.min(10, b.h * 0.15);
        y = b.y + b.h - a + (t < 0.5 ? a * 0.5 * Math.sin(Math.PI * t * 2) : -a * 0.5 * Math.sin(Math.PI * (t - 0.5) * 2));
      }
    } else {
      y = b.y + b.h * t;
      x = side === 'left' ? b.x : b.x + b.w;
      if (n.type === 'io') {
        const sk = Math.min(18, b.w * 0.2);
        x += side === 'left' ? sk / 2 : -sk / 2;
      }
    }
    return { x, y, dx: d.x, dy: d.y, side };
  }

  function autoSides(ba, bb) {
    const ca = center(ba), cb = center(bb);
    const dx = cb.x - ca.x, dy = cb.y - ca.y;
    if (Math.abs(dx) / (ba.w + bb.w || 1) > Math.abs(dy) / (ba.h + bb.h || 1)) {
      return dx >= 0 ? ['right', 'left'] : ['left', 'right'];
    }
    return dy >= 0 ? ['bottom', 'top'] : ['top', 'bottom'];
  }

  /* Bir noktaya en yakın kenar */
  function nearestSide(b, p) {
    const d = { top: Math.abs(p.y - b.y), bottom: Math.abs(p.y - (b.y + b.h)), left: Math.abs(p.x - b.x), right: Math.abs(p.x - (b.x + b.w)) };
    return SIDES.reduce((a, s) => (d[s] < d[a] ? s : a), 'top');
  }
  function sideFacing(b, p) {
    const c = center(b);
    const dx = p.x - c.x, dy = p.y - c.y;
    if (Math.abs(dx) / (b.w || 1) > Math.abs(dy) / (b.h || 1)) return dx >= 0 ? 'right' : 'left';
    return dy >= 0 ? 'bottom' : 'top';
  }

  function simplify(pts) {
    const out = [];
    for (const p of pts) {
      const last = out[out.length - 1];
      if (last && Math.abs(last.x - p.x) < 0.5 && Math.abs(last.y - p.y) < 0.5) continue;
      out.push({ x: p.x, y: p.y });
    }
    // eşdoğrusal noktaları kaldır
    let changed = true;
    while (changed && out.length > 2) {
      changed = false;
      for (let i = 1; i < out.length - 1; i++) {
        const a = out[i - 1], b = out[i], c = out[i + 1];
        const cross = (b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x);
        const dot = (b.x - a.x) * (c.x - b.x) + (b.y - a.y) * (c.y - b.y);
        if (Math.abs(cross) < 0.5 && dot >= 0) { out.splice(i, 1); changed = true; break; }
      }
    }
    return out;
  }

  const STUB = 22;
  function routeOrth(s, t, mid) {
    const p1 = { x: s.x + s.dx * STUB, y: s.y + s.dy * STUB };
    const p2 = { x: t.x + t.dx * STUB, y: t.y + t.dy * STUB };
    const pts = [s, p1];
    const sH = s.dx !== 0, tH = t.dx !== 0;
    if (sH && tH) {
      if (s.dx === -t.dx) {
        if ((p2.x - p1.x) * s.dx >= 0) {
          const mx = mid ? mid.x : (p1.x + p2.x) / 2;
          pts.push({ x: mx, y: p1.y }, { x: mx, y: p2.y });
        } else {
          const my = mid ? mid.y : (p1.y + p2.y) / 2;
          pts.push({ x: p1.x, y: my }, { x: p2.x, y: my });
        }
      } else {
        const x = mid ? mid.x : (s.dx > 0 ? Math.max(p1.x, p2.x) : Math.min(p1.x, p2.x));
        pts.push({ x, y: p1.y }, { x, y: p2.y });
      }
    } else if (!sH && !tH) {
      if (s.dy === -t.dy) {
        if ((p2.y - p1.y) * s.dy >= 0) {
          const my = mid ? mid.y : (p1.y + p2.y) / 2;
          pts.push({ x: p1.x, y: my }, { x: p2.x, y: my });
        } else {
          const mx = mid ? mid.x : (p1.x + p2.x) / 2;
          pts.push({ x: mx, y: p1.y }, { x: mx, y: p2.y });
        }
      } else {
        const y = mid ? mid.y : (s.dy > 0 ? Math.max(p1.y, p2.y) : Math.min(p1.y, p2.y));
        pts.push({ x: p1.x, y }, { x: p2.x, y });
      }
    } else if (sH) {
      const corner = { x: p2.x, y: p1.y };
      if ((corner.x - p1.x) * s.dx >= 0 && (corner.y - p2.y) * t.dy >= 0) pts.push(corner);
      else pts.push({ x: p1.x, y: p2.y });
    } else {
      const corner = { x: p1.x, y: p2.y };
      if ((corner.y - p1.y) * s.dy >= 0 && (corner.x - p2.x) * t.dx >= 0) pts.push(corner);
      else pts.push({ x: p2.x, y: p1.y });
    }
    pts.push(p2, { x: t.x, y: t.y });
    return simplify(pts);
  }

  /* Bükülme noktalarından geçen dik rota: her nokta bir köşe olur
     (noktaya hangi eksende gelindiyse diğer eksende ayrılır) */
  function routeOrthVia(s, wps, t) {
    const p1 = { x: s.x + s.dx * STUB, y: s.y + s.dy * STUB };
    const p2 = { x: t.x + t.dx * STUB, y: t.y + t.dy * STUB };
    const pts = [s, p1];
    let cur = p1, axis = s.dx !== 0 ? 'h' : 'v';
    // son sıfır olmayan parçanın ekseni ve yönü
    const lastMove = (a, c, b) => {
      for (const [u, v] of [[c, b], [a, c]]) {
        if (Math.abs(v.x - u.x) > 0.5) return { axis: 'h', sign: Math.sign(v.x - u.x) };
        if (Math.abs(v.y - u.y) > 0.5) return { axis: 'v', sign: Math.sign(v.y - u.y) };
      }
      return null;
    };
    wps.forEach((w, i) => {
      let hFirst;
      if (i === 0) {
        // çıkış yönünde devam et; geri dönmek gerekiyorsa çıkışta dön
        const dir = s.dx || s.dy;
        const d = axis === 'h' ? w.x - cur.x : w.y - cur.y;
        hFirst = (axis === 'h') === (d * dir >= 0);
      } else hFirst = axis === 'v';
      const c = hFirst ? { x: w.x, y: cur.y } : { x: cur.x, y: w.y };
      pts.push(c, { x: w.x, y: w.y });
      const m = lastMove(cur, c, w);
      if (m) axis = m.axis;
      cur = w;
    });
    // son nokta -> hedef çıkıntısı: tercihen köşe yap, hedefe ters yönden girmesin
    const tAxis = t.dx !== 0 ? 'h' : 'v', tSign = -(t.dx || t.dy);
    const ok = (c) => { const m = lastMove(cur, c, p2); return !m || m.axis !== tAxis || m.sign === tSign; };
    const ch = { x: p2.x, y: cur.y }, cv = { x: cur.x, y: p2.y };
    const pref = axis === 'v' ? ch : cv, alt = axis === 'v' ? cv : ch;
    pts.push(ok(pref) || !ok(alt) ? pref : alt, p2, { x: t.x, y: t.y });
    return simplify(pts);
  }

  /* Uçlardan ve bükülme noktalarından geçen eğri (Catmull-Rom -> kübik Bezier parçaları) */
  function splineVia(s, wps, t) {
    const P = [s, ...wps, t];
    const n = P.length;
    const tan = P.map((p, i) => {
      if (i === 0 || i === n - 1) {
        const q = P[i === 0 ? 1 : n - 2];
        const k = Math.max(30, Math.min(160, Math.hypot(q.x - p.x, q.y - p.y) * 0.45)) * 3;
        return i === 0 ? { x: s.dx * k, y: s.dy * k } : { x: -t.dx * k, y: -t.dy * k };
      }
      return { x: (P[i + 1].x - P[i - 1].x) / 2, y: (P[i + 1].y - P[i - 1].y) / 2 };
    });
    const segs = [];
    for (let i = 0; i < n - 1; i++) {
      segs.push({
        a: P[i], b: P[i + 1],
        c1: { x: P[i].x + tan[i].x / 3, y: P[i].y + tan[i].y / 3 },
        c2: { x: P[i + 1].x - tan[i + 1].x / 3, y: P[i + 1].y - tan[i + 1].y / 3 },
      });
    }
    return segs;
  }
  function bezierAt(sg, k) {
    const m = 1 - k;
    return {
      x: m * m * m * sg.a.x + 3 * m * m * k * sg.c1.x + 3 * m * k * k * sg.c2.x + k * k * k * sg.b.x,
      y: m * m * m * sg.a.y + 3 * m * m * k * sg.c1.y + 3 * m * k * k * sg.c2.y + k * k * k * sg.b.y,
    };
  }

  /* Bir noktanın çoklu çizgi üzerindeki en yakın izdüşümü (fromSeg: aramaya bu parçadan başla) */
  function projectOnPoly(pts, p, fromSeg) {
    let best = null, acc = 0;
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1], b = pts[i];
      const L = Math.hypot(b.x - a.x, b.y - a.y);
      if (i >= (fromSeg || 1)) {
        const k = L ? Math.max(0, Math.min(1, ((p.x - a.x) * (b.x - a.x) + (p.y - a.y) * (b.y - a.y)) / (L * L))) : 0;
        const q = { x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k };
        const d = Math.hypot(p.x - q.x, p.y - q.y);
        if (!best || d < best.d - 1e-6) best = { x: q.x, y: q.y, d, along: acc + L * k, seg: i };
      }
      acc += L;
    }
    return best;
  }
  /* Çizgide p noktasına eklenecek bükülme noktasının points dizisindeki sırası */
  function bendInsertIndex(pts, wps, p) {
    const at = projectOnPoly(pts, p).along;
    let seg = 1, i = 0;
    for (; i < wps.length; i++) {
      const pr = projectOnPoly(pts, wps[i], seg);
      if (!pr || pr.along >= at) break;
      seg = pr.seg;
    }
    return i;
  }

  function polyLength(pts) {
    let L = 0;
    for (let i = 1; i < pts.length; i++) L += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
    return L;
  }
  function pointAt(pts, dist) {
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1], b = pts[i];
      const L = Math.hypot(b.x - a.x, b.y - a.y);
      if (dist <= L || i === pts.length - 1) {
        const k = L ? Math.min(1, dist / L) : 0;
        return { x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k, seg: i };
      }
      dist -= L;
    }
    return { x: pts[0].x, y: pts[0].y, seg: 1 };
  }
  /* Çoklu çizginin ortasındaki en uzun parçanın ortası: etiket ve sürükleme tutamacı için */
  function midPoint(pts) {
    return pointAt(pts, polyLength(pts) / 2);
  }

  function roundedPath(pts, r) {
    if (pts.length < 2) return '';
    let d = `M${f(pts[0].x)},${f(pts[0].y)}`;
    for (let i = 1; i < pts.length - 1; i++) {
      const a = pts[i - 1], b = pts[i], c = pts[i + 1];
      const l1 = Math.hypot(b.x - a.x, b.y - a.y), l2 = Math.hypot(c.x - b.x, c.y - b.y);
      const rr = Math.min(r, l1 / 2, l2 / 2);
      if (rr < 1) { d += ` L${f(b.x)},${f(b.y)}`; continue; }
      const p = { x: b.x - ((b.x - a.x) / l1) * rr, y: b.y - ((b.y - a.y) / l1) * rr };
      const q = { x: b.x + ((c.x - b.x) / l2) * rr, y: b.y + ((c.y - b.y) / l2) * rr };
      d += ` L${f(p.x)},${f(p.y)} Q${f(b.x)},${f(b.y)} ${f(q.x)},${f(q.y)}`;
    }
    const last = pts[pts.length - 1];
    d += ` L${f(last.x)},${f(last.y)}`;
    return d;
  }
  function f(v) { return Math.round(v * 10) / 10; }

  function trim(pts, startLen, endLen) {
    const p = pts.map((q) => ({ x: q.x, y: q.y }));
    if (startLen && p.length > 1) {
      const a = p[0], b = p[1], L = Math.hypot(b.x - a.x, b.y - a.y);
      if (L > startLen) { a.x += ((b.x - a.x) / L) * startLen; a.y += ((b.y - a.y) / L) * startLen; }
    }
    if (endLen && p.length > 1) {
      const a = p[p.length - 1], b = p[p.length - 2], L = Math.hypot(b.x - a.x, b.y - a.y);
      if (L > endLen) { a.x += ((b.x - a.x) / L) * endLen; a.y += ((b.y - a.y) / L) * endLen; }
    }
    return p;
  }

  const DECO_LEN = { triangle: 13, diamond: 17, diamondFilled: 17, filled: 9, open: 0 };

  function unit(a, b) {
    const L = Math.hypot(b.x - a.x, b.y - a.y) || 1;
    return { x: (b.x - a.x) / L, y: (b.y - a.y) / L };
  }

  /* Sekmedeki tüm kenarlar için geometri hesapla */
  function computeEdges(tab, opts) {
    opts = opts || {};
    const nodeMap = new Map(tab.nodes.map((n) => [n.id, n]));
    const bMap = new Map();
    const getB = (n) => { let b = bMap.get(n.id); if (!b) { b = bounds(n); bMap.set(n.id, b); } return b; };
    const items = [];
    for (const e of tab.edges) {
      const a = nodeMap.get(e.from), b = nodeMap.get(e.to);
      if (!a || !b) continue;
      if (opts.only && !opts.only(e)) continue;
      const ba = getB(a), bb = getB(b);
      if (a === b) { items.push({ e, a, b, ba, bb, self: true }); continue; }
      let [fs, ts] = autoSides(ba, bb);
      if (e.fromSide) fs = e.fromSide;
      if (e.toSide) ts = e.toSide;
      if (e.fromSide && !e.toSide) ts = sideFacing(bb, center(ba));
      if (!e.fromSide && e.toSide) fs = sideFacing(ba, center(bb));
      items.push({ e, a, b, ba, bb, fs, ts });
    }
    // aynı kenardaki bağlantıları yay
    const groups = new Map();
    const addG = (node, side, item, end, other) => {
      const k = node.id + ':' + side;
      if (!groups.has(k)) groups.set(k, []);
      groups.get(k).push({ item, end, other });
    };
    for (const it of items) {
      if (it.self) continue;
      addG(it.a, it.fs, it, 'from', center(it.bb));
      addG(it.b, it.ts, it, 'to', center(it.ba));
    }
    for (const [k, list] of groups) {
      const side = k.slice(k.lastIndexOf(':') + 1);
      const horiz = side === 'top' || side === 'bottom';
      list.sort((p, q) => (horiz ? p.other.x - q.other.x : p.other.y - q.other.y) || (p.item.e.id < q.item.e.id ? -1 : 1));
      list.forEach((g, i) => { g.item[g.end === 'from' ? 'ft' : 'tt'] = (i + 1) / (list.length + 1); });
    }
    const geom = new Map();
    for (const it of items) {
      const e = it.e;
      const meta = UML.EDGE_TYPES[e.type] || UML.EDGE_TYPES.association;
      const routing = e.routing || tab.routing || 'orthogonal';
      let pts, d, s, t, startDir, endDir, labelPos, curve = null;
      if (it.self) {
        const b = it.ba;
        const y0 = b.y + Math.min(b.h * 0.35, 24), x0 = b.x + b.w;
        const xt = b.x + b.w - Math.min(b.w * 0.3, 40);
        pts = [{ x: x0, y: y0 }, { x: x0 + 30, y: y0 }, { x: x0 + 30, y: b.y - 30 }, { x: xt, y: b.y - 30 }, { x: xt, y: b.y }];
        s = { x: x0, y: y0, dx: 1, dy: 0 }; t = { x: xt, y: b.y, dx: 0, dy: -1 };
      } else {
        s = anchor(it.a, it.ba, it.fs, it.ft == null ? 0.5 : it.ft);
        t = anchor(it.b, it.bb, it.ts, it.tt == null ? 0.5 : it.tt);
        // bükülme noktaları varsa orta tutamaç (mid) yok sayılır
        const wps = Array.isArray(e.points) && e.points.length ? e.points : null;
        if (routing === 'straight') pts = wps ? [s, ...wps, t] : e.mid ? [s, e.mid, t] : [s, t];
        else if (routing === 'curved') {
          if (wps) curve = splineVia(s, wps, t);
          else {
            const dist = Math.hypot(t.x - s.x, t.y - s.y);
            const k = Math.max(30, Math.min(160, dist * 0.45));
            curve = [{ a: s, c1: { x: s.x + s.dx * k, y: s.y + s.dy * k }, c2: { x: t.x + t.dx * k, y: t.y + t.dy * k }, b: t }];
          }
          pts = [s, t];
        } else pts = wps ? routeOrthVia(s, wps, t) : routeOrth(s, t, e.mid);
      }
      const startDeco = meta.start || null, endDeco = meta.end || null;
      if (curve) {
        d = `M${f(s.x)},${f(s.y)}` + curve.map((sg) => ` C${f(sg.c1.x)},${f(sg.c1.y)} ${f(sg.c2.x)},${f(sg.c2.y)} ${f(sg.b.x)},${f(sg.b.y)}`).join('');
        startDir = unit(s, curve[0].c1); // yoldan uzağa
        endDir = unit(curve[curve.length - 1].c2, t);
        if (curve.length === 1) {
          labelPos = bezierAt(curve[0], 0.5);
          pts = [s, bezierAt(curve[0], 0.25), labelPos, bezierAt(curve[0], 0.75), t];
        } else {
          // bükülme noktaları örnekler arasında tam olarak yer alır
          pts = [s];
          for (const sg of curve) for (let i = 1; i <= 8; i++) pts.push(i === 8 ? { x: sg.b.x, y: sg.b.y } : bezierAt(sg, i / 8));
          labelPos = midPoint(pts);
        }
      } else {
        startDir = unit(pts[0], pts[1]);
        endDir = unit(pts[pts.length - 2], pts[pts.length - 1]);
        const tp = trim(pts, DECO_LEN[startDeco] || 0, DECO_LEN[endDeco] || 0);
        d = routing === 'straight' ? tp.map((p, i) => (i ? 'L' : 'M') + f(p.x) + ',' + f(p.y)).join(' ') : roundedPath(tp, 8);
        labelPos = midPoint(pts);
      }
      geom.set(e.id, {
        id: e.id, pts, d, routing, start: { x: s.x, y: s.y }, end: { x: t.x, y: t.y },
        startDir, endDir, startDeco, endDeco, dash: e.dash != null ? !!e.dash : !!meta.dash,
        labelPos, fromSide: it.fs, toSide: it.ts, curve,
      });
    }
    return geom;
  }

  /* Bir noktadaki en üstteki düğüm (çerçeveler en son) */
  function hitNode(tab, p, exclude) {
    let frameHit = null;
    for (let i = tab.nodes.length - 1; i >= 0; i--) {
      const n = tab.nodes[i];
      if (exclude && exclude.has(n.id)) continue;
      const b = bounds(n);
      if (p.x >= b.x && p.x <= b.x + b.w && p.y >= b.y && p.y <= b.y + b.h) {
        if (n.type === 'frame') { if (!frameHit) frameHit = n; continue; }
        return n;
      }
    }
    return frameHit;
  }

  function contentBounds(tab, ids) {
    const list = tab.nodes.filter((n) => !ids || ids.has(n.id)).map(bounds);
    if (!list.length) return null;
    const geom = computeEdges(tab, ids ? { only: (e) => ids.has(e.from) && ids.has(e.to) } : null);
    for (const g of geom.values()) {
      const xs = g.pts.map((p) => p.x), ys = g.pts.map((p) => p.y);
      list.push({ x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) });
    }
    return unionBounds(list);
  }

  App.Geo = { CL, FLOW_FONT, FLOW_LINE, classLayout, nodeSize, bounds, center, unionBounds, flowTextLines, requiredHeight, textWidthFor, anchor, autoSides, nearestSide, sideFacing, computeEdges, hitNode, contentBounds, polyLength, pointAt, midPoint, roundedPath, projectOnPoly, bendInsertIndex, SIDES, DIR, sideSpreads };
})(typeof window !== 'undefined' ? window : globalThis);
