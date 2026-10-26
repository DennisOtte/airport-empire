/* Airport Empire – Spielzustand, Bau-Regeln und Wirtschaftsmodell (ohne DOM) */
(function (AE) {
  'use strict';
  const { COLS, ROWS, PLOT_W, PLOT_H } = AE.C;
  const PLOTS_X = COLS / PLOT_W, PLOTS_Y = ROWS / PLOT_H;
  const SAVE_KEY = 'airportEmpire.save.v1';
  const clamp = AE.clamp;
  const at = (x, y) => y * COLS + x;

  AE.msg = function (S, text, kind) {
    S.log.unshift({ day: S.day, text, kind: kind || 'info' });
    if (S.log.length > 80) S.log.pop();
    if (AE.onMsg) AE.onMsg(text, kind || 'info');
  };

  /* ---------------- neues Spiel ---------------- */
  AE.newGame = function (name, homeId) {
    const S = {
      ver: 1, name: name || 'Mein Flughafen', home: homeId || 'ber', day: 0,
      cash: 40000, loan: 0,
      plots: new Array(PLOTS_X * PLOTS_Y).fill(0),
      road: new Array(COLS * ROWS).fill(0), blds: [],
      fee: 1, service: 1,
      sat: 55, safety: 35, punct: 95, rep: 35,
      paxTotal: 0, flightsTotal: 0, hist: [], fin: [],
      fleet: [], uid: 1, level: 1, negDays: 0, bankrupt: false,
      pilot: { xp: 0, flights: 0, landings: { perfect: 0, good: 0, firm: 0, hard: 0, crash: 0 } },
      fuelIdx: 1, event: null, goals: {}, log: [], today: null, best: { size: 99, quality: 99 },
    };
    for (let py = 1; py <= 2; py++) for (let px = 1; px <= 3; px++) S.plots[py * PLOTS_X + px] = 1;
    // kleiner Startflugplatz
    for (let x = 10; x <= 17; x++) S.road[at(x, 8)] = 2;
    for (let y = 9; y <= 11; y++) S.road[at(13, y)] = 1;
    S.blds.push({ type: 'gate', x: 14, y: 10, w: 2, h: 2 });
    S.blds.push({ type: 'terminal', x: 14, y: 12, w: 3, h: 2 });
    AE.recalc(S);
    AE.msg(S, 'Willkommen! Dein Flugplatz ist eröffnet. Baue Pisten, Gates und Terminals aus.', 'good');
    return S;
  };

  /* ---------------- Land & Bauen ---------------- */
  AE.plotIndex = (x, y) => Math.floor(y / PLOT_H) * PLOTS_X + Math.floor(x / PLOT_W);
  AE.plotOwned = (S, x, y) => x >= 0 && y >= 0 && x < COLS && y < ROWS && !!S.plots[AE.plotIndex(x, y)];
  AE.plotPrice = S => Math.round(6000 * Math.pow(1.4, S.plots.reduce((a, b) => a + b, 0) - 5) / 100) * 100;
  AE.plotAdjacent = function (S, idx) {
    const px = idx % PLOTS_X, py = Math.floor(idx / PLOTS_X);
    return [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => {
      const nx = px + dx, ny = py + dy;
      return nx >= 0 && ny >= 0 && nx < PLOTS_X && ny < PLOTS_Y && S.plots[ny * PLOTS_X + nx];
    });
  };
  AE.buyPlot = function (S, idx) {
    if (S.plots[idx]) return 'Gehört dir schon.';
    if (!AE.plotAdjacent(S, idx)) return 'Nur Land neben deinem Gelände kaufbar.';
    const p = AE.plotPrice(S);
    if (S.cash < p) return 'Zu wenig Geld (' + AE.money(p) + ').';
    S.cash -= p; S.plots[idx] = 1;
    AE.recalc(S);
    return null;
  };

  AE.canPlace = function (S, key, x, y) {
    const b = AE.BUILD[key];
    if (S.level < b.lvl) return { ok: false, reason: 'Ab Stufe ' + b.lvl + ' (' + AE.LEVELS[b.lvl - 1].name + ')' };
    if (x < 0 || y < 0 || x + b.w > COLS || y + b.h > ROWS) return { ok: false, reason: 'Außerhalb der Karte' };
    for (let yy = y; yy < y + b.h; yy++) for (let xx = x; xx < x + b.w; xx++) {
      if (!AE.plotOwned(S, xx, yy)) return { ok: false, reason: 'Land nicht in deinem Besitz' };
      if (S.road[at(xx, yy)] || S.occ[at(xx, yy)] >= 0) return { ok: false, reason: 'Feld belegt' };
    }
    if (S.cash < b.cost) return { ok: false, reason: 'Zu wenig Geld' };
    return { ok: true };
  };
  AE.place = function (S, key, x, y) {
    const r = AE.canPlace(S, key, x, y);
    if (!r.ok) return r;
    const b = AE.BUILD[key];
    S.cash -= b.cost;
    if (b.road) S.road[at(x, y)] = b.road;
    else S.blds.push({ type: key, x, y, w: b.w, h: b.h });
    AE.recalc(S);
    return r;
  };
  AE.bulldoze = function (S, x, y) {
    if (!AE.plotOwned(S, x, y)) return false;
    const bi = S.occ[at(x, y)];
    if (bi >= 0) {
      const b = S.blds[bi];
      S.cash += AE.BUILD[b.type].cost * 0.5;
      S.blds.splice(bi, 1);
    } else if (S.road[at(x, y)]) {
      S.cash += (S.road[at(x, y)] === 2 ? AE.BUILD.runway : AE.BUILD.taxi).cost * 0.5;
      S.road[at(x, y)] = 0;
    } else return false;
    AE.recalc(S);
    return true;
  };

  /* ---------------- abgeleitete Werte ---------------- */
  AE.recalc = function (S) {
    const N = COLS * ROWS, road = S.road;
    const occ = new Int16Array(N).fill(-1);
    S.blds.forEach((b, i) => { for (let yy = b.y; yy < b.y + b.h; yy++) for (let xx = b.x; xx < b.x + b.w; xx++) occ[at(xx, yy)] = i; });
    S.occ = occ;

    // zusammenhängende Rollwegnetze
    const comp = new Int16Array(N).fill(-1); let nc = 0;
    for (let i = 0; i < N; i++) {
      if (road[i] > 0 && comp[i] < 0) {
        const st = [i]; comp[i] = nc;
        while (st.length) {
          const c = st.pop(), cx = c % COLS, cy = (c / COLS) | 0;
          for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
            const nx = cx + dx, ny = cy + dy;
            if (nx < 0 || ny < 0 || nx >= COLS || ny >= ROWS) continue;
            const ni = at(nx, ny);
            if (road[ni] > 0 && comp[ni] < 0) { comp[ni] = nc; st.push(ni); }
          }
        }
        nc++;
      }
    }

    // Pisten finden
    let runs = [];
    for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS;) {
      if (road[at(x, y)] === 2) { const x0 = x; while (x < COLS && road[at(x, y)] === 2) x++; runs.push({ x: x0, y, len: x - x0, dir: 'h' }); } else x++;
    }
    for (let x = 0; x < COLS; x++) for (let y = 0; y < ROWS;) {
      if (road[at(x, y)] === 2) { const y0 = y; while (y < ROWS && road[at(x, y)] === 2) y++; runs.push({ x, y: y0, len: y - y0, dir: 'v' }); } else y++;
    }
    runs = runs.filter(r => r.len >= AE.CLS_MIN_TILES.S);
    // direkt benachbarte Parallelpisten zählen nur einmal
    runs = runs.filter(r => !runs.some(o => o !== r && o.dir === r.dir && (o.len > r.len || (o.len === r.len && runs.indexOf(o) < runs.indexOf(r))) && (
      r.dir === 'h' ? Math.abs(o.y - r.y) === 1 && o.x < r.x + r.len && r.x < o.x + o.len
        : Math.abs(o.x - r.x) === 1 && o.y < r.y + r.len && r.y < o.y + o.len)));
    runs.forEach(r => {
      r.cls = r.len >= AE.CLS_MIN_TILES.L ? 'L' : r.len >= AE.CLS_MIN_TILES.M ? 'M' : 'S';
      r.comp = comp[at(r.x, r.y)];
    });

    // Gates anbinden
    const gates = [];
    S.blds.forEach(b => {
      if (b.type !== 'gate') return;
      b.comp = -1;
      for (let xx = b.x - 1; xx <= b.x + b.w && b.comp < 0; xx++) for (let yy = b.y - 1; yy <= b.y + b.h; yy++) {
        const inside = xx >= b.x && xx < b.x + b.w && yy >= b.y && yy < b.y + b.h;
        const corner = (xx < b.x || xx >= b.x + b.w) && (yy < b.y || yy >= b.y + b.h);
        if (inside || corner || xx < 0 || yy < 0 || xx >= COLS || yy >= ROWS) continue;
        if (road[at(xx, yy)] > 0) { b.comp = comp[at(xx, yy)]; break; }
      }
      gates.push(b);
    });
    const compRun = {}, compGate = {};
    runs.forEach(r => compRun[r.comp] = (compRun[r.comp] || 0) + 1);
    gates.forEach(g => compGate[g.comp] = (compGate[g.comp] || 0) + 1);
    runs.forEach(r => r.eff = (compGate[r.comp] || 0) > 0);
    gates.forEach(g => g.eff = g.comp >= 0 && (compRun[g.comp] || 0) > 0);

    const cnt = t => S.blds.filter(b => b.type === t).length;
    const terminals = S.blds.filter(b => AE.BUILD[b.type].cap && b.type.startsWith('terminal'));
    const nearTerminal = b => terminals.some(t => Math.abs((t.x + t.w / 2) - (b.x + b.w / 2)) < 9 && Math.abs((t.y + t.h / 2) - (b.y + b.h / 2)) < 7);
    const capSum = type => S.blds.filter(b => b.type === type).reduce((a, b) => a + AE.BUILD[type].cap * (nearTerminal(b) ? 1 : 0.5), 0);

    const effRuns = runs.filter(r => r.eff);
    const effGates = gates.filter(g => g.eff).length;
    let maxCls = null;
    effRuns.forEach(r => { if (!maxCls || AE.CLS_ORDER[r.cls] > AE.CLS_ORDER[maxCls]) maxCls = r.cls; });
    const fire = cnt('fire');
    if (maxCls === 'L' && !fire) maxCls = 'M';           // Großraumjets brauchen Feuerwache
    const towers = cnt('tower'), radars = cnt('radar');
    const C = {
      runs, effRunways: effRuns.length, effGates, maxCls,
      longest: effRuns.reduce((a, r) => Math.max(a, r.len), 0),
      rwyCap: effRuns.length * 40, gateCap: effGates * 12,
      ctrlCap: 16 + 40 * towers + 30 * radars,
      towers, radars, fire, hangars: cnt('hangar'), fuel: cnt('fuel'), buses: cnt('bus'),
      parks: cnt('park'), hotels: cnt('hotel'), terminals: terminals.length,
      termCap: terminals.reduce((a, t) => a + AE.BUILD[t.type].cap, 0),
      shopCap: capSum('shop'), restCap: capSum('restaurant'), parkCap: capSum('parking'), hotelRooms: capSum('hotel'),
    };
    C.capMov = Math.min(C.rwyCap, C.gateCap, C.ctrlCap);
    C.fleetSlots = 2 + 3 * C.hangars;
    C.upkeep = S.blds.reduce((a, b) => a + AE.BUILD[b.type].upkeep, 0) +
      road.reduce((a, v) => a + (v === 2 ? AE.BUILD.runway.upkeep : v === 1 ? AE.BUILD.taxi.upkeep : 0), 0);
    S.cap = C;
    return C;
  };

  AE.levelFor = pax => { let l = 1; AE.LEVELS.forEach((L, i) => { if (pax >= L.pax) l = i + 1; }); return l; };
  AE.rating = S => 0.45 * S.sat + 0.30 * S.safety + 0.25 * S.punct;
  AE.annualPax = function (S) {
    if (!S.hist.length) return 0;
    const sum = S.hist.reduce((a, b) => a + b, 0);
    return sum / S.hist.length * AE.C.DAYS_PER_YEAR;
  };
  AE.rivalPax = (r, S) => r.pax * Math.pow(1 + r.growth, S.day / AE.C.DAYS_PER_YEAR);
  AE.ranks = function (S) {
    const me = { me: true, name: S.name, city: AE.CITY[S.home].name, pax: AE.annualPax(S), rating: AE.rating(S) };
    const all = AE.RIVALS.map(r => ({ name: r.name, city: r.city, pax: AE.rivalPax(r, S), rating: r.rating })).concat([me]);
    const bySize = all.slice().sort((a, b) => b.pax - a.pax);
    const byQual = all.slice().sort((a, b) => b.rating - a.rating);
    return { bySize, byQual, size: bySize.indexOf(me) + 1, quality: byQual.indexOf(me) + 1, me };
  };

  /* ---------------- Flotte & Strecken ---------------- */
  AE.allowedClass = (S, cls) => !!S.cap.maxCls && AE.CLS_ORDER[cls] <= AE.CLS_ORDER[S.cap.maxCls];
  AE.buyAircraft = function (S, modelId) {
    const m = AE.MODEL[modelId];
    if (S.level < m.lvl) return 'Ab Stufe ' + m.lvl + ' verfügbar.';
    if (S.fleet.length >= S.cap.fleetSlots) return 'Kein Platz: Baue einen Hangar (3 Flugzeuge je Hangar).';
    if (S.cash < m.price) return 'Zu wenig Geld.';
    S.cash -= m.price;
    const n = S.fleet.filter(a => a.model === modelId).length + 1;
    S.fleet.push({ uid: S.uid++, model: modelId, name: m.name + ' #' + n, state: 'idle', dest: null, carry: 0, damage: 0, flights: 0, profit: 0, color: AE.pick(['#e4572e', '#2e86de', '#20bf6b', '#a55eea', '#f7b731', '#e84393']) });
    return null;
  };
  AE.sellAircraft = function (S, uid) {
    const i = S.fleet.findIndex(a => a.uid === uid);
    if (i < 0) return;
    S.cash += AE.MODEL[S.fleet[i].model].price * 0.6 * (1 - S.fleet[i].damage / 200);
    S.fleet.splice(i, 1);
  };
  AE.repairAircraft = function (S, uid) {
    const a = S.fleet.find(x => x.uid === uid);
    if (!a || !a.damage) return null;
    const cost = Math.round(AE.MODEL[a.model].price * a.damage / 100 * 0.3);
    if (S.cash < cost) return 'Zu wenig Geld (' + AE.money(cost) + ').';
    S.cash -= cost; a.damage = 0; return null;
  };
  AE.assignRoute = function (S, uid, destId) {
    const a = S.fleet.find(x => x.uid === uid);
    if (!a) return 'Unbekanntes Flugzeug';
    if (!destId) { a.state = 'idle'; a.dest = null; return null; }
    const m = AE.MODEL[a.model], d = AE.dist(AE.CITY[S.home], AE.CITY[destId]);
    if (d > m.range) return 'Reichweite zu gering (' + d + ' km > ' + m.range + ' km).';
    if (!AE.allowedClass(S, m.cls)) return 'Deine Piste ist für diese Klasse zu kurz (oder Feuerwache fehlt).';
    if (d < 100) return 'Ziel zu nah.';
    a.state = 'route'; a.dest = destId; a.carry = 0;
    return null;
  };
  AE.flightsPerDay = (m, dist) => clamp(12 / (dist / m.cruise + 2.5), 0.12, 4);
  AE.flightFinance = function (S, ac, destId, rnd) {
    const m = AE.MODEL[ac.model], dest = AE.CITY[destId], d = AE.dist(AE.CITY[S.home], dest);
    const load = clamp(0.46 + 0.22 * Math.min(1, dest.pop / 8) + 0.28 * S.rep / 100 + (rnd ? (Math.random() - 0.5) * 0.08 : 0), 0.35, 0.97);
    const pax = Math.max(1, Math.round(m.seats * load));
    const price = 40 + 0.07 * d;
    const fuel = m.burn * d * S.fuelIdx * (S.cap.fuel ? 0.85 : 1);
    const other = 120 + m.seats * 1.6 + pax * (8 + 0.01 * d);
    return { pax, rev: pax * price, cost: fuel + other, dist: d, price };
  };

  /* Manuell geflogener Flug: Plan → Simulator → Abrechnung */
  AE.planFlight = function (S, uid, destId) {
    const a = S.fleet.find(x => x.uid === uid);
    if (!a) return { error: 'Kein Flugzeug gewählt.' };
    const m = AE.MODEL[a.model], dest = AE.CITY[destId];
    const d = AE.dist(AE.CITY[S.home], dest);
    if (d > m.range) return { error: 'Reichweite reicht nicht (' + d + ' km).' };
    if (!AE.allowedClass(S, m.cls)) return { error: 'Deine Piste ist zu kurz für dieses Flugzeug.' };
    if (a.damage > 60) return { error: 'Flugzeug ist zu stark beschädigt – bitte reparieren.' };
    const f = AE.flightFinance(S, a, destId, true);
    return { ac: a, model: m, dest, dist: d, fin: f, home: S.home, homeRwy: S.cap.longest * AE.C.TILE_M, destRwy: dest.rwy };
  };
  const GRADE = {
    perfect: { mult: 2.0, xp: 120, rep: 1.2, label: 'Butterweiche Landung!' },
    good: { mult: 1.7, xp: 90, rep: 0.6, label: 'Saubere Landung' },
    firm: { mult: 1.35, xp: 60, rep: 0.1, label: 'Etwas hart' },
    hard: { mult: 1.0, xp: 25, rep: -0.8, label: 'Harte Landung – Schäden' },
    crash: { mult: 0, xp: 0, rep: -12, label: 'Absturz' },
    abort: { mult: 0, xp: 0, rep: -1.5, label: 'Flug abgebrochen' },
  };
  AE.GRADE = GRADE;
  AE.completeFlight = function (S, plan, result) {
    const g = GRADE[result.grade], a = plan.ac, f = plan.fin;
    const rev = f.rev * g.mult * (1 + 0.01 * AE.pilotRank(S).idx) * (result.assisted ? 0.85 : 1);
    const out = { rev, cost: 0, net: 0, xp: 0, insurance: 0, grade: result.grade, label: g.label };
    if (result.grade === 'abort') {
      S.rep = clamp(S.rep + g.rep, 0, 100);
      AE.msg(S, 'Flug nach ' + plan.dest.name + ' abgebrochen.', 'bad');
      return out;
    }
    if (result.grade === 'crash') {
      const ins = AE.MODEL[a.model].price * 0.5;
      S.cash += ins; out.insurance = ins;
      S.fleet.splice(S.fleet.indexOf(a), 1);
      S.safety = clamp(S.safety - 15, 0, 100);
      S.pilot.landings.crash++;
      AE.msg(S, 'Absturz! ' + a.name + ' ist verloren. Versicherung zahlt ' + AE.money(ins) + '.', 'bad');
    } else {
      out.cost = f.cost; out.net = rev - f.cost;
      S.cash += out.net; a.profit += out.net; a.flights++;
      if (result.grade === 'hard') a.damage = clamp(a.damage + 30, 0, 100);
      if (result.grade === 'firm') a.damage = clamp(a.damage + 5, 0, 100);
      S.paxTotal += f.pax; S.flightsTotal++;
      if (S.hist.length) S.hist[S.hist.length - 1] += f.pax;
      S.pilot.landings[result.grade]++;
      out.xp = Math.round(g.xp + f.dist / 60);
    }
    S.rep = clamp(S.rep + g.rep, 0, 100);
    const before = AE.pilotRank(S).idx;
    S.pilot.xp += out.xp; S.pilot.flights++;
    out.rankUp = AE.pilotRank(S).idx > before ? AE.pilotRank(S).name : null;
    AE.recalcLevel(S);
    return out;
  };
  AE.pilotRank = function (S) {
    let idx = 0; AE.PILOT_RANKS.forEach((r, i) => { if (S.pilot.xp >= r.xp) idx = i; });
    return { idx, name: AE.PILOT_RANKS[idx].name, next: AE.PILOT_RANKS[idx + 1] };
  };
  AE.recalcLevel = function (S) {
    const l = AE.levelFor(S.paxTotal);
    if (l > S.level) {
      S.level = l;
      AE.msg(S, 'Aufgestiegen zum ' + AE.LEVELS[l - 1].name + '! Neue Gebäude und Flugzeuge verfügbar.', 'good');
      if (AE.onLevelUp) AE.onLevelUp(l);
    }
  };

  /* ---------------- Ziele ---------------- */
  AE.GOALS = [
    { id: 'g_l2', text: 'Regionalflughafen erreichen (3.000 Passagiere)', check: S => S.level >= 2, reward: 8000 },
    { id: 'g_tower', text: 'Einen Tower bauen', check: S => S.cap.towers >= 1, reward: 4000 },
    { id: 'g_jets', text: 'Piste für Jets (12 Felder) anbinden', check: S => S.cap.maxCls && AE.CLS_ORDER[S.cap.maxCls] >= 2, reward: 10000 },
    { id: 'g_fleet', text: 'Erstes eigenes Flugzeug kaufen', check: S => S.fleet.length >= 1, reward: 3000 },
    { id: 'g_land', text: 'Eine Strecke selbst fliegen und landen', check: S => S.pilot.flights - S.pilot.landings.crash >= 1, reward: 6000 },
    { id: 'g_perfect', text: 'Eine butterweiche Landung hinlegen', check: S => S.pilot.landings.perfect >= 1, reward: 12000 },
    { id: 'g_l3', text: 'Verkehrsflughafen erreichen (40.000 Passagiere)', check: S => S.level >= 3, reward: 30000 },
    { id: 'g_hotel', text: 'Ein Hotel eröffnen', check: S => S.cap.hotels >= 1, reward: 15000 },
    { id: 'g_l4', text: 'Internationaler Flughafen werden (250.000 Passagiere)', check: S => S.level >= 4, reward: 120000 },
    { id: 'g_long', text: 'Eine Langstrecken-Piste (18 Felder) mit Feuerwache betreiben', check: S => S.cap.maxCls === 'L', reward: 60000 },
    { id: 'g_star', text: 'Gesamtbewertung über 75 erreichen', check: S => AE.rating(S) >= 75, reward: 50000 },
    { id: 'g_top5', text: 'In die Top 5 der Weltrangliste (Größe)', check: S => AE.ranks(S).size <= 5, reward: 150000 },
    { id: 'g_l5', text: 'Zum Drehkreuz aufsteigen (900.000 Passagiere)', check: S => S.level >= 5, reward: 400000 },
    { id: 'g_best', text: 'Bester Flughafen der Welt (Qualität Platz 1)', check: S => AE.ranks(S).quality === 1, reward: 500000 },
    { id: 'g_biggest', text: 'Größter Flughafen der Welt (Größe Platz 1)', check: S => AE.ranks(S).size === 1, reward: 1000000 },
  ];

  /* ---------------- Ereignisse ---------------- */
  const EVENTS = [
    { id: 'messe', name: 'Großmesse in der Stadt', text: 'Eine Messe lockt Geschäftsreisende – mehr Nachfrage!', days: 9, demand: 1.4, kind: 'good' },
    { id: 'fest', name: 'Stadtfest', text: 'Ein Stadtfest sorgt für mehr Reisende.', days: 6, demand: 1.25, kind: 'good' },
    { id: 'sturm', name: 'Wintersturm', text: 'Sturmwarnung! Viele Flüge fallen aus.', days: 4, cap: 0.45, punct: -12, kind: 'bad' },
    { id: 'streik', name: 'Streik der Abfertiger', text: 'Streik am Flughafen – weniger Passagiere, schlechte Stimmung.', days: 6, demand: 0.75, sat: -10, kind: 'bad' },
    { id: 'kerosin', name: 'Kerosin-Krise', text: 'Der Kerosinpreis steigt stark.', days: 14, fuel: 1.5, kind: 'bad' },
    { id: 'staat', name: 'Staatsbesuch', text: 'Ein Staatsbesuch bringt Prestige für deinen Flughafen.', days: 3, rep: 4, kind: 'good' },
  ];

  /* ---------------- Tagesschritt ---------------- */
  AE.visitDemand = function (S) {
    const ev = S.event ? EVENTS.find(e => e.id === S.event.id) : null;
    const base = 6 + 12 * S.level;
    const attract = 0.3 + 0.7 * S.rep / 100;
    const feeEff = clamp(1.6 - 0.6 * S.fee, 0.35, 1.5);
    const access = 1 + 0.1 * Math.min(4, S.cap.buses);
    return base * attract * feeEff * access * (ev && ev.demand ? ev.demand : 1);
  };

  AE.stepDay = function (S) {
    if (!S.cap) AE.recalc(S);
    const C = S.cap;
    S.day++;
    const ev = S.event ? EVENTS.find(e => e.id === S.event.id) : null;

    // Ereignisse
    if (S.event) {
      S.event.left--;
      if (S.event.left <= 0) { AE.msg(S, ev.name + ' ist vorbei.', 'info'); S.event = null; }
    } else if (S.day > 15 && Math.random() < 0.07) {
      const e = AE.pick(EVENTS);
      S.event = { id: e.id, left: e.days };
      AE.msg(S, e.name + ': ' + e.text, e.kind);
      if (e.rep) S.rep = clamp(S.rep + e.rep, 0, 100);
    }
    const evNow = S.event ? EVENTS.find(e => e.id === S.event.id) : null;
    const capMul = evNow && evNow.cap ? evNow.cap : 1;
    S.fuelIdx = clamp(S.fuelIdx + (Math.random() - 0.5) * 0.04 + (1 - S.fuelIdx) * 0.02, 0.75, 1.7);
    const fuelMul = evNow && evNow.fuel ? evNow.fuel : 1;
    const fuelIdxSave = S.fuelIdx; S.fuelIdx *= fuelMul;

    const T = { landing: 0, pax: 0, retail: 0, food: 0, parking: 0, hotel: 0, tickets: 0, upkeep: 0, staff: 0, interest: 0, airline: 0, lease: 0 };
    const capMov = C.capMov * capMul;

    // 1) eigene Airline
    let ownMov = 0, ownPax = 0;
    S.fleet.forEach(a => {
      const m = AE.MODEL[a.model];
      T.lease += m.price * (a.state === 'route' ? 0.006 : 0.003);
      if (a.state !== 'route' || !a.dest) return;
      if (!AE.allowedClass(S, m.cls)) return;
      const d = AE.dist(AE.CITY[S.home], AE.CITY[a.dest]);
      a.carry += AE.flightsPerDay(m, d) * (a.damage > 60 ? 0.3 : 1) * capMul;
      const n = Math.floor(a.carry); a.carry -= n;
      for (let i = 0; i < n; i++) {
        if (ownMov >= capMov * 0.35) break;
        const f = AE.flightFinance(S, a, a.dest, true);
        T.tickets += f.rev; T.airline += f.cost; ownPax += f.pax; ownMov++;
        a.flights++; a.profit += f.rev - f.cost;
      }
    });

    // 2) Gastairlines
    const demand = AE.visitDemand(S);
    const freeMov = Math.max(0, capMov - ownMov);
    const visTarget = Math.min(freeMov, demand);
    let visMov = Math.floor(visTarget) + (Math.random() < visTarget % 1 ? 1 : 0);
    const loadVis = 0.5 + 0.4 * S.sat / 100;
    const weights = [];
    if (C.maxCls) {
      weights.push(['S', Math.max(0.5, 4 - S.level)]);
      if (AE.CLS_ORDER[C.maxCls] >= 2) weights.push(['M', 2.2]);
      if (AE.CLS_ORDER[C.maxCls] >= 3) weights.push(['L', 0.6 * S.level]);
    }
    const wSum = weights.reduce((a, w) => a + w[1], 0);
    let visPax = 0;
    for (let i = 0; i < visMov; i++) {
      let r = Math.random() * wSum, cls = 'S';
      for (const w of weights) { r -= w[1]; if (r <= 0) { cls = w[0]; break; } }
      visPax += AE.VISIT_SEATS[cls] * loadVis * (0.85 + Math.random() * 0.3);
      T.landing += AE.LANDING_FEE[cls] * S.fee;
    }
    visPax = Math.round(visPax);

    // 3) Passagiere und Terminal
    let pax = ownPax + visPax;
    const crowd = C.termCap > 0 ? pax / C.termCap : (pax > 0 ? 9 : 0);
    if (pax > C.termCap) pax = C.termCap;
    const movements = ownMov + visMov;
    if (C.termCap === 0) pax = 0;

    T.pax = pax * 2.4 * Math.pow(S.fee, 0.6);
    T.retail = Math.min(pax, C.shopCap) * 1.0 * (0.8 + 0.4 * S.sat / 100);
    T.food = Math.min(pax, C.restCap) * 1.25;
    T.parking = Math.min(pax * 0.3, C.parkCap) * 7;
    T.hotel = Math.min(pax * 0.05, C.hotelRooms) * 60;

    T.upkeep = C.upkeep;
    T.staff = (movements * 30 + pax * 0.5) * S.service;
    T.interest = S.loan * 0.0012;

    const rev = T.landing + T.pax + T.retail + T.food + T.parking + T.hotel + T.tickets;
    const exp = T.upkeep + T.staff + T.interest + T.airline + T.lease;
    S.cash += rev - exp;
    T.rev = rev; T.exp = exp; T.net = rev - exp; T.pax_n = pax; T.mov = movements;
    T.demand = demand; T.capMov = capMov;
    S.today = T;
    S.fin.push(T); if (S.fin.length > 10) S.fin.shift();
    S.fuelIdx = fuelIdxSave;

    S.paxTotal += pax; S.flightsTotal += movements;
    S.hist.push(pax); if (S.hist.length > AE.C.DAYS_PER_YEAR) S.hist.shift();

    // 4) Qualität
    const covered = pax > 0 ? Math.min(1, (C.shopCap + C.restCap) / pax) : 0.5;
    let satT = 38 + 22 * covered + Math.min(8, C.parks * 1.5) + (C.hotels ? 5 : 0) + Math.min(6, C.terminals * 2)
      + (S.service - 1) * 16 + (C.buses ? 3 : 0);
    if (crowd > 0.9) satT -= Math.min(35, (crowd - 0.9) * 55);
    if (evNow && evNow.sat) satT += evNow.sat;
    S.sat = clamp(S.sat + (clamp(satT, 0, 100) - S.sat) * 0.08, 0, 100);

    const safeT = 25 + (C.towers ? 22 : 0) + (C.fire ? 16 : 0) + (C.radars ? 12 : 0) + (C.hangars ? 10 : 0) + (S.service - 1) * 10 + 8;
    S.safety = clamp(S.safety + (clamp(safeT, 0, 100) - S.safety) * 0.04, 0, 100);

    const shortfall = demand > capMov ? (demand - capMov) / demand : 0;
    const punctT = 100 - 85 * shortfall - (crowd > 1 ? 10 : 0) + (evNow && evNow.punct ? evNow.punct : 0) + (C.radars ? 3 : 0);
    S.punct = clamp(S.punct + (clamp(punctT, 0, 100) - S.punct) * 0.1, 0, 100);

    S.rep = clamp(S.rep + (AE.rating(S) - S.rep) * 0.02, 0, 100);

    // 5) Stufen, Ziele, Kredit
    AE.recalcLevel(S);
    AE.GOALS.forEach(g => {
      if (!S.goals[g.id] && g.check(S)) {
        S.goals[g.id] = S.day; S.cash += g.reward;
        AE.msg(S, 'Ziel erreicht: ' + g.text + ' (+' + AE.money(g.reward) + ')', 'good');
        if (AE.onGoal) AE.onGoal(g);
      }
    });
    if (S.day % 10 === 0) {
      const rk = AE.ranks(S);
      if (rk.size < S.best.size) { if (S.best.size < 99) AE.msg(S, 'Neuer Platz ' + rk.size + ' in der Größen-Weltrangliste!', 'good'); S.best.size = rk.size; }
      if (rk.quality < S.best.quality) { if (S.best.quality < 99) AE.msg(S, 'Neuer Platz ' + rk.quality + ' in der Qualitäts-Weltrangliste!', 'good'); S.best.quality = rk.quality; }
    }
    if (S.cash < 0) { S.negDays++; if (S.negDays === 5) AE.msg(S, 'Achtung: Dein Konto ist im Minus! Nimm einen Kredit auf oder spare.', 'bad'); }
    else S.negDays = 0;
    if (S.negDays >= 30 && !S.bankrupt) { S.bankrupt = true; AE.msg(S, 'Insolvenz! Dein Flughafen ist pleite.', 'bad'); }
    return T;
  };

  AE.maxLoan = S => 20000 * Math.pow(2, S.level - 1);
  AE.borrow = function (S, amt) {
    if (S.loan + amt > AE.maxLoan(S)) return 'Kreditrahmen erreicht (' + AE.money(AE.maxLoan(S)) + ').';
    S.loan += amt; S.cash += amt; return null;
  };
  AE.repay = function (S, amt) {
    amt = Math.min(amt, S.loan);
    if (S.cash < amt) return 'Nicht genug Geld.';
    S.loan -= amt; S.cash -= amt; return null;
  };

  /* ---------------- Speichern ---------------- */
  AE.serialize = function (S) {
    const o = Object.assign({}, S);
    delete o.occ; delete o.cap; delete o.today;
    o.road = S.road.join('');
    return JSON.stringify(o);
  };
  AE.deserialize = function (str) {
    const o = JSON.parse(str);
    o.road = o.road.split('').map(Number);
    o.today = null;
    AE.recalc(o);
    return o;
  };
  AE.save = function (S) {
    try { localStorage.setItem(SAVE_KEY, AE.serialize(S)); return true; } catch (e) { return false; }
  };
  AE.load = function () {
    try { const s = localStorage.getItem(SAVE_KEY); return s ? AE.deserialize(s) : null; } catch (e) { return null; }
  };
  AE.hasSave = () => { try { return !!localStorage.getItem(SAVE_KEY); } catch (e) { return false; } };
  AE.wipeSave = () => { try { localStorage.removeItem(SAVE_KEY); } catch (e) { /* ignore */ } };

  if (typeof module !== 'undefined') module.exports = AE;
})(window.AE = window.AE || {});
