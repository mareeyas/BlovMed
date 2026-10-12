import { buildPushPayload } from '@block65/webcrypto-web-push';
import { dueMessages } from './schedule.js'; // old app version, kept until his phone updates
import { merge, newDoc, dueReminders } from './core.js';

const MAX_PROFILES = 10;   // stops strangers from filling your free storage
const MAX_BODY = 300000;  // bytes
const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': 'content-type', 'access-control-allow-methods': 'POST,GET,OPTIONS' };
const J = (o, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { ...cors, 'content-type': 'application/json' } });
const sha = async s => [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)))].map(b => b.toString(16).padStart(2, '0')).join('');
const rnd = n => [...crypto.getRandomValues(new Uint8Array(n))].map(b => b.toString(16).padStart(2, '0')).join('');
const CODE_CH = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const newCode = () => [...crypto.getRandomValues(new Uint8Array(8))].map(b => CODE_CH[b % 32]).join('');
const PUSH_HOST = /(^|\.)(push\.apple\.com|googleapis\.com|push\.services\.mozilla\.com|notify\.windows\.com)$/;
const validSub = s => { try { const u = new URL(s.endpoint); return u.protocol === 'https:' && PUSH_HOST.test(u.hostname) && s.keys && s.keys.p256dh && s.keys.auth; } catch { return false; } };

export default {
  async fetch(req, env) {
    if (req.method === 'OPTIONS') return new Response(null, { headers: cors });
    const path = new URL(req.url).pathname;
    if (req.method !== 'POST') return new Response('BlovMed push worker is running', { headers: cors });
    const txt = await req.text();
    if (txt.length > MAX_BODY) return J({ error: 'too big' }, 413);
    let b; try { b = JSON.parse(txt); } catch { return J({ error: 'bad json' }, 400); }
    try {
      if (path === '/p/sync') return await pSync(env, b);
      if (path === '/p/code') return await pCode(env, b);
      if (path === '/p/claim') return await pClaim(env, b);
      if (path === '/p/unlink') return await pUnlink(env, b);
      if (path === '/sync') return await legacySync(env, b);
    } catch (e) { console.log('error', e.message); return J({ error: 'server' }, 500); }
    return J({ error: 'not found' }, 404);
  },
  async scheduled(_e, env, ctx) { ctx.waitUntil(run(env)); },
};

/* ---------- profiles ---------- */
async function auth(env, b) {
  if (!b.pid || !b.key || !/^(phone|admin)$/.test(b.role)) return null;
  const prof = await env.KV.get('p:' + b.pid, 'json'); if (!prof) return null;
  const h = await sha(b.key);
  return (b.role === 'admin' ? prof.ah : prof.ph).includes(h) ? prof : null;
}
const meta = p => ({ phone: (p.ph || []).length > 0, seen: p.seen || {}, subs: { phone: !!(p.subs && p.subs.phone), admin: !!(p.subs && p.subs.admin) }, admins: (p.ah || []).length, tz: p.tz });

async function pSync(env, b) {
  let prof, out = {};
  if (!b.pid) { // first sync creates the profile: from his phone, or from the back office when setting up a gift
    if (!/^(phone|admin)$/.test(b.role)) return J({ error: 'auth' }, 401);
    const idx = (await env.KV.get('idx', 'json')) || [];
    if (idx.length >= MAX_PROFILES) return J({ error: 'full' }, 403);
    const pid = rnd(16), key = rnd(24);
    const h = await sha(key);
    prof = { pid, ph: b.role === 'phone' ? [h] : [], ah: b.role === 'admin' ? [h] : [], tz: 'Asia/Manila', subs: {}, doc: newDoc(), seen: {}, dead: [], created: Date.now() };
    idx.push(pid); await env.KV.put('idx', JSON.stringify(idx));
    out = { pid, key };
  } else {
    prof = await auth(env, b); if (!prof) return J({ error: 'auth' }, 401);
  }
  const before = JSON.stringify(prof);
  prof.doc = merge(prof.doc, b.doc);
  if (b.role === 'phone' && typeof b.tz === 'string' && b.tz.length < 60) prof.tz = b.tz;
  if ('sub' in b) {
    if (b.sub === null) delete prof.subs[b.role];
    else if (validSub(b.sub)) {
      const h = await sha(b.sub.endpoint);
      if ((prof.dead || []).includes(h)) { delete prof.subs[b.role]; out.resub = true; }
      else { prof.subs[b.role] = b.sub; if (b.role === 'phone') await dropLegacy(env, h); }
    }
  }
  const now = Date.now(), seen = prof.seen || (prof.seen = {});
  const changed = JSON.stringify(prof) !== before;
  if (changed || now - (seen[b.role] || 0) > 10 * 6e4) { seen[b.role] = now; await env.KV.put('p:' + prof.pid, JSON.stringify(prof)); }
  return J({ ...out, doc: prof.doc, meta: meta(prof) });
}

async function pCode(env, b) {
  const prof = await auth(env, b); if (!prof) return J({ error: 'auth' }, 401);
  const code = newCode();
  const gift = b.role === 'admin' && b.gift === true; // gift links stay valid for 7 days
  await env.KV.put('c:' + code, JSON.stringify({ pid: prof.pid, role: b.role === 'phone' ? 'admin' : 'phone' }), { expirationTtl: gift ? 7 * 86400 : 900 });
  return J({ code: code.slice(0, 4) + '-' + code.slice(4), days: gift ? 7 : 0 });
}

async function pClaim(env, b) {
  const code = String(b.code || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (code.length !== 8) return J({ error: 'code' }, 404);
  const c = await env.KV.get('c:' + code, 'json'); if (!c) return J({ error: 'code' }, 404);
  await env.KV.delete('c:' + code);
  const prof = await env.KV.get('p:' + c.pid, 'json'); if (!prof) return J({ error: 'code' }, 404);
  const key = rnd(24), h = await sha(key);
  if (c.role === 'admin') prof.ah = [...(prof.ah || []), h].slice(-3);
  else { prof.ph = [h]; delete prof.subs.phone; } // moving to a new phone: the old one is logged out
  await env.KV.put('p:' + prof.pid, JSON.stringify(prof));
  return J({ pid: prof.pid, key, role: c.role, doc: prof.doc, meta: meta(prof) });
}

async function pUnlink(env, b) { // his phone can remove back-office access at any time
  const prof = await auth(env, b); if (!prof || b.role !== 'phone') return J({ error: 'auth' }, 401);
  prof.ah = []; delete prof.subs.admin;
  await env.KV.put('p:' + prof.pid, JSON.stringify(prof));
  return J({ ok: true, meta: meta(prof) });
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

async function run(env) {
  const now = Date.now(), idx = (await env.KV.get('idx', 'json')) || [];
  for (const pid of idx) {
    const prof = await env.KV.get('p:' + pid, 'json'); if (!prof) continue;
    const sent = (await env.KV.get('s:' + pid, 'json')) || {};
    let changed = false; const dead = [];
    for (const m of dueReminders(prof, sent, now)) {
      if (dead.includes(m.to)) continue;
      const r = await send(env, prof.subs[m.to], m);
      if (r === 'dead') dead.push(m.to); else if (r === 'ok') { sent[m.sk] = now; changed = true; }
    }
    for (const k in sent) if (now - sent[k] > 3 * 864e5) { delete sent[k]; changed = true; }
    if (changed) await env.KV.put('s:' + pid, JSON.stringify(sent)); // sent records live apart from his data, so they never overwrite a fresh sync
    if (dead.length) {
      const fresh = await env.KV.get('p:' + pid, 'json');
      for (const role of dead) {
        const ep = prof.subs[role].endpoint;
        if (fresh.subs[role] && fresh.subs[role].endpoint === ep) { delete fresh.subs[role]; fresh.dead = [...(fresh.dead || []), await sha(ep)].slice(-5); }
      }
      await env.KV.put('p:' + pid, JSON.stringify(fresh));
    }
  }
  await legacyRun(env, now);
}

/* ---------- old app version (until his phone loads the update) ---------- */
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
