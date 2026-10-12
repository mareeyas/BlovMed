import { buildPushPayload } from '@block65/webcrypto-web-push';
import { dueMessages, localNow } from './schedule.js';

const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': 'content-type', 'access-control-allow-methods': 'POST,OPTIONS' };
const sha = async (s) => [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)))].map(b => b.toString(16).padStart(2, '0')).join('');
const getDb = async (env) => (await env.KV.get('db', 'json')) || { users: {} };

export default {
  async fetch(req, env) {
    if (req.method === 'OPTIONS') return new Response(null, { headers: cors });
    const u = new URL(req.url);
    if (u.pathname === '/sync' && req.method === 'POST') {
      let b; try { b = await req.json(); } catch { return new Response('bad', { status: 400, headers: cors }); }
      if (!b?.sub?.endpoint || !Array.isArray(b.meds)) return new Response('bad', { status: 400, headers: cors });
      const db = await getDb(env), id = await sha(b.sub.endpoint);
      db.users[id] = { sub: b.sub, tz: b.tz || 'Asia/Manila', nags: b.nags !== false, meds: b.meds.slice(0, 30), taken: (b.taken || []).slice(-400), sent: db.users[id]?.sent || {} };
      await env.KV.put('db', JSON.stringify(db));
      return new Response('ok', { headers: cors });
    }
    return new Response('BlovMed push worker is running', { headers: cors });
  },
  async scheduled(_e, env, ctx) { ctx.waitUntil(run(env)); },
};

async function run(env) {
  const now = Date.now(), db = await getDb(env), sentNew = {}, dead = [];
  for (const [id, rec] of Object.entries(db.users)) {
    for (const m of dueMessages(rec, now)) {
      try {
        const payload = await buildPushPayload(
          { data: JSON.stringify({ title: m.title, body: m.body, tag: m.tag }), options: { ttl: 600, urgency: 'high' } },
          rec.sub, { subject: env.VAPID_SUBJECT || 'mailto:admin@example.com', publicKey: env.VAPID_PUBLIC, privateKey: env.VAPID_PRIVATE });
        const r = await fetch(rec.sub.endpoint, payload);
        if (r.status === 404 || r.status === 410) { dead.push(id); break; }
        if (r.ok) (sentNew[id] ||= {})[m.sk] = 1;
      } catch (e) { console.log('push failed', e.message); }
    }
  }
  if (!Object.keys(sentNew).length && !dead.length) return;
  const fresh = await getDb(env); // merge into the latest data so we never overwrite a fresh sync
  for (const id of dead) delete fresh.users[id];
  for (const [id, s] of Object.entries(sentNew)) if (fresh.users[id]) {
    const cutoff = localNow(fresh.users[id].tz, now - 2 * 864e5).ymd;
    const merged = { ...fresh.users[id].sent, ...s };
    for (const k of Object.keys(merged)) if (k.slice(0, 10) < cutoff) delete merged[k];
    fresh.users[id].sent = merged;
  }
  await env.KV.put('db', JSON.stringify(fresh));
}
