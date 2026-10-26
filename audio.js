/* Airport Empire – kleine Klangeffekte (WebAudio, keine Dateien nötig) */
(function (AE) {
  'use strict';
  let ctx = null, muted = false, eng = null;
  try { muted = localStorage.getItem('airportEmpire.muted') === '1'; } catch (e) { /* ignore */ }

  function ac() {
    if (!ctx) { try { ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { return null; } }
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  }
  function tone(f0, f1, dur, type, vol, delay) {
    if (muted) return;
    const c = ac(); if (!c) return;
    const t0 = c.currentTime + (delay || 0);
    const o = c.createOscillator(), g = c.createGain();
    o.type = type || 'sine';
    o.frequency.setValueAtTime(f0, t0);
    if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t0 + dur);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(vol || 0.08, t0 + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g); g.connect(c.destination);
    o.start(t0); o.stop(t0 + dur + 0.02);
  }
  const SFX = {
    click: () => tone(660, 660, 0.05, 'sine', 0.05),
    build: () => { tone(300, 420, 0.07, 'triangle', 0.07); },
    bulldoze: () => tone(180, 70, 0.14, 'sawtooth', 0.06),
    buy: () => { tone(520, 520, 0.08, 'triangle', 0.07); tone(780, 780, 0.12, 'triangle', 0.07, 0.08); },
    good: () => { tone(520, 520, 0.09, 'triangle', 0.07); tone(660, 660, 0.09, 'triangle', 0.07, 0.09); tone(880, 880, 0.16, 'triangle', 0.07, 0.18); },
    bad: () => { tone(220, 160, 0.22, 'square', 0.05); },
    warn: () => { tone(880, 880, 0.12, 'square', 0.05); tone(880, 880, 0.12, 'square', 0.05, 0.2); },
    level: () => { [523, 659, 784, 1047].forEach((f, i) => tone(f, f, 0.18, 'triangle', 0.08, i * 0.12)); },
    touch: () => { tone(120, 60, 0.2, 'sine', 0.12); },
    crash: () => { tone(200, 30, 0.9, 'sawtooth', 0.14); },
  };
  AE.Audio = {
    play(name) { if (SFX[name]) SFX[name](); },
    get muted() { return muted; },
    toggle() {
      muted = !muted;
      try { localStorage.setItem('airportEmpire.muted', muted ? '1' : '0'); } catch (e) { /* ignore */ }
      if (muted) this.engineStop(); return muted;
    },
    // Triebwerksgeräusch: thr 0..1, wind 0..1
    engine(thr, wind) {
      if (muted) return;
      const c = ac(); if (!c) return;
      if (!eng) {
        const o1 = c.createOscillator(), o2 = c.createOscillator(), g = c.createGain(), f = c.createBiquadFilter();
        o1.type = 'sawtooth'; o2.type = 'sawtooth'; f.type = 'lowpass';
        o1.connect(f); o2.connect(f); f.connect(g); g.connect(c.destination);
        g.gain.value = 0; o1.start(); o2.start();
        eng = { o1, o2, g, f };
      }
      const t = c.currentTime;
      eng.o1.frequency.setTargetAtTime(48 + thr * 70, t, 0.2);
      eng.o2.frequency.setTargetAtTime(51 + thr * 74, t, 0.2);
      eng.f.frequency.setTargetAtTime(160 + thr * 700 + wind * 500, t, 0.25);
      eng.g.gain.setTargetAtTime(0.025 + thr * 0.05, t, 0.2);
    },
    engineStop() {
      if (eng && ctx) eng.g.gain.setTargetAtTime(0, ctx.currentTime, 0.1);
    },
  };
})(window.AE = window.AE || {});
