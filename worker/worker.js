import { buildPushPayload } from '@block65/webcrypto-web-push';
import { dueMessages } from './schedule.js'; // very old app version, kept until every device updates
import { merge, newDoc, dueReminders } from './core.js';

// Each account lives in its own Durable Object ("Prof"): one consistent copy of the data,
// so changes from his phone and the back office never overwrite each other, and every open
// screen gets a live WebSocket message the moment something changes.

const MAX_PROFILES = 10;
const MAX_BODY = 400000;
const LOCK_TRIES = 5, LOCK_MIN = 15;
const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': 'content-type', 'access-control-allow-methods': 'POST,GET,OPTIONS' };
const J = (o, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { ...cors, 'content-type': 'application/json' } });
const te = s => new TextEncoder().encode(s);
const hex = buf => [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
const sha = async s => hex(await crypto.subtle.digest('SHA-256', te(s)));
const rnd = n => hex(crypto.getRandomValues(new Uint8Array(n)));
async function slow(secret, salt) {
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
const okPid = p => typeof p === 'string' && /^[0-9a-f]{32}$/.test(p);
const clean = u => String(u || '').trim().toLowerCase();

/* ======================= front door (stateless) ======================= */
const stub = (env, pid) => env.PROF.get(env.PROF.idFromName(pid));
async function op(env, pid, name, body) {
  const r = await stub(env, pid).fetch('https://prof/' + name, { method: 'POST', body: JSON.stringify({ ...body, pid }) });
  return new Response(r.body, { status: r.status, headers: { ...cors, 'content-type': 'application/json' } });
}
const DIRECT = ['p/sync', 'auth/admin-set', 'auth/set-login', 'auth/pin', 'auth/admin-pass', 'auth/logout', 'auth/logout-all', 'p/code'];

export default {
  async fetch(req, env) {
    if (req.method === 'OPTIONS') return new Response(null, { headers: cors });
    const url = new URL(req.url), path = url.pathname.replace(/^\//, '');
    if (path === 'ws') {
      const pid = url.searchParams.get('pid');
      if (req.headers.get('Upgrade') !== 'websocket' || !okPid(pid) || !env.PROF) return new Response('expected websocket', { status: 426 });
      return stub(env, pid).fetch(req);
    }
    if (req.method !== 'POST') return new Response(env.PROF ? 'BlovMed push worker is running (live)' : 'BlovMed push worker is running, but the PROF Durable Object is not set up in wrangler.toml', { headers: cors });
    if (!env.PROF && path !== 'sync') return J({ error: 'setup' }, 503);
    const txt = await req.text();
    if (txt.length > MAX_BODY) return J({ error: 'too big' }, 413);
    let b; try { b = JSON.parse(txt); } catch { return J({ error: 'bad json' }, 400); }
    try {
      if (path === 'auth/login') return await login(env, b, 'u', 'phone', b.pin, okPin);
      if (path === 'auth/admin-login') return await login(env, b, 'a', 'admin', b.pass, x => typeof x === 'string');
      if (path === 'auth/admin-signup') return await adminSignup(env, b);
      if (path === 'p/claim') return await claim(env, b);
      if (path === 'sync') return await legacySync(env, b);
      if (DIRECT.includes(path)) { if (!okPid(b.pid)) return J({ error: 'auth' }, 401); return await op(env, b.pid, path, b); }
    } catch (e) { console.log('error', e.message); return J({ error: 'server' }, 500); }
    return J({ error: 'not found' }, 404);
  },
  async scheduled(_e, env, ctx) { ctx.waitUntil(run(env)); },
};

async function tooMany(env, ns, user) { const f = await env.KV.get(`f:${ns}:${user}`, 'json'); return f && f.until > Date.now() ? Math.ceil((f.until - Date.now()) / 6e4) : 0; }
async function failed(env, ns, user) {
  const k = `f:${ns}:${user}`, f = (await env.KV.get(k, 'json')) || { n: 0 };
  f.n++; if (f.n >= LOCK_TRIES) { f.until = Date.now() + LOCK_MIN * 6e4; f.n = 0; }
  await env.KV.put(k, JSON.stringify(f), { expirationTtl: 3600 });
}
async function login(env, b, ns, role, secret, okSecret) {
  const user = clean(b.user); if (!okUser(user) || !okSecret(secret)) return J({ error: 'wrong' }, 401);
  const wait = await tooMany(env, ns, user); if (wait) return J({ error: 'locked', minutes: wait }, 429);
  const rec = await env.KV.get(ns + ':' + user, 'json');
  if (!rec || await slow(secret, rec.salt) !== rec.hash) { await failed(env, ns, user); return J({ error: 'wrong' }, 401); }
  return op(env, rec.pid, 'session', { role });
}
async function adminSignup(env, b) {
  const user = clean(b.user); if (!okUser(user)) return J({ error: 'username' }, 400); if (!okPass(b.pass)) return J({ error: 'password' }, 400);
  if (await env.KV.get('a:' + user)) return J({ error: 'taken' }, 409);
  const idx = (await env.KV.get('idx', 'json')) || [];
  if (idx.length >= MAX_PROFILES) return J({ error: 'full' }, 403);
  const pid = rnd(16); idx.push(pid); await env.KV.put('idx', JSON.stringify(idx));
  const salt = rnd(16); await env.KV.put('a:' + user, JSON.stringify({ pid, salt, hash: await slow(b.pass, salt) }));
  return op(env, pid, 'create', { admin: user });
}
async function claim(env, b) {
  const code = String(b.code || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (code.length !== 8) return J({ error: 'code' }, 404);
  const c = await env.KV.get('c:' + code, 'json'); if (!c) return J({ error: 'code' }, 404);
  await env.KV.delete('c:' + code);
  return op(env, c.pid, 'session', { role: c.role });
}
async function run(env) {
  if (env.PROF) for (const pid of (await env.KV.get('idx', 'json')) || []) { try { await stub(env, pid).fetch('https://prof/cron', { method: 'POST', body: JSON.stringify({ pid }) }); } catch (e) { console.log('cron', pid, e.message); } }
  await legacyRun(env, Date.now());
}

/* ======================= one account (Durable Object) ======================= */
const DOCKEYS = ['v', 'gen', 'meds', 'log', 'prn', 'buys', 'shop', 'sick', 'snz', 'act', 'cfg', 'prof'];
function upgrade(p) {
  p.devs = p.devs || {};
  if (p.subs) { for (const r of ['phone', 'admin']) if (p.subs[r]) p.devs['old-' + r] = { role: r, sub: p.subs[r], seen: (p.seen || {})[r] || 0 }; delete p.subs; }
  p.ph = p.ph || []; p.ah = p.ah || []; p.dead = p.dead || []; p.admins = p.admins || [];
  return p;
}
function meta(p) {
  const seen = { phone: 0, admin: 0 }, subs = { phone: false, admin: false }, devices = [];
  for (const [id, d] of Object.entries(p.devs || {})) {
    seen[d.role] = Math.max(seen[d.role], d.seen || 0); if (d.sub) subs[d.role] = true;
    devices.push({ id, role: d.role, seen: d.seen || 0, push: !!d.sub, name: d.name || '' });
  }
  return { phone: (p.ph || []).length > 0, seen, subs, devices, admins: (p.admins || []).length || (p.ah || []).length, adminNames: p.admins || [], user: p.user || '', tz: p.tz, live: true };
}

export class Prof {
  constructor(state, env) {
    this.state = state; this.env = env; this.p = null; this.sent = null;
    try { state.setWebSocketAutoResponse(new WebSocketRequestResponsePair('ping', 'pong')); } catch (e) {}
  }
  async load(pid) {
    if (this.p) return this.p;
    const st = this.state.storage, m = await st.get('meta');
    if (m) {
      const parts = await st.get(DOCKEYS.map(k => 'd:' + k)), doc = {};
      for (const k of DOCKEYS) { const v = parts.get('d:' + k); if (v !== undefined) doc[k] = v; }
      m.doc = merge(doc, null); this.p = upgrade(m);
      this.sent = (await st.get('sent')) || {};
    } else if (okPid(pid)) { // first time: move the account over from KV
      const old = await this.env.KV.get('p:' + pid, 'json');
      if (old) { this.p = upgrade(old); this.p.doc = merge(this.p.doc, null); this.sent = (await this.env.KV.get('s:' + pid, 'json')) || {}; await this.save(); await st.put('sent', this.sent); }
    }
    return this.p;
  }
  async save() {
    const { doc, ...m } = this.p, obj = { meta: m };
    for (const k of DOCKEYS) if (doc[k] !== undefined) obj['d:' + k] = doc[k];
    await this.state.storage.put(obj);
  }
  async auth(b, role) {
    role = role || b.role;
    if (!b.key || !/^(phone|admin)$/.test(role)) return null;
    const p = await this.load(b.pid); if (!p) return null;
    const h = await sha(b.key);
    return (role === 'admin' ? p.ah : p.ph).includes(h) ? { h, hid: h.slice(0, 16), role } : null;
  }
  async newSession(role) {
    const p = this.p, key = rnd(24), h = await sha(key);
    if (role === 'admin') p.ah = [...p.ah, h].slice(-10); else p.ph = [...p.ph, h].slice(-20);
    p.devs[h.slice(0, 16)] = { role, seen: Date.now() };
    return key;
  }
  reply(extra = {}) { return J({ ...extra, doc: this.p.doc, meta: meta(this.p) }); }
  broadcast() { for (const ws of this.state.getWebSockets()) { try { ws.send('changed'); } catch (e) {} } }

  async fetch(req) {
    const url = new URL(req.url);
    if (url.pathname === '/ws') return this.socket(url);
    const name = url.pathname.slice(1), b = await req.json();
    try { return await this.handle(name, b); } catch (e) { console.log('prof error', name, e.message); return J({ error: 'server' }, 500); }
  }
  async socket(url) {
    const b = { pid: url.searchParams.get('pid'), key: url.searchParams.get('key'), role: url.searchParams.get('role') };
    if (!(await this.auth(b))) return new Response('auth', { status: 401 });
    const pair = new WebSocketPair();
    this.state.acceptWebSocket(pair[1], [b.role]);
    return new Response(null, { status: 101, webSocket: pair[0] });
  }
  webSocketMessage(ws, msg) { if (msg === 'ping') ws.send('pong'); }
  webSocketClose(ws, code) { try { ws.close(code, 'bye'); } catch (e) {} }
  webSocketError() {}

  async handle(name, b) {
    const env = this.env, now = Date.now();
    if (name === 'create') {
      if (await this.load(b.pid)) return J({ error: 'exists' }, 409);
      this.p = { pid: b.pid, ph: [], ah: [], devs: {}, dead: [], admins: [b.admin], tz: 'Asia/Manila', doc: newDoc(), created: now }; this.sent = {};
      const key = await this.newSession('admin'); await this.save();
      return this.reply({ pid: b.pid, key, role: 'admin' });
    }
    if (name === 'session') {
      if (!(await this.load(b.pid))) return J({ error: 'wrong' }, 401);
      const key = await this.newSession(b.role); await this.save(); this.broadcast();
      return this.reply({ pid: this.p.pid, key, role: b.role });
    }
    if (name === 'cron') { if (await this.load(b.pid)) await this.push('cron'); return J({ ok: true }); }

    const forced = { 'auth/admin-set': 'admin', 'auth/set-login': 'admin', 'auth/admin-pass': 'admin', 'auth/logout-all': 'admin', 'auth/pin': 'phone' }[name];
    const a = await this.auth(b, forced); const p = this.p;
    if (!a) return J({ error: 'auth' }, name === 'auth/logout' ? 200 : 401);

    if (name === 'p/sync') {
      const before = JSON.stringify(p.doc) + JSON.stringify(p.devs);
      p.doc = merge(p.doc, b.doc);
      if (a.role === 'phone' && typeof b.tz === 'string' && b.tz.length < 60) p.tz = b.tz;
      const dev = p.devs[a.hid] || (p.devs[a.hid] = { role: a.role, seen: 0 }), out = {};
      if (typeof b.name === 'string') dev.name = b.name.slice(0, 40);
      if ('sub' in b) {
        if (b.sub === null) delete dev.sub;
        else if (validSub(b.sub)) {
          const h = await sha(b.sub.endpoint);
          if (p.dead.includes(h)) { delete dev.sub; out.resub = true; }
          else { for (const [id, d] of Object.entries(p.devs)) if (id !== a.hid && d.sub && d.sub.endpoint === b.sub.endpoint) delete d.sub; dev.sub = b.sub; }
        }
      }
      const changed = before !== JSON.stringify(p.doc) + JSON.stringify(p.devs);
      if (changed || now - (dev.seen || 0) > 10 * 6e4) { dev.seen = now; await this.save(); }
      if (changed) { this.broadcast(); this.state.waitUntil(this.push('sync')); }
      return this.reply(out);
    }
    if (name === 'p/code') {
      const code = newCode(), gift = a.role === 'admin' && b.gift === true;
      await env.KV.put('c:' + code, JSON.stringify({ pid: p.pid, role: a.role === 'phone' ? 'admin' : 'phone' }), { expirationTtl: gift ? 7 * 86400 : 900 });
      return J({ code: code.slice(0, 4) + '-' + code.slice(4), days: gift ? 7 : 0 });
    }
    if (name === 'auth/logout') {
      if (a.role === 'admin') p.ah = p.ah.filter(x => x !== a.h); else p.ph = p.ph.filter(x => x !== a.h);
      delete p.devs[a.hid]; await this.save(); this.broadcast(); return J({ ok: true });
    }
    if (name === 'auth/logout-all') {
      p.ph = []; for (const [id, d] of Object.entries(p.devs)) if (d.role === 'phone') delete p.devs[id];
      for (const ws of this.state.getWebSockets('phone')) try { ws.close(4001, 'signed out'); } catch (e) {}
      await this.save(); this.broadcast(); return this.reply();
    }
    if (name === 'auth/admin-set' || name === 'auth/admin-pass') {
      const user = clean(b.user);
      if (name === 'auth/admin-pass') { const rec = await env.KV.get('a:' + user, 'json'); if (!rec || rec.pid !== p.pid || await slow(String(b.old || ''), rec.salt) !== rec.hash) return J({ error: 'wrong' }, 403); }
      else { if (!okUser(user)) return J({ error: 'username' }, 400); const ex = await env.KV.get('a:' + user, 'json'); if (ex && ex.pid !== p.pid) return J({ error: 'taken' }, 409); }
      if (!okPass(b.pass)) return J({ error: 'password' }, 400);
      const salt = rnd(16); await env.KV.put('a:' + user, JSON.stringify({ pid: p.pid, salt, hash: await slow(b.pass, salt) }));
      if (!p.admins.includes(user)) p.admins.push(user);
      await this.save(); return name === 'auth/admin-pass' ? J({ ok: true }) : this.reply();
    }
    if (name === 'auth/set-login') {
      const user = clean(b.user); if (!okUser(user)) return J({ error: 'username' }, 400);
      if (b.pin !== undefined && !okPin(b.pin)) return J({ error: 'pin' }, 400);
      const ex = await env.KV.get('u:' + user, 'json'); if (ex && ex.pid !== p.pid) return J({ error: 'taken' }, 409);
      let rec = ex || (p.user ? await env.KV.get('u:' + p.user, 'json') : null);
      if (!rec && !b.pin) return J({ error: 'pin' }, 400);
      if (b.pin) { const salt = rnd(16); rec = { pid: p.pid, salt, hash: await slow(b.pin, salt) }; }
      if (p.user && p.user !== user) await env.KV.delete('u:' + p.user);
      await env.KV.put('u:' + user, JSON.stringify(rec)); await env.KV.delete('f:u:' + user);
      p.user = user; await this.save(); return this.reply();
    }
    if (name === 'auth/pin') {
      if (!okPin(b.pin) || !p.user) return J({ error: 'pin' }, 400);
      const rec = await env.KV.get('u:' + p.user, 'json');
      if (!rec || await slow(String(b.old || ''), rec.salt) !== rec.hash) return J({ error: 'wrong' }, 403);
      const salt = rnd(16); await env.KV.put('u:' + p.user, JSON.stringify({ pid: p.pid, salt, hash: await slow(b.pin, salt) }));
      return J({ ok: true });
    }
    return J({ error: 'not found' }, 404);
  }

  // Send what is due. 'sync' = instant event alerts; 'cron' = dose reminders, daily alerts, late events.
  async push(phase) {
    const p = this.p, now = Date.now(), devs = Object.entries(p.devs).filter(([, d]) => d.sub);
    if (!devs.length) return;
    const view = { ...p, subs: { phone: devs.some(([, d]) => d.role === 'phone'), admin: devs.some(([, d]) => d.role === 'admin') } };
    let sentCh = false, devCh = false;
    for (const m of dueReminders(view, this.sent, now, phase)) {
      this.sent[m.sk] = now; sentCh = true; // claim first, so two runs never send the same alert
      let ok = false;
      for (const [, d] of devs) {
        if (d.role !== m.to || !d.sub) continue;
        const r = await send(this.env, d.sub, m);
        if (r === 'ok') ok = true;
        else if (r === 'dead') { p.dead = [...p.dead, await sha(d.sub.endpoint)].slice(-10); delete d.sub; devCh = true; }
      }
      if (!ok) delete this.sent[m.sk]; // try again next minute
    }
    for (const k in this.sent) if (now - this.sent[k] > 3 * 864e5) { delete this.sent[k]; sentCh = true; }
    if (sentCh) await this.state.storage.put('sent', this.sent);
    if (devCh) await this.save();
  }
}

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

/* ======================= very old app version ======================= */
async function legacySync(env, b) {
  if (!b?.sub?.endpoint || !Array.isArray(b.meds) || !validSub(b.sub)) return J({ error: 'bad' }, 400);
  const db = (await env.KV.get('db', 'json')) || { users: {} }, id = await sha(b.sub.endpoint);
  if (!db.users[id] && Object.keys(db.users).length >= 10) return J({ error: 'full' }, 403);
  db.users[id] = { sub: b.sub, tz: b.tz || 'Asia/Manila', nags: b.nags !== false, meds: b.meds.slice(0, 30), taken: (b.taken || []).slice(-400), sent: db.users[id]?.sent || {} };
  await env.KV.put('db', JSON.stringify(db));
  return new Response('ok', { headers: cors });
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
