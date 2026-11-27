// Keeps the app working without internet. Bump the version to push an update.
const CACHE = 'apron-till-v30';
const FILES = ['./', 'index.html', 'app.js', 'firebase-config.js', 'xlsx.full.min.js', 'manifest.webmanifest', 'icon-192.png', 'icon-512.png', 'monty-qr.png'];
// 'reload' skips the browser's own 10-minute copy, so a new version is never built from old files.
self.addEventListener('install', e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES.map(f => new Request(f, {cache: 'reload'})))).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
// Only the app's own files, the fonts and the sync library are cached. Database and sign-in traffic is left alone.
const CACHEABLE = url => url.origin === self.location.origin || url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com' || (url.hostname === 'www.gstatic.com' && url.pathname.startsWith('/firebasejs/'));
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || !CACHEABLE(url)) return;
  e.respondWith(caches.open(CACHE).then(async cache => {
    const own = url.origin === self.location.origin;
    const saved = async () => (await cache.match(e.request)) || (await cache.match(e.request, {ignoreSearch: true}));
    // The app's own files: always ask the server for the newest copy ('no-cache' revalidates instead of
    // trusting the browser's 10-minute copy), and use the saved copy only when offline.
    if (own) {
      try {
        const res = await fetch(e.request, {cache: 'no-cache'});
        if (res && res.ok) cache.put(e.request, res.clone());
        return res;
      } catch (err) { return (await saved()) || Response.error(); }
    }
    // Fonts and the sync library never change at a given address: saved copy first.
    const hit = await saved();
    if (hit) return hit;
    const res = await fetch(e.request);
    if (res && (res.ok || res.type === 'opaque')) cache.put(e.request, res.clone());
    return res;
  }));
});
