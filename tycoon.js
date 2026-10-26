/* Airport Empire – Karte: Zeichnen, Bau-Eingaben und Flugzeug-Animation */
(function (AE) {
  'use strict';
  const { COLS, ROWS, TILE: T } = AE.C;
  const W = COLS * T, H = ROWS * T, TAU = Math.PI * 2;
  const clamp = AE.clamp;
  const M = AE.Map = { W, H, tool: { kind: 'none' }, rot: false, hover: null, night: 0, speed: 1 };
  let cv, cx, S = null, dpr = 1, painting = false, lastPaint = null, agents = [], spawnAcc = 0, time = 0;
  let trees = [];

  const isRoad = (x, y) => x >= 0 && y >= 0 && x < COLS && y < ROWS && S.road[y * COLS + x] > 0;
  const roadAt = (x, y) => (x >= 0 && y >= 0 && x < COLS && y < ROWS) ? S.road[y * COLS + x] : 0;

  M.init = function (canvas) {
    cv = canvas; dpr = Math.min(window.devicePixelRatio || 1, 2);
    cv.width = W * dpr; cv.height = H * dpr;
    cx = cv.getContext('2d');
    // Bäume (feste Zufallswerte)
    let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    for (let i = 0; i < 160; i++) trees.push({ x: rnd() * COLS, y: rnd() * ROWS, r: 5 + rnd() * 6, c: rnd() });
    cv.addEventListener('pointerdown', onDown);
    cv.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    cv.addEventListener('pointerleave', () => { M.hover = null; });
    cv.addEventListener('contextmenu', e => { e.preventDefault(); M.setTool({ kind: 'none' }); });
  };
  M.setState = function (s) { S = s; agents = []; };
  M.resetAgents = () => { agents = []; };
  M.setTool = function (t) {
    M.tool = t; M.rot = false;
    if (M.onTool) M.onTool(t);
  };

  /* ---------------- Eingaben ---------------- */
  function tileFromEvent(e) {
    const r = cv.getBoundingClientRect();
    const px = (e.clientX - r.left) * W / r.width, py = (e.clientY - r.top) * H / r.height;
    return { x: Math.floor(px / T), y: Math.floor(py / T), px, py };
  }
  function ghostOrigin(h) {
    const b = AE.BUILD[M.tool.key]; if (!b) return null;
    const w = M.rot ? b.h : b.w, hh = M.rot ? b.w : b.h;
    return { x: h.x - Math.floor((w - 1) / 2), y: h.y - Math.floor((hh - 1) / 2), w, h: hh };
  }
  function changed(structural) {
    if (structural) M.resetAgents();
    if (M.onChange) M.onChange(structural);
  }
  function act(h, first) {
    const t = M.tool;
    if (!S || !h) return;
    if (t.kind === 'build') {
      const b = AE.BUILD[t.key];
      if (b.paint) {
        const r = AE.place(S, t.key, h.x, h.y);
        if (r.ok) { changed(true); if (M.sfx) M.sfx('build'); }
        else if (first && M.toast) M.toast(r.reason, 'bad');
        return;
      }
      const g = ghostOrigin(h);
      const w = M.rot ? b.h : b.w, hh = M.rot ? b.w : b.h;
      const bb = Object.assign({}, b, { w, h: hh });
      // temporär rotiertes Maß für die Prüfung
      const saved = AE.BUILD[t.key]; AE.BUILD[t.key] = bb;
      const r = AE.place(S, t.key, g.x, g.y);
      AE.BUILD[t.key] = saved;
      if (r.ok) { changed(true); if (M.sfx) M.sfx('build'); }
      else if (M.toast) M.toast(r.reason, 'bad');
    } else if (t.kind === 'bulldoze') {
      if (AE.bulldoze(S, h.x, h.y)) { changed(true); if (M.sfx) M.sfx('bulldoze'); }
    } else if (t.kind === 'land') {
      const idx = AE.plotIndex(h.x, h.y);
      const err = AE.buyPlot(S, idx);
      if (err) { if (first && M.toast) M.toast(err, 'bad'); } else { changed(true); if (M.sfx) M.sfx('buy'); if (M.toast) M.toast('Land gekauft!', 'good'); }
    } else if (t.kind === 'none' || t.kind === 'info') {
      if (first && M.onInspect) M.onInspect(h);
    }
  }
  function onDown(e) {
    if (e.button === 2) return;
    const h = tileFromEvent(e); M.hover = h;
    painting = true; lastPaint = h;
    cv.setPointerCapture && cv.setPointerCapture(e.pointerId);
    act(h, true);
  }
  function onMove(e) {
    const h = tileFromEvent(e); M.hover = h;
    if (!painting) return;
    const t = M.tool;
    const drag = (t.kind === 'build' && AE.BUILD[t.key].paint) || t.kind === 'bulldoze';
    if (!drag || !lastPaint) return;
    // Linie zwischen den Punkten, damit nichts ausgelassen wird
    let x0 = lastPaint.x, y0 = lastPaint.y; const x1 = h.x, y1 = h.y;
    const dx = Math.abs(x1 - x0), dy = Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
    let err = dx - dy, guard = 0;
    while (guard++ < 80) {
      if (x0 !== lastPaint.x || y0 !== lastPaint.y) act({ x: x0, y: y0 }, false);
      if (x0 === x1 && y0 === y1) break;
      const e2 = 2 * err;
      if (e2 > -dy) { err -= dy; x0 += sx; }
      if (e2 < dx) { err += dx; y0 += sy; }
    }
    lastPaint = h;
  }
  function onUp() { painting = false; lastPaint = null; }

  M.describeTile = function (h) {
    if (!S || !h || h.x < 0 || h.y < 0 || h.x >= COLS || h.y >= ROWS) return '';
    if (!AE.plotOwned(S, h.x, h.y)) {
      const idx = AE.plotIndex(h.x, h.y);
      return AE.plotAdjacent(S, idx) ? 'Grundstück zu verkaufen – ' + AE.money(AE.plotPrice(S)) + ' (Werkzeug „Land kaufen“)' : 'Fremdes Land – kaufe zuerst angrenzende Grundstücke.';
    }
    const bi = S.occ[h.y * COLS + h.x];
    if (bi >= 0) {
      const b = S.blds[bi], d = AE.BUILD[b.type];
      let extra = '';
      if (b.type === 'gate') extra = b.eff ? ' · aktiv' : ' · NICHT angebunden (Rollweg zu einer Piste fehlt)';
      return d.name + extra + ' – ' + d.desc;
    }
    const r = S.road[h.y * COLS + h.x];
    if (r === 1) return 'Rollweg';
    if (r === 2) {
      const run = (S.cap.runs || []).find(u => u.dir === 'h' ? (u.y === h.y && h.x >= u.x && h.x < u.x + u.len) : (u.x === h.x && h.y >= u.y && h.y < u.y + u.len));
      if (!run) return 'Pistenstück – zu kurz (mind. 6 Felder in einer Reihe)';
      return 'Piste: ' + run.len * AE.C.TILE_M + ' m · Klasse ' + ({ S: 'Klein', M: 'Mittel', L: 'Groß' })[run.cls] + (run.eff ? '' : ' · nicht angebunden (Gate + Rollweg fehlen)');
    }
    return 'Freies Gelände';
  };

  /* ---------------- Zeichnen ---------------- */
  const col = (hex, a) => { const n = parseInt(hex.slice(1), 16); return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${a})`; };

  function drawBuilding(g, b, opts) {
    const d = AE.BUILD[b.type], x = b.x * T, y = b.y * T, w = b.w * T, h = b.h * T;
    const night = (opts && opts.night) || 0;
    const glow = night > 0.3;
    g.save();
    // Schatten
    g.fillStyle = 'rgba(0,0,0,.22)'; g.fillRect(x + 3, y + 3, w - 1, h - 1);
    const rr = (px, py, pw, ph, r, fill) => { g.beginPath(); g.roundRect ? g.roundRect(px, py, pw, ph, r) : g.rect(px, py, pw, ph); g.fillStyle = fill; g.fill(); };
    switch (b.type) {
      case 'terminal': case 'terminal2': case 'terminal3': {
        rr(x + 1, y + 1, w - 2, h - 2, 4, '#e7eaee');
        rr(x + 4, y + 4, w - 8, h - 8, 3, d.color);
        const horiz = w >= h;
        g.fillStyle = glow ? '#ffd98a' : '#37566f';
        if (horiz) { g.fillRect(x + 6, y + h - 12, w - 12, 6); } else { g.fillRect(x + w - 12, y + 6, 6, h - 12); }
        g.fillStyle = 'rgba(255,255,255,.55)';
        const n = Math.max(2, Math.floor((horiz ? w : h) / 22));
        for (let i = 0; i < n; i++) {
          if (horiz) g.fillRect(x + 8 + i * ((w - 16) / n), y + 7, (w - 16) / n - 4, 5);
          else g.fillRect(x + 7, y + 8 + i * ((h - 16) / n), 5, (h - 16) / n - 4);
        }
        if (b.type !== 'terminal') { g.fillStyle = 'rgba(55,86,111,.25)'; g.fillRect(x + w / 2 - 1, y + 4, 2, h - 8); }
        break;
      }
      case 'gate': {
        rr(x + 1, y + 1, w - 2, h - 2, 3, '#c9ced4');
        g.strokeStyle = '#e8c547'; g.lineWidth = 1.5; g.setLineDash([5, 4]); g.strokeRect(x + 5, y + 5, w - 10, h - 10); g.setLineDash([]);
        g.fillStyle = '#4b5560'; g.font = 'bold 12px system-ui'; g.textAlign = 'center'; g.textBaseline = 'middle';
        g.fillText('G', x + w / 2, y + h / 2);
        if (!b.eff) { g.fillStyle = 'rgba(220,60,60,.55)'; g.fillRect(x + 1, y + 1, w - 2, h - 2); g.fillStyle = '#fff'; g.fillText('!', x + w / 2, y + h / 2); }
        break;
      }
      case 'tower': {
        rr(x + 1, y + 1, w - 2, h - 2, 4, '#d4d8dd');
        g.fillStyle = '#9aa6b2'; g.beginPath(); g.arc(x + w / 2, y + h / 2, Math.min(w, h) * 0.36, 0, TAU); g.fill();
        g.fillStyle = glow ? '#ffe9a8' : '#4c6a85'; g.beginPath(); g.arc(x + w / 2, y + h / 2, Math.min(w, h) * 0.24, 0, TAU); g.fill();
        g.fillStyle = '#e04f4f'; g.beginPath(); g.arc(x + w / 2, y + h / 2, 3, 0, TAU); g.fill();
        break;
      }
      case 'fire': {
        rr(x + 1, y + 1, w - 2, h - 2, 3, '#c94545');
        g.fillStyle = '#f4f4f4'; g.fillRect(x + w / 2 - 2, y + h / 2 - 8, 4, 16); g.fillRect(x + w / 2 - 8, y + h / 2 - 2, 16, 4);
        break;
      }
      case 'hangar': {
        rr(x + 1, y + 1, w - 2, h - 2, 3, '#8f99a5');
        g.strokeStyle = 'rgba(0,0,0,.2)'; g.lineWidth = 1;
        for (let i = 1; i < b.w * 3; i++) { g.beginPath(); g.moveTo(x + i * (w / (b.w * 3)), y + 2); g.lineTo(x + i * (w / (b.w * 3)), y + h - 2); g.stroke(); }
        g.fillStyle = 'rgba(255,255,255,.2)'; g.fillRect(x + 3, y + h - 8, w - 6, 5);
        break;
      }
      case 'fuel': {
        rr(x + 1, y + 1, w - 2, h - 2, 3, '#a39a6c');
        [[0.3, 0.3], [0.7, 0.3], [0.5, 0.72]].forEach(([fx, fy]) => {
          g.fillStyle = '#e9e6d2'; g.beginPath(); g.arc(x + w * fx, y + h * fy, Math.min(w, h) * 0.2, 0, TAU); g.fill();
          g.strokeStyle = 'rgba(0,0,0,.25)'; g.stroke();
        });
        break;
      }
      case 'radar': {
        rr(x + 1, y + 1, w - 2, h - 2, 3, '#d4d8dd');
        const cxm = x + w / 2, cym = y + h / 2, r = Math.min(w, h) * 0.38;
        g.fillStyle = '#7f95aa'; g.beginPath(); g.arc(cxm, cym, r, 0, TAU); g.fill();
        g.strokeStyle = '#d9f1ff'; g.lineWidth = 2; g.beginPath(); g.moveTo(cxm, cym); g.lineTo(cxm + Math.cos(time * 2.2) * r, cym + Math.sin(time * 2.2) * r); g.stroke();
        break;
      }
      case 'shop': case 'restaurant': {
        rr(x + 1, y + 1, w - 2, h - 2, 3, '#efe7da');
        const stripes = b.w * 3;
        for (let i = 0; i < stripes; i++) { g.fillStyle = i % 2 ? d.color : '#fff'; g.fillRect(x + 3 + i * ((w - 6) / stripes), y + 3, (w - 6) / stripes, h - 6); }
        if (glow) { g.fillStyle = 'rgba(255,230,150,.35)'; g.fillRect(x, y, w, h); }
        break;
      }
      case 'parking': {
        rr(x + 1, y + 1, w - 2, h - 2, 3, '#4d535b');
        g.strokeStyle = 'rgba(255,255,255,.55)'; g.lineWidth = 1;
        for (let i = 1; i < b.w * 2; i++) { g.beginPath(); g.moveTo(x + i * (w / (b.w * 2)), y + 3); g.lineTo(x + i * (w / (b.w * 2)), y + h - 3); g.stroke(); }
        const cc = ['#e05d5d', '#5d8fe0', '#e0c35d', '#d8d8d8'];
        for (let i = 0; i < b.w * 2; i++) for (let j = 0; j < b.h; j++) if ((i * 7 + j * 3 + b.x) % 3) {
          g.fillStyle = cc[(i + j + b.x) % 4]; g.fillRect(x + 3 + i * (w / (b.w * 2)), y + 5 + j * (h / b.h), w / (b.w * 2) - 5, h / b.h - 10);
        }
        break;
      }
      case 'hotel': {
        rr(x + 1, y + 1, w - 2, h - 2, 4, '#9d8bd0');
        rr(x + 6, y + 6, w - 12, h - 12, 3, '#7e6bb5');
        g.fillStyle = glow ? '#ffe39a' : 'rgba(255,255,255,.55)';
        for (let i = 0; i < b.w * 2; i++) for (let j = 0; j < b.h * 2; j++) g.fillRect(x + 9 + i * ((w - 18) / (b.w * 2)), y + 9 + j * ((h - 18) / (b.h * 2)), 5, 5);
        break;
      }
      case 'bus': {
        rr(x + 1, y + 1, w - 2, h - 2, 3, '#5aa1b5');
        g.fillStyle = '#f4f4f4'; g.fillRect(x + 6, y + h / 2 - 5, w - 12, 10);
        g.fillStyle = '#2f6a7c'; for (let i = 0; i < 4; i++) g.fillRect(x + 9 + i * ((w - 18) / 4), y + h / 2 - 3, 6, 4);
        break;
      }
      case 'park': {
        rr(x + 1, y + 1, w - 2, h - 2, 3, '#5aa352');
        g.fillStyle = '#2f7a3c'; g.beginPath(); g.arc(x + w / 2, y + h / 2, 8, 0, TAU); g.fill();
        g.fillStyle = '#3f9a4c'; g.beginPath(); g.arc(x + w / 2 - 2, y + h / 2 - 2, 5, 0, TAU); g.fill();
        break;
      }
    }
    g.restore();
  }

  function drawRoadTile(g, x, y, kind, neigh) {
    const px = x * T, py = y * T;
    if (kind === 1) {
      g.fillStyle = '#868b92'; g.fillRect(px, py, T, T);
      g.strokeStyle = '#e6c84a'; g.lineWidth = 1.5; g.beginPath();
      const c = T / 2;
      if (neigh.l) { g.moveTo(px, py + c); g.lineTo(px + c, py + c); }
      if (neigh.r) { g.moveTo(px + T, py + c); g.lineTo(px + c, py + c); }
      if (neigh.u) { g.moveTo(px + c, py); g.lineTo(px + c, py + c); }
      if (neigh.d) { g.moveTo(px + c, py + T); g.lineTo(px + c, py + c); }
      g.stroke();
    } else {
      g.fillStyle = '#2c3036'; g.fillRect(px, py, T, T);
    }
  }

  function drawRunways(g) {
    const runs = S.cap.runs || [];
    runs.forEach(r => {
      const h = r.dir === 'h', len = r.len * T;
      g.save();
      g.translate(r.x * T, r.y * T);
      if (!h) { g.translate(T, 0); g.rotate(Math.PI / 2); }
      // Randlinien
      g.strokeStyle = 'rgba(255,255,255,.75)'; g.lineWidth = 1.2;
      g.beginPath(); g.moveTo(6, 3.5); g.lineTo(len - 6, 3.5); g.moveTo(6, T - 3.5); g.lineTo(len - 6, T - 3.5); g.stroke();
      // Mittellinie
      g.setLineDash([9, 8]); g.lineWidth = 2; g.strokeStyle = '#f5f5f5';
      g.beginPath(); g.moveTo(34, T / 2); g.lineTo(len - 34, T / 2); g.stroke(); g.setLineDash([]);
      // Schwellen
      g.fillStyle = '#f5f5f5';
      for (let i = 0; i < 5; i++) { g.fillRect(4, 4 + i * 4.3, 12, 2.4); g.fillRect(len - 16, 4 + i * 4.3, 12, 2.4); }
      // Nummern
      g.fillStyle = 'rgba(255,255,255,.9)'; g.font = 'bold 9px monospace'; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.save(); g.translate(26, T / 2); g.rotate(Math.PI / 2); g.fillText(h ? '09' : '18', 0, 0); g.restore();
      g.save(); g.translate(len - 26, T / 2); g.rotate(-Math.PI / 2); g.fillText(h ? '27' : '36', 0, 0); g.restore();
      // Nachtbefeuerung
      if (M.night > 0.25) {
        g.fillStyle = 'rgba(255,240,170,' + (0.5 + 0.4 * Math.sin(time * 6)) * M.night + ')';
        for (let i = 0; i < r.len * 2; i++) { g.fillRect(8 + i * ((len - 16) / (r.len * 2)), 0.5, 2, 2); g.fillRect(8 + i * ((len - 16) / (r.len * 2)), T - 2.5, 2, 2); }
      }
      g.restore();
      if (!r.eff) {
        g.save(); g.strokeStyle = 'rgba(255,80,80,.9)'; g.lineWidth = 2; g.setLineDash([6, 5]);
        g.strokeRect(r.x * T + 1, r.y * T + 1, (h ? r.len : 1) * T - 2, (h ? 1 : r.len) * T - 2);
        g.restore();
      }
    });
  }

  function drawPlaneShape(g, len, color, alpha) {
    g.save(); g.globalAlpha = alpha;
    g.fillStyle = color;
    const wing = len * 0.95;
    g.beginPath(); g.ellipse(0, 0, len / 2, len * 0.09, 0, 0, TAU); g.fill();
    for (const s of [-1, 1]) {
      g.beginPath(); g.moveTo(len * 0.1, s * len * 0.07); g.lineTo(-len * 0.16, s * wing / 2); g.lineTo(-len * 0.28, s * wing / 2); g.lineTo(-len * 0.12, s * len * 0.07); g.closePath(); g.fill();
      g.beginPath(); g.moveTo(-len * 0.36, s * len * 0.05); g.lineTo(-len * 0.5, s * wing * 0.24); g.lineTo(-len * 0.52, s * wing * 0.24); g.lineTo(-len * 0.44, s * len * 0.05); g.closePath(); g.fill();
    }
    g.restore();
  }
  function drawAgent(g, a) {
    const k = 1 + a.alt * 0.35, so = 1.5 + a.alt * 8;
    g.save(); g.translate(a.x + so, a.y + so); g.rotate(a.h); g.scale(k, k);
    drawPlaneShape(g, a.len, '#000', 0.22 - a.alt * 0.1); g.restore();
    g.save(); g.translate(a.x, a.y); g.rotate(a.h); g.scale(k, k);
    drawPlaneShape(g, a.len, '#f4f6f8', 1);
    g.fillStyle = a.color; g.fillRect(-a.len * 0.5, -a.len * 0.045, a.len * 0.18, a.len * 0.09);
    g.fillStyle = '#31475c'; g.beginPath(); g.ellipse(a.len * 0.36, 0, a.len * 0.05, a.len * 0.04, 0, 0, TAU); g.fill();
    g.restore();
  }

  M.render = function (dt) {
    if (!S) return;
    time += dt;
    const g = cx;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, W, H);
    const t = M.tool;
    // Gelände
    for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) {
      const own = AE.plotOwned(S, x, y);
      g.fillStyle = own ? ((x + y) % 2 ? '#6aa860' : '#66a45c') : ((x + y) % 2 ? '#4b7a47' : '#487743');
      g.fillRect(x * T, y * T, T, T);
    }
    // Bäume auf fremdem Land
    trees.forEach(tr => {
      if (AE.plotOwned(S, Math.floor(tr.x), Math.floor(tr.y))) return;
      g.fillStyle = 'rgba(0,0,0,.18)'; g.beginPath(); g.arc(tr.x * T + 2, tr.y * T + 3, tr.r, 0, TAU); g.fill();
      g.fillStyle = tr.c > 0.5 ? '#2f6a3a' : '#36773f'; g.beginPath(); g.arc(tr.x * T, tr.y * T, tr.r, 0, TAU); g.fill();
    });
    // Parzellengrenzen
    g.strokeStyle = 'rgba(255,255,255,.14)'; g.lineWidth = 1; g.setLineDash([4, 5]);
    for (let px = 1; px < COLS / AE.C.PLOT_W; px++) { g.beginPath(); g.moveTo(px * AE.C.PLOT_W * T, 0); g.lineTo(px * AE.C.PLOT_W * T, H); g.stroke(); }
    for (let py = 1; py < ROWS / AE.C.PLOT_H; py++) { g.beginPath(); g.moveTo(0, py * AE.C.PLOT_H * T); g.lineTo(W, py * AE.C.PLOT_H * T); g.stroke(); }
    g.setLineDash([]);
    // Verkaufsschilder
    const nPx = COLS / AE.C.PLOT_W;
    S.plots.forEach((o, idx) => {
      if (o) return;
      const adj = AE.plotAdjacent(S, idx);
      const cxp = ((idx % nPx) + 0.5) * AE.C.PLOT_W * T, cyp = (Math.floor(idx / nPx) + 0.5) * AE.C.PLOT_H * T;
      const hot = t.kind === 'land' && adj;
      g.fillStyle = hot ? 'rgba(255,200,60,.22)' : 'rgba(0,0,0,.12)';
      g.fillRect((idx % nPx) * AE.C.PLOT_W * T, Math.floor(idx / nPx) * AE.C.PLOT_H * T, AE.C.PLOT_W * T, AE.C.PLOT_H * T);
      if (adj) {
        g.fillStyle = 'rgba(20,28,38,.78)'; g.beginPath(); g.roundRect ? g.roundRect(cxp - 54, cyp - 15, 108, 30, 8) : g.rect(cxp - 54, cyp - 15, 108, 30); g.fill();
        g.fillStyle = hot ? '#ffcf5c' : '#cfd8e3'; g.font = '600 12px system-ui'; g.textAlign = 'center'; g.textBaseline = 'middle';
        g.fillText('Zu verkaufen', cxp, cyp - 4);
        g.font = '12px system-ui'; g.fillText(AE.money(AE.plotPrice(S)), cxp, cyp + 8);
      }
    });
    // Wege
    for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) {
      const k = S.road[y * COLS + x];
      if (!k) continue;
      drawRoadTile(g, x, y, k, { l: isRoad(x - 1, y) || nearGate(x - 1, y), r: isRoad(x + 1, y) || nearGate(x + 1, y), u: isRoad(x, y - 1) || nearGate(x, y - 1), d: isRoad(x, y + 1) || nearGate(x, y + 1) });
    }
    // ungültige Pistenstücke markieren
    const inRun = new Set();
    (S.cap.runs || []).forEach(r => { for (let i = 0; i < r.len; i++) inRun.add(r.dir === 'h' ? (r.x + i) + ',' + r.y : r.x + ',' + (r.y + i)); });
    for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) {
      if (S.road[y * COLS + x] === 2 && !inRun.has(x + ',' + y)) { g.fillStyle = 'rgba(200,60,60,.55)'; g.fillRect(x * T, y * T, T, T); g.fillStyle = '#fff'; g.font = 'bold 11px system-ui'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('•', x * T + T / 2, y * T + T / 2); }
    }
    drawRunways(g);
    // Gebäude
    S.blds.forEach(b => drawBuilding(g, b, { night: M.night }));
    // Flugzeuge am Boden zuerst, dann Luft
    agents.filter(a => a.alt < 0.1).forEach(a => drawAgent(g, a));
    agents.filter(a => a.alt >= 0.1).forEach(a => drawAgent(g, a));

    // Vorschau
    const hv = M.hover;
    if (hv) {
      if (t.kind === 'build') {
        const b = AE.BUILD[t.key];
        const o = b.paint ? { x: hv.x, y: hv.y, w: 1, h: 1 } : ghostOrigin(hv);
        let ok = false, reason = '';
        const sv = AE.BUILD[t.key];
        if (!b.paint) AE.BUILD[t.key] = Object.assign({}, b, { w: o.w, h: o.h });
        const r = AE.canPlace(S, t.key, o.x, o.y); AE.BUILD[t.key] = sv;
        ok = r.ok; reason = r.reason;
        g.fillStyle = ok ? 'rgba(61,220,132,.45)' : 'rgba(255,90,90,.5)';
        g.fillRect(o.x * T, o.y * T, o.w * T, o.h * T);
        g.strokeStyle = ok ? '#3ddc84' : '#ff5a5a'; g.lineWidth = 2; g.strokeRect(o.x * T + 1, o.y * T + 1, o.w * T - 2, o.h * T - 2);
        M.ghostReason = ok ? '' : reason;
        // Einzugsgebiet für Dienste
        if (['shop', 'restaurant', 'hotel'].includes(t.key)) {
          g.strokeStyle = 'rgba(255,255,255,.35)'; g.setLineDash([3, 4]);
          g.strokeRect((o.x + o.w / 2 - 9) * T, (o.y + o.h / 2 - 7) * T, 18 * T, 14 * T); g.setLineDash([]);
        }
      } else if (t.kind === 'bulldoze' || t.kind === 'land') {
        if (t.kind === 'land') {
          const idx = AE.plotIndex(hv.x, hv.y), nx = idx % nPx, ny = Math.floor(idx / nPx);
          if (hv.x >= 0 && hv.y >= 0 && hv.x < COLS && hv.y < ROWS) {
            g.strokeStyle = '#ffcf5c'; g.lineWidth = 3; g.strokeRect(nx * AE.C.PLOT_W * T + 2, ny * AE.C.PLOT_H * T + 2, AE.C.PLOT_W * T - 4, AE.C.PLOT_H * T - 4);
          }
        } else {
          g.fillStyle = 'rgba(255,90,90,.45)'; g.fillRect(hv.x * T, hv.y * T, T, T);
        }
      } else {
        g.strokeStyle = 'rgba(255,255,255,.55)'; g.lineWidth = 1.5; g.strokeRect(hv.x * T + 0.5, hv.y * T + 0.5, T - 1, T - 1);
      }
    }
    // Nacht
    if (M.night > 0.02) { g.fillStyle = 'rgba(8,16,48,' + (M.night * 0.42).toFixed(3) + ')'; g.fillRect(0, 0, W, H); }
  };
  function nearGate(x, y) { return x >= 0 && y >= 0 && x < COLS && y < ROWS && S.occ[y * COLS + x] >= 0 && S.blds[S.occ[y * COLS + x]].type === 'gate'; }

  /* ---------------- Flugzeug-Animation ---------------- */
  function neighbors(x, y) { return [[1, 0], [-1, 0], [0, 1], [0, -1]].map(([dx, dy]) => [x + dx, y + dy]).filter(([a, b]) => isRoad(a, b)); }
  function bfsPath(from, isGoal) {
    const key = (x, y) => y * COLS + x, prev = new Map(), q = [from];
    prev.set(key(from[0], from[1]), null);
    while (q.length) {
      const c = q.shift();
      if (isGoal(c[0], c[1])) {
        const path = []; let k = key(c[0], c[1]);
        while (k != null) { path.unshift([k % COLS, (k / COLS) | 0]); k = prev.get(k); }
        return path;
      }
      for (const n of neighbors(c[0], c[1])) {
        const nk = key(n[0], n[1]);
        if (!prev.has(nk)) { prev.set(nk, key(c[0], c[1])); q.push(n); }
      }
    }
    return null;
  }
  const tc = (x, y) => ({ x: (x + 0.5) * T, y: (y + 0.5) * T });

  function spawnAgent() {
    const C = S.cap;
    const runs = (C.runs || []).filter(r => r.eff);
    const gates = S.blds.filter(b => b.type === 'gate' && b.eff && !agents.some(a => a.gate === b));
    if (!runs.length || !gates.length) return;
    const g = AE.pick(gates), run = AE.pick(runs.filter(r => r.comp === g.comp).length ? runs.filter(r => r.comp === g.comp) : runs);
    // Zugangsfeld am Gate
    let acc = null;
    for (let xx = g.x - 1; xx <= g.x + g.w && !acc; xx++) for (let yy = g.y - 1; yy <= g.y + g.h; yy++) {
      const inside = xx >= g.x && xx < g.x + g.w && yy >= g.y && yy < g.y + g.h;
      const corner = (xx < g.x || xx >= g.x + g.w) && (yy < g.y || yy >= g.y + g.h);
      if (!inside && !corner && isRoad(xx, yy)) { acc = [xx, yy]; break; }
    }
    if (!acc) return;
    const onRun = (x, y) => run.dir === 'h' ? (y === run.y && x >= run.x && x < run.x + run.len) : (x === run.x && y >= run.y && y < run.y + run.len);
    const path = bfsPath(acc, onRun);                 // Gate → Piste
    if (!path) return;
    const j = path[path.length - 1];
    const ends = run.dir === 'h' ? [[run.x, run.y], [run.x + run.len - 1, run.y]] : [[run.x, run.y], [run.x, run.y + run.len - 1]];
    const dj = e => Math.abs(e[0] - j[0]) + Math.abs(e[1] - j[1]);
    const landEnd = dj(ends[0]) >= dj(ends[1]) ? ends[0] : ends[1], farEnd = landEnd === ends[0] ? ends[1] : ends[0];
    const dir = { x: Math.sign(farEnd[0] - landEnd[0]), y: Math.sign(farEnd[1] - landEnd[1]) };
    if (!dir.x && !dir.y) return;
    const cls = AE.pick(['S', 'S', 'M', 'M', 'L'].filter(c => AE.CLS_ORDER[c] <= AE.CLS_ORDER[C.maxCls || 'S']));
    const len = { S: 20, M: 30, L: 44 }[cls];
    const A = tc(landEnd[0], landEnd[1]), B = tc(farEnd[0], farEnd[1]), J = tc(j[0], j[1]);
    const gc = { x: (g.x + g.w / 2) * T, y: (g.y + g.h / 2) * T };
    const start = { x: A.x - dir.x * T * 16, y: A.y - dir.y * T * 16 };
    const tax = path.slice().reverse().map(p => tc(p[0], p[1]));        // Piste → Gate
    const agent = {
      x: start.x, y: start.y, h: Math.atan2(dir.y, dir.x), alt: 0.85, v: 150, len, gate: g, state: 'arrive',
      color: AE.pick(['#e4572e', '#2e86de', '#f7b731', '#20bf6b', '#a55eea', '#fd9644']), wait: 0,
      wps: [
        { x: A.x - dir.x * T * 3, y: A.y - dir.y * T * 3, v: 150, alt: 0.3 },
        { x: A.x, y: A.y, v: 140, alt: 0 },
        { x: J.x, y: J.y, v: 55, alt: 0 },
        ...tax.slice(1).map(p => ({ x: p.x, y: p.y, v: 42, alt: 0 })),
        { x: gc.x, y: gc.y, v: 26, alt: 0 },
      ],
      depart: [
        ...tax.slice().reverse().map(p => ({ x: p.x, y: p.y, v: 42, alt: 0 })),
        { x: J.x, y: J.y, v: 40, alt: 0 },
        { x: B.x, y: B.y, v: 210, alt: 0 },
        { x: B.x + dir.x * T * 4, y: B.y + dir.y * T * 4, v: 230, alt: 0.45 },
        { x: B.x + dir.x * T * 22, y: B.y + dir.y * T * 22, v: 250, alt: 1 },
      ],
    };
    agents.push(agent);
  }

  M.update = function (dt, speed) {
    if (!S) return;
    const sp = Math.min(speed || 1, 4);
    // Spawn nach tatsächlicher Verkehrsmenge
    const mov = S.today ? S.today.mov : 6;
    spawnAcc += dt * sp * (mov / 2) / AE.C.DAY_SEC;
    if (spawnAcc >= 1 && agents.length < 6) { spawnAcc = 0; spawnAgent(); } else if (spawnAcc > 3) spawnAcc = 1;
    for (const a of agents) {
      if (a.state === 'gate') {
        a.wait -= dt * sp;
        if (a.wait <= 0) { a.state = 'depart'; a.wps = a.depart; }
        continue;
      }
      let left = dt * sp;
      while (left > 0 && a.wps.length) {
        const wp = a.wps[0];
        const dx = wp.x - a.x, dy = wp.y - a.y, d = Math.hypot(dx, dy);
        // Zielgeschwindigkeit weich annähern
        a.v += clamp(wp.v - a.v, -140 * left, 120 * left);
        const step = Math.max(a.v, 12) * left;
        const want = Math.atan2(dy, dx);
        let dh = ((want - a.h + Math.PI) % TAU + TAU) % TAU - Math.PI;
        a.h += clamp(dh, -9 * left, 9 * left);
        a.alt += clamp(wp.alt - a.alt, -0.45 * left, 0.45 * left);
        if (d <= step) {
          a.x = wp.x; a.y = wp.y; a.wps.shift(); left -= d / Math.max(a.v, 12);
        } else { a.x += Math.cos(a.h) * step; a.y += Math.sin(a.h) * step; left = 0; }
      }
      if (!a.wps.length) {
        if (a.state === 'arrive') { a.state = 'gate'; a.wait = AE.rand(5, 11); a.alt = 0; a.v = 0; }
        else a.dead = true;
      }
    }
    agents = agents.filter(a => !a.dead);
  };

  /* kleine Vorschau-Icons für die Werkzeugleiste */
  M.drawIcon = function (g, key, size) {
    const d = AE.BUILD[key];
    g.clearRect(0, 0, size, size);
    g.save();
    if (d.road) {
      g.fillStyle = d.road === 2 ? '#2c3036' : '#868b92'; g.fillRect(size * 0.1, size * 0.3, size * 0.8, size * 0.4);
      g.strokeStyle = d.road === 2 ? '#fff' : '#e6c84a'; g.lineWidth = 2; g.setLineDash([5, 4]);
      g.beginPath(); g.moveTo(size * 0.12, size * 0.5); g.lineTo(size * 0.88, size * 0.5); g.stroke();
    } else {
      const k = (size * 0.88) / (Math.max(d.w, d.h) * T);
      g.translate(size / 2 - d.w * T * k / 2, size / 2 - d.h * T * k / 2);
      g.scale(k, k);
      drawBuilding(g, { type: key, x: 0, y: 0, w: d.w, h: d.h, eff: true }, { night: 0 });
    }
    g.restore();
  };
})(window.AE = window.AE || {});
