// =====================================================================
//  Hauptprogramm: baut die Welt, das Flugzeug und verbindet alles.
// =====================================================================
(() => {
  const { AIRCRAFT, DEFAULT_LIVERY, buildAircraft, FlightModel, FLAP_LABEL, Controls, CameraRig, CAMERA_MODES, Hud } = window.FS;
  const C = window.Cesium;
  const CFG = window.FLUGSIM_CONFIG || {};
  const D2R = Math.PI / 180, R2D = 180 / Math.PI;
  const $ = (id) => document.getElementById(id);

  const state = {
    paused: false,
    timeOffsetH: 0,
    usePhotoreal: false,
    tileset: null,
    model: null,
    spec: AIRCRAFT.A320,
    livery: DEFAULT_LIVERY,
    ready: false,
  };

  // ---------------------------------------------------------------------
  // 1) Globus erstellen
  // ---------------------------------------------------------------------
  setLoading("Globus wird geladen …");
  const token = (CFG.cesiumIonToken || "").trim();
  if (token) C.Ion.defaultAccessToken = token;

  const viewer = new C.Viewer("cesium", {
    baseLayer: false,
    animation: false, timeline: false, baseLayerPicker: false, geocoder: false,
    homeButton: false, sceneModePicker: false, navigationHelpButton: false,
    fullscreenButton: false, infoBox: false, selectionIndicator: false,
    shouldAnimate: true,
    msaaSamples: 4,
    terrain: token ? C.Terrain.fromWorldTerrain({ requestWaterMask: true, requestVertexNormals: true }) : undefined,
  });
  const scene = viewer.scene;
  const globe = scene.globe;
  scene.screenSpaceCameraController.enableInputs = false; // Kamera steuern wir selbst
  globe.enableLighting = true;            // Tag/Nacht nach Sonnenstand
  globe.dynamicAtmosphereLighting = true;
  globe.dynamicAtmosphereLightingFromSun = true;
  globe.depthTestAgainstTerrain = true;
  globe.showWaterEffect = true;
  globe.baseColor = C.Color.fromCssColorString("#2b4a6b");
  scene.fog.enabled = true;
  scene.fog.density = 1.6e-4;
  scene.skyAtmosphere.show = true;
  viewer.clock.currentTime = C.JulianDate.now();
  viewer.clock.multiplier = 1;

  // Satellitenbilder: zuerst die mitgelieferte Erdkarte (lädt sofort, auch offline),
  // darüber hochauflösende Bilder aus dem Internet.
  const layers = viewer.imageryLayers;
  layers.add(C.ImageryLayer.fromProviderAsync(
    C.TileMapServiceImageryProvider.fromUrl(C.buildModuleUrl("Assets/Textures/NaturalEarthII"))
  ));
  if (token) {
    layers.add(C.ImageryLayer.fromWorldImagery({ style: C.IonWorldImageryStyle.AERIAL }));
  } else {
    layers.add(C.ImageryLayer.fromProviderAsync(
      C.ArcGisMapServerImageryProvider.fromBasemapType(C.ArcGisBaseMapType.SATELLITE)
    ));
  }
  let sourceLabel = token ? "Cesium ion: Gelände + Bing-Satellitenbilder" : "Ohne Schlüssel: Esri-Satellitenbilder, flaches Gelände";

  async function loadPhotoreal() {
    if (!token || CFG.googlePhotorealistic === false) return;
    try {
      const tileset = await C.createGooglePhotorealistic3DTileset({ onlyUsingWithGoogleGeocoder: true });
      scene.primitives.add(tileset);
      state.tileset = tileset;
      state.usePhotoreal = true;
      globe.show = false; // Google-Kacheln enthalten bereits Boden und Gebäude
      sourceLabel = "Cesium ion + Google Photorealistic 3D Tiles";
    } catch (e) {
      console.warn("Google 3D Tiles nicht verfügbar:", e);
      toast("Google-3D-Städte konnten nicht geladen werden – normales Gelände wird verwendet.");
    }
  }

  // ---------------------------------------------------------------------
  // 2) Bodenhöhe abfragen (für Physik und Kamera)
  // ---------------------------------------------------------------------
  const scratchCarto = new C.Cartographic();
  function groundAt(carto) {
    if (state.usePhotoreal) {
      const h = scene.sampleHeightSupported ? scene.sampleHeight(carto, state.model ? [state.model] : undefined) : undefined;
      return h;
    }
    if (!token) return 0; // ohne Geländedaten ist die Erde eine glatte Kugel
    return globe.getHeight(carto);
  }

  async function preciseGround(lat, lon) {
    const carto = C.Cartographic.fromDegrees(lon, lat);
    try {
      if (state.usePhotoreal) {
        const [r] = await scene.sampleHeightMostDetailed([carto], state.model ? [state.model] : undefined);
        if (r && r.height !== undefined) return r.height;
      }
      if (token) {
        const [r] = await C.sampleTerrainMostDetailed(scene.terrainProvider, [carto]);
        return r.height;
      }
    } catch (e) { console.warn(e); }
    return token ? (CFG.start?.elevationFt ?? 0) * 0.3048 : 0;
  }

  // ---------------------------------------------------------------------
  // 3) Flugzeug
  // ---------------------------------------------------------------------
  const fm = new FlightModel(state.spec);

  async function loadAircraftModel() {
    const glb = buildAircraft(state.spec, state.livery);
    const url = URL.createObjectURL(new Blob([glb], { type: "model/gltf-binary" }));
    const model = await C.Model.fromGltfAsync({
      url,
      shadows: C.ShadowMode.CAST_ONLY, // wirft Schatten auf den Boden, aber nicht auf sich selbst
      backFaceCulling: false,
    });
    if (state.model) scene.primitives.remove(state.model);
    scene.primitives.add(model);
    state.model = model;
    await new Promise((res) => {
      if (model.ready) return res();
      const rm = model.readyEvent.addEventListener(() => { rm(); res(); });
    });
  }

  // Lage im Raum berechnen: Achsen des Flugzeugs in Erd-Koordinaten
  const frame = { spec: state.spec };
  const enu = new C.Matrix4();
  function computeFrame() {
    const pos = C.Cartesian3.fromRadians(fm.lon, fm.lat, fm.alt);
    C.Transforms.eastNorthUpToFixedFrame(pos, C.Ellipsoid.WGS84, enu);
    const E = [enu[0], enu[1], enu[2]], N = [enu[4], enu[5], enu[6]], U = [enu[8], enu[9], enu[10]];
    const h = fm.heading, p = fm.pitch, r = fm.roll;
    const hz = [Math.sin(h) * E[0] + Math.cos(h) * N[0], Math.sin(h) * E[1] + Math.cos(h) * N[1], Math.sin(h) * E[2] + Math.cos(h) * N[2]];
    const fwd = hz.map((v, i) => Math.cos(p) * v + Math.sin(p) * U[i]);
    const right0 = [0, 1, 2].map((i) => Math.cos(h) * E[i] - Math.sin(h) * N[i]);
    const up0 = hz.map((v, i) => -Math.sin(p) * v + Math.cos(p) * U[i]);
    const right = right0.map((v, i) => Math.cos(r) * v - Math.sin(r) * up0[i]);
    const upA = right0.map((v, i) => Math.sin(r) * v + Math.cos(r) * up0[i]);
    Object.assign(frame, {
      pos, east: E, north: N, up: U, fwd, right, upA, heading: h, spec: state.spec,
      local(o) { // Punkt im Flugzeugsystem (x vorne, y links, z oben) -> Erde
        return new C.Cartesian3(
          pos.x + fwd[0] * o[0] - right[0] * o[1] + upA[0] * o[2],
          pos.y + fwd[1] * o[0] - right[1] * o[1] + upA[1] * o[2],
          pos.z + fwd[2] * o[0] - right[2] * o[1] + upA[2] * o[2]);
      },
    });
    return frame;
  }
  const rot3 = new C.Matrix3();
  function updateModelMatrix(f) {
    if (!state.model) return;
    const left = f.right.map((v) => -v);
    C.Matrix3.fromArray([...f.fwd, ...left, ...f.upA], 0, rot3); // spaltenweise
    C.Matrix4.fromRotationTranslation(rot3, f.pos, state.model.modelMatrix);
    const gear = state.model.getNode && state.model.getNode("gear");
    if (gear) gear.show = fm.gearDown;
  }

  // ---------------------------------------------------------------------
  // 4) Start an der Piste
  // ---------------------------------------------------------------------
  async function placeAtStart() {
    const s = CFG.start || { lat: 47.475601, lon: 8.53595, headingDeg: 155 };
    // 80 m hinter der Schwelle auf die Pistenmitte stellen
    const d = 80, hd = s.headingDeg * D2R;
    const lat = s.lat + (d * Math.cos(hd)) / 6371000 * R2D;
    const lon = s.lon + (d * Math.sin(hd)) / (6371000 * Math.cos(s.lat * D2R)) * R2D;
    const gh = await preciseGround(lat, lon);
    fm.reset({ lat, lon, alt: gh, heading: s.headingDeg });
    fm.ground = gh;
    rig.smoothHeading = null;
    $("airport").textContent = `${s.name || ""} (${s.airport || ""}) · Piste ${String(Math.round(s.headingDeg / 10)).padStart(2, "0")}`;
  }

  // ---------------------------------------------------------------------
  // 5) Steuerung, Kamera, Anzeigen
  // ---------------------------------------------------------------------
  const controls = new Controls();
  const rig = new CameraRig(viewer);
  const hud = new Hud($("hud"));

  function setCamera(id) {
    rig.setMode(id);
    $("camSelect").value = id;
    if (state.model) state.model.show = id !== "cockpit";
    document.body.classList.toggle("cockpit", id === "cockpit");
    toast(CAMERA_MODES.find((m) => m.id === id).label, 900);
  }
  controls.on("c", () => {
    const i = CAMERA_MODES.findIndex((m) => m.id === rig.mode);
    setCamera(CAMERA_MODES[(i + 1) % CAMERA_MODES.length].id);
  });
  CAMERA_MODES.forEach((m, i) => controls.on(String(i + 1), () => setCamera(m.id)));
  controls.on("g", () => {
    if (fm.onGround) return toast("Fahrwerk kann am Boden nicht eingefahren werden");
    fm.gearDown = !fm.gearDown; toast(fm.gearDown ? "Fahrwerk ausgefahren" : "Fahrwerk eingefahren");
  });
  controls.on("f", () => { fm.flaps = Math.min(4, fm.flaps + 1); toast("Klappen " + FLAP_LABEL[fm.flaps]); });
  controls.on("v", () => { fm.flaps = Math.max(0, fm.flaps - 1); toast("Klappen " + FLAP_LABEL[fm.flaps]); });
  controls.on("b", () => { fm.brakes = !fm.brakes; toast(fm.brakes ? "Bremsen an" : "Bremsen gelöst"); });
  controls.on("z", toggleAutopilot);
  controls.on("h,?", () => $("help").classList.toggle("show"));
  controls.on("m", () => $("menu").classList.toggle("show"));
  controls.on("p", () => { state.paused = !state.paused; toast(state.paused ? "Pause" : "Weiter"); });
  controls.on("escape", () => { $("help").classList.remove("show"); $("menu").classList.remove("show"); });

  function toggleAutopilot() {
    if (fm.onGround) return toast("Autopilot erst in der Luft");
    fm.ap.on = !fm.ap.on;
    if (fm.ap.on) {
      fm.ap.alt = Math.round((fm.alt * 3.28084) / 100) * 100;
      fm.ap.hdg = Math.round(fm.heading * R2D) % 360;
      fm.ap.spd = Math.round(fm.ias * 1.94384 / 5) * 5;
    }
    toast(fm.ap.on ? "Autopilot EIN – hält Höhe, Kurs und Tempo" : "Autopilot AUS");
  }

  // Menü
  $("menuBtn").onclick = () => $("menu").classList.toggle("show");
  $("helpBtn").onclick = () => $("help").classList.toggle("show");
  $("help").onclick = () => $("help").classList.remove("show");
  CAMERA_MODES.forEach((m, i) => $("camSelect").add(new Option(`${i + 1} · ${m.label}`, m.id)));
  $("camSelect").onchange = (e) => setCamera(e.target.value);
  $("gfxSelect").value = CFG.grafik || "mittel";
  $("gfxSelect").onchange = (e) => applyGraphics(e.target.value);
  $("invertPitch").onchange = (e) => (controls.invertPitch = e.target.checked);
  $("timeSlider").oninput = (e) => { state.timeOffsetH = +e.target.value; };
  $("timeNow").onclick = () => { state.timeOffsetH = 0; $("timeSlider").value = 0; };
  $("restartBtn").onclick = () => { placeAtStart(); $("menu").classList.remove("show"); };

  // Grafikstufen
  function applyGraphics(level) {
    const dpr = window.devicePixelRatio || 1;
    const s = {
      niedrig: { res: Math.min(dpr, 1) * 0.75, sse: 4, shadows: false, msaa: 1, fxaa: true, tilesSSE: 24 },
      mittel: { res: Math.min(dpr, 1.25), sse: 2, shadows: true, msaa: 2, fxaa: false, tilesSSE: 16 },
      hoch: { res: Math.min(dpr, 2), sse: 1.33, shadows: true, msaa: 4, fxaa: false, tilesSSE: 8 },
    }[level] || {};
    viewer.resolutionScale = s.res;
    globe.maximumScreenSpaceError = s.sse;
    viewer.shadows = s.shadows;
    if (s.shadows) {
      viewer.shadowMap.softShadows = level === "hoch";
      viewer.shadowMap.size = level === "hoch" ? 4096 : 2048;
      viewer.shadowMap.maximumDistance = 2000;
    }
    scene.msaaSamples = s.msaa;
    scene.postProcessStages.fxaa.enabled = s.fxaa;
    if (state.tileset) state.tileset.maximumScreenSpaceError = s.tilesSSE;
  }

  // ---------------------------------------------------------------------
  // 6) Hauptschleife: läuft vor jedem Bild
  // ---------------------------------------------------------------------
  let last = performance.now();
  let lastUi = 0;
  scene.preUpdate.addEventListener(() => {
    const now = performance.now();
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    // Uhrzeit: echte Zeit (UTC) plus Verschiebung durch den Schieberegler
    viewer.clock.currentTime = C.JulianDate.addHours(C.JulianDate.now(), state.timeOffsetH, new C.JulianDate());
    if (!state.ready) return;

    const input = controls.read();
    if (fm.ap.on) {
      // Mit Autopilot verändern die Steuertasten die Sollwerte
      fm.ap.alt = Math.max(0, Math.round(fm.ap.alt - input.pitch * 1500 * dt));
      fm.ap.hdg = ((fm.ap.hdg + input.roll * 25 * dt) % 360 + 360) % 360;
      fm.ap.spd = Math.max(140, Math.min(360, fm.ap.spd + input.throttle * 20 * dt));
      input.pitch = input.roll = 0;
    } else {
      fm.throttle = Math.max(0, Math.min(1, fm.throttle + input.throttle * 0.45 * dt));
    }
    if (!state.paused) {
      C.Cartographic.fromRadians(fm.lon, fm.lat, 0, scratchCarto);
      const gh = groundAt(scratchCarto);
      const wasCrashed = fm.crashed;
      fm.step(dt, input, gh);
      if (fm.message) { toast(fm.message, 3500); fm.message = ""; }
      if (fm.crashed && !wasCrashed) $("crash").classList.add("show");
    }
    const f = computeFrame();
    updateModelMatrix(f);
    rig.update(f, dt, groundAt);
    hud.draw(fm, rig.mode, rig);
    if (now - lastUi > 100) { updateStrip(); lastUi = now; }
  });

  function updateStrip() {
    const kt = Math.round(fm.ias * 1.94384), ft = Math.round(fm.alt * 3.28084);
    const hdg = String(Math.round(fm.heading * R2D) % 360).padStart(3, "0");
    const fpm = Math.round(fm.vs * 196.85 / 10) * 10;
    $("sSpd").textContent = kt;
    $("sAlt").textContent = ft.toLocaleString("de-CH");
    $("sHdg").textContent = hdg + "°";
    $("sVs").textContent = (fpm > 0 ? "+" : "") + fpm;
    $("sThr").textContent = Math.round(fm.throttle * 100) + "%";
    $("thrBar").style.width = fm.throttle * 100 + "%";
    $("sFlaps").textContent = FLAP_LABEL[fm.flaps];
    $("sGear").textContent = fm.gearDown ? "UNTEN" : "OBEN";
    $("sGear").className = fm.gearDown ? "on" : "";
    $("sBrk").textContent = fm.brakes ? "AN" : "–";
    $("sBrk").className = fm.brakes ? "warn" : "";
    $("sAp").textContent = fm.ap.on ? `${fm.ap.alt} ft · ${String(Math.round(fm.ap.hdg)).padStart(3, "0")}° · ${Math.round(fm.ap.spd)} kt` : "AUS";
    $("sAp").className = fm.ap.on ? "ap" : "";
    $("stallWarn").classList.toggle("show", fm.stall && !fm.onGround);
    // Zeit am Ort des Flugzeugs (Sonnenzeit aus Längengrad, ohne Sommerzeit-Regeln)
    const t = C.JulianDate.toDate(viewer.clock.currentTime);
    const utc = t.toISOString().substr(11, 5);
    const localMin = (t.getUTCHours() * 60 + t.getUTCMinutes() + Math.round((fm.lon * R2D) / 15 * 60) + 1440) % 1440;
    const local = `${String(Math.floor(localMin / 60)).padStart(2, "0")}:${String(localMin % 60).padStart(2, "0")}`;
    $("clock").textContent = `UTC ${utc} · Ortszeit ≈ ${local}${state.timeOffsetH ? ` (${state.timeOffsetH > 0 ? "+" : ""}${state.timeOffsetH} h)` : ""}`;
    $("timeLabel").textContent = state.timeOffsetH ? `${state.timeOffsetH > 0 ? "+" : ""}${state.timeOffsetH} h` : "jetzt";
  }

  // ---------------------------------------------------------------------
  // Hilfsfunktionen für Meldungen
  // ---------------------------------------------------------------------
  let toastTimer;
  function toast(text, ms = 1800) {
    const el = $("toast");
    el.textContent = text;
    el.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove("show"), ms);
  }
  function setLoading(text) { $("loadingText").textContent = text; }
  $("crashRestart").onclick = () => { $("crash").classList.remove("show"); placeAtStart(); };
  controls.on("r", () => { $("crash").classList.remove("show"); placeAtStart().then(() => toast("Neustart")); });

  // ---------------------------------------------------------------------
  // Start
  // ---------------------------------------------------------------------
  (async () => {
    if (location.protocol === "file:") {
      setLoading("Bitte nicht per Doppelklick öffnen: Der Browser blockiert dann die Erde. " +
        "Öffne den Simulator über den Link (GitHub Pages) oder einen lokalen Webserver – siehe ANLEITUNG.md.");
      document.querySelector("#loading .spinner").style.display = "none";
      return;
    }
    try {
      applyGraphics(CFG.grafik || "mittel");
      await loadPhotoreal();
      setLoading("Flugzeug wird gebaut …");
      await loadAircraftModel();
      setLoading("Startposition wird gesucht …");
      await placeAtStart();
      $("source").textContent = sourceLabel;
      state.ready = true;
      setCamera("chase");
      $("loading").classList.add("hide");
      if (!token) toast("Tipp: Mit einem kostenlosen Cesium-Schlüssel gibt es Berge und 3D-Städte (siehe Anleitung).", 6000);
    } catch (e) {
      console.error(e);
      setLoading("Fehler beim Start: " + e.message);
    }
  })();

  window.flugsim = { viewer, fm, state, rig, setCamera }; // für Tests in der Konsole
})();
