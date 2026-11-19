// =====================================================================
//  Flugzeugtypen: Abmessungen (fürs 3D-Modell) und Flugeigenschaften.
//  Etappe 1: nur Airbus A320. Weitere Typen folgen in Etappe 3.
// =====================================================================
(() => {
  const AIRCRAFT = {
    A320: {
      name: "Airbus A320neo",
      // --- Abmessungen in Metern ---
      length: 37.6,
      diameter: 3.95,
      span: 35.8,
      sweepDeg: 25,
      dihedralDeg: 5,
      rootChord: 6.2,
      taper: 0.24,
      wingPos: 0.45, // Lage der Flügelwurzel (Anteil der Länge ab Nase)
      winglet: 2.4,
      hstabSpan: 12.45,
      hstabChord: 3.6,
      finHeight: 6.3,
      finChord: 5.2,
      engines: 2,
      engineDiameter: 2.4,
      fuselageCenterZ: 3.5,
      noseX: 16.5, // Nase liegt 16.5 m vor dem Hauptfahrwerk
      mainGearY: 3.8,
      wheelR: 0.58,
      bogie: 1,
      decks: 1,
      // Kamerapunkte (x vorne, y links, z oben)
      cockpitEye: [14.8, 0.5, 4.6],
      // --- Flugeigenschaften ---
      thrust: 2.9,        // Beschleunigung bei Vollschub (m/s²) auf Meereshöhe
      vStallClean: 72,    // Überziehgeschwindigkeit ohne Klappen (m/s, ~140 kt)
      vr: 72,             // Rotationsgeschwindigkeit (m/s, ~140 kt)
      vmo: 180,           // Höchstgeschwindigkeit angezeigt (m/s, ~350 kt)
      pitchRate: 4.5,     // Grad pro Sekunde
      rollRate: 18,       // Grad pro Sekunde
      inertia: 0.9,       // Trägheit (Sekunden bis Reaktion)
      maxBank: 35,
    },
  };

  // Hauseigene Fantasie-Bemalung für Etappe 1
  const DEFAULT_LIVERY = {
    name: "Flugsim Air",
    body: "#f4f5f7",
    belly: "#d9dde3",
    bellyFrom: 118,
    tail: "#1f4e9c",
    tailAccent: "#d7262f",
    engine: "#1f4e9c",
    stripe: "#1f4e9c",
    stripeFrom: 100,
    stripeTo: 108,
  };

  Object.assign((window.FS = window.FS || {}), { AIRCRAFT, DEFAULT_LIVERY });
})();
