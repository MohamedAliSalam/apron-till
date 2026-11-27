// Keeps the app working without internet. Bump the version to push an update.
const CACHE = 'apron-till-v11';
const FILES = ['./', 'index.html', 'app.js', 'firebase-config.js', 'xlsx.full.min.js', 'manifest.webmanifest', 'icon-192.png', 'icon-512.png', 'monty-qr.png'];
self.addEventListener('install', e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES)).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
// Only the app's own files, the fonts and the sync library are cached. Database and sign-in traffic is left alone.
const CACHEABLE = url => url.origin === self.location.origin || url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com' || (url.hostname === 'www.gstatic.com' && url.pathname.startsWith('/firebasejs/'));
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET' || !CACHEABLE(new URL(e.request.url))) return;
  e.respondWith(caches.open(CACHE).then(async cache => {
    const hit = await cache.match(e.request, {ignoreSearch: true});
    const fresh = fetch(e.request).then(res => { if (res && (res.ok || res.type === 'opaque')) cache.put(e.request, res.clone()); return res; }).catch(() => hit);
    return hit || fresh;
  }));
});
