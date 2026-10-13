// BlovMed piano voice: behaves like a digital piano.
// A note sounds while the key is held and is damped when released (or kept ringing by the sustain pedal).
// Tone: slightly inharmonic partials (like real strings), a soft hammer "thump", brightness that fades,
// and lower notes ring longer than higher ones. Up to 24 notes at once.
let ac = null, master = null, comp = null, muted = false, pedalDown = false;
const voices = new Map(); let nextId = 1;
export function audio() {
  try {
    if (!ac) {
      ac = new (window.AudioContext || window.webkitAudioContext)();
      comp = ac.createDynamicsCompressor(); comp.threshold.value = -14; comp.ratio.value = 4; comp.attack.value = .003; comp.release.value = .25;
      master = ac.createGain(); master.gain.value = .55; master.connect(comp); comp.connect(ac.destination);
    }
    if (ac.state === 'suspended') ac.resume();
  } catch (e) {}
  return ac;
}
export const setMuted = v => { muted = v; if (v) allOff(); };
export const isMuted = () => muted;
const freq = m => 440 * Math.pow(2, (m - 69) / 12);
let noiseBuf = null;
function noise(a) { if (noiseBuf) return noiseBuf; noiseBuf = a.createBuffer(1, a.sampleRate * .05, a.sampleRate); const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length); return noiseBuf; }

export function noteOn(midi, vel = .8) {
  const a = audio(); if (!a || muted) return 0;
  if (voices.size >= 24) noteOff([...voices.keys()][0], true);
  const t = a.currentTime, f = freq(midi);
  const ring = Math.max(.7, 3.2 - (midi - 36) * .045); // seconds to fade while held: low notes ring longer
  const out = a.createGain(), lp = a.createBiquadFilter();
  lp.type = 'lowpass'; lp.Q.value = .6;
  lp.frequency.setValueAtTime(Math.min(16000, f * (6 + vel * 10)), t);
  lp.frequency.exponentialRampToValueAtTime(Math.min(12000, f * 2.6), t + ring * .6);
  out.gain.setValueAtTime(.0001, t);
  out.gain.exponentialRampToValueAtTime(.28 * vel, t + .004);
  out.gain.exponentialRampToValueAtTime(.12 * vel, t + .25);
  out.gain.exponentialRampToValueAtTime(.0008, t + ring + .25);
  lp.connect(out); out.connect(master);
  const B = .00025, oscs = [];
  [[1, .9], [2, .45], [3, .22], [4, .14], [5, .08], [6, .05], [7, .03]].forEach(([n, amp]) => {
    const fn = f * n * Math.sqrt(1 + B * n * n); if (fn > 15000) return;
    const o = a.createOscillator(), g = a.createGain();
    o.type = 'sine'; o.frequency.value = fn; o.detune.value = (n === 1 ? 0 : (Math.random() - .5) * 3);
    g.gain.setValueAtTime(amp, t); g.gain.exponentialRampToValueAtTime(amp * Math.max(.05, .6 - n * .07), t + ring * (1.2 - n * .1));
    o.connect(g); g.connect(lp); o.start(t); oscs.push(o);
  });
  // hammer: a very short filtered noise tap at the start
  const h = a.createBufferSource(), hf = a.createBiquadFilter(), hg = a.createGain();
  h.buffer = noise(a); hf.type = 'bandpass'; hf.frequency.value = Math.min(9000, f * 3); hf.Q.value = 1.2;
  hg.gain.setValueAtTime(.06 * vel, t); hg.gain.exponentialRampToValueAtTime(.0001, t + .03);
  h.connect(hf); hf.connect(hg); hg.connect(out); h.start(t); h.stop(t + .05);
  const id = nextId++;
  voices.set(id, { out, oscs, midi, held: true, start: t, end: t + ring + .3 });
  oscs.forEach(o => o.stop(t + ring + .4));
  setTimeout(() => voices.delete(id), (ring + .5) * 1000);
  return id;
}
// Key released: the damper stops the string quickly (unless the sustain pedal is down).
export function noteOff(id, force) {
  const v = voices.get(id); if (!v || !ac) return;
  v.held = false;
  if (pedalDown && !force) return;
  const t = ac.currentTime, damp = v.midi > 88 ? .5 : .14 + Math.max(0, (60 - v.midi) * .004);
  try { v.out.gain.cancelScheduledValues(t); v.out.gain.setValueAtTime(Math.max(.0001, v.out.gain.value), t); v.out.gain.exponentialRampToValueAtTime(.0001, t + damp); v.oscs.forEach(o => { try { o.stop(t + damp + .05); } catch (e) {} }); } catch (e) {}
  voices.delete(id);
}
export function pedal(down) {
  pedalDown = down;
  if (!down) for (const [id, v] of [...voices]) if (!v.held) { voices.set(id, v); noteOff(id); }
}
export const isPedal = () => pedalDown;
export function allOff() { for (const id of [...voices.keys()]) noteOff(id, true); }
// Play a note for a set time (used when the app plays music back).
export function tone(midi, secs = .45, vel = .75) { const id = noteOn(midi, vel); if (id) setTimeout(() => noteOff(id), Math.max(60, secs * 1000)); return id; }
export const active = () => voices.size; // (for tests) notes sounding right now
