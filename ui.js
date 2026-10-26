/* Airport Empire – Oberfläche, Panels und Spielsteuerung */
(function (AE) {
  'use strict';
  const $ = id => document.getElementById(id);
  const esc = t => String(t).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const { fmt, money, clamp } = AE;
  const G = AE.Game = { S: null, speed: 1, tab: 'overview', dayAcc: 0, cat: 'infra', selAc: null, selCity: null, dirty: true, lastPanel: 0, dragging: false, flying: false };

  const TABS = [['overview', 'Übersicht'], ['finance', 'Finanzen'], ['fleet', 'Flotte'], ['routes', 'Strecken'], ['rank', 'Rangliste'], ['goals', 'Ziele']];
  const CATS = [['infra', 'Infrastruktur'], ['build', 'Gebäude'], ['service', 'Service'], ['tool', 'Werkzeuge']];

  /* ---------------- Toasts & Dialoge ---------------- */
  function toast(text, kind) {
    const el = document.createElement('div');
    el.className = 'toast ' + (kind || 'info'); el.textContent = text;
    $('toasts').appendChild(el);
    setTimeout(() => { el.classList.add('out'); setTimeout(() => el.remove(), 400); }, 3600);
    while ($('toasts').children.length > 5) $('toasts').firstChild.remove();
  }
  AE.onMsg = (text, kind) => {
    if (!G.S) return;
    toast(text, kind === 'bad' ? 'bad' : kind === 'good' ? 'good' : 'info');
    if (kind === 'good') AE.Audio.play('good'); else if (kind === 'bad') AE.Audio.play('bad');
  };
  AE.onLevelUp = l => { AE.Audio.play('level'); modal(`<div class="eyebrow">Aufstieg</div><h2>${esc(AE.LEVELS[l - 1].name)}</h2><p>Dein Flughafen ist gewachsen! Freigeschaltet:</p><ul class="unlocks">${unlockList(l)}</ul><div class="row"><button class="btn primary" data-close>Weiter</button></div>`); };
  function unlockList(l) {
    const out = [];
    Object.entries(AE.BUILD).forEach(([k, b]) => { if (b.lvl === l) out.push('Gebäude: ' + b.name); });
    AE.MODELS.forEach(m => { if (m.lvl === l) out.push('Flugzeug: ' + m.name + ' (' + m.type + ')'); });
    out.push('Höhere Kreditgrenze: ' + money(AE.maxLoan(G.S)));
    return out.map(t => '<li>' + esc(t) + '</li>').join('');
  }

  function modal(html, onClose) {
    const m = $('modal'); $('modalCard').innerHTML = html;
    if (m.hidden && G.S && !G.flying) { G.wasSpeed = G.speed; G.speed = 0; }
    m.hidden = false;
    const close = () => { m.hidden = true; if (G.S && !G.flying && G.wasSpeed !== undefined) setSpeed(G.wasSpeed); if (onClose) onClose(); };
    m.querySelectorAll('[data-close]').forEach(b => b.addEventListener('click', close));
    m.onclick = e => { if (e.target === m && m.dataset.lock !== '1') close(); };
    return close;
  }
  function ask(text, yes, fn, danger) {
    const close = modal(`<h2>${esc(text)}</h2><div class="row"><button class="btn" data-close>Abbrechen</button><button class="btn ${danger ? 'danger' : 'primary'}" id="askYes">${esc(yes)}</button></div>`);
    $('askYes').addEventListener('click', () => { close(); fn(); });
  }

  /* ---------------- Titel ---------------- */
  function initTitle() {
    const sel = $('homeCity');
    AE.HOME_CHOICES.forEach(id => { const o = document.createElement('option'); o.value = id; o.textContent = AE.CITY[id].name + ' (' + AE.CITY[id].country + ')'; sel.appendChild(o); });
    $('continueBtn').hidden = !AE.hasSave();
    $('newForm').addEventListener('submit', e => {
      e.preventDefault();
      const start = () => { AE.wipeSave(); G.start(AE.newGame($('airportName').value.trim() || 'Mein Flughafen', sel.value)); };
      if (AE.hasSave()) ask('Neues Spiel starten? Dein gespeicherter Spielstand wird überschrieben.', 'Neu starten', start, true); else start();
    });
    $('continueBtn').addEventListener('click', () => { const S = AE.load(); if (S) G.start(S); });
  }

  /* ---------------- Start ---------------- */
  G.start = function (S) {
    G.S = S; G.speed = 1; G.dayAcc = 0; G.tab = 'overview'; G.selAc = null; G.selCity = null;
    $('title').hidden = true; $('app').hidden = false;
    AE.Map.setState(S);
    if (!G.inited) { G.inited = true; initGame(); }
    AE.Map.setTool({ kind: 'none' });
    buildTools(); buildTabs(); setSpeed(1); refresh(true);
    $('bankrupt').hidden = true;
    if (S.day === 0) showHelp(true);
  };

  function initGame() {
    AE.Map.init($('map'));
    AE.Map.toast = toast;
    AE.Map.sfx = n => AE.Audio.play(n);
    AE.Map.onChange = () => { G.dirty = true; buildTools(); };
    AE.Map.onTool = () => { updateToolButtons(); updateHint(); };
    AE.Map.onInspect = h => {
      const t = AE.Map.describeTile(h);
      if (t) toast(t, 'info');
    };
    $('speed').addEventListener('click', e => { const b = e.target.closest('[data-speed]'); if (b) setSpeed(+b.dataset.speed); });
    $('menuBtn').addEventListener('click', openMenu);
    $('muteBtn').addEventListener('click', () => { $('muteBtn').textContent = AE.Audio.toggle() ? '🔇' : '🔊'; });
    $('muteBtn').textContent = AE.Audio.muted ? '🔇' : '🔊';
    $('panel').addEventListener('click', onPanelClick);
    $('panel').addEventListener('input', onPanelInput);
    $('panel').addEventListener('pointerdown', e => { if (e.target.type === 'range') G.dragging = true; });
    window.addEventListener('pointerup', () => { G.dragging = false; });
    $('tabs').addEventListener('click', e => { const b = e.target.closest('[data-tab]'); if (b) { G.tab = b.dataset.tab; buildTabs(); refresh(true); AE.Audio.play('click'); } });
    window.addEventListener('keydown', onKey);
    window.addEventListener('beforeunload', () => { if (G.S && !G.S.bankrupt) AE.save(G.S); });
    document.addEventListener('visibilitychange', () => { if (document.hidden && G.S) AE.save(G.S); });
    requestAnimationFrame(loop);
  }

  function setSpeed(n) {
    G.speed = n;
    document.querySelectorAll('#speed button').forEach(b => b.classList.toggle('on', +b.dataset.speed === n));
  }

  function onKey(e) {
    if (!G.S || G.flying || !$('modal').hidden) { if (e.key === 'Escape' && !$('modal').hidden) { $('modal').hidden = true; if (G.S && !G.flying) setSpeed(G.wasSpeed || 1); } return; }
    if (/INPUT|SELECT|TEXTAREA/.test(e.target.tagName)) return;
    if (e.code === 'Space') { e.preventDefault(); setSpeed(G.speed === 0 ? (G.lastSpeed || 1) : (G.lastSpeed = G.speed, 0)); }
    else if (e.key >= '1' && e.key <= '4') setSpeed([1, 2, 4, 8][+e.key - 1]);
    else if (e.key === 'r' || e.key === 'R') { AE.Map.rot = !AE.Map.rot; }
    else if (e.key === 'Escape') AE.Map.setTool({ kind: 'none' });
    else if (e.key === 'b' || e.key === 'B') AE.Map.setTool({ kind: 'bulldoze' });
  }

  /* ---------------- Hauptschleife ---------------- */
  let last = performance.now();
  function loop(ts) {
    const dt = Math.min(0.1, (ts - last) / 1000); last = ts;
    const S = G.S;
    if (S && !G.flying && !S.bankrupt) {
      const sp = $('modal').hidden ? G.speed : 0;
      G.dayAcc += dt * sp;
      let guard = 0;
      while (G.dayAcc >= AE.C.DAY_SEC && guard++ < 6) {
        G.dayAcc -= AE.C.DAY_SEC;
        AE.stepDay(S);
        G.dirty = true;
        if (S.day % 10 === 0) AE.save(S);
        if (S.bankrupt) { showBankrupt(); break; }
      }
      const phase = ((S.day % AE.C.DAYS_PER_MONTH) + G.dayAcc / AE.C.DAY_SEC) / AE.C.DAYS_PER_MONTH;
      const daylight = 0.5 + 0.5 * Math.cos(2 * Math.PI * (phase - 0.35));
      AE.Map.night = clamp((0.42 - daylight) / 0.42, 0, 1);
      AE.Map.update(dt, Math.max(sp, 0.0001) > 0 ? sp : 0);
    }
    if (S) {
      AE.Map.render(dt);
      if (ts - G.lastPanel > 250) { G.lastPanel = ts; updateTop(); updateHint(); if (G.dirty && !G.dragging) { G.dirty = false; renderPanel(); } }
    }
    requestAnimationFrame(loop);
  }

  function showBankrupt() {
    const b = $('bankrupt'); b.hidden = false;
    b.innerHTML = `<div class="card"><h2>Insolvenz</h2><p>Dein Flughafen war zu lange im Minus und musste Insolvenz anmelden.</p><div class="row"><button class="btn primary" id="bkNew">Neues Spiel</button></div></div>`;
    $('bkNew').addEventListener('click', () => { AE.wipeSave(); location.reload(); });
  }

  /* ---------------- Kopfzeile ---------------- */
  function updateTop() {
    const S = G.S, T = S.today;
    $('apName').textContent = S.name;
    $('apLevel').textContent = 'Stufe ' + S.level + ' · ' + AE.LEVELS[S.level - 1].name;
    $('stCash').textContent = money(S.cash); $('stCash').className = S.cash < 0 ? 'neg' : '';
    $('stPax').textContent = T ? fmt(T.pax_n) : '–';
    const r = AE.rating(S);
    $('stRating').textContent = '★ ' + (r / 20).toFixed(1);
    $('stRep').textContent = Math.round(S.rep);
    const y = AE.C.START_YEAR + Math.floor(S.day / AE.C.DAYS_PER_YEAR), mo = Math.floor((S.day % AE.C.DAYS_PER_YEAR) / AE.C.DAYS_PER_MONTH);
    $('stDate').textContent = (S.day % AE.C.DAYS_PER_MONTH + 1) + '. ' + AE.MONTH_NAMES[mo] + ' ' + y;
  }

  /* ---------------- Werkzeugleiste ---------------- */
  function buildTools() {
    const S = G.S;
    $('cats').innerHTML = CATS.map(([k, n]) => `<button data-cat="${k}" class="${G.cat === k ? 'on' : ''}">${n}</button>`).join('');
    $('cats').onclick = e => { const b = e.target.closest('[data-cat]'); if (b) { G.cat = b.dataset.cat; buildTools(); AE.Audio.play('click'); } };
    const items = $('items'); items.innerHTML = '';
    const keys = G.cat === 'tool' ? [] : AE.BUILD_ORDER[G.cat];
    keys.forEach(k => {
      const b = AE.BUILD[k], locked = S.level < b.lvl;
      const el = document.createElement('button');
      el.className = 'item' + (locked ? ' locked' : '') + (S.cash < b.cost && !locked ? ' poor' : '');
      el.dataset.key = k;
      el.innerHTML = `<canvas width="88" height="88"></canvas><span class="nm">${b.name}</span><span class="pr">${locked ? '🔒 Stufe ' + b.lvl : money(b.cost)}</span>`;
      AE.Map.drawIcon(el.querySelector('canvas').getContext('2d'), k, 88);
      el.addEventListener('click', () => {
        if (locked) { toast(b.name + ' ab Stufe ' + b.lvl + ' (' + AE.LEVELS[b.lvl - 1].name + ')', 'bad'); return; }
        AE.Map.setTool({ kind: 'build', key: k }); AE.Audio.play('click');
      });
      items.appendChild(el);
    });
    if (G.cat === 'tool') {
      [['none', '👆', 'Auswahl', 'Felder anklicken für Infos'], ['bulldoze', '🚜', 'Abriss', '50 % Rückerstattung (B)'], ['land', '🏞', 'Land kaufen', 'Grundstück neben deinem Gelände']].forEach(([kind, ic, nm, ds]) => {
        const el = document.createElement('button');
        el.className = 'item tool'; el.dataset.kind = kind;
        el.innerHTML = `<span class="ico">${ic}</span><span class="nm">${nm}</span><span class="pr">${ds}</span>`;
        el.addEventListener('click', () => { AE.Map.setTool({ kind }); AE.Audio.play('click'); });
        items.appendChild(el);
      });
    }
    updateToolButtons();
  }
  function updateToolButtons() {
    const t = AE.Map.tool;
    document.querySelectorAll('#items .item').forEach(el => {
      const on = (t.kind === 'build' && el.dataset.key === t.key) || (el.dataset.kind && t.kind === el.dataset.kind);
      el.classList.toggle('on', !!on);
    });
  }
  function updateHint() {
    const t = AE.Map.tool, h = AE.Map.hover, el = $('hintbar');
    let html = '';
    if (t.kind === 'build') {
      const b = AE.BUILD[t.key];
      html = `<b>${b.name}</b> · ${money(b.cost)} · Unterhalt ${money(b.upkeep)}/Tag — ${esc(b.desc)}${b.paint ? '' : ' <kbd>R</kbd> drehen'}`;
      if (AE.Map.ghostReason && h) html += ` <span class="bad">⚠ ${esc(AE.Map.ghostReason)}</span>`;
    } else if (t.kind === 'bulldoze') html = '<b>Abriss</b> – klicke oder ziehe über Felder. <kbd>Esc</kbd> beendet.';
    else if (t.kind === 'land') html = `<b>Land kaufen</b> – nächstes Grundstück: ${money(AE.plotPrice(G.S))}. Nur Parzellen neben deinem Gelände.`;
    else html = h ? esc(AE.Map.describeTile(h)) : 'Wähle unten ein Bauwerk. <kbd>Leertaste</kbd> Pause · <kbd>1</kbd>–<kbd>4</kbd> Tempo';
    if (el.dataset.h !== html) { el.dataset.h = html; el.innerHTML = html; }
  }

  /* ---------------- Tabs & Panels ---------------- */
  function buildTabs() {
    $('tabs').innerHTML = TABS.map(([k, n]) => `<button data-tab="${k}" class="${G.tab === k ? 'on' : ''}">${n}</button>`).join('');
  }
  function refresh(force) { if (force) G.dirty = true; renderPanel(); G.dirty = false; updateTop(); }

  const bar = (v, cls) => `<div class="bar ${cls || ''}"><i style="width:${clamp(v, 0, 100).toFixed(0)}%"></i></div>`;
  const stat = (k, v) => `<div class="kv"><span>${k}</span><b>${v}</b></div>`;

  function advice(S) {
    const C = S.cap, out = [], T = S.today;
    const add = (k, t) => out.push(`<div class="tip ${k}">${t}</div>`);
    if (!C.effRunways) {
      if (C.runs.length) add('bad', '<b>Piste nicht angebunden.</b> Ziehe einen Rollweg von einem Gate zur Piste.');
      else add('bad', '<b>Keine Piste.</b> Baue mindestens 6 Pistenfelder in einer Reihe.');
    }
    if (C.effRunways && !C.effGates) add('bad', '<b>Kein aktives Gate.</b> Platziere ein Gate direkt neben einen Rollweg.');
    if (!C.termCap) add('bad', '<b>Kein Terminal.</b> Ohne Terminal fertigst du keine Passagiere ab.');
    if (T && C.termCap && T.pax_n >= C.termCap * 0.97) add('warn', '<b>Terminal ausgelastet.</b> Baue ein weiteres oder ein Großterminal – sonst sinkt die Zufriedenheit.');
    if (T && T.demand > T.capMov * 1.05) {
      const m = Math.min(C.rwyCap, C.gateCap, C.ctrlCap);
      const why = m === C.ctrlCap ? 'Flugsicherung (Tower/Radar)' : m === C.gateCap ? 'Gates' : 'Pisten';
      add('warn', `<b>Nachfrage übersteigt Kapazität</b> (${Math.round(T.demand)} gewünscht, ${Math.round(T.capMov)} möglich). Engpass: ${why}.`);
    }
    if (!C.towers && S.level >= 2) add('warn', '<b>Tower fehlt.</b> Ohne Tower sind nur 16 Bewegungen/Tag möglich.');
    if (C.effRunways && C.maxCls === 'S' && S.level >= 2) add('info', 'Verlängere eine Piste auf 12 Felder, dann landen Jets (mehr Passagiere pro Flug).');
    if (C.runs.some(r => r.eff && r.len >= 18) && !C.fire) add('warn', '<b>Feuerwache fehlt.</b> Großraumjets dürfen erst mit Feuerwache landen.');
    if (S.sat < 55 && C.termCap) add('warn', 'Zufriedenheit niedrig: mehr Shops/Restaurants, Grünanlagen oder höheres Service-Budget.');
    if (T && (C.shopCap + C.restCap) < T.pax_n * 0.3 && T.pax_n > 150) add('info', 'Mehr Shops und Restaurants in Terminal-Nähe bringen Zusatzumsatz.');
    if (!S.fleet.length && S.cash > 45000) add('info', 'Kaufe ein erstes Flugzeug im Tab <b>Flotte</b> und fliege Strecken selbst!');
    if (S.fleet.some(a => a.state === 'idle')) add('info', 'Ein Flugzeug steht still. Weise ihm im Tab <b>Strecken</b> eine Route zu.');
    if (S.cash < 0) add('bad', '<b>Konto im Minus!</b> Nimm einen Kredit auf oder erhöhe die Gebühren.');
    if (!out.length) add('good', 'Alles läuft rund. Wachse weiter – das Ziel ist Platz 1 der Weltrangliste!');
    return out.join('');
  }

  function renderPanel() {
    const S = G.S; if (!S) return;
    const p = $('panel');
    const scroll = p.scrollTop;
    p.innerHTML = ({ overview, finance, fleet, routes, rank, goals }[G.tab])(S);
    p.scrollTop = scroll;
    if (G.tab === 'routes') drawWorld();
  }

  function overview(S) {
    const C = S.cap, T = S.today;
    const lv = AE.LEVELS, next = lv[S.level];
    const prog = next ? (S.paxTotal - lv[S.level - 1].pax) / (next.pax - lv[S.level - 1].pax) * 100 : 100;
    const rk = AE.ranks(S);
    const clsN = { S: 'Klein', M: 'Mittel', L: 'Groß' };
    return `
      <div class="sec"><div class="lvl"><b>${esc(lv[S.level - 1].name)}</b>${next ? `<small>Nächste Stufe: ${esc(next.name)} bei ${fmt(next.pax)} Passagieren</small>` : '<small>Höchste Stufe erreicht</small>'}</div>${bar(prog, 'gold')}
      <div class="small">${fmt(S.paxTotal)} Passagiere insgesamt</div></div>
      <div class="sec"><h4>Bewertung <span class="star">★ ${(AE.rating(S) / 20).toFixed(1)}</span></h4>
        <div class="row3"><span>Service</span>${bar(S.sat, S.sat < 45 ? 'bad' : '')}<b>${Math.round(S.sat)}</b></div>
        <div class="row3"><span>Sicherheit</span>${bar(S.safety, S.safety < 45 ? 'bad' : '')}<b>${Math.round(S.safety)}</b></div>
        <div class="row3"><span>Pünktlichkeit</span>${bar(S.punct, S.punct < 60 ? 'bad' : '')}<b>${Math.round(S.punct)}</b></div>
        <div class="small">Weltrangliste: Größe <b>Platz ${rk.size}</b> · Qualität <b>Platz ${rk.quality}</b> von ${rk.bySize.length}</div>
      </div>
      <div class="sec"><h4>Kapazität</h4>
        ${stat('Pisten (aktiv)', C.effRunways + (C.maxCls ? ' · bis Klasse ' + clsN[C.maxCls] : ''))}
        ${stat('Gates (aktiv)', C.effGates)}
        ${stat('Flugbewegungen/Tag', (T ? Math.round(T.mov) : 0) + ' von ' + Math.round(C.capMov) + ' (Nachfrage ' + Math.round(AE.visitDemand(S)) + ')')}
        ${stat('Terminal', (T ? fmt(T.pax_n) : 0) + ' von ' + fmt(C.termCap) + ' Pax/Tag')}
        ${stat('Flugzeuge', S.fleet.length + ' von ' + C.fleetSlots + ' Plätzen')}
        ${S.event ? `<div class="event">${esc(AE.EVENT_NAMES[S.event.id] || 'Ereignis')} (${S.event.left} Tage)</div>` : ''}
      </div>
      <div class="sec"><h4>Berater</h4>${advice(S)}</div>
      <div class="sec"><h4>Nachrichten</h4><div class="log">${S.log.slice(0, 8).map(l => `<div class="${l.kind}"><small>Tag ${l.day}</small> ${esc(l.text)}</div>`).join('') || '<small>Noch nichts passiert.</small>'}</div></div>`;
  }
  AE.EVENT_NAMES = { messe: 'Großmesse', fest: 'Stadtfest', sturm: 'Wintersturm', streik: 'Streik', kerosin: 'Kerosin-Krise', staat: 'Staatsbesuch' };

  function finance(S) {
    const T = S.today, avg = k => S.fin.length ? S.fin.reduce((a, t) => a + t[k], 0) / S.fin.length : 0;
    const row = (n, k, neg) => `<tr><td>${n}</td><td>${T ? money((neg ? -1 : 1) * T[k]) : '–'}</td><td>${S.fin.length ? money((neg ? -1 : 1) * avg(k)) : '–'}</td></tr>`;
    const maxL = AE.maxLoan(S);
    return `
      <div class="sec"><div class="big">${money(S.cash)}</div><small>Kontostand${S.loan ? ' · Kredit ' + money(S.loan) : ''}</small></div>
      <div class="sec"><table class="fin"><thead><tr><th></th><th>Gestern</th><th>Ø 10 Tage</th></tr></thead><tbody>
        <tr class="h"><td colspan="3">Einnahmen</td></tr>
        ${row('Landegebühren', 'landing')}${row('Passagiergebühren', 'pax')}${row('Einzelhandel', 'retail')}${row('Gastronomie', 'food')}${row('Parkplätze', 'parking')}${row('Hotel', 'hotel')}${row('Tickets (eigene Airline)', 'tickets')}
        <tr class="h"><td colspan="3">Ausgaben</td></tr>
        ${row('Gebäude & Wege', 'upkeep', 1)}${row('Personal', 'staff', 1)}${row('Zinsen', 'interest', 1)}${row('Airline-Betrieb', 'airline', 1)}${row('Leasing & Versicherung', 'lease', 1)}
        <tr class="t"><td>Ergebnis pro Tag</td><td class="${T && T.net < 0 ? 'neg' : 'pos'}">${T ? money(T.net) : '–'}</td><td>${S.fin.length ? money(avg('net')) : '–'}</td></tr>
      </tbody></table></div>
      <div class="sec"><h4>Politik</h4>
        <label class="slider"><span>Gebühren <b id="feeV">${Math.round(S.fee * 100)} %</b></span><input type="range" id="fee" min="50" max="200" step="5" value="${Math.round(S.fee * 100)}"></label>
        <small>Mehr Gebühren = mehr Einnahmen je Flug, aber weniger Nachfrage der Airlines.</small>
        <label class="slider"><span>Service-Budget <b id="svcV">${Math.round(S.service * 100)} %</b></span><input type="range" id="svc" min="50" max="200" step="5" value="${Math.round(S.service * 100)}"></label>
        <small>Mehr Personal = höhere Zufriedenheit und Sicherheit, aber höhere Kosten.</small>
      </div>
      <div class="sec"><h4>Kredit</h4>
        <div class="kv"><span>Rahmen</span><b>${money(maxL)}</b></div>
        <div class="row"><button class="btn sm" data-act="loan" data-n="10000">+ 10.000 €</button><button class="btn sm" data-act="loan" data-n="100000">+ 100.000 €</button><button class="btn sm" data-act="repay" data-n="10000">− 10.000 €</button><button class="btn sm" data-act="repay" data-n="100000">− 100.000 €</button></div>
        <small>Zinsen: 0,12 % pro Tag.</small></div>`;
  }

  function fleet(S) {
    const C = S.cap;
    const cards = S.fleet.map(a => {
      const m = AE.MODEL[a.model];
      const st = a.state === 'route' ? 'Linie → ' + esc(AE.CITY[a.dest].name) : 'steht bereit';
      return `<div class="ac"><div class="ach"><span class="dot" style="background:${a.color}"></span><b>${esc(a.name)}</b><span class="tag">${m.cls}</span><small>${st}</small></div>
        <div class="acs">${m.seats} Sitze · ${a.flights} Flüge · Gewinn ${money(a.profit)}${a.damage ? ` · <span class="bad">Schaden ${Math.round(a.damage)} %</span>` : ''}</div>
        <div class="row"><button class="btn sm primary" data-act="plan" data-uid="${a.uid}">Strecke / Fliegen</button>${a.damage ? `<button class="btn sm" data-act="repair" data-uid="${a.uid}">Reparieren</button>` : ''}<button class="btn sm danger" data-act="sell" data-uid="${a.uid}">Verkaufen</button></div></div>`;
    }).join('');
    const shop = AE.MODELS.map(m => {
      const locked = S.level < m.lvl;
      const ok = AE.allowedClass(S, m.cls);
      return `<div class="ac shop ${locked ? 'locked' : ''}"><div class="ach"><b>${m.name}</b><span class="tag">${m.cls}</span><small>${m.type}</small></div>
        <div class="acs">${m.seats} Sitze · ${fmt(m.cruise)} km/h · ${fmt(m.range)} km Reichweite</div>
        <div class="acs">${ok || locked ? '' : '<span class="bad">Deine Piste ist (noch) zu kurz für diese Klasse.</span>'}</div>
        <div class="row"><button class="btn sm primary" data-act="buy" data-model="${m.id}" ${locked ? 'disabled' : ''}>${locked ? '🔒 Stufe ' + m.lvl : 'Kaufen · ' + money(m.price)}</button></div></div>`;
    }).join('');
    return `<div class="sec"><h4>Deine Flotte (${S.fleet.length}/${C.fleetSlots})</h4>${cards || '<small>Noch keine Flugzeuge. Kaufe unten dein erstes!</small>'}<small>Mehr Plätze: Hangar bauen (+3 je Hangar).</small></div>
      <div class="sec"><h4>Flugzeugmarkt</h4>${shop}</div>`;
  }

  /* --- Streckenplaner --- */
  function selAircraft() { const S = G.S; return S.fleet.find(a => a.uid === G.selAc) || S.fleet[0] || null; }
  function routeInfo(S, a, city) {
    const m = AE.MODEL[a.model], home = AE.CITY[S.home];
    const d = AE.dist(home, city);
    const f = AE.flightFinance(S, a, city.id, false);
    const fpd = AE.flightsPerDay(m, d);
    return { d, f, fpd, m, profit: (f.rev - f.cost) * fpd - m.price * 0.006, time: d / m.cruise + 0.5, reach: d <= m.range && d >= 100 };
  }
  function routes(S) {
    const a = selAircraft();
    if (!a) return `<div class="sec"><p>Du brauchst zuerst ein Flugzeug. Kaufe eines im Tab <b>Flotte</b>.</p></div>`;
    const chips = S.fleet.map(x => `<button class="chip ${x.uid === a.uid ? 'on' : ''}" data-act="selac" data-uid="${x.uid}"><span class="dot" style="background:${x.color}"></span>${esc(x.name)}</button>`).join('');
    const home = AE.CITY[S.home];
    const list = AE.CITIES.filter(c => c.id !== S.home).map(c => ({ c, r: routeInfo(S, a, c) })).filter(x => x.r.reach).sort((x, y) => y.r.profit - x.r.profit);
    let detail = '<small>Klicke ein Ziel auf der Karte oder in der Liste.</small>';
    const city = G.selCity ? AE.CITY[G.selCity] : null;
    if (city) {
      const r = routeInfo(S, a, city);
      const rwyOk = AE.allowedClass(S, r.m.cls);
      detail = `<div class="dest"><h4>${esc(home.name)} → ${esc(city.name)}</h4>
        ${stat('Entfernung', fmt(r.d) + ' km · ' + r.time.toFixed(1) + ' h Flugzeit')}
        ${stat('Passagiere je Flug', r.f.pax + ' von ' + r.m.seats + ' (Ticket ' + money(r.f.price) + ')')}
        ${stat('Gewinn je Flug', money(r.f.rev - r.f.cost))}
        ${stat('Gewinn je Tag (Linie)', money(r.profit))}
        ${stat('Landebahn dort', fmt(city.rwy) + ' m')}
        ${!r.reach ? `<div class="tip bad">Außerhalb der Reichweite (${fmt(r.m.range)} km) oder zu nah.</div>` : ''}
        ${!rwyOk ? '<div class="tip bad">Deine Piste ist für dieses Flugzeug zu kurz (oder Feuerwache fehlt).</div>' : ''}
        <div class="row"><button class="btn primary" data-act="assign" data-uid="${a.uid}" data-city="${city.id}" ${r.reach && rwyOk ? '' : 'disabled'}>Als Linie fliegen lassen</button>
        <button class="btn gold" data-act="fly" data-uid="${a.uid}" data-city="${city.id}" ${r.reach && rwyOk ? '' : 'disabled'}>✈ Selbst fliegen</button></div>
        <small>Selbst geflogen zahlt bis zu <b>2×</b> Erlös, sammelt Erfahrung und Ruf – ein Absturz kostet das Flugzeug.</small></div>`;
    }
    return `<div class="sec"><h4>Flugzeug wählen</h4><div class="chips">${chips}</div>
      <div class="small">${a.state === 'route' ? `Fliegt Linie nach <b>${esc(AE.CITY[a.dest].name)}</b> · <button class="link" data-act="unassign" data-uid="${a.uid}">Linie beenden</button>` : 'Steht bereit.'} · Reichweite ${fmt(AE.MODEL[a.model].range)} km</div></div>
      <div class="sec"><canvas id="world" width="680" height="400"></canvas></div>
      <div class="sec">${detail}</div>
      <div class="sec"><h4>Beste Strecken für ${esc(a.name)}</h4><div class="dlist">${list.slice(0, 8).map(x => `<button class="drow ${G.selCity === x.c.id ? 'on' : ''}" data-act="selcity" data-city="${x.c.id}"><span>${esc(x.c.name)}</span><small>${fmt(x.r.d)} km</small><b>${money(x.r.profit)}/Tag</b></button>`).join('') || '<small>Keine Ziele in Reichweite.</small>'}</div></div>`;
  }

  function worldPos(c, w, h) { return [(c.lon + 180) / 360 * w, (80 - c.lat) / 140 * h]; }
  function drawWorld() {
    const cv = $('world'); if (!cv) return;
    const S = G.S, g = cv.getContext('2d'), w = cv.width, h = cv.height, a = selAircraft();
    g.fillStyle = '#12304a'; g.fillRect(0, 0, w, h);
    g.strokeStyle = 'rgba(255,255,255,.06)'; g.lineWidth = 1;
    for (let lon = -180; lon <= 180; lon += 30) { const x = (lon + 180) / 360 * w; g.beginPath(); g.moveTo(x, 0); g.lineTo(x, h); g.stroke(); }
    for (let lat = -60; lat <= 80; lat += 20) { const y = (80 - lat) / 140 * h; g.beginPath(); g.moveTo(0, y); g.lineTo(w, y); g.stroke(); }
    g.fillStyle = '#2d5a45';
    AE.LAND.forEach(poly => { g.beginPath(); poly.forEach(([lon, lat], i) => { const x = (lon + 180) / 360 * w, y = (80 - lat) / 140 * h; i ? g.lineTo(x, y) : g.moveTo(x, y); }); g.closePath(); g.fill(); });
    const home = AE.CITY[S.home], hp = worldPos(home, w, h);
    // Linien
    S.fleet.forEach(x => {
      if (x.state !== 'route') return;
      const p = worldPos(AE.CITY[x.dest], w, h);
      g.strokeStyle = x.color; g.lineWidth = 2.5; g.beginPath(); g.moveTo(hp[0], hp[1]);
      g.quadraticCurveTo((hp[0] + p[0]) / 2, Math.min(hp[1], p[1]) - 30 - Math.abs(hp[0] - p[0]) * 0.1, p[0], p[1]); g.stroke();
    });
    // Reichweitenkreis (grob)
    if (a) {
      const reach = AE.MODEL[a.model].range;
      AE.CITIES.forEach(c => {
        const [x, y] = worldPos(c, w, h), ok = c.id !== S.home && AE.dist(home, c) <= reach && AE.dist(home, c) >= 100;
        const r = 3 + Math.sqrt(c.pop) * 0.9;
        g.fillStyle = ok ? 'rgba(255,255,255,.92)' : 'rgba(255,255,255,.22)';
        g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
        if (c.id === G.selCity) { g.strokeStyle = '#43d1ff'; g.lineWidth = 3; g.beginPath(); g.arc(x, y, r + 5, 0, Math.PI * 2); g.stroke(); g.fillStyle = '#fff'; g.font = '600 20px system-ui'; g.textAlign = 'center'; g.fillText(c.name, x, y - r - 10); }
      });
    }
    g.fillStyle = '#ffb703'; g.beginPath(); g.arc(hp[0], hp[1], 8, 0, Math.PI * 2); g.fill();
    g.strokeStyle = '#fff'; g.lineWidth = 2; g.stroke();
    cv.onclick = e => {
      const r = cv.getBoundingClientRect(), mx = (e.clientX - r.left) * w / r.width, my = (e.clientY - r.top) * h / r.height;
      let best = null, bd = 28;
      AE.CITIES.forEach(c => { if (c.id === S.home) return; const [x, y] = worldPos(c, w, h), d = Math.hypot(x - mx, y - my); if (d < bd) { bd = d; best = c; } });
      if (best) { G.selCity = best.id; G.dirty = true; renderPanel(); }
    };
  }

  function rank(S) {
    const rk = AE.ranks(S);
    const tbl = (list, key, fmtv, title) => `<div class="sec"><h4>${title}</h4><table class="rank">${list.map((r, i) => `<tr class="${r.me ? 'me' : ''}"><td>${i + 1}</td><td>${esc(r.name)}<small>${esc(r.city)}</small></td><td>${fmtv(r[key])}</td></tr>`).join('')}</table></div>`;
    const t1 = rk.size === 1, t2 = rk.quality === 1;
    return `<div class="sec trophies"><div class="trophy ${t1 ? 'got' : ''}"><span>🏆</span><b>Größter Flughafen</b><small>${t1 ? 'Geschafft!' : 'Aktuell Platz ' + rk.size}</small></div>
      <div class="trophy ${t2 ? 'got' : ''}"><span>🥇</span><b>Bester Flughafen</b><small>${t2 ? 'Geschafft!' : 'Aktuell Platz ' + rk.quality}</small></div></div>
      ${tbl(rk.bySize, 'pax', v => fmt(v) + ' Pax/Jahr', 'Größe – Passagiere pro Jahr')}
      ${tbl(rk.byQual, 'rating', v => v.toFixed(0) + ' / 100', 'Qualität – Gesamtbewertung')}
      <div class="sec"><small>Ein Jahr hat ${AE.C.DAYS_PER_YEAR} Spieltage. Die Rivalen wachsen langsam weiter – bleib dran!</small></div>`;
  }

  function goals(S) {
    const done = AE.GOALS.filter(g => S.goals[g.id]).length;
    const pr = AE.pilotRank(S), L = S.pilot.landings;
    return `<div class="sec"><h4>Ziele <small>${done}/${AE.GOALS.length}</small></h4>${AE.GOALS.map(g => `<div class="goal ${S.goals[g.id] ? 'done' : ''}"><span>${S.goals[g.id] ? '✔' : '○'}</span><div>${esc(g.text)}<small>Belohnung ${money(g.reward)}</small></div></div>`).join('')}</div>
      <div class="sec"><h4>Pilot: ${esc(pr.name)}</h4>${pr.next ? bar((S.pilot.xp - AE.PILOT_RANKS[pr.idx].xp) / (pr.next.xp - AE.PILOT_RANKS[pr.idx].xp) * 100, 'gold') + `<small>${fmt(S.pilot.xp)} XP · nächster Rang ${esc(pr.next.name)} bei ${fmt(pr.next.xp)}</small>` : '<small>Höchster Rang!</small>'}
      ${stat('Selbst geflogen', S.pilot.flights)}${stat('Butterweich / Gut', L.perfect + ' / ' + L.good)}${stat('Hart / Abstürze', L.hard + ' / ' + L.crash)}</div>`;
  }

  /* ---------------- Panel-Eingaben ---------------- */
  function onPanelInput(e) {
    const S = G.S, t = e.target;
    if (t.id === 'fee') { S.fee = t.value / 100; $('feeV').textContent = t.value + ' %'; }
    if (t.id === 'svc') { S.service = t.value / 100; $('svcV').textContent = t.value + ' %'; }
  }
  function onPanelClick(e) {
    const b = e.target.closest('[data-act]'); if (!b) return;
    const S = G.S, a = b.dataset.act, uid = +b.dataset.uid;
    const err = r => { if (r) { toast(r, 'bad'); AE.Audio.play('bad'); return true; } return false; };
    switch (a) {
      case 'loan': if (!err(AE.borrow(S, +b.dataset.n))) AE.Audio.play('buy'); break;
      case 'repay': if (!err(AE.repay(S, +b.dataset.n))) AE.Audio.play('buy'); break;
      case 'buy': if (!err(AE.buyAircraft(S, b.dataset.model))) { AE.Audio.play('buy'); toast('Flugzeug gekauft!', 'good'); const n = S.fleet[S.fleet.length - 1]; G.selAc = n.uid; } break;
      case 'sell': { const ac = S.fleet.find(x => x.uid === uid); ask(`${ac.name} für ${money(AE.MODEL[ac.model].price * 0.6 * (1 - ac.damage / 200))} verkaufen?`, 'Verkaufen', () => { AE.sellAircraft(S, uid); G.dirty = true; renderPanel(); }, true); return; }
      case 'repair': err(AE.repairAircraft(S, uid)); break;
      case 'plan': G.selAc = uid; G.tab = 'routes'; buildTabs(); break;
      case 'selac': G.selAc = uid; break;
      case 'selcity': G.selCity = b.dataset.city; break;
      case 'assign': if (!err(AE.assignRoute(S, uid, b.dataset.city))) { toast('Linie eingerichtet!', 'good'); AE.Audio.play('good'); } break;
      case 'unassign': AE.assignRoute(S, uid, null); break;
      case 'fly': startFlight(uid, b.dataset.city); return;
    }
    G.dirty = true; renderPanel(); updateTop();
  }

  /* ---------------- Selbst fliegen ---------------- */
  function startFlight(uid, cityId) {
    const S = G.S, plan = AE.planFlight(S, uid, cityId);
    if (plan.error) { toast(plan.error, 'bad'); return; }
    G.flying = true; AE.Map.setTool({ kind: 'none' });
    $('app').classList.add('hidden-app');
    AE.Sim.open(plan, result => {
      G.flying = false; $('app').classList.remove('hidden-app');
      if (!result) { return; }
      const out = AE.completeFlight(S, plan, result);
      AE.save(S);
      G.dirty = true; renderPanel(); updateTop();
      showFlightResult(plan, result, out);
    });
  }
  function showFlightResult(plan, r, o) {
    const g = AE.GRADE[r.grade];
    let body;
    if (r.grade === 'abort') body = '<p>Der Flug wurde abgebrochen. Kein Erlös.</p>';
    else if (r.grade === 'crash') body = `<p>${esc(r.why || '')}</p>${stat('Versicherung', money(o.insurance))}${stat('Ruf', '−12')}`;
    else body = `${stat('Ticketerlös', money(o.rev) + (r.assisted ? ' (Hilfe −15 %)' : ''))}${stat('Flugkosten', money(-o.cost))}<div class="kv t"><span>Gewinn</span><b class="${o.net < 0 ? 'neg' : 'pos'}">${money(o.net)}</b></div>${stat('Erfahrung', '+' + o.xp + ' XP')}`;
    modal(`<div class="eyebrow ${r.grade === 'crash' ? 'bad' : ''}">Flug nach ${esc(plan.dest.name)}</div><h2>${esc(g.label)}</h2>${body}${o.rankUp ? `<div class="tip good">Beförderung zum <b>${esc(o.rankUp)}</b>!</div>` : ''}<div class="row"><button class="btn primary" data-close>Weiter</button></div>`);
  }

  /* ---------------- Menü & Hilfe ---------------- */
  function openMenu() {
    const close = modal(`<h2>Menü</h2><div class="menu">
      <button class="btn" id="mSave">💾 Spiel speichern</button>
      <button class="btn" id="mHelp">❓ Anleitung</button>
      <button class="btn" id="mTitle">🏠 Zum Titelbildschirm</button>
      <button class="btn danger" id="mNew">🗑 Neues Spiel (Spielstand löschen)</button>
      <button class="btn" data-close>Zurück zum Spiel</button></div>`);
    $('mSave').onclick = () => { AE.save(G.S); toast('Gespeichert.', 'good'); close(); };
    $('mHelp').onclick = () => { close(); showHelp(); };
    $('mTitle').onclick = () => { AE.save(G.S); location.reload(); };
    $('mNew').onclick = () => { close(); ask('Spielstand wirklich löschen?', 'Löschen', () => { AE.wipeSave(); location.reload(); }, true); };
  }
  function showHelp(first) {
    modal(`<div class="eyebrow">${first ? 'Willkommen' : 'Anleitung'}</div><h2>So wirst du der beste Flughafen der Welt</h2>
      <div class="help">
      <p><b>1 · Bauen.</b> Wähle unten ein Bauwerk und klicke auf die Karte. Ein Flughafen braucht mindestens: eine <b>Piste</b> (6+ Felder in einer Reihe), einen <b>Rollweg</b> von der Piste zu einem <b>Gate</b> und ein <b>Terminal</b>. Dein Startflugplatz steht schon.</p>
      <p><b>2 · Wachsen.</b> Passagiere bringen Geld und Stufen. Ab 12 Feldern Pistenlänge landen Jets, ab 18 Feldern (mit Feuerwache) Großraumjets. Tower und Radar erlauben mehr Flüge, Shops und Restaurants mehr Umsatz. Kaufe <b>Land</b>, wenn der Platz knapp wird.</p>
      <p><b>3 · Wirtschaft.</b> Stelle Gebühren und Service-Budget im Tab <i>Finanzen</i> ein, nimm Kredite auf und beobachte den Berater in der Übersicht.</p>
      <p><b>4 · Fliegen.</b> Kaufe Flugzeuge (Tab <i>Flotte</i>, braucht Hangar-Platz). Schicke sie auf Linien – oder fliege selbst: <i>Strecken → ✈ Selbst fliegen</i>. Im Simulator startest du, steigst, nutzt Autopilot &amp; Zeitraffer und landest per Hand. Gute Landungen zahlen bis zu doppelt.</p>
      <p><b>5 · Ziel.</b> Werde in der <i>Rangliste</i> der <b>größte</b> und <b>beste</b> Flughafen der Welt.</p>
      <p class="small"><kbd>Leertaste</kbd> Pause · <kbd>1</kbd>–<kbd>4</kbd> Tempo · <kbd>R</kbd> Gebäude drehen · <kbd>B</kbd> Abriss · <kbd>Esc</kbd> Werkzeug abwählen · Rechtsklick = abbrechen</p>
      </div><div class="row"><button class="btn primary" data-close>Los geht’s</button></div>`);
  }

  document.addEventListener('DOMContentLoaded', initTitle);
  if (document.readyState !== 'loading') initTitle();
})(window.AE = window.AE || {});
