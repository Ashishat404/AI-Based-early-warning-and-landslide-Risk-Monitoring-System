const CACHE_NAME = 'pravaha-cache-v1';
const STATIC_ASSETS = [
  '/',
  '/Index.html',
  '/index.html',
  '/styles.css',
  '/script.js',
  '/Script.js',
  '/app-config.js'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(STATIC_ASSETS)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', event => {
  const req = event.request;
  const url = new URL(req.url);

  // Network-first for API calls
  if (url.pathname.startsWith('/api') || url.hostname.includes('open-meteo') || url.hostname.includes('thingspeak') || url.hostname.includes('gibs.earthdata.nasa.gov')) {
    event.respondWith(
      fetch(req).then(r => {
        const copy = r.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(req, copy));
        return r;
      }).catch(() => caches.match(req))
    );
    return;
  }

  // Cache-first for static
  event.respondWith(caches.match(req).then(match => match || fetch(req).then(r => {
    const copy = r.clone();
    caches.open(CACHE_NAME).then(cache => cache.put(req, copy));
    return r;
  })).catch(() => caches.match('/index.html')));
});

// Basic message handler to receive queued reports from the page
self.addEventListener('message', event => {
  const msg = event.data;
  if (!msg) return;
  if (msg.type === 'FLUSH_QUEUE' && msg.reports) {
    msg.reports.forEach(async item => {
      try {
        await fetch(item.url, { method: item.method || 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(item.body) });
      } catch (e) {
        console.warn('SW flush report failed', e);
      }
    });
  }
});
