/* Airport Empire – statische Spieldaten */
(function (AE) {
  'use strict';

  AE.C = {
    COLS: 40, ROWS: 24, TILE: 26,
    PLOT_W: 8, PLOT_H: 6,          // Landparzellen
    TILE_M: 150,                   // 1 Feld = 150 m Pistenlänge
    DAY_SEC: 10,                   // Sekunden pro Spieltag bei 1x
    DAYS_PER_MONTH: 10, MONTHS: 12,
    START_YEAR: 2026,
  };
  AE.C.DAYS_PER_YEAR = AE.C.DAYS_PER_MONTH * AE.C.MONTHS;
  AE.MONTH_NAMES = ['Jan', 'Feb', 'Mär', 'Apr', 'Mai', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez'];

  /* ---------- Städte (lat, lon, Einwohner Großraum in Mio.) ---------- */
  const rawCities = [
    ['ber', 'Berlin', 'DE', 52.52, 13.40, 4.5], ['ham', 'Hamburg', 'DE', 53.55, 10.00, 3.3],
    ['muc', 'München', 'DE', 48.14, 11.58, 3.0], ['fra', 'Frankfurt', 'DE', 50.11, 8.68, 2.7],
    ['cgn', 'Köln', 'DE', 50.94, 6.96, 3.1], ['str', 'Stuttgart', 'DE', 48.78, 9.18, 2.7],
    ['dus', 'Düsseldorf', 'DE', 51.23, 6.78, 3.0], ['lej', 'Leipzig', 'DE', 51.34, 12.37, 1.1],
    ['vie', 'Wien', 'AT', 48.21, 16.37, 2.9], ['zrh', 'Zürich', 'CH', 47.38, 8.54, 1.8],
    ['par', 'Paris', 'FR', 48.86, 2.35, 12.0], ['lon', 'London', 'GB', 51.51, -0.13, 14.0],
    ['ams', 'Amsterdam', 'NL', 52.37, 4.90, 2.9], ['mad', 'Madrid', 'ES', 40.42, -3.70, 6.8],
    ['bcn', 'Barcelona', 'ES', 41.39, 2.17, 5.6], ['rom', 'Rom', 'IT', 41.90, 12.50, 4.3],
    ['mil', 'Mailand', 'IT', 45.46, 9.19, 4.3], ['lis', 'Lissabon', 'PT', 38.72, -9.14, 2.9],
    ['ath', 'Athen', 'GR', 37.98, 23.73, 3.8], ['ist', 'Istanbul', 'TR', 41.01, 28.98, 15.5],
    ['cph', 'Kopenhagen', 'DK', 55.68, 12.57, 2.1], ['sto', 'Stockholm', 'SE', 59.33, 18.07, 2.4],
    ['osl', 'Oslo', 'NO', 59.91, 10.75, 1.5], ['waw', 'Warschau', 'PL', 52.23, 21.01, 3.1],
    ['prg', 'Prag', 'CZ', 50.08, 14.44, 2.7], ['bud', 'Budapest', 'HU', 47.50, 19.04, 3.0],
    ['dub', 'Dublin', 'IE', 53.35, -6.26, 2.0], ['rkv', 'Reykjavik', 'IS', 64.15, -21.94, 0.24],
    ['mos', 'Moskau', 'RU', 55.76, 37.62, 17.0], ['dxb', 'Dubai', 'AE', 25.20, 55.27, 3.6],
    ['cai', 'Kairo', 'EG', 30.04, 31.24, 21.0], ['jnb', 'Johannesburg', 'ZA', -26.20, 28.05, 10.0],
    ['nbo', 'Nairobi', 'KE', -1.29, 36.82, 5.0], ['bom', 'Mumbai', 'IN', 19.08, 72.88, 21.0],
    ['del', 'Delhi', 'IN', 28.61, 77.21, 32.0], ['sin', 'Singapur', 'SG', 1.35, 103.82, 5.9],
    ['bkk', 'Bangkok', 'TH', 13.76, 100.50, 11.0], ['hkg', 'Hongkong', 'HK', 22.32, 114.17, 7.5],
    ['pek', 'Peking', 'CN', 39.90, 116.41, 21.0], ['tyo', 'Tokio', 'JP', 35.68, 139.69, 37.0],
    ['sel', 'Seoul', 'KR', 37.57, 126.98, 25.0], ['syd', 'Sydney', 'AU', -33.87, 151.21, 5.3],
    ['akl', 'Auckland', 'NZ', -36.85, 174.76, 1.7], ['nyc', 'New York', 'US', 40.71, -74.01, 20.0],
    ['chi', 'Chicago', 'US', 41.88, -87.63, 9.5], ['lax', 'Los Angeles', 'US', 34.05, -118.24, 13.0],
    ['yyz', 'Toronto', 'CA', 43.65, -79.38, 6.4], ['mex', 'Mexiko-Stadt', 'MX', 19.43, -99.13, 22.0],
    ['gru', 'São Paulo', 'BR', -23.55, -46.63, 22.0], ['eze', 'Buenos Aires', 'AR', -34.60, -58.38, 15.0],
    ['bog', 'Bogotá', 'CO', 4.71, -74.07, 11.0], ['lim', 'Lima', 'PE', -12.05, -77.04, 10.7],
  ];
  AE.CITIES = rawCities.map(c => ({
    id: c[0], name: c[1], country: c[2], lat: c[3], lon: c[4], pop: c[5],
    rwy: Math.round((2000 + Math.min(c[5], 20) * 95) / 50) * 50,   // Pistenlänge in m
  }));
  AE.CITY = Object.fromEntries(AE.CITIES.map(c => [c.id, c]));
  AE.HOME_CHOICES = ['ber', 'ham', 'muc', 'fra', 'cgn', 'str', 'dus', 'lej', 'vie', 'zrh'];

  AE.dist = function (a, b) {                    // Großkreisdistanz in km
    const R = 6371, rad = Math.PI / 180;
    const dLat = (b.lat - a.lat) * rad, dLon = (b.lon - a.lon) * rad;
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLon / 2) ** 2;
    return Math.round(2 * R * Math.asin(Math.sqrt(h)));
  };

  /* grobe Kontinent-Umrisse für die Streckenkarte [lon, lat] */
  AE.LAND = [
    [[-168, 66], [-140, 70], [-95, 72], [-80, 68], [-62, 58], [-55, 48], [-70, 42], [-76, 35], [-81, 25], [-90, 29], [-97, 26], [-97, 19], [-90, 21], [-83, 10], [-78, 8], [-86, 14], [-96, 16], [-105, 22], [-112, 30], [-117, 32], [-125, 42], [-124, 48], [-135, 58], [-150, 60], [-166, 60]],
    [[-78, 8], [-60, 10], [-50, 0], [-35, -6], [-40, -20], [-48, -28], [-58, -38], [-66, -48], [-70, -54], [-75, -48], [-72, -30], [-70, -18], [-80, -6]],
    [[-10, 36], [-9, 43], [-1, 46], [-4, 48], [2, 51], [8, 54], [10, 57], [14, 55], [22, 58], [22, 66], [30, 71], [60, 70], [80, 73], [110, 77], [140, 72], [170, 69], [178, 65], [165, 60], [156, 51], [142, 52], [140, 42], [130, 35], [126, 38], [122, 40], [121, 31], [119, 23], [108, 21], [106, 10], [100, 13], [100, 2], [104, 1], [98, 8], [92, 20], [88, 22], [80, 15], [78, 8], [73, 16], [72, 21], [66, 25], [57, 25], [56, 27], [50, 29], [48, 30], [52, 24], [59, 22], [43, 13], [39, 21], [35, 29], [34, 32], [36, 36], [27, 37], [26, 40], [23, 38], [20, 40], [18, 40], [16, 38], [12, 38], [8, 44], [3, 43], [-2, 37]],
    [[-17, 21], [-10, 31], [-5, 36], [10, 37], [20, 32], [32, 31], [35, 27], [43, 12], [51, 12], [42, -2], [40, -15], [35, -24], [32, -29], [26, -34], [19, -35], [15, -26], [12, -15], [9, -1], [9, 4], [-8, 4], [-17, 14]],
    [[114, -22], [122, -18], [130, -12], [137, -12], [142, -11], [146, -19], [153, -26], [150, -37], [141, -38], [135, -34], [129, -31], [115, -34]],
    [[-5, 50], [1, 51], [2, 53], [-2, 58], [-6, 57], [-5, 54]],
    [[-53, 60], [-45, 60], [-20, 70], [-20, 82], [-60, 82], [-72, 77], [-55, 68]],
  ];

  /* ---------- Flugzeugmodelle ---------- */
  // sim.vs = Überziehgeschwindigkeit (sauber) in m/s, twr = Schub/Gewicht, alt = Reiseflughöhe in m
  AE.MODELS = [
    { id: 'falke', name: 'Falke 208', type: 'Turboprop', cls: 'S', seats: 12, cruise: 330, range: 1200, price: 42000, burn: 0.55, lvl: 1, sim: { vs: 36, twr: 0.34, alt: 3000, len: 11 } },
    { id: 'kolibri', name: 'Kolibri 72', type: 'Regional-Turboprop', cls: 'S', seats: 70, cruise: 510, range: 1900, price: 190000, burn: 2.4, lvl: 2, sim: { vs: 46, twr: 0.30, alt: 6000, len: 22 } },
    { id: 'sperber', name: 'Sperber 320', type: 'Schmalrumpf-Jet', cls: 'M', seats: 160, cruise: 830, range: 5500, price: 720000, burn: 6.5, lvl: 3, sim: { vs: 64, twr: 0.30, alt: 10500, len: 37 } },
    { id: 'condor', name: 'Condor 330', type: 'Großraum-Jet', cls: 'L', seats: 300, cruise: 870, range: 11000, price: 2300000, burn: 12, lvl: 4, sim: { vs: 70, twr: 0.28, alt: 11500, len: 58 } },
    { id: 'titan', name: 'Titan 380', type: 'Riesen-Jet', cls: 'L', seats: 520, cruise: 900, range: 14000, price: 5200000, burn: 21, lvl: 5, sim: { vs: 75, twr: 0.27, alt: 11000, len: 72 } },
  ];
  AE.MODEL = Object.fromEntries(AE.MODELS.map(m => [m.id, m]));
  AE.CLS_ORDER = { S: 1, M: 2, L: 3 };
  AE.CLS_MIN_TILES = { S: 6, M: 12, L: 18 };
  AE.CLS_NAME = { S: 'Klein (ab 6 Felder)', M: 'Mittel (ab 12 Felder)', L: 'Groß (ab 18 Felder)' };
  AE.LANDING_FEE = { S: 110, M: 320, L: 780 };
  AE.VISIT_SEATS = { S: 38, M: 150, L: 380 };   // Ø Sitze der Gastairlines je Klasse

  /* ---------- Gebäude ---------- */
  // cat: infra | build | service | tool
  AE.BUILD = {
    taxi: { name: 'Rollweg', cat: 'infra', w: 1, h: 1, cost: 40, upkeep: 0.2, lvl: 1, paint: true, road: 1, color: '#7d8289', desc: 'Verbindet Pisten und Gates. Gestrichelt malen: Maustaste gedrückt halten.' },
    runway: { name: 'Piste', cat: 'infra', w: 1, h: 1, cost: 300, upkeep: 1, lvl: 1, paint: true, road: 2, color: '#2f3339', desc: 'Gerade Reihe aus Feldern. Länge 6 = Propeller, 12 = Jets, 18 = Langstrecke.' },
    gate: { name: 'Gate', cat: 'infra', w: 2, h: 2, cost: 3000, upkeep: 30, lvl: 1, color: '#c9ced4', desc: 'Stellplatz für ein Flugzeug (12 Bewegungen/Tag). Muss an einen Rollweg grenzen.' },
    terminal: { name: 'Terminal', cat: 'build', w: 3, h: 2, cost: 5000, upkeep: 70, lvl: 1, cap: 600, color: '#d8dde3', desc: 'Fertigt 600 Passagiere pro Tag ab.' },
    terminal2: { name: 'Großterminal', cat: 'build', w: 4, h: 3, cost: 60000, upkeep: 500, lvl: 3, cap: 2800, color: '#cfd8e3', desc: 'Fertigt 2.800 Passagiere pro Tag ab.' },
    terminal3: { name: 'Megaterminal', cat: 'build', w: 6, h: 3, cost: 900000, upkeep: 4000, lvl: 5, cap: 12000, color: '#c3d3e6', desc: 'Fertigt 12.000 Passagiere pro Tag ab.' },
    tower: { name: 'Tower', cat: 'build', w: 2, h: 2, cost: 25000, upkeep: 150, lvl: 2, color: '#e3e6ea', desc: 'Flugsicherung: +40 Bewegungen/Tag und mehr Sicherheit. Ohne Tower sind nur 16 möglich.' },
    fire: { name: 'Feuerwache', cat: 'build', w: 2, h: 2, cost: 15000, upkeep: 90, lvl: 2, color: '#d9534f', desc: 'Sicherheit +. Pflicht für Großraumjets (Klasse Groß).' },
    hangar: { name: 'Hangar', cat: 'build', w: 3, h: 2, cost: 20000, upkeep: 100, lvl: 2, color: '#9aa4b0', desc: 'Platz für 3 Flugzeuge deiner Flotte, Wartung senkt Schäden.' },
    fuel: { name: 'Tanklager', cat: 'build', w: 2, h: 2, cost: 12000, upkeep: 70, lvl: 2, color: '#b8a05a', desc: 'Senkt Treibstoffkosten deiner Flotte um 15 %.' },
    radar: { name: 'Radar', cat: 'build', w: 2, h: 2, cost: 500000, upkeep: 1200, lvl: 4, color: '#8ab4d8', desc: '+30 Bewegungen/Tag, mehr Sicherheit und Pünktlichkeit.' },
    shop: { name: 'Shop', cat: 'service', w: 2, h: 1, cost: 2500, upkeep: 30, lvl: 1, cap: 450, color: '#f2b84b', desc: 'Einzelhandel: Umsatz je Passagier. Muss im Umkreis des Terminals stehen.' },
    restaurant: { name: 'Restaurant', cat: 'service', w: 2, h: 1, cost: 6000, upkeep: 60, lvl: 2, cap: 380, color: '#e9794f', desc: 'Gastronomie: Umsatz und Zufriedenheit.' },
    parking: { name: 'Parkplatz', cat: 'service', w: 3, h: 2, cost: 3000, upkeep: 25, lvl: 1, cap: 150, color: '#575d66', desc: 'Parkgebühren (150 Autos/Tag).' },
    hotel: { name: 'Hotel', cat: 'service', w: 3, h: 3, cost: 400000, upkeep: 1000, lvl: 3, cap: 90, color: '#7e6bb5', desc: 'Übernachtungen und mehr Komfort.' },
    bus: { name: 'Bus & Bahn', cat: 'service', w: 2, h: 2, cost: 12000, upkeep: 50, lvl: 2, color: '#4a90a4', desc: 'Anbindung: +10 % Nachfrage je Station (max. 4).' },
    park: { name: 'Grünanlage', cat: 'service', w: 1, h: 1, cost: 150, upkeep: 2, lvl: 1, color: '#3f8a46', desc: 'Verschönert die Umgebung – mehr Zufriedenheit.' },
  };
  AE.BUILD_ORDER = {
    infra: ['runway', 'taxi', 'gate'],
    build: ['terminal', 'terminal2', 'terminal3', 'tower', 'fire', 'hangar', 'fuel', 'radar'],
    service: ['shop', 'restaurant', 'parking', 'hotel', 'bus', 'park'],
  };

  /* ---------- Flughafen-Stufen ---------- */
  AE.LEVELS = [
    { name: 'Flugplatz', pax: 0 },
    { name: 'Regionalflughafen', pax: 3000 },
    { name: 'Verkehrsflughafen', pax: 40000 },
    { name: 'Internationaler Flughafen', pax: 250000 },
    { name: 'Drehkreuz', pax: 900000 },
    { name: 'Mega-Hub', pax: 2500000 },
  ];
  AE.PILOT_RANKS = [
    { name: 'Flugschüler', xp: 0 }, { name: 'Copilot', xp: 300 }, { name: 'Kapitän', xp: 1000 },
    { name: 'Senior-Kapitän', xp: 2500 }, { name: 'Chefpilot', xp: 6000 }, { name: 'Legende der Lüfte', xp: 12000 },
  ];

  /* ---------- Rivalen (Weltrangliste) ---------- */
  AE.RIVALS = [
    { name: 'Atlantic Gateway', city: 'New York', pax: 1900000, rating: 76, growth: 0.02 },
    { name: 'Gulf Meridian', city: 'Dubai', pax: 1700000, rating: 88, growth: 0.03 },
    { name: 'Pacific Crown', city: 'Tokio', pax: 1500000, rating: 91, growth: 0.02 },
    { name: 'Nordsee International', city: 'Amsterdam', pax: 1150000, rating: 82, growth: 0.025 },
    { name: 'Great Lakes Intl', city: 'Chicago', pax: 900000, rating: 70, growth: 0.02 },
    { name: 'Alpen Airport', city: 'Zürich', pax: 600000, rating: 90, growth: 0.02 },
    { name: 'Southern Cross Hub', city: 'Sydney', pax: 450000, rating: 79, growth: 0.03 },
    { name: 'Iberia Sol', city: 'Madrid', pax: 300000, rating: 72, growth: 0.03 },
    { name: 'Baltic Air Port', city: 'Riga', pax: 170000, rating: 68, growth: 0.035 },
    { name: 'Andes Regional', city: 'Lima', pax: 100000, rating: 62, growth: 0.03 },
  ];

  /* ---------- Hilfsfunktionen ---------- */
  AE.fmt = n => Math.round(n).toLocaleString('de-DE');
  AE.money = n => (n < 0 ? '−' : '') + '€' + Math.abs(Math.round(n)).toLocaleString('de-DE');
  AE.clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  AE.rand = (a, b) => a + Math.random() * (b - a);
  AE.pick = arr => arr[Math.floor(Math.random() * arr.length)];
})(window.AE = window.AE || {});
