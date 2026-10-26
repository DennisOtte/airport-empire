/* Airport Empire – Flugphysik (ohne DOM, testbar mit Node)
   Vereinfachtes Längsachsen-Modell: Nickwinkel steuern, Schub regeln, Klappen/Fahrwerk bedienen. */
(function (AE) {
  'use strict';
  const G = 9.81, TAU = Math.PI * 2;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const FLAP_LIFT = [1, 1.25, 1.5, 1.8];
  const FLAP_DRAG = [0, 0.012, 0.028, 0.055];
  const KT = 1.943844, FT = 3.28084;
  const TS = [1, 4, 16, 60, 240];                    // Zeitraffer-Stufen
  const core = AE.FlightCore = { G, KT, FT, TS, FLAP_LIFT };

  core.sigma = alt => Math.exp(-Math.max(0, alt) / 9000);

  /* ---------- Start ---------- */
  core.create = function (plan) {
    const m = plan.model, sp = m.sim;
    const load = plan.fin.pax / m.seats;
    const vs1 = sp.vs * (0.94 + 0.1 * load);
    const D = plan.dist * 1000;
    const cruiseAlt = Math.round(clamp(Math.min(sp.alt, plan.dist * 24), 1500, sp.alt) / 100) * 100;
    const sigC = core.sigma(cruiseAlt);
    const tasCruise = m.cruise / 3.6;
    const eas = Math.min(tasCruise * Math.sqrt(sigC), 2.15 * vs1);
    const P = {
      vs1, twr: sp.twr, cruiseAlt, eas, len: sp.len, cls: m.cls,
      vr: vs1 * 1.03, vref: vs1 * 1.12,
      todDist: (cruiseAlt - 1200) / 0.0524 + 26000,
      homeLen: plan.homeRwy, destLen: plan.destRwy,
    };
    const s = {
      plan, P, t: 0, x: 0, alt: 0, v: 0, gamma: 0, pitch: 0, thr: 0, flaps: 1, gear: true,
      onGround: true, phase: 'takeoff', ap: { on: false, app: false, alt: cruiseAlt }, ts: 1,
      msgs: [], flags: {}, touch: null, result: null, gmax: 1, gmin: 1, turb: 0, turbLeft: 0,
      xd: D, dEnd: D + plan.destRwy, warn: '', stallWarn: false, rejected: false, tail: false, cruiseTime: 0,
      aimAlt: 0,
    };
    core.say(s, 'Tower: Startfreigabe Piste 09. Schub setzen, Klappen 2, bei Vr rotieren.', 'tower');
    return s;
  };

  core.say = function (s, text, kind) {
    s.msgs.push({ t: s.t, text, kind: kind || 'info' });
    if (s.msgs.length > 6) s.msgs.shift();
    if (core.onMsg) core.onMsg(text, kind || 'info');
  };
  const once = (s, key, text, kind) => { if (!s.flags[key]) { s.flags[key] = 1; core.say(s, text, kind); } };

  /* ---------- Aerodynamik ---------- */
  function aero(s, alpha, v) {
    const P = s.P, sig = core.sigma(s.alt);
    const alpha0 = -0.03 - 0.035 * s.flaps, aStall = 0.30 - 0.01 * s.flaps;
    let cl = (alpha - alpha0) / (aStall - alpha0);
    let stalled = false;
    if (alpha > aStall) { cl = Math.max(0.35, 1 - (alpha - aStall) * 5); stalled = true; }
    cl = Math.max(-0.6, cl);
    const clmax = FLAP_LIFT[s.flaps];
    const q = sig * (v / P.vs1) * (v / P.vs1);
    const CL = cl * clmax * 1.4;
    const cd = 0.022 + FLAP_DRAG[s.flaps] + (s.gear ? 0.02 : 0) + 0.04 * CL * CL + (stalled ? 0.06 : 0);
    return {
      lift: G * q * cl * clmax, drag: G * q * cd / 1.4, stalled, cl, alpha0, aStall, q, clmax,
      sig, alphaCrit: aStall,
    };
  }
  core.aero = aero;
  core.thrustAcc = (s, thr) => G * s.P.twr * thr * Math.pow(core.sigma(s.alt), 0.8);

  /* ---------- Autopilot ---------- */
  function autopilot(s, dt) {
    const P = s.P, ap = s.ap, sig = core.sigma(s.alt);
    const tas = Math.max(40, s.v);
    // Zielgeschwindigkeit (EAS) je nach Höhe/Phase
    let eas = P.eas;
    if (s.alt < 3050) eas = Math.min(eas, 1.55 * P.vs1 + 0.3 * P.vs1 * (s.alt / 3050));
    const rem = s.xd - s.x;
    if (rem < 35000) eas = Math.min(eas, 1.3 * P.vs1);
    if (s.flaps >= 2) eas = Math.min(eas, P.vref + 8);
    if (ap.app) eas = Math.min(eas, s.flaps >= 3 ? P.vref + 2 : P.vref + 8);
    ap.easTarget = eas;
    const tasT = eas / Math.sqrt(sig);
    // vertikal
    const err = ap.alt - s.alt;
    const climbLim = 14 * Math.pow(sig, 0.5), descLim = -12;
    let vsDes = clamp(err * 0.07, descLim, climbLim);
    if (ap.app) vsDes = clamp(-tas * Math.sin(0.0524) + (core.glideAlt(s, s.x) - s.alt) * 0.05, -9, 4);
    // bei zu niedriger Geschwindigkeit das Steigen begrenzen
    if (s.v < tasT - 12) vsDes = Math.min(vsDes, 2);
    const gammaDes = Math.asin(clamp(vsDes / tas, -0.25, 0.25));
    const a = aero(s, 0, tas);
    const clNeed = clamp(Math.cos(gammaDes) / (a.q * a.clmax), 0.02, 0.97);
    const alphaNeed = a.alpha0 + clNeed * (a.aStall - a.alpha0);
    const pitchDes = gammaDes + alphaNeed;
    s.pitch += clamp(pitchDes - s.pitch, -0.05 * dt, 0.05 * dt);
    s.pitchDes = pitchDes;
    // Schub
    const dragA = a.drag, sinG = Math.sin(s.gamma);
    const avail = G * P.twr * Math.pow(sig, 0.8);
    const trim = (dragA + G * sinG) / avail;
    const want = clamp(trim + (tasT - s.v) * 0.035, 0.02, 1);
    s.thr += clamp(want - s.thr, -0.25 * dt, 0.25 * dt);
  }

  /* ---------- ein Zeitschritt ---------- */
  core.step = function (s, inp, dt) {
    if (s.result) return;
    const P = s.P;
    s.t += dt;
    const sig = core.sigma(s.alt);
    const eas = s.v * Math.sqrt(sig);

    // Schub
    if (inp.thrUp) s.thr = Math.min(1, s.thr + 0.4 * dt);
    if (inp.thrDown) s.thr = Math.max(0, s.thr - 0.4 * dt);
    if (inp.thrFull) s.thr = 1;
    if (inp.thrIdle) s.thr = 0;

    // Klappen & Fahrwerk (Geschwindigkeitsgrenzen)
    if (s.flaps > 0 && eas > P.vs1 * [9, 1.9, 1.65, 1.45][s.flaps]) {
      s.flaps--; core.say(s, 'Klappen automatisch eingefahren – zu schnell!', 'warn');
    }
    if (s.gear && !s.onGround && eas > P.vs1 * 2.1) { /* Fahrwerk darf ausgefahren bleiben, erhöht nur den Widerstand */ }
    if (s.onGround && !s.gear) { s.gear = true; }

    // Nicken
    if ((s.ap.on || s.ap.app) && !s.onGround) autopilot(s, dt);
    else {
      const rate = 0.1;                    // rad/s
      if (inp.pitchUp) s.pitch += rate * dt;
      if (inp.pitchDown) s.pitch -= rate * dt;
    }
    s.pitch = clamp(s.pitch, -0.35, 0.42);

    // Turbulenz
    let gust = 0;
    if (s.turbLeft > 0) { s.turbLeft -= dt; gust = (Math.random() - 0.5) * 2 * s.turb; if (s.turbLeft <= 0) core.say(s, 'Turbulenzen vorbei.', 'info'); }

    if (s.onGround) groundStep(s, inp, dt, eas);
    else airStep(s, inp, dt, gust);

    // Warnungen / Hinweise
    s.stallWarn = !s.onGround && s.lastStall;
    track(s, dt, inp);
  };

  function groundStep(s, inp, dt, eas) {
    const P = s.P;
    // Rotation erst ab Geschwindigkeit
    const lock = s.v < 0.8 * P.vs1;
    if (lock && s.pitch > 0.01) s.pitch = Math.max(0.0, s.pitch - 0.2 * dt);
    if (s.pitch < 0 && s.v < 5) s.pitch = 0;
    // Nase senkt sich nach der Landung von allein
    if (s.touch && !inp.pitchUp && s.pitch > 0.0) s.pitch = Math.max(0, s.pitch - 0.045 * dt);
    if (s.pitch > 0.21 && !s.tail) { s.tail = true; core.say(s, 'Heckaufsetzer! Nase zu hoch.', 'warn'); }
    const a = aero(s, s.pitch, Math.max(s.v, 0.1));
    const thrust = core.thrustAcc(s, s.thr);
    const rolling = s.v > 0.2 ? 0.02 * G : 0;
    const braking = inp.brake && s.v > 0.2 ? 3.4 + (s.v > 20 ? 0.9 : 0) : 0;
    s.v = Math.max(0, s.v + (thrust - a.drag - rolling - braking) * dt);
    s.x += s.v * dt;
    s.gamma = 0; s.alt = 0;
    if (a.lift > G * 1.0 && s.v > 0.8 * P.vs1 && s.pitch > 0.05) {
      s.onGround = false; s.gamma = 0.002;
      if (s.phase === 'takeoff') core.say(s, 'Abgehoben! Fahrwerk einfahren.', 'good');
    }
  }

  function airStep(s, inp, dt, gust) {
    const P = s.P;
    const v = Math.max(s.v, 18);
    const alpha = s.pitch - s.gamma;
    const a = aero(s, alpha, v);
    s.lastStall = a.stalled;
    const thrust = core.thrustAcc(s, s.thr);
    const vdot = thrust - a.drag - G * Math.sin(s.gamma);
    const gdot = (a.lift - G * Math.cos(s.gamma)) / v + gust * 0.012;
    s.v = Math.max(15, s.v + vdot * dt);
    s.gamma = clamp(s.gamma + gdot * dt, -0.7, 0.7);
    s.x += s.v * Math.cos(s.gamma) * dt;
    const prevVz = s.v * Math.sin(s.gamma);
    s.alt += prevVz * dt;
    s.vz = prevVz;
    const gl = a.lift / G;
    if (!s.ap.on || true) { s.gmax = Math.max(s.gmax, gl + gust * 0.03); s.gmin = Math.min(s.gmin, gl + gust * 0.03); }
    s.g = gl;
    if (s.alt <= 0) touchdown(s, prevVz);
  }

  /* ---------- Aufsetzen ---------- */
  function touchdown(s, vz) {
    const P = s.P, vsT = Math.max(0, -vz);
    s.alt = 0;
    const onHome = s.x <= P.homeLen + 50;
    const onDest = s.x >= s.xd - 40 && s.x <= s.dEnd;
    if (s.phase === 'takeoff' || s.phase === 'climb' || (!onDest && onHome)) {
      // Zurück auf der Startbahn
      if (vsT > 5.5 || !onHome) { return crash(s, vsT > 5.5 ? 'Zu harter Aufprall nach dem Start.' : 'Aufprall außerhalb der Piste.'); }
      s.onGround = true; s.gamma = 0; s.rejected = true;
      core.say(s, 'Wieder auf der Piste aufgesetzt.', 'warn');
      return;
    }
    if (!s.gear) return crash(s, 'Landung ohne Fahrwerk!');
    if (!onDest) return crash(s, s.x < s.xd - 40 ? 'Zu kurz gelandet – vor der Piste aufgeschlagen.' : 'Hinter der Piste aufgeschlagen.');
    // Bewertung
    let grade = vsT <= 1.4 ? 'perfect' : vsT <= 2.4 ? 'good' : vsT <= 3.8 ? 'firm' : vsT <= 5.5 ? 'hard' : 'crash';
    const order = ['perfect', 'good', 'firm', 'hard', 'crash'];
    const worse = n => { grade = order[Math.min(3, order.indexOf(grade) + n)]; };
    const notes = [];
    const frac = (s.x - s.xd) / P.destLen;
    if (grade === 'crash') return crash(s, 'Aufprall zu hart (' + Math.round(vsT * 196.85) + ' ft/min).');
    if (frac > 0.8) { worse(2); notes.push('Sehr spät aufgesetzt'); } else if (frac > 0.55) { worse(1); notes.push('Spät aufgesetzt'); }
    if (s.pitch < -0.04) { worse(1); notes.push('Bugrad zuerst'); }
    if (s.tail || s.pitch > 0.21) { worse(1); notes.push('Heckaufsetzer'); }
    if (s.v * Math.sqrt(core.sigma(0)) > P.vs1 * 1.5) { worse(1); notes.push('Zu schnell'); }
    s.touch = { vs: vsT, x: s.x, frac, v: s.v, pitch: s.pitch, grade, notes };
    s.onGround = true; s.gamma = 0; s.phase = 'landing';
    s.ap.on = false; s.ap.app = false;
    core.say(s, 'Aufgesetzt: ' + Math.round(vsT * 196.85) + ' ft/min. Bremsen mit B!', grade === 'hard' ? 'warn' : 'good');
  }
  function crash(s, why) {
    s.result = { grade: 'crash', why, stats: stats(s) };
    core.say(s, why, 'bad');
  }
  function stats(s) {
    return { gmax: s.gmax, gmin: s.gmin, touch: s.touch, time: s.t };
  }

  /* ---------- Verfolgung: Phasen, Hinweise, Ende ---------- */
  function track(s, dt, inp) {
    const P = s.P, rem = s.xd - s.x;
    const kt = s.v * Math.sqrt(core.sigma(s.alt)) * KT;
    // Startphase
    if (s.phase === 'takeoff') {
      if (s.onGround) {
        if (s.v > P.vr && !s.flags.rot) { s.flags.rot = 1; core.say(s, 'ROTATE! Nase auf ca. 9° ziehen.', 'tower'); }
        if (s.x > P.homeLen + 15) crash(s, 'Über das Pistenende hinausgeschossen!');
      } else if (s.alt > 120) { s.phase = 'climb'; core.say(s, 'Tower: Weiter steigen. Autopilot mit P, Reiseflughöhe mit C.', 'tower'); }
    }
    if (!s.onGround && s.alt > 25 && s.gear && s.phase === 'climb') once(s, 'gearup', 'Fahrwerk einfahren (G).', 'tip');
    if (s.phase === 'climb' && s.alt > 600 && s.flaps > 0 && s.ap.on) once(s, 'flapsup', 'Klappen einfahren (V).', 'tip');
    if (s.phase === 'climb' && s.alt >= P.cruiseAlt - 150 && rem > P.todDist) { s.phase = 'cruise'; core.say(s, 'Reiseflughöhe erreicht. Zeitraffer mit T möglich.', 'good'); }
    if ((s.phase === 'cruise' || s.phase === 'climb') && rem < P.todDist) {
      s.phase = 'descent';
      core.say(s, 'Tower: Sinkflug einleiten auf 4.000 ft. Zeitraffer wird beendet.', 'tower');
      if (s.ap.on) s.ap.alt = 1200;
      if (s.ts > 4) s.ts = 1;
    }
    if (s.phase === 'descent' && rem < 45000) { s.phase = 'approach'; core.say(s, 'Anflug Piste 09 – Gleitpfad 3°. Klappen & Fahrwerk setzen!', 'tower'); }
    if (s.phase === 'approach') {
      if (rem < 30000 && s.ts > 1) s.ts = 1;
      if (rem < 16000 && s.flaps < 1) { s.flaps = 1; }
      if (rem < 12000) once(s, 'gear', 'Fahrwerk ausfahren (G), Klappen 3 (F).', 'tip');
      if (s.ap.on && (rem < 9000 || s.alt < 350)) { s.ap.on = false; core.say(s, 'Autopilot getrennt – manuell landen!', 'warn'); }
    }
    if (s.phase === 'descent' || s.phase === 'approach') s.ts = Math.min(s.ts, rem < 80000 ? 1 : 2);
    if (s.ap.app && !s.onGround) {
      const lim = [9, 1.9, 1.65, 1.45];
      const want = rem < 11000 ? 3 : rem < 14000 ? 2 : rem < 18000 ? 1 : s.flaps;
      if (s.flaps < want && s.v * Math.sqrt(core.sigma(s.alt)) < P.vs1 * lim[s.flaps + 1] - 3) s.flaps++;
      if (rem < 11000 && !s.gear) { s.gear = true; core.say(s, 'Anflug-Assistent: Fahrwerk ausgefahren.', 'info'); }
      if (s.alt < 45) { s.ap.app = false; core.say(s, 'Assistent getrennt – jetzt abfangen (Nase leicht heben, Schub raus)!', 'warn'); }
    }
    // Landung beendet?
    if (s.phase === 'landing' && s.onGround && !s.result) {
      if (s.x > s.dEnd + 8 && s.v > 5) return crash(s, 'Über das Pistenende hinaus – Überrollt!');
      if (s.v < 2.5) {
        const t = s.touch;
        let grade = t.grade;
        if (s.x > s.dEnd) { grade = 'hard'; t.notes.push('Pistenende überfahren'); }
        s.result = { grade, notes: t.notes, stats: stats(s), vs: t.vs };
        core.say(s, 'Flugzeug steht. Willkommen am Ziel!', 'good');
      }
    }
    // Überschwere Querbeschleunigung: Hinweise
    if (!s.onGround && s.g > 2.1) once(s, 'g', 'Hohe Beschleunigung! Passagiere unruhig.', 'warn');
    if (!s.onGround && s.lastStall && s.alt < 4000) once(s, 'stall' + Math.floor(s.t / 20), 'ACHTUNG: Strömungsabriss! Nase senken, Schub erhöhen.', 'bad');
    // Turbulenzen
    if (!s.onGround && s.alt > 800 && s.ts <= 4 && s.turbLeft <= 0 && Math.random() < dt / 150) {
      s.turb = 1 + Math.random() * 2.2; s.turbLeft = 8 + Math.random() * 14;
      core.say(s, 'Turbulenzen! Anschnallen – gleichmäßig fliegen.', 'warn');
    }
  }

  /* ---------- Zeitraffer im Reiseflug (ohne Physik) ---------- */
  core.canCompress = s => s.ap.on && s.phase === 'cruise' && !s.onGround && Math.abs(s.alt - s.ap.alt) < 80 && Math.abs(s.vz || 0) < 1.5 && s.turbLeft <= 0;
  core.advance = function (s, inp, realDt) {
    if (s.result) return;
    let ts = s.ts;
    if (ts > 16 && !core.canCompress(s)) ts = 16;
    let sim = realDt * ts;
    if (ts > 16) {
      // analytisch fliegen
      const sig = core.sigma(s.alt), tas = s.P.eas / Math.sqrt(sig);
      const maxT = Math.max(0, (s.xd - s.P.todDist - 3000 - s.x) / tas);
      const dt = Math.min(sim, maxT);
      s.x += tas * dt; s.t += dt; s.v = tas; s.cruiseTime += dt;
      if (sim > dt) { s.ts = 4; core.step(s, inp, 0.02); }
      return;
    }
    const n = Math.max(1, Math.ceil(sim / (1 / 30)));
    const h = sim / n;
    for (let i = 0; i < n && !s.result; i++) core.step(s, inp, h);
  };

  /* ---------- Hilfen für Anzeigen ---------- */
  core.hud = function (s) {
    const sig = core.sigma(s.alt);
    return {
      kt: s.v * Math.sqrt(sig) * KT, ft: s.alt * FT, fpm: (s.vz || 0) * FT * 60,
      rem: Math.max(0, s.xd - s.x), pitchDeg: s.pitch * 180 / Math.PI,
    };
  };
  core.glideAlt = (s, x) => (s.xd - x) * Math.tan(3 * Math.PI / 180) + 15;
  if (typeof module !== 'undefined') module.exports = core;
})(window.AE = window.AE || {});
