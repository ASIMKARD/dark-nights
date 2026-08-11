// Offline service worker.
// EDIT ON EVERY DEPLOY: bump CACHE, or the browser keeps serving the old shell.
const CACHE = 'dark-nights-v11';

const ASSETS = ['./', './index.html', './styles.css', './data.js', './qrcode.js', './manifest.json'];
const FONTS = [];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(c => c.addAll(ASSETS.concat(FONTS)))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  const url = new URL(e.request.url);
  const shell = ASSETS.some(p => url.pathname.endsWith(p === './' ? '/' : p.slice(1)));
  if (shell) {
    // network-first: a deploy reaches the device on the next plain reload
    e.respondWith(
      fetch(e.request).then(res => {
        if (res && res.status === 200) {
          const copy = res.clone();
          caches.open(CACHE).then(c => c.put(e.request, copy));
        }
        return res;
      }).catch(() => caches.match(e.request))
    );
    return;
  }
  // fonts and icons stay cache-first
  e.respondWith(
    caches.match(e.request).then(hit => hit || fetch(e.request).then(res => {
      if (res && res.status === 200 && res.type === 'basic') {
        const copy = res.clone();
        caches.open(CACHE).then(c => c.put(e.request, copy));
      }
      return res;
    }))
  );
});
