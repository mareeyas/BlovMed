import { buildPushPayload } from '@block65/webcrypto-web-push';
import { dueMessages } from './schedule.js'; // old app version, kept until every device updates
import { merge, newDoc, dueReminders } from './core.js';

const MAX_PROFILES = 10;     // stops strangers from filling your free storage
const MAX_BODY = 400000;     // bytes
const LOCK_TRIES = 5, LOCK_MIN = 15;
const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': 'content-type', 'access-control-allow-methods': 'POST,GET,OPTIONS' };
const J = (o, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { ...cors, 'content-type': 'application/json' } });
const te = s => new TextEncoder().encode(s);
const hex = buf => [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
const sha = async s => hex(await crypto.subtle.digest('SHA-256', te(s)));
const rnd = n => hex(crypto.getRandomValues(new Uint8Array(n)));
async function slow(secret, salt) { // PBKDF2: makes guessing PINs and passwords expensive
  const k = await crypto.subtle.importKey('raw', te(secret), 'PBKDF2', false, ['deriveBits']);
  return hex(await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: te(salt), iterations: 100000 }, k, 256));
}
const CODE_CH = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const newCode = () => [...crypto.getRandomValues(new Uint8Array(8))].map(b => CODE_CH[b % 32]).join('');
const PUSH_HOST = /(^|\.)(push\.apple\.com|googleapis\.com|push\.services\.mozilla\.com|notify\.windows\.com)$/;
const validSub = s => { try { const u = new URL(s.endpoint); return u.protocol === 'https:' && PUSH_HOST.test(u.hostname) && s.keys && s.keys.p256dh && s.keys.auth; } catch { return false; } };
const okUser = u => typeof u === 'string' && /^[a-z0-9._-]{3,24}$/.test(u);
const okPin = p => typeof p === 'string' && /^\d{6}$/.test(p);
const okPass = p => typeof p === 'string' && p.length >= 8 && p.length <= 100;
const clean = u => String(u || '').trim().toLowerCase();

export default {
  async fetch(req, env, ctx) {
    if (req.method === 'OPTIONS') return new Response(null, { headers: cors });
    const path = new URL(req.url).pathname;
    if (req.method !== 'POST') return new Response('BlovMed push worker is running', { headers: cors });
    const txt = await req.text();
    if (txt.length > MAX_BODY) return J({ error: 'too big' }, 413);
    let b; try { b = JSON.parse(txt); } catch { return J({ error: 'bad json' }, 400); }
    const routes = { '/p/sync': pSync, '/auth/login': login, '/auth/admin-login': adminLogin, '/auth/admin-signup': adminSignup, '/auth/admin-set': adminSet,
      '/auth/set-login': setLogin, '/auth/pin': changePin, '/auth/admin-pass': changePass, '/auth/logout': logout, '/auth/logout-all': logoutAll,
      '/p/code': pCode, '/p/claim': pClaim, '/sync': legacySync };
    try { if (routes[path]) return await routes[path](env, b, ctx); }
    catch (e) { console.log('error', e.message); return J({ error: 'server' }, 500); }
    return J({ error: 'not found' }, 404);
  },
  async scheduled(_e, env, ctx) { ctx.waitUntil(run(env)); },
};

/* ---------- profiles and sessions ---------- */
const getProf = async (env, pid) => { const p = await env.KV.get('p:' + pid, 'json'); if (p) upgrade(p); return p; };
const putProf = (env, p) => env.KV.put('p:' + p.pid, JSON.stringify(p));
function upgrade(p) { // older profiles kept one push subscription per role
  p.devs = p.devs || {};
  if (p.subs) { for (const r of ['phone', 'admin']) if (p.subs[r]) p.devs['old-' + r] = { role: r, sub: p.subs[r], seen: (p.seen || {})[r] || 0 }; delete p.subs; }
  p.ph = p.ph || []; p.ah = p.ah || []; p.dead = p.dead || []; p.admins = p.admins || [];
}
async function auth(env, b) {
  if (!b.pid || !b.key || !/^(phone|admin)$/.test(b.role)) return null;
  const prof = await getProf(env, b.pid); if (!prof) return null;
  const h = await sha(b.key);
  return (b.role === 'admin' ? prof.ah : prof.ph).includes(h) ? { prof, hid: h.slice(0, 16), h } : null;
}
async function newSession(prof, role) {
  const key = rnd(24), h = await sha(key);
  if (role === 'admin') prof.ah = [...prof.ah, h].slice(-10); else prof.ph = [...prof.ph, h].slice(-20);
  prof.devs[h.slice(0, 16)] = { role, seen: Date.now() };
  return key;
}
function meta(p) {
  const seen = { phone: 0, admin: 0 }, subs = { phone: false, admin: false }, devices = [];
  for (const [id, d] of Object.entries(p.devs || {})) {
    seen[d.role] = Math.max(seen[d.role], d.seen || 0); if (d.sub) subs[d.role] = true;
    devices.push({ id, role: d.role, seen: d.seen || 0, push: !!d.sub, name: d.name || '' });
  }
  return { phone: (p.ph || []).length > 0, seen, subs, devices, admins: (p.admins || []).length || (p.ah || []).length, adminNames: p.admins || [], user: p.user || '', tz: p.tz };
}
const reply = (prof, extra = {}) => J({ ...extra, doc: prof.doc, meta: meta(prof) });
async function tooMany(env, ns, user) { const f = await env.KV.get(`f:${ns}:${user}`, 'json'); return f && f.until > Date.now() ? Math.ceil((f.until - Date.now()) / 6e4) : 0; }
async function failed(env, ns, user) {
  const k = `f:${ns}:${user}`, f = (await env.KV.get(k, 'json')) || { n: 0 };
  f.n++; if (f.n >= LOCK_TRIES) { f.until = Date.now() + LOCK_MIN * 6e4; f.n = 0; }
  await env.KV.put(k, JSON.stringify(f), { expirationTtl: 3600 });
}
async function newProfile(env) {
  const idx = (await env.KV.get('idx', 'json')) || [];
  if (idx.length >= MAX_PROFILES) return null;
  const prof = { pid: rnd(16), ph: [], ah: [], devs: {}, dead: [], admins: [], tz: 'Asia/Manila', doc: newDoc(), created: Date.now() };
  idx.push(prof.pid); await env.KV.put('idx', JSON.stringify(idx));
  return prof;
}

/* ---------- sign-in ---------- */
async function login(env, b) { // his username + 6-digit PIN
  const user = clean(b.user); if (!okUser(user) || !okPin(b.pin)) return J({ error: 'wrong' }, 401);
  const wait = await tooMany(env, 'u', user); if (wait) return J({ error: 'locked', minutes: wait }, 429);
  const rec = await env.KV.get('u:' + user, 'json');
  if (!rec || await slow(b.pin, rec.salt) !== rec.hash) { await failed(env, 'u', user); return J({ error: 'wrong' }, 401); }
  const prof = await getProf(env, rec.pid); if (!prof) return J({ error: 'wrong' }, 401);
  const key = await newSession(prof, 'phone'); await putProf(env, prof);
  return reply(prof, { pid: prof.pid, key, role: 'phone' });
}
async function adminLogin(env, b) {
  const user = clean(b.user); if (!okUser(user) || typeof b.pass !== 'string') return J({ error: 'wrong' }, 401);
  const wait = await tooMany(env, 'a', user); if (wait) return J({ error: 'locked', minutes: wait }, 429);
  const rec = await env.KV.get('a:' + user, 'json');
  if (!rec || await slow(b.pass, rec.salt) !== rec.hash) { await failed(env, 'a', user); return J({ error: 'wrong' }, 401); }
  const prof = await getProf(env, rec.pid); if (!prof) return J({ error: 'wrong' }, 401);
  const key = await newSession(prof, 'admin'); await putProf(env, prof);
  return reply(prof, { pid: prof.pid, key, role: 'admin' });
}
async function saveAdmin(env, prof, user, pass) {
  const salt = rnd(16); await env.KV.put('a:' + user, JSON.stringify({ pid: prof.pid, salt, hash: await slow(pass, salt) }));
  if (!prof.admins.includes(user)) prof.admins.push(user);
}
async function adminSignup(env, b) { // creates the back office account and his (empty) profile
  const user = clean(b.user); if (!okUser(user)) return J({ error: 'username' }, 400); if (!okPass(b.pass)) return J({ error: 'password' }, 400);
  if (await env.KV.get('a:' + user)) return J({ error: 'taken' }, 409);
  const prof = await newProfile(env); if (!prof) return J({ error: 'full' }, 403);
  await saveAdmin(env, prof, user, b.pass);
  const key = await newSession(prof, 'admin'); await putProf(env, prof);
  return reply(prof, { pid: prof.pid, key, role: 'admin' });
}
async function adminSet(env, b) { // add a username + password to a back office that was linked with a code
  const a = await auth(env, { ...b, role: 'admin' }); if (!a) return J({ error: 'auth' }, 401);
  const user = clean(b.user); if (!okUser(user)) return J({ error: 'username' }, 400); if (!okPass(b.pass)) return J({ error: 'password' }, 400);
  const ex = await env.KV.get('a:' + user, 'json'); if (ex && ex.pid !== a.prof.pid) return J({ error: 'taken' }, 409);
  await saveAdmin(env, a.prof, user, b.pass); await putProf(env, a.prof);
  return reply(a.prof);
}
async function setLogin(env, b) { // the back office issues or changes his username and PIN
  const a = await auth(env, { ...b, role: 'admin' }); if (!a) return J({ error: 'auth' }, 401);
  const prof = a.prof, user = clean(b.user); if (!okUser(user)) return J({ error: 'username' }, 400);
  if (b.pin !== undefined && !okPin(b.pin)) return J({ error: 'pin' }, 400);
  const ex = await env.KV.get('u:' + user, 'json'); if (ex && ex.pid !== prof.pid) return J({ error: 'taken' }, 409);
  let rec = ex || (prof.user ? await env.KV.get('u:' + prof.user, 'json') : null);
  if (!rec && !b.pin) return J({ error: 'pin' }, 400);
  if (b.pin) { const salt = rnd(16); rec = { pid: prof.pid, salt, hash: await slow(b.pin, salt) }; }
  if (prof.user && prof.user !== user) await env.KV.delete('u:' + prof.user);
  await env.KV.put('u:' + user, JSON.stringify(rec)); await env.KV.delete('f:u:' + user);
  prof.user = user; await putProf(env, prof);
  return reply(prof);
}
async function changePin(env, b) { // he can change his own PIN
  const a = await auth(env, { ...b, role: 'phone' }); if (!a || !a.prof.user) return J({ error: 'auth' }, 401);
  if (!okPin(b.pin)) return J({ error: 'pin' }, 400);
  const rec = await env.KV.get('u:' + a.prof.user, 'json');
  if (!rec || await slow(String(b.old || ''), rec.salt) !== rec.hash) return J({ error: 'wrong' }, 403);
  const salt = rnd(16); await env.KV.put('u:' + a.prof.user, JSON.stringify({ pid: a.prof.pid, salt, hash: await slow(b.pin, salt) }));
  return J({ ok: true });
}
async function changePass(env, b) {
  const a = await auth(env, { ...b, role: 'admin' }); if (!a) return J({ error: 'auth' }, 401);
  const user = clean(b.user), rec = await env.KV.get('a:' + user, 'json');
  if (!rec || rec.pid !== a.prof.pid || await slow(String(b.old || ''), rec.salt) !== rec.hash) return J({ error: 'wrong' }, 403);
  if (!okPass(b.pass)) return J({ error: 'password' }, 400);
  await saveAdmin(env, a.prof, user, b.pass); await putProf(env, a.prof);
  return J({ ok: true });
}
async function logout(env, b) { // signs out only this device
  const a = await auth(env, b); if (!a) return J({ ok: true });
  const p = a.prof; if (b.role === 'admin') p.ah = p.ah.filter(x => x !== a.h); else p.ph = p.ph.filter(x => x !== a.h);
  delete p.devs[a.hid]; await putProf(env, p); return J({ ok: true });
}
async function logoutAll(env, b) { // back office: sign him out everywhere (lost phone)
  const a = await auth(env, { ...b, role: 'admin' }); if (!a) return J({ error: 'auth' }, 401);
  const p = a.prof; p.ph = []; for (const [id, d] of Object.entries(p.devs)) if (d.role === 'phone') delete p.devs[id];
  await putProf(env, p); return reply(p);
}

/* ---------- data sync ---------- */
async function pSync(env, b, ctx) {
  const a = await auth(env, b); if (!a) return J({ error: 'auth' }, 401);
  const prof = a.prof, before = JSON.stringify(prof), out = {};
  prof.doc = merge(prof.doc, b.doc);
  if (b.role === 'phone' && typeof b.tz === 'string' && b.tz.length < 60) prof.tz = b.tz;
  const dev = prof.devs[a.hid] || (prof.devs[a.hid] = { role: b.role, seen: 0 });
  if (typeof b.name === 'string') dev.name = b.name.slice(0, 40);
  if ('sub' in b) {
    if (b.sub === null) delete dev.sub;
    else if (validSub(b.sub)) {
      const h = await sha(b.sub.endpoint);
      if (prof.dead.includes(h)) { delete dev.sub; out.resub = true; }
      else {
        for (const [id, d] of Object.entries(prof.devs)) if (id !== a.hid && d.sub && d.sub.endpoint === b.sub.endpoint) delete d.sub; // same browser, new session
        dev.sub = b.sub; if (b.role === 'phone') await dropLegacy(env, h);
      }
    }
  }
  const now = Date.now(), changed = JSON.stringify(prof) !== before;
  if (changed || now - (dev.seen || 0) > 10 * 6e4) { dev.seen = now; await putProf(env, prof); }
  if (changed && ctx) ctx.waitUntil(pushNow(env, prof)); // instant alerts (sick logs, notes, doses taken...)
  return reply(prof, out);
}

/* ---------- old link codes (still accepted) ---------- */
async function pCode(env, b) {
  const a = await auth(env, b); if (!a) return J({ error: 'auth' }, 401);
  const code = newCode(), gift = b.role === 'admin' && b.gift === true;
  await env.KV.put('c:' + code, JSON.stringify({ pid: a.prof.pid, role: b.role === 'phone' ? 'admin' : 'phone' }), { expirationTtl: gift ? 7 * 86400 : 900 });
  return J({ code: code.slice(0, 4) + '-' + code.slice(4), days: gift ? 7 : 0 });
}
async function pClaim(env, b) {
  const code = String(b.code || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (code.length !== 8) return J({ error: 'code' }, 404);
  const c = await env.KV.get('c:' + code, 'json'); if (!c) return J({ error: 'code' }, 404);
  await env.KV.delete('c:' + code);
  const prof = await getProf(env, c.pid); if (!prof) return J({ error: 'code' }, 404);
  const key = await newSession(prof, c.role); await putProf(env, prof);
  return reply(prof, { pid: prof.pid, key, role: c.role });
}

/* ---------- sending ---------- */
async function send(env, sub, m) {
  try {
    const payload = await buildPushPayload(
      { data: JSON.stringify({ title: m.title, body: m.body, tag: m.tag, url: m.url }), options: { ttl: 900, urgency: 'high' } },
      sub, { subject: env.VAPID_SUBJECT || 'mailto:admin@example.com', publicKey: env.VAPID_PUBLIC, privateKey: env.VAPID_PRIVATE });
    const r = await fetch(sub.endpoint, payload);
    if (r.status === 404 || r.status === 410) return 'dead';
    return r.ok ? 'ok' : 'retry';
  } catch (e) { console.log('push failed', e.message); return 'retry'; }
}
async function pushNow(env, prof) {
  const now = Date.now(), sent = (await env.KV.get('s:' + prof.pid, 'json')) || {};
  const devs = Object.entries(prof.devs).filter(([, d]) => d.sub);
  const view = { ...prof, subs: { phone: devs.some(([, d]) => d.role === 'phone'), admin: devs.some(([, d]) => d.role === 'admin') } };
  let changed = false;
  for (const m of dueReminders(view, sent, now, 'sync')) {
    let ok = false;
    for (const [, d] of devs) if (d.role === m.to && (await send(env, d.sub, m)) === 'ok') ok = true;
    if (ok) { sent[m.sk] = now; changed = true; }
  }
  if (changed) await env.KV.put('s:' + prof.pid, JSON.stringify(sent));
}
async function run(env) {
  const now = Date.now(), idx = (await env.KV.get('idx', 'json')) || [];
  for (const pid of idx) {
    const prof = await getProf(env, pid); if (!prof) continue;
    const sent = (await env.KV.get('s:' + pid, 'json')) || {};
    const devs = Object.entries(prof.devs).filter(([, d]) => d.sub);
    const view = { ...prof, subs: { phone: devs.some(([, d]) => d.role === 'phone'), admin: devs.some(([, d]) => d.role === 'admin') } };
    let changed = false; const dead = [];
    for (const m of dueReminders(view, sent, now)) {
      let ok = false;
      for (const [id, d] of devs) {
        if (d.role !== m.to || dead.includes(id)) continue;
        const r = await send(env, d.sub, m);
        if (r === 'dead') dead.push(id); else if (r === 'ok') ok = true;
      }
      if (ok) { sent[m.sk] = now; changed = true; }
    }
    for (const k in sent) if (now - sent[k] > 3 * 864e5) { delete sent[k]; changed = true; }
    if (changed) await env.KV.put('s:' + pid, JSON.stringify(sent));
    if (dead.length) {
      const fresh = await getProf(env, pid);
      for (const id of dead) { const d = fresh.devs[id], old = prof.devs[id]; if (d && d.sub && old && d.sub.endpoint === old.sub.endpoint) { fresh.dead = [...fresh.dead, await sha(d.sub.endpoint)].slice(-10); delete d.sub; } }
      await putProf(env, fresh);
    }
  }
  await legacyRun(env, now);
}

/* ---------- very old app version ---------- */
async function legacySync(env, b) {
  if (!b?.sub?.endpoint || !Array.isArray(b.meds) || !validSub(b.sub)) return J({ error: 'bad' }, 400);
  const db = (await env.KV.get('db', 'json')) || { users: {} }, id = await sha(b.sub.endpoint);
  if (!db.users[id] && Object.keys(db.users).length >= 10) return J({ error: 'full' }, 403);
  db.users[id] = { sub: b.sub, tz: b.tz || 'Asia/Manila', nags: b.nags !== false, meds: b.meds.slice(0, 30), taken: (b.taken || []).slice(-400), sent: db.users[id]?.sent || {} };
  await env.KV.put('db', JSON.stringify(db));
  return new Response('ok', { headers: cors });
}
async function dropLegacy(env, id) {
  const db = await env.KV.get('db', 'json');
  if (db && db.users && db.users[id]) { delete db.users[id]; await env.KV.put('db', JSON.stringify(db)); }
}
async function legacyRun(env, now) {
  const db = await env.KV.get('db', 'json');
  if (!db || !db.users || !Object.keys(db.users).length) return;
  let ch = false;
  for (const [id, rec] of Object.entries(db.users)) for (const m of dueMessages(rec, now)) {
    const r = await send(env, rec.sub, { ...m, url: './' });
    if (r === 'dead') { delete db.users[id]; ch = true; break; }
    if (r === 'ok') { rec.sent[m.sk] = 1; ch = true; }
  }
  if (ch) await env.KV.put('db', JSON.stringify(db));
}
