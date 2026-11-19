# Flugsim – Anleitung

Ein Flugsimulator, der direkt im Browser läuft. Man muss nichts installieren.

## Öffnen

**Online (empfohlen):** https://gianfeltrin2010-code.github.io/flugsim/
(Das funktioniert, sobald der Ordner `flugsim` auf dem Hauptzweig `main` liegt.)

**Nicht per Doppelklick:** Wenn man `index.html` direkt aus dem Ordner öffnet,
blockiert der Browser aus Sicherheitsgründen Teile von Cesium, und die Erde
bleibt schwarz. Der Simulator zeigt dann einen Hinweis an.

**Lokal auf dem eigenen Computer (für Neugierige):**
1. Terminal öffnen (Mac: Programm «Terminal», Windows: «PowerShell»).
2. In den Ordner der Website wechseln, zum Beispiel `cd Downloads/gianfeltrin2010-code.github.io`.
3. `python3 -m http.server 8000` eingeben (auf Windows eventuell `python` statt `python3`).
4. Im Browser http://localhost:8000/flugsim/ öffnen.

## Kostenloser Cesium-Schlüssel (für Berge und 3D-Städte)

Ohne Schlüssel läuft der Simulator auch, aber die Erde ist dann flach
(Satellitenbild auf einer glatten Kugel). Mit Schlüssel gibt es echtes Gelände
und die fotorealistischen 3D-Städte von Google.

1. Auf https://ion.cesium.com/signup ein kostenloses Konto anlegen
   (Plan «Community», gratis für nicht kommerzielle Nutzung).
2. Links auf **Access Tokens** klicken. Dort gibt es schon einen «Default Token».
   Besser: **Create token** anklicken, einen Namen wie «Flugsim» vergeben und bei
   **Allowed URLs** eintragen:
   - `https://gianfeltrin2010-code.github.io`
   - `http://localhost:8000` (nur falls du lokal testest)

   So funktioniert der Schlüssel nur auf deiner Website. Wer ihn kopiert,
   kann damit anderswo nichts anfangen.
3. Für die 3D-Städte: Im Menü **Asset Depot** nach «Google Photorealistic 3D Tiles»
   suchen und **Add to my assets** klicken (falls es nicht schon unter «My Assets» steht).
4. Den Token kopieren und in der Datei `flugsim/config.js` zwischen die
   Anführungszeichen setzen:
   ```js
   cesiumIonToken: "eyJhbGciOi...dein-token...",
   ```
5. Speichern und hochladen (oder mir sagen, dass ich es eintragen soll).
   **Bitte den Schlüssel nicht in den Chat kopieren.** Trag ihn selbst in die
   Datei ein. Auf GitHub ist er öffentlich sichtbar, deshalb ist die
   Beschränkung auf deine Adresse in Schritt 2 wichtig.

## Tasten

| Taste | Wirkung |
|---|---|
| S / ↓ | Nase hoch (ziehen) |
| W / ↑ | Nase runter (drücken) |
| A, D / ←, → | Rollen (Kurve fliegen) |
| Q / E | Seitenruder; am Boden lenken |
| Shift, Bild↑, + | Mehr Schub |
| X, Bild↓, − | Weniger Schub |
| B | Bremsen an/aus |
| G | Fahrwerk ein/aus |
| F / V | Klappen ausfahren / einfahren |
| Z | Autopilot an/aus |
| C, 1, 2 | Kamera wechseln |
| Maus ziehen / Mausrad | Umschauen / Zoomen (Doppelklick = zurücksetzen) |
| P, R, M, H | Pause, Neustart, Menü, Hilfe |

Warum nicht Ctrl für weniger Schub? Weil Ctrl+W im Browser den Tab schliesst.
Wer gleichzeitig Ctrl und W (Nase runter) drückt, wäre sofort raus.

**Autopilot:** Mit Z hält er die aktuelle Höhe, den Kurs und das Tempo.
Solange er an ist, ändern die normalen Steuertasten die Sollwerte:
W/S für die Höhe, A/D für den Kurs, Shift/X für das Tempo.

## Erster Flug

1. **B**: Bremsen lösen.
2. **Shift** halten, bis der Schub bei etwa 90 % steht.
3. Bei rund 140 kt sanft **S** halten. Das Flugzeug hebt ab.
4. **G** (Fahrwerk ein), ab etwa 3000 ft **V V** (Klappen ein).
5. Mit **Z** den Autopiloten einschalten und mit **W** die Soll-Höhe erhöhen.

Schutzfunktionen wie bei Airbus: Die Nase lässt sich nicht beliebig hochziehen.
Wird das Flugzeug zu langsam, gibt es automatisch Vollschub («ALPHA FLOOR»).

## Technik und Lizenzen

- **CesiumJS** 1.146 (Apache-2.0-Lizenz) für Globus, Licht, Atmosphäre und Schatten.
  Wird vom CDN jsDelivr geladen.
- **Satellitenbilder ohne Schlüssel:** Esri World Imagery über den Zugang,
  der in Cesium eingebaut ist. Quellenangaben erscheinen unten rechts im Bild.
- **Mit Schlüssel:** Cesium World Terrain, Bing-Luftbilder und
  Google Photorealistic 3D Tiles über Cesium ion.
- **Flugzeugmodell:** selbst per Code erzeugt (`js/model.js`). Es stammt aus
  keiner fremden Datei, daher gibt es keine Lizenzfragen. Farben und Formen
  lassen sich frei ändern.
- **Pistendaten Zürich:** OurAirports (Public Domain).

## Dateien

| Datei | Inhalt |
|---|---|
| `index.html` | Die Seite mit Anzeigen, Menü und Hilfe |
| `config.js` | **Deine Einstellungen** (Schlüssel, Startflughafen, Grafik) |
| `css/style.css` | Aussehen der Bedienelemente |
| `js/main.js` | Hauptprogramm, verbindet alles |
| `js/flight.js` | Flugphysik und Autopilot |
| `js/model.js` | Baut das 3D-Flugzeug |
| `js/aircraft.js` | Flugzeugdaten (Masse, Leistung) und Bemalung |
| `js/cameras.js` | Kameraansichten |
| `js/hud.js` | Cockpit-Instrumente |
| `js/controls.js` | Tastatur |
