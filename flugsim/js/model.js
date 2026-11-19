// =====================================================================
//  Eigenes 3D-Flugzeugmodell, per Code erzeugt (keine fremden Dateien,
//  daher keine Lizenzfragen). Ergebnis ist eine glTF-Binärdatei (GLB),
//  die Cesium wie ein normales 3D-Modell lädt.
//
//  Koordinaten beim Bauen: x = vorne, y = links, z = oben (Meter).
//  Ursprung = Bodenkontakt des Hauptfahrwerks.
// =====================================================================
(() => {
  // ---------- kleine Vektor-Hilfen ----------
  const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
  const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const norm = (a) => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };

  // Ein "Teil" sammelt Dreiecke pro Material.
  class MeshBuilder {
    constructor() { this.prims = {}; }
    prim(mat) {
      if (!this.prims[mat]) this.prims[mat] = { pos: [], nrm: [], idx: [] };
      return this.prims[mat];
    }
    // Gitter aus Punkten grid[i][j] -> Dreiecke, glatte Normalen.
    // flip=true dreht die Orientierung (Aussen/Innen).
    grid(mat, grid, { flip = false, closeJ = false } = {}) {
      const p = this.prim(mat);
      const base = p.pos.length / 3;
      const ni = grid.length, nj = grid[0].length;
      const acc = new Array(ni * nj).fill(0).map(() => [0, 0, 0]);
      const tris = [];
      const jMax = closeJ ? nj : nj - 1;
      for (let i = 0; i < ni - 1; i++) {
        for (let j = 0; j < jMax; j++) {
          const j2 = (j + 1) % nj;
          const a = i * nj + j, b = (i + 1) * nj + j, c = (i + 1) * nj + j2, d = i * nj + j2;
          tris.push(flip ? [a, c, b] : [a, b, c]);
          tris.push(flip ? [a, d, c] : [a, c, d]);
        }
      }
      const P = (k) => grid[Math.floor(k / nj)][k % nj];
      for (const t of tris) {
        const n = cross(sub(P(t[1]), P(t[0])), sub(P(t[2]), P(t[0])));
        for (const k of t) { acc[k][0] += n[0]; acc[k][1] += n[1]; acc[k][2] += n[2]; }
      }
      for (let k = 0; k < ni * nj; k++) {
        p.pos.push(...P(k));
        p.nrm.push(...norm(acc[k]));
      }
      for (const t of tris) p.idx.push(base + t[0], base + t[1], base + t[2]);
    }
    // Einzelnes flaches Polygon (konvex), Punkte gegen den Uhrzeigersinn von aussen.
    poly(mat, pts) {
      const p = this.prim(mat);
      const base = p.pos.length / 3;
      const n = norm(cross(sub(pts[1], pts[0]), sub(pts[2], pts[0])));
      for (const q of pts) { p.pos.push(...q); p.nrm.push(...n); }
      for (let k = 1; k < pts.length - 1; k++) p.idx.push(base, base + k, base + k + 1);
    }
    // Quader/Kasten (für Fenster, Streben)
    box(mat, center, size) {
      const [cx, cy, cz] = center, [sx, sy, sz] = size.map((s) => s / 2);
      const v = (x, y, z) => [cx + x * sx, cy + y * sy, cz + z * sz];
      const faces = [
        [v(1, -1, -1), v(1, 1, -1), v(1, 1, 1), v(1, -1, 1)],
        [v(-1, 1, -1), v(-1, -1, -1), v(-1, -1, 1), v(-1, 1, 1)],
        [v(1, 1, -1), v(-1, 1, -1), v(-1, 1, 1), v(1, 1, 1)],
        [v(-1, -1, -1), v(1, -1, -1), v(1, -1, 1), v(-1, -1, 1)],
        [v(1, -1, 1), v(1, 1, 1), v(-1, 1, 1), v(-1, -1, 1)],
        [v(-1, -1, -1), v(-1, 1, -1), v(1, 1, -1), v(1, -1, -1)],
      ];
      for (const f of faces) this.poly(mat, f);
    }
    // Rotationskörper entlang einer Achse (für Triebwerke, Räder, Streben)
    lathe(mat, origin, axis, profile, seg = 20, { flip = false } = {}) {
      // profile: [[t, r], ...] t = Abstand entlang Achse
      const ax = norm(axis);
      let ref = Math.abs(ax[2]) < 0.9 ? [0, 0, 1] : [1, 0, 0];
      const u = norm(cross(ax, ref)), w = cross(ax, u);
      const grid = profile.map(([t, r]) => {
        const row = [];
        for (let j = 0; j < seg; j++) {
          const a = (j / seg) * Math.PI * 2;
          const ca = Math.cos(a) * r, sa = Math.sin(a) * r;
          row.push([
            origin[0] + ax[0] * t + u[0] * ca + w[0] * sa,
            origin[1] + ax[1] * t + u[1] * ca + w[1] * sa,
            origin[2] + ax[2] * t + u[2] * ca + w[2] * sa,
          ]);
        }
        return row;
      });
      this.grid(mat, grid, { closeJ: true, flip });
    }
  }

  // ---------- Profil (Tragflächen-Querschnitt, NACA-ähnlich) ----------
  function airfoil(n, tc) {
    // liefert [u, halbe Dicke] von Vorder- (u=0) bis Hinterkante (u=1)
    const pts = [];
    for (let i = 0; i <= n; i++) {
      const u = (1 - Math.cos((i / n) * Math.PI)) / 2;
      const t = 5 * tc * (0.2969 * Math.sqrt(u) - 0.126 * u - 0.3516 * u * u + 0.2843 * u ** 3 - 0.1036 * u ** 4);
      pts.push([u, Math.max(t, 0.0005)]);
    }
    return pts;
  }

  // Tragfläche / Leitwerk.
  // rootLE: Vorderkante innen, spanDir: Richtung nach aussen (Einheitsvektor),
  // thickDir: Dickenrichtung (senkrecht), span, rootChord, tipChord, sweep (m nach hinten an der Spitze)
  function liftingSurface(mb, mat, { rootLE, spanDir, thickDir, span, rootChord, tipChord, sweep, tc = 0.11, stations = 6, mirrorFlip = false }) {
    const af = airfoil(12, tc);
    const upper = [], lower = [];
    for (let s = 0; s <= stations; s++) {
      const f = s / stations;
      const c = rootChord + (tipChord - rootChord) * f;
      const le = [rootLE[0] - sweep * f + spanDir[0] * span * f, rootLE[1] + spanDir[1] * span * f, rootLE[2] + spanDir[2] * span * f];
      const tcF = c * (1 - 0.25 * f); // Dicke nimmt nach aussen etwas ab
      upper.push(af.map(([u, t]) => [le[0] - u * c + thickDir[0] * t * tcF, le[1] + thickDir[1] * t * tcF, le[2] + thickDir[2] * t * tcF]));
      lower.push(af.map(([u, t]) => [le[0] - u * c - thickDir[0] * t * tcF, le[1] - thickDir[1] * t * tcF, le[2] - thickDir[2] * t * tcF]));
    }
    // Orientierung je nach Seite, damit Normalen nach aussen zeigen
    const flip = mirrorFlip;
    mb.grid(mat, upper, { flip: !flip });
    mb.grid(mat, lower, { flip });
    // Spitze verschliessen
    const tipU = upper[upper.length - 1], tipL = lower[lower.length - 1];
    mb.grid(mat, [tipU, tipL], { flip: flip });
  }

  // ---------- Flugzeug bauen ----------
  // spec: Abmessungen (siehe aircraft.js), livery: Farben
  function buildAircraft(spec, livery) {
    const parts = {
      fuselage: new MeshBuilder(),
      wings: new MeshBuilder(),
      tail: new MeshBuilder(),
      engines: new MeshBuilder(),
      gear: new MeshBuilder(),
    };
    const L = spec.length, R = spec.diameter / 2;
    const zc = spec.fuselageCenterZ; // Höhe Rumpfmitte über Boden
    const xNose = spec.noseX; // x der Nasenspitze
    const noseLen = R * 2.3, tailLen = L * 0.26;
    const xTail = xNose - L;

    // ---- Rumpf als Rotationskörper mit Farbzonen ----
    const SEG = 32;
    const stations = [];
    const nNose = 14, nMid = 10, nTail = 14;
    for (let i = 0; i <= nNose; i++) {
      const s = i / nNose;
      const r = R * Math.pow(1 - Math.pow(1 - s, 2.0), 0.55);
      stations.push({ x: xNose - s * noseLen, r: Math.max(r, 0.02), dz: -R * 0.18 * Math.pow(1 - s, 2) });
    }
    for (let i = 1; i <= nMid; i++) {
      stations.push({ x: xNose - noseLen - (i / nMid) * (L - noseLen - tailLen), r: R, dz: 0 });
    }
    for (let i = 1; i <= nTail; i++) {
      const s = i / nTail;
      const r = R * (1 - 0.88 * Math.pow(s, 1.4));
      stations.push({ x: xNose - L + tailLen * (1 - s), r: Math.max(r, 0.08), dz: R * 0.62 * Math.pow(s, 1.6) });
    }
    // Querschnitt etwas höher als breit (wie echte Rümpfe)
    const ring = (st, a) => {
      // a = 0 oben, PI unten; y positiv = links
      const y = Math.sin(a) * st.r;
      const z = Math.cos(a) * st.r * 1.04;
      return [st.x, y, zc + st.dz + z];
    };
    // Farbzonen nach Winkel vom Scheitel aus (Grad)
    const bellyFrom = livery.bellyFrom ?? 180;
    const stripeFrom = livery.stripe ? livery.stripeFrom : 999;
    const stripeTo = livery.stripe ? livery.stripeTo : 999;
    const zoneOf = (aDeg) => {
      if (aDeg >= stripeFrom && aDeg < stripeTo) return "stripe";
      if (aDeg >= bellyFrom) return "belly";
      return "body";
    };
    // Je Zone einen eigenen Streifen erzeugen (Winkel-Bänder, beide Seiten)
    const bands = [];
    const cuts = [0, 180];
    for (const c of [bellyFrom, stripeFrom, stripeTo]) if (c > 0 && c < 180) cuts.push(c);
    cuts.sort((a, b) => a - b);
    const uniq = cuts.filter((c, i) => i === 0 || c !== cuts[i - 1]);
    for (let k = 0; k < uniq.length - 1; k++) bands.push([uniq[k], uniq[k + 1]]);
    for (const [a0, a1] of bands) {
      const mat = zoneOf((a0 + a1) / 2);
      const steps = Math.max(2, Math.round(((a1 - a0) / 180) * (SEG / 2)));
      for (const side of [1, -1]) {
        const grid = stations.map((st) => {
          const row = [];
          for (let j = 0; j <= steps; j++) {
            const aDeg = a0 + ((a1 - a0) * j) / steps;
            row.push(ring(st, side * (aDeg * Math.PI) / 180));
          }
          return row;
        });
        parts.fuselage.grid(mat, grid, { flip: side < 0 });
      }
    }
    // Heckkappe schliessen
    {
      const st = stations[stations.length - 1];
      const pts = [];
      for (let j = 0; j < 12; j++) pts.push(ring(st, -(j / 12) * Math.PI * 2));
      parts.fuselage.poly("body", pts);
    }

    // ---- Fenster (dunkle Streifen) ----
    const winA = (68 * Math.PI) / 180; // Winkel der Fensterreihe
    const winStart = xNose - noseLen - 1.2, winEnd = xTail + tailLen + 0.8;
    const pitch = 0.53;
    for (let x = winStart; x > winEnd; x -= pitch) {
      for (const side of [1, -1]) {
        const st = { x, r: R + 0.012, dz: 0 };
        const c = ring(st, side * winA);
        parts.fuselage.box("window", c, [0.23, 0.05, 0.32]);
      }
    }
    if (spec.decks === 2) {
      const winA2 = (30 * Math.PI) / 180;
      for (let x = winStart - 1.5; x > winEnd + 3; x -= pitch) {
        for (const side of [1, -1]) {
          const c = ring({ x, r: R + 0.012, dz: 0 }, side * winA2);
          parts.fuselage.box("window", c, [0.23, 0.05, 0.3]);
        }
      }
    }
    // Cockpitfenster
    {
      const xs = xNose - noseLen * 0.62;
      const st = stations.reduce((b, s) => (Math.abs(s.x - xs) < Math.abs(b.x - xs) ? s : b));
      for (const side of [1, -1]) {
        for (const [aDeg, w] of [[38, 0.75], [60, 0.6]]) {
          const c = ring({ ...st, r: st.r + 0.02 }, side * (aDeg * Math.PI) / 180);
          parts.fuselage.box("window", [c[0], c[1], c[2]], [0.55, 0.06 + w * 0.05, 0.42]);
        }
      }
      // Frontscheibe
      const cf = ring({ ...st, r: st.r + 0.02 }, (18 * Math.PI) / 180);
      parts.fuselage.box("window", [cf[0] + 0.2, 0, cf[2] - 0.05], [0.4, 1.2, 0.35]);
    }
    // Türen (helle Umrandung angedeutet: einfache dunkle Linien)
    for (const fx of [0.08, 0.92]) {
      const x = xNose - noseLen - fx * (L - noseLen - tailLen);
      for (const side of [1, -1]) {
        const c = ring({ x, r: R + 0.008, dz: 0 }, side * (85 * Math.PI) / 180);
        parts.fuselage.box("doorline", [c[0], c[1], c[2] + 0.35], [0.85, 0.03, 1.75]);
      }
    }

    // ---- Flügel ----
    const wingRootX = xNose - L * spec.wingPos;
    const wingZ = zc - R * 0.55;
    const semi = spec.span / 2 - R;
    const sweepM = Math.tan((spec.sweepDeg * Math.PI) / 180) * semi;
    const dih = (spec.dihedralDeg * Math.PI) / 180;
    for (const side of [1, -1]) {
      liftingSurface(parts.wings, "wing", {
        rootLE: [wingRootX, side * R * 0.9, wingZ],
        spanDir: [0, side * Math.cos(dih), Math.sin(dih)],
        thickDir: [0, -side * Math.sin(dih) * 0, 1],
        span: semi,
        rootChord: spec.rootChord,
        tipChord: spec.rootChord * spec.taper,
        sweep: sweepM,
        tc: 0.12,
        mirrorFlip: side < 0,
      });
      // Winglet
      if (spec.winglet) {
        const tipLE = [wingRootX - sweepM, side * (R * 0.9 + semi * Math.cos(dih)), wingZ + semi * Math.sin(dih)];
        const tipC = spec.rootChord * spec.taper;
        liftingSurface(parts.wings, "tailAccent", {
          rootLE: [tipLE[0] - tipC * 0.05, tipLE[1], tipLE[2]],
          spanDir: norm([0, side * 0.25, 1]),
          thickDir: [0, 1, 0],
          span: spec.winglet,
          rootChord: tipC * 0.9,
          tipChord: tipC * 0.35,
          sweep: spec.winglet * 0.8,
          tc: 0.08,
          mirrorFlip: side > 0,
        });
      }
    }
    // Flügel-Rumpf-Übergang (Verkleidung)
    parts.fuselage.lathe("belly", [wingRootX + 1.5, 0, zc - R * 0.55], [-1, 0, 0],
      [[0, 0.1], [1.5, R * 0.75], [spec.rootChord * 0.9, R * 0.78], [spec.rootChord + 1.5, 0.1]], 16);

    // ---- Höhenleitwerk ----
    const hsSemi = spec.hstabSpan / 2;
    const hsRootX = xTail + tailLen * 0.55;
    const hsZ = zc + R * 0.35;
    for (const side of [1, -1]) {
      liftingSurface(parts.tail, "wing", {
        rootLE: [hsRootX, side * R * 0.2, hsZ],
        spanDir: norm([0, side, 0.12]),
        thickDir: [0, 0, 1],
        span: hsSemi,
        rootChord: spec.hstabChord,
        tipChord: spec.hstabChord * 0.4,
        sweep: Math.tan((spec.sweepDeg + 6) * Math.PI / 180) * hsSemi,
        tc: 0.1,
        mirrorFlip: side < 0,
      });
    }
    // ---- Seitenleitwerk (Heck, wichtig für die Airline-Farben) ----
    const finRootX = xTail + tailLen * 0.78;
    const finZ = zc + R * 0.55;
    const finSweep = Math.tan((spec.sweepDeg + 12) * Math.PI / 180) * spec.finHeight;
    const accentFrom = livery.tailAccent ? 0.62 : 1.01;
    // unterer Teil in Heckfarbe, oberer Teil optional in Akzentfarbe
    const finPart = (mat, f0, f1) => {
      const c0 = spec.finChord * (1 - 0.6 * f0), c1 = spec.finChord * (1 - 0.6 * f1);
      liftingSurface(parts.tail, mat, {
        rootLE: [finRootX - finSweep * f0, 0, finZ + spec.finHeight * f0],
        spanDir: [0, 0, 1],
        thickDir: [0, 1, 0],
        span: spec.finHeight * (f1 - f0),
        rootChord: c0,
        tipChord: c1,
        sweep: finSweep * (f1 - f0),
        tc: 0.1,
        mirrorFlip: true,
      });
    };
    if (accentFrom < 1) {
      finPart("tail", 0, accentFrom);
      finPart("tailAccent", accentFrom, 1);
    } else finPart("tail", 0, 1);

    // ---- Triebwerke ----
    const engR = spec.engineDiameter / 2, engLen = spec.engineDiameter * 1.75;
    const engPositions = spec.engines === 4 ? [0.33, 0.62] : [0.36];
    for (const side of [1, -1]) {
      for (const f of engPositions) {
        const y = side * (R * 0.9 + semi * f);
        const xLE = wingRootX - sweepM * f;
        const ex = xLE + engLen * 0.55;
        const ez = wingZ + semi * f * Math.sin(dih) - engR - 0.35;
        const o = [ex, y, ez];
        parts.engines.lathe("engine", o, [-1, 0, 0], [
          [0, engR * 0.86], [0.05 * engLen, engR * 0.98], [0.25 * engLen, engR], [0.7 * engLen, engR * 0.9], [engLen, engR * 0.55],
        ], 24);
        parts.engines.lathe("engineLip", o, [-1, 0, 0], [[-0.02, engR * 0.8], [0.01, engR * 0.92], [0.06 * engLen, engR * 0.98]], 24);
        // Fan (dunkel) und Abgaskonus
        parts.engines.lathe("fan", [ex - 0.12, y, ez], [-1, 0, 0], [[0, engR * 0.84], [0.01, engR * 0.84], [0.02, 0.15], [0.2, 0.02]], 20);
        parts.engines.lathe("metal", [ex - engLen, y, ez], [-1, 0, 0], [[-0.05, engR * 0.5], [0.4, engR * 0.3], [0.8, 0.02]], 16);
        // Pylon
        parts.engines.box("wing", [ex - engLen * 0.55, y, ez + engR + 0.2], [engLen * 0.9, 0.35, 0.7]);
      }
    }

    // ---- Fahrwerk ----
    const gearMat = "gear", tyre = "tyre";
    const wheelR = spec.wheelR;
    const mainY = spec.mainGearY;
    const mainX = 0;
    const strut = (x, y, h) => parts.gear.lathe(gearMat, [x, y, wheelR], [0, 0, 1], [[0, 0.11], [h, 0.13]], 10);
    const wheelPair = (x, y) => {
      for (const dy of [-0.35, 0.35]) {
        parts.gear.lathe(tyre, [x, y + dy - 0.2, wheelR], [0, 1, 0], [[0, wheelR * 0.6], [0.02, wheelR], [0.38, wheelR], [0.4, wheelR * 0.6]], 18);
      }
    };
    const mainStrutH = zc - R - wheelR + 0.3;
    for (const side of [1, -1]) {
      const y = side * mainY;
      strut(mainX, y, mainStrutH);
      const bogies = spec.bogie || 1;
      for (let b = 0; b < bogies; b++) wheelPair(mainX - (b - (bogies - 1) / 2) * 1.45, y);
    }
    if (spec.engines === 4) { // A380 / 747: zusätzliches Rumpffahrwerk
      for (const side of [1, -1]) {
        strut(-2.5, side * 1.4, mainStrutH);
        wheelPair(-2.5 + 0.7, side * 1.4); wheelPair(-2.5 - 0.7, side * 1.4);
      }
    }
    const noseX = xNose - noseLen * 1.6;
    parts.gear.lathe(gearMat, [noseX, 0, wheelR * 0.8], [0, 0, 1], [[0, 0.09], [zc - R - wheelR * 0.8 + 0.3, 0.1]], 10);
    for (const dy of [-0.28, 0.28]) {
      parts.gear.lathe(tyre, [noseX, dy - 0.13, wheelR * 0.8], [0, 1, 0], [[0, wheelR * 0.45], [0.02, wheelR * 0.8], [0.24, wheelR * 0.8], [0.26, wheelR * 0.45]], 16);
    }

    // ---- Materialien ----
    const mats = {
      body: { c: livery.body, m: 0.15, r: 0.35 },
      belly: { c: livery.belly ?? livery.body, m: 0.15, r: 0.4 },
      stripe: { c: livery.stripe ?? livery.body, m: 0.15, r: 0.35 },
      tail: { c: livery.tail, m: 0.15, r: 0.35 },
      tailAccent: { c: livery.tailAccent ?? livery.tail, m: 0.15, r: 0.35 },
      engine: { c: livery.engine, m: 0.25, r: 0.35 },
      engineLip: { c: "#c9ccd1", m: 0.9, r: 0.2 },
      fan: { c: "#1b1d22", m: 0.6, r: 0.4 },
      metal: { c: "#8a8d92", m: 0.85, r: 0.35 },
      wing: { c: livery.wing ?? "#c4c8cf", m: 0.3, r: 0.45 },
      window: { c: "#101624", m: 0.4, r: 0.08 },
      doorline: { c: "#c3c8cf", m: 0.1, r: 0.5 },
      gear: { c: "#b9bcc2", m: 0.7, r: 0.35 },
      tyre: { c: "#141414", m: 0.0, r: 0.9 },
    };
    return encodeGLB(parts, mats);
  }

  // ---------- GLB-Datei schreiben ----------
  function hexToLinear(hex) {
    const h = hex.replace("#", "");
    const c = [0, 2, 4].map((i) => parseInt(h.substr(i, 2), 16) / 255);
    return c.map((v) => (v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)));
  }

  function encodeGLB(parts, mats) {
    const gltf = {
      asset: { version: "2.0", generator: "Flugsim eigener Modellbauer" },
      scene: 0,
      scenes: [{ nodes: [0] }],
      nodes: [{ name: "aircraft", children: [] }],
      meshes: [], materials: [], accessors: [], bufferViews: [], buffers: [],
    };
    const matIndex = {};
    for (const [name, m] of Object.entries(mats)) {
      matIndex[name] = gltf.materials.length;
      gltf.materials.push({
        name,
        pbrMetallicRoughness: { baseColorFactor: [...hexToLinear(m.c), 1], metallicFactor: m.m, roughnessFactor: m.r },
        doubleSided: true, // beidseitig: robust gegen falsch orientierte Flächen
      });
    }
    const chunks = [];
    let offset = 0;
    const addView = (typed, target) => {
      const bytes = new Uint8Array(typed.buffer, typed.byteOffset, typed.byteLength);
      const pad = (4 - (bytes.byteLength % 4)) % 4;
      gltf.bufferViews.push({ buffer: 0, byteOffset: offset, byteLength: bytes.byteLength, target });
      chunks.push(bytes);
      if (pad) chunks.push(new Uint8Array(pad));
      offset += bytes.byteLength + pad;
      return gltf.bufferViews.length - 1;
    };
    // Umrechnung Bau-Koordinaten (x vorne, y links, z oben) -> glTF (links, oben, vorne).
    // Cesium dreht glTF beim Laden so, dass danach x = vorne, y = links, z = oben gilt.
    for (const [partName, mb] of Object.entries(parts)) {
      const mesh = { name: partName, primitives: [] };
      for (const [matName, p] of Object.entries(mb.prims)) {
        if (!p.idx.length) continue;
        const n = p.pos.length / 3;
        const pos = new Float32Array(n * 3), nrm = new Float32Array(n * 3);
        const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
        for (let k = 0; k < n; k++) {
          const x = p.pos[3 * k], y = p.pos[3 * k + 1], z = p.pos[3 * k + 2];
          const g = [y, z, x];
          pos.set(g, 3 * k);
          nrm.set([p.nrm[3 * k + 1], p.nrm[3 * k + 2], p.nrm[3 * k]], 3 * k);
          for (let a = 0; a < 3; a++) { min[a] = Math.min(min[a], g[a]); max[a] = Math.max(max[a], g[a]); }
        }
        const idx = new Uint32Array(p.idx);
        const vPos = addView(pos, 34962), vNrm = addView(nrm, 34962), vIdx = addView(idx, 34963);
        const aPos = gltf.accessors.push({ bufferView: vPos, componentType: 5126, count: n, type: "VEC3", min, max }) - 1;
        const aNrm = gltf.accessors.push({ bufferView: vNrm, componentType: 5126, count: n, type: "VEC3" }) - 1;
        const aIdx = gltf.accessors.push({ bufferView: vIdx, componentType: 5125, count: idx.length, type: "SCALAR" }) - 1;
        mesh.primitives.push({ attributes: { POSITION: aPos, NORMAL: aNrm }, indices: aIdx, material: matIndex[matName] });
      }
      const meshIdx = gltf.meshes.push(mesh) - 1;
      const nodeIdx = gltf.nodes.push({ name: partName, mesh: meshIdx }) - 1;
      gltf.nodes[0].children.push(nodeIdx);
    }
    gltf.buffers.push({ byteLength: offset });
    const bin = new Uint8Array(offset);
    let o = 0;
    for (const c of chunks) { bin.set(c, o); o += c.byteLength; }

    let json = new TextEncoder().encode(JSON.stringify(gltf));
    const jPad = (4 - (json.byteLength % 4)) % 4;
    if (jPad) { const j2 = new Uint8Array(json.byteLength + jPad).fill(0x20); j2.set(json); json = j2; }
    const total = 12 + 8 + json.byteLength + 8 + bin.byteLength;
    const out = new ArrayBuffer(total);
    const dv = new DataView(out);
    dv.setUint32(0, 0x46546c67, true); dv.setUint32(4, 2, true); dv.setUint32(8, total, true);
    dv.setUint32(12, json.byteLength, true); dv.setUint32(16, 0x4e4f534a, true);
    new Uint8Array(out, 20, json.byteLength).set(json);
    const b0 = 20 + json.byteLength;
    dv.setUint32(b0, bin.byteLength, true); dv.setUint32(b0 + 4, 0x004e4942, true);
    new Uint8Array(out, b0 + 8).set(bin);
    return new Uint8Array(out);
  }

  Object.assign((window.FS = window.FS || {}), { buildAircraft });
})();
