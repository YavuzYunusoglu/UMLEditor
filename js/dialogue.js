'use strict';
/* Oyun diyalogları (anlatı tasarımı): düğüm türleri, karakter / değişken kaydı, koşul ve eylem dili,
   çizim, doğrulama, oyun için JSON dışa aktarımı ve önizleme oynatıcısı.
   Bu dosya DOM kullanmaz (testlerde de çalışır); arayüz js/dialogue-ui.js içinde. */
(function (global) {
  const App = (global.App = global.App || {});
  const U = App.U;
  const $t = App.$t || ((k) => k);

  const TYPES = ['dlgStart', 'dlgLine', 'dlgChoice', 'dlgBranch', 'dlgAction', 'dlgJump', 'dlgEnd', 'dlgCard'];
  const TYPE_SET = new Set(TYPES);
  const isDlg = (n) => !!n && TYPE_SET.has(n.type);
  // akışa katılan düğümler (kişi kartı yalnızca görseldir: kontrol, oynatma ve dışa aktarım onu yok sayar)
  const isFlow = (n) => isDlg(n) && n.type !== 'dlgCard';
  const PILLS = new Set(['dlgStart', 'dlgJump', 'dlgEnd']);
  const CHAR_COLORS = ['#f5a623', '#4f8cff', '#3ecf8e', '#b26bff', '#ff6b6b', '#2bc0d6', '#ff8a65', '#e6c34a', '#f06292', '#8e9bb0'];
  const VAR_TYPES = ['bool', 'number', 'string'];
  const EXPORT_TYPE = { dlgLine: 'line', dlgChoice: 'choice', dlgBranch: 'condition', dlgAction: 'action', dlgJump: 'jump', dlgEnd: 'end' };
  const FORMAT = 'umlstudio-dialogue', FORMAT_VERSION = 2;
  const TRUE_COLOR = '#3ecf8e', FALSE_COLOR = '#ff6b6b';

  function defaults(type) {
    switch (type) {
      case 'dlgStart': return { text: $t('Yeni diyalog'), dlgId: 'new_dialogue' };
      case 'dlgLine': return { speaker: '', text: '', emotion: '', audio: '', tags: '' };
      case 'dlgChoice': return { text: '', options: [] };
      case 'dlgBranch': return { cond: '' };
      case 'dlgAction': return { actions: '' };
      case 'dlgJump': return { target: '' };
      case 'dlgEnd': return { text: '' };
      case 'dlgCard': return { charId: '', showDesc: true, showProps: true };
    }
    return {};
  }

  function newOption(text) { return { id: U.uid('o'), text: text || '', cond: '' }; }
  /* Seçeneğin kaç kez seçildikten sonra gizleneceği (0 = sınırsız). Eski belgelerdeki "once" = 1 */
  function pickLimit(o) {
    if (!o) return 0;
    const v = o.maxPicks != null ? parseInt(o.maxPicks, 10) : o.once ? 1 : 0;
    return v >= 1 ? Math.min(v, 999) : 0;
  }

  /* Yüklenen düğümü tamamla / temizle */
  function normalizeNode(n) {
    const d = defaults(n.type);
    for (const k in d) if (n[k] == null) n[k] = U.clone(d[k]);
    for (const k of ['text', 'speaker', 'emotion', 'audio', 'tags', 'cond', 'actions', 'target', 'dlgId', 'charId']) {
      if (n[k] != null && typeof n[k] !== 'string') n[k] = String(n[k]);
    }
    if (n.type === 'dlgChoice') {
      const seen = new Set();
      n.options = (Array.isArray(n.options) ? n.options : []).filter((o) => o && typeof o === 'object').map((o) => {
        let id = String(o.id || U.uid('o'));
        if (seen.has(id)) id = U.uid('o');
        seen.add(id);
        const r = { id, text: o.text == null ? '' : String(o.text), cond: o.cond == null ? '' : String(o.cond) };
        const lim = pickLimit(o);
        if (lim) r.maxPicks = lim;
        return r;
      });
    }
    const m = App.UML.SHAPES[n.type];
    n.w = Math.max(MIN_W, +n.w || m.w);
  }

  /* ---------------- Karakter ve değişken kaydı (belge düzeyinde) ---------------- */
  const EMPTY_REG = Object.freeze({ characters: Object.freeze([]), variables: Object.freeze([]) });
  function reg(doc) { return (doc && doc.dialogue) || EMPTY_REG; }
  function ensureReg(doc) {
    if (!doc.dialogue) doc.dialogue = { characters: [], variables: [] };
    return doc.dialogue;
  }
  function normalizeReg(doc) {
    if (!doc.dialogue || typeof doc.dialogue !== 'object') { delete doc.dialogue; return; }
    const r = doc.dialogue;
    const ids = new Set(), names = new Set();
    r.characters = (Array.isArray(r.characters) ? r.characters : []).filter((c) => c && c.id && !ids.has(String(c.id)) && ids.add(String(c.id))).map((c, i) => cleanCharacter(c, i));
    r.variables = (Array.isArray(r.variables) ? r.variables : []).filter((v) => v && v.name && !names.has(String(v.name)) && names.add(String(v.name))).map((v) => ({
      name: String(v.name), type: VAR_TYPES.includes(v.type) ? v.type : 'bool', value: v.value == null ? '' : String(v.value),
    }));
  }
  /* Karakter alanları: id, name, color ve isteğe bağlı role, desc (Markdown), props [{ key, value }], portrait (data URL) */
  function cleanCharacter(c, i) {
    const r = { id: String(c.id), name: String(c.name || c.id), color: U.isHex(c.color) ? c.color : CHAR_COLORS[(i || 0) % CHAR_COLORS.length] };
    if (c.role) r.role = String(c.role);
    if (c.desc) r.desc = String(c.desc);
    if (Array.isArray(c.props)) {
      const props = c.props.filter((p) => p && typeof p === 'object').map((p) => ({ key: String(p.key == null ? '' : p.key), value: String(p.value == null ? '' : p.value) }));
      if (props.length) r.props = props;
    }
    if (typeof c.portrait === 'string' && /^data:image\/(png|jpe?g|webp|gif);base64,/.test(c.portrait)) r.portrait = c.portrait;
    return r;
  }
  function character(doc, id) { return id ? reg(doc).characters.find((c) => c.id === id) || null : null; }

  /* Kimlik üret: "Köy Yaşlısı" -> "koy_yaslisi" */
  function slug(s, fallback) {
    const v = String(s || '').replace(/\u0131/g, 'i').replace(/\u0130/g, 'I').normalize('NFD').replace(/[\u0300-\u036F]/g, '')
      .toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
    return v || fallback || 'id';
  }
  function uniqueId(base, taken) {
    let id = base, i = 2;
    while (taken.has(id)) id = base + '_' + i++;
    return id;
  }

  function addCharacter(doc, name, color) {
    const r = ensureReg(doc);
    const id = uniqueId(slug(name, 'character'), new Set(r.characters.map((c) => c.id)));
    const c = { id, name: String(name || id), color: color || CHAR_COLORS[r.characters.length % CHAR_COLORS.length] };
    r.characters.push(c);
    return c;
  }
  /* Karakter kimliğini değiştir; tüm sekmelerdeki replikler yeni kimliği kullanır */
  function renameCharacter(doc, c, newId) {
    if (!newId || newId === c.id) return false;
    if (reg(doc).characters.some((x) => x !== c && x.id === newId)) return false;
    for (const t of doc.tabs) for (const n of t.nodes) {
      if (n.type === 'dlgLine' && n.speaker === c.id) n.speaker = newId;
      if (n.type === 'dlgCard' && n.charId === c.id) n.charId = newId;
    }
    for (const t of doc.tabs) if (t.owner === c.id) t.owner = newId;
    c.id = newId;
    return true;
  }
  /* Karakteri sil; onun sayfası olan sekmeler sahipsiz kalır (replikler konuşmacısız kalır) */
  function removeCharacter(doc, c) {
    const r = ensureReg(doc);
    r.characters = r.characters.filter((x) => x !== c);
    for (const t of doc.tabs) if (t.owner === c.id) delete t.owner;
  }

  /* ---------------- Karakter sayfaları ----------------
     Bir diyalog sekmesi bir karaktere ait olabilir (tab.owner = karakter kimliği): o karakterin konuşmaları
     ayrı sayfada yazılır ve ayrı JSON olarak dışa aktarılabilir. */
  function tabOwner(doc, tab) { return tab && tab.owner ? character(doc, tab.owner) : null; }
  function pagesOf(doc, charId) { return doc.tabs.filter((t) => isDialogueTab(t) && t.owner === charId); }
  /* Yeni karakter sayfası için başlangıç parçası: Başlangıç -> karakterin repliği -> Bitiş */
  function pageStarter(c) {
    const SH = App.UML.SHAPES;
    const node = (id, type, props) => Object.assign({ id, type, x: 0, y: 0, w: SH[type].w, h: SH[type].h }, defaults(type), props);
    return {
      nodes: [node('s', 'dlgStart', { text: c.name, dlgId: slug(c.name, c.id) + '_talk' }), node('l', 'dlgLine', { speaker: c.id, text: '' }), node('e', 'dlgEnd', { text: '' })],
      edges: [{ id: 'e0', from: 's', to: 'l', type: 'flow', label: '' }, { id: 'e1', from: 'l', to: 'e', type: 'flow', label: '' }],
    };
  }

  /* ---------------- Karakter özellikleri değişken olarak ----------------
     Karakter sayfasındaki özellikler koşullarda, eylemlerde ve {metin} içinde "karakter.özellik" adıyla
     kullanılabilir: Tüccar'ın "Yaş: 52" özelliği -> merchant.yas = 52. Sayı / true-false değerler türüyle gelir. */
  function propVarName(c, key) { return c.id + '.' + slug(key, 'prop'); }
  function charVars(doc) {
    const out = [], seen = new Set();
    for (const c of reg(doc).characters) for (const p of c.props || []) {
      if (!String(p.key || '').trim()) continue;
      const name = propVarName(c, p.key);
      if (seen.has(name)) continue;
      seen.add(name);
      const s = plain(p.value, true).trim();
      const type = /^-?\d+(\.\d+)?$/.test(s) ? 'number' : /^(true|false)$/i.test(s) ? 'bool' : 'string';
      out.push({ name, type, value: type === 'bool' ? s.toLowerCase() : s, charId: c.id, key: String(p.key).trim() });
    }
    return out;
  }
  /* Koşullarda kullanılabilen tüm adlar: tanımlı değişkenler + karakter özellikleri */
  function declaredNames(doc) {
    return new Set(reg(doc).variables.map((v) => v.name).concat(charVars(doc).map((v) => v.name)));
  }
  function addVariable(doc, name, type, value) {
    const r = ensureReg(doc);
    const nm = uniqueId(String(name || 'flag').replace(/[^\w.\u00C0-\uFFFF]+/g, '_'), new Set(r.variables.map((v) => v.name)));
    const v = { name: nm, type: VAR_TYPES.includes(type) ? type : 'bool', value: value == null ? (type === 'number' ? '0' : type === 'string' ? '' : 'false') : String(value) };
    r.variables.push(v);
    return v;
  }
  /* Şablon / yapıştırma ile gelen karakter ve değişkenleri ekle (olanlar korunur) */
  function mergeRegistry(doc, frag) {
    if (!frag || (!frag.characters && !frag.variables)) return;
    const r = ensureReg(doc);
    for (const c of frag.characters || []) {
      if (!r.characters.some((x) => x.id === c.id)) r.characters.push(cleanCharacter(c, r.characters.length));
    }
    for (const v of frag.variables || []) {
      if (!r.variables.some((x) => x.name === v.name)) r.variables.push({ name: v.name, type: v.type || 'bool', value: v.value == null ? '' : String(v.value) });
    }
  }

  function isDialogueTab(tab) { return !!tab && (tab.kind === 'dialogue' || tab.nodes.some(isDlg)); }
  function allStarts(doc) {
    const out = [];
    for (const tab of doc.tabs) {
      if (!isDialogueTab(tab)) continue;
      for (const n of tab.nodes) if (n.type === 'dlgStart') out.push({ tab, node: n });
    }
    return out;
  }
  function findStart(doc, dlgId) {
    return allStarts(doc).find((s) => s.node.dlgId === dlgId) || null;
  }

  /* Eklenen parçadaki başlangıç kimliklerini belgede tekil yap */
  function prepareInsert(doc, frag) {
    const taken = new Set(allStarts(doc).map((s) => s.node.dlgId));
    for (const n of frag.nodes) {
      if (n.type !== 'dlgStart') continue;
      n.dlgId = uniqueId(slug(n.dlgId || n.text, 'dialogue'), taken);
      taken.add(n.dlgId);
    }
  }

  /* ---------------- Koşul / ifade dili ----------------
     gold >= 50 and not metBefore \u00B7 reputation > 10 || questDone == true \u00B7 name == "Arin"
     Değişken adları harf, rakam, _ ve . içerebilir (quest.stage). */
  const ID_START = /[A-Za-z_\u00C0-\uFFFF]/, ID_PART = /[\w.\u00C0-\uFFFF]/;
  function err(msg, pos) { const e = new Error(msg); e.pos = pos; return e; }

  function tokenize(src) {
    const s = String(src == null ? '' : src), out = [];
    let i = 0;
    while (i < s.length) {
      const c = s[i];
      if (/\s/.test(c)) { i++; continue; }
      const start = i;
      if (/\d/.test(c) || (c === '.' && /\d/.test(s[i + 1] || ''))) {
        while (i < s.length && /[\d.]/.test(s[i])) i++;
        const v = Number(s.slice(start, i));
        if (!isFinite(v)) throw err($t('Geçersiz sayı'), start);
        out.push({ t: 'num', v, p: start });
        continue;
      }
      if (c === '"' || c === "'") {
        i++;
        let v = '';
        while (i < s.length && s[i] !== c) { if (s[i] === '\\' && i + 1 < s.length) i++; v += s[i++]; }
        if (i >= s.length) throw err($t('Kapanmamış tırnak'), start);
        i++;
        out.push({ t: 'str', v, p: start });
        continue;
      }
      if (ID_START.test(c)) {
        while (i < s.length && ID_PART.test(s[i])) i++;
        const w = s.slice(start, i), lw = w.toLowerCase();
        if (lw === 'true' || lw === 'false') out.push({ t: 'bool', v: lw === 'true', p: start });
        else if (lw === 'and') out.push({ t: 'op', v: '&&', p: start });
        else if (lw === 'or') out.push({ t: 'op', v: '||', p: start });
        else if (lw === 'not') out.push({ t: 'op', v: '!', p: start });
        else out.push({ t: 'id', v: w, p: start });
        continue;
      }
      const two = s.slice(i, i + 2);
      if (['==', '!=', '<=', '>=', '&&', '||'].includes(two)) { out.push({ t: 'op', v: two, p: i }); i += 2; continue; }
      if ('<>!+-*/%()'.includes(c)) { out.push({ t: 'op', v: c, p: i }); i++; continue; }
      if (c === '=') throw err($t('Karşılaştırma için "==" kullanın'), i);
      throw err($t('Beklenmeyen karakter: {c}', { c }), i);
    }
    return out;
  }

  function parseExpr(src) {
    const toks = tokenize(src);
    let i = 0;
    const isOp = (v) => toks[i] && toks[i].t === 'op' && toks[i].v === v;
    const CMP = ['==', '!=', '<', '>', '<=', '>='];
    const or = () => { let a = and(); while (isOp('||')) { i++; a = { k: 'bin', op: '||', a, b: and() }; } return a; };
    const and = () => { let a = not(); while (isOp('&&')) { i++; a = { k: 'bin', op: '&&', a, b: not() }; } return a; };
    const not = () => { if (isOp('!')) { i++; return { k: 'un', op: '!', a: not() }; } return cmp(); };
    const cmp = () => {
      let a = add();
      const t = toks[i];
      if (t && t.t === 'op' && CMP.includes(t.v)) { i++; a = { k: 'bin', op: t.v, a, b: add() }; }
      return a;
    };
    const add = () => { let a = mul(); while (isOp('+') || isOp('-')) { const op = toks[i++].v; a = { k: 'bin', op, a, b: mul() }; } return a; };
    const mul = () => { let a = unary(); while (isOp('*') || isOp('/') || isOp('%')) { const op = toks[i++].v; a = { k: 'bin', op, a, b: unary() }; } return a; };
    const unary = () => {
      if (isOp('-')) { i++; return { k: 'un', op: '-', a: unary() }; }
      if (isOp('!')) { i++; return { k: 'un', op: '!', a: unary() }; }
      return primary();
    };
    const primary = () => {
      const t = toks[i];
      if (!t) throw err($t('İfade eksik'), String(src).length);
      if (t.t === 'num' || t.t === 'str' || t.t === 'bool') { i++; return { k: 'lit', v: t.v }; }
      if (t.t === 'id') { i++; return { k: 'var', name: t.v }; }
      if (isOp('(')) {
        i++;
        const e = or();
        if (!isOp(')')) throw err($t('")" eksik'), t.p);
        i++;
        return e;
      }
      throw err($t('Beklenmeyen: {tok}', { tok: String(t.v) }), t.p);
    };
    if (!toks.length) throw err($t('İfade eksik'), 0);
    const ast = or();
    if (i < toks.length) throw err($t('Beklenmeyen: {tok}', { tok: String(toks[i].v) }), toks[i].p);
    return ast;
  }

  function collectVars(ast, out) {
    out = out || new Set();
    if (ast.k === 'var') out.add(ast.name);
    if (ast.a) collectVars(ast.a, out);
    if (ast.b) collectVars(ast.b, out);
    return out;
  }

  const parseCache = new Map();
  /* İfadeyi denetle: { ast, vars } ya da { error, pos } */
  function check(src) {
    const key = String(src == null ? '' : src);
    let r = parseCache.get(key);
    if (r) return r;
    try {
      const ast = parseExpr(key);
      r = { ast, vars: [...collectVars(ast)] };
    } catch (e) { r = { error: e.message, pos: e.pos }; }
    if (parseCache.size > 2000) parseCache.clear();
    parseCache.set(key, r);
    return r;
  }

  const num = (v) => (typeof v === 'number' ? v : typeof v === 'boolean' ? (v ? 1 : 0) : v == null ? 0 : (parseFloat(v) || 0));
  const str = (v) => (v == null ? '' : String(v));
  const truthy = (v) => (typeof v === 'string' ? v !== '' && v.toLowerCase() !== 'false' : !!v);
  function same(a, b) {
    if (a !== undefined && b !== undefined && typeof a === typeof b) return a === b;
    if (typeof a === 'boolean' || typeof b === 'boolean' || a === undefined || b === undefined) return truthy(a) === truthy(b);
    if (typeof a === 'number' || typeof b === 'number') return num(a) === num(b);
    return str(a) === str(b);
  }

  function evaluate(ast, vars) {
    switch (ast.k) {
      case 'lit': return ast.v;
      case 'var': return Object.prototype.hasOwnProperty.call(vars, ast.name) ? vars[ast.name] : undefined;
      case 'un': { const a = evaluate(ast.a, vars); return ast.op === '!' ? !truthy(a) : -num(a); }
      case 'bin': {
        if (ast.op === '&&') return truthy(evaluate(ast.a, vars)) && truthy(evaluate(ast.b, vars));
        if (ast.op === '||') return truthy(evaluate(ast.a, vars)) || truthy(evaluate(ast.b, vars));
        const a = evaluate(ast.a, vars), b = evaluate(ast.b, vars);
        switch (ast.op) {
          case '==': return same(a, b);
          case '!=': return !same(a, b);
          case '<': return num(a) < num(b);
          case '>': return num(a) > num(b);
          case '<=': return num(a) <= num(b);
          case '>=': return num(a) >= num(b);
          case '+': return typeof a === 'string' || typeof b === 'string' ? str(a) + str(b) : num(a) + num(b);
          case '-': return num(a) - num(b);
          case '*': return num(a) * num(b);
          case '/': return num(b) ? num(a) / num(b) : 0;
          case '%': return num(b) ? num(a) % num(b) : 0;
        }
      }
    }
    return undefined;
  }

  /* Koşulu değerlendir: { value: bool } ya da { error } */
  function test(src, vars) {
    const r = check(src);
    if (r.error) return { value: false, error: r.error };
    return { value: truthy(evaluate(r.ast, vars)) };
  }

  /* ---------------- Eylem dili ----------------
     gold -= 10 \u00B7 hasKey = true \u00B7 name = "Arin" \u00B7 visits++ \u00B7 @give_item sword 1 \u00B7 @play_sound("door") \u00B7 // yorum */
  const VAR_RE = '[A-Za-z_\\u00C0-\\uFFFF][\\w.\\u00C0-\\uFFFF]*';
  const RE_EVENT = new RegExp('^@(' + VAR_RE.replace('[\\w.', '[\\w.\\-') + ')\\s*(.*)$');
  const RE_INC = new RegExp('^(' + VAR_RE + ')\\s*(\\+\\+|--)$');
  const RE_SET = new RegExp('^(' + VAR_RE + ')\\s*([+\\-*/]?=)(?!=)\\s*(.*)$');

  function splitArgs(s) {
    const out = [];
    let cur = '', q = null, quoted = false;
    const useComma = /,/.test(s.replace(/"[^"]*"|'[^']*'/g, ''));
    const flush = () => { if (cur.trim() || quoted) out.push(quoted ? cur : cur.trim()); cur = ''; quoted = false; };
    for (const ch of s) {
      if (q) { if (ch === q) q = null; else cur += ch; continue; }
      if (ch === '"' || ch === "'") { q = ch; quoted = true; cur = cur.trim(); continue; }
      if (useComma ? ch === ',' : /\s/.test(ch)) { flush(); continue; }
      cur += ch;
    }
    flush();
    return out;
  }

  function parseAction(line) {
    let m = line.match(RE_EVENT);
    if (m) {
      let rest = m[2].trim();
      if (rest.startsWith('(') && rest.endsWith(')')) rest = rest.slice(1, -1);
      return { type: 'event', name: m[1], args: splitArgs(rest) };
    }
    m = line.match(RE_INC);
    if (m) return { type: 'set', variable: m[1], op: m[2] === '++' ? '+=' : '-=', value: '1' };
    m = line.match(RE_SET);
    if (m) {
      const value = m[3].trim();
      const a = { type: 'set', variable: m[1], op: m[2], value };
      if (!value) a.error = $t('Değer eksik');
      else { const r = check(value); if (r.error) a.error = r.error; }
      return a;
    }
    return { error: $t('Anlaşılamadı. Örnek: gold -= 10 ya da @give_item sword') };
  }

  function parseActions(src) {
    const out = [];
    String(src || '').split('\n').forEach((raw, i) => {
      const line = raw.trim();
      if (!line || line.startsWith('//') || line.startsWith('#')) return;
      out.push(Object.assign({ line: i + 1, src: line }, parseAction(line)));
    });
    return out;
  }

  /* Metindeki {degisken} yerlerini doldur */
  function interpolate(text, vars) {
    return String(text || '').replace(/\{([A-Za-z_\u00C0-\uFFFF][\w.\u00C0-\uFFFF]*)\}/g, (m, k) => (Object.prototype.hasOwnProperty.call(vars, k) ? fmt(vars[k], true) : m));
  }
  function fmt(v, raw) {
    if (typeof v === 'number') return String(Math.round(v * 1000) / 1000);
    if (typeof v === 'string') return raw ? v : JSON.stringify(v);
    return String(v);
  }
  function typedValue(type, raw) {
    const s = String(raw == null ? '' : raw).trim();
    if (type === 'number') return parseFloat(s) || 0;
    if (type === 'bool') return /^(true|1|yes|on)$/i.test(s);
    return String(raw == null ? '' : raw);
  }

  /* ---------------- Yerleşim (boyutlar) ---------------- */
  const F_ITAL = U.font(13, { italic: true }), F_NAME = U.font(13, { bold: true });
  const F_SMALL = U.font(11), F_SMALL_MONO = U.font(11, { mono: true }), F_TITLE = U.font(13.5, { bold: true }), F_MONO = U.font(12, { mono: true });
  const F_CARD_NAME = U.font(15, { bold: true }), F_KEY = U.font(12, { bold: true }), F_ROLE = U.font(12);
  const LH = 17, HEAD = 30, PADX = 12, PADY = 8, MIN_W = 160, OPT_X = 36, COND_LH = 15, CARD_HEAD = 66, CARD_LH = 17;
  const layoutCache = new WeakMap();
  const Md = () => App.Md;
  const docOf = () => (App.Store ? App.Store.doc : null);
  const geo = () => App.Geo;
  const base = (n) => (geo() ? geo().unscaled(n) : n);
  const scaleOf = (n) => (geo() ? geo().fontScale(n) : 1);

  function splitTags(s) { return String(s || '').split(/[\s,]+/).map((t) => t.replace(/^#/, '')).filter(Boolean); }
  function metaText(n) {
    const parts = [];
    if (n.audio) parts.push('\u266A ' + n.audio);
    const tags = splitTags(n.tags);
    if (tags.length) parts.push(tags.map((t) => '#' + t).join(' '));
    return parts.join('   ');
  }

  function layout(n) {
    const ch = n.type === 'dlgCard' ? character(docOf(), n.charId) : null;
    const key = [n.type, n.w, n.text, n.cond, n.actions, n.audio, n.tags, n.target, n.dlgId, n.options ? JSON.stringify(n.options) : '',
      n.charId, n.showDesc, n.showProps, ch ? JSON.stringify([ch.name, ch.role, ch.desc, ch.props, !!ch.portrait]) : ''].join('\u0001');
    const c = layoutCache.get(n);
    if (c && c.key === key) return c.val;
    const w = Math.max(MIN_W, Math.round(+n.w || App.UML.SHAPES[n.type].w));
    const inner = w - PADX * 2;
    let L;
    switch (n.type) {
      case 'dlgLine': {
        const rich = Md().layout(n.text || '', { size: 13, lh: LH, width: inner });
        const bodyH = Math.max(LH, rich.h) + PADY * 2;
        const meta = metaText(n);
        L = { w, rich, bodyH, meta, h: HEAD + bodyH + (meta ? 16 : 0) };
        break;
      }
      case 'dlgChoice': {
        const prompt = n.text ? Md().layout(n.text, { size: 13, lh: LH, width: inner, italic: true }) : null;
        let y = HEAD + (prompt ? prompt.h + PADY + 2 : 0);
        const promptH = y - HEAD;
        const rows = [];
        for (const o of n.options || []) {
          const rich = Md().layout(o.text || ' ', { size: 13, lh: LH, width: w - OPT_X - PADX, inline: true });
          const cond = o.cond ? U.wrapText(o.cond, F_SMALL_MONO, w - OPT_X - PADX) : [];
          const hh = Math.max(LH, rich.h) + cond.length * COND_LH + 12;
          rows.push({ id: o.id, y, h: hh, rich, textH: Math.max(LH, rich.h), cond, limit: pickLimit(o), empty: !o.text });
          y += hh;
        }
        if (!rows.length) y += 32;
        L = { w, prompt, promptH, rows, h: y + 2 };
        break;
      }
      case 'dlgBranch': case 'dlgAction': {
        const src = n.type === 'dlgBranch' ? n.cond : n.actions;
        const lines = [];
        for (const l of String(src || '').split('\n')) {
          if (n.type === 'dlgAction' && !l.trim()) continue;
          lines.push(...U.wrapText(l, F_MONO, inner));
        }
        L = { w, lines, bodyH: Math.max(1, lines.length) * LH + PADY * 2 };
        L.h = HEAD + L.bodyH;
        break;
      }
      case 'dlgCard': {
        let y = CARD_HEAD;
        let desc = null, descY = 0;
        if (ch && n.showDesc !== false && String(ch.desc || '').trim()) {
          desc = Md().layout(ch.desc, { size: 12.5, lh: CARD_LH, width: inner });
          descY = y + 10;
          y = descY + desc.h + 4;
        }
        const kw = Math.min(120, Math.round(inner * 0.36));
        const rows = [];
        const props = ch && n.showProps !== false ? (ch.props || []).filter((p) => String(p.key || '').trim() || String(p.value || '').trim()) : [];
        if (props.length) {
          y += 8;
          for (const p of props) {
            const v = Md().layout(String(p.value || '').trim() || '-', { size: 12.5, lh: CARD_LH, width: inner - kw - 10, inline: true });
            const hh = Math.max(CARD_LH, v.h) + 7;
            rows.push({ y, h: hh, key: String(p.key || ''), v });
            y += hh;
          }
        }
        L = { w, desc, descY, kw, rows, h: Math.max(CARD_HEAD + 8, y + 8) };
        break;
      }
      case 'dlgStart': L = { w, h: 52 }; break;
      case 'dlgJump': L = { w, h: 46 }; break;
      case 'dlgEnd': L = { w, h: n.text ? 50 : 38 }; break;
      default: L = { w, h: 60 };
    }
    layoutCache.set(n, { key, val: L });
    return L;
  }

  /* ---------------- Çizim ---------------- */
  const f = (v) => Math.round(v * 10) / 10;
  function ellipsize(s, fnt, maxW) {
    s = String(s || '');
    if (U.measure(s, fnt) <= maxW) return s;
    while (s.length > 1 && U.measure(s + '\u2026', fnt) > maxW) s = s.slice(0, -1);
    return s + '\u2026';
  }

  function nodeColor(n, doc) {
    if (n.type === 'dlgLine') { const c = character(doc, n.speaker); return c ? c.color : App.UML.SHAPES.dlgLine.color; }
    if (n.type === 'dlgCard') { const c = character(doc, n.charId); return c ? c.color : App.UML.SHAPES.dlgCard.color; }
    return n.color || App.UML.SHAPES[n.type].color;
  }

  /* Başlıktaki küçük simge (12x12, sol üst köşesi x,y) */
  function glyph(type, x, y, col) {
    const st = `fill="none" stroke="${col}" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"`;
    switch (type) {
      case 'dlgStart': return `<path d="M${f(x + 2)},${f(y)} L${f(x + 11)},${f(y + 6)} L${f(x + 2)},${f(y + 12)} Z" fill="${col}"/>`;
      case 'dlgChoice': return `<path d="M${f(x)},${f(y + 2)} h12 M${f(x)},${f(y + 6)} h12 M${f(x)},${f(y + 10)} h8" ${st}/>`;
      case 'dlgBranch': return `<path d="M${f(x + 6)},${f(y)} L${f(x + 12)},${f(y + 6)} L${f(x + 6)},${f(y + 12)} L${f(x)},${f(y + 6)} Z" ${st}/>`;
      case 'dlgAction': return `<path d="M${f(x + 7)},${f(y)} L${f(x + 1)},${f(y + 7)} H${f(x + 6)} L${f(x + 5)},${f(y + 12)} L${f(x + 11)},${f(y + 5)} H${f(x + 6)} Z" fill="${col}"/>`;
      case 'dlgJump': return `<path d="M${f(x)},${f(y + 10)} V${f(y + 6)} Q${f(x)},${f(y + 2)} ${f(x + 4)},${f(y + 2)} H${f(x + 11)} M${f(x + 8)},${f(y - 1)} L${f(x + 11)},${f(y + 2)} L${f(x + 8)},${f(y + 5)}" ${st}/>`;
      case 'dlgEnd': return `<rect x="${f(x + 1)}" y="${f(y + 1)}" width="10" height="10" rx="2" fill="${col}"/>`;
    }
    return '';
  }

  /* Karakter portresi ya da baş harfi. shape: 'circle' | 'rounded' */
  function avatar(ch, id, cx, cy, size, col, shape) {
    const r = size / 2, x = cx - r, y = cy - r;
    const rx = shape === 'circle' ? r : Math.round(size * 0.22);
    if (ch && ch.portrait) {
      const cid = 'clip-' + id;
      return `<clipPath id="${cid}"><rect x="${f(x)}" y="${f(y)}" width="${f(size)}" height="${f(size)}" rx="${f(rx)}"/></clipPath>` +
        `<rect x="${f(x)}" y="${f(y)}" width="${f(size)}" height="${f(size)}" rx="${f(rx)}" fill="${col}"/>` +
        `<image href="${U.esc(ch.portrait)}" x="${f(x)}" y="${f(y)}" width="${f(size)}" height="${f(size)}" preserveAspectRatio="xMidYMid slice" clip-path="url(#${cid})"/>`;
    }
    const name = ch ? ch.name : '';
    return `<rect x="${f(x)}" y="${f(y)}" width="${f(size)}" height="${f(size)}" rx="${f(rx)}" fill="${col}"/>` +
      App.Render.text(cx, cy + size * 0.2, (String(name).trim()[0] || '?').toUpperCase(), { size: f(size * 0.55), bold: true, fill: '#ffffff', anchor: 'middle' });
  }

  /* ctx: renderContext() sonucu (bağlı seçenekler, canlı sorun işaretleri) */
  function render(n, T, live, ctx) {
    const R = App.Render;
    const doc = docOf();
    const L = layout(n), x = n.x, y = n.y, w = L.w, h = L.h;
    const col = nodeColor(n, doc);
    const c = App.Theme.tint(T, col);
    const tx = (px, py, s, o) => R.text(px, py, s, Object.assign({ fill: T.text }, o));
    let s = `<g class="node" data-node="${n.id}">`;
    if (n.type === 'dlgCard') {
      s += renderCard(n, L, T, col, c, tx);
    } else if (PILLS.has(n.type)) {
      const r = Math.min(h / 2, 18);
      s += `<rect x="${f(x)}" y="${f(y)}" width="${f(w)}" height="${f(h)}" rx="${r}" fill="${c.fill}" stroke="${c.stroke}" stroke-width="1.5"/>`;
      s += glyph(n.type, x + 13, y + h / 2 - 6, c.stroke);
      const tw = w - 46;
      if (n.type === 'dlgStart') {
        s += tx(x + 33, y + 22, ellipsize(n.text || $t('Başlangıç'), F_TITLE, tw), { size: 13.5, bold: true });
        s += tx(x + 33, y + 39, ellipsize(n.dlgId || '?', F_SMALL_MONO, tw), { size: 11, mono: true, fill: T.textDim });
      } else if (n.type === 'dlgJump') {
        s += tx(x + 33, y + 19, $t('Diyaloğa atla'), { size: 11, fill: T.textDim });
        s += tx(x + 33, y + 35, ellipsize(n.target || '?', F_SMALL_MONO, tw), { size: 12, mono: true, bold: true });
      } else {
        s += tx(x + 33, y + (n.text ? 21 : 24), $t('Bitiş'), { size: 13, bold: true });
        if (n.text) s += tx(x + 33, y + 37, ellipsize(n.text, F_SMALL_MONO, tw), { size: 11, mono: true, fill: T.textDim });
      }
    } else {
      const rr = 8;
      s += `<rect x="${f(x)}" y="${f(y)}" width="${f(w)}" height="${f(h)}" rx="${rr}" fill="${T.node}"/>`;
      s += `<path d="M${f(x)},${f(y + HEAD)} V${f(y + rr)} Q${f(x)},${f(y)} ${f(x + rr)},${f(y)} H${f(x + w - rr)} Q${f(x + w)},${f(y)} ${f(x + w)},${f(y + rr)} V${f(y + HEAD)} Z" fill="${c.header}"/>`;
      s += `<rect x="${f(x)}" y="${f(y)}" width="${f(w)}" height="${f(h)}" rx="${rr}" fill="none" stroke="${c.stroke}" stroke-width="1.4"/>`;
      if (n.type === 'dlgLine') s += renderLine(n, L, T, col, c, tx);
      else {
        s += glyph(n.type, x + 11, y + 9, c.stroke);
        s += tx(x + 30, y + 19.5, App.UML.SHAPES[n.type].label, { size: 12.5, bold: true });
        if (n.type === 'dlgChoice') s += renderChoice(n, L, T, col, c, tx, ctx);
        else {
          const by = y + HEAD + PADY;
          if (!L.lines.length) {
            s += tx(x + PADX, by + 12.5, n.type === 'dlgBranch' ? $t('koşul yazın, ör. gold >= 50') : $t('eylem yazın, ör. gold -= 10'), { size: 12, italic: true, fill: T.textDim });
          }
          L.lines.forEach((ln, i) => {
            const ev = n.type === 'dlgAction' && /^\s*@/.test(ln), cm = /^\s*(\/\/|#)/.test(ln);
            s += tx(x + PADX, by + i * LH + 12.5, ln, { size: 12, mono: true, fill: ev ? c.stroke : cm ? T.textDim : T.text, bold: ev });
          });
        }
      }
    }
    const issue = ctx && ctx.issues && ctx.issues.get(n.id);
    if (live && issue) {
      const ic = issue === 'error' ? '#ff5d5d' : '#f5a623';
      s += `<circle cx="${f(x + w - 3)}" cy="${f(y + 3)}" r="8" fill="${ic}" stroke="${T.canvas}" stroke-width="2"/>`;
      s += R.text(x + w - 3, y + 7, '!', { size: 11, bold: true, fill: '#ffffff', anchor: 'middle' });
    }
    return s + '</g>';
  }

  function renderLine(n, L, T, col, c, tx) {
    const x = n.x, y = n.y, w = L.w;
    const ch = character(docOf(), n.speaker);
    let s = avatar(ch, n.id, x + 17, y + 15, 18, col, 'circle');
    const name = ch ? ch.name : n.speaker || '';
    const emo = n.emotion ? ' \u00B7 ' + n.emotion : '';
    const emoW = emo ? Math.min(U.measure(emo, F_ITAL), (w - 44) * 0.45) : 0;
    if (name) {
      const nm = ellipsize(ch ? name : name + ' ?', F_NAME, w - 44 - emoW);
      s += tx(x + 32, y + 19.5, nm, { size: 13, bold: true, fill: ch ? T.text : T.textDim });
      if (emo) s += tx(x + 32 + U.measure(nm, F_NAME), y + 19.5, ellipsize(emo, F_ITAL, emoW), { size: 12, italic: true, fill: T.textDim });
    } else {
      s += tx(x + 32, y + 19.5, $t('(konuşmacı seçin)'), { size: 12, italic: true, fill: T.textDim });
    }
    const by = y + HEAD + PADY;
    if (!L.rich.lines.length) s += tx(x + PADX, by + 12.5, $t('Replik yazın…'), { size: 13, italic: true, fill: T.textDim });
    else s += Md().render(L.rich, x + PADX, by, { fill: T.text, dim: T.textDim, code: c.stroke });
    if (L.meta) s += tx(x + PADX, y + L.h - 9, ellipsize(L.meta, F_SMALL, w - PADX * 2), { size: 11, fill: T.textDim });
    return s;
  }

  function renderChoice(n, L, T, col, c, tx, ctx) {
    const x = n.x, y = n.y, w = L.w;
    let s = '';
    if (L.prompt) s += Md().render(L.prompt, x + PADX, y + HEAD + PADY - 2, { fill: T.textDim, dim: T.textDim, code: c.stroke, italic: true });
    if (!L.rows.length) {
      s += tx(x + PADX, y + HEAD + L.promptH + 21, $t('Seçenek yok: kenardaki noktadan sürükleyin'), { size: 12, italic: true, fill: T.textDim });
    }
    L.rows.forEach((r, i) => {
      const ry = y + r.y;
      s += `<line x1="${f(x)}" y1="${f(ry)}" x2="${f(x + w)}" y2="${f(ry)}" stroke="${c.stroke}" stroke-opacity="0.35" stroke-width="1"/>`;
      const linked = !ctx || !ctx.connected || ctx.connected.has(n.id + ':' + r.id);
      s += `<rect x="${f(x + 10)}" y="${f(ry + 7)}" width="18" height="18" rx="5" fill="${U.rgba(col, T.dark ? 0.28 : 0.2)}"${linked ? '' : ' stroke="#ff5d5d" stroke-width="1.4" stroke-dasharray="3 2"'}/>`;
      s += App.Render.text(x + 19, ry + 20, String(i + 1), { size: 11, bold: true, fill: T.text, anchor: 'middle' });
      if (r.empty) s += tx(x + OPT_X, ry + 6 + 12.5, $t('(boş seçenek)'), { size: 13, italic: true, fill: T.textDim });
      else s += Md().render(r.rich, x + OPT_X, ry + 6, { fill: T.text, dim: T.textDim, code: c.stroke });
      const cy = ry + 6 + r.textH;
      r.cond.forEach((ln, k) => { s += tx(x + OPT_X, cy + k * COND_LH + 11, ln, { size: 11, mono: true, fill: App.Theme.tint(T, '#f5a623').stroke }); });
      if (r.limit) s += tx(x + w - 8, ry + 19, r.limit + '\u00D7', { size: 11, bold: true, fill: T.textDim, anchor: 'end' });
    });
    return s;
  }

  /* Kişi kartı: karakter sayfasındaki bilgileri tuvalde gösterir */
  function renderCard(n, L, T, col, c, tx) {
    const x = n.x, y = n.y, w = L.w, h = L.h, rr = 12;
    const ch = character(docOf(), n.charId);
    let s = `<rect x="${f(x)}" y="${f(y)}" width="${f(w)}" height="${f(h)}" rx="${rr}" fill="${T.node}"/>`;
    s += `<path d="M${f(x)},${f(y + CARD_HEAD)} V${f(y + rr)} Q${f(x)},${f(y)} ${f(x + rr)},${f(y)} H${f(x + w - rr)} Q${f(x + w)},${f(y)} ${f(x + w)},${f(y + rr)} V${f(y + CARD_HEAD)} Z" fill="${c.header}"/>`;
    s += `<rect x="${f(x)}" y="${f(y)}" width="${f(w)}" height="${f(h)}" rx="${rr}" fill="none" stroke="${c.stroke}" stroke-width="1.6"/>`;
    s += avatar(ch, n.id, x + 12 + 22, y + 11 + 22, 44, col, 'rounded');
    const tw = w - 78;
    if (!ch) {
      s += tx(x + 66, y + 30, n.charId ? $t('Bilinmeyen karakter: {id}', { id: n.charId }) : $t('(karakter seçin)'), { size: 13, italic: true, fill: T.textDim });
      return s;
    }
    s += tx(x + 66, y + 30, ellipsize(ch.name, F_CARD_NAME, tw), { size: 15, bold: true });
    s += tx(x + 66, y + 48, ellipsize(ch.role ? Md().strip(ch.role, true) : '@' + ch.id, F_ROLE, tw), { size: 12, fill: T.textDim, italic: !!ch.role });
    if (L.desc) s += Md().render(L.desc, x + PADX, y + L.descY, { fill: T.text, dim: T.textDim, code: c.stroke });
    if (L.rows.length) {
      const sy = y + L.rows[0].y - 4;
      s += `<line x1="${f(x + PADX)}" y1="${f(sy)}" x2="${f(x + w - PADX)}" y2="${f(sy)}" stroke="${c.stroke}" stroke-opacity="0.35" stroke-width="1"/>`;
      for (const r of L.rows) {
        s += tx(x + PADX, y + r.y + 12.5, ellipsize(r.key, F_KEY, L.kw), { size: 12, bold: true, fill: T.textDim });
        s += Md().render(r.v, x + PADX + L.kw + 10, y + r.y, { fill: T.text, dim: T.textDim, code: c.stroke });
      }
    }
    return s;
  }

  /* renderTab başına bir kez hesaplanır */
  function renderContext(tab, live) {
    if (!tab.nodes.some(isDlg)) return null;
    const connected = new Set();
    for (const e of tab.edges) if (e.opt) connected.add(e.from + ':' + e.opt);
    let issues = null;
    if (live && App.Store && App.Store.doc && App.Store.doc.tabs.includes(tab)) issues = issueMap(App.Store.doc, tab);
    return { connected, issues };
  }

  /* Diyalog kenarının etiket / rengi: seçenekte numara, koşulda Doğru / Yanlış */
  function edgeDecor(e, src) {
    if (!src) return null;
    if (src.type === 'dlgChoice') {
      const i = src.options.findIndex((o) => o.id === e.opt);
      return { label: i >= 0 ? String(i + 1) : '?' };
    }
    if (src.type === 'dlgBranch') {
      const no = e.branch === 'false';
      return { label: no ? $t('Yanlış') : $t('Doğru'), color: no ? FALSE_COLOR : TRUE_COLOR };
    }
    return null;
  }

  /* ---------------- Düzenleme yardımcıları ---------------- */
  /* Çift tıklanan yerdeki alan (yazı boyutu ölçeği hesaba katılır) */
  function hitField(n, p) {
    const L = layout(base(n)), ry = (p.y - n.y) / scaleOf(n);
    switch (n.type) {
      case 'dlgLine': return ry < HEAD ? 'speaker' : 'text';
      case 'dlgChoice': {
        const row = L.rows.find((r) => ry >= r.y && ry < r.y + r.h);
        return row ? 'opt:' + row.id : 'text';
      }
      case 'dlgCard': return 'card';
      case 'dlgBranch': return 'cond';
      case 'dlgAction': return 'actions';
      case 'dlgJump': return 'target';
      default: return 'text';
    }
  }

  /* Satır içi düzenleyici için konum (temel ölçekte), değer ve uygulama */
  function inlineSpec(n, field) {
    if (n.type === 'dlgCard') return null;
    const L = layout(base(n)), x = n.x, y = n.y, w = L.w;
    if (!field || field === 'speaker') {
      field = { dlgBranch: 'cond', dlgAction: 'actions', dlgJump: 'target' }[n.type] || 'text';
      if (n.type === 'dlgChoice' && !n.text && n.options.length) field = 'opt:' + n.options[0].id;
    }
    const left = { align: 'left', grow: true, fontSize: 13, lineH: LH };
    const mono = { align: 'left', grow: true, fontSize: 12, lineH: LH, mono: true };
    if (field.startsWith('opt:')) {
      const id = field.slice(4);
      const o = n.options.find((q) => q.id === id), r = L.rows.find((q) => q.id === id);
      if (!o || !r) return null;
      return { rect: { x: x + OPT_X - 6, y: y + r.y, w: w - OPT_X + 6, h: r.h }, value: o.text, opts: Object.assign({}, left, { padX: 6, padY: 6 }), apply: (v) => { o.text = v.replace(/\s*\n\s*/g, ' ').trim(); } };
    }
    switch (n.type) {
      case 'dlgLine':
        return { rect: { x, y: y + HEAD, w, h: L.bodyH }, value: n.text, opts: Object.assign({}, left, { padX: PADX, padY: PADY }), apply: (v) => { n.text = v.trim(); } };
      case 'dlgChoice':
        return { rect: { x, y: y + HEAD, w, h: Math.max(L.promptH, 34) }, value: n.text, opts: Object.assign({}, left, { padX: PADX, padY: PADY }), apply: (v) => { n.text = v.trim(); } };
      case 'dlgBranch':
        return { rect: { x, y: y + HEAD, w, h: L.bodyH }, value: n.cond, opts: Object.assign({}, mono, { padX: PADX, padY: PADY }), apply: (v) => { n.cond = v.replace(/\s*\n\s*/g, ' ').trim(); } };
      case 'dlgAction':
        return { rect: { x, y: y + HEAD, w, h: L.bodyH }, value: n.actions, opts: Object.assign({}, mono, { padX: PADX, padY: PADY, members: true }), apply: (v) => { n.actions = v.split('\n').map((l) => l.trim()).filter(Boolean).join('\n'); } };
      case 'dlgStart':
        return { rect: { x: x + 26, y: y + 6, w: w - 30, h: 26 }, value: n.text, opts: { align: 'left', fontSize: 13.5, bold: true, lineH: 18, padX: 6, padY: 3 }, apply: (v) => { n.text = v.replace(/\n/g, ' ').trim(); } };
      case 'dlgJump':
        return { rect: { x: x + 26, y: y + 21, w: w - 30, h: 22 }, value: n.target, opts: { align: 'left', fontSize: 12, mono: true, lineH: 16, padX: 6, padY: 2 }, apply: (v) => { n.target = v.replace(/\s+/g, '').trim(); } };
      case 'dlgEnd':
        return { rect: { x: x + 26, y: y + L.h - 24, w: w - 30, h: 20 }, value: n.text, opts: { align: 'left', fontSize: 11.5, mono: true, lineH: 15, padX: 6, padY: 2 }, apply: (v) => { n.text = v.replace(/\s+/g, '_').trim(); } };
    }
    return null;
  }

  /* Kenar uçlarını düğüm türüyle uyumlu tut: seçenek kenarında opt, koşul kenarında branch */
  function sync(tab) {
    const nm = new Map(tab.nodes.map((n) => [n.id, n]));
    const used = new Map();
    let changed = false;
    for (const e of tab.edges) {
      const src = nm.get(e.from);
      if (src && src.type === 'dlgChoice') {
        let set = used.get(src.id);
        if (!set) used.set(src.id, (set = new Set()));
        if (!(e.opt && src.options.some((o) => o.id === e.opt) && !set.has(e.opt))) {
          const free = src.options.find((o) => !set.has(o.id) && !tab.edges.some((x) => x !== e && x.from === src.id && x.opt === o.id));
          if (free) e.opt = free.id;
          else { const o = newOption(e.label || ''); src.options.push(o); e.opt = o.id; }
          changed = true;
        }
        set.add(e.opt);
        if (e.branch) { delete e.branch; changed = true; }
      } else if (src && src.type === 'dlgBranch') {
        if (e.branch !== 'true' && e.branch !== 'false') {
          e.branch = tab.edges.some((x) => x !== e && x.from === src.id && x.branch === 'true') ? 'false' : 'true';
          changed = true;
        }
        if (e.opt) { delete e.opt; changed = true; }
      } else if (e.opt || e.branch) { delete e.opt; delete e.branch; changed = true; }
    }
    return changed;
  }

  /* Yeni kenar bağlandığında (Store.mutate içinde çağrılır) */
  function onConnect(src, e, tab) {
    if (!src) return;
    if (src.type === 'dlgChoice') {
      const used = new Set(tab.edges.filter((x) => x !== e && x.from === src.id && x.opt).map((x) => x.opt));
      const free = src.options.find((o) => !used.has(o.id));
      if (free) e.opt = free.id;
      else { const o = newOption(); src.options.push(o); e.opt = o.id; }
    } else if (src.type === 'dlgBranch') {
      e.branch = tab.edges.some((x) => x !== e && x.from === src.id && x.branch === 'true') ? 'false' : 'true';
    }
  }

  function outEdges(tab, id) { return tab.edges.filter((e) => e.from === id); }

  /* Geriye doğru en yakın replik (konuşmacı tahmini için) */
  function previousLine(tab, node) {
    const nm = new Map(tab.nodes.map((n) => [n.id, n]));
    let frontier = [node.id];
    const seen = new Set(frontier);
    for (let d = 0; d < 6 && frontier.length; d++) {
      const next = [];
      for (const id of frontier) {
        for (const e of tab.edges) {
          if (e.to !== id || seen.has(e.from)) continue;
          seen.add(e.from);
          const p = nm.get(e.from);
          if (!p) continue;
          if (p.type === 'dlgLine') return p;
          if (p.type === 'dlgCard') return { type: 'dlgLine', speaker: p.charId };
          next.push(p.id);
        }
      }
      frontier = next;
    }
    return null;
  }
  /* Sıradaki replikte kim konuşur: önceki replikten farklı biri konuşuyorsa sıra ona geçer.
     Bilgi yoksa sonraki replikteki ya da sekmede en çok konuşan karakter. */
  function guessSpeaker(tab, src) {
    if (src.type === 'dlgCard') return src.charId || '';
    const prev = previousLine(tab, src);
    if (src.type === 'dlgLine') {
      if (prev && prev.speaker && prev.speaker !== src.speaker) return prev.speaker;
      if (src.speaker) return src.speaker;
    } else if (prev && prev.speaker) return prev.speaker;
    const nm = new Map(tab.nodes.map((n) => [n.id, n]));
    for (const e of tab.edges) {
      const t = e.from === src.id && nm.get(e.to);
      if (t && t.type === 'dlgLine' && t.speaker) return t.speaker;
    }
    const count = new Map();
    for (const n of tab.nodes) if (n.type === 'dlgLine' && n.speaker) count.set(n.speaker, (count.get(n.speaker) || 0) + 1);
    let best = '', k = 0;
    for (const [id, c] of count) if (c > k) { best = id; k = c; }
    return best;
  }

  /* ---------------- Doğrulama ---------------- */
  function reachable(tab, ids) {
    const seen = new Set(ids), q = [...ids];
    while (q.length) {
      const id = q.shift();
      for (const e of tab.edges) if (e.from === id && !seen.has(e.to)) { seen.add(e.to); q.push(e.to); }
    }
    return seen;
  }

  function validate(doc, onlyTabId) {
    const issues = [];
    const R = reg(doc);
    const chars = new Set(R.characters.map((c) => c.id));
    const declared = declaredNames(doc);
    const starts = allStarts(doc);
    const idCount = new Map();
    for (const s of starts) idCount.set(s.node.dlgId, (idCount.get(s.node.dlgId) || 0) + 1);
    for (const tab of doc.tabs) {
      if (!isDialogueTab(tab) || (onlyTabId && tab.id !== onlyTabId)) continue;
      const push = (level, node, msg) => issues.push({ level, tab: tab.id, node: node ? node.id : null, msg });
      const undeclared = (node, names) => {
        for (const v of new Set(names)) if (!declared.has(v)) push('warn', node, $t('Tanımsız değişken: {name}', { name: v }));
      };
      const expr = (node, src, prefix) => {
        const r = check(src);
        if (r.error) push('error', node, prefix + r.error);
        else undeclared(node, r.vars);
      };
      const nodes = tab.nodes.filter(isFlow);
      const nm = new Map(tab.nodes.filter(isFlow).map((n) => [n.id, n]));
      const tabStarts = nodes.filter((n) => n.type === 'dlgStart');
      if (nodes.length && !tabStarts.length) push('error', null, $t('Bu sekmede Başlangıç düğümü yok'));
      const reach = reachable(tab, tabStarts.map((n) => n.id));
      for (const n of nodes) {
        const out = outEdges(tab, n.id).filter((e) => nm.has(e.to));
        const single = () => { if (out.length > 1) push('error', n, $t('Birden fazla çıkış var; dallanma için Koşul ya da Seçim kullanın')); };
        const deadEnd = () => { if (!out.length) push('warn', n, $t('Çıkış yok; diyalog burada biter (Bitiş ekleyin)')); };
        switch (n.type) {
          case 'dlgStart':
            if (!n.dlgId) push('error', n, $t('Diyalog kimliği boş'));
            else if (idCount.get(n.dlgId) > 1) push('error', n, $t('"{id}" kimliği birden fazla başlangıçta kullanılıyor', { id: n.dlgId }));
            if (!out.length) push('error', n, $t('Başlangıçtan çıkan bağlantı yok'));
            single();
            break;
          case 'dlgLine':
            if (!n.speaker) push('warn', n, $t('Konuşmacı seçilmemiş'));
            else if (!chars.has(n.speaker)) push('warn', n, $t('Bilinmeyen karakter: {id}', { id: n.speaker }));
            if (!n.text.trim()) push('warn', n, $t('Replik metni boş'));
            single(); deadEnd();
            break;
          case 'dlgChoice':
            if (!n.options.length) push('error', n, $t('Seçenek yok'));
            n.options.forEach((o, i) => {
              const k = i + 1;
              if (!out.some((e) => e.opt === o.id)) push('error', n, $t('Seçenek {n} bağlı değil', { n: k }));
              if (!o.text.trim()) push('warn', n, $t('Seçenek {n} metni boş', { n: k }));
              if (o.cond.trim()) expr(n, o.cond, $t('Seçenek {n} koşulu: ', { n: k }));
            });
            break;
          case 'dlgBranch':
            if (!n.cond.trim()) push('error', n, $t('Koşul boş'));
            else expr(n, n.cond, '');
            if (!out.some((e) => e.branch !== 'false')) push('error', n, $t('"Doğru" çıkışı bağlı değil'));
            if (!out.some((e) => e.branch === 'false')) push('error', n, $t('"Yanlış" çıkışı bağlı değil'));
            if (out.filter((e) => e.branch === 'false').length > 1 || out.filter((e) => e.branch !== 'false').length > 1) push('error', n, $t('Koşulun yalnızca bir Doğru ve bir Yanlış çıkışı olabilir'));
            break;
          case 'dlgAction': {
            const acts = parseActions(n.actions);
            if (!acts.length) push('warn', n, $t('Eylem yazılmamış'));
            for (const a of acts) {
              if (a.error) push('error', n, $t('Satır {n}: {msg}', { n: a.line, msg: a.error }));
              else if (a.type === 'set') {
                const r = check(a.value);
                undeclared(n, [a.variable].concat(r.vars || []));
              }
            }
            single(); deadEnd();
            break;
          }
          case 'dlgJump':
            if (!n.target) push('error', n, $t('Hedef diyalog seçilmemiş'));
            else if (!findStart(doc, n.target)) push('error', n, $t('Hedef diyalog bulunamadı: {id}', { id: n.target }));
            if (out.length) push('warn', n, $t('Bu düğümden sonraki bağlantılar yok sayılır'));
            break;
          case 'dlgEnd':
            if (out.length) push('warn', n, $t('Bu düğümden sonraki bağlantılar yok sayılır'));
            break;
        }
        if (n.type !== 'dlgStart' && tabStarts.length && !reach.has(n.id)) push('warn', n, $t('Hiçbir başlangıçtan ulaşılamıyor'));
      }
    }
    return issues;
  }

  /* Düğüm -> en ciddi sorun düzeyi */
  function issueMap(doc, tab) {
    const m = new Map();
    for (const i of validate(doc, tab.id)) {
      if (!i.node) continue;
      if (m.get(i.node) !== 'error') m.set(i.node, i.level);
    }
    return m;
  }

  /* ---------------- Oyun için JSON ----------------
     Düz şema: tüm düğümler aynı alan adlarını kullanır, değerler metindir.
     Böylece Unity JsonUtility dahil her ayrıştırıcıyla okunabilir. */
  /* opts.tabId: yalnızca o sekme · opts.tabIds: yalnızca bu sekmeler · opts.owner: yalnızca o karakterin sayfaları */
  function exportTabs(doc, opts) {
    opts = opts || {};
    return doc.tabs.filter((t) => isDialogueTab(t) && (opts.tabId ? t.id === opts.tabId : opts.tabIds ? opts.tabIds.includes(t.id) : opts.owner ? t.owner === opts.owner : true));
  }
  /* Sekmelerdeki koşul, eylem ve {metin} içinde geçen adlar ile konuşan karakterler */
  function usage(tabs) {
    const names = new Set(), speakers = new Set();
    const inText = (s) => { String(s || '').replace(/\{([A-Za-z_À-￿][\w.À-￿]*)\}/g, (m, k) => { names.add(k); return m; }); };
    const expr = (s) => { if (String(s || '').trim()) for (const v of check(s).vars || []) names.add(v); };
    for (const tab of tabs) {
      if (tab.owner) speakers.add(tab.owner);
      for (const n of tab.nodes) {
        if (n.type === 'dlgLine') { inText(n.text); if (n.speaker) speakers.add(n.speaker); }
        else if (n.type === 'dlgBranch') expr(n.cond);
        else if (n.type === 'dlgChoice') { inText(n.text); for (const o of n.options) { inText(o.text); expr(o.cond); } }
        else if (n.type === 'dlgAction') for (const a of parseActions(n.actions)) if (!a.error && a.type === 'set') { names.add(a.variable); expr(a.value); }
      }
    }
    return { names, speakers };
  }

  function exportData(doc, opts) {
    opts = opts || {};
    const R = reg(doc);
    const scoped = !!(opts.tabId || opts.tabIds || opts.owner);
    const tabs = exportTabs(doc, opts);
    const use = usage(tabs);
    const dialogues = [];
    for (const tab of tabs) {
      const owner = tabOwner(doc, tab);
      const nm = new Map(tab.nodes.filter(isFlow).map((n) => [n.id, n]));
      const outs = new Map();
      for (const e of tab.edges) { if (!nm.has(e.to)) continue; if (!outs.has(e.from)) outs.set(e.from, []); outs.get(e.from).push(e); }
      // başlangıca geri dönen bağlantı, başlangıcın ilk düğümüne gider
      const resolve = (id) => {
        const seen = new Set();
        while (id && !seen.has(id)) {
          seen.add(id);
          const n = nm.get(id);
          if (!n || !isFlow(n)) return null;
          if (n.type !== 'dlgStart') return id;
          const e = (outs.get(id) || [])[0];
          id = e ? e.to : null;
        }
        return null;
      };
      const firstNext = (n) => { const e = (outs.get(n.id) || [])[0]; return e ? resolve(e.to) : null; };
      const starts = tab.nodes.filter((n) => n.type === 'dlgStart').sort((a, b) => a.y - b.y || a.x - b.x);
      for (const st of starts) {
        const first = firstNext(st);
        const order = [];
        const seen = new Set();
        const q = first ? [first] : [];
        if (first) seen.add(first);
        while (q.length) {
          const id = q.shift();
          order.push(id);
          for (const e of outs.get(id) || []) {
            const t = resolve(e.to);
            if (t && !seen.has(t)) { seen.add(t); q.push(t); }
          }
        }
        const nodes = order.map((id) => exportNode(nm.get(id), outs, resolve, firstNext));
        const d = { id: st.dlgId || slug(st.text, 'dialogue'), title: st.text || '' };
        if (owner) d.character = owner.id;   // bu diyalog hangi karakterin sayfasında
        d.start = first;
        d.nodes = nodes;
        dialogues.push(d);
      }
    }
    const declared = new Set(R.variables.map((v) => v.name));
    // koşullarda / metinde kullanılan karakter özellikleri oyuna değişken olarak gider (önizlemeyle aynı davransın)
    const props = charVars(doc).filter((v) => use.names.has(v.name) && !declared.has(v.name));
    const typed = (v) => ({ name: v.name, type: v.type, defaultValue: String(fmt(typedValue(v.type, v.value), true)) });
    return {
      format: FORMAT, version: FORMAT_VERSION, project: doc.name || '',
      // karakter sayfasındaki ayrıntılar (açıklama, portre) oyuna gitmez; tek sayfa / karakter aktarımında yalnızca geçen karakterler
      characters: R.characters.filter((c) => !scoped || use.speakers.has(c.id)).map((c) => ({ id: c.id, name: plain(c.name, true), color: c.color })),
      // tek sayfa / karakter aktarımında yalnızca o sayfalarda geçen değişkenler
      variables: R.variables.filter((v) => !scoped || use.names.has(v.name)).map(typed).concat(props.map(typed)),
      dialogues,
    };
  }

  /* Markdown işaretleri oyuna gitmez */
  const plain = (s, inline) => (App.Md ? App.Md.strip(s || '', inline) : String(s || ''));

  function exportNode(n, outs, resolve, firstNext) {
    const o = { id: n.id, type: EXPORT_TYPE[n.type] };
    const out = outs.get(n.id) || [];
    switch (n.type) {
      case 'dlgLine': {
        o.speaker = n.speaker || '';
        o.text = plain(n.text);
        if (n.emotion) o.emotion = n.emotion;
        if (n.audio) o.audio = n.audio;
        const tags = splitTags(n.tags);
        if (tags.length) o.tags = tags;
        o.next = firstNext(n);
        break;
      }
      case 'dlgChoice':
        if (n.text) o.text = plain(n.text);
        o.options = n.options.map((op) => {
          const r = { id: n.id + '.' + op.id, text: plain(op.text, true) };
          if (op.cond.trim()) r.condition = op.cond.trim();
          const lim = pickLimit(op);
          if (lim) r.maxPicks = lim;
          const e = out.find((x) => x.opt === op.id);
          r.next = e ? resolve(e.to) : null;
          return r;
        });
        break;
      case 'dlgBranch': {
        o.condition = n.cond.trim();
        const t = out.find((e) => e.branch !== 'false'), fl = out.find((e) => e.branch === 'false');
        o.ifTrue = t ? resolve(t.to) : null;
        o.ifFalse = fl ? resolve(fl.to) : null;
        break;
      }
      case 'dlgAction':
        o.actions = parseActions(n.actions).filter((a) => !a.error).map((a) => (a.type === 'event'
          ? { type: 'event', name: a.name, args: a.args }
          : { type: 'set', variable: a.variable, op: a.op, value: a.value }));
        o.next = firstNext(n);
        break;
      case 'dlgJump': o.dialogue = n.target || ''; break;
      case 'dlgEnd': if (n.text) o.result = n.text; break;
    }
    return o;
  }

  /* Dışa aktarılan JSON'u okuyan Unity (JsonUtility) veri sınıfları */
  function csharpModel() {
    return `// Generated by UML Studio. Data model for the dialogue JSON export (format "${FORMAT}", version ${FORMAT_VERSION}).
// Usage:
//   DialogueDatabase db = JsonUtility.FromJson<DialogueDatabase>(jsonAsset.text);
//   Dialogue d = db.FindDialogue("weapon_shop");
//   DialogueNode node = d.Find(d.start);
// Node types: "line", "choice", "condition", "action", "jump", "end".
// Conditions are plain strings (e.g. "gold >= 50 and not metBefore"); values are strings, parse them by variable type.
using System;
using UnityEngine;

[Serializable]
public class DialogueDatabase
{
    public string format;
    public int version;
    public string project;
    public DialogueCharacter[] characters;
    public DialogueVariable[] variables;
    public Dialogue[] dialogues;

    public Dialogue FindDialogue(string id) => Array.Find(dialogues, d => d.id == id);
    public DialogueCharacter FindCharacter(string id) => Array.Find(characters, c => c.id == id);
}

[Serializable]
public class DialogueCharacter
{
    public string id;
    public string name;
    public string color;
}

[Serializable]
public class DialogueVariable
{
    public string name;
    public string type;          // "bool", "number" or "string"
    public string defaultValue;
}

[Serializable]
public class Dialogue
{
    public string id;
    public string title;
    public string character;     // id of the character whose page this dialogue is on (empty if none)
    public string start;         // id of the first node
    public DialogueNode[] nodes;

    public DialogueNode Find(string nodeId) => string.IsNullOrEmpty(nodeId) ? null : Array.Find(nodes, n => n.id == nodeId);
}

[Serializable]
public class DialogueNode
{
    public string id;
    public string type;

    // line
    public string speaker;
    public string text;          // line text, or the optional prompt of a choice
    public string emotion;
    public string audio;
    public string[] tags;

    // line, action
    public string next;

    // choice
    public DialogueOption[] options;

    // condition
    public string condition;
    public string ifTrue;
    public string ifFalse;

    // action
    public DialogueAction[] actions;

    // jump
    public string dialogue;

    // end
    public string result;
}

[Serializable]
public class DialogueOption
{
    public string id;
    public string text;
    public string condition;     // empty = always available
    public int maxPicks;         // hide after it has been picked this many times (0 = no limit)
    public string next;
}

[Serializable]
public class DialogueAction
{
    public string type;          // "set" or "event"
    public string variable;      // set
    public string op;            // set: "=", "+=", "-=", "*=", "/="
    public string value;         // set: expression, e.g. "10" or "gold - 5"
    public string name;          // event
    public string[] args;        // event
}
`;
  }

  /* ---------------- Unity için sade JSON ----------------
     Yalnızca diyaloglar, replikler, seçimler ve sonuçları. Renkler, karakter listesi, duygu / ses / etiket,
     seçenek kimlikleri ve biçim bilgisi atılır; konuşmacı karakterin adıyla yazılır, boş alanlar yazılmaz.
     Değişkenler yalnızca belgede tanımlıysa (koşullar onlara bakar) ad ve başlangıç değeriyle gelir. */
  function exportUnity(doc, opts) {
    const full = exportData(doc, opts);
    const names = new Map(full.characters.map((c) => [c.id, c.name]));
    const put = (o, k, v) => { if (v != null && v !== '' && !(Array.isArray(v) && !v.length)) o[k] = v; return o; };
    const node = (n) => {
      const o = { id: n.id, type: n.type };
      switch (n.type) {
        case 'line':
          put(o, 'speaker', n.speaker ? names.get(n.speaker) || n.speaker : '');
          put(o, 'text', n.text);
          put(o, 'next', n.next);
          break;
        case 'choice':
          put(o, 'text', n.text);
          o.choices = n.options.map((op) => put(put(put(put({}, 'text', op.text), 'condition', op.condition), 'maxPicks', op.maxPicks), 'next', op.next));
          break;
        case 'condition':
          put(o, 'condition', n.condition);
          put(o, 'ifTrue', n.ifTrue);
          put(o, 'ifFalse', n.ifFalse);
          break;
        case 'action':
          o.actions = n.actions.map((a) => (a.type === 'event'
            ? put({ type: 'event', name: a.name }, 'args', a.args)
            : { type: 'set', variable: a.variable, op: a.op, value: a.value }));
          put(o, 'next', n.next);
          break;
        case 'jump': put(o, 'dialogue', n.dialogue); break;
        case 'end': put(o, 'result', n.result); break;
      }
      return o;
    };
    const out = {};
    if (full.variables.length) out.variables = full.variables.map((v) => ({ name: v.name, value: v.defaultValue }));
    out.dialogues = full.dialogues.map((d) => Object.assign(put(put(put({ id: d.id }, 'title', d.title), 'character', d.character ? names.get(d.character) || d.character : ''), 'start', d.start), { nodes: d.nodes.map(node) }));
    return out;
  }

  /* Sade Unity JSON'unu okuyan JsonUtility sınıfları */
  function csharpUnityModel() {
    return `// Generated by UML Studio. Data model for the simplified Unity dialogue JSON export.
// Usage:
//   DialogueDatabase db = JsonUtility.FromJson<DialogueDatabase>(jsonAsset.text);
//   Dialogue d = db.FindDialogue("weapon_shop");
//   DialogueNode node = d.Find(d.start);
// Node types: "line", "choice", "condition", "action", "jump", "end".
// An empty "next" means the dialogue ends there. Conditions are plain strings (e.g. "gold >= 50 and not metBefore").
using System;
using UnityEngine;

[Serializable]
public class DialogueDatabase
{
    public DialogueVariable[] variables;   // only present when the dialogues use variables
    public Dialogue[] dialogues;

    public Dialogue FindDialogue(string id) => Array.Find(dialogues, d => d.id == id);
}

[Serializable]
public class DialogueVariable
{
    public string name;
    public string value;         // start value as text: "true", "40", "Arin"
}

[Serializable]
public class Dialogue
{
    public string id;
    public string title;
    public string character;     // name of the character whose page this dialogue is on (empty if none)
    public string start;         // id of the first node
    public DialogueNode[] nodes;

    public DialogueNode Find(string nodeId) => string.IsNullOrEmpty(nodeId) ? null : Array.Find(nodes, n => n.id == nodeId);
}

[Serializable]
public class DialogueNode
{
    public string id;
    public string type;

    // line
    public string speaker;       // character name
    public string text;          // line text, or the optional prompt of a choice

    // line, action
    public string next;

    // choice
    public DialogueChoice[] choices;

    // condition
    public string condition;
    public string ifTrue;
    public string ifFalse;

    // action
    public DialogueAction[] actions;

    // jump
    public string dialogue;

    // end
    public string result;
}

[Serializable]
public class DialogueChoice
{
    public string text;
    public string condition;     // empty = always available
    public int maxPicks;         // hide after it has been picked this many times (0 = no limit)
    public string next;
}

[Serializable]
public class DialogueAction
{
    public string type;          // "set" or "event"
    public string variable;      // set
    public string op;            // set: "=", "+=", "-=", "*=", "/="
    public string value;         // set: expression, e.g. "10" or "gold - 5"
    public string name;          // event
    public string[] args;        // event
}
`;
  }

  /* ---------------- Önizleme oynatıcısı ---------------- */
  function initialVars(doc) {
    const v = {};
    for (const x of charVars(doc)) v[x.name] = typedValue(x.type, x.value);
    for (const x of reg(doc).variables) v[x.name] = typedValue(x.type, x.value);
    return v;
  }

  function Runner(doc) {
    this.doc = doc;
    this.vars = initialVars(doc);
    this.picks = new Map();      // seçenek anahtarı -> kaç kez seçildi
    this.steps = 0;
  }
  Runner.prototype.locate = function (nodeId) {
    for (const tab of this.doc.tabs) {
      const node = tab.nodes.find((n) => n.id === nodeId);
      if (node) return { tab, node };
    }
    return null;
  };
  Runner.prototype.nextOf = function (tab, n, pick) {
    const e = tab.edges.find((x) => x.from === n.id && (!pick || pick(x)) && tab.nodes.some((m) => m.id === x.to && isFlow(m)));
    return e ? { tab, node: tab.nodes.find((m) => m.id === e.to) } : null;
  };
  Runner.prototype.exec = function (a) {
    if (a.error) return { text: a.src, error: a.error };
    if (a.type === 'event') return { text: '@' + a.name + (a.args.length ? '(' + a.args.join(', ') + ')' : ''), event: true };
    const r = check(a.value);
    if (r.error) return { text: a.src, error: r.error };
    const v = evaluate(r.ast, this.vars), cur = this.vars[a.variable];
    let nv;
    switch (a.op) {
      case '+=': nv = typeof cur === 'string' || typeof v === 'string' ? str(cur) + str(v) : num(cur) + num(v); break;
      case '-=': nv = num(cur) - num(v); break;
      case '*=': nv = num(cur) * num(v); break;
      case '/=': nv = num(v) ? num(cur) / num(v) : 0; break;
      default: nv = v;
    }
    this.vars[a.variable] = nv;
    return { text: a.variable + ' = ' + fmt(nv) };
  };
  /* Oyuncuya bir şey gösterilene kadar ilerle.
     Dönüş: { log: [olay...], stop: { kind: 'line' | 'choice' | 'end' | 'error', ... } } */
  Runner.prototype.run = function (cur) {
    const log = [];
    for (let guard = 0; guard < 500; guard++) {
      if (!cur) return { log, stop: { kind: 'end', implicit: true } };
      const { tab, node: n } = cur;
      const at = { tab, node: n };
      this.steps++;
      switch (n.type) {
        case 'dlgStart':
          log.push(Object.assign({ kind: 'start', text: n.text || n.dlgId }, at));
          cur = this.nextOf(tab, n);
          break;
        case 'dlgLine':
          return { log, stop: Object.assign({ kind: 'line', text: interpolate(n.text, this.vars), next: this.nextOf(tab, n) }, at) };
        case 'dlgChoice': {
          const options = n.options.map((o, i) => {
            const key = n.id + '.' + o.id;
            const e = tab.edges.find((x) => x.from === n.id && x.opt === o.id);
            const target = e ? { tab, node: tab.nodes.find((m) => m.id === e.to) } : null;
            let available = true, reason = '';
            if (o.cond.trim()) {
              const r = test(o.cond, this.vars);
              if (r.error) { available = false; reason = r.error; } else if (!r.value) { available = false; reason = o.cond.trim(); }
            }
            const limit = pickLimit(o), used = this.picks.get(key) || 0;
            if (available && limit && used >= limit) { available = false; reason = limit === 1 ? $t('zaten seçildi') : $t('{n} kez seçildi', { n: used }); }
            return { index: i, key, option: o, text: interpolate(o.text, this.vars), available, reason, limit, left: limit ? Math.max(0, limit - used) : 0, target: target && target.node ? target : null };
          });
          return { log, stop: Object.assign({ kind: 'choice', prompt: interpolate(n.text, this.vars), options }, at) };
        }
        case 'dlgBranch': {
          const r = test(n.cond, this.vars);
          log.push(Object.assign({ kind: 'branch', text: n.cond, value: r.value, error: r.error }, at));
          cur = this.nextOf(tab, n, (e) => (r.value ? e.branch !== 'false' : e.branch === 'false'));
          break;
        }
        case 'dlgAction':
          for (const a of parseActions(n.actions)) log.push(Object.assign({ kind: 'action' }, this.exec(a), at));
          cur = this.nextOf(tab, n);
          break;
        case 'dlgJump': {
          const t = findStart(this.doc, n.target);
          log.push(Object.assign({ kind: 'jump', text: n.target }, at));
          if (!t) return { log, stop: Object.assign({ kind: 'error', text: $t('Hedef diyalog bulunamadı: {id}', { id: n.target || '?' }) }, at) };
          cur = t;
          break;
        }
        case 'dlgEnd':
          return { log, stop: Object.assign({ kind: 'end', result: n.text }, at) };
        default:
          cur = this.nextOf(tab, n);
      }
    }
    return { log, stop: { kind: 'error', text: $t('Sonsuz döngü: 500 adımdır oyuncuya hiçbir şey gösterilmedi') } };
  };
  Runner.prototype.choose = function (opt) {
    if (opt.limit) this.picks.set(opt.key, (this.picks.get(opt.key) || 0) + 1);
    return opt.target;
  };

  App.Dialogue = {
    TYPES, isDlg, isFlow, isDialogueTab, cleanCharacter, defaults, normalizeNode, newOption, pickLimit, CHAR_COLORS, VAR_TYPES, FORMAT, FORMAT_VERSION,
    reg, ensureReg, normalizeReg, character, addCharacter, renameCharacter, removeCharacter, tabOwner, pagesOf, pageStarter, charVars, declaredNames, propVarName, addVariable, mergeRegistry, slug, uniqueId,
    allStarts, findStart, prepareInsert,
    tokenize, parseExpr, check, evaluate, test, parseActions, splitArgs, interpolate, typedValue, fmt,
    layout, render, renderContext, edgeDecor, nodeColor, hitField, inlineSpec, sync, onConnect, guessSpeaker, previousLine, outEdges,
    validate, issueMap, exportTabs, exportData, exportUnity, csharpModel, csharpUnityModel, Runner, splitTags,
  };
})(typeof window !== 'undefined' ? window : globalThis);
