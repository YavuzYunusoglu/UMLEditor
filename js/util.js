'use strict';
/* Genel yardımcılar: id, metin ölçümü, renk, DOM, dosya */
(function (global) {
  const App = (global.App = global.App || {});

  let seq = 0;
  function uid(prefix) {
    return (prefix || 'id') + '_' + Date.now().toString(36).slice(-5) +
      Math.random().toString(36).slice(2, 6) + (seq++).toString(36);
  }

  const FONT_SANS = '"Segoe UI", system-ui, -apple-system, Roboto, "Helvetica Neue", Arial, sans-serif';
  const FONT_MONO = '"Cascadia Mono", "Cascadia Code", Consolas, "JetBrains Mono", Menlo, monospace';

  function font(size, opts) {
    opts = opts || {};
    return (opts.italic ? 'italic ' : '') + (opts.bold ? '600 ' : '400 ') + size + 'px ' + (opts.mono ? FONT_MONO : FONT_SANS);
  }

  let ctx = null;
  const mcache = new Map();
  function measure(text, fnt) {
    text = String(text);
    const key = fnt + '\u0001' + text;
    let v = mcache.get(key);
    if (v !== undefined) return v;
    if (!ctx && typeof document !== 'undefined') ctx = document.createElement('canvas').getContext('2d');
    if (ctx) {
      ctx.font = fnt;
      v = ctx.measureText(text).width;
    } else {
      const size = parseFloat((fnt.match(/(\d+(?:\.\d+)?)px/) || [0, 13])[1]);
      v = text.length * size * (/mono|Consolas/.test(fnt) ? 0.6 : 0.55);
    }
    if (mcache.size > 30000) mcache.clear();
    mcache.set(key, v);
    return v;
  }

  /* Metni verilen genişliğe sar. Satır sonlarını korur. */
  function wrapText(text, fnt, maxW) {
    const out = [];
    const pushWord = (word, line) => {
      // tek başına sığmayan kelimeyi böl
      if (measure(word, fnt) <= maxW) return word;
      let chunk = '';
      for (const ch of word) {
        if (chunk && measure(chunk + ch, fnt) > maxW) { out.push(chunk); chunk = ch; } else chunk += ch;
      }
      return chunk;
    };
    for (const para of String(text == null ? '' : text).split('\n')) {
      if (!para.trim()) { out.push(''); continue; }
      const words = para.split(/\s+/).filter(Boolean);
      let line = '';
      for (const w of words) {
        const cand = line ? line + ' ' + w : w;
        if (!line) line = pushWord(w);
        else if (measure(cand, fnt) <= maxW) line = cand;
        else { out.push(line); line = pushWord(w); }
      }
      out.push(line);
    }
    while (out.length > 1 && out[out.length - 1] === '') out.pop();
    return out;
  }

  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const snap = (v, g) => Math.round(v / g) * g;
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const clone = (o) => JSON.parse(JSON.stringify(o));

  function parseHex(h) {
    h = String(h || '#000').replace('#', '').trim();
    if (h.length === 3) h = h.split('').map((c) => c + c).join('');
    const n = parseInt(h.slice(0, 6), 16) || 0;
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  const toHex = (rgb) => '#' + rgb.map((v) => clamp(Math.round(v), 0, 255).toString(16).padStart(2, '0')).join('');
  /* a ile b arasında karışım: t=0 -> a, t=1 -> b */
  function mix(a, b, t) {
    const A = parseHex(a), B = parseHex(b);
    return toHex(A.map((v, i) => v + (B[i] - v) * t));
  }
  function rgba(hex, a) { const [r, g, b] = parseHex(hex); return `rgba(${r},${g},${b},${a})`; }
  const isHex = (s) => /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(String(s || '').trim());

  function debounce(fn, ms) {
    let t = null;
    const d = function (...args) { clearTimeout(t); t = setTimeout(() => { t = null; fn.apply(this, args); }, ms); };
    // yalnızca bekleyen bir çağrı varsa hemen çalıştır
    d.flush = () => { if (t === null) return; clearTimeout(t); t = null; fn(); };
    return d;
  }

  /* Küçük DOM yardımcısı */
  function h(tag, props, ...children) {
    const el = document.createElement(tag);
    if (props) {
      for (const k in props) {
        const v = props[k];
        if (v == null || v === false) continue;
        if (k === 'class') el.className = v;
        else if (k === 'style' && typeof v === 'object') {
          // CSS değişkenleri (--chip gibi) yalnızca setProperty ile atanabilir
          for (const p in v) { if (p.startsWith('--')) el.style.setProperty(p, v[p]); else el.style[p] = v[p]; }
        }
        else if (k === 'html') el.innerHTML = v;
        else if (k === 'dataset') Object.assign(el.dataset, v);
        else if (k === 'value') el.value = v;
        else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
        else if (k in el && typeof v !== 'string') el[k] = v;
        else el.setAttribute(k, v === true ? '' : v);
      }
    }
    for (const c of children.flat(Infinity)) {
      if (c == null || c === false) continue;
      el.appendChild(c instanceof Node ? c : document.createTextNode(String(c)));
    }
    return el;
  }

  function download(filename, data, mime) {
    const blob = data instanceof Blob ? data : new Blob([data], { type: mime || 'application/octet-stream' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }

  function readFileText(file) {
    if (file.text) return file.text();
    return new Promise((res, rej) => {
      const r = new FileReader();
      r.onload = () => res(r.result); r.onerror = rej; r.readAsText(file);
    });
  }

  function pickFiles(opts) {
    opts = opts || {};
    return new Promise((resolve) => {
      const inp = document.createElement('input');
      inp.type = 'file';
      if (opts.accept) inp.accept = opts.accept;
      if (opts.multiple) inp.multiple = true;
      if (opts.directory) { inp.webkitdirectory = true; inp.multiple = true; }
      inp.style.display = 'none';
      inp.addEventListener('change', () => { resolve(Array.from(inp.files || [])); inp.remove(); });
      document.body.appendChild(inp);
      inp.click();
    });
  }

  function safeFileName(s, fallback) {
    const v = String(s || '').replace(/[\\/:*?"<>|]+/g, '_').trim();
    return v || fallback || 'diagram';
  }

  /* Üst düzeyde (parantez/köşeli/açılı/küme dışı) ayırıcıya göre böl */
  function splitTop(s, sep, angles) {
    const out = [];
    let depth = 0, cur = '';
    for (let i = 0; i < s.length; i++) {
      const c = s[i];
      if (c === '(' || c === '[' || c === '{' || (angles && c === '<')) depth++;
      else if (c === ')' || c === ']' || c === '}' || (angles && c === '>' && s[i - 1] !== '=')) depth = Math.max(0, depth - 1);
      if (c === sep && depth === 0) { out.push(cur); cur = ''; } else cur += c;
    }
    out.push(cur);
    return out;
  }

  App.U = { uid, FONT_SANS, FONT_MONO, font, measure, wrapText, clamp, snap, esc, clone, parseHex, toHex, mix, rgba, isHex, debounce, h, download, readFileText, pickFiles, safeFileName, splitTop };
})(typeof window !== 'undefined' ? window : globalThis);
