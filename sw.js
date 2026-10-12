// BlovMed service worker: offline cache + push. Bump V whenever you change any app file.
const V='blovmed-v3',FILES=['./','index.html','config.js','manifest.json','icon-180.png','icon-192.png','icon-512.png'];
self.addEventListener('install',e=>{e.waitUntil(caches.open(V).then(c=>c.addAll(FILES)).then(()=>self.skipWaiting()))});
self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(ks=>Promise.all(ks.filter(k=>k!==V).map(k=>caches.delete(k)))).then(()=>clients.claim()))});
self.addEventListener('fetch',e=>{
  const r=e.request;
  if(r.method!=='GET'||new URL(r.url).origin!==location.origin)return;
  e.respondWith(caches.match(r,{ignoreSearch:true}).then(hit=>{
    const net=fetch(r).then(res=>{if(res.ok){const cp=res.clone();caches.open(V).then(c=>c.put(r,cp))}return res}).catch(()=>hit||caches.match('index.html'));
    return hit||net;
  }));
});
self.addEventListener('push',e=>{
  let d={};try{d=e.data?e.data.json():{}}catch(_){}
  e.waitUntil(self.registration.showNotification(d.title||'BlovMed',{body:d.body||'Time for your meds',tag:d.tag,renotify:true}));
});
self.addEventListener('notificationclick',e=>{
  e.notification.close();
  e.waitUntil(clients.matchAll({type:'window',includeUncontrolled:true}).then(l=>l.length?l[0].focus():clients.openWindow('./')));
});
