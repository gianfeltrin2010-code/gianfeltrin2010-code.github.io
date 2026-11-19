// =====================================================================
//  Vereinfachte Flugphysik: bewusst gutmütig, aber mit Gefühl für
//  Geschwindigkeit, Trägheit, Auftrieb und Strömungsabriss.
// =====================================================================
(() => {
  const D2R = Math.PI / 180, R2D = 180 / Math.PI;
  const G = 9.81;
  const EARTH_R = 6371000;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const lerp = (a, b, t) => a + (b - a) * t;

  const FLAP_STEPS = [0, 1, 2, 3, 4]; // 0 = eingefahren, 4 = voll
  const FLAP_LABEL = ["0", "1", "2", "3", "FULL"];

  class FlightModel {
    constructor(type) {
      this.type = type;
      this.reset({ lat: 0, lon: 0, alt: 0, heading: 0 });
    }

    reset({ lat, lon, alt, heading }) {
      this.lat = lat * D2R;
      this.lon = lon * D2R;
      this.alt = alt;          // Meter über Ellipsoid (Bodenkontakt Fahrwerk)
      this.heading = heading * D2R;
      this.pitch = 0;
      this.roll = 0;
      this.tas = 0;            // wahre Geschwindigkeit m/s
      this.gamma = 0;          // Flugbahnwinkel
      this.vs = 0;             // Vertikalgeschwindigkeit m/s
      this.pitchRate = 0;
      this.rollRate = 0;
      this.yawRate = 0;
      this.throttle = 0;
      this.flaps = 2;          // Startklappen
      this.gearDown = true;
      this.brakes = true;      // Parkbremse beim Start an
      this.onGround = true;
      this.crashed = false;
      this.stall = false;
      this.ground = alt;
      this.wind = { east: 0, north: 0 };
      this.message = "";
      this.ap = { on: false, alt: 0, hdg: 0, spd: 0 };
    }

    get sigma() { // relative Luftdichte
      return Math.exp(-Math.max(0, this.alt) / 9000);
    }
    get ias() { return this.tas * Math.sqrt(this.sigma); }
    get agl() { return this.alt - this.ground; }

    // Benötigter Anstellwinkel, um genug Auftrieb zu erzeugen
    aoaNeeded() {
      const t = this.type;
      const vs = t.vStallClean * (1 - 0.07 * this.flaps);
      const ias = Math.max(this.ias, 1);
      const loadFactor = 1 / Math.max(Math.cos(this.roll), 0.3);
      return 13 * D2R * (vs / ias) ** 2 * loadFactor;
    }

    // ----- Autopilot: setzt Steuereingaben selbst -----
    autopilot(input, dt) {
      const ap = this.ap;
      // Kurs halten -> Querneigung kommandieren
      let err = ap.hdg * D2R - this.heading;
      while (err > Math.PI) err -= 2 * Math.PI;
      while (err < -Math.PI) err += 2 * Math.PI;
      const targetRoll = clamp(err * 2.2, -25 * D2R, 25 * D2R);
      input.roll = clamp((targetRoll - this.roll) * 2.5, -1, 1);
      // Höhe halten -> Steigrate -> Flugbahnwinkel -> Nicklage
      const altErr = ap.alt * 0.3048 - this.alt;
      let targetVs = clamp(altErr * 0.08, -12, 12);
      // Im Steigflug nicht langsamer werden als die Sollgeschwindigkeit
      const deficit = ap.spd - this.ias * 1.94384;
      if (targetVs > 0) targetVs *= clamp(1 - (deficit - 5) / 25, 0.1, 1);
      if (targetVs < 0 && deficit < -15) targetVs *= clamp(1 - (-deficit - 15) / 25, 0.2, 1);
      const targetGamma = Math.asin(clamp(targetVs / Math.max(this.tas, 50), -0.3, 0.3));
      const targetPitch = targetGamma + Math.min(this.aoaNeeded(), 14 * D2R);
      input.pitch = clamp((targetPitch - this.pitch) * R2D * 0.35, -1, 1);
      input.yaw = 0;
      // Geschwindigkeit halten (Autothrottle)
      const spdErr = ap.spd - this.ias * 1.94384;
      this.throttle = clamp(this.throttle + spdErr * 0.004 * dt * 10, 0, 1);
    }

    step(dt, input, groundHeight) {
      if (this.crashed) return;
      const t = this.type;
      if (groundHeight !== undefined && isFinite(groundHeight)) this.ground = groundHeight;

      if (this.ap.on && !this.onGround) this.autopilot(input, dt);

      // --- Flugbereichsschutz (wie bei Airbus): verhindert, dass man die Nase
      //     so weit hochzieht, dass die Strömung abreisst ---
      if (!this.onGround) {
        const vStall = t.vStallClean * (1 - 0.07 * this.flaps) * Math.sqrt(1 / Math.max(Math.cos(this.roll), 0.3));
        const ias = this.ias;
        // Nicklage begrenzen (max. 20° Nase hoch, 15° Nase runter)
        if (this.pitch > 18 * D2R && input.pitch > 0) input.pitch *= Math.max(0, (20 * D2R - this.pitch) / (2 * D2R));
        if (this.pitch < -13 * D2R && input.pitch < 0) input.pitch *= Math.max(0, (this.pitch + 15 * D2R) / (2 * D2R));
        // zu langsam: Ziehen wird schwächer, darunter senkt sich die Nase selbst
        const lowSpeed = (ias - vStall * 1.13) / (vStall * 0.12);
        if (lowSpeed < 1 && input.pitch > 0) input.pitch *= Math.max(0, lowSpeed);
        if (lowSpeed < 0) input.pitch = Math.min(input.pitch, -0.5);
        // "Alpha Floor": kurz vor dem Strömungsabriss automatisch Vollschub
        if (ias < vStall * 1.08 && this.throttle < 1) {
          this.throttle = 1;
          if (!this.ap.on) this.message = "ALPHA FLOOR – automatischer Vollschub";
        }
      }

      // --- Steuerung mit Trägheit ---
      const k = 1 - Math.exp(-dt / t.inertia);
      const speedAuth = clamp(this.ias / 60, 0.15, 1); // langsam = träge Ruder
      this.pitchRate = lerp(this.pitchRate, input.pitch * t.pitchRate * D2R * speedAuth, k);
      let rollCmd = input.roll * t.rollRate * D2R * speedAuth;
      // sanftes Zurückrollen in die Waagerechte, wenn niemand steuert (einfacher zu fliegen)
      if (Math.abs(input.roll) < 0.05 && !this.ap.on) rollCmd = -this.roll * 0.35;
      this.rollRate = lerp(this.rollRate, rollCmd, k);
      this.yawRate = lerp(this.yawRate, input.yaw * 3 * D2R, k);

      // --- Schub und Widerstand ---
      const sigma = this.sigma;
      const thrust = t.thrust * this.throttle * Math.pow(sigma, 0.5);
      const aoaReq = this.aoaNeeded();
      // Luftwiderstand: Form-Widerstand (wächst mit Tempo, Klappen und Fahrwerk)
      // plus induzierter Widerstand (wächst mit dem Anstellwinkel, also bei langsamem Flug)
      const dragK = t.thrust / (t.vmo * 1.1) ** 2;
      let drag = dragK * sigma * this.tas ** 2 * (1 + 0.25 * this.flaps + (this.gearDown ? 0.15 : 0));
      if (!this.onGround) drag += 45 * Math.min(aoaReq, 16 * D2R) ** 2;
      if (this.ias > t.vmo) drag += (this.ias - t.vmo) * 0.15; // Überschreiten der Höchstgeschwindigkeit bremst stark

      if (this.onGround) {
        // ---------- am Boden ----------
        this.roll = 0; this.rollRate = 0;
        const rolling = 0.015 * G + (this.brakes ? 2.2 : 0);
        let acc = thrust - drag - (this.tas > 0.1 ? rolling : 0);
        if (this.brakes && this.tas < 0.5) { acc = 0; this.tas = 0; }
        this.tas = Math.max(0, this.tas + acc * dt);
        // Bugradlenkung mit Seitenruder bzw. Querruder bei langsamer Fahrt
        const steer = (input.yaw + input.roll * 0.5) * clamp(1.4 - this.tas / 50, 0.15, 1.4);
        this.heading += steer * 12 * D2R * dt * clamp(this.tas / 5, 0, 1);
        // Rotation nur ab Rotationsgeschwindigkeit möglich
        const canRotate = this.ias > t.vr * 0.92;
        if (canRotate) this.pitch = clamp(this.pitch + this.pitchRate * dt, 0, 13 * D2R);
        else this.pitch = Math.max(0, this.pitch - 3 * D2R * dt);
        this.gamma = 0;
        // Abheben, sobald die Nase hoch genug ist für den nötigen Auftrieb
        if (this.pitch - aoaReq > 0.3 * D2R && canRotate) {
          this.onGround = false;
          this.gamma = (this.pitch - aoaReq);
        }
        this.alt = this.ground;
      } else {
        // ---------- in der Luft ----------
        this.pitch = clamp(this.pitch + this.pitchRate * dt, -25 * D2R, 30 * D2R);
        this.roll = clamp(this.roll + this.rollRate * dt, -t.maxBank * 1.5 * D2R, t.maxBank * 1.5 * D2R);
        const aoaMax = 15 * D2R;
        this.stall = aoaReq > aoaMax;
        let aoa = Math.min(aoaReq, aoaMax);
        let gammaTarget = this.pitch - aoa;
        if (this.stall) {
          // Strömungsabriss: Flugzeug sackt durch, Nase fällt
          gammaTarget -= (aoaReq - aoaMax) * 1.5;
          this.pitch -= 4 * D2R * dt;
        }
        this.gamma = lerp(this.gamma, gammaTarget, 1 - Math.exp(-dt / 1.2));
        // Schwerkraft entlang der Flugbahn
        const acc = thrust - drag - G * Math.sin(this.gamma);
        this.tas = Math.max(0, this.tas + acc * dt);
        // Kurvenflug: Querneigung -> Kursänderung
        const v = Math.max(this.tas, 30);
        this.heading += (G * Math.tan(this.roll) / v) * dt + this.yawRate * dt;
      }
      this.heading = (this.heading + 2 * Math.PI) % (2 * Math.PI);

      // --- Position weiterbewegen ---
      const horiz = this.tas * Math.cos(this.gamma);
      const vn = horiz * Math.cos(this.heading) + (this.onGround ? 0 : this.wind.north);
      const ve = horiz * Math.sin(this.heading) + (this.onGround ? 0 : this.wind.east);
      this.vs = this.tas * Math.sin(this.gamma);
      const r = EARTH_R + this.alt;
      this.lat += (vn * dt) / r;
      this.lon += (ve * dt) / (r * Math.max(Math.cos(this.lat), 0.01));
      if (this.lat > 89.5 * D2R) this.lat = 89.5 * D2R;
      if (this.lat < -89.5 * D2R) this.lat = -89.5 * D2R;
      if (this.lon > Math.PI) this.lon -= 2 * Math.PI;
      if (this.lon < -Math.PI) this.lon += 2 * Math.PI;
      if (!this.onGround) this.alt += this.vs * dt;

      // --- Bodenberührung ---
      if (!this.onGround && this.alt <= this.ground) {
        const vsFpm = this.vs * 196.85;
        const gentle = vsFpm > -900 && Math.abs(this.roll) < 12 * D2R && this.pitch > -3 * D2R;
        if (this.gearDown && gentle) {
          this.onGround = true;
          this.alt = this.ground;
          this.gamma = 0;
          this.message = vsFpm > -300 ? "Butterweiche Landung!" : vsFpm > -600 ? "Gute Landung" : "Harte Landung";
          this.ap.on = false;
        } else {
          this.crashed = true;
          this.alt = this.ground;
          this.tas = 0;
          this.message = this.gearDown ? "Absturz – zu steil oder zu schnell aufgesetzt" : "Absturz – Fahrwerk war eingefahren";
        }
      }
    }
  }

  Object.assign((window.FS = window.FS || {}), { FlightModel, FLAP_STEPS, FLAP_LABEL });
})();
