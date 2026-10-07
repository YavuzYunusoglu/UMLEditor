'use strict';
/* Mermaid içe/dışa aktarım + PlantUML dışa aktarım */
(function (global) {
  const App = (global.App = global.App || {});
  const UML = App.UML;
  const $t = App.$t || ((k) => k);

  /* ======================= DIŞA AKTARIM ======================= */

  function mmText(s) {
    return '"' + String(s || '').replace(/"/g, '#quot;').replace(/\n/g, '<br/>') + '"';
  }

  function toMermaidFlow(tab) {
    const flowNodes = tab.nodes.filter((n) => n.type !== 'class' && n.type !== 'frame');
    if (!flowNodes.length) return '';
    const ids = new Map();
    flowNodes.forEach((n, i) => ids.set(n.id, 'N' + (i + 1)));
    const lines = ['flowchart TD'];
    for (const n of flowNodes) {
      const id = ids.get(n.id), t = mmText(n.text || ' ');
      let s;
      switch (n.type) {
        case 'terminator': s = `${id}([${t}])`; break;
        case 'decision': s = `${id}{${t}}`; break;
        case 'io': s = `${id}[/${t}/]`; break;
        case 'preparation': s = `${id}{{${t}}}`; break;
        case 'subprocess': s = `${id}[[${t}]]`; break;
        case 'connector': s = `${id}((${t}))`; break;
        case 'document': s = `${id}>${t}]`; break;
        case 'note': case 'text': s = `${id}[${t}]`; break;
        default: s = `${id}[${t}]`;
      }
      lines.push('    ' + s);
    }
    for (const e of tab.edges) {
      if (!ids.has(e.from) || !ids.has(e.to)) continue;
      const meta = UML.EDGE_TYPES[e.type] || {};
      const dashed = e.dash != null ? e.dash : meta.dash;
      const arrow = dashed ? '-.->' : '-->';
      const lbl = e.label ? `|${mmText(e.label)}|` : '';
      lines.push(`    ${ids.get(e.from)} ${arrow}${lbl} ${ids.get(e.to)}`);
    }
    return lines.join('\n');
  }

  function mmType(t) { return String(t || '').replace(/</g, '~').replace(/>/g, '~'); }
  function mmName(n) { return String(n.name || 'Sinif').replace(/\s+/g, '_').replace(/</g, '~').replace(/>/g, '~'); }

  function toMermaidClass(tab) {
    const classes = tab.nodes.filter((n) => n.type === 'class');
    if (!classes.length) return '';
    const names = new Map(classes.map((n) => [n.id, mmName(n)]));
    const lines = ['classDiagram'];
    for (const n of classes) {
      const nm = names.get(n.id);
      lines.push(`    class ${nm} {`);
      if (n.stereotype) lines.push(`        <<${n.stereotype}>>`);
      const isEnum = String(n.stereotype).toLowerCase() === 'enum';
      for (const l of UML.splitLines(n.attributes)) {
        if (isEnum) { lines.push('        ' + l.trim()); continue; }
        const m = UML.parseMember(l);
        if (!m) continue;
        const suf = m.mods.has('static') || m.mods.has('const') ? '$' : '';
        lines.push(`        ${m.vis}${m.type ? mmType(m.type) + ' ' : ''}${m.name}${suf}`);
      }
      for (const l of UML.splitLines(n.methods)) {
        const m = UML.parseMember(l);
        if (!m) continue;
        const suf = m.mods.has('abstract') ? '*' : (m.mods.has('static') ? '$' : '');
        const params = m.params.map((p) => (p.type ? mmType(p.type) + ' ' : '') + p.name).join(', ');
        lines.push(`        ${m.vis}${mmType(m.name)}(${params})${suf}${m.ret ? ' ' + mmType(m.ret) : ''}`);
      }
      lines.push('    }');
    }
    for (const e of tab.edges) {
      const a = names.get(e.from), b = names.get(e.to);
      if (!a || !b) continue;
      const sl = e.srcLabel ? ` "${e.srcLabel}"` : '', dl = e.dstLabel ? ` "${e.dstLabel}"` : '';
      const lbl = e.label ? ' : ' + e.label.replace(/\n/g, ' ') : '';
      let rel;
      switch (e.type) {
        case 'inheritance': rel = `${b}${dl} <|--${sl} ${a}`; break;
        case 'realization': rel = `${b}${dl} <|..${sl} ${a}`; break;
        case 'composition': rel = `${a}${sl} *--${dl} ${b}`; break;
        case 'aggregation': rel = `${a}${sl} o--${dl} ${b}`; break;
        case 'dependency': rel = `${a}${sl} ..>${dl} ${b}`; break;
        case 'link': rel = `${a}${sl} --${dl} ${b}`; break;
        default: rel = `${a}${sl} -->${dl} ${b}`;
      }
      lines.push('    ' + rel + lbl);
    }
    return lines.join('\n');
  }

  function toMermaid(tab) {
    return [toMermaidClass(tab), toMermaidFlow(tab)].filter(Boolean).join('\n\n%% ---------------------------------\n\n');
  }

  function toPlantUML(tab) {
    const classes = tab.nodes.filter((n) => n.type === 'class');
    const lines = ['@startuml', 'skinparam classAttributeIconSize 0', ''];
    const names = new Map(classes.map((n) => [n.id, String(n.name || 'Sinif').replace(/\s+/g, '_')]));
    const vis = (v) => v || '';
    for (const n of classes) {
      const st = String(n.stereotype || '').toLowerCase();
      const kw = st === 'interface' ? 'interface' : st === 'enum' ? 'enum' : (n.abstract ? 'abstract class' : 'class');
      const stereo = n.stereotype && !['interface', 'enum'].includes(st) ? ` <<${n.stereotype}>>` : '';
      lines.push(`${kw} ${names.get(n.id)}${stereo} {`);
      for (const l of UML.splitLines(n.attributes)) {
        if (st === 'enum') { lines.push('  ' + l.trim()); continue; }
        const m = UML.parseMember(l);
        if (!m) continue;
        const mod = m.mods.has('static') || m.mods.has('const') ? '{static} ' : '';
        lines.push(`  ${mod}${vis(m.vis)}${m.name}${m.type ? ' : ' + m.type : ''}${m.def ? ' = ' + m.def : ''}`);
      }
      for (const l of UML.splitLines(n.methods)) {
        const m = UML.parseMember(l);
        if (!m) continue;
        const mod = (m.mods.has('static') ? '{static} ' : '') + (m.mods.has('abstract') ? '{abstract} ' : '');
        lines.push(`  ${mod}${vis(m.vis)}${m.name}(${m.params.map((p) => p.name + (p.type ? ' : ' + p.type : '')).join(', ')})${m.ret ? ' : ' + m.ret : ''}`);
      }
      lines.push('}', '');
    }
    for (const e of tab.edges) {
      const a = names.get(e.from), b = names.get(e.to);
      if (!a || !b) continue;
      const sl = e.srcLabel ? ` "${e.srcLabel}"` : '', dl = e.dstLabel ? ` "${e.dstLabel}"` : '';
      const lbl = e.label ? ' : ' + e.label.replace(/\n/g, ' ') : '';
      const arrows = { inheritance: '--|>', realization: '..|>', composition: '*--', aggregation: 'o--', dependency: '..>', link: '--', association: '-->' };
      lines.push(`${a}${sl} ${arrows[e.type] || '-->'}${dl} ${b}${lbl}`);
    }
    // notlar
    tab.nodes.filter((n) => n.type === 'note').forEach((n, i) => {
      lines.push('', `note "${String(n.text || '').replace(/"/g, "'").replace(/\n/g, '\\n')}" as N${i + 1}`);
    });
    lines.push('', '@enduml');
    return lines.join('\n');
  }

  /* ======================= İÇE AKTARIM ======================= */

  function cleanLabel(s) {
    s = String(s || '').trim();
    if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith('`') && s.endsWith('`'))) s = s.slice(1, -1);
    return s.replace(/<br\s*\/?>/gi, '\n').replace(/#quot;/g, '"').replace(/&quot;/g, '"').replace(/&amp;/g, '&').trim();
  }

  const SHAPE_DELIMS = [
    ['(((', ')))', 'connector'], ['([', '])', 'terminator'], ['[[', ']]', 'subprocess'], ['[(', ')]', 'document'],
    ['((', '))', 'connector'], ['{{', '}}', 'preparation'], ['[/', '/]', 'io'], ['[\\', '\\]', 'io'], ['[/', '\\]', 'process'], ['[\\', '/]', 'process'],
    ['>', ']', 'document'], ['{', '}', 'decision'], ['(', ')', 'process'], ['[', ']', 'process'],
  ];
  // '-' ve '.' yalnızca bir ok başlangıcı değilse id'ye dahil edilir
  const ID_RE = /^[\p{L}\p{N}_](?:[\p{L}\p{N}_]|[-.](?![-.>=]))*/u;

  function parseNodeToken(s, pos) {
    const rest = s.slice(pos);
    const m = rest.match(ID_RE);
    if (!m) return null;
    let id = m[0];
    let i = pos + id.length;
    // ':::' sınıf atamasını atla
    let shape = null, label = null;
    for (const [open, close, type] of SHAPE_DELIMS) {
      if (s.startsWith(open, i)) {
        const end = s.indexOf(close, i + open.length);
        if (end < 0) continue;
        label = cleanLabel(s.slice(i + open.length, end));
        shape = type;
        i = end + close.length;
        break;
      }
    }
    const cls = s.slice(i).match(/^:::[\w-]+/);
    if (cls) i += cls[0].length;
    return { id, shape, label, end: i };
  }

  const LINK_TEXT_RE = /^\s*(--|==|-\.)\s*([^\s>\-=.|][^|]*?)\s*(-{2,}>|={2,}>|\.-+>|-{3,}|={3,}|\.-+)\s*/;
  const LINK_RE = /^\s*(<)?(-{2,}>|-{3,}|={2,}>|={3,}|-\.+->|-\.+-|--[ox]|==[ox])\s*(?:\|([^|]*)\|)?\s*/;

  function parseLink(s, pos) {
    const rest = s.slice(pos);
    let m = rest.match(LINK_TEXT_RE);
    if (m) return { label: cleanLabel(m[2]), dashed: m[1] === '-.' || m[3].includes('.'), arrow: m[3].endsWith('>'), end: pos + m[0].length };
    m = rest.match(LINK_RE);
    if (m) return { label: cleanLabel(m[3] || ''), dashed: m[2].includes('.'), arrow: /[>ox]$/.test(m[2]), end: pos + m[0].length };
    return null;
  }

  function parseFlowchart(lines, dir) {
    const nodes = new Map();
    const edges = [];
    const ensure = (tok) => {
      let n = nodes.get(tok.id);
      if (!n) { n = { id: tok.id, type: 'process', text: tok.id, explicit: false }; nodes.set(tok.id, n); }
      if (tok.shape) {
        n.type = tok.shape;
        n.text = tok.label != null ? tok.label : n.text;
        n.explicit = true;
        if (tok.shape === 'process' && /^(start|end|başla|bitir|son|bitiş|baslangic|başlangıç)$/i.test(n.text)) n.type = 'terminator'; // i18n-ok: Türkçe başlangıç sözcükleri
        if (tok.shape === 'connector' && n.text.length > 3) n.type = 'terminator';
      }
      return n;
    };
    for (let raw of lines) {
      let line = raw.trim().replace(/;$/, '');
      if (!line || line.startsWith('%%')) continue;
      if (/^(style|classDef|class|click|linkStyle|subgraph|end|direction)\b/.test(line)) continue;
      let pos = 0;
      let prev = null;
      let pendingLink = null;
      while (pos < line.length) {
        while (line[pos] === ' ') pos++;
        if (pos >= line.length) break;
        // düğüm grubu (A & B)
        const group = [];
        for (;;) {
          const tok = parseNodeToken(line, pos);
          if (!tok) break;
          group.push(ensure(tok));
          pos = tok.end;
          const amp = line.slice(pos).match(/^\s*&\s*/);
          if (amp) pos += amp[0].length; else break;
        }
        if (!group.length) break;
        if (prev && pendingLink) {
          for (const a of prev) for (const b of group) edges.push({ from: a.id, to: b.id, label: pendingLink.label, dashed: pendingLink.dashed, arrow: pendingLink.arrow });
        }
        prev = group;
        const link = parseLink(line, pos);
        if (!link) break;
        pendingLink = link;
        pos = link.end;
      }
    }
    return { nodes: [...nodes.values()], edges, dir };
  }

  function convertMember(text) {
    let s = String(text).trim().replace(/~([^~]+)~/g, '<$1>');
    if (!s || /^<<.*>>$/.test(s)) return null;
    let mods = '';
    if (/\$$/.test(s)) { mods += '{static} '; s = s.slice(0, -1); }
    if (/\*$/.test(s)) { mods += '{abstract} '; s = s.slice(0, -1); }
    let vis = '';
    if (/^[+\-#~]/.test(s)) { vis = s[0]; s = s.slice(1).trim(); }
    const paren = s.indexOf('(');
    if (paren >= 0) {
      const close = s.lastIndexOf(')');
      let ret = s.slice(close + 1).trim();
      // "makeSound()* void" veya "getX() int$"
      ret = ret.replace(/^([$*]+)|([$*]+)$/g, (m) => {
        if (m.includes('$')) mods += '{static} ';
        if (m.includes('*')) mods += '{abstract} ';
        return '';
      }).trim();
      if (ret.startsWith(':')) ret = ret.slice(1).trim();
      const params = App.U.splitTop(s.slice(paren + 1, close), ',', true).map((p) => {
        p = p.trim(); if (!p) return null;
        if (p.includes(':')) return p.replace(/\s*:\s*/, ' : ');
        const m = p.match(/^(.*\S)\s+(\w+)$/);
        return m ? `${m[2]} : ${m[1]}` : p;
      }).filter(Boolean);
      return `${vis || '+'} ${mods}${s.slice(0, paren).trim()}(${params.join(', ')})${ret ? ' : ' + ret : ''}`;
    }
    if (s.includes(':')) return `${vis} ${mods}${s}`.trim();
    const m = s.match(/^(.*\S)\s+(\w+)$/);
    return `${vis} ${mods}${m ? `${m[2]} : ${m[1]}` : s}`.trim();
  }

  const REL_RE = /^([\w~<>.]+)\s*(?:"([^"]*)")?\s*(<\|--|--\|>|<\|\.\.|\.\.\|>|\*--|--\*|o--|--o|<--|-->|<\.\.|\.\.>|--|\.\.)\s*(?:"([^"]*)")?\s*([\w~<>.]+)\s*(?::\s*(.*))?$/;

  function parseClassDiagram(lines) {
    const classes = new Map();
    const edges = [];
    const get = (raw) => {
      const name = String(raw).replace(/~([^~]+)~/g, '<$1>');
      let c = classes.get(name);
      if (!c) { c = { name, stereotype: '', attrs: [], meths: [] }; classes.set(name, c); }
      return c;
    };
    const addMember = (c, text) => {
      const s = String(text).trim();
      const st = s.match(/^<<\s*(.+?)\s*>>$/);
      if (st) { c.stereotype = normalizeStereo(st[1]); return; }
      if (String(c.stereotype).toLowerCase() === 'enum') { if (s) c.attrs.push(s); return; }
      const m = convertMember(s);
      if (!m) return;
      if (/\(/.test(m.split(':')[0]) || /\)\s*(:|$)/.test(m)) c.meths.push(m); else c.attrs.push(m);
    };
    let open = null;
    for (let raw of lines) {
      const line = raw.trim();
      if (!line || line.startsWith('%%')) continue;
      if (open) {
        if (line === '}') { open = null; continue; }
        addMember(open, line);
        continue;
      }
      let m = line.match(/^class\s+([\w~<>.]+)(?:\s*\[[^\]]*\])?(?:\s*:::\s*\w+)?\s*(\{)?\s*(\})?$/);
      if (m) { const c = get(m[1]); if (m[2] && !m[3]) open = c; continue; }
      m = line.match(/^<<\s*(.+?)\s*>>\s*([\w~<>.]+)$/);
      if (m) { get(m[2]).stereotype = normalizeStereo(m[1]); continue; }
      m = line.match(REL_RE);
      if (m) {
        const [, A, la, op, lb, B, label] = m;
        const a = get(A), b = get(B);
        let from = a, to = b, type = 'association', sl = la, dl = lb;
        const swap = () => { [from, to] = [to, from]; [sl, dl] = [dl, sl]; };
        switch (op) {
          case '<|--': type = 'inheritance'; swap(); break;
          case '--|>': type = 'inheritance'; break;
          case '<|..': type = 'realization'; swap(); break;
          case '..|>': type = 'realization'; break;
          case '*--': type = 'composition'; break;
          case '--*': type = 'composition'; swap(); break;
          case 'o--': type = 'aggregation'; break;
          case '--o': type = 'aggregation'; swap(); break;
          case '-->': type = 'association'; break;
          case '<--': type = 'association'; swap(); break;
          case '..>': type = 'dependency'; break;
          case '<..': type = 'dependency'; swap(); break;
          case '..': type = 'link'; break;
          default: type = 'link';
        }
        edges.push({ from: from.name, to: to.name, type, label: label ? label.trim() : '', srcLabel: sl || '', dstLabel: dl || '', dash: op === '..' ? true : undefined });
        continue;
      }
      m = line.match(/^([\w~<>.]+)\s*:\s*(.+)$/);
      if (m) { addMember(get(m[1]), m[2]); continue; }
    }
    return { classes: [...classes.values()], edges };
  }

  function normalizeStereo(s) {
    const low = s.toLowerCase();
    if (low === 'interface') return 'interface';
    if (low === 'enumeration' || low === 'enum') return 'enum';
    if (low === 'abstract') return '';
    return s;
  }

  /* Mermaid metnini diyagram parçasına çevir */
  function importMermaid(text) {
    const lines = String(text).replace(/\r/g, '').split('\n');
    // kod çiti ```mermaid
    const body = lines.filter((l) => !/^\s*```/.test(l));
    const first = body.findIndex((l) => l.trim() && !l.trim().startsWith('%%'));
    if (first < 0) throw new Error($t('Boş metin'));
    const head = body[first].trim();
    const uid = App.U.uid;
    let m;
    if ((m = head.match(/^(flowchart|graph)\b\s*(TB|TD|BT|LR|RL)?/i))) {
      const dirRaw = (m[2] || 'TD').toUpperCase();
      const res = parseFlowchart(body.slice(first + 1), dirRaw);
      const idMap = new Map();
      const nodes = res.nodes.map((n) => {
        const meta = UML.SHAPES[n.type];
        const node = { id: uid('n'), type: n.type, x: 0, y: 0, w: meta.w, h: meta.h, text: n.text };
        idMap.set(n.id, node.id);
        if (n.type !== 'connector') node.h = Math.max(node.h, App.Geo.requiredHeight(node));
        return node;
      });
      const edges = res.edges.map((e) => ({ id: uid('e'), from: idMap.get(e.from), to: idMap.get(e.to), type: e.arrow ? 'flow' : 'link', label: e.label || '', dash: e.dashed || undefined }));
      return { nodes, edges, direction: dirRaw === 'LR' || dirRaw === 'RL' ? 'LR' : 'TB', kind: 'flow' };
    }
    if (/^classDiagram/i.test(head)) {
      const res = parseClassDiagram(body.slice(first + 1));
      const idMap = new Map();
      const nodes = res.classes.map((c) => {
        const node = { id: uid('n'), type: 'class', x: 0, y: 0, w: 0, name: c.name, stereotype: c.stereotype, namespace: '', abstract: false, attributes: c.attrs.join('\n'), methods: c.meths.join('\n'), showMembers: true };
        idMap.set(c.name, node.id);
        return node;
      });
      const edges = res.edges.map((e) => {
        const o = { id: uid('e'), from: idMap.get(e.from), to: idMap.get(e.to), type: e.type, label: e.label, srcLabel: e.srcLabel, dstLabel: e.dstLabel };
        if (e.dash) o.dash = true;
        return o;
      });
      return { nodes, edges, direction: 'TB', kind: 'class' };
    }
    throw new Error($t('Desteklenen Mermaid türleri: flowchart / graph ve classDiagram'));
  }

  App.Mermaid = { toMermaid, toMermaidFlow, toMermaidClass, toPlantUML, importMermaid, convertMember };
})(typeof window !== 'undefined' ? window : globalThis);
