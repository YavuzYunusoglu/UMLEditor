'use strict';
/* SVG çizimi. Tüm renkler satır içi verilir, böylece dışa aktarım canlı görüntüyle aynı olur. */
(function (global) {
  const App = (global.App = global.App || {});
  const U = App.U, UML = App.UML, Geo = App.Geo;
  const esc = U.esc;
  const f = (v) => Math.round(v * 10) / 10;
  const MONO = U.FONT_MONO.replace(/"/g, "'");

  function text(x, y, s, o) {
    o = o || {};
    let a = `<text x="${f(x)}" y="${f(y)}" font-size="${o.size || 13}" fill="${o.fill}"`;
    if (o.anchor && o.anchor !== 'start') a += ` text-anchor="${o.anchor}"`;
    if (o.bold) a += ' font-weight="600"';
    if (o.italic) a += ' font-style="italic"';
    if (o.mono) a += ` font-family="${MONO}"`;
    if (o.underline) a += ' text-decoration="underline"';
    return a + '>' + (o.raw ? s : esc(s)) + '</text>';
  }

  /* ---------- Sınıf ---------- */
  function renderClass(n, T) {
    const L = Geo.classLayout(n);
    const x = n.x, y = n.y, w = L.w, h = L.h, r = 6;
    const col = UML.nodeColor(n);
    const c = App.Theme.tint(T, col);
    const CL = Geo.CL;
    let s = `<g class="node" data-node="${n.id}">`;
    s += `<rect x="${f(x)}" y="${f(y)}" width="${f(w)}" height="${f(h)}" rx="${r}" fill="${T.node}"/>`;
    const hh = L.show ? L.headerH : h;
    if (L.show) {
      s += `<path d="M${f(x)},${f(y + hh)} V${f(y + r)} Q${f(x)},${f(y)} ${f(x + r)},${f(y)} H${f(x + w - r)} Q${f(x + w)},${f(y)} ${f(x + w)},${f(y + r)} V${f(y + hh)} Z" fill="${c.header}"/>`;
    } else {
      s += `<rect x="${f(x)}" y="${f(y)}" width="${f(w)}" height="${f(h)}" rx="${r}" fill="${c.header}"/>`;
    }
    s += `<rect x="${f(x)}" y="${f(y)}" width="${f(w)}" height="${f(h)}" rx="${r}" fill="none" stroke="${c.stroke}" stroke-width="1.4"/>`;
    let ty = y + CL.headTop;
    if (L.stereo) {
      s += text(x + w / 2, ty + 11, L.stereo, { size: 11, italic: true, fill: T.textDim, anchor: 'middle' });
      ty += CL.stereoH;
    }
    s += text(x + w / 2, ty + 14, n.name || ' ', { size: 14, bold: true, italic: !!n.abstract, fill: T.text, anchor: 'middle' });
    if (L.show) {
      s += `<line x1="${f(x)}" y1="${f(y + L.attrY)}" x2="${f(x + w)}" y2="${f(y + L.attrY)}" stroke="${c.stroke}" stroke-width="1"/>`;
      if (L.methY) s += `<line x1="${f(x)}" y1="${f(y + L.methY)}" x2="${f(x + w)}" y2="${f(y + L.methY)}" stroke="${c.stroke}" stroke-width="1"/>`;
      const member = (m, by) => {
        let inner = '';
        if (m.vis) inner += `<tspan fill="${T.vis[m.vis] || T.textDim}" font-weight="600">${esc(m.vis)}</tspan> `;
        inner += esc(m.text);
        return text(x + CL.padX, by, inner, { raw: true, size: 12, mono: true, fill: T.text, underline: m.static, italic: m.abstract });
      };
      L.attrs.forEach((m, i) => { s += member(m, y + L.attrY + CL.compPad + i * CL.lineH + 13); });
      L.meths.forEach((m, i) => { s += member(m, y + L.methY + CL.compPad + i * CL.lineH + 13); });
    }
    return s + '</g>';
  }

  /* ---------- Akış şekilleri ---------- */
  function shapePath(n) {
    const x = n.x, y = n.y, w = n.w, h = n.h;
    switch (n.type) {
      case 'terminator': { const r = Math.min(h, w) / 2; return `<rect x="${f(x)}" y="${f(y)}" width="${f(w)}" height="${f(h)}" rx="${f(r)}"`; }
      case 'decision': return `<polygon points="${f(x + w / 2)},${f(y)} ${f(x + w)},${f(y + h / 2)} ${f(x + w / 2)},${f(y + h)} ${f(x)},${f(y + h / 2)}"`;
      case 'io': { const k = Math.min(18, w * 0.2); return `<polygon points="${f(x + k)},${f(y)} ${f(x + w)},${f(y)} ${f(x + w - k)},${f(y + h)} ${f(x)},${f(y + h)}"`; }
      case 'preparation': { const k = Math.min(18, w * 0.2); return `<polygon points="${f(x + k)},${f(y)} ${f(x + w - k)},${f(y)} ${f(x + w)},${f(y + h / 2)} ${f(x + w - k)},${f(y + h)} ${f(x + k)},${f(y + h)} ${f(x)},${f(y + h / 2)}"`; }
      case 'document': {
        const a = Math.min(10, h * 0.15);
        return `<path d="M${f(x)},${f(y)} H${f(x + w)} V${f(y + h - a)} Q${f(x + w * 0.75)},${f(y + h - a * 2)} ${f(x + w * 0.5)},${f(y + h - a)} T${f(x)},${f(y + h - a)} Z"`;
      }
      case 'connector': { const r = Math.min(w, h) / 2; return `<circle cx="${f(x + w / 2)}" cy="${f(y + h / 2)}" r="${f(r)}"`; }
      case 'note': { const k = 14; return `<path d="M${f(x)},${f(y)} H${f(x + w - k)} L${f(x + w)},${f(y + k)} V${f(y + h)} H${f(x)} Z"`; }
      default: return `<rect x="${f(x)}" y="${f(y)}" width="${f(w)}" height="${f(h)}" rx="6"`;
    }
  }

  function renderFlow(n, T) {
    const col = UML.nodeColor(n);
    const c = App.Theme.tint(T, col);
    const x = n.x, y = n.y, w = n.w, h = n.h;
    let s = `<g class="node" data-node="${n.id}">`;
    if (n.type === 'text') {
      s += `<rect x="${f(x)}" y="${f(y)}" width="${f(w)}" height="${f(h)}" fill="${T.canvas}" fill-opacity="0.001"/>`;
    } else {
      s += shapePath(n) + ` fill="${c.fill}" stroke="${c.stroke}" stroke-width="1.5"/>`;
    }
    if (n.type === 'subprocess') {
      s += `<line x1="${f(x + 10)}" y1="${f(y)}" x2="${f(x + 10)}" y2="${f(y + h)}" stroke="${c.stroke}" stroke-width="1.2"/>`;
      s += `<line x1="${f(x + w - 10)}" y1="${f(y)}" x2="${f(x + w - 10)}" y2="${f(y + h)}" stroke="${c.stroke}" stroke-width="1.2"/>`;
    }
    if (n.type === 'note') {
      const k = 14;
      s += `<path d="M${f(x + w - k)},${f(y)} V${f(y + k)} H${f(x + w)}" fill="none" stroke="${c.stroke}" stroke-width="1.2"/>`;
    }
    const lines = Geo.flowTextLines(n);
    const LH = Geo.FLOW_LINE;
    const fill = n.type === 'text' && n.color ? n.color : T.text;
    if (n.type === 'note') {
      lines.forEach((ln, i) => { s += text(x + 12, y + 12 + i * LH + 12, ln, { fill }); });
    } else {
      let cy = y + h / 2;
      if (n.type === 'document') cy -= Math.min(10, h * 0.15) / 2;
      const top = cy - (lines.length * LH) / 2;
      lines.forEach((ln, i) => { s += text(x + w / 2, top + i * LH + 12.5, ln, { fill, anchor: 'middle', bold: n.type === 'terminator' }); });
    }
    return s + '</g>';
  }

  function renderFrame(n, T, live) {
    const col = UML.nodeColor(n) || T.textDim;
    const x = n.x, y = n.y, w = n.w, h = n.h, hh = 28, r = 8;
    let s = `<g class="node frame" data-node="${n.id}">`;
    s += `<rect x="${f(x)}" y="${f(y)}" width="${f(w)}" height="${f(h)}" rx="${r}" fill="${U.rgba(col, T.dark ? 0.06 : 0.05)}" stroke="${U.rgba(col, 0.7)}" stroke-width="1.4" stroke-dasharray="7 4"${live ? ' pointer-events="none"' : ''}/>`;
    if (live) s += `<rect x="${f(x)}" y="${f(y)}" width="${f(w)}" height="${f(h)}" rx="${r}" fill="none" stroke="transparent" stroke-width="12" pointer-events="stroke"/>`;
    const title = n.text || '';
    const tw = Math.min(w, U.measure(title, U.font(13, { bold: true })) + 28);
    s += `<path d="M${f(x)},${f(y + hh)} V${f(y + r)} Q${f(x)},${f(y)} ${f(x + r)},${f(y)} H${f(x + tw)} V${f(y + hh - 8)} Q${f(x + tw)},${f(y + hh)} ${f(x + tw - 8)},${f(y + hh)} Z" fill="${U.rgba(col, T.dark ? 0.28 : 0.2)}"/>`;
    s += text(x + 12, y + 18.5, title, { fill: T.text, bold: true });
    return s + '</g>';
  }

  function renderNode(n, T, live, dctx) {
    if (n.type === 'class') return renderClass(n, T);
    if (App.Dialogue && App.Dialogue.isDlg(n)) return App.Dialogue.render(n, T, live, dctx);
    if (n.type === 'frame') return renderFrame(n, T, live);
    return renderFlow(n, T);
  }

  /* ---------- Kenarlar ---------- */
  function deco(kind, tip, u, color, T) {
    if (!kind) return '';
    const p = { x: -u.y, y: u.x };
    const at = (back, side) => `${f(tip.x - u.x * back + p.x * side)},${f(tip.y - u.y * back + p.y * side)}`;
    switch (kind) {
      case 'triangle': return `<polygon points="${at(0, 0)} ${at(13, 7.5)} ${at(13, -7.5)}" fill="${T.canvas}" stroke="${color}" stroke-width="1.5" stroke-linejoin="round"/>`;
      case 'filled': return `<polygon points="${at(0, 0)} ${at(10, 5.5)} ${at(10, -5.5)}" fill="${color}" stroke="${color}" stroke-width="1" stroke-linejoin="round"/>`;
      case 'open': return `<polyline points="${at(11, 6.5)} ${at(0, 0)} ${at(11, -6.5)}" fill="none" stroke="${color}" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>`;
      case 'diamond': return `<polygon points="${at(0, 0)} ${at(8.5, 5.5)} ${at(17, 0)} ${at(8.5, -5.5)}" fill="${T.canvas}" stroke="${color}" stroke-width="1.5" stroke-linejoin="round"/>`;
      case 'diamondFilled': return `<polygon points="${at(0, 0)} ${at(8.5, 5.5)} ${at(17, 0)} ${at(8.5, -5.5)}" fill="${color}" stroke="${color}" stroke-width="1.5" stroke-linejoin="round"/>`;
    }
    return '';
  }

  function renderEdge(e, g, T, selected, live) {
    const color = selected ? T.accent : (e.color || T.edge);
    let s = `<g class="edge" data-edge="${e.id}">`;
    if (live) s += `<path d="${g.d}" fill="none" stroke="transparent" stroke-width="14" class="edge-hit"/>`;
    s += `<path d="${g.d}" fill="none" stroke="${color}" stroke-width="${selected ? 2.2 : 1.6}"${g.dash ? ' stroke-dasharray="7 5"' : ''} stroke-linejoin="round" stroke-linecap="round"/>`;
    s += deco(g.endDeco, g.end, g.endDir, color, T);
    s += deco(g.startDeco, g.start, { x: -g.startDir.x, y: -g.startDir.y }, color, T);
    // bükülme noktaları yalnızca tuvalde görünür (dışa aktarımda yok)
    if (live && Array.isArray(e.points) && e.from !== e.to) {
      e.points.forEach((p, i) => { s += `<circle class="edge-wp" data-wp="${i}" cx="${f(p.x)}" cy="${f(p.y)}" r="3.5" fill="${T.canvas}" stroke="${color}" stroke-width="1.5"/>`; });
    }
    return s + '</g>';
  }

  function labelBox(x, y, str, T, color, edgeId) {
    const lines = String(str).split('\n');
    const fnt = U.font(12);
    const w = Math.max(...lines.map((l) => U.measure(l, fnt))) + 10;
    const h = lines.length * 15 + 5;
    let s = `<g${edgeId ? ` data-edge="${edgeId}" class="edge-label"` : ''}>`;
    s += `<rect x="${f(x - w / 2)}" y="${f(y - h / 2)}" width="${f(w)}" height="${f(h)}" rx="4" fill="${T.labelBg}" fill-opacity="0.92"/>`;
    lines.forEach((l, i) => { s += text(x, y - h / 2 + 2.5 + i * 15 + 11.5, l, { size: 12, fill: color, anchor: 'middle' }); });
    return s + '</g>';
  }

  function renderEdgeLabels(e, g, T, selected) {
    const color = selected ? T.accent : T.text;
    let s = '';
    if (e.label) s += labelBox(g.labelPos.x, g.labelPos.y, e.label, T, color, e.id);
    const endLbl = (str, pt, u) => {
      // uç noktaya yakın, çizginin yanına
      let p = { x: -u.y, y: u.x };
      const horiz = Math.abs(u.x) >= Math.abs(u.y);
      if (horiz ? p.y > 0 : p.x < 0) p = { x: -p.x, y: -p.y }; // yatayda üstte, dikeyde sağda
      const x = pt.x + u.x * 18 + p.x * (horiz ? 10 : 6);
      const y = pt.y + u.y * 18 + p.y * 10;
      return text(x, y + 4, str, { size: 12, fill: T.textDim, anchor: horiz ? 'middle' : 'start' });
    };
    if (e.srcLabel) s += endLbl(e.srcLabel, g.start, g.startDir);
    if (e.dstLabel) s += endLbl(e.dstLabel, g.end, { x: -g.endDir.x, y: -g.endDir.y });
    return s;
  }

  /* Bir sekmeyi katmanlar halinde çiz */
  function renderTab(tab, T, opts) {
    opts = opts || {};
    const only = opts.only || null;
    const live = !!opts.live;
    const selE = opts.selectedEdges || new Set();
    const geom = Geo.computeEdges(tab, only ? { only: (e) => only.has(e.from) && only.has(e.to) } : null);
    const D = App.Dialogue;
    const dctx = D ? D.renderContext(tab, live) : null;
    const nodeMap = dctx ? new Map(tab.nodes.map((n) => [n.id, n])) : null;
    let frames = '', nodes = '', edges = '', labels = '';
    for (const n of tab.nodes) {
      if (only && !only.has(n.id)) continue;
      if (n.type === 'frame') frames += renderNode(n, T, live);
      else nodes += renderNode(n, T, live, dctx);
    }
    for (let e of tab.edges) {
      const g = geom.get(e.id);
      if (!g) continue;
      const sel = selE.has(e.id);
      // diyalogda seçenek numarası / Doğru-Yanlış etiketi kenardan değil kaynak düğümden gelir
      const dd = dctx && D.edgeDecor(e, nodeMap.get(e.from));
      if (dd) e = Object.assign({}, e, { label: dd.label, color: e.color || dd.color });
      edges += renderEdge(e, g, T, sel, live);
      labels += renderEdgeLabels(e, g, T, sel);
    }
    return { frames, nodes, edges, labels, geom };
  }

  App.Render = { renderTab, renderNode, shapePath, text };
})(typeof window !== 'undefined' ? window : globalThis);
