/* Airport Empire – Flugsimulator: Darstellung, Cockpit-Anzeigen und Steuerung */
(function (AE) {
  'use strict';
  const core = AE.FlightCore, KT = core.KT, FT = core.FT, FLAP_LIFT = core.FLAP_LIFT;
  const W = 1040, H = 624;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const Sim = AE.Sim = {};
  let root, cv, g, ov, s = null, plan = null, cb = null, running = false, last = 0, paused = false;
  let inp = {}, holds = {}, assist = false, finished = false, built = false, time = 0, lastEng = 0, started = false;

  const hash = n => { const x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };
  const mix = (c1, c2, t) => '#' + [0, 2, 4].map(i => Math.round(lerp(parseInt(c1.substr(1 + i, 2), 16), parseInt(c2.substr(1 + i, 2), 16), t)).toString(16).padStart(2, '0')).join('');
  const fmt = AE.fmt;

  /* ---------------- DOM ---------------- */
  function build() {
    if (built) return;
    built = true;
    root = document.createElement('div');
    root.className = 'sim'; root.hidden = true;
    root.innerHTML = `
      <div class="sim-wrap">
        <canvas width="${W}" height="${H}"></canvas>
        <div class="sim-ov" hidden></div>
      </div>
      <div class="sim-bar">
        <div class="grp"><span>Nase</span><button data-hold="pitchUp">▲</button><button data-hold="pitchDown">▼</button></div>
        <div class="grp"><span>Schub</span><button data-hold="thrDown">−</button><button data-hold="thrUp">+</button><button data-act="thrFull">Voll</button><button data-act="thrIdle">Leer</button></div>
        <div class="grp"><span>Konfig</span><button data-act="flapsUp">Klappen −</button><button data-act="flapsDown">Klappen +</button><button data-act="gear">Fahrwerk</button><button data-hold="brake">Bremse</button></div>
        <div class="grp"><span>Autopilot</span><button data-act="ap" class="ap">AP</button><button data-act="altDown">Höhe −</button><button data-act="altUp">Höhe +</button><button data-act="cruise">Reiseflug</button><button data-act="descend">Sinkflug</button><button data-act="app">Anflug-Hilfe</button></div>
        <div class="grp"><span>Flug</span><button data-act="time">Zeit ×1</button><button data-act="pause">Pause</button><button data-act="abort">Abbruch</button></div>
      </div>`;
    document.body.appendChild(root);
    cv = root.querySelector('canvas'); g = cv.getContext('2d'); ov = root.querySelector('.sim-ov');
    root.querySelectorAll('[data-hold]').forEach(b => {
      const k = b.dataset.hold;
      b.addEventListener('pointerdown', e => { e.preventDefault(); holds[k] = true; b.classList.add('on'); });
      ['pointerup', 'pointerleave', 'pointercancel'].forEach(ev => b.addEventListener(ev, () => { holds[k] = false; b.classList.remove('on'); }));
    });
    root.querySelectorAll('[data-act]').forEach(b => b.addEventListener('click', () => { act(b.dataset.act); b.blur(); }));
    window.addEventListener('keydown', onKey);
    window.addEventListener('keyup', onKeyUp);
  }

  const KEYS = { ArrowUp: 'pitchUp', ArrowDown: 'pitchDown', KeyW: 'thrUp', KeyS: 'thrDown', KeyB: 'brake' };
  function onKey(e) {
    if (!running || root.hidden) return;
    if (e.target && /INPUT|SELECT|TEXTAREA/.test(e.target.tagName)) return;
    const k = KEYS[e.code];
    if (['ArrowUp', 'ArrowDown', 'Space'].includes(e.code)) e.preventDefault();
    if (k) { holds[k] = true; return; }
    if (e.repeat) return;
    const map = { KeyX: 'thrFull', KeyZ: 'thrIdle', KeyF: 'flapsDown', KeyV: 'flapsUp', KeyG: 'gear', KeyP: 'ap', KeyC: 'cruise', KeyD: 'descend', KeyA: 'app', KeyT: 'time', Space: 'pause', Escape: 'abort', BracketLeft: 'altDown', BracketRight: 'altUp', Slash: 'altDown', Minus: 'altDown', Equal: 'altUp' };
    if (map[e.code]) act(map[e.code]);
  }
  function onKeyUp(e) { const k = KEYS[e.code]; if (k) holds[k] = false; }

  /* ---------------- Aktionen ---------------- */
  function act(a) {
    if (!s || s.result || !started) return;
    if (paused && a !== 'pause' && a !== 'abort') return;
    const P = s.P, eas = s.v * Math.sqrt(core.sigma(s.alt));
    switch (a) {
      case 'thrFull': s.thr = 1; AE.Audio.play('click'); break;
      case 'thrIdle': s.thr = 0; AE.Audio.play('click'); break;
      case 'flapsDown': {
        if (s.flaps >= 3) return;
        if (eas > P.vs1 * [9, 1.9, 1.65, 1.45][s.flaps + 1]) { core.say(s, 'Zu schnell für die nächste Klappenstufe!', 'warn'); AE.Audio.play('warn'); return; }
        s.flaps++; AE.Audio.play('click'); break;
      }
      case 'flapsUp': if (s.flaps > 0) { s.flaps--; AE.Audio.play('click'); } break;
      case 'gear':
        if (s.onGround) { core.say(s, 'Fahrwerk bleibt am Boden ausgefahren.', 'warn'); break; }
        if (eas > P.vs1 * 2.1) { core.say(s, 'Zu schnell zum Ein-/Ausfahren des Fahrwerks!', 'warn'); AE.Audio.play('warn'); break; }
        s.gear = !s.gear; AE.Audio.play('click'); break;
      case 'ap':
        if (s.onGround) { core.say(s, 'Autopilot erst nach dem Abheben.', 'warn'); break; }
        s.ap.on = !s.ap.on; if (s.ap.on) s.ap.app = false;
        if (s.ap.on && s.alt < 150) s.ap.alt = P.cruiseAlt;
        core.say(s, s.ap.on ? 'Autopilot ein – Zielhöhe ' + fmt(s.ap.alt * FT) + ' ft.' : 'Autopilot aus – du fliegst.', 'info'); break;
      case 'cruise': if (!s.onGround) { s.ap.alt = P.cruiseAlt; s.ap.on = true; s.ap.app = false; core.say(s, 'Autopilot: Steigflug auf ' + fmt(P.cruiseAlt * FT) + ' ft.', 'info'); } break;
      case 'descend': if (!s.onGround) { s.ap.alt = 1200; s.ap.on = true; s.ap.app = false; core.say(s, 'Autopilot: Sinkflug auf 3.900 ft.', 'info'); } break;
      case 'altUp': s.ap.alt = clamp(s.ap.alt + 305, 300, P.cruiseAlt + 1500); break;
      case 'altDown': s.ap.alt = clamp(s.ap.alt - 305, 300, P.cruiseAlt + 1500); break;
      case 'app':
        if (s.onGround) break;
        if (s.xd - s.x > 60000) { core.say(s, 'Anflug-Hilfe erst ab 60 km vor dem Ziel.', 'warn'); break; }
        s.ap.app = !s.ap.app; if (s.ap.app) { s.ap.on = false; plan.assisted = true; }
        core.say(s, s.ap.app ? 'Anflug-Hilfe aktiv: folgt dem Gleitpfad. Erlös −15 %.' : 'Anflug-Hilfe aus.', 'info'); break;
      case 'time': {
        const i = core.TS.indexOf(s.ts);
        let n = (i + 1) % core.TS.length;
        if (s.onGround || s.alt < 300) n = 0;
        else if (core.TS[n] > 16 && !core.canCompress(s)) {
          if (!s.ap.on) core.say(s, 'Für höheren Zeitraffer: Autopilot einschalten und Reiseflughöhe halten.', 'tip');
          n = 0;
        }
        if (s.phase === 'descent' || s.phase === 'approach') n = Math.min(n, 1);
        s.ts = core.TS[n]; break;
      }
      case 'pause': paused = !paused; paused ? showOv(`<h2>Pause</h2><p>Der Flug ist angehalten.</p><div class="row"><button class="btn primary" data-go="resume">Weiterfliegen</button></div>`) : hideOv(); break;
      case 'abort':
        if (!paused) paused = true;
        showOv(`<h2>Flug abbrechen?</h2><p>Der Flug zählt nicht, und dein Ruf leidet leicht. Das Flugzeug bleibt heil.</p><div class="row"><button class="btn primary" data-go="resume">Weiterfliegen</button><button class="btn danger" data-go="abort">Abbrechen</button></div>`);
        break;
    }
  }

  function showOv(html) {
    ov.innerHTML = '<div class="card">' + html + '</div>'; ov.hidden = false;
    ov.querySelectorAll('[data-go]').forEach(b => b.addEventListener('click', () => {
      const go = b.dataset.go;
      if (go === 'resume') { paused = false; hideOv(); }
      else if (go === 'start') { startFlight(); }
      else if (go === 'back') { close(); cb && cb(null); }
      else if (go === 'abort') { close(); cb && cb({ grade: 'abort' }); }
      else if (go === 'done') { const r = s.result; close(); cb && cb(Object.assign({ assisted: !!plan.assisted }, r)); }
    }));
    const chk = ov.querySelector('#assistChk');
    if (chk) chk.addEventListener('change', () => { assist = chk.checked; });
  }
  function hideOv() { ov.hidden = true; ov.innerHTML = ''; }
  function close() {
    running = false; root.hidden = true; paused = false; hideOv();
    AE.Audio.engineStop();
    document.body.classList.remove('flying');
  }

  /* ---------------- Start ---------------- */
  Sim.open = function (p, callback) {
    build();
    plan = p; cb = callback; assist = false; finished = false; paused = true; started = false; holds = {};
    const st = core.create(p); s = st;
    root.hidden = false; running = true; document.body.classList.add('flying');
    const P = st.P, m = p.model;
    const kt = v => Math.round(v * KT);
    showOv(`
      <div class="eyebrow">Flugplanung</div>
      <h2>${AE.CITY[p.home].name} → ${p.dest.name}</h2>
      <div class="facts">
        <div><b>${fmt(p.dist)} km</b><span>Strecke</span></div>
        <div><b>${m.name}</b><span>${m.type}</span></div>
        <div><b>${p.fin.pax} / ${m.seats}</b><span>Passagiere</span></div>
        <div><b>${AE.money(p.fin.rev)}</b><span>Ticketerlös (Basis)</span></div>
        <div><b>${fmt(p.homeRwy)} m</b><span>Startpiste</span></div>
        <div><b>${fmt(p.destRwy)} m</b><span>Landepiste ${p.dest.name}</span></div>
        <div><b>${kt(P.vr)} kt</b><span>Rotationsgeschw. Vr</span></div>
        <div><b>${kt(P.vref)} kt</b><span>Anfluggeschw. Vref</span></div>
      </div>
      <p class="hint"><b>Start:</b> Klappen mit <kbd>F</kbd> auf Stufe 2 · Vollschub <kbd>X</kbd> · bei Vr mit <kbd>↑</kbd> die Nase auf ca. 9° · dann Fahrwerk <kbd>G</kbd> rein.<br>
      <b>Reiseflug:</b> <kbd>P</kbd> Autopilot, <kbd>C</kbd> Reiseflughöhe, <kbd>T</kbd> Zeitraffer. <b>Landung:</b> 3°-Gleitpfad folgen, Fahrwerk <kbd>G</kbd>, Klappen 3, kurz vor dem Boden abfangen, <kbd>B</kbd> bremst.</p>
      <p class="hint"><kbd>↑</kbd><kbd>↓</kbd> Nase · <kbd>W</kbd><kbd>S</kbd> Schub · <kbd>X</kbd> Voll · <kbd>Z</kbd> Leerlauf · <kbd>F</kbd>/<kbd>V</kbd> Klappen · <kbd>G</kbd> Fahrwerk · <kbd>B</kbd> Bremse · <kbd>P</kbd> AP · <kbd>[</kbd><kbd>]</kbd> Zielhöhe · <kbd>A</kbd> Anflug-Hilfe · <kbd>Leertaste</kbd> Pause</p>
      <label class="chk"><input type="checkbox" id="assistChk"> Anflug-Hilfe von Anfang an erlauben (−15 % Erlös)</label>
      <div class="row"><button class="btn" data-go="back">Zurück</button><button class="btn primary" data-go="start">Abflug starten ✈</button></div>`);
    last = performance.now();
    requestAnimationFrame(frame);
  };
  function startFlight() {
    hideOv(); paused = false; started = true;
    plan.assisted = assist;
    s.flaps = 1;
    core.say(s, 'Tower: Startfreigabe Piste 09. Klappen 2, Vollschub (X), bei Vr rotieren.', 'tower');
  }

  /* ---------------- Hauptschleife ---------------- */
  function frame(ts) {
    if (!running) return;
    const dt = Math.min(0.05, (ts - last) / 1000 || 0); last = ts; time += dt;
    inp = Object.assign({}, holds);
    if (s && !paused && !s.result) {
      core.advance(s, inp, dt);
      if (time - lastEng > 0.15) { lastEng = time; AE.Audio.engine(s.thr, clamp(s.v / 250, 0, 1)); }
    }
    if (s && s.result && !finished) finish();
    syncButtons();
    draw();
    requestAnimationFrame(frame);
  }
  function syncButtons() {
    if (!s) return;
    const t = root.querySelector('[data-act=time]'), ap = root.querySelector('[data-act=ap]'), app = root.querySelector('[data-act=app]');
    t.textContent = 'Zeit ×' + s.ts; ap.classList.toggle('on', s.ap.on); app.classList.toggle('on', s.ap.app);
  }
  function finish() {
    finished = true;
    const r = s.result;
    AE.Audio.engineStop();
    if (r.grade === 'crash') {
      AE.Audio.play('crash');
      showOv(`<div class="eyebrow bad">Absturz</div><h2>Das war leider nichts</h2><p>${r.why}</p><p>Das Flugzeug ist verloren. Die Versicherung ersetzt die Hälfte des Neuwerts.</p><div class="row"><button class="btn primary" data-go="done">Weiter</button></div>`);
    } else {
      AE.Audio.play(r.grade === 'hard' ? 'bad' : 'good');
      const t = r.stats.touch, lbl = AE.GRADE[r.grade].label;
      showOv(`<div class="eyebrow">Gelandet in ${plan.dest.name}</div><h2>${lbl}</h2>
        <div class="facts"><div><b>${Math.round(t.vs * 196.85)} ft/min</b><span>Sinkrate beim Aufsetzen</span></div>
        <div><b>${Math.round(t.frac * 100)} %</b><span>Aufsetzpunkt auf der Piste</span></div>
        <div><b>${r.stats.gmax.toFixed(2)} g</b><span>Max. Belastung</span></div>
        <div><b>${Math.round(r.stats.time / 60)} min</b><span>Flugzeit (Simulation)</span></div></div>
        ${r.notes && r.notes.length ? '<p class="hint">' + r.notes.join(' · ') + '</p>' : ''}
        <div class="row"><button class="btn primary" data-go="done">Zur Abrechnung</button></div>`);
    }
  }

  /* ---------------- Zeichnen ---------------- */
  function draw() {
    if (!s) return;
    const hud = core.hud(s);
    const sc = 0.55 / (1 + s.alt / 2500);
    const px = W * 0.34;
    const py = Math.max(H * 0.42, H * 0.74 - s.alt * sc);
    const gy = py + s.alt * sc;
    const sx = wx => px + (wx - s.x) * sc;
    const f = clamp(s.alt / 12000, 0, 1);

    // Himmel
    const sky = g.createLinearGradient(0, 0, 0, H);
    sky.addColorStop(0, mix('#2f86df', '#0b2b66', f));
    sky.addColorStop(0.75, mix('#a9d8ff', '#5f9fe0', f));
    sky.addColorStop(1, mix('#d3ecff', '#8fbdf0', f));
    g.fillStyle = sky; g.fillRect(0, 0, W, H);
    // Sonne
    g.fillStyle = 'rgba(255,248,210,.9)'; g.beginPath(); g.arc(W * 0.82, 90 + f * 30, 26, 0, Math.PI * 2); g.fill();
    g.fillStyle = 'rgba(255,248,210,.18)'; g.beginPath(); g.arc(W * 0.82, 90 + f * 30, 60, 0, Math.PI * 2); g.fill();

    drawClouds(sc, px, py);
    drawGround(sc, px, gy, sx);
    drawAirport(sx, gy, sc, 0, s.P.homeLen, true);
    drawAirport(sx, gy, sc, s.xd, s.P.destLen, false);
    if (s.xd - s.x < 45000 && s.phase !== 'landing') drawGlide(sx, gy, sc);
    drawPlane(px, py, sc);
    drawHud(hud);
  }

  function drawClouds(sc, px, py) {
    const cell = Math.max(2400, 70 / sc);
    const a = s.x - px / sc - cell, b = s.x + (W - px) / sc + cell;
    for (let i = Math.floor(a / cell); i <= Math.floor(b / cell); i++) {
      if (hash(i) < 0.5) continue;
      const calt = 500 + hash(i + 11) * 7000, size = cell * (0.25 + hash(i + 5) * 0.45);
      const cx = (i + hash(i + 3)) * cell, cy = py + (s.alt - calt) * sc;
      const r = size * sc * 0.28;
      if (cy < -r * 3 || cy > H + r * 3) continue;
      const sxp = px + (cx - s.x) * sc;
      g.fillStyle = 'rgba(255,255,255,0.82)';
      for (let k = 0; k < 5; k++) {
        g.beginPath(); g.ellipse(sxp + (k - 2) * r * 0.9, cy + Math.sin(k * 1.7) * r * 0.25, r * (1.1 - Math.abs(k - 2) * 0.2), r * 0.7, 0, 0, Math.PI * 2); g.fill();
      }
      g.fillStyle = 'rgba(170,200,230,.35)';
      g.beginPath(); g.ellipse(sxp, cy + r * 0.45, r * 2.2, r * 0.22, 0, 0, Math.PI * 2); g.fill();
    }
  }

  function drawGround(sc, px, gy, sx) {
    if (gy > H + 40) return;
    // ferne Hügel
    const f = clamp(s.alt / 12000, 0, 1);
    g.fillStyle = mix('#7fa6a0', '#8fb3c8', f);
    g.beginPath(); g.moveTo(0, gy);
    for (let x = 0; x <= W; x += 20) {
      const wx = s.x + (x - px) / sc;
      const hgt = 220 + 160 * Math.sin(wx * 0.00031) + 90 * Math.sin(wx * 0.0011 + 2);
      g.lineTo(x, gy - Math.max(0, hgt) * sc * 0.55);
    }
    g.lineTo(W, gy); g.closePath(); g.fill();
    // Wiese
    const gr = g.createLinearGradient(0, gy, 0, Math.min(H, gy + 260));
    gr.addColorStop(0, '#5f9d55'); gr.addColorStop(1, '#3b7a3b');
    g.fillStyle = gr; g.fillRect(0, gy, W, H - gy + 2);
    // Felder
    const fw = 700;
    if (fw * sc > 8) {
      for (let i = Math.floor((s.x - px / sc) / fw); i <= Math.floor((s.x + (W - px) / sc) / fw); i++) {
        if (hash(i + 99) < 0.4) continue;
        g.fillStyle = i % 2 ? 'rgba(210,190,90,.16)' : 'rgba(40,110,50,.18)';
        g.fillRect(sx(i * fw), gy, fw * sc, H - gy);
      }
    }
    // Bäume
    if (sc > 0.18) {
      for (let wx = Math.floor((s.x - px / sc) / 120) * 120; wx < s.x + (W - px) / sc; wx += 120) {
        if (hash(wx) < 0.45) continue;
        const h = (10 + hash(wx + 1) * 14) * sc;
        g.fillStyle = '#2d6a3a'; g.beginPath(); g.ellipse(sx(wx), gy - h * 0.5, h * 0.55, h * 0.6, 0, 0, Math.PI * 2); g.fill();
      }
    }
  }

  function drawAirport(sx, gy, sc, x0, len, home) {
    const a = sx(x0), b = sx(x0 + len);
    if (b < -300 || a > W + 300) return;
    // Gebäude / Skyline
    if (sc > 0.02) {
      if (home) {
        const bx = sx(500);
        g.fillStyle = '#c8ced6'; g.fillRect(bx, gy - 28 * sc, 260 * sc, 28 * sc);
        g.fillStyle = '#4b6b88'; g.fillRect(bx + 10 * sc, gy - 22 * sc, 240 * sc, 8 * sc);
        g.fillStyle = '#e1e4e8'; g.fillRect(sx(820), gy - 52 * sc, 16 * sc, 52 * sc); g.fillRect(sx(812), gy - 62 * sc, 32 * sc, 12 * sc);
      } else {
        for (let i = 0; i < 26; i++) {
          const wx = x0 + len * 0.15 + i * (len / 10) * 0.9 + hash(i + 7) * 120, hgt = (35 + hash(i + 3) * (50 + 160 * Math.min(1, plan.dest.pop / 12))) ;
          g.fillStyle = mix('#7d8da0', '#4c5d73', hash(i + 13));
          g.fillRect(sx(wx), gy - hgt * sc, (36 + hash(i) * 40) * sc, hgt * sc);
        }
        const bx = sx(x0 + len * 0.35);
        g.fillStyle = '#c8ced6'; g.fillRect(bx, gy - 26 * sc, 300 * sc, 26 * sc);
        g.fillStyle = '#4b6b88'; g.fillRect(bx + 10 * sc, gy - 20 * sc, 280 * sc, 8 * sc);
      }
    }
    // Piste
    const th = Math.max(3, 10 * sc);
    g.fillStyle = '#34383f'; g.fillRect(a - 40 * sc, gy - 1, b - a + 80 * sc, th);
    g.fillStyle = 'rgba(255,255,255,.85)';
    for (let wx = x0 + 60; wx < x0 + len - 90; wx += 90) g.fillRect(sx(wx), gy + th * 0.45, 45 * sc, Math.max(1, th * 0.12));
    for (let i = 0; i < 4; i++) g.fillRect(a + 6 * sc, gy + th * (0.12 + i * 0.2), 40 * sc, Math.max(1, th * 0.1));
    // Anflugbefeuerung am Ziel
    if (!home) {
      for (let k = 1; k <= 14; k++) {
        const on = (Math.floor(time * 6) + k) % 7 === 0;
        g.fillStyle = on ? '#fff7b0' : 'rgba(255,200,80,.85)';
        g.fillRect(sx(x0 - k * 60), gy - Math.max(2, 3 * sc), Math.max(2, 4 * sc), Math.max(2, 4 * sc));
      }
      // Namensschild
      if (a > -50 && a < W + 50) {
        g.fillStyle = 'rgba(10,20,34,.7)'; g.fillRect(a - 10, gy + th + 8, 120, 22);
        g.fillStyle = '#fff'; g.font = '600 12px system-ui'; g.textAlign = 'left'; g.fillText('✈ ' + plan.dest.name + ' · Piste 09', a - 4, gy + th + 23);
      }
    }
  }

  function drawGlide(sx, gy, sc) {
    const xT = sx(s.xd);
    g.save(); g.strokeStyle = 'rgba(120,255,160,.75)'; g.lineWidth = 2; g.setLineDash([10, 8]);
    g.beginPath();
    for (let d = 0; d <= 26000; d += 500) {
      const X = xT - d * sc, Y = gy - (15 + d * 0.0524) * sc;
      if (d === 0) g.moveTo(X, Y); else g.lineTo(X, Y);
    }
    g.stroke(); g.restore();
    g.fillStyle = 'rgba(120,255,160,.9)'; g.beginPath(); g.arc(xT + 250 * sc, gy - 2, 4, 0, Math.PI * 2); g.fill();
  }

  /* Seitenansicht des Flugzeugs */
  function drawPlane(px, py, sc) {
    const m = plan.model;
    const len = { S: 118, M: 148, L: 178 }[m.cls];
    const ground = s.onGround;
    const lift = ground ? len * 0.115 : 0;
    const bank = s.turbLeft > 0 ? Math.sin(time * 9) * 0.02 * s.turb : 0;
    g.save();
    g.translate(px, py - lift - (ground ? 0 : len * 0.1));
    g.rotate(-s.pitch + bank);
    // Schatten auf dem Boden
    drawSidePlane(len, s.flaps, s.gear, m.type.includes('prop') || m.id === 'falke' || m.id === 'kolibri');
    g.restore();
    // Schatten
    if (s.alt < 400) {
      const gyy = py + s.alt * sc;
      g.fillStyle = 'rgba(0,0,0,' + (0.28 * (1 - s.alt / 400)).toFixed(3) + ')';
      g.beginPath(); g.ellipse(px, gyy + 4, len * 0.42, 5, 0, 0, Math.PI * 2); g.fill();
    }
    // Triebwerksflamme/Landescheinwerfer
    if (s.thr > 0.9 && ground) {
      g.fillStyle = 'rgba(255,255,255,.15)';
      g.beginPath(); g.ellipse(px - len * 0.6, py - lift, 26 + s.v * 0.5, 7, 0, 0, Math.PI * 2); g.fill();
    }
  }
  function drawSidePlane(L, flaps, gear, prop) {
    const h = L * 0.13, col = plan.ac && plan.ac.color || '#1d6fd1';
    const a = '#f4f6f8', b = '#cfd5dc';
    // Fahrwerk
    if (gear) {
      g.strokeStyle = '#2b3138'; g.lineWidth = 3;
      g.beginPath(); g.moveTo(L * 0.28, h * 0.4); g.lineTo(L * 0.28, h * 0.4 + L * 0.075); g.moveTo(-L * 0.06, h * 0.4); g.lineTo(-L * 0.06, h * 0.4 + L * 0.085); g.stroke();
      g.fillStyle = '#15181c';
      g.beginPath(); g.arc(L * 0.28, h * 0.4 + L * 0.08, L * 0.02, 0, Math.PI * 2); g.arc(-L * 0.06, h * 0.4 + L * 0.092, L * 0.026, 0, Math.PI * 2); g.fill();
    }
    // Leitwerk
    g.fillStyle = col;
    g.beginPath(); g.moveTo(-L * 0.5, -h * 0.35); g.lineTo(-L * 0.4, -h * 0.5 - L * 0.2); g.lineTo(-L * 0.33, -h * 0.5 - L * 0.2); g.lineTo(-L * 0.27, -h * 0.5); g.closePath(); g.fill();
    g.fillStyle = b; g.beginPath(); g.moveTo(-L * 0.46, -h * 0.05); g.lineTo(-L * 0.54, -h * 0.28); g.lineTo(-L * 0.5, -h * 0.28); g.lineTo(-L * 0.36, -h * 0.05); g.closePath(); g.fill();
    // Rumpf
    g.fillStyle = a;
    g.beginPath();
    g.moveTo(-L * 0.5, -h * 0.35);
    g.lineTo(L * 0.28, -h * 0.5);
    g.quadraticCurveTo(L * 0.5, -h * 0.5, L * 0.5, 0);
    g.quadraticCurveTo(L * 0.46, h * 0.5, L * 0.3, h * 0.5);
    g.lineTo(-L * 0.3, h * 0.5);
    g.quadraticCurveTo(-L * 0.42, h * 0.45, -L * 0.5, -h * 0.05);
    g.closePath(); g.fill();
    g.strokeStyle = 'rgba(0,0,0,.2)'; g.lineWidth = 1; g.stroke();
    // Streifen & Fenster
    g.fillStyle = col; g.fillRect(-L * 0.44, h * 0.18, L * 0.86, h * 0.1);
    g.fillStyle = '#2d4a63';
    for (let i = 0; i < 16; i++) g.fillRect(-L * 0.3 + i * L * 0.032, -h * 0.28, L * 0.016, h * 0.2);
    g.beginPath(); g.moveTo(L * 0.34, -h * 0.4); g.lineTo(L * 0.46, -h * 0.26); g.lineTo(L * 0.34, -h * 0.22); g.closePath(); g.fill();
    // Tragfläche
    g.fillStyle = b;
    g.beginPath(); g.moveTo(L * 0.1, h * 0.2); g.lineTo(-L * 0.14, h * 0.2); g.lineTo(-L * 0.24, h * 0.5); g.lineTo(-L * 0.02, h * 0.46); g.closePath(); g.fill();
    g.strokeStyle = 'rgba(0,0,0,.25)'; g.stroke();
    // Klappen
    if (flaps > 0) {
      g.save(); g.translate(-L * 0.2, h * 0.5); g.rotate(flaps * 0.2);
      g.fillStyle = '#9aa4ae'; g.fillRect(-L * 0.06, 0, L * 0.12, h * 0.07); g.restore();
    }
    // Triebwerk / Propeller
    if (prop) {
      g.fillStyle = '#31475c'; g.beginPath(); g.ellipse(L * 0.5, 0, L * 0.012, L * 0.07 * (0.5 + 0.5 * Math.abs(Math.sin(time * 40))), 0, 0, Math.PI * 2); g.fill();
      g.fillStyle = 'rgba(40,60,80,.18)'; g.beginPath(); g.ellipse(L * 0.5, 0, L * 0.018, L * 0.075, 0, 0, Math.PI * 2); g.fill();
    } else {
      g.fillStyle = '#8c96a1';
      g.beginPath(); g.ellipse(L * 0.02, h * 0.62, L * 0.09, h * 0.2, 0, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#55606b'; g.beginPath(); g.ellipse(L * 0.1, h * 0.62, L * 0.012, h * 0.17, 0, 0, Math.PI * 2); g.fill();
    }
  }

  /* ---------------- HUD ---------------- */
  function panel(x, y, w, h) { g.fillStyle = 'rgba(8,16,28,.74)'; g.beginPath(); g.roundRect ? g.roundRect(x, y, w, h, 10) : g.rect(x, y, w, h); g.fill(); g.strokeStyle = 'rgba(255,255,255,.14)'; g.lineWidth = 1; g.stroke(); }
  const MONO = '600 15px ui-monospace, Menlo, Consolas, monospace';

  function drawHud(hud) {
    const P = s.P;
    g.textBaseline = 'middle';
    // --- Geschwindigkeitsband links
    const sx0 = 16, sy0 = 120, sw = 108, sh = 330, cy = sy0 + sh / 2;
    panel(sx0, sy0, sw, sh);
    g.save(); g.beginPath(); g.rect(sx0, sy0, sw, sh); g.clip();
    const kt = hud.kt, ky = k => cy - (k - kt) * 2.4;
    const stall = P.vs1 / Math.sqrt(FLAP_LIFT[s.flaps]) * KT;
    g.fillStyle = 'rgba(220,60,60,.55)'; g.fillRect(sx0 + 84, ky(stall), 10, sy0 + sh - ky(stall));
    g.strokeStyle = 'rgba(255,255,255,.7)'; g.fillStyle = '#e7eef6'; g.lineWidth = 1; g.font = '12px ui-monospace, Menlo, monospace'; g.textAlign = 'left';
    for (let k = Math.floor((kt - 80) / 10) * 10; k <= kt + 80; k += 10) {
      if (k < 0) continue;
      const y = ky(k);
      g.beginPath(); g.moveTo(sx0 + (k % 20 ? 70 : 62), y); g.lineTo(sx0 + 80, y); g.stroke();
      if (k % 20 === 0) g.fillText(String(k), sx0 + 14, y);
    }
    const mark = (v, c, t) => { const y = ky(v * KT); g.fillStyle = c; g.beginPath(); g.moveTo(sx0 + 100, y); g.lineTo(sx0 + 88, y - 6); g.lineTo(sx0 + 88, y + 6); g.fill(); g.font = 'bold 11px system-ui'; g.fillText(t, sx0 + 72, y - 12); };
    if (s.phase === 'takeoff' || s.phase === 'climb') mark(P.vr, '#43d1ff', 'Vr');
    if (s.phase === 'approach' || s.phase === 'descent' || s.phase === 'landing') mark(P.vref, '#6dff9b', 'Vref');
    g.restore();
    g.fillStyle = '#0a1420'; g.fillRect(sx0 + 6, cy - 17, sw - 12, 34); g.strokeStyle = '#43d1ff'; g.strokeRect(sx0 + 6, cy - 17, sw - 12, 34);
    g.fillStyle = '#fff'; g.font = '700 22px ui-monospace, Menlo, monospace'; g.textAlign = 'center'; g.fillText(String(Math.round(kt)), sx0 + sw / 2, cy + 1);
    g.fillStyle = '#9fb3c8'; g.font = '11px system-ui'; g.fillText('KT (EAS)', sx0 + sw / 2, sy0 + sh + 14);

    // --- Höhenband rechts
    const ax0 = W - 124, ay0 = 120, aw = 108;
    panel(ax0, ay0, aw, sh);
    g.save(); g.beginPath(); g.rect(ax0, ay0, aw, sh); g.clip();
    const ft = hud.ft, ay = a => cy - (a - ft) * 0.11;
    g.strokeStyle = 'rgba(255,255,255,.7)'; g.fillStyle = '#e7eef6'; g.font = '12px ui-monospace, Menlo, monospace'; g.textAlign = 'right';
    for (let a = Math.floor((ft - 1400) / 100) * 100; a <= ft + 1400; a += 100) {
      if (a < 0) { g.fillStyle = 'rgba(180,120,60,.22)'; g.fillRect(ax0, ay(a), aw, 12); continue; }
      const y = ay(a);
      g.beginPath(); g.moveTo(ax0 + 20, y); g.lineTo(ax0 + (a % 500 ? 34 : 44), y); g.stroke();
      if (a % 500 === 0) g.fillText(fmt(a), ax0 + aw - 10, y);
    }
    if (s.ap.on || s.ap.app) {
      const ty = clamp(ay(s.ap.alt * FT), ay0 + 6, ay0 + sh - 6);
      g.fillStyle = '#43d1ff'; g.beginPath(); g.moveTo(ax0, ty); g.lineTo(ax0 + 14, ty - 7); g.lineTo(ax0 + 14, ty + 7); g.fill();
    }
    g.restore();
    g.fillStyle = '#0a1420'; g.fillRect(ax0 + 6, cy - 17, aw - 12, 34); g.strokeStyle = '#43d1ff'; g.strokeRect(ax0 + 6, cy - 17, aw - 12, 34);
    g.fillStyle = '#fff'; g.font = '700 21px ui-monospace, Menlo, monospace'; g.textAlign = 'center'; g.fillText(fmt(Math.round(ft)), ax0 + aw / 2, cy + 1);
    g.fillStyle = '#9fb3c8'; g.font = '11px system-ui'; g.fillText('FT', ax0 + aw / 2, ay0 + sh + 14);
    const vs = hud.fpm;
    g.fillStyle = Math.abs(vs) > 2500 ? '#ff8a8a' : '#e7eef6'; g.font = '600 14px ui-monospace, Menlo, monospace';
    g.fillText((vs > 80 ? '▲ ' : vs < -80 ? '▼ ' : '– ') + fmt(Math.abs(Math.round(vs / 10) * 10)) + ' ft/min', ax0 + aw / 2, ay0 + sh + 34);

    // Gleitpfad-Abweichung
    if (s.xd - s.x < 30000 && s.phase !== 'landing' && !s.onGround) {
      const dev = s.alt - core.glideAlt(s, s.x);
      const c = Math.abs(dev) < 25 ? '#6dff9b' : Math.abs(dev) < 80 ? '#ffd166' : '#ff8a8a';
      g.fillStyle = c; g.font = '600 13px system-ui'; g.textAlign = 'center';
      g.fillText(dev > 0 ? '▼ ' + Math.round(dev) + ' m zu hoch' : '▲ ' + Math.round(-dev) + ' m zu tief', ax0 + aw / 2, ay0 + sh + 54);
      g.fillStyle = '#9fb3c8'; g.font = '10px system-ui'; g.fillText('GLEITPFAD', ax0 + aw / 2, ay0 + sh + 68);
    }

    // --- obere Leiste
    panel(W / 2 - 250, 12, 500, 62);
    g.textAlign = 'left'; g.fillStyle = '#fff'; g.font = '700 14px system-ui';
    g.fillText(AE.CITY[plan.home].name + '  →  ' + plan.dest.name + '   ·   ' + fmt(plan.dist) + ' km', W / 2 - 236, 30);
    const rem = Math.max(0, s.xd - s.x), tas = Math.max(80, s.v);
    const eta = s.ts > 16 ? rem / (s.P.eas / Math.sqrt(core.sigma(s.alt))) : rem / tas;
    g.fillStyle = '#9fb3c8'; g.font = '12px system-ui';
    g.fillText(PHASE[s.phase] + '  ·  noch ' + fmt(Math.round(rem / 1000)) + ' km  ·  Ankunft in ' + fmtTime(eta), W / 2 - 236, 50);
    // Fortschritt
    const bx = W / 2 - 236, bw = 472, frac = clamp(s.x / s.xd, 0, 1);
    g.fillStyle = 'rgba(255,255,255,.18)'; g.fillRect(bx, 62, bw, 4);
    g.fillStyle = '#43d1ff'; g.fillRect(bx, 62, bw * frac, 4);
    const tod = clamp((s.xd - s.P.todDist) / s.xd, 0, 1);
    g.fillStyle = '#ffd166'; g.fillRect(bx + bw * tod - 1, 58, 2, 12);
    g.fillStyle = '#fff'; g.font = '13px system-ui'; g.fillText('✈', bx + bw * frac - 6, 64);

    // --- Fußleiste
    const fx = W / 2 - 300, fy = H - 82;
    panel(fx, fy, 600, 70);
    g.textAlign = 'left'; g.font = '600 13px ui-monospace, Menlo, monospace'; g.fillStyle = '#e7eef6';
    g.fillText('NICK ' + (hud.pitchDeg >= 0 ? '+' : '') + hud.pitchDeg.toFixed(1) + '°', fx + 16, fy + 18);
    g.fillText('G ' + (s.g || 1).toFixed(2), fx + 16, fy + 40);
    // Schub
    g.fillStyle = 'rgba(255,255,255,.15)'; g.fillRect(fx + 120, fy + 10, 110, 12);
    g.fillStyle = s.thr > 0.95 ? '#ffb347' : '#6dc7ff'; g.fillRect(fx + 120, fy + 10, 110 * s.thr, 12);
    g.fillStyle = '#9fb3c8'; g.font = '11px system-ui'; g.fillText('SCHUB ' + Math.round(s.thr * 100) + ' %', fx + 120, fy + 36);
    // Klappen
    g.fillText('KLAPPEN', fx + 252, fy + 18);
    for (let i = 0; i <= 3; i++) {
      g.fillStyle = i === s.flaps ? '#ffd166' : 'rgba(255,255,255,.14)'; g.fillRect(fx + 252 + i * 24, fy + 26, 20, 16);
      g.fillStyle = i === s.flaps ? '#10202f' : '#9fb3c8'; g.font = '600 11px system-ui'; g.textAlign = 'center'; g.fillText(String(i), fx + 262 + i * 24, fy + 34);
    }
    g.textAlign = 'left';
    // Fahrwerk
    g.fillStyle = '#9fb3c8'; g.font = '11px system-ui'; g.fillText('FAHRWERK', fx + 366, fy + 18);
    g.fillStyle = s.gear ? '#6dff9b' : '#6f7d8c'; g.beginPath(); g.arc(fx + 378, fy + 34, 7, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#e7eef6'; g.fillText(s.gear ? 'unten' : 'oben', fx + 392, fy + 35);
    // AP
    g.fillStyle = '#9fb3c8'; g.fillText('AUTOPILOT', fx + 452, fy + 18);
    g.fillStyle = s.ap.app ? '#6dff9b' : s.ap.on ? '#43d1ff' : '#8a97a6'; g.font = '600 12px system-ui';
    g.fillText(s.ap.app ? 'ANFLUG-HILFE' : s.ap.on ? 'HÖHE ' + fmt(Math.round(s.ap.alt * FT / 100) * 100) + ' ft' : 'AUS', fx + 452, fy + 36);
    g.fillStyle = '#ffd166'; g.font = '600 12px system-ui';
    g.fillText('Zeit ×' + s.ts, fx + 452, fy + 54);

    // Zeitraffer-Hinweis rechts oben
    if (s.ts > 1) { g.fillStyle = 'rgba(255,209,102,.95)'; g.font = '700 16px system-ui'; g.textAlign = 'right'; g.fillText('⏩ ZEITRAFFER ×' + s.ts, W - 20, 30); }

    // Meldungen
    g.textAlign = 'left';
    const msgs = s.msgs.filter(m => s.t - m.t < 14 || m === s.msgs[s.msgs.length - 1]).slice(-4);
    msgs.forEach((m, i) => {
      const age = s.t - m.t, a = clamp(1 - (age - 8) / 6, 0.2, 1);
      const c = { tower: '#9ad7ff', warn: '#ffd166', bad: '#ff8a8a', good: '#8dffb0', tip: '#d9c8ff', info: '#e7eef6' }[m.kind] || '#e7eef6';
      g.font = '600 13px system-ui';
      const w = g.measureText(m.text).width + 24, y = 96 + i * 28;
      g.globalAlpha = a; g.fillStyle = 'rgba(8,16,28,.78)'; g.fillRect(W / 2 - w / 2, y - 12, w, 24);
      g.fillStyle = c; g.textAlign = 'center'; g.fillText(m.text, W / 2, y); g.globalAlpha = 1; g.textAlign = 'left';
    });

    // Warnungen
    g.textAlign = 'center'; g.font = '800 34px system-ui';
    const blink = Math.floor(time * 4) % 2 === 0;
    let warn = '', wc = '#ff6b6b';
    if (s.stallWarn) { warn = 'STALL – NASE SENKEN!'; }
    else if (s.onGround && s.phase === 'takeoff' && s.v > s.P.vr) { warn = 'ROTATE'; wc = '#43d1ff'; }
    else if (!s.onGround && s.phase === 'approach' && s.alt < 18 && s.alt > 0.5) { warn = 'FLARE'; wc = '#ffd166'; }
    else if (!s.onGround && (s.vz || 0) < -9 && s.alt < 500) { warn = 'SINKRATE'; }
    else if (!s.onGround && s.alt < 160 && !s.gear && s.xd - s.x < 6000) { warn = 'FAHRWERK!'; }
    if (warn && blink) { g.fillStyle = wc; g.fillText(warn, W / 2, 130); }
    if (!s.onGround && s.phase === 'approach' && s.alt < 60 && s.alt > 0.5) {
      g.fillStyle = '#fff'; g.font = '700 22px ui-monospace, Menlo, monospace'; g.fillText(Math.round(s.alt) + ' m', W / 2, 168);
    }
  }
  const PHASE = { takeoff: 'Start', climb: 'Steigflug', cruise: 'Reiseflug', descent: 'Sinkflug', approach: 'Anflug', landing: 'Landung' };
  function fmtTime(sec) {
    sec = Math.max(0, Math.round(sec));
    const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60);
    return h ? h + ' h ' + String(m).padStart(2, '0') + ' min' : m + ' min ' + String(sec % 60).padStart(2, '0') + ' s';
  }

  Sim.isOpen = () => running;
  Sim.state = () => s;
  Sim.debugStep = function (dt, n) { for (let i = 0; i < (n || 1); i++) { inp = Object.assign({}, holds); if (!s.result) core.advance(s, inp, dt); } time += dt; draw(); };
  Sim.debugHolds = h => { holds = h; };
})(window.AE = window.AE || {});
