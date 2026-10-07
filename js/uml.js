'use strict';
/* UML / akış şeması meta verileri ve üye (alan/metot) ayrıştırma */
(function (global) {
  const App = (global.App = global.App || {});
  const $t = App.$t || ((k) => k);

  const SHAPES = {
    class:       { label: $t('Sınıf'), w: 0, h: 0 },
    terminator:  { label: $t('Başla / Bitir'), w: 140, h: 50, color: '#3ecf8e', flow: true },
    process:     { label: $t('İşlem'), w: 160, h: 60, flow: true },
    decision:    { label: $t('Karar'), w: 170, h: 90, color: '#f5a623', flow: true },
    io:          { label: $t('Girdi / Çıktı'), w: 170, h: 60, color: '#4f8cff', flow: true },
    preparation: { label: $t('Döngü (Hazırlık)'), w: 180, h: 60, color: '#b26bff', flow: true },
    subprocess:  { label: $t('Alt Süreç'), w: 170, h: 60, color: '#2bc0d6', flow: true },
    document:    { label: $t('Doküman'), w: 160, h: 70, color: '#ff8a65', flow: true },
    connector:   { label: $t('Bağlayıcı'), w: 40, h: 40, flow: true },
    note:        { label: $t('Not'), w: 180, h: 90, color: '#e6c34a' },
    text:        { label: $t('Metin'), w: 160, h: 40 },
    frame:       { label: $t('Grup / Paket'), w: 420, h: 300 },
  };
  const FLOW_TYPES = ['terminator', 'process', 'decision', 'io', 'preparation', 'subprocess', 'document', 'connector'];

  /* start/end: kenar uç süslemeleri */
  const EDGE_TYPES = {
    association: { label: $t('İlişki (Association)'), short: $t('İlişki'), end: 'open', uml: true },
    link:        { label: $t('Bağlantı (Link)'), short: $t('Bağlantı'), uml: true },
    inheritance: { label: $t('Kalıtım (Inheritance)'), short: $t('Kalıtım'), end: 'triangle', uml: true },
    realization: { label: $t('Gerçekleme (Realization)'), short: $t('Gerçekleme'), end: 'triangle', dash: true, uml: true },
    dependency:  { label: $t('Bağımlılık (Dependency)'), short: $t('Bağımlılık'), end: 'open', dash: true, uml: true },
    aggregation: { label: $t('Toplama (Aggregation)'), short: $t('Toplama'), start: 'diamond', uml: true },
    composition: { label: $t('Birleşim (Composition)'), short: $t('Birleşim'), start: 'diamondFilled', uml: true },
    flow:        { label: $t('Akış oku'), short: $t('Akış'), end: 'filled' },
  };

  /* Bilinen stereotipler ve renkleri */
  const STEREOTYPES = [
    { name: 'MonoBehaviour', color: '#4f8cff', unityBase: true },
    { name: 'ScriptableObject', color: '#b26bff', unityBase: true },
    { name: 'interface', color: '#3ecf8e' },
    { name: 'enum', color: '#f5a623' },
    { name: 'struct', color: '#2bc0d6' },
    { name: 'static', color: '#8e9bb0' },
    { name: 'Serializable', color: '#d4a35a' },
    { name: 'Editor', color: '#ff6b6b', unityBase: true },
    { name: 'EditorWindow', color: '#ff6b6b', unityBase: true },
    { name: 'NetworkBehaviour', color: '#5bc0eb', unityBase: true },
    { name: 'StateMachineBehaviour', color: '#7b8cff', unityBase: true },
    { name: 'PropertyDrawer', color: '#ff6b6b', unityBase: true },
  ];
  const STEREO_MAP = new Map(STEREOTYPES.map((s) => [s.name.toLowerCase(), s]));

  function stereoInfo(st) { return STEREO_MAP.get(String(st || '').trim().toLowerCase()) || null; }

  function nodeColor(n) {
    if (n.color) return n.color;
    if (n.type === 'class') {
      const s = stereoInfo(n.stereotype);
      if (s) return s.color;
      if (n.stereotype) return '#8e9bb0';
      return null;
    }
    return (SHAPES[n.type] && SHAPES[n.type].color) || null;
  }

  function stereoLabel(n) {
    const st = String(n.stereotype || '').trim();
    if (!st) return '';
    const low = st.toLowerCase();
    if (low === 'enum') return '«enumeration»';
    return '«' + st + '»';
  }

  const VIS_WORD = { public: '+', private: '-', protected: '#', internal: '~' };
  const MOD_RE = /\{\s*(static|abstract|readonly|const|virtual|override|event|sealed|async|new)\s*\}/gi;

  function matchParen(s, open) {
    let d = 0;
    for (let i = open; i < s.length; i++) {
      if (s[i] === '(') d++;
      else if (s[i] === ')') { d--; if (d === 0) return i; }
    }
    return s.length;
  }

  function topIndexOf(s, ch) {
    let d = 0;
    for (let i = 0; i < s.length; i++) {
      const c = s[i];
      if (c === '(' || c === '[' || c === '<' || c === '{') d++;
      else if (c === ')' || c === ']' || c === '>' || c === '}') d = Math.max(0, d - 1);
      else if (c === ch && d === 0) return i;
    }
    return -1;
  }

  function parseParam(p) {
    let s = p.trim().replace(/^(\[[^\]]*\]\s*)+/, '');
    if (!s) return null;
    let def = null;
    const eq = topIndexOf(s, '=');
    if (eq >= 0) { def = s.slice(eq + 1).trim(); s = s.slice(0, eq).trim(); }
    const c = topIndexOf(s, ':');
    if (c >= 0) return { name: s.slice(0, c).trim(), type: s.slice(c + 1).trim(), def };
    const m = s.match(/^(.*\S)\s+(@?\w+)$/);
    if (m) return { name: m[2], type: m[1].trim(), def };
    return { name: s, type: '', def };
  }

  /* Tek bir üye satırını ayrıştır.
     Desteklenen biçimler:
       + speed : float = 5f
       - Move(dir : Vector3) : void
       + {static} Instance : GameManager {get; private set;}
       public float speed = 5f      (C# tarzı da kabul edilir) */
  function parseMember(line) {
    const raw = String(line == null ? '' : line);
    let s = raw.trim();
    if (!s) return null;
    const mods = new Set();
    const attrs = [];
    s = s.replace(/^(\[[^\]]*\]\s*)+/, (m) => { m.replace(/\[([^\]]*)\]/g, (_, a) => attrs.push(a.trim())); return ''; });
    s = s.replace(MOD_RE, (_, m) => { mods.add(m.toLowerCase()); return ''; }).trim();
    let vis = '';
    const vm = s.match(/^([+\-#~])\s*/);
    if (vm) { vis = vm[1]; s = s.slice(vm[0].length); }
    s = s.replace(MOD_RE, (_, m) => { mods.add(m.toLowerCase()); return ''; }).trim();
    const kw = s.match(/^((?:(?:public|private|protected|internal|static|abstract|readonly|const|virtual|override|sealed|async|event|new)\s+)+)/);
    if (kw) {
      kw[1].trim().split(/\s+/).forEach((k) => {
        if (VIS_WORD[k]) { if (!vis) vis = VIS_WORD[k]; } else mods.add(k);
      });
      s = s.slice(kw[0].length);
    }
    let prop = null;
    s = s.replace(/\{\s*((?:(?:private|protected|internal)\s+)?(?:get|set|init)\s*;?\s*)+\}\s*$/i, (m) => {
      prop = m.replace(/[{}]/g, '').trim().replace(/\s*;\s*/g, '; ').replace(/;?\s*$/, ';');
      return '';
    }).trim();

    const res = { raw, vis, mods, attrs, prop, isMethod: false, name: '', type: '', def: null, params: [], ret: '' };
    const paren = s.indexOf('(');
    const colon = topIndexOf(s, ':');
    if (paren > 0 && (colon < 0 || paren < colon)) {
      res.isMethod = true;
      const close = matchParen(s, paren);
      res.name = s.slice(0, paren).trim();
      res.params = App.U.splitTop(s.slice(paren + 1, close), ',', true).map(parseParam).filter(Boolean);
      let rest = s.slice(close + 1).trim();
      if (rest.startsWith(':')) rest = rest.slice(1).trim();
      res.ret = rest;
      // C# tarzı "void Move(...)" -> isimden dönüş tipini ayır
      const nm = res.name.match(/^(.*\S)\s+(@?[\w.]+(?:<.*>)?)$/);
      if (nm && !res.ret) { res.ret = nm[1]; res.name = nm[2]; }
    } else {
      const eq = topIndexOf(s, '=');
      if (eq >= 0) { res.def = s.slice(eq + 1).trim(); s = s.slice(0, eq).trim(); }
      const c2 = topIndexOf(s, ':');
      if (c2 >= 0) { res.name = s.slice(0, c2).trim(); res.type = s.slice(c2 + 1).trim(); }
      else {
        const m = s.match(/^(.*\S)\s+(@?\w+)$/);
        if (m) { res.type = m[1].trim(); res.name = m[2]; } else res.name = s;
      }
      if (/^event\s+/.test(res.type)) { mods.add('event'); res.type = res.type.replace(/^event\s+/, ''); }
    }
    return res;
  }

  /* Çizimde gösterilecek metin (+ işaretinden sonrası) ve biçim bilgisi */
  function memberDisplay(line) {
    const raw = String(line);
    let mods = new Set();
    let t = raw.replace(MOD_RE, (_, m) => { mods.add(m.toLowerCase()); return ''; }).replace(/\s{2,}/g, ' ').trim();
    let vis = '';
    const vm = t.match(/^([+\-#~])\s*/);
    if (vm) { vis = vm[1]; t = t.slice(vm[0].length); }
    return {
      vis, text: t,
      static: mods.has('static') || mods.has('const'),
      abstract: mods.has('abstract'),
    };
  }

  function splitLines(s) {
    return String(s || '').split('\n').map((l) => l.replace(/\s+$/, '')).filter((l) => l.trim() !== '');
  }

  /* Basit tip adı (generic argümanları olmadan) */
  function baseName(name) { return String(name || '').replace(/<.*$/, '').trim(); }

  App.UML = { SHAPES, FLOW_TYPES, EDGE_TYPES, STEREOTYPES, stereoInfo, nodeColor, stereoLabel, parseMember, parseParam, memberDisplay, splitLines, baseName, topIndexOf, matchParen, VIS_WORD };
})(typeof window !== 'undefined' ? window : globalThis);
