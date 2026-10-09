'use strict';
/* Küçük Markdown desteği: **kalın**, *italik*, `kod`, ~~üstü çizili~~, # başlık, - madde, 1. madde, > alıntı.
   Tuvalde SVG olarak, önizlemede HTML olarak çizilir; dışa aktarımda düz metne çevrilir. */
(function (global) {
  const App = (global.App = global.App || {});
  const U = App.U;

  const ESCAPABLE = '\\`*_~#[]>';
  const isWord = (ch) => !!ch && /[\w\u00C0-\uFFFF]/.test(ch);

  /* Satır içi biçim: [{ t, b, i, c, s }] */
  function parseInline(src, st) {
    src = String(src == null ? '' : src);
    st = st || {};
    const out = [];
    let buf = '';
    const flush = () => { if (buf) { out.push(Object.assign({ t: buf }, st)); buf = ''; } };
    for (let i = 0; i < src.length;) {
      const c = src[i];
      if (c === '\\' && i + 1 < src.length && ESCAPABLE.includes(src[i + 1])) { buf += src[i + 1]; i += 2; continue; }
      if (c === '`') {
        const j = src.indexOf('`', i + 1);
        if (j > i + 1) { flush(); out.push(Object.assign({}, st, { t: src.slice(i + 1, j), c: true })); i = j + 1; continue; }
      }
      const two = src.substr(i, 2);
      if (two === '**' || two === '__' || two === '~~') {
        const j = src.indexOf(two, i + 2);
        const ok = j > i + 2 && src[i + 2] !== ' ' && src[j - 1] !== ' ' && (two !== '__' || (!isWord(src[i - 1]) && !isWord(src[j + 2])));
        if (ok) {
          flush();
          out.push(...parseInline(src.slice(i + 2, j), Object.assign({}, st, two === '~~' ? { s: true } : { b: true })));
          i = j + 2;
          continue;
        }
      }
      if ((c === '*' || c === '_') && src[i + 1] && src[i + 1] !== ' ' && src[i + 1] !== c && (c !== '_' || !isWord(src[i - 1]))) {
        let j = -1;
        for (let k = i + 1; k < src.length; k++) {
          if (src[k] === c && src[k - 1] !== ' ' && src[k + 1] !== c && (c !== '_' || !isWord(src[k + 1]))) { j = k; break; }
        }
        if (j > i + 1) {
          flush();
          out.push(...parseInline(src.slice(i + 1, j), Object.assign({}, st, { i: true })));
          i = j + 1;
          continue;
        }
      }
      buf += c;
      i++;
    }
    flush();
    return out;
  }

  /* Satır blokları. Her kaynak satır ayrı satırdır (yeni satırlar korunur); boş satır küçük bir boşluk olur. */
  function parseBlocks(text, inline) {
    const blocks = [];
    for (const raw of String(text == null ? '' : text).split('\n')) {
      const line = raw.replace(/\s+$/, '');
      if (!line.trim()) { blocks.push({ k: 'gap' }); continue; }
      let m;
      if (inline) blocks.push({ k: 'p', text: line });
      else if ((m = line.match(/^(#{1,3})\s+(.*)$/))) blocks.push({ k: 'h', level: m[1].length, text: m[2] });
      else if ((m = line.match(/^\s*[-*+]\s+(.*)$/))) blocks.push({ k: 'li', mark: '\u2022', text: m[1] });
      else if ((m = line.match(/^\s*(\d+)[.)]\s+(.*)$/))) blocks.push({ k: 'li', mark: m[1] + '.', text: m[2] });
      else if ((m = line.match(/^>\s?(.*)$/))) blocks.push({ k: 'quote', text: m[1] });
      else blocks.push({ k: 'p', text: line });
    }
    while (blocks.length && blocks[blocks.length - 1].k === 'gap') blocks.pop();
    while (blocks.length && blocks[0].k === 'gap') blocks.shift();
    return blocks;
  }

  /* Biçim işaretlerini kaldır: oyuna giden düz metin */
  function strip(text, inline) {
    return parseBlocks(text, inline).map((b) => {
      if (b.k === 'gap') return '';
      const t = parseInline(b.text).map((r) => r.t).join('');
      return b.k === 'li' ? (b.mark === '\u2022' ? '- ' : b.mark + ' ') + t : t;
    }).join('\n');
  }

  function has(text) { return /[*_`~#>]|^\s*([-+]|\d+[.)])\s/m.test(String(text || '')); }

  /* HTML (önizleme ve oynatıcı için); metin önce kaçışlanır */
  function inlineHtml(runs) {
    return runs.map((r) => {
      let s = U.esc(r.t);
      if (r.c) s = '<code>' + s + '</code>';
      if (r.s) s = '<s>' + s + '</s>';
      if (r.i) s = '<em>' + s + '</em>';
      if (r.b) s = '<strong>' + s + '</strong>';
      return s;
    }).join('');
  }
  function toHtml(text, inline) {
    return parseBlocks(text, inline).map((b) => {
      if (b.k === 'gap') return '<div class="md-gap"></div>';
      const body = inlineHtml(parseInline(b.text));
      if (b.k === 'h') return `<div class="md-h md-h${b.level}">${body}</div>`;
      if (b.k === 'li') return `<div class="md-li"><span class="md-mark">${U.esc(b.mark)}</span><span>${body}</span></div>`;
      if (b.k === 'quote') return `<div class="md-quote">${body}</div>`;
      return `<div class="md-p">${body || '&nbsp;'}</div>`;
    }).join('');
  }

  /* ---------------- SVG yerleşimi ----------------
     opts: { size, lh, width, italic, mono, inline }
     Dönüş: { lines: [{ y, lh, size, segs: [{ x, t, b, i, c, s }], mark, quote }], h } */
  const fontOf = (size, r, base) => U.font(r.c ? size * 0.92 : size, { bold: !!r.b, italic: !!(r.i || base.italic), mono: !!(r.c || base.mono) });

  function layout(text, opts) {
    const size0 = opts.size || 13, lh0 = opts.lh || 17, maxW = Math.max(20, opts.width || 200);
    const lines = [];
    let y = 0;
    for (const b of parseBlocks(text, opts.inline)) {
      if (b.k === 'gap') { y += lh0 * 0.5; continue; }
      const size = b.k === 'h' ? size0 * [1.3, 1.15, 1.05][b.level - 1] : size0;
      const lh = lh0 * size / size0;
      const indent = b.k === 'li' ? Math.round(size * 1.15) + (b.mark.length > 1 ? size * 0.4 * (b.mark.length - 1) : 0) : b.k === 'quote' ? 10 : 0;
      const base = { b: b.k === 'h', i: b.k === 'quote' };
      const runs = parseInline(b.text, base);
      // sözcüklere böl (boşluklar ayrı parça)
      const toks = [];
      for (const r of runs) for (const part of r.t.split(/(\s+)/)) if (part) toks.push(Object.assign({}, r, { t: part, sp: /^\s+$/.test(part) }));
      let cur = null, x = 0;
      const newLine = () => {
        cur = { y, lh, size, segs: [], indent };
        if (!lines.length || lines[lines.length - 1].block !== b) { if (b.k === 'li') cur.mark = b.mark; }
        cur.block = b;
        if (b.k === 'quote') cur.quote = true;
        lines.push(cur);
        y += lh;
        x = indent;
      };
      const push = (tk, w) => {
        const last = cur.segs[cur.segs.length - 1];
        if (last && last.b === tk.b && last.i === tk.i && last.c === tk.c && last.s === tk.s) { last.t += tk.t; last.w += w; }
        else cur.segs.push({ x, t: tk.t, b: tk.b, i: tk.i, c: tk.c, s: tk.s, w });
        x += w;
      };
      newLine();
      for (const tk of toks) {
        const fnt = fontOf(size, tk, opts);
        if (tk.sp) { if (cur.segs.length) push({ ...tk, t: ' ' }, U.measure(' ', fnt)); continue; }
        let w = U.measure(tk.t, fnt);
        if (x + w > maxW && cur.segs.length) {
          // satır sonundaki boşluğu at
          const last = cur.segs[cur.segs.length - 1];
          if (last && /\s$/.test(last.t)) { last.t = last.t.replace(/\s+$/, ''); }
          newLine();
        }
        if (w > maxW - indent) {
          // tek başına sığmayan sözcüğü harf harf böl
          let chunk = '';
          for (const ch of tk.t) {
            const cw = U.measure(chunk + ch, fnt);
            if (chunk && x + cw > maxW) { push({ ...tk, t: chunk }, U.measure(chunk, fnt)); newLine(); chunk = ch; } else chunk += ch;
          }
          if (chunk) push({ ...tk, t: chunk }, U.measure(chunk, fnt));
          continue;
        }
        push(tk, w);
      }
    }
    for (const l of lines) { delete l.block; const last = l.segs[l.segs.length - 1]; if (last) last.t = last.t.replace(/\s+$/, ''); }
    return { lines, h: Math.ceil(y) };
  }

  const fx = (v) => Math.round(v * 10) / 10;
  /* layout() sonucunu çiz. o: { fill, dim, code, italic, mono } */
  function render(L, x0, y0, o) {
    const mono = U.FONT_MONO.replace(/"/g, "'");
    let s = '';
    for (const l of L.lines) {
      const base = y0 + l.y + l.lh * 0.735;
      if (l.mark) s += `<text x="${fx(x0 + (l.mark.length > 1 ? 0 : 3))}" y="${fx(base)}" font-size="${fx(l.size)}" fill="${o.dim}">${U.esc(l.mark)}</text>`;
      if (l.quote) s += `<line x1="${fx(x0 + 3)}" y1="${fx(y0 + l.y + 2)}" x2="${fx(x0 + 3)}" y2="${fx(y0 + l.y + l.lh - 2)}" stroke="${o.dim}" stroke-width="2"/>`;
      if (!l.segs.length) continue;
      let t = `<text y="${fx(base)}" font-size="${fx(l.size)}" fill="${l.quote ? o.dim : o.fill}"${o.italic ? ' font-style="italic"' : ''}${o.mono ? ` font-family="${mono}"` : ''}>`;
      for (const g of l.segs) {
        let a = ` x="${fx(x0 + g.x)}"`;
        if (g.b) a += ' font-weight="600"';
        if (g.i) a += ' font-style="italic"';
        if (g.c) a += ` font-family="${mono}" font-size="${fx(l.size * 0.92)}" fill="${o.code || o.fill}"`;
        if (g.s) a += ' text-decoration="line-through"';
        t += `<tspan${a}>${U.esc(g.t)}</tspan>`;
      }
      s += t + '</text>';
    }
    return s;
  }

  App.Md = { parseInline, parseBlocks, strip, has, toHtml, layout, render };
})(typeof window !== 'undefined' ? window : globalThis);
