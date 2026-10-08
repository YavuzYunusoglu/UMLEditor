/* Saf mantık modülleri için hızlı testler: node tests/run-tests.js */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');

const root = path.join(__dirname, '..', 'js');
const ctx = { console, globalThis: null, TextEncoder };
ctx.globalThis = ctx;
vm.createContext(ctx);
// Testler varsayılan dil (İngilizce) ile çalışır: vm bağlamında navigator yok
for (const f of ['i18n.js', 'util.js', 'theme.js', 'uml.js', 'model.js', 'geometry.js', 'render.js', 'layout.js', 'templates.js', 'csharp.js', 'mermaid.js', 'zip.js']) {
  vm.runInContext(fs.readFileSync(path.join(root, f), 'utf8'), ctx, { filename: f });
}
const App = ctx.App;
let passed = 0, failed = 0;
const plain = (x) => JSON.parse(JSON.stringify(x));
function test(name, fn) {
  try { fn(); passed++; console.log('  ok  ' + name); }
  catch (e) { failed++; console.log('  FAIL ' + name + '\n       ' + (e.stack || e).toString().split('\n').slice(0, 4).join('\n       ')); }
}

/* ---------- Üye ayrıştırma ---------- */
test('parseMember: UML alanı', () => {
  const m = App.UML.parseMember('- speed : float = 5f');
  assert.strictEqual(m.vis, '-'); assert.strictEqual(m.name, 'speed'); assert.strictEqual(m.type, 'float'); assert.strictEqual(m.def, '5f');
});
test('parseMember: metot', () => {
  const m = App.UML.parseMember('+ Move(dir : Vector3, speed : float = 2) : void');
  assert.ok(m.isMethod); assert.strictEqual(m.name, 'Move'); assert.strictEqual(m.params.length, 2);
  assert.strictEqual(m.params[1].type, 'float'); assert.strictEqual(m.params[1].def, '2'); assert.strictEqual(m.ret, 'void');
});
test('parseMember: statik özellik', () => {
  const m = App.UML.parseMember('+ {static} Instance : GameManager {get; private set;}');
  assert.ok(m.mods.has('static')); assert.strictEqual(m.prop, 'get; private set;'); assert.strictEqual(m.type, 'GameManager');
});
test('parseMember: C# tarzı', () => {
  const m = App.UML.parseMember('public static Dictionary<string, int> map');
  assert.strictEqual(m.vis, '+'); assert.ok(m.mods.has('static')); assert.strictEqual(m.type, 'Dictionary<string, int>'); assert.strictEqual(m.name, 'map');
});
test('parseMember: event', () => {
  const m = App.UML.parseMember('+ OnDie : event Action<int>');
  assert.ok(m.mods.has('event')); assert.strictEqual(m.type, 'Action<int>');
});

/* ---------- C# içe aktarma ---------- */
const SRC = `
using UnityEngine;
using System.Collections.Generic;
namespace Game.Core {
  /// <summary>Oyuncu</summary>
  [RequireComponent(typeof(Rigidbody))]
  public class Player : MonoBehaviour, IDamageable
  {
      [SerializeField] private float speed = 5f; // hız
      [Header("Refs")] [SerializeField] Weapon weapon;
      public List<Item> items = new List<Item>();
      private Dictionary<string, int> stats = new() { { "a", 1 } };
      public static Player Instance { get; private set; }
      public int Health { get; set; } = 100;
      public bool IsDead => Health <= 0;
      public event System.Action<int> OnHit;
      private System.Action cb = () => { Debug.Log("x{y}"); };
      const int MAX = 3;
      string s = $"hp: {Health} {{x}}";
      void Awake() { Instance = this; if (x) { } }
      public void TakeDamage(float amount) => Health -= (int)amount;
      private IEnumerator Routine(int count = 2) { yield return null; }
      public T Find<T>() where T : Component { return GetComponent<T>(); }
      public Player(int a) : base() { }
      [System.Serializable] public class Nested { public int v; }
  }
  public interface IDamageable { void TakeDamage(float amount); int Priority { get; } }
  public enum State { Idle, Run = 2, [Obsolete] Jump }
  public abstract class Weapon : MonoBehaviour { public abstract void Fire(); protected virtual void Reload() {} }
  [CreateAssetMenu] public class Item : ScriptableObject { public string itemName; }
  public partial class Player { public void Extra() {} }
}
`;
test('C# içe aktarım: tipler', () => {
  const types = App.CSharp.parseSources([SRC]);
  const names = types.map((t) => t.name).sort();
  assert.deepStrictEqual(plain(names), ['IDamageable', 'Item', 'Nested', 'Player', 'State', 'Weapon']);
  const p = types.find((t) => t.name === 'Player');
  assert.deepStrictEqual(plain(p.bases), ['MonoBehaviour', 'IDamageable']);
  assert.strictEqual(p.ns, 'Game.Core');
  const fields = p.fields.map((f) => f.name);
  assert.deepStrictEqual(plain(fields), ['speed', 'weapon', 'items', 'stats', 'OnHit', 'cb', 'MAX', 's']);
  const props = p.props.map((f) => f.name);
  assert.deepStrictEqual(plain(props), ['Instance', 'Health', 'IsDead']);
  const meths = p.methods.map((m) => m.name);
  assert.deepStrictEqual(plain(meths), ['Awake', 'TakeDamage', 'Routine', 'Find<T>', 'Player', 'Extra']);
  assert.strictEqual(p.methods.find((m) => m.name === 'Player').ctor, true);
  assert.strictEqual(p.props[0].acc, 'get; private set;');
  const st = types.find((t) => t.name === 'State');
  assert.deepStrictEqual(plain(st.values), ['Idle', 'Run', 'Jump']);
  const ifc = types.find((t) => t.name === 'IDamageable');
  assert.strictEqual(ifc.methods.length, 1); assert.strictEqual(ifc.props.length, 1);
});
test('C# içe aktarım: diyagram + ilişkiler', () => {
  const types = App.CSharp.parseSources([SRC]);
  const frag = App.CSharp.buildDiagram(types);
  const byName = new Map(frag.nodes.map((n) => [n.name, n]));
  assert.strictEqual(byName.get('Player').stereotype, 'MonoBehaviour');
  assert.strictEqual(byName.get('Item').stereotype, 'ScriptableObject');
  assert.strictEqual(byName.get('IDamageable').stereotype, 'interface');
  assert.strictEqual(byName.get('Weapon').abstract, true);
  assert.strictEqual(byName.get('Nested').stereotype, 'Serializable');
  const rel = (a, b) => frag.edges.find((e) => e.from === byName.get(a).id && e.to === byName.get(b).id);
  assert.strictEqual(rel('Player', 'IDamageable').type, 'realization');
  assert.strictEqual(rel('Player', 'Weapon').type, 'association');
  assert.strictEqual(rel('Player', 'Item').dstLabel, '*');
  assert.ok(/- speed : float = 5f/.test(byName.get('Player').attributes));
  assert.ok(/\+ \{static\} Instance : Player \{get; private set;\}/.test(byName.get('Player').attributes));
  assert.ok(/\+ TakeDamage\(amount : float\) : void/.test(byName.get('Player').methods));
});

/* ---------- C# dışa aktarma ---------- */
test('C# dışa aktarım: MonoBehaviour + arayüz + singleton', () => {
  const tab = App.Model.newTab('t');
  const a = App.Model.createNode('class', 0, 0, { name: 'GameManager', stereotype: 'MonoBehaviour', attributes: '+ {static} Instance : GameManager {get; private set;}\n- speed : float = 5\n+ items : List<Item>', methods: '- Awake() : void\n+ Spawn() : IEnumerator\n+ Count() : int' });
  const i = App.Model.createNode('class', 0, 0, { name: 'IDamageable', stereotype: 'interface', methods: '+ TakeDamage(amount : float) : void' });
  tab.nodes.push(a, i);
  tab.edges.push(App.Model.createEdge(a.id, i.id, 'realization'));
  const out = App.CSharp.generateClass(a, tab);
  assert.strictEqual(out.fileName, 'GameManager.cs');
  const c = out.code;
  assert.ok(c.includes('public class GameManager : MonoBehaviour, IDamageable'), c);
  assert.ok(c.includes('[SerializeField] private float speed = 5f;'), c);
  assert.ok(c.includes('public static GameManager Instance { get; private set; }'), c);
  assert.ok(c.includes('DontDestroyOnLoad(gameObject);'), c);
  assert.ok(c.includes('public void TakeDamage(float amount)'), c);
  assert.ok(c.includes('using System.Collections.Generic;'), c);
  assert.ok(c.includes('yield return null;'), c);
  const ic = App.CSharp.generateClass(i, tab).code;
  assert.ok(ic.includes('void TakeDamage(float amount);'), ic);
});
test('C# dışa aktarım: ScriptableObject, Editor, enum, namespace', () => {
  const tab = App.Model.newTab('t');
  const so = App.Model.createNode('class', 0, 0, { name: 'ItemData', stereotype: 'ScriptableObject', attributes: '+ value : int = 10', namespace: 'Game.Data' });
  const ed = App.Model.createNode('class', 0, 0, { name: 'PlayerEditor', stereotype: 'Editor', methods: '+ OnInspectorGUI() : void' });
  const en = App.Model.createNode('class', 0, 0, { name: 'State', stereotype: 'enum', attributes: 'Idle\nRun' });
  tab.nodes.push(so, ed, en);
  const s = App.CSharp.generateClass(so, tab).code;
  assert.ok(s.includes('[CreateAssetMenu(fileName = "New ItemData", menuName = "ScriptableObjects/ItemData")]'), s);
  assert.ok(s.includes('namespace Game.Data\n{'), s);
  const e = App.CSharp.generateClass(ed, tab);
  assert.strictEqual(e.fileName, 'Editor/PlayerEditor.cs');
  assert.ok(e.code.includes('[CustomEditor(typeof(Player))]'), e.code);
  assert.ok(e.code.includes('public override void OnInspectorGUI()'), e.code);
  const n = App.CSharp.generateClass(en, tab).code;
  assert.ok(n.includes('public enum State\n{\n    Idle,\n    Run\n}'), n);
});
test('C# gidiş-dönüş: üretilen kod tekrar ayrıştırılabilir', () => {
  const tab = App.Model.newTab('t');
  for (const it of App.Templates.items.filter((x) => x.section === 'unity' || x.section === 'patterns')) {
    const frag = it.build();
    frag.nodes.forEach((n) => { n.id = it.id + n.id; });
    (frag.edges || []).forEach((e) => { e.from = it.id + e.from; e.to = it.id + e.to; e.id = it.id + e.id; });
    tab.nodes.push(...frag.nodes); tab.edges.push(...(frag.edges || []));
  }
  const files = App.CSharp.generateAll(tab);
  assert.ok(files.length > 15);
  for (const f of files) {
    const types = App.CSharp.parseSource(f.code);
    assert.ok(types.length >= 1, 'ayrıştırılamadı: ' + f.fileName + '\n' + f.code);
    // parantez dengesi
    const open = (f.code.match(/\{/g) || []).length, close = (f.code.match(/\}/g) || []).length;
    assert.strictEqual(open, close, f.fileName);
  }
});

/* ---------- Mermaid ---------- */
test('Mermaid flowchart içe aktarım', () => {
  const r = App.Mermaid.importMermaid(`flowchart TD
    A([Başla]) --> B{Koşul?}
    B -->|Evet| C[İşlem]
    B -- Hayır --> D[/Girdi/]
    C & D --> E((x))
    E -.-> F[[Alt]]
    my-node --> A`);
  assert.strictEqual(r.kind, 'flow');
  const t = new Map(r.nodes.map((n) => [n.text, n.type]));
  assert.strictEqual(t.get('Başla'), 'terminator');
  assert.strictEqual(t.get('Koşul?'), 'decision');
  assert.strictEqual(t.get('Girdi'), 'io');
  assert.strictEqual(t.get('Alt'), 'subprocess');
  assert.strictEqual(t.get('my-node'), 'process');
  assert.strictEqual(r.edges.length, 7);
  assert.strictEqual(r.edges.filter((e) => e.label === 'Evet').length, 1);
  assert.strictEqual(r.edges.filter((e) => e.label === 'Hayır').length, 1);
  assert.strictEqual(r.edges.filter((e) => e.dash).length, 1);
});
test('Mermaid classDiagram içe aktarım', () => {
  const r = App.Mermaid.importMermaid(`classDiagram
    class Animal {
      <<abstract>>
      +String name
      +int age$
      +makeSound()* void
      +move(int distance) bool
    }
    class IDamageable {
      <<interface>>
      +TakeDamage(float amount)
    }
    Animal <|-- Dog
    Dog ..|> IDamageable
    Zoo "1" o-- "*" Animal : contains
    Dog : +bark() void`);
  const by = new Map(r.nodes.map((n) => [n.name, n]));
  assert.ok(by.get('Animal').attributes.includes('+ name : String'));
  assert.ok(by.get('Animal').attributes.includes('+ {static} age : int'));
  assert.ok(by.get('Animal').methods.includes('+ {abstract} makeSound() : void'));
  assert.ok(by.get('Animal').methods.includes('+ move(distance : int) : bool'));
  assert.strictEqual(by.get('IDamageable').stereotype, 'interface');
  assert.ok(by.get('Dog').methods.includes('+ bark() : void'));
  const e1 = r.edges.find((e) => e.type === 'inheritance');
  assert.strictEqual(e1.from, by.get('Dog').id); assert.strictEqual(e1.to, by.get('Animal').id);
  const e2 = r.edges.find((e) => e.type === 'aggregation');
  assert.strictEqual(e2.from, by.get('Zoo').id); assert.strictEqual(e2.srcLabel, '1'); assert.strictEqual(e2.dstLabel, '*'); assert.strictEqual(e2.label, 'contains');
});
test('Mermaid dışa -> içe gidiş-dönüş', () => {
  const tab = App.Model.newTab('t');
  const frag = App.Templates.byId('statepattern').build();
  tab.nodes.push(...frag.nodes); tab.edges.push(...frag.edges);
  const flow = App.Templates.byId('for').build();
  tab.nodes.push(...flow.nodes); tab.edges.push(...flow.edges.map((e) => Object.assign(e, { id: 'f' + e.id })));
  const txt = App.Mermaid.toMermaidClass(tab);
  const back = App.Mermaid.importMermaid(txt);
  assert.strictEqual(back.nodes.length, 5);
  assert.strictEqual(back.edges.length, 4);
  const ftxt = App.Mermaid.toMermaidFlow(tab);
  const fb = App.Mermaid.importMermaid(ftxt);
  assert.strictEqual(fb.nodes.length, 5);
  assert.strictEqual(fb.edges.length, 5);
  assert.ok(App.Mermaid.toPlantUML(tab).includes('IdleState ..|> IState'));
});

/* ---------- Geometri / yerleşim ---------- */
test('Kenar geometrisi tüm şablonlar için sonlu', () => {
  for (const it of App.Templates.items) {
    const frag = it.build();
    const tab = App.Model.newTab('t');
    tab.nodes = frag.nodes; tab.edges = frag.edges || [];
    for (const r of ['orthogonal', 'straight', 'curved']) {
      tab.routing = r;
      const g = App.Geo.computeEdges(tab);
      assert.strictEqual(g.size, tab.edges.length, it.id);
      for (const v of g.values()) {
        assert.ok(v.pts.every((p) => isFinite(p.x) && isFinite(p.y)), it.id + ' ' + r);
        assert.ok(!/NaN/.test(v.d), it.id + ' ' + r + ' ' + v.d);
      }
      const out = App.Render.renderTab(tab, App.Theme.themes.dark, { live: true });
      assert.ok(!/NaN|undefined/.test(out.nodes + out.edges + out.labels + out.frames), it.id + ' render');
    }
  }
});
test('Dik rota: hizalı düğümler düz çizgi', () => {
  const tab = App.Model.newTab('t');
  const a = App.Model.createNode('process', 0, 0), b = App.Model.createNode('process', 0, 200);
  tab.nodes.push(a, b); tab.edges.push(App.Model.createEdge(a.id, b.id, 'flow'));
  const g = [...App.Geo.computeEdges(tab).values()][0];
  assert.strictEqual(g.pts.length, 2);
});
function bendTab(routing, bx, by, points, sides) {
  const tab = App.Model.newTab('t');
  tab.routing = routing;
  const a = App.Model.createNode('process', 0, 0), b = App.Model.createNode('process', bx, by);
  const e = App.Model.createEdge(a.id, b.id, 'flow', Object.assign({ points }, sides || {}));
  tab.nodes.push(a, b); tab.edges.push(e);
  return { tab, e, g: () => App.Geo.computeEdges(tab).get(e.id) };
}
const hasPt = (pts, q) => pts.some((p) => Math.abs(p.x - q.x) < 0.01 && Math.abs(p.y - q.y) < 0.01);
test('Bükülme noktası: dik rota noktalardan geçer ve hep dik kalır', () => {
  let seed = 7;
  const rnd = (n) => { seed = (seed * 16807) % 2147483647; return Math.round(((seed / 2147483647) - 0.5) * n); };
  const SIDES = App.Geo.SIDES;
  for (let k = 0; k < 400; k++) {
    const pts = Array.from({ length: 1 + (k % 3) }, () => ({ x: rnd(800), y: rnd(800) }));
    const { g } = bendTab('orthogonal', rnd(600), rnd(600), pts, { fromSide: SIDES[k % 4], toSide: SIDES[(k >> 2) % 4] });
    const v = g();
    for (let i = 1; i < v.pts.length; i++) {
      const p = v.pts[i - 1], q = v.pts[i];
      assert.ok(Math.abs(p.x - q.x) < 0.01 || Math.abs(p.y - q.y) < 0.01, 'eğik parça ' + JSON.stringify([p, q]));
    }
    for (const w of pts) assert.ok(App.Geo.projectOnPoly(v.pts, w).d < 0.01, 'nokta rotada değil');
    assert.ok(hasPt(v.pts, v.start) && hasPt(v.pts, v.end));
    // hedefe dışarıdan girer (ok başı ters dönmez)
    const D = App.Geo.DIR[v.toSide];
    assert.ok(Math.abs(v.endDir.x + D.x) < 1e-6 && Math.abs(v.endDir.y + D.y) < 1e-6, 'hedefe ters yönden giriş');
  }
});
test('Bükülme noktası: düz ve eğri rotalar noktalardan geçer', () => {
  const pts = [{ x: 300, y: -100 }, { x: 320, y: 260 }];
  const s = bendTab('straight', 500, 200, pts).g();
  assert.deepStrictEqual(plain(s.pts.slice(1, -1)), pts);
  const c = bendTab('curved', 500, 200, pts).g();
  for (const w of pts) assert.ok(hasPt(c.pts, w));
  assert.ok(!/NaN/.test(c.d) && (c.d.match(/C/g) || []).length === 3);
  // noktalar tuvalde çizilir, dışa aktarımda çizilmez
  const { tab } = bendTab('orthogonal', 500, 200, pts);
  assert.strictEqual((App.Render.renderTab(tab, App.Theme.themes.dark, { live: true }).edges.match(/edge-wp/g) || []).length, 2);
  assert.ok(!/edge-wp/.test(App.Render.renderTab(tab, App.Theme.themes.dark, {}).edges));
});
test('Bükülme noktası: ekleme sırası çizgi boyunca konuma göre', () => {
  const pts = [{ x: 300, y: 30 }, { x: 300, y: 330 }];
  const v = bendTab('orthogonal', 600, 300, pts).g();
  assert.strictEqual(App.Geo.bendInsertIndex(v.pts, pts, { x: 200, y: 30 }), 0);
  assert.strictEqual(App.Geo.bendInsertIndex(v.pts, pts, { x: 300, y: 200 }), 1);
  assert.strictEqual(App.Geo.bendInsertIndex(v.pts, pts, { x: 450, y: 330 }), 2);
  assert.strictEqual(App.Geo.bendInsertIndex(v.pts, [], { x: 450, y: 330 }), 0);
});
test('Bükülme noktası: yapıştırınca noktalar da kayar', () => {
  const { tab } = bendTab('orthogonal', 400, 0, [{ x: 200, y: 100 }]);
  const res = App.Store.insertFragment({ nodes: plain(tab.nodes), edges: plain(tab.edges), offset: { x: 20, y: 20 } }, App.Model.newTab('x'));
  assert.deepStrictEqual(plain(res.edges[0].points), [{ x: 220, y: 120 }]);
});
test('Yerleşim: çakışma yok', () => {
  const types = App.CSharp.parseSources([SRC]);
  const frag = App.CSharp.buildDiagram(types);
  App.Layout.layered(frag.nodes, frag.edges, { reverse: new Set(['inheritance', 'realization']) });
  const bs = frag.nodes.map(App.Geo.bounds);
  for (let i = 0; i < bs.length; i++) for (let j = i + 1; j < bs.length; j++) {
    const a = bs[i], b = bs[j];
    const overlap = a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
    assert.ok(!overlap, 'çakışma: ' + frag.nodes[i].name + ' / ' + frag.nodes[j].name);
  }
  // kalıtımda ebeveyn üstte
  const by = new Map(frag.nodes.map((n) => [n.name, n]));
  assert.ok(by.get('IDamageable').y < by.get('Player').y);
});
test('Yerleşim: döngülü akış', () => {
  const frag = App.Templates.byId('lifecycle').build();
  App.Layout.layered(frag.nodes, frag.edges, {});
  assert.ok(frag.nodes.every((n) => isFinite(n.x) && isFinite(n.y)));
});

/* ---------- Model ---------- */
test('Store: geri al / yinele', () => {
  const S = App.Store;
  S.load(App.Model.newDoc());
  S.mutate(() => S.tab.nodes.push(App.Model.createNode('process', 0, 0)));
  S.mutate(() => { S.tab.nodes[0].text = 'x'; });
  assert.strictEqual(S.tab.nodes[0].text, 'x');
  S.undo();
  assert.strictEqual(S.tab.nodes[0].text, App.UML.SHAPES.process.label);
  S.undo();
  assert.strictEqual(S.tab.nodes.length, 0);
  S.redo(); S.redo();
  assert.strictEqual(S.tab.nodes[0].text, 'x');
  // görünüm değişikliği geri alma kaydı oluşturmaz
  S.begin(); S.tab.view.x = 999; assert.strictEqual(S.end(), false);
});
test('normalize: bozuk kenarları ayıklar', () => {
  const d = App.Model.normalize({ tabs: [{ nodes: [{ id: 'a', type: 'process' }], edges: [{ id: 'e', from: 'a', to: 'zz', type: 'flow' }] }] });
  assert.strictEqual(d.tabs[0].edges.length, 0);
  assert.strictEqual(d.tabs[0].nodes[0].w, 160);
});

/* ---------- Zip ---------- */
test('Zip: geçerli imzalar ve CRC', () => {
  const bytes = App.Zip.build([{ name: 'a.txt', data: 'hello' }, { name: 'Editor/b.cs', data: 'ğüş' }]);
  const dv = new DataView(bytes.buffer);
  assert.strictEqual(dv.getUint32(0, true), 0x04034b50);
  assert.strictEqual(dv.getUint32(14, true), 0x3610a686); // crc32("hello")
  const eocd = bytes.length - 22;
  assert.strictEqual(dv.getUint32(eocd, true), 0x06054b50);
  assert.strictEqual(dv.getUint16(eocd + 10, true), 2);
});

/* ---------- Çeviri (i18n) ---------- */
const { collect } = require('./i18n-keys');
const EN = App.I18n.DICTS.en;
test('i18n: koddaki her anahtarın İngilizce karşılığı var', () => {
  const missing = [...collect()].filter(([k]) => !Object.prototype.hasOwnProperty.call(EN, k)).map(([k, w]) => `${w}: ${JSON.stringify(k)}`);
  assert.deepStrictEqual(missing, [], 'eksik çeviriler:\n' + missing.join('\n'));
});
test('i18n: sözlükte kullanılmayan anahtar yok', () => {
  const used = collect();
  const unused = Object.keys(EN).filter((k) => !used.has(k));
  assert.deepStrictEqual(unused, [], 'kullanılmayan:\n' + unused.join('\n'));
});
test('i18n: yer tutucular ({...}) çeviride korunuyor', () => {
  const ph = (s) => (s.match(/\{\w+\}/g) || []).sort().join(',');
  const bad = Object.entries(EN).filter(([k, v]) => ph(k) !== ph(v) && /\{\w+\}/.test(k + v) && !/[{}]\s*$|\{(abstract|static|override|virtual)\}|Koşul\?|class Dog/.test(k)).map(([k]) => k);
  assert.deepStrictEqual(bad, []);
});
test('i18n: biçimlendirme işaretleri (** ve `) korunuyor', () => {
  const marks = (s) => [(s.match(/\*\*/g) || []).length, (s.match(/`/g) || []).length].join('/');
  const bad = Object.entries(EN).filter(([k, v]) => marks(k) !== marks(v)).map(([k]) => k);
  assert.deepStrictEqual(bad, []);
});
test('i18n: sistem dili algılama (tr -> Türkçe, diğerleri -> İngilizce)', () => {
  const detect = (language) => {
    const c = { console, globalThis: null, navigator: { language } };
    c.globalThis = c;
    vm.createContext(c);
    vm.runInContext(fs.readFileSync(path.join(root, 'i18n.js'), 'utf8'), c);
    return c.App.I18n.lang;
  };
  assert.strictEqual(detect('tr-TR'), 'tr');
  assert.strictEqual(detect('tr'), 'tr');
  assert.strictEqual(detect('en-US'), 'en');
  assert.strictEqual(detect('de-DE'), 'en');
  assert.strictEqual(detect(''), 'en');
});
test('i18n: parametre doldurma ve Türkçe mod', () => {
  assert.strictEqual(App.$t('{n} seçili', { n: 3 }), '3 selected');
  App.I18n._use('tr');
  assert.strictEqual(App.$t('{n} seçili', { n: 3 }), '3 seçili');
  App.I18n._use('en');
});
test('i18n: kodda $t() dışında kalmış Türkçe metin yok', () => {
  const offenders = [];
  for (const f of fs.readdirSync(root)) {
    if (!f.endsWith('.js') || f === 'i18n.js') continue;
    const raw = fs.readFileSync(path.join(root, f), 'utf8');
    const rawLines = raw.split('\n');
    const src = raw
      .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
      .replace(/(^|[^:'"\\])\/\/.*$/gm, '$1');
    const re = /(['"`])((?:(?!\1)[^\\\n]|\\.)*?[çğıöşüÇĞİÖŞÜ](?:(?!\1)[^\\\n]|\\.)*)\1/g;
    let m;
    while ((m = re.exec(src))) {
      const before = src.slice(Math.max(0, m.index - 4), m.index);
      if (/\$t\(\s*$/.test(before)) continue;
      // `...${$t('...')}...` gibi şablon dizelerinde Türkçe yalnızca $t() içindeyse sorun yok
      if (m[1] === '`' && !/[çğıöşüÇĞİÖŞÜ]/.test(m[2].replace(/\$t\(\s*'(?:[^'\\]|\\.)*'/g, ''))) continue;
      const line = src.slice(0, m.index).split('\n').length;
      if (/i18n-ok/.test(rawLines[line - 1])) continue; // bilinçli istisna
      offenders.push(`${f}:${line}: ${m[0].slice(0, 60)}`);
    }
  }
  assert.deepStrictEqual(offenders, [], offenders.join('\n'));
});

console.log(`\n${passed} geçti, ${failed} başarısız`);
process.exit(failed ? 1 : 0);
