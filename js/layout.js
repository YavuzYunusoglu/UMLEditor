'use strict';
/* Otomatik yerleşim: katmanlı (Sugiyama benzeri) basit algoritma */
(function (global) {
  const App = (global.App = global.App || {});

  /**
   * @param nodes  düğümler (x,y güncellenir)
   * @param edges  kenarlar
   * @param opts   { direction: 'TB'|'LR', gapX, gapY, reverse: Set(edgeType) }
   */
  function layered(nodes, edges, opts) {
    opts = opts || {};
    const LR = opts.direction === 'LR';
    const gapMain = opts.gapY || (LR ? 90 : 70);
    const gapCross = opts.gapX || (LR ? 40 : 50);
    const reverse = opts.reverse || new Set();
    const ids = nodes.filter((n) => n.type !== 'frame').map((n) => n.id);
    if (!ids.length) return;
    const nodeMap = new Map(nodes.map((n) => [n.id, n]));
    const size = new Map(ids.map((id) => {
      const s = App.Geo.nodeSize(nodeMap.get(id));
      return [id, LR ? { a: s.h, b: s.w } : { a: s.w, b: s.h }]; // a: katman içi eksen, b: katman ekseni
    }));
    const idSet = new Set(ids);
    let E = [];
    const seen = new Set();
    for (const e of edges) {
      if (!idSet.has(e.from) || !idSet.has(e.to) || e.from === e.to) continue;
      let u = e.from, v = e.to;
      if (reverse.has(e.type)) [u, v] = [v, u];
      const k = u + '>' + v;
      if (seen.has(k)) continue;
      seen.add(k);
      E.push([u, v]);
    }

    // bileşenler
    const parent = new Map(ids.map((i) => [i, i]));
    const find = (x) => { while (parent.get(x) !== x) { parent.set(x, parent.get(parent.get(x))); x = parent.get(x); } return x; };
    for (const [u, v] of E) parent.set(find(u), find(v));
    const comps = new Map();
    for (const id of ids) { const r = find(id); if (!comps.has(r)) comps.set(r, []); comps.get(r).push(id); }

    const results = [];
    for (const compIds of comps.values()) {
      const cset = new Set(compIds);
      const ce = E.filter(([u]) => cset.has(u));
      results.push(layoutComponent(compIds, ce, size, gapMain, gapCross));
    }
    // bileşenleri satırlara yerleştir (tek düğümlüler en sonda ızgarada)
    results.sort((a, b) => (b.ids.length - a.ids.length) || (b.w * b.h - a.w * a.h));
    const totalArea = results.reduce((s, r) => s + (r.w + 80) * (r.h + 80), 0);
    const maxRow = Math.max(1200, Math.sqrt(totalArea) * 1.6);
    let cx = 0, cy = 0, rowH = 0;
    const ox = opts.originX || 0, oy = opts.originY || 0;
    for (const r of results) {
      if (cx > 0 && cx + r.w > maxRow) { cx = 0; cy += rowH + 80; rowH = 0; }
      for (const [id, p] of r.pos) {
        const n = nodeMap.get(id);
        const s = size.get(id);
        // p: katman içi merkez (a), katman üst kenarı (b)
        const A = cx + p.a - s.a / 2, B = cy + p.b;
        if (LR) { n.x = Math.round(ox + B); n.y = Math.round(oy + A); }
        else { n.x = Math.round(ox + A); n.y = Math.round(oy + B); }
      }
      cx += r.w + 80;
      rowH = Math.max(rowH, r.h);
    }
  }

  function layoutComponent(ids, E, size, gapMain, gapCross) {
    const out = new Map(ids.map((i) => [i, []]));
    const inc = new Map(ids.map((i) => [i, []]));
    for (const [u, v] of E) { out.get(u).push(v); inc.get(v).push(u); }

    // döngüleri kır (DFS geri kenarlarını ters çevir)
    const state = new Map();
    const dag = [];
    const order = [];
    const roots = ids.filter((i) => !inc.get(i).length);
    const startList = roots.length ? roots.concat(ids) : ids;
    const visit = (s) => {
      const stack = [[s, 0]];
      state.set(s, 1);
      while (stack.length) {
        const top = stack[stack.length - 1];
        const [u, i] = top;
        const vs = out.get(u);
        if (i < vs.length) {
          top[1]++;
          const v = vs[i];
          const st = state.get(v);
          if (st === 1) dag.push([v, u]);
          else { dag.push([u, v]); if (!st) { state.set(v, 1); stack.push([v, 0]); } }
        } else { state.set(u, 2); order.push(u); stack.pop(); }
      }
    };
    for (const s of startList) if (!state.get(s)) visit(s);

    const dOut = new Map(ids.map((i) => [i, []]));
    const dIn = new Map(ids.map((i) => [i, []]));
    for (const [u, v] of dag) { if (u === v) continue; dOut.get(u).push(v); dIn.get(v).push(u); }

    // en uzun yol katmanlama (topolojik sıra = ters post-order)
    const topo = order.slice().reverse();
    const layer = new Map(ids.map((i) => [i, 0]));
    for (const u of topo) for (const v of dOut.get(u)) layer.set(v, Math.max(layer.get(v), layer.get(u) + 1));
    // kaynakları çocuklarına yaklaştır
    for (const u of order) {
      if (dIn.get(u).length || !dOut.get(u).length) continue;
      layer.set(u, Math.min(...dOut.get(u).map((v) => layer.get(v))) - 1);
    }
    const maxL = Math.max(...layer.values());
    const layers = Array.from({ length: maxL + 1 }, () => []);
    for (const u of topo) layers[layer.get(u)].push(u);

    // kesişim azaltma: ağırlık merkezi taramaları
    const posIdx = new Map();
    const reindex = () => layers.forEach((L) => L.forEach((u, i) => posIdx.set(u, i)));
    reindex();
    const bary = (u, nb) => {
      const list = nb.get(u);
      if (!list.length) return posIdx.get(u);
      return list.reduce((s, v) => s + posIdx.get(v), 0) / list.length;
    };
    for (let it = 0; it < 8; it++) {
      const down = it % 2 === 0;
      const range = down ? [...Array(layers.length).keys()].slice(1) : [...Array(layers.length).keys()].reverse().slice(1);
      for (const li of range) {
        const L = layers[li];
        const nb = down ? dIn : dOut;
        const b = new Map(L.map((u) => [u, bary(u, nb)]));
        L.sort((p, q) => b.get(p) - b.get(q));
        L.forEach((u, i) => posIdx.set(u, i));
      }
    }

    // koordinatlar
    const pos = new Map();
    let B = 0;
    const layerB = [];
    for (const L of layers) {
      const h = Math.max(...L.map((u) => size.get(u).b), 0);
      layerB.push({ top: B, h });
      let a = 0;
      for (const u of L) { const s = size.get(u); pos.set(u, { a: a + s.a / 2, b: B + (h - s.b) / 2 }); a += s.a + gapCross; }
      B += h + gapMain;
    }
    // komşulara hizala (birkaç geçiş)
    const place = (L, nb) => {
      if (!L.length) return;
      const want = L.map((u) => {
        const list = nb.get(u);
        if (!list.length) return pos.get(u).a;
        return list.reduce((s, v) => s + pos.get(v).a, 0) / list.length;
      });
      const res = want.slice();
      for (let i = 1; i < L.length; i++) {
        const min = res[i - 1] + size.get(L[i - 1]).a / 2 + gapCross + size.get(L[i]).a / 2;
        if (res[i] < min) res[i] = min;
      }
      // ortalama kaymayı geri al
      let shift = 0;
      for (let i = 0; i < L.length; i++) shift += res[i] - want[i];
      shift /= L.length;
      L.forEach((u, i) => { pos.get(u).a = res[i] - shift; });
    };
    for (let it = 0; it < 6; it++) {
      if (it % 2 === 0) for (let li = 1; li < layers.length; li++) place(layers[li], dIn);
      else for (let li = layers.length - 2; li >= 0; li--) place(layers[li], dOut);
    }
    // normalize
    let minA = Infinity, maxA = -Infinity;
    for (const [u, p] of pos) { const s = size.get(u); minA = Math.min(minA, p.a - s.a / 2); maxA = Math.max(maxA, p.a + s.a / 2); }
    for (const p of pos.values()) p.a = Math.round((p.a - minA) / 10) * 10;
    return { ids, pos, w: maxA - minA, h: B - gapMain };
  }

  App.Layout = { layered };
})(typeof window !== 'undefined' ? window : globalThis);
