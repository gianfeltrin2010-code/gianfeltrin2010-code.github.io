// =====================================================================
//  KONFIGURATION DES FLUGSIMULATORS
//  Hier – und nur hier – trägst du deine Schlüssel und Grundeinstellungen ein.
// =====================================================================
window.FLUGSIM_CONFIG = {
  // Cesium-ion-Schlüssel (kostenlos auf https://ion.cesium.com/signup).
  // Leer lassen = Simulator läuft trotzdem, aber ohne Berge und ohne 3D-Städte.
  // Beispiel: cesiumIonToken: "eyJhbGciOiJIUzI1NiIs...",
  cesiumIonToken: "",

  // Fotorealistische 3D-Städte von Google (braucht den Cesium-Schlüssel oben).
  // true = einschalten, false = ausschalten (schneller auf schwachen Laptops).
  googlePhotorealistic: true,

  // Startflughafen und Piste (Etappe 1: Zürich, Piste 16).
  start: {
    airport: "LSZH",
    name: "Zürich",
    // Pistenanfang (Schwelle) laut OurAirports-Daten
    lat: 47.475601,
    lon: 8.53595,
    elevationFt: 1390,
    headingDeg: 155,
  },

  // Grafikstufe beim Start: "niedrig", "mittel" oder "hoch"
  grafik: "mittel",
};
