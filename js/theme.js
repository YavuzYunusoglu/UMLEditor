'use strict';
/* Diyagram renk temaları. Arayüz renkleri css/style.css içinde. */
(function (global) {
  const App = (global.App = global.App || {});

  const themes = {
    dark: {
      name: 'dark', dark: true,
      canvas: '#1b1d23', node: '#252832', nodeStroke: '#4b5263', header: '#2e3341',
      text: '#e7e9ef', textDim: '#9aa2b3', edge: '#8a93a8', labelBg: '#1b1d23',
      accent: '#5b8cff', frameStroke: '#4b5263',
      vis: { '+': '#3ecf8e', '-': '#ff6b6b', '#': '#f5a623', '~': '#5bc0eb' },
    },
    light: {
      name: 'light', dark: false,
      canvas: '#f5f6f8', node: '#ffffff', nodeStroke: '#9aa3b5', header: '#edf0f5',
      text: '#1e2330', textDim: '#5d6578', edge: '#5f6880', labelBg: '#f5f6f8',
      accent: '#3b6cf6', frameStroke: '#a8b0c0',
      vis: { '+': '#14975c', '-': '#d64545', '#': '#c27c0e', '~': '#2a86b5' },
    },
  };

  /* Bir vurgu rengini temaya göre dolgu/çizgi/başlık renklerine çevir */
  function tint(T, color) {
    const U = App.U;
    if (!color) return { fill: T.node, stroke: T.nodeStroke, header: T.header };
    if (T.dark) {
      return { fill: U.mix(T.node, color, 0.16), stroke: U.mix(T.node, color, 0.8), header: U.mix(T.node, color, 0.36) };
    }
    return { fill: U.mix('#ffffff', color, 0.12), stroke: U.mix(color, '#000000', 0.12), header: U.mix('#ffffff', color, 0.3) };
  }

  let current = 'dark';
  try {
    const saved = global.localStorage && localStorage.getItem('umlstudio.theme');
    if (saved && themes[saved]) current = saved;
  } catch (e) { /* depolama yok */ }

  App.Theme = {
    themes, tint,
    get name() { return current; },
    current() { return themes[current]; },
    set(name) {
      if (!themes[name]) return;
      current = name;
      if (typeof document !== 'undefined') document.documentElement.dataset.theme = name;
      try { localStorage.setItem('umlstudio.theme', name); } catch (e) { /* yok say */ }
    },
    toggle() { this.set(current === 'dark' ? 'light' : 'dark'); },
  };
})(typeof window !== 'undefined' ? window : globalThis);
