// =====================================================================
//  Kameras. Jede Ansicht berechnet Position und Blickrichtung selbst.
// =====================================================================
(() => {
  const C = window.Cesium;
  const D2R = Math.PI / 180;

  const CAMERA_MODES = [
    { id: "chase", label: "Aussenansicht" },
    { id: "cockpit", label: "Cockpit" },
  ];

  class CameraRig {
    constructor(viewer) {
      this.viewer = viewer;
      this.camera = viewer.camera;
      this.mode = "chase";
      // Verfolgerkamera: Drehung relativ zum Flugzeug (mit Maus veränderbar)
      this.orbitYaw = 0;
      this.orbitPitch = -12 * D2R;
      this.distance = 75;
      this.smoothHeading = null;
      // Cockpit: Kopf drehen
      this.lookYaw = 0;
      this.lookPitch = -6 * D2R;
      this._setupMouse(viewer.canvas);
    }

    _setupMouse(canvas) {
      let dragging = false, lx = 0, ly = 0;
      canvas.addEventListener("pointerdown", (e) => { dragging = true; lx = e.clientX; ly = e.clientY; canvas.setPointerCapture(e.pointerId); });
      canvas.addEventListener("pointerup", () => { dragging = false; });
      canvas.addEventListener("pointermove", (e) => {
        if (!dragging) return;
        const dx = (e.clientX - lx) * 0.3 * D2R, dy = (e.clientY - ly) * 0.3 * D2R;
        lx = e.clientX; ly = e.clientY;
        if (this.mode === "cockpit") {
          this.lookYaw = Math.max(-150 * D2R, Math.min(150 * D2R, this.lookYaw + dx));
          this.lookPitch = Math.max(-60 * D2R, Math.min(50 * D2R, this.lookPitch - dy));
        } else {
          this.orbitYaw += dx;
          this.orbitPitch = Math.max(-80 * D2R, Math.min(60 * D2R, this.orbitPitch - dy));
        }
      });
      canvas.addEventListener("dblclick", () => { this.orbitYaw = 0; this.orbitPitch = -12 * D2R; this.lookYaw = 0; this.lookPitch = -6 * D2R; });
      canvas.addEventListener("wheel", (e) => {
        e.preventDefault();
        this.distance = Math.max(25, Math.min(2000, this.distance * (1 + Math.sign(e.deltaY) * 0.12)));
      }, { passive: false });
    }

    setMode(id) { this.mode = id; }

    // frame: { pos (Cartesian3), east, north, up, fwd, right, upA (Flugzeugachsen), heading }
    update(f, dt, groundAt) {
      const cam = this.camera;
      cam.lookAtTransform(C.Matrix4.IDENTITY);
      if (this.mode === "cockpit") {
        // Augpunkt im Cockpit, Blick entlang der Flugzeugachse plus Kopfdrehung
        const eye = f.local(f.spec.cockpitEye);
        const cy = Math.cos(this.lookYaw), sy = Math.sin(this.lookYaw);
        const cp = Math.cos(this.lookPitch), sp = Math.sin(this.lookPitch);
        // Richtung im Flugzeugsystem: vorne/rechts/oben
        const d = add3(scale3(f.fwd, cp * cy), scale3(f.right, cp * sy), scale3(f.upA, sp));
        const up = add3(scale3(f.fwd, -sp * cy), scale3(f.right, -sp * sy), scale3(f.upA, cp));
        this._set(eye, d, up);
        return;
      }
      // ---- Verfolgerkamera ----
      if (this.smoothHeading === null) this.smoothHeading = f.heading;
      let dh = f.heading - this.smoothHeading;
      while (dh > Math.PI) dh -= 2 * Math.PI;
      while (dh < -Math.PI) dh += 2 * Math.PI;
      this.smoothHeading += dh * (1 - Math.exp(-dt / 0.6));
      const yaw = this.smoothHeading + this.orbitYaw;
      const target = f.local([-4, 0, f.spec.fuselageCenterZ]);
      const horiz = add3(scale3(f.north, Math.cos(yaw)), scale3(f.east, Math.sin(yaw)));
      const back = add3(scale3(horiz, -Math.cos(this.orbitPitch)), scale3(f.up, -Math.sin(this.orbitPitch)));
      let pos = C.Cartesian3.add(target, toC(scale3(back, this.distance)), new C.Cartesian3());
      // nicht unter den Boden
      const carto = C.Cartographic.fromCartesian(pos);
      const gh = groundAt(carto);
      if (gh !== undefined && carto.height < gh + 3) {
        carto.height = gh + 3;
        pos = C.Cartographic.toCartesian(carto);
      }
      const dir = C.Cartesian3.normalize(C.Cartesian3.subtract(target, pos, new C.Cartesian3()), new C.Cartesian3());
      const rightV = C.Cartesian3.normalize(C.Cartesian3.cross(dir, toC(f.up), new C.Cartesian3()), new C.Cartesian3());
      const upV = C.Cartesian3.cross(rightV, dir, new C.Cartesian3());
      this._set(pos, [dir.x, dir.y, dir.z], [upV.x, upV.y, upV.z]);
    }

    _set(pos, d, up) {
      const cam = this.camera;
      cam.position = C.Cartesian3.clone(pos, cam.position);
      cam.direction = C.Cartesian3.normalize(toC(d), cam.direction);
      cam.up = C.Cartesian3.normalize(toC(up), cam.up);
      cam.right = C.Cartesian3.normalize(C.Cartesian3.cross(cam.direction, cam.up, new C.Cartesian3()), cam.right);
    }
  }

  // kleine Vektorhelfer (Arrays [x,y,z])
  const add3 = (...v) => v.reduce((a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]]);
  const scale3 = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
  const toC = (a) => new C.Cartesian3(a[0], a[1], a[2]);

  Object.assign((window.FS = window.FS || {}), { CameraRig, CAMERA_MODES, add3, scale3, toC });
})();
