# ✈ Airport Empire

**Baue deinen eigenen Flughafen, bringe ihn wirtschaftlich voran – und fliege die Strecken selbst im Flugsimulator.**
Dein Ziel: der **größte** und **beste** Flughafen der Welt.

Ein Browserspiel ohne Installation, ohne Abhängigkeiten – reines HTML, CSS und JavaScript.

▶ **Spielen:** <https://dennisotte.github.io/airport-empire/>

---

## Spielprinzip

### 🏗 Flughafen bauen (Aufbau-Simulation)
Inspiriert von *SimCity* und dem *Landwirtschafts-Simulator*:

- Du startest mit einem kleinen Flugplatz auf eigenem Grundstück und **kaufst Land** dazu, wenn du wachsen willst.
- **Pisten** (Länge bestimmt die Flugzeugklasse: 6 Felder = Propeller, 12 = Jets, 18 = Langstrecke), **Rollwege**, **Gates**, **Terminals** in drei Größen, **Tower**, **Radar**, **Feuerwache**, **Hangar**, **Tanklager**, **Shops**, **Restaurants**, **Parkplätze**, **Hotel**, **Bus & Bahn**, **Grünanlagen**.
- Pisten und Gates müssen über Rollwege **verbunden** sein, sonst zählen sie nicht.
- Ein **Berater** weist dich auf Engpässe hin (Terminal voll, Tower fehlt, Nachfrage zu hoch …).
- Auf der Karte siehst du den Betrieb live: landende, rollende und startende Flugzeuge, Tag-und-Nacht-Wechsel, Pistenbefeuerung.

### 📈 Wirtschaft
- Einnahmen: Landegebühren, Passagiergebühren, Einzelhandel, Gastronomie, Parken, Hotel, Tickets der eigenen Airline.
- Ausgaben: Unterhalt, Personal, Zinsen, Flotte.
- **Politik-Regler** wie im Städtebau: Gebühren und Service-Budget – Gewinn gegen Nachfrage und Zufriedenheit.
- **Kredite**, zufällige **Ereignisse** (Messe, Streik, Sturm, Kerosin-Krise …) und **Insolvenzgefahr**.
- **6 Ausbaustufen** vom Flugplatz bis zum Mega-Hub, dazu **15 Ziele** mit Belohnungen.
- **Weltrangliste** gegen 10 Rivalen – getrennt nach *Größe* (Passagiere/Jahr) und *Qualität* (Service, Sicherheit, Pünktlichkeit).

### 🛩 Selbst fliegen (Flugsimulator)
Kaufe Flugzeuge (5 Modelle vom Turboprop bis zum Riesen-Jet), schicke sie auf **Linienstrecken** zu 52 Städten weltweit – oder setze dich selbst ans Steuer:

- **Echte Phasen:** Startlauf, Rotation, Steigflug, Reiseflug, Sinkflug, Anflug, Landung.
- Vereinfachte, aber glaubwürdige **Flugphysik**: Nickwinkel, Schub, Auftrieb und Strömungsabriss, Klappen, Fahrwerk, Bremsen, Luftdichte mit der Höhe.
- **Geschwindigkeits- und Höhenband**, Vr/Vref-Marken, Sinkrate, Gleitpfad-Anzeige (3°), Warnungen (Stall, Sinkrate, Fahrwerk).
- **Autopilot** mit Zielhöhe und **Zeitraffer bis ×240** im Reiseflug, Turbulenzen, Tower-Meldungen.
- **Anflug-Hilfe** für Einsteiger (dafür −15 % Erlös).
- Je besser die Landung, desto höher der Erlös (bis **2×**) – harte Landungen beschädigen das Flugzeug, ein Absturz kostet es.
- Pilotenrang und Erfahrungspunkte.

Die Pistenlänge deines **eigenen** Flughafens gilt im Simulator – kurze Pisten sind ein echtes Risiko.

---

## Steuerung

### Flughafen
| Eingabe | Aktion |
|---|---|
| Klick / Ziehen | Bauen (Pisten und Rollwege lassen sich malen) |
| `R` | Gebäude drehen |
| `B` | Abriss-Werkzeug |
| `Esc` / Rechtsklick | Werkzeug abwählen |
| `Leertaste` | Pause |
| `1`–`4` | Spieltempo |

### Flugsimulator
| Taste | Aktion |
|---|---|
| `↑` `↓` | Nase heben / senken |
| `W` `S` | Schub erhöhen / senken |
| `X` / `Z` | Vollschub / Leerlauf |
| `F` / `V` | Klappen ausfahren / einfahren |
| `G` | Fahrwerk |
| `B` | Bremsen (am Boden) |
| `P` | Autopilot an/aus |
| `C` / `D` | Autopilot: Reiseflughöhe / Sinkflug |
| `[` `]` | Zielhöhe ∓ 1.000 ft |
| `A` | Anflug-Hilfe |
| `T` | Zeitraffer |
| `Leertaste` / `Esc` | Pause / Abbruch |

Alle Funktionen gibt es auch als Schaltflächen unter dem Bild (Touch-tauglich).

**Kurzanleitung Start:** Klappen auf Stufe 2 (`F`), Vollschub (`X`), bei Vr (blaue Marke im Geschwindigkeitsband) die Nase auf ca. 9° ziehen, Fahrwerk einfahren (`G`), dann `C` für den Autopilot.
**Kurzanleitung Landung:** Im Anflug dem grünen 3°-Gleitpfad folgen, Fahrwerk (`G`) und Klappen 3, bei ca. 15 m abfangen (Nase leicht heben, Schub auf Leerlauf), nach dem Aufsetzen `B`.

---

## Lokal starten

Es ist keine Installation nötig. Entweder `index.html` per Doppelklick öffnen oder einen kleinen Server starten:

```bash
python3 -m http.server 8000
```

Dann `http://localhost:8000` aufrufen. Der Spielstand wird automatisch im Browser gespeichert (`localStorage`).

## Auf GitHub Pages veröffentlichen

1. Repository auf GitHub anlegen (z. B. `airport-empire`) und alle Dateien hochladen.
2. Im Repository: **Settings → Pages → Build and deployment → Source: „Deploy from a branch“**.
3. Branch `main` und Ordner `/ (root)` wählen, speichern.
4. Nach etwa einer Minute ist das Spiel unter `https://dennisotte.github.io/airport-empire/` erreichbar.

## Projektstruktur

```
index.html          Seite und Titelbildschirm
css/style.css       Gestaltung
js/data.js          Städte, Flugzeuge, Gebäude, Stufen, Rivalen
js/economy.js       Spielzustand, Bauregeln, Wirtschaftsmodell (ohne DOM)
js/tycoon.js        Karte: Zeichnen, Bau-Eingaben, Flugzeug-Animation
js/flightcore.js    Flugphysik und Autopilot (ohne DOM)
js/flightsim.js     Simulator: Darstellung, Cockpit-Anzeigen, Steuerung
js/audio.js         Klänge per WebAudio
js/ui.js            Panels, Menüs, Spielschleife
```

`economy.js` und `flightcore.js` laufen auch unter Node.js und lassen sich dort automatisiert testen.

## Lizenz

MIT – siehe [LICENSE](LICENSE). Alle Flughafen- und Flugzeugnamen im Spiel (z. B. „Falke 208“, „Titan 380“, die Rivalen) sind frei erfunden; die Städte sind echte Orte, ihre Daten sind für das Spiel vereinfacht.
