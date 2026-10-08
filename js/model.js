'use strict';
/* Belge modeli + Store (seçim, geri al / yinele, olaylar) */
(function (global) {
  const App = (global.App = global.App || {});
  const { uid } = App.U;
  const $t = App.$t || ((k) => k);
  const { SHAPES, EDGE_TYPES } = App.UML;

  const DOC_VERSION = 1;

  function newTab(name) {
    return { id: uid('tab'), name: name || $t('Diyagram'), nodes: [], edges: [], routing: 'orthogonal', view: { x: 80, y: 60, zoom: 1 } };
  }

  function newDoc(name) {
    const t = newTab($t('Sınıf Diyagramı'));
    return { app: 'umlstudio', version: DOC_VERSION, name: name || $t('Adsız'), tabs: [t], activeTab: t.id };
  }

  function createNode(type, x, y, extra) {
    const meta = SHAPES[type] || SHAPES.process;
    const n = { id: uid('n'), type, x: Math.round(x || 0), y: Math.round(y || 0) };
    if (type === 'class') {
      Object.assign(n, { name: $t('YeniSinif'), stereotype: '', namespace: '', abstract: false, attributes: '', methods: '', showMembers: true, w: 0 });
    } else {
      Object.assign(n, { w: meta.w, h: meta.h, text: type === 'frame' ? $t('Grup') : (type === 'connector' ? '' : meta.label) });
    }
    if (extra) Object.assign(n, extra);
    return n;
  }

  function isUmlNode(n) { return n && (n.type === 'class'); }

  function defaultEdgeType(src) {
    if (!src) return 'flow';
    if (src.type === 'class') return 'association';
    if (src.type === 'note' || src.type === 'frame' || src.type === 'text') return 'dependency';
    return 'flow';
  }

  function createEdge(from, to, type, extra) {
    const e = { id: uid('e'), from, to, type: type || 'flow', label: '' };
    if (extra) Object.assign(e, extra);
    return e;
  }

  /* Yüklenen belgeyi doğrula / eksik alanları tamamla */
  function normalize(doc) {
    if (!doc || typeof doc !== 'object') throw new Error($t('Geçersiz belge'));
    if (!Array.isArray(doc.tabs)) {
      // Tek sekme biçimi {nodes, edges}
      if (Array.isArray(doc.nodes)) {
        const t = newTab(doc.name || $t('Diyagram'));
        t.nodes = doc.nodes; t.edges = doc.edges || [];
        doc = { name: doc.name || $t('Adsız'), tabs: [t] };
      } else throw new Error($t('Belge sekme içermiyor'));
    }
    doc.app = 'umlstudio';
    doc.version = DOC_VERSION;
    doc.name = doc.name || $t('Adsız');
    if (!doc.tabs.length) doc.tabs.push(newTab($t('Diyagram')));
    for (const t of doc.tabs) {
      t.id = t.id || uid('tab');
      t.name = t.name || $t('Diyagram');
      t.nodes = (t.nodes || []).filter((n) => n && n.id && n.type);
      const ids = new Set(t.nodes.map((n) => n.id));
      t.edges = (t.edges || []).filter((e) => e && e.id && ids.has(e.from) && ids.has(e.to));
      t.routing = t.routing || 'orthogonal';
      if (!t.view || !isFinite(t.view.zoom)) t.view = { x: 80, y: 60, zoom: 1 };
      for (const n of t.nodes) {
        n.x = +n.x || 0; n.y = +n.y || 0;
        if (n.type === 'class') {
          n.name = n.name == null ? 'Sinif' : String(n.name);
          n.attributes = n.attributes || ''; n.methods = n.methods || '';
          if (n.showMembers === undefined) n.showMembers = true;
          n.w = +n.w || 0;
        } else {
          const m = SHAPES[n.type] || SHAPES.process;
          n.w = +n.w || m.w; n.h = +n.h || m.h;
          if (n.text == null) n.text = '';
        }
      }
      for (const e of t.edges) if (!EDGE_TYPES[e.type]) e.type = 'association';
    }
    if (!doc.tabs.some((t) => t.id === doc.activeTab)) doc.activeTab = doc.tabs[0].id;
    return doc;
  }

  App.Model = { newDoc, newTab, createNode, createEdge, defaultEdgeType, normalize, isUmlNode, DOC_VERSION };

  /* ---------------- Store ---------------- */
  const listeners = {};
  const MAX_UNDO = 200;

  const Store = {
    doc: newDoc(),
    sel: { nodes: new Set(), edges: new Set() },
    undoStack: [], redoStack: [],
    dirty: false,
    _tx: null, _depth: 0,

    on(ev, fn) { (listeners[ev] = listeners[ev] || []).push(fn); },
    emit(ev, data) { (listeners[ev] || []).forEach((fn) => fn(data)); },

    get tab() { return this.doc.tabs.find((t) => t.id === this.doc.activeTab) || this.doc.tabs[0]; },
    node(id, tab) { return (tab || this.tab).nodes.find((n) => n.id === id); },
    edge(id, tab) { return (tab || this.tab).edges.find((e) => e.id === id); },

    serialize() {
      return JSON.stringify(this.doc, (k, v) => (k === 'view' || k === 'activeTab' ? undefined : v));
    },
    begin() {
      if (this._depth === 0) this._tx = this.serialize();
      this._depth++;
    },
    end() {
      if (this._depth === 0) return false;
      this._depth--;
      if (this._depth > 0) return false;
      const before = this._tx;
      this._tx = null;
      if (before !== this.serialize()) {
        this.undoStack.push(before);
        if (this.undoStack.length > MAX_UNDO) this.undoStack.shift();
        this.redoStack.length = 0;
        this.dirty = true;
        this.emit('change');
        return true;
      }
      return false;
    },
    mutate(fn) {
      this.begin();
      try { fn(); } finally { this.end(); }
    },
    canUndo() { return this.undoStack.length > 0; },
    canRedo() { return this.redoStack.length > 0; },
    undo() {
      while (this._depth > 0) this.end();
      if (!this.undoStack.length) return;
      this.redoStack.push(this.serialize());
      this._restore(this.undoStack.pop());
    },
    redo() {
      while (this._depth > 0) this.end();
      if (!this.redoStack.length) return;
      this.undoStack.push(this.serialize());
      this._restore(this.redoStack.pop());
    },
    _restore(json) {
      const views = new Map(this.doc.tabs.map((t) => [t.id, t.view]));
      const active = this.doc.activeTab;
      const d = JSON.parse(json);
      d.tabs.forEach((t) => { t.view = views.get(t.id) || { x: 80, y: 60, zoom: 1 }; });
      d.activeTab = d.tabs.some((t) => t.id === active) ? active : d.tabs[0].id;
      this.doc = d;
      this.dirty = true;
      this._pruneSelection();
      this.emit('change');
      this.emit('tab');
    },
    load(doc, opts) {
      this.doc = normalize(doc);
      this.undoStack.length = 0; this.redoStack.length = 0;
      this._tx = null; this._depth = 0;
      this.dirty = !!(opts && opts.dirty);
      this.sel.nodes.clear(); this.sel.edges.clear();
      this.emit('load');
      this.emit('tab');
      this.emit('selection');
    },
    setActiveTab(id) {
      if (this.doc.activeTab === id) return;
      this.doc.activeTab = id;
      this.sel.nodes.clear(); this.sel.edges.clear();
      this.emit('tab');
      this.emit('selection');
    },
    select(nodes, edges) {
      this.sel.nodes = new Set(nodes || []);
      this.sel.edges = new Set(edges || []);
      this.emit('selection');
    },
    clearSelection() { if (this.sel.nodes.size || this.sel.edges.size) this.select([], []); },
    _pruneSelection() {
      const t = this.tab;
      const nIds = new Set(t.nodes.map((n) => n.id)), eIds = new Set(t.edges.map((e) => e.id));
      this.sel.nodes = new Set([...this.sel.nodes].filter((id) => nIds.has(id)));
      this.sel.edges = new Set([...this.sel.edges].filter((id) => eIds.has(id)));
      this.emit('selection');
    },
    selectedNodes() { const t = this.tab; return t.nodes.filter((n) => this.sel.nodes.has(n.id)); },
    selectedEdges() { const t = this.tab; return t.edges.filter((e) => this.sel.edges.has(e.id)); },

    /* İçerik ekle (şablon / yapıştırma). Yeni id'ler üretir. */
    insertFragment(frag, tab) {
      tab = tab || this.tab;
      const map = new Map();
      const nodes = frag.nodes.map((n) => {
        const c = JSON.parse(JSON.stringify(n));
        c.id = uid('n');
        map.set(n.id, c.id);
        return c;
      });
      const edges = (frag.edges || []).filter((e) => map.has(e.from) && map.has(e.to)).map((e) => {
        const c = JSON.parse(JSON.stringify(e));
        c.id = uid('e'); c.from = map.get(e.from); c.to = map.get(e.to);
        if (c.mid && frag.offset) { c.mid = { x: c.mid.x + frag.offset.x, y: c.mid.y + frag.offset.y }; }
        if (Array.isArray(c.points) && frag.offset) c.points = c.points.map((q) => ({ x: q.x + frag.offset.x, y: q.y + frag.offset.y }));
        return c;
      });
      // çerçeveler en alta
      const frames = nodes.filter((n) => n.type === 'frame');
      const rest = nodes.filter((n) => n.type !== 'frame');
      tab.nodes.unshift(...frames);
      tab.nodes.push(...rest);
      tab.edges.push(...edges);
      return { nodes, edges };
    },

    deleteSelection() {
      const t = this.tab;
      if (!this.sel.nodes.size && !this.sel.edges.size) return;
      this.mutate(() => {
        t.nodes = t.nodes.filter((n) => !this.sel.nodes.has(n.id));
        t.edges = t.edges.filter((e) => !this.sel.edges.has(e.id) && !this.sel.nodes.has(e.from) && !this.sel.nodes.has(e.to));
      });
      this.select([], []);
    },
  };

  App.Store = Store;
})(typeof window !== 'undefined' ? window : globalThis);
