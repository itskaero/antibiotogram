// Offline support: app shell is cached on install; data files are network-first so weekly updates show up,
// falling back to the last cached copy when offline.
const VERSION = 'abg-2026.10-1';
const SHELL = ['./', 'index.html', 'assets/app.css', 'assets/app.js', 'assets/icon.svg', 'manifest.webmanifest'];
const DATA = ['drugs', 'organisms', 'sources', 'sites', 'dosing', 'teaching-notes', 'combinations', 'alerts', 'curated', 'advances', 'example-antibiogram'].map((f) => `data/${f}.json`);

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll([...SHELL, ...DATA])).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET') return;
  if (url.origin === location.origin && url.pathname.includes('/data/')) {
    e.respondWith(fetch(e.request).then((res) => { const copy = res.clone(); caches.open(VERSION).then((c) => c.put(e.request, copy)); return res; }).catch(() => caches.match(e.request)));
    return;
  }
  if (url.origin === location.origin || url.hostname.endsWith('gstatic.com') || url.hostname.endsWith('googleapis.com')) {
    e.respondWith(caches.match(e.request).then((hit) => hit || fetch(e.request).then((res) => {
      if (res.ok || res.type === 'opaque') { const copy = res.clone(); caches.open(VERSION).then((c) => c.put(e.request, copy)); }
      return res;
    })));
  }
});
