/* Kaynaklardaki tüm çeviri anahtarlarını çıkarır: $t('...') çağrıları ve index.html data-i18n* öznitelikleri.
   Kullanım: node tests/i18n-keys.js            -> anahtarları listeler
             require('./i18n-keys').collect()  -> testlerde */
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');

function unescapeJs(s) {
  return s.replace(/\\(u[0-9a-fA-F]{4}|n|t|'|"|\\)/g, (m, c) => {
    if (c === 'n') return '\n';
    if (c === 't') return '\t';
    if (c[0] === 'u') return String.fromCharCode(parseInt(c.slice(1), 16));
    return c;
  });
}
function decodeHtml(s) {
  return s.replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
}

function collect() {
  const keys = new Map(); // anahtar -> ilk konum
  const add = (k, where) => { if (!keys.has(k)) keys.set(k, where); };
  const jsDir = path.join(ROOT, 'js');
  for (const f of fs.readdirSync(jsDir)) {
    if (!f.endsWith('.js') || f === 'i18n.js') continue;
    const src = fs.readFileSync(path.join(jsDir, f), 'utf8');
    const re = /\$t\(\s*'((?:[^'\\]|\\.)*)'/g;
    let m;
    while ((m = re.exec(src))) add(unescapeJs(m[1]), f + ':' + src.slice(0, m.index).split('\n').length);
  }
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  let m;
  const reText = /<(\w+)[^>]*\sdata-i18n(?=[\s>])[^>]*>([^<]*)<\/\1>/g;
  while ((m = reText.exec(html))) add(decodeHtml(m[2].trim()), 'index.html');
  const reAttr = /data-i18n-(?:title|placeholder|html)="([^"]*)"/g;
  while ((m = reAttr.exec(html))) add(decodeHtml(m[1]), 'index.html');
  return keys;
}

module.exports = { collect };
if (require.main === module) {
  const keys = collect();
  for (const [k, w] of keys) console.log(JSON.stringify(k), '//', w);
  console.log(keys.size, 'keys');
}
