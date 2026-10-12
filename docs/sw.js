// BlovMed service worker: offline cache, push, and quick updates.
// Bump V whenever you change any app file.
const V = 'blovmed-v7';
const FILES = ['./', 'index.html', 'admin.html', 'app.css', 'core.js', 'ui.js', 'cars.js', 'app.js', 'admin.js', 'config.js', 'manifest.json', 'icon-180.png', 'icon-192.png', 'icon-512.png'];
self.addEventListener('install', e => {
  e.waitUntil(caches.open(V).then(c => c.addAll(FILES.map(f => new Request(f, { cache: 'reload' })))).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== V).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
// Network first (always the newest version), saved copy when offline or very slow.
self.addEventListener('fetch', e => {
  const r = e.request;
  if (r.method !== 'GET' || new URL(r.url).origin !== location.origin) return;
  e.respondWith((async () => {
    const cache = await caches.open(V);
    try {
      const res = await Promise.race([fetch(r), new Promise((_, no) => setTimeout(() => no(new Error('slow')), 4000))]);
      if (res && res.ok) cache.put(r, res.clone());
      return res;
    } catch (err) {
      const hit = await cache.match(r, { ignoreSearch: true });
      if (hit) return hit;
      if (r.mode === 'navigate') return cache.match(new URL(r.url).pathname.endsWith('admin.html') ? 'admin.html' : 'index.html');
      return Response.error();
    }
  })());
});
self.addEventListener('push', e => {
  let d = {}; try { d = e.data ? e.data.json() : {}; } catch (_) {}
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(cs => cs.forEach(c => c.postMessage({ type: 'sync' })))); // open pages refresh right away
  e.waitUntil(self.registration.showNotification(d.title || 'BlovMed', { body: d.body || 'Time for your meds', tag: d.tag, renotify: true, icon: 'icon-192.png', badge: 'icon-192.png', data: { url: d.url || './' }, vibrate: [200, 100, 200] }));
});
self.addEventListener('notificationclick', e => {
  e.notification.close();
  const url = new URL((e.notification.data && e.notification.data.url) || './', self.registration.scope).href, admin = url.includes('admin.html');
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
    const hit = list.find(c => c.url.includes('admin.html') === admin);
    return hit ? hit.focus() : self.clients.openWindow(url);
  }));
});
