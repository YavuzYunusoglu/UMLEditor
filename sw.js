/* UML Studio service worker: önce ağ, ağ yoksa önbellek.
   Böylece yeni sürüm yayınlandığında hemen gelir, internet yokken de uygulama açılır. */
const CACHE = 'umlstudio-v6';
const SHELL = [
  './', 'index.html', 'privacy.html', 'terms.html', 'manifest.webmanifest', 'css/style.css',
  'js/config.js', 'js/i18n.js', 'js/util.js', 'js/markdown.js', 'js/theme.js', 'js/uml.js', 'js/model.js', 'js/geometry.js', 'js/dialogue.js', 'js/render.js', 'js/layout.js',
  'js/templates.js', 'js/csharp.js', 'js/mermaid.js', 'js/zip.js', 'js/ui.js', 'js/io.js', 'js/editor.js', 'js/panel.js', 'js/dialogue-ui.js', 'js/characters-ui.js', 'js/drive.js', 'js/app.js',
  'icons/icon-192.png', 'icons/icon-512.png', 'icons/apple-touch-icon.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  const url = new URL(req.url);
  // yalnızca kendi dosyalarımız (Google giriş / Drive API istekleri dokunulmadan geçer)
  if (req.method !== 'GET' || url.origin !== self.location.origin) return;
  e.respondWith(
    fetch(req).then((res) => {
      if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); }
      return res;
    }).catch(() => caches.match(req, { ignoreSearch: true }).then((r) => r || caches.match('index.html')))
  );
});
