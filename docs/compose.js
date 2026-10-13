// Compose: catch a melody the moment it comes. It records as soon as he plays, autosaves every note to
// his account (all devices), and drafts can be reopened and continued later. Saved melodies can be played in Maestro.
import { ask } from './ui.js';
const NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const isBlack = m => [1, 3, 6, 8, 10].includes(m % 12);
const nm = m => NAMES[m % 12].replace('#', '♯') + (Math.floor(m / 12) - 1);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const $ = s => document.querySelector(s);
const rid = () => 'c' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const MIN_MS = 70, MAX_MS = 4000, LAST_MS = 600;

let X = null;   // { doc, quiet, act, redraw, tone(midi, secs), audio() }
let C = null;   // the open melody
let timers = [], saveT = null, metroT = null, lastT = 0;
export const init = ctx => { X = ctx; };
export const busy = () => !!C && (C.playing || C.notes.length > 0);
const comps = () => Object.values((X.doc().comp) || {}).filter(c => !c.del).sort((a, b) => b.u - a.u);
const when = t => new Date(t).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });

/* ---------- open / new / save ---------- */
export function open(id) {
  stopAll();
  const c = id && (X.doc().comp || {})[id];
  C = c ? { id: c.id, title: c.title, bpm: c.bpm || 90, notes: c.notes.map(([m, ms]) => ({ m, ms })), oct: suggestOct(c.notes), rec: true, playing: false, sel: -1, metro: false, c: c.c }
        : { id: null, title: '', bpm: 90, notes: [], oct: 4, rec: true, playing: false, sel: -1, metro: false, c: 0 };
  lastT = 0;
}
// Open on the keyboard position that shows the most of the melody (ties: closest to middle C).
const suggestOct = ns => { if (!ns.length) return 4; let best = 4, top = -1;
  for (const o of [4, 3, 5, 2, 6, 1]) { const lo = 12 * (o + 1), c = ns.filter(n => n[0] >= lo && n[0] <= lo + 19).length; if (c > top) { top = c; best = o; } } return best; };
function autosave() { clearTimeout(saveT); saveT = setTimeout(save, 800); }
function save(final) {
  clearTimeout(saveT);
  if (!C || !C.notes.length) return;
  const D = X.doc(), t = Date.now(), first = !C.id;
  if (first) { C.id = rid(); C.c = t; }
  const title = (C.title || '').trim() || `Idea · ${when(C.c)}`;
  D.comp = D.comp || {};
  D.comp[C.id] = { id: C.id, title, bpm: C.bpm, notes: C.notes.map(n => [n.m, Math.round(n.ms)]), c: C.c, u: t, by: 'phone' };
  if (first) X.act('🎼', `Started a new melody: “${title}”`);
  else if (final) X.act('🎼', `Saved melody “${title}” (${C.notes.length} notes)`);
  X.quiet();
  if (first) { const y = window.scrollY; X.redraw(); window.scrollTo(0, y); } // show it in My melodies right away
  const st = $('#cstate'); if (st) st.innerHTML = statusLine();
}
export function leave() { if (C && C.notes.length) save(true); stopAll(); C = null; }

/* ---------- screen ---------- */
function keys() {
  const lo = 12 * (C.oct + 1), whites = [];
  for (let m = lo; whites.length < 12; m++) if (!isBlack(m)) whites.push(m);
  const w = 100 / whites.length, blacks = [];
  whites.forEach((m, i) => { if (i < whites.length - 1 && isBlack(m + 1)) blacks.push([m + 1, (i + 1) * w]); });
  return `<div class="piano compose" id="cpiano">${whites.map(m => `<button class="wk" data-cm="${m}" aria-label="${nm(m)}"><span>${NAMES[m % 12]}${NAMES[m % 12] === 'C' ? Math.floor(m / 12) - 1 : ''}</span></button>`).join('')}
    ${blacks.map(([m, x]) => `<button class="bk" data-cm="${m}" aria-label="${nm(m)}" style="left:calc(${x}% - ${w * .32}%);width:${w * .64}%"></button>`).join('')}</div>`;
}
// Piano roll: each note is a bar — across = time (length = how long it lasts), up = pitch. Tap a bar to edit it.
const PX = .09; // pixels per millisecond
function roll() {
  if (!C.notes.length) return `<div class="roll empty" id="roll"><span>🎵 Your melody will draw itself here as you play</span></div>`;
  const ms = C.notes.map(n => n.m), lo = Math.min(...ms) - 1, hi = Math.max(...ms) + 1, span = Math.max(6, hi - lo), H = 104;
  let x = 8, bars = '';
  C.notes.forEach((n, i) => {
    const w = Math.max(16, n.ms * PX - 3), y = (hi - n.m) / span * (H - 18);
    bars += `<button class="rbar ${i === C.sel ? 'on' : ''} ${isBlack(n.m) ? 'blk' : ''}" data-a="csel" data-i="${i}" style="left:${x}px;top:${y}px;width:${w}px" aria-label="${nm(n.m)}">${w > 26 ? nm(n.m) : ''}</button>`;
    x += n.ms * PX;
  });
  return `<div class="roll" id="roll"><div class="rin" style="width:${x + 40}px">${bars}<i class="phead" id="phead"></i></div></div>`;
}
const total = () => C.notes.reduce((a, n) => a + n.ms, 0);
const clock = ms => { const s = Math.round(ms / 1000); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
const statusLine = () => C.notes.length ? `${C.notes.length} notes · ${clock(total())} · <span class="ok">saved ✓</span>` : (C.rec ? 'Recording starts with your first note' : 'Paused. Tap the red button to record');
export function view() {
  if (!C) open(null);
  const list = comps();
  return `<div class="gtop"><button class="back" data-a="cmback">← Back</button><span class="gbest">🎼 Compose</span><button class="mini-btn ghost" data-a="cnew">+ New</button></div>
  <div id="cbox">
   <input type="text" id="ctitle" value="${esc(C.title)}" placeholder="Untitled idea (tap to name it)" maxlength="60">
   ${roll()}
   <div class="cmain">
     <button class="cbtn" data-a="cundo" aria-label="Undo last note">↶<small>Undo</small></button>
     <button class="crec ${C.rec ? 'live' : ''}" data-a="crec" aria-label="${C.rec ? 'Pause recording' : 'Record'}"><i></i></button>
     <button class="cbtn" data-a="cplay" aria-label="Play">${C.playing ? '■' : '▶'}<small>${C.playing ? 'Stop' : 'Play'}</small></button>
   </div>
   <p class="cstat" id="cstate">${statusLine()}</p>
   <div class="cedit" id="cedit">${selTools()}</div>
   ${keys()}
   <details class="sec card ctoolbox" ${C.tools ? 'open' : ''}><summary><b>🛠 Tools</b></summary><div>
     <div class="srow"><span>Keyboard</span><span><button class="mini-btn ghost" data-a="coct" data-d="-1">◀</button> ${nm(12 * (C.oct + 1))}–${nm(12 * (C.oct + 1) + 19)} <button class="mini-btn ghost" data-a="coct" data-d="1">▶</button></span></div>
     <div class="srow"><span>Tempo</span><span class="cbpm"><button data-a="cbpm" data-d="-5">−</button><b id="cbpmv">${C.bpm}</b><button data-a="cbpm" data-d="5">+</button><small>bpm</small></span></div>
     <div class="srow"><span>Metronome</span><button class="toggle ${C.metro ? 'on' : ''}" data-a="cmetro"><i></i></button></div>
     <div class="srow"><span>Tidy the rhythm</span><button class="mini-btn ghost" data-a="csnap" ${C.notes.length > 1 ? '' : 'disabled'}>✨ Snap to beat</button></div>
   </div></details>
  </div>
  <h2>My melodies</h2>
  ${list.length ? `<div class="list">${list.map(c => `<div class="lrow"><button class="lbody" data-a="copen" data-id="${c.id}"><span><b>${esc(c.title)}</b><span>${c.notes.length} notes · ${when(c.u)}${c.id === C.id ? ' · open now' : ''}</span></span></button><button class="mini-btn ghost" data-a="cgame" data-id="${c.id}" aria-label="Play in Maestro">🎹</button><button class="mini-btn ghost" data-a="cdel" data-id="${c.id}" aria-label="Delete">✕</button></div>`).join('')}</div>`
    : '<p class="mini">Your melodies appear here. Open one any time to keep adding to it.</p>'}`;
}
const selTools = () => C.sel >= 0 && C.notes[C.sel] ? `<span class="mini"><b>${nm(C.notes[C.sel].m)}</b> · ${(C.notes[C.sel].ms / 1000).toFixed(2)}s</span><button class="mini-btn ghost" data-a="clen" data-d="0.5">Shorter</button><button class="mini-btn ghost" data-a="clen" data-d="2">Longer</button><button class="mini-btn red" data-a="cdelnote">Delete</button><button class="mini-btn ghost" data-a="csel" data-i="${C.sel}">Done</button>` : '';
function refresh() {
  const r = $('#roll'); if (r) { const left = r.scrollLeft, wasEnd = left + r.clientWidth >= r.scrollWidth - 30; r.outerHTML = roll(); const n = $('#roll'); if (n) n.scrollLeft = wasEnd || C.rec ? n.scrollWidth : left; }
  const e = $('#cedit'), st = $('#cstate'), rec = document.querySelector('[data-a="crec"]'), p = document.querySelector('[data-a="cplay"]');
  if (e) e.innerHTML = selTools(); if (st) st.innerHTML = statusLine();
  if (rec) rec.className = 'crec ' + (C.rec ? 'live' : '');
  if (p) p.innerHTML = `${C.playing ? '■' : '▶'}<small>${C.playing ? 'Stop' : 'Play'}</small>`;
}
function floatNote(m) { // a little ♪ rises from the key he played
  const k = document.querySelector(`#cpiano [data-cm="${m}"]`), pi = $('#cpiano'); if (!k || !pi) return;
  const r = k.getBoundingClientRect(), b = pi.getBoundingClientRect(), s = document.createElement('span');
  s.className = 'burst'; s.textContent = ['♪', '♫', '♩', '♬'][m % 4]; s.style.left = (r.left - b.left + r.width / 2) + 'px'; pi.appendChild(s); setTimeout(() => s.remove(), 700);
}

/* ---------- playing, recording ---------- */
function light(m, ms) { const k = document.querySelector(`#cpiano [data-cm="${m}"]`); if (!k) return; k.classList.add('on'); const id = setTimeout(() => k.classList.remove('on'), ms); timers.push(id); }
function key(m) {
  X.audio(); X.tone(m, .5); light(m, 200); floatNote(m);
  if (!C || !C.rec || C.playing) return;
  const now = performance.now();
  if (C.notes.length && lastT) C.notes[C.notes.length - 1].ms = Math.max(MIN_MS, Math.min(MAX_MS, now - lastT));
  C.notes.push({ m, ms: LAST_MS }); lastT = now; C.sel = -1;
  refresh(); autosave();
}
function play() {
  if (!C.notes.length) return;
  stopAll(); C.playing = true; refresh(); X.audio();
  let t = 0;
  const ph = $('#phead'), r = $('#roll');
  if (ph) { ph.style.transition = 'none'; ph.style.left = '8px'; ph.style.opacity = 1; void ph.offsetWidth; ph.style.transition = `left ${total()}ms linear`; ph.style.left = (8 + total() * PX) + 'px'; }
  C.notes.forEach((n, i) => { const id = setTimeout(() => { X.tone(n.m, n.ms / 1000); light(n.m, Math.min(n.ms * .85, 900)); const bar = document.querySelectorAll('#roll .rbar')[i]; if (bar) { bar.classList.add('play'); if (r) r.scrollLeft = Math.max(0, bar.offsetLeft - r.clientWidth / 2); setTimeout(() => bar.classList.remove('play'), Math.min(n.ms, 900)); } }, t); timers.push(id); t += n.ms; });
  timers.push(setTimeout(() => { C.playing = false; const p2 = $('#phead'); if (p2) p2.style.opacity = 0; refresh(); }, t + 200));
}
function metronome() {
  clearInterval(metroT); if (!C.metro) return;
  const beat = 60000 / C.bpm; let i = 0;
  metroT = setInterval(() => { X.tone(i++ % 4 ? 96 : 100, .05); }, beat);
}
function stopAll() { timers.forEach(clearTimeout); timers = []; if (C) C.playing = false; }
// Snap: round each length to the nearest sixteenth at the chosen tempo (at least one sixteenth).
function snap() { const q = 60000 / C.bpm / 4; C.notes.forEach(n => { n.ms = Math.max(q, Math.round(n.ms / q) * q); }); refresh(); autosave(); }

/* ---------- input ---------- */
export async function click(a, b) {
  if (!C) open(null);
  switch (a) {
    case 'crec': C.rec = !C.rec; lastT = 0; if (C.rec) { X.audio(); X.tone(84, .08); } refresh(); return true;
    case 'cplay': if (C.playing) { stopAll(); refresh(); } else play(); return true;
    case 'cundo': if (C.notes.length) { C.notes.pop(); C.sel = -1; lastT = 0; refresh(); autosave(); } return true;
    case 'cmetro': C.metro = !C.metro; b.classList.toggle('on', C.metro); metronome(); return true;
    case 'crecbig': return true;
    case 'cbpm': C.bpm = Math.max(40, Math.min(200, C.bpm + +b.dataset.d)); $('#cbpmv').textContent = C.bpm; metronome(); autosave(); return true;
    case 'coct': C.oct = Math.max(1, Math.min(6, C.oct + +b.dataset.d)); C.tools = true; X.redraw(); return true;
    case 'csel': { const i = +b.dataset.i; C.sel = C.sel === i ? -1 : i; if (C.sel >= 0) { const n = C.notes[i]; X.audio(); X.tone(n.m, n.ms / 1000); light(n.m, 300); } refresh(); return true; }
    case 'clen': { const n = C.notes[C.sel]; if (n) { n.ms = Math.max(MIN_MS, Math.min(MAX_MS, n.ms * +b.dataset.d)); refresh(); autosave(); } return true; }
    case 'cdelnote': if (C.sel >= 0) { C.notes.splice(C.sel, 1); C.sel = -1; lastT = 0; refresh(); autosave(); } return true;
    case 'csnap': snap(); return true;
    case 'cnew': if (C.notes.length) save(true); open(null); X.redraw(); return true;
    case 'copen': if (C.notes.length) save(true); open(b.dataset.id); X.redraw(); return true;
    case 'cdel': {
      const c = (X.doc().comp || {})[b.dataset.id]; if (!c) return true;
      if (!(await ask({ icon: '🗑️', title: `Delete “${esc(c.title)}”?`, text: 'This melody will be gone from all your devices.', ok: 'Delete', danger: true }))) return true;
      X.doc().comp[c.id] = { ...c, del: true, u: Date.now() }; X.quiet(); if (C.id === c.id) open(null); X.redraw(); return true;
    }
    default: return false;
  }
}
document.addEventListener('pointerdown', e => { const k = e.target.closest && e.target.closest('#cpiano [data-cm]'); if (!k) return; e.preventDefault(); key(+k.dataset.cm); });
document.addEventListener('input', e => { if (e.target.id === 'ctitle' && C) { C.title = e.target.value; if (C.notes.length) autosave(); } });
export const _test = { state: () => C, key, save };
