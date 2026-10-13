// BlovMed service worker: instant start, offline, push alerts and tap-to-open.
// Bump V whenever you change any app file.
const V = 'blovmed-v14';
const FILES = ['./', 'index.html', 'admin.html', 'app.css', 'core.js', 'ui.js', 'cars.js', 'game.js', 'app.js', 'admin.js', 'config.js', 'manifest.json', 'manifest-admin.json', 'icon-180.png', 'icon-192.png', 'icon-512.png', 'icon-maskable-512.png', 'admin-180.png', 'admin-192.png', 'admin-512.png', 'badge-96.png'];
self.addEventListener('install', e => {
  e.waitUntil(caches.open(V).then(c => c.addAll(FILES.map(f => new Request(f, { cache: 'reload' })))).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== V).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
// Instant start: answer from the saved copy right away and refresh it in the background.
// New versions arrive as a new service worker (V changes), which reloads the page once.
self.addEventListener('fetch', e => {
  const r = e.request;
  if (r.method !== 'GET' || new URL(r.url).origin !== location.origin) return;
  e.respondWith((async () => {
    const cache = await caches.open(V);
    const nav = r.mode === 'navigate', key = nav ? (new URL(r.url).pathname.endsWith('admin.html') ? 'admin.html' : 'index.html') : r;
    const hit = await cache.match(key, { ignoreSearch: true });
    const net = fetch(r).then(res => { if (res && res.ok && !nav) cache.put(r, res.clone()); return res; }).catch(() => null);
    if (hit) { e.waitUntil(net); return hit; }
    return (await net) || Response.error();
  })());
});
self.addEventListener('push', e => {
  let d = {}; try { d = e.data ? e.data.json() : {}; } catch (_) {}
  const admin = String(d.url || '').includes('admin.html');
  e.waitUntil(Promise.all([
    // open screens refresh right away
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(cs => cs.forEach(c => c.postMessage({ type: 'sync' }))),
    // the app's own icon, plus a white pill silhouette for the Android status bar
    self.registration.showNotification(d.title || 'BlovMed', { body: d.body || 'Time for your meds', tag: d.tag, renotify: true, icon: admin ? 'admin-192.png' : 'icon-192.png', badge: 'badge-96.png', timestamp: Date.now(), data: { url: d.url || './' }, vibrate: [200, 100, 200] }),
  ]));
});
// Tapping an alert opens the screen it is about (a dose, a sick log, the buy list...).
self.addEventListener('notificationclick', e => {
  e.notification.close();
  const url = new URL((e.notification.data && e.notification.data.url) || './', self.registration.scope.replace(/admin$/, '')).href, admin = url.includes('admin.html');
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(async list => {
    const hit = list.find(c => c.url.includes('admin.html') === admin);
    if (hit) { await hit.focus(); hit.postMessage({ type: 'open', url }); return; }
    return self.clients.openWindow(url);
  }));
});
