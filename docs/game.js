// Maestro: a classical-music memory game. Listen, then play the notes back.
// Every round adds a note, so he ends up playing the whole piece. High score is saved to his account.
// Each piece: the notes as written ("Eb5:1.5" = E-flat 5 lasting 1.5 quarter-note beats; "r:0.5" = a rest),
// in the original key, with the real rhythm. Played at a game-friendly tempo (bpm = quarter notes per minute).
// src = the published score the excerpt was checked against, note by note.
const PIECES = [
  { id: 'k545', by: 'Mozart', title: 'Piano Sonata No. 16 in C major, K. 545', part: 'I. Allegro, bars 1–2', key: 'C major', bpm: 120,
    n: 'C5:2 E5:1 G5:1 B4:1.5 C5:.25 D5:.25 C5:2' },
  { id: 'inv1', by: 'Bach', title: 'Invention No. 1 in C major, BWV 772', part: 'subject, bar 1', key: 'C major', bpm: 80,
    n: 'r:.25 C4:.25 D4:.25 E4:.25 F4:.25 D4:.25 E4:.25 C4:.25 G4:.5' },
  { id: 'ode', by: 'Beethoven', title: 'Symphony No. 9, “Ode to Joy”', part: 'theme', key: 'D major', bpm: 112,
    n: 'F#4:1 F#4:1 G4:1 A4:1 A4:1 G4:1 F#4:1 E4:1 D4:1 D4:1 E4:1 F#4:1 F#4:1.5 E4:.5 E4:2 F#4:1 F#4:1 G4:1 A4:1 A4:1 G4:1 F#4:1 E4:1 D4:1 D4:1 E4:1 F#4:1 E4:1.5 D4:.5 D4:2' },
  { id: 'canon', by: 'Pachelbel', title: 'Canon in D', part: 'first violin entry', key: 'D major', bpm: 80,
    n: 'F#5:1 E5:1 D5:1 C#5:1 B4:1 A4:1 B4:1 C#5:1 D5:1 C#5:1 B4:1 A4:1 G4:1 F#4:1 G4:1 E4:1' },
  { id: 'prel4', by: 'Chopin', title: 'Prelude in E minor, Op. 28 No. 4', part: 'melody, bars 1–8', key: 'E minor', bpm: 100, src: 'Peters edition, 1879 (Mutopia Project)',
    n: 'B3:.75 B4:.25 B4:3 C5:1 B4:3 C5:1 B4:3 C5:1 B4:3 Bb4:1 A4:3 B4:1 A4:3 B4:1 A4:3 B4:.75 A4:.25 A4:3' },
  { id: 'nacht', by: 'Mozart', title: 'Eine kleine Nachtmusik, K. 525', part: 'I. Allegro, bars 1–4', key: 'G major', bpm: 132,
    n: 'G4:1 r:.5 D4:.5 G4:1 r:.5 D4:.5 G4:.5 D4:.5 G4:.5 B4:.5 D5:1 r:1 C5:1 r:.5 A4:.5 C5:1 r:.5 A4:.5 C5:.5 A4:.5 F#4:.5 A4:.5 D4:1' },
  { id: 'spring', by: 'Vivaldi', title: '“Spring” from The Four Seasons, RV 269', part: 'I. Allegro, opening', key: 'E major', bpm: 104,
    n: 'E4:.5 G#4:.5 G#4:.5 G#4:.5 F#4:.25 E4:.25 B4:1.5 B4:.25 A4:.25 G#4:.5 G#4:.5 G#4:.5 F#4:.25 E4:.25 B4:1.5' },
  { id: 'morning', by: 'Grieg', title: '“Morning Mood” from Peer Gynt, Op. 46', part: 'flute theme', key: 'E major', bpm: 100,
    n: 'B4:.5 G#4:.5 F#4:.5 E4:.5 F#4:.5 G#4:.5 B4:.5 G#4:.5 F#4:.5 E4:.5 F#4:.25 G#4:.25 F#4:.25 G#4:.25 B4:.5 G#4:.5 B4:.5 C#5:.5 G#4:.5 C#5:.5 B4:.5 G#4:.5 F#4:.5 E4:1.5' },
  { id: 'bwv846', by: 'Bach', title: 'Prelude in C major, BWV 846', part: 'Well-Tempered Clavier I, bars 1–2', key: 'C major', bpm: 72,
    n: 'C4:.25 E4:.25 G4:.25 C5:.25 E5:.25 G4:.25 C5:.25 E5:.25 C4:.25 E4:.25 G4:.25 C5:.25 E5:.25 G4:.25 C5:.25 E5:.25 C4:.25 D4:.25 A4:.25 D5:.25 F5:.25 A4:.25 D5:.25 F5:.25 C4:.25 D4:.25 A4:.25 D5:.25 F5:.25 A4:.25 D5:.25 F5:.25' },
  { id: 'elise', by: 'Beethoven', title: 'Für Elise, WoO 59', part: 'bars 1–8', key: 'A minor', bpm: 72,
    n: 'E5:.25 D#5:.25 E5:.25 D#5:.25 E5:.25 B4:.25 D5:.25 C5:.25 A4:.5 r:.25 C4:.25 E4:.25 A4:.25 B4:.5 r:.25 E4:.25 G#4:.25 B4:.25 C5:.5 r:.25 E4:.25 E5:.25 D#5:.25 E5:.25 D#5:.25 E5:.25 B4:.25 D5:.25 C5:.25 A4:.5 r:.25 C4:.25 E4:.25 A4:.25 B4:.5 r:.25 E4:.25 C5:.25 B4:.25 A4:1' },
  { id: 'turca', by: 'Mozart', title: 'Rondo alla Turca, Sonata K. 331', part: 'bars 1–4', key: 'A minor', bpm: 112, src: 'Mutopia Project edition',
    n: 'B4:.25 A4:.25 G#4:.25 A4:.25 C5:.5 r:.5 D5:.25 C5:.25 B4:.25 C5:.25 E5:.5 r:.5 F5:.25 E5:.25 D#5:.25 E5:.25 B5:.25 A5:.25 G#5:.25 A5:.25 B5:.25 A5:.25 G#5:.25 A5:.25 C6:1' },
  { id: 'noct92', by: 'Chopin', title: 'Nocturne in E-flat major, Op. 9 No. 2', part: 'bars 1–4 (opening)', key: 'E-flat major', bpm: 80, src: 'Schirmer edition, 1881 (Mutopia Project)',
    n: 'Bb4:.5 G5:2 F5:.5 G5:.5 F5:1.5 Eb5:1 Bb4:.5 G5:1 C5:.5 C6:1 G5:.5 Bb5:1.5 Ab5:1 G5:.5 F5:1.5 G5:1 D5:.5 Eb5:1.5 C5:1.5 Bb4:.5 D6:.5 C6:.5 Bb5:.25 Ab5:.25 G5:.25 Ab5:.25 C5:.25 D5:.25 Eb5:1.5' },
];
const LETTER = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
const midiOf = name => { const m = /^([A-G])(#|b)?(\d)$/.exec(name); return 12 * (+m[3] + 1) + LETTER[m[1]] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0); };
const pretty = name => name.replace('#', '♯').replace(/([A-G])b/, '$1♭');
for (const p of PIECES) {
  p.seq = p.n.split(' ').map(t => { const [nm, d] = t.split(':'); return nm === 'r' ? { rest: true, beats: +d } : { name: nm, midi: midiOf(nm), beats: +d }; });
  p.notes = p.seq.filter(x => !x.rest);
}
const NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const isBlack = m => [1, 3, 6, 8, 10].includes(m % 12);
const START_LEN = 3, LIVES = 3, PIECE_BONUS = 25;
let X = null;             // app context: { doc, quiet, act, carSVG, isShip, medLine, honk, redraw }
let S = null;             // the current game
let ac = null, muted = false, timers = [], showList = false;
export const init = ctx => { X = ctx; };
export const playing = () => !!S && (S.phase === 'listen' || S.phase === 'input' || S.phase === 'wait');
const G = () => (X && X.doc().game) || {};
// Built-in pieces first, then his own saved melodies (Compose).
function mine() {
  return Object.values((X && X.doc().comp) || {}).filter(c => !c.del && c.notes && c.notes.length >= 2).sort((a, b) => b.u - a.u).map(c => {
    const beat = 60000 / (c.bpm || 90), seq = c.notes.map(([m, ms]) => ({ name: NAMES[m % 12] + (Math.floor(m / 12) - 1), midi: m, beats: ms / beat }));
    return { id: c.id, by: (X.doc().cfg.name || 'You'), title: c.title, part: 'your composition', key: `${c.notes.length} notes`, bpm: c.bpm || 90, mine: true, seq, notes: seq };
  });
}
const ALL = () => [...PIECES, ...mine()];
export function playMine(id) { const i = ALL().findIndex(p => p.id === id); if (i >= 0) begin(i, true); }
export const best = () => G().best || 0;

/* ---------- sound: a soft piano tone ---------- */
export function audio() { try { ac = ac || new (window.AudioContext || window.webkitAudioContext)(); if (ac.state === 'suspended') ac.resume(); } catch (e) {} return ac; }
export function tone(midi, secs = .45) {
  const a = audio(); if (!a || muted) return;
  const f = 440 * Math.pow(2, (midi - 69) / 12), t = a.currentTime, g = a.createGain(), len = Math.min(3, Math.max(.6, secs * 1.6));
  g.gain.setValueAtTime(.0001, t); g.gain.exponentialRampToValueAtTime(.3, t + .012); g.gain.exponentialRampToValueAtTime(.0001, t + len);
  [[1, 'triangle', 1], [2, 'sine', .3], [3, 'sine', .1], [4, 'sine', .05]].forEach(([h, ty, v]) => { const o = a.createOscillator(), og = a.createGain(); o.type = ty; o.frequency.value = f * h; og.gain.value = v; o.connect(og); og.connect(g); o.start(t); o.stop(t + len + .1); });
  g.connect(a.destination);
}
const chord = (ms, at = 0) => setT(() => ms.forEach(m => tone(m, .9)), at);
const setT = (f, ms) => { const id = setTimeout(f, ms); timers.push(id); return id; };
const clearTimers = () => { timers.forEach(clearTimeout); timers = []; };
const vibrate = p => { try { navigator.vibrate && navigator.vibrate(p); } catch (e) {} };
const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/* ---------- keyboard: exactly the range the piece needs (white keys at the edges) ---------- */
let guide = { names: true, glow: true };
try { guide = { ...guide, ...JSON.parse(localStorage.getItem('blovmed.guide') || '{}') }; } catch (e) {}
const label = m => NAMES[m % 12].replace('#', '♯') + (NAMES[m % 12] === 'C' ? Math.floor(m / 12) - 1 : '');
function piano(p, names) {
  let lo = Math.min(...p.notes.map(n => n.midi)), hi = Math.max(...p.notes.map(n => n.midi));
  if (isBlack(lo)) lo--; if (isBlack(hi)) hi++;
  let whites = []; for (let m = lo; m <= hi; m++) if (!isBlack(m)) whites.push(m);
  while (whites.length < 8) {
    const a = whites[0] - (isBlack(whites[0] - 1) ? 2 : 1), b = whites[whites.length - 1] + (isBlack(whites[whites.length - 1] + 1) ? 2 : 1);
    whites = whites.length % 2 ? [a, ...whites] : [...whites, b];
  }
  const w = 100 / whites.length;
  const blacks = []; whites.forEach((m, i) => { if (i < whites.length - 1 && isBlack(m + 1)) blacks.push([m + 1, (i + 1) * w]); });
  return `<div class="piano ${names ? 'named' : ''}" id="piano">${whites.map(m => `<button class="wk" data-m="${m}" aria-label="${NAMES[m % 12]}${Math.floor(m / 12) - 1}"><span>${names ? label(m) : (NAMES[m % 12] === 'C' ? label(m) : '')}</span></button>`).join('')}
    ${blacks.map(([m, x]) => `<button class="bk" data-m="${m}" aria-label="${NAMES[m % 12]}" style="left:calc(${x}% - ${w * .32}%);width:${w * .64}%">${names ? `<span>${label(m)}</span>` : ''}</button>`).join('')}</div>`;
}
const notesLine = p => `<p class="gnotes">${p.seq.map(x => x.rest ? '<i>rest</i>' : pretty(x.name)).join(' ')}</p>`;
const pieceInfo = p => p.mine ? `<b>${esc(p.by)}</b>: ${esc(p.title)}<br><span class="mini">Your composition · ${p.notes.length} notes</span>` : `<b>${esc(p.by)}</b>: ${esc(p.title)}<br><span class="mini">${esc(p.part)} · ${esc(p.key)}${p.src ? ' · checked against the ' + esc(p.src) : ''}</span>`;

/* ---------- screens ---------- */
let mode = 'along';
try { mode = localStorage.getItem('blovmed.gmode') || 'along'; } catch (e) {}
const bestOf = (g, id) => (mode === 'along' ? (g.apb || {}) : (g.pb || {}))[id] || 0;
const starsOf = (g, id) => (g.astars || {})[id] || 0;
export function view() {
  const g = G(), b = S && S.single && ALL()[S.pi] ? Math.max(bestOf(g, ALL()[S.pi].id), S.phase === 'over' && S.newBest ? S.score : 0) : (mode === 'along' ? (g.abest || 0) : (g.best || 0));
  const head = `<div class="gtop"><button class="back" data-a="gmback">← Back</button><span class="gbest">🏆 Best <b id="gbest">${b}</b></span><button class="mini-btn ghost" data-a="gmute">${muted ? '🔇' : '🔊'}</button></div>`;
  if (!S || S.phase === 'idle') {
    const all = ALL(), row = (p, i) => `<button class="lrow gpiece-row" data-a="gpick" data-i="${i}"><span class="lbody"><span><b>${esc(p.by)}</b><span>${esc(p.title)}</span></span></span><span class="mini">${mode === 'along' && starsOf(g, p.id) ? '⭐'.repeat(starsOf(g, p.id)) + ' ' : ''}${bestOf(g, p.id) ? '🏆 ' + bestOf(g, p.id) : p.notes.length + ' notes'}</span></button>`;
    return `${head}<div id="gamebox" class="gamebox">
     <div class="gintro"><div class="gicon2">🎹</div><h1>Maestro</h1></div>
     <div class="seg"><button class="${mode === 'along' ? 'on' : ''}" data-a="gmode" data-k="along">🎼 Play along</button><button class="${mode === 'mem' ? 'on' : ''}" data-a="gmode" data-k="mem">🧠 Memory</button></div>
     <p class="sub" style="text-align:center;margin-top:-6px">${mode === 'along' ? 'Play the whole piece at your own pace. The notes fall toward their keys and the next key lights up. Build combos for a higher score.' : 'Listen, then play it back from memory. Every round adds more notes. 3 lives.'}</p>
     ${X.medLine()}
     <button class="btn full big" data-a="gstart">▶ Concert: all ${PIECES.length} pieces</button>
     <button class="btn ghost full" style="margin-top:8px" data-a="compose">✍️ Compose your own</button>
     <h2>Choose a piece</h2><div class="list">${all.slice(0, PIECES.length).map(row).join('')}</div>
     ${all.length > PIECES.length ? `<h2>Your melodies</h2><div class="list">${all.map((p, i) => i >= PIECES.length ? row(p, i) : '').join('')}</div>` : ''}
     <div class="gstats" style="margin-top:12px"><div><b>${g.best || 0}</b><span>Memory best</span></div><div><b>${g.abest || 0}</b><span>Play-along best</span></div><div><b>${g.pieces || 0}</b><span>Pieces played</span></div></div></div>`;
  }
  const p = ALL()[S.pi] || PIECES[0];
  if (S.phase === 'over') {
    const rec = S.newBest, top = S.single ? bestOf(g, p.id) : b, acc = S.hits + S.misses ? Math.round(S.hits / (S.hits + S.misses) * 100) : 100;
    return `${head}<div id="gamebox" class="gamebox"><div class="gintro"><div class="gicon2">${rec ? '🏆' : '🎼'}</div><h1>${rec ? 'New record!' : 'Bravo!'}</h1>
      <div class="bigstat">${S.score}</div><p>${rec ? (S.prevBest ? `You beat your best of ${S.prevBest}!` : 'Your first high score. Now beat it!') : `Best: ${top} · ${top - S.score > 0 ? (top - S.score) + ' more to beat it' : 'so close!'}`}</p>
      ${S.mode === 'along' ? `<p class="gstarline">${'⭐'.repeat(S.lastStars || 0)}${'☆'.repeat(3 - (S.lastStars || 0))}</p><p class="mini">${acc}% accuracy · longest combo ${S.bestCombo}</p>` : ''}</div>
      ${S.done.length ? `<div class="card"><b>You played</b>${S.done.map(d => `<p class="mini" style="margin:6px 0 0">${pieceInfo(d)}</p>`).join('')}</div>` : ''}
      <details class="sec card"><summary><b>The notes of ${p.mine ? 'your melody' : esc(p.by) + '\'s excerpt'}</b></summary><div><p class="mini" style="margin-top:0">${pieceInfo(p)}</p>${notesLine(p)}</div></details>
      ${X.medLine()}
      <button class="btn full big" data-a="${S.single ? 'gpick' : 'gstart'}" data-i="${S.pi}">▶ Play again</button><button class="btn ghost full" style="margin-top:8px" data-a="gmenu">Choose another piece</button></div>`;
  }
  const along = S.mode === 'along';
  return `${head}<div id="gamebox" class="gamebox playing">
    <div class="gbar"><span id="gscore">${S.score}</span>${along ? `<span id="gcombo" class="gcombo"></span>` : `<span id="glives">${'❤️'.repeat(S.lives)}${'🤍'.repeat(LIVES - S.lives)}</span>`}</div>
    <div class="gpiece" id="gpiece">${S.reveal || along ? pieceInfo(p) : `A piece by <b>${esc(p.by)}</b> · ${esc(p.key)}`}</div>
    <div class="gtrack ${X.isShip() ? 'sea' : ''}"><div class="gcar" id="gcar">${X.carSVG()}</div><span class="gflag">${X.isShip() ? '🏝️' : '🏁'}</span></div>
    ${along ? `<div class="gopts"><button class="chip ${guide.names ? 'on' : ''}" data-a="gopt" data-k="names">🔤 Note names</button><button class="chip ${guide.glow ? 'on' : ''}" data-a="gopt" data-k="glow">💡 Light next key</button><button class="chip" data-a="glisten">🎧 Listen first</button></div><div class="hw" id="hw"></div>` : `<div class="gmsg" id="gmsg">Listen…</div>`}
    ${piano(p, along && guide.names)}</div>`;
}

/* ---------- shared flow ---------- */
function begin(pi, single) {
  audio(); clearTimers();
  const g = G(), pc = ALL()[pi];
  S = { mode, phase: 'wait', pi, single, len: Math.min(START_LEN, pc.notes.length), step: 0, score: 0, lives: LIVES, done: [], speed: 1, reveal: false,
        hits: 0, misses: 0, pmiss: 0, combo: 0, bestCombo: 0, lastStars: 0, starsTotal: 0,
        prevBest: single ? bestOf(g, pc.id) : (mode === 'along' ? (g.abest || 0) : (g.best || 0)), newBest: false };
  X.redraw();
  if (mode === 'along') { S.phase = 'input'; alongReady(); } else setT(listen, 700);
}
function msg(t, cls) { const m = $('#gmsg'); if (m) { m.textContent = t; m.className = 'gmsg ' + (cls || ''); } }
function moveCar() {
  const c = $('#gcar'), p = ALL()[S.pi]; if (!c) return;
  const done = S.mode === 'along' ? S.step : (S.phase === 'input' ? S.step : Math.max(0, S.len - 1));
  const prog = Math.min(1, done / p.notes.length);
  c.style.left = `calc(${prog * 100}% - ${prog * 70}px)`;
}
function light(midi, ms, cls = 'on') { const k = document.querySelector(`#piano [data-m="${midi}"]`); if (!k) return; k.classList.add(cls); setT(() => k.classList.remove(cls), ms); }
function playSeq(p, count, onDone) { // the excerpt in its real rhythm
  const beat = 60000 / (p.bpm * S.speed); let t = 0, n = 0;
  for (const x of p.seq) { if (n >= count) break; const ms = x.beats * beat;
    if (!x.rest) { setT(() => { tone(x.midi, ms / 1000); light(x.midi, Math.max(120, Math.min(ms * .85, 900))); }, t); n++; } t += ms; }
  const last = p.notes[count - 1]; setT(onDone, t - last.beats * beat + Math.min(last.beats * beat, 450) + 100);
}
function pieceDone(p) {
  S.done.push(p); S.reveal = true; vibrate([40, 40, 80]); chord([60, 64, 67, 72], 250); if (X.honk) setT(() => X.honk(), 200);
  setT(() => {
    if (!S) return;
    if (S.single) { over(); return; }
    S.pi = (S.pi + 1) % PIECES.length; if (S.pi === 0) { S.speed *= 1.1; if (S.mode === 'along') { over(); return; } }
    S.len = Math.min(START_LEN, PIECES[S.pi].notes.length); S.step = 0; S.pmiss = 0; S.reveal = false; X.redraw();
    if (S.mode === 'along') { S.phase = 'input'; alongReady(); } else setT(listen, 700);
  }, 2400);
}

/* ---------- 🎼 Play along: note highway + next-key glow, own pace, combos and stars ---------- */
const mult = () => Math.min(4, 1 + Math.floor(S.combo / 8));
function alongReady() { moveCar(); setT(() => { highway(); glowNext(); }, 30); }
function glowNext() {
  document.querySelectorAll('#piano .next').forEach(k => k.classList.remove('next'));
  const p = ALL()[S.pi], n = p.notes[S.step]; if (!n || !guide.glow) return;
  const k = document.querySelector(`#piano [data-m="${n.midi}"]`); if (k) k.classList.add('next');
}
function highway() {
  const hw = $('#hw'), pianoEl = $('#piano'); if (!hw || !pianoEl) return;
  const p = ALL()[S.pi], base = pianoEl.getBoundingClientRect(), H = hw.clientHeight;
  let y = 0, html = '';
  for (let i = S.step; i < p.notes.length && y < H; i++) {
    const n = p.notes[i], k = pianoEl.querySelector(`[data-m="${n.midi}"]`); if (!k) continue;
    const r = k.getBoundingClientRect(), h = Math.max(18, Math.min(48, n.beats * 26));
    html += `<div class="hn ${i === S.step ? 'now' : ''} ${isBlack(n.midi) ? 'blk' : ''}" style="left:${r.left - base.left + 2}px;width:${r.width - 4}px;bottom:${y}px;height:${h - 3}px">${guide.names ? pretty(n.name).replace(/\d/, '') : ''}</div>`;
    y += h;
  }
  hw.innerHTML = html;
}
function alongPress(midi) {
  const p = ALL()[S.pi], want = p.notes[S.step]; if (!want) return;
  if (midi !== want.midi) {
    S.misses++; S.pmiss++; S.combo = 0; vibrate(60); combo();
    const k = document.querySelector(`#piano [data-m="${midi}"]`); if (k) { k.classList.add('miss'); setT(() => k.classList.remove('miss'), 300); }
    if (!guide.glow) light(want.midi, 600, 'hint');
    return;
  }
  S.hits++; S.combo++; S.bestCombo = Math.max(S.bestCombo, S.combo); S.score += 10 * mult(); S.step++;
  burst(midi); combo(); upd(); moveCar(); highway(); glowNext();
  if (S.step >= p.notes.length) {
    const acc = S.step / (S.step + S.pmiss), stars = acc >= .95 ? 3 : acc >= .8 ? 2 : 1;
    S.lastStars = stars; S.starsTotal += stars; S.score += PIECE_BONUS * stars; upd();
    const box = $('#hw'); if (box) box.innerHTML = `<div class="hwdone">${'⭐'.repeat(stars)}<br>${Math.round(acc * 100)}% · +${PIECE_BONUS * stars}</div>`;
    S.phase = 'wait'; pieceDone(p);
  }
}
function combo() { const c = $('#gcombo'); if (c) { c.textContent = S.combo >= 3 ? `🔥 ${S.combo} combo${mult() > 1 ? ' · ×' + mult() : ''}` : ''; c.classList.remove('pop'); void c.offsetWidth; c.classList.add('pop'); } }
function burst(midi) {
  const k = document.querySelector(`#piano [data-m="${midi}"]`), pianoEl = $('#piano'); if (!k || !pianoEl) return;
  const r = k.getBoundingClientRect(), b = pianoEl.getBoundingClientRect(), s = document.createElement('span');
  s.className = 'burst'; s.textContent = mult() > 1 ? '+' + 10 * mult() : '♪'; s.style.left = (r.left - b.left + r.width / 2) + 'px'; pianoEl.appendChild(s); setT(() => s.remove(), 700);
}

/* ---------- 🧠 Memory ---------- */
function listen() {
  if (!S) return;
  const p = ALL()[S.pi];
  S.phase = 'listen'; S.step = 0; msg('Listen… 🎧'); moveCar();
  playSeq(p, S.len, () => { if (!S) return; S.phase = 'input'; msg('Your turn 🎹', 'go'); });
}
function memPress(midi) {
  const p = ALL()[S.pi], want = p.notes[S.step].midi;
  if (midi !== want) { mistake(want); return; }
  S.step++; S.score++; upd(); moveCar();
  if (S.step < S.len) return;
  S.phase = 'wait';
  if (S.len >= p.notes.length) {
    S.score += PIECE_BONUS; upd();
    const box = $('#gpiece'); if (box) box.innerHTML = pieceInfo(p);
    msg(`🎉 Bravo! +${PIECE_BONUS}`, 'win'); pieceDone(p);
  } else {
    msg(['Nice!', 'Bravo!', 'Perfect!', 'Encore!', 'Magnifico!'][S.len % 5] + ' ✨', 'win'); vibrate(20);
    S.len = Math.min(p.notes.length, S.len + (S.len < 8 ? 1 : 2));
    setT(listen, 900);
  }
}
function mistake(want) {
  S.lives--; S.phase = 'wait'; upd(); vibrate([80, 60, 80]);
  light(want, 900, 'hint');
  const box = $('#gamebox'); if (box) { box.classList.add('shake'); setT(() => box.classList.remove('shake'), 450); }
  if (S.lives <= 0) { msg('Out of lives 💔', 'bad'); setT(over, 1100); return; }
  msg(`Oops! Listen again (${S.lives} ${S.lives === 1 ? 'life' : 'lives'} left)`, 'bad');
  setT(listen, 1300);
}
function press(midi) {
  if (!S) return;
  tone(midi, .4); light(midi, 220);
  if (S.phase !== 'input') return;
  if (S.mode === 'along') alongPress(midi); else memPress(midi);
}
function upd() { const s = $('#gscore'), l = $('#glives'); if (s) s.textContent = S.score; if (l) l.textContent = '❤️'.repeat(S.lives) + '🤍'.repeat(LIVES - S.lives); }
function over() {
  if (!S) return;
  const D = X.doc(), g = { ...(D.game || {}) }, t = Date.now(), p = ALL()[S.pi], along = S.mode === 'along';
  g.plays = (g.plays || 0) + 1; g.pieces = (g.pieces || 0) + S.done.length; g.last = S.score;
  const name = `${p.by}'s ${p.title.split(',')[0]}`;
  if (S.single) {
    const key = along ? 'apb' : 'pb', pb = { ...(g[key] || {}) };
    if (along && S.done.length) g.astars = { ...(g.astars || {}), [p.id]: Math.max((g.astars || {})[p.id] || 0, S.lastStars) };
    if (S.score > (pb[p.id] || 0)) { pb[p.id] = S.score; S.newBest = true; X.act('🏆', `New best on ${name} (${along ? 'play along' : 'memory'}): ${S.score}`); fanfare(); }
    else X.act('🎹', `Played ${name} (${along ? 'play along' : 'memory'}): ${S.score} points`);
    g[key] = pb;
  } else {
    const key = along ? 'abest' : 'best';
    if (S.score > (g[key] || 0)) { g[key] = S.score; S.newBest = true; X.act('🏆', `New Maestro ${along ? 'play-along' : 'memory'} record: ${S.score} points`); fanfare(); }
    else X.act('🎹', `Played Maestro (${along ? 'play along' : 'memory'}): ${S.score} points`);
  }
  g.u = t; D.game = g; X.quiet();
  S.phase = 'over'; X.redraw();
}
const fanfare = () => { chord([60, 64, 67], 0); chord([65, 69, 72], 350); chord([67, 71, 74], 700); chord([72, 76, 79], 1050); vibrate([60, 50, 60, 50, 140]); };
export function stop() { clearTimers(); S = null; }

/* ---------- input ---------- */
export function click(a, b) {
  if (a === 'gstart') { begin(0, false); return true; }
  if (a === 'gpick') { begin(+b.dataset.i, true); return true; }
  if (a === 'gmode') { mode = b.dataset.k; try { localStorage.setItem('blovmed.gmode', mode); } catch (e) {} X.redraw(); return true; }
  if (a === 'gmenu') { stop(); X.redraw(); return true; }
  if (a === 'gopt') { guide[b.dataset.k] = !guide[b.dataset.k]; try { localStorage.setItem('blovmed.guide', JSON.stringify(guide)); } catch (e) {} const st = S; X.redraw(); S = st; alongReady(); return true; }
  if (a === 'glisten') { if (S && S.mode === 'along' && S.phase === 'input') { S.phase = 'wait'; const p = ALL()[S.pi]; playSeq(p, p.notes.length, () => { if (S) { S.phase = 'input'; glowNext(); } }); } return true; }
  if (a === 'gmute') { muted = !muted; const btn = document.querySelector('[data-a="gmute"]'); if (btn) btn.textContent = muted ? '🔇' : '🔊'; return true; }
  return false;
}
document.addEventListener('pointerdown', e => {
  const k = e.target.closest && e.target.closest('#piano [data-m]'); if (!k) return;
  e.preventDefault(); press(+k.dataset.m);
});
window.addEventListener('resize', () => { if (S && S.mode === 'along' && S.phase === 'input') highway(); });
export const _test = { PIECES, state: () => S, press, ALL };
