'use strict';
/* C# dışa aktarım (Unity script iskeletleri) ve C# içe aktarım (script -> sınıf diyagramı) */
(function (global) {
  const App = (global.App = global.App || {});
  const UML = App.UML;
  const $t = App.$t || ((k) => k);

  const UNITY_BASES = new Set(['MonoBehaviour', 'ScriptableObject', 'Editor', 'EditorWindow', 'NetworkBehaviour', 'StateMachineBehaviour', 'PropertyDrawer', 'Behaviour', 'Component', 'UIBehaviour']);
  const NON_BASE_STEREOS = new Set(['interface', 'enum', 'struct', 'static', 'serializable', 'abstract', 'record', 'class']);
  const UNITY_MESSAGES = new Set(['Awake', 'Start', 'Update', 'FixedUpdate', 'LateUpdate', 'OnEnable', 'OnDisable', 'OnDestroy', 'OnValidate', 'Reset',
    'OnDrawGizmos', 'OnDrawGizmosSelected', 'OnApplicationQuit', 'OnApplicationPause', 'OnApplicationFocus', 'OnGUI', 'OnBecameVisible', 'OnBecameInvisible',
    'OnTriggerEnter', 'OnTriggerExit', 'OnTriggerStay', 'OnCollisionEnter', 'OnCollisionExit', 'OnCollisionStay',
    'OnTriggerEnter2D', 'OnTriggerExit2D', 'OnTriggerStay2D', 'OnCollisionEnter2D', 'OnCollisionExit2D', 'OnCollisionStay2D',
    'OnMouseDown', 'OnMouseUp', 'OnMouseEnter', 'OnMouseExit', 'OnMouseOver', 'OnMouseDrag', 'OnAnimatorMove', 'OnAnimatorIK', 'OnParticleCollision', 'OnRenderObject', 'OnPreRender', 'OnPostRender']);
  const ACCESS = { '+': 'public', '-': 'private', '#': 'protected', '~': 'internal' };

  /* ======================= DIŞA AKTARIM ======================= */

  function kindOf(n) {
    const st = String(n.stereotype || '').trim().toLowerCase();
    if (st === 'interface') return 'interface';
    if (st === 'enum') return 'enum';
    if (st === 'struct') return 'struct';
    return 'class';
  }

  function floatFix(type, def) {
    if (def == null) return def;
    if (/^float$/.test(type) && /^-?\d+(\.\d+)?$/.test(def)) return def + 'f';
    return def;
  }

  function ident(name) { return String(name || '').trim().replace(/\s+/g, '') || 'Unnamed'; }

  function generateClass(n, tab) {
    const kind = kindOf(n);
    const stereo = String(n.stereotype || '').trim();
    const stLow = stereo.toLowerCase();
    const nodeMap = new Map(tab.nodes.map((x) => [x.id, x]));
    const out = (tab.edges || []).filter((e) => e.from === n.id);
    const name = ident(n.name);
    const simple = UML.baseName(name);

    // tabanlar
    let baseClass = null;
    const ifaces = [];
    for (const e of out) {
      const t = nodeMap.get(e.to);
      if (!t || t.type !== 'class') continue;
      const tn = ident(t.name);
      if (e.type === 'inheritance') {
        if (kindOf(t) === 'interface') ifaces.push(tn); else baseClass = tn;
      } else if (e.type === 'realization') ifaces.push(tn);
    }
    const stInfo = UML.stereoInfo(stereo);
    if (!baseClass && stereo && kind === 'class' && !NON_BASE_STEREOS.has(stLow)) {
      baseClass = stInfo ? stInfo.name : stereo;
    }
    // Unity türü mü (kalıtım zinciri boyunca)
    const isUnityObj = (() => {
      const seen = new Set();
      let cur = n;
      while (cur && !seen.has(cur.id)) {
        seen.add(cur.id);
        const s = String(cur.stereotype || '').trim();
        if (UNITY_BASES.has(s) || (UML.stereoInfo(s) && UML.stereoInfo(s).unityBase)) return true;
        const inh = (tab.edges || []).find((e) => e.from === cur.id && e.type === 'inheritance');
        cur = inh ? nodeMap.get(inh.to) : null;
      }
      return false;
    })();
    const serializedType = isUnityObj || stLow === 'serializable' || kind === 'struct';

    const attrs = UML.splitLines(n.attributes).map(UML.parseMember).filter(Boolean);
    const meths = UML.splitLines(n.methods).map(UML.parseMember).filter(Boolean);

    // arayüz metotlarını otomatik uygula
    if (kind === 'class' || kind === 'struct') {
      const have = new Set(meths.map((m) => m.name));
      for (const e of out) {
        const t = nodeMap.get(e.to);
        if (!t || kindOf(t) !== 'interface' || (e.type !== 'realization' && e.type !== 'inheritance')) continue;
        for (const m of UML.splitLines(t.methods).map(UML.parseMember).filter(Boolean)) {
          if (m.isMethod && !have.has(m.name)) { m.vis = '+'; meths.push(m); have.add(m.name); }
        }
      }
    }

    const usings = new Set(['UnityEngine']);
    const body = [];
    const I = '    ';
    const allText = [n.attributes, n.methods].join('\n');
    if (/\b(List|Dictionary|Queue|Stack|HashSet|IEnumerable)\s*</.test(allText)) usings.add('System.Collections.Generic');
    if (/\b(Action|Func)\b/.test(allText) || stLow === 'serializable') usings.add('System');
    if (/\bUnityEvent\b/.test(allText)) usings.add('UnityEngine.Events');
    if (/\bIEnumerator\b/.test(allText)) usings.add('System.Collections');
    if (/\bNavMeshAgent\b/.test(allText)) usings.add('UnityEngine.AI');
    if (/\b(Image|Text|Button|Slider|Toggle)\b/.test(allText)) usings.add('UnityEngine.UI');
    if (/\bTMP_Text|TextMeshProUGUI\b/.test(allText)) usings.add('TMPro');
    const isEditor = stLow === 'editor' || stLow === 'editorwindow' || stLow === 'propertydrawer';
    if (isEditor) usings.add('UnityEditor');

    let header = [];
    if (kind === 'enum') {
      header.push(`public enum ${name}`);
      const vals = UML.splitLines(n.attributes).map((l) => l.replace(/^[+\-#~]\s*/, '').replace(/\s*:.*$/, '').trim()).filter(Boolean);
      body.push(vals.map((v) => I + v).join(',\n'));
    } else {
      const decorators = [];
      if (stLow === 'serializable') decorators.push('[Serializable]');
      if (stLow === 'scriptableobject' || baseClass === 'ScriptableObject') {
        decorators.push(`[CreateAssetMenu(fileName = "New ${simple}", menuName = "ScriptableObjects/${simple}")]`);
      }
      if (stLow === 'editor') {
        const dep = out.find((e) => (e.type === 'dependency' || e.type === 'association') && nodeMap.get(e.to) && nodeMap.get(e.to).type === 'class');
        const target = dep ? UML.baseName(ident(nodeMap.get(dep.to).name)) : (simple.replace(/Editor$/, '') || 'MonoBehaviour');
        decorators.push(`[CustomEditor(typeof(${target}))]`);
      }
      let mods = 'public ';
      if (stLow === 'static') mods += 'static ';
      else if (n.abstract || stLow === 'abstract') mods += 'abstract ';
      const kw = kind === 'interface' ? 'interface' : kind === 'struct' ? 'struct' : 'class';
      const bases = [baseClass, ...ifaces].filter(Boolean);
      let line = `${mods}${kw} ${name}${bases.length ? ' : ' + bases.join(', ') : ''}`;
      if (/<\s*T\s*>/.test(name) && /^Singleton/i.test(simple) && baseClass === 'MonoBehaviour') line += ` where T : MonoBehaviour`;
      header = decorators.concat([line]);

      const isSingleton = attrs.some((a) => a.name === 'Instance' && a.mods.has('static'));

      // alanlar
      const fieldLines = [];
      for (const a of attrs) {
        const type = a.type || 'object';
        if (kind === 'interface') {
          if (a.prop) fieldLines.push(`${I}${type} ${a.name} { ${a.prop.replace(/(private|protected|internal)\s+/g, '')} }`);
          else if (a.mods.has('event')) fieldLines.push(`${I}event ${type} ${a.name};`);
          else fieldLines.push(`${I}${type} ${a.name} { get; }`);
          continue;
        }
        const acc = ACCESS[a.vis] || (kind === 'struct' ? 'public' : 'private');
        const mods2 = [];
        if (a.mods.has('const')) mods2.push('const');
        else {
          if (a.mods.has('static')) mods2.push('static');
          if (a.mods.has('readonly')) mods2.push('readonly');
        }
        if (a.mods.has('abstract')) mods2.push('abstract');
        if (a.mods.has('virtual')) mods2.push('virtual');
        if (a.mods.has('override')) mods2.push('override');
        const def = floatFix(type, a.def);
        if (a.prop) {
          fieldLines.push(`${I}${acc} ${mods2.length ? mods2.join(' ') + ' ' : ''}${type} ${a.name} { ${a.prop} }${def ? ' = ' + def + ';' : ''}`);
        } else if (a.mods.has('event')) {
          fieldLines.push(`${I}${acc} ${mods2.length ? mods2.join(' ') + ' ' : ''}event ${type} ${a.name};`);
        } else {
          const serialize = serializedType && acc !== 'public' && !a.mods.has('static') && !a.mods.has('const') && !a.mods.has('readonly') && kind !== 'struct';
          fieldLines.push(`${I}${serialize ? '[SerializeField] ' : ''}${acc} ${mods2.length ? mods2.join(' ') + ' ' : ''}${type} ${a.name}${def ? ' = ' + def : ''};`);
        }
      }
      if (fieldLines.length) body.push(fieldLines.join('\n'));

      // metotlar
      for (const m of meths) {
        if (!m.isMethod) continue;
        const isCtor = m.name === simple && !m.ret;
        const ret = isCtor ? '' : (m.ret || 'void');
        const params = m.params.map((p) => `${p.type || 'object'} ${p.name}${p.def ? ' = ' + floatFix(p.type, p.def) : ''}`).join(', ');
        const lines = [];
        if (kind === 'interface') { body.push(`${I}${ret} ${m.name}(${params});`); continue; }
        let acc = ACCESS[m.vis];
        if (!acc) acc = UNITY_MESSAGES.has(m.name) && isUnityObj ? 'private' : 'public';
        const mm = [];
        if (m.mods.has('static')) mm.push('static');
        if (m.mods.has('abstract')) mm.push('abstract');
        if (m.mods.has('virtual')) mm.push('virtual');
        let override = m.mods.has('override');
        if (stLow === 'editor' && m.name === 'OnInspectorGUI') { override = true; acc = 'public'; }
        if (stLow === 'statemachinebehaviour' && /^OnState/.test(m.name)) { override = true; acc = 'public'; }
        if (override) mm.push('override');
        if (m.mods.has('async')) mm.push('async');
        const sig = `${acc} ${mm.length ? mm.join(' ') + ' ' : ''}${isCtor ? '' : ret + ' '}${m.name}(${params})`;
        if (stLow === 'editorwindow' && m.name === 'ShowWindow') lines.push(`${I}[MenuItem("Window/${simple}")]`);
        if (m.mods.has('abstract')) { lines.push(`${I}${sig};`); body.push(lines.join('\n')); continue; }
        lines.push(`${I}${sig}`, `${I}{`);
        const inner = [];
        if (isSingleton && m.name === 'Awake') {
          inner.push('if (Instance != null && Instance != this)', '{', `${I}Destroy(gameObject);`, `${I}return;`, '}', 'Instance = this;', 'DontDestroyOnLoad(gameObject);');
        } else if (stLow === 'editorwindow' && m.name === 'ShowWindow') {
          inner.push(`GetWindow<${simple}>("${simple}");`);
        } else if (stLow === 'editor' && m.name === 'OnInspectorGUI') {
          inner.push('base.OnInspectorGUI();');
        } else if (override && stLow !== 'editor') {
          inner.push(`base.${m.name}(${m.params.map((p) => p.name).join(', ')});`);
        } else if (/^IEnumerator\b/.test(ret)) {
          inner.push('yield return null;');
        } else if (ret && ret !== 'void' && !isCtor) {
          inner.push($t('// TODO: uygula'), 'return default;');
        } else {
          inner.push($t('// TODO: uygula'));
        }
        lines.push(...inner.map((l) => I + I + l), `${I}}`);
        body.push(lines.join('\n'));
      }
    }

    let code = '';
    code += [...usings].sort().map((u) => `using ${u};`).join('\n') + '\n\n';
    const ns = String(n.namespace || '').trim();
    const indent = ns ? I : '';
    const block = [...header.map((h) => indent + h), indent + '{', body.map((b) => b.split('\n').map((l) => (l ? indent + l : l)).join('\n')).join('\n\n'), indent + '}'].join('\n');
    if (ns) code += `namespace ${ns}\n{\n${block}\n}\n`;
    else code += block + '\n';
    code = code.replace(/\{\n\n\}/g, '{\n}');
    const fileName = (isEditor ? 'Editor/' : '') + simple + '.cs';
    return { id: n.id, name, fileName, code };
  }

  function generateAll(tab, ids) {
    return tab.nodes.filter((n) => n.type === 'class' && (!ids || ids.has(n.id))).map((n) => generateClass(n, tab));
  }

  /* ======================= İÇE AKTARIM ======================= */

  /* Yorumları ve metin değişmezlerini temizle */
  function stripCode(src) {
    let out = '';
    let i = 0;
    const n = src.length;
    while (i < n) {
      const c = src[i], d = src[i + 1];
      if (c === '/' && d === '/') { while (i < n && src[i] !== '\n') i++; continue; }
      if (c === '/' && d === '*') { i += 2; while (i < n && !(src[i] === '*' && src[i + 1] === '/')) i++; i += 2; out += ' '; continue; }
      const isStr = c === '"' || ((c === '@' || c === '$') && (d === '"' || ((d === '@' || d === '$') && src[i + 2] === '"')));
      if (isStr) {
        let j = i, verbatim = false, interp = false;
        while (src[j] !== '"') { if (src[j] === '@') verbatim = true; if (src[j] === '$') interp = true; j++; }
        // ham dize """ ... """
        if (src[j + 1] === '"' && src[j + 2] === '"') {
          const end = src.indexOf('"""', j + 3);
          i = end < 0 ? n : end + 3; out += '""'; continue;
        }
        j++;
        let depth = 0;
        while (j < n) {
          const ch = src[j];
          if (interp && ch === '{') { if (src[j + 1] === '{' && depth === 0) { j += 2; continue; } depth++; j++; continue; }
          if (interp && ch === '}' && depth > 0) { depth--; j++; continue; }
          if (depth > 0) {
            if (ch === '"') { j++; while (j < n && src[j] !== '"' && src[j] !== '\n') { if (src[j] === '\\') j++; j++; } j++; continue; }
            j++; continue;
          }
          if (!verbatim && ch === '\\') { j += 2; continue; }
          if (ch === '"') { if (verbatim && src[j + 1] === '"') { j += 2; continue; } j++; break; }
          if (!verbatim && ch === '\n') break;
          j++;
        }
        out += '""';
        i = j;
        continue;
      }
      if (c === "'") {
        let j = i + 1;
        if (src[j] === '\\') j += 2; else j++;
        while (j < n && src[j] !== "'" && j - i < 12) j++;
        out += "' '";
        i = j + 1;
        continue;
      }
      out += c;
      i++;
    }
    return out.replace(/^[ \t]*#.*$/gm, '');
  }

  function findMatching(code, open) {
    let d = 0;
    for (let i = open; i < code.length; i++) {
      const c = code[i];
      if (c === '{') d++;
      else if (c === '}') { d--; if (d === 0) return i; }
    }
    return code.length;
  }

  function stripLeadingAttributes(s, attrs) {
    s = s.trim();
    while (s.startsWith('[')) {
      let d = 0, k = 0;
      for (; k < s.length; k++) {
        if (s[k] === '[') d++;
        else if (s[k] === ']') { d--; if (d === 0) break; }
      }
      if (attrs) attrs.push(s.slice(1, k).trim());
      s = s.slice(k + 1).trim();
    }
    return s;
  }

  const TYPE_RE = /^((?:[\w]+\s+)*?)(class|struct|interface|enum|record(?:\s+(?:class|struct))?)\s+(@?\w+)\s*(<[^{]*?>)?\s*(?:\(([^)]*)\))?\s*(?::\s*([\s\S]*?))?\s*(\bwhere\b[\s\S]*)?$/;

  function matchTypeHeader(header) {
    const attrs = [];
    const h = stripLeadingAttributes(header, attrs).replace(/\s+/g, ' ').trim();
    const m = h.match(TYPE_RE);
    if (!m) return null;
    const mods = m[1].trim().split(/\s+/).filter(Boolean);
    if (mods.some((x) => !/^(public|private|protected|internal|static|abstract|sealed|partial|unsafe|new|readonly|ref|file)$/.test(x))) return null;
    let kind = m[2];
    if (kind.startsWith('record')) kind = /struct/.test(kind) ? 'struct' : 'class';
    const bases = m[6] ? App.U.splitTop(m[6], ',', true).map((b) => b.trim()).filter(Boolean) : [];
    return { kind, name: m[3].replace(/^@/, '') + (m[4] ? m[4].replace(/\s+/g, '') : ''), mods, attrs, bases, primary: m[5] || null };
  }

  const MODIFIERS = /^(public|private|protected|internal|static|readonly|const|volatile|new|override|virtual|abstract|sealed|extern|unsafe|async|partial|event|required|ref|fixed)\b\s*/;

  function topIdx(s, pred) {
    let d = 0;
    for (let i = 0; i < s.length; i++) {
      const c = s[i];
      if (d === 0 && pred(s, i)) return i;
      if (c === '(' || c === '[' || c === '{') d++;
      else if (c === ')' || c === ']' || c === '}') d = Math.max(0, d - 1);
    }
    return -1;
  }
  const isArrow = (s, i) => s[i] === '=' && s[i + 1] === '>';
  const isAssign = (s, i) => s[i] === '=' && s[i + 1] !== '=' && s[i + 1] !== '>' && !'=!<>+-*/%&|^?'.includes(s[i - 1] || '');

  function parseParams(str) {
    return App.U.splitTop(str, ',', true).map((p) => {
      let s = stripLeadingAttributes(p).trim();
      if (!s) return null;
      const eq = topIdx(s, isAssign);
      if (eq >= 0) s = s.slice(0, eq).trim();
      s = s.replace(/^(this|scoped)\s+/, '');
      const m = s.match(/^(.*\S)\s+(@?\w+)$/);
      if (!m) return { name: s, type: '' };
      return { name: m[2].replace(/^@/, ''), type: m[1].replace(/\s+/g, ' ').trim() };
    }).filter(Boolean);
  }

  function shorten(v, max) { v = v.replace(/\s+/g, ' ').trim(); return v.length > max ? v.slice(0, max - 1) + '…' : v; }

  function parseType(code, td, start, end, ns, outer, types) {
    const t = {
      name: td.name, kind: td.kind, mods: td.mods, attrs: td.attrs, bases: td.bases, ns, outer,
      fields: [], props: [], methods: [], values: [], fieldTypes: [],
    };
    types.push(t);
    const defVis = t.kind === 'interface' ? '+' : '-';
    if (t.kind === 'enum') {
      t.values = App.U.splitTop(code.slice(start, end), ',').map((s) => stripLeadingAttributes(s).replace(/=[\s\S]*$/, '').trim()).filter((s) => /^@?\w+$/.test(s));
      return;
    }
    if (td.primary) {
      for (const p of parseParams(td.primary)) {
        t.props.push({ vis: '+', name: p.name, type: p.type, acc: 'get; init;', static: false });
        t.fieldTypes.push(p.type);
      }
    }

    const handle = (text, block) => {
      let s = text.trim();
      if (!s) return;
      const attrs = [];
      s = stripLeadingAttributes(s, attrs);
      if (/^(using|delegate)\b/.test(s) || /\bdelegate\b/.test(s.split('(')[0])) return;
      const mods = [];
      let m;
      while ((m = s.match(MODIFIERS))) { mods.push(m[1]); s = s.slice(m[0].length); }
      const vis = mods.includes('public') ? '+' : mods.includes('protected') ? '#' : mods.includes('internal') ? '~' : mods.includes('private') ? '-' : defVis;
      const isStatic = mods.includes('static') || mods.includes('const');
      const arrow = topIdx(s, isArrow);
      const paren = topIdx(s, (x, i) => x[i] === '(');
      const eq = topIdx(s, isAssign);
      if (paren >= 0 && (arrow < 0 || paren < arrow) && (eq < 0 || paren < eq)) {
        if (/\boperator\b/.test(s.slice(0, paren)) || /\bthis\s*\[/.test(s)) return;
        const before = s.slice(0, paren).trim();
        const mm = before.match(/^([\s\S]*?)\s*(~?@?[\w.]+)\s*(<[^()]*>)?$/);
        if (!mm) return;
        let ret = mm[1].replace(/\s+/g, ' ').trim();
        let name = mm[2].split('.').pop();
        if (name.startsWith('~')) return; // sonlandırıcı
        const close = App.UML.matchParen(s, paren);
        const params = parseParams(s.slice(paren + 1, close));
        t.methods.push({ vis, name: name + (mm[3] ? mm[3].replace(/\s+/g, '') : ''), ret, params, static: mods.includes('static'), abstract: mods.includes('abstract'), virtual: mods.includes('virtual'), override: mods.includes('override'), ctor: !ret });
        return;
      }
      if (/\bthis\s*\[/.test(s)) return; // indeksleyici
      const isEvent = mods.includes('event');
      if (block != null && !isEvent) {
        const mm = s.match(/^([\s\S]*\S)\s+(@?[\w.]+)$/);
        if (!mm) return;
        const flat = block.replace(/\{[^{}]*\}/g, '').replace(/\{[^{}]*\}/g, '');
        const acc = [];
        flat.replace(/(?:(private|protected|internal)\s+)?\b(get|set|init)\b/g, (_, a, k) => { acc.push((a ? a + ' ' : '') + k + ';'); });
        t.props.push({ vis, name: mm[2].split('.').pop(), type: mm[1].replace(/\s+/g, ' ').trim(), acc: acc.join(' ') || 'get;', static: isStatic });
        t.fieldTypes.push(mm[1]);
        return;
      }
      if (arrow >= 0 && !isEvent && (eq < 0 || arrow < eq)) {
        const mm = s.slice(0, arrow).trim().match(/^([\s\S]*\S)\s+(@?[\w.]+)$/);
        if (!mm) return;
        t.props.push({ vis, name: mm[2].split('.').pop(), type: mm[1].replace(/\s+/g, ' ').trim(), acc: 'get;', static: isStatic });
        t.fieldTypes.push(mm[1]);
        return;
      }
      // alan(lar)
      const parts = App.U.splitTop(s, ',', true);
      let type = null;
      parts.forEach((part, idx) => {
        let p = part.trim();
        const e2 = topIdx(p, isAssign);
        let init = null;
        if (e2 >= 0) { init = p.slice(e2 + 1).trim(); p = p.slice(0, e2).trim(); }
        let name;
        if (idx === 0) {
          const mm = p.match(/^([\s\S]*\S)\s+(@?\w+)$/);
          if (!mm) return;
          type = mm[1].replace(/\s+/g, ' ').trim();
          name = mm[2];
        } else name = p.replace(/[^\w@]/g, '');
        if (!type || !name) return;
        t.fields.push({ vis, name: name.replace(/^@/, ''), type, init: init ? shorten(init, 28) : null, static: isStatic, const: mods.includes('const'), readonly: mods.includes('readonly'), event: isEvent, serialized: attrs.some((a) => /SerializeField/.test(a)) });
        if (idx === 0) t.fieldTypes.push(type);
      });
    };

    let i = start, segStart = start, depth = 0;
    while (i < end) {
      const c = code[i];
      if (c === '(' || c === '[') depth++;
      else if (c === ')' || c === ']') depth--;
      else if (depth <= 0 && c === ';') { handle(code.slice(segStart, i), null); segStart = i + 1; }
      else if (depth <= 0 && c === '{') {
        const close = findMatching(code, i);
        const header = code.slice(segStart, i);
        const hClean = stripLeadingAttributes(header);
        if (topIdx(hClean, isArrow) >= 0 || topIdx(hClean, isAssign) >= 0) { i = close + 1; continue; }
        const td2 = matchTypeHeader(header.trim());
        if (td2) parseType(code, td2, i + 1, close, ns, t.name, types);
        else handle(header, code.slice(i + 1, close));
        i = close + 1;
        let j = i;
        while (j < end && /\s/.test(code[j])) j++;
        if (code[j] === '=' && code[j + 1] !== '>') {
          let k = j, d2 = 0;
          while (k < end) {
            const ch = code[k];
            if ('([{'.includes(ch)) d2++;
            else if (')]}'.includes(ch)) d2--;
            else if (ch === ';' && d2 <= 0) break;
            k++;
          }
          i = k + 1;
        } else if (code[j] === ';') i = j + 1;
        segStart = i;
        continue;
      }
      i++;
    }
  }

  function parseScope(code, start, end, ns, types) {
    let i = start, segStart = start, depth = 0, fileNs = ns;
    while (i < end) {
      const c = code[i];
      if (c === '(' || c === '[') depth++;
      else if (c === ')' || c === ']') depth--;
      else if (depth <= 0 && c === ';') {
        const seg = code.slice(segStart, i).trim();
        const m = seg.match(/^namespace\s+([\w.]+)$/);
        if (m) fileNs = m[1];
        segStart = i + 1;
      } else if (depth <= 0 && c === '{') {
        const close = findMatching(code, i);
        const header = code.slice(segStart, i).trim();
        const nsm = header.match(/(?:^|\s)namespace\s+([\w.]+)\s*$/);
        if (nsm) parseScope(code, i + 1, close, (fileNs ? fileNs + '.' : '') + nsm[1], types);
        else {
          const td = matchTypeHeader(header);
          if (td) parseType(code, td, i + 1, close, fileNs, null, types);
        }
        i = close + 1;
        segStart = i;
        continue;
      }
      i++;
    }
  }

  function parseSource(src) {
    const code = stripCode(String(src).replace(/^﻿/, ''));
    const types = [];
    parseScope(code, 0, code.length, '', types);
    return types;
  }

  /* Birden çok kaynaktan gelen tipleri birleştir (partial sınıflar) */
  function parseSources(sources) {
    const all = [];
    for (const s of sources) all.push(...parseSource(s));
    const byKey = new Map();
    const merged = [];
    for (const t of all) {
      const key = (t.ns || '') + '.' + (t.outer ? t.outer + '.' : '') + UML.baseName(t.name);
      const ex = byKey.get(key);
      if (ex) {
        ex.fields.push(...t.fields); ex.props.push(...t.props); ex.methods.push(...t.methods);
        ex.fieldTypes.push(...t.fieldTypes);
        for (const b of t.bases) if (!ex.bases.includes(b)) ex.bases.push(b);
        ex.mods = [...new Set([...ex.mods, ...t.mods])];
        ex.attrs.push(...t.attrs);
      } else { byKey.set(key, t); merged.push(t); }
    }
    return merged;
  }

  const COLLECTION_RE = /(\[\]|\b(List|IList|IEnumerable|ICollection|HashSet|Queue|Stack|Dictionary|IReadOnlyList|LinkedList)\s*<)/;

  /**
   * Ayrıştırılan tiplerden diyagram parçası üret.
   * opts: { private: bool, methods: bool, fields: bool, relations: bool }
   */
  function buildDiagram(types, opts) {
    opts = Object.assign({ private: true, methods: true, fields: true, relations: true }, opts || {});
    const nodes = [], edges = [];
    const byName = new Map();
    const uid = App.U.uid;
    const keepVis = (v) => opts.private || v === '+' || v === '#';
    for (const t of types) {
      const st = (() => {
        if (t.kind === 'interface') return 'interface';
        if (t.kind === 'enum') return 'enum';
        if (t.kind === 'struct') return 'struct';
        if (t.mods.includes('static')) return 'static';
        return '';
      })();
      const attrs = [];
      if (t.kind === 'enum') attrs.push(...t.values);
      else if (opts.fields) {
        for (const f of t.fields) {
          if (!keepVis(f.vis) && !f.serialized) continue;
          const mod = f.const ? '{const} ' : f.static ? '{static} ' : '';
          const type = (f.event ? 'event ' : '') + f.type;
          attrs.push(`${f.vis} ${mod}${f.name} : ${type}${f.init && !f.event ? ' = ' + f.init : ''}`);
        }
        for (const p of t.props) {
          if (!keepVis(p.vis)) continue;
          attrs.push(`${p.vis} ${p.static ? '{static} ' : ''}${p.name} : ${p.type} {${p.acc}}`);
        }
      }
      const meths = [];
      if (opts.methods) {
        for (const m of t.methods) {
          if (!keepVis(m.vis)) continue;
          const mod = (m.abstract ? '{abstract} ' : '') + (m.static ? '{static} ' : '') + (m.override ? '{override} ' : '') + (m.virtual ? '{virtual} ' : '');
          meths.push(`${m.vis} ${mod}${m.name}(${m.params.map((p) => `${p.name} : ${p.type}`).join(', ')})${m.ctor ? '' : ' : ' + m.ret}`);
        }
      }
      const n = {
        id: uid('n'), type: 'class', x: 0, y: 0, w: 0, showMembers: true,
        name: t.name, stereotype: st, namespace: t.ns || '', abstract: t.mods.includes('abstract') && t.kind === 'class',
        attributes: attrs.join('\n'), methods: meths.join('\n'),
      };
      if (!st && t.attrs.some((a) => /^(System\.)?Serializable\b/.test(a))) n.stereotype = 'Serializable';
      nodes.push(n);
      byName.set(UML.baseName(t.name), { n, t });
    }
    const pairs = new Set();
    const addEdge = (from, to, type, extra) => {
      const k = from + '>' + to;
      if (pairs.has(k) || from === to) return;
      pairs.add(k);
      edges.push(Object.assign({ id: uid('e'), from, to, type, label: '' }, extra || {}));
    };
    for (const { n, t } of byName.values()) {
      t.bases.forEach((b, idx) => {
        const bn = UML.baseName(b);
        const target = byName.get(bn);
        if (target) {
          const isIface = target.t.kind === 'interface';
          addEdge(n.id, target.n.id, isIface && t.kind !== 'interface' ? 'realization' : 'inheritance');
        } else if (idx === 0 && !n.stereotype && t.kind === 'class' && !/^I[A-Z]/.test(bn)) {
          n.stereotype = bn; // harici taban (MonoBehaviour vb.) stereotip olur
        }
      });
    }
    if (opts.relations) {
      for (const { n, t } of byName.values()) {
        if (t.kind === 'enum') continue;
        for (const ft of t.fieldTypes) {
          const idents = String(ft).match(/[A-Za-z_]\w*/g) || [];
          for (const id of idents) {
            const target = byName.get(id);
            if (!target || target.n === n) continue;
            addEdge(n.id, target.n.id, 'association', COLLECTION_RE.test(ft) ? { dstLabel: '*' } : null);
          }
        }
      }
    }
    return { nodes, edges };
  }

  App.CSharp = { generateClass, generateAll, parseSource, parseSources, buildDiagram, stripCode };
})(typeof window !== 'undefined' ? window : globalThis);
