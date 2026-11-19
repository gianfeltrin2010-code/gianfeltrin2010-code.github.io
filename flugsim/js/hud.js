// =====================================================================
//  Instrumente: Cockpit-Panel mit PFD (künstlicher Horizont, Fahrt,
//  Höhe, Kurs, Steigrate) und eine kompakte Anzeige für Aussenansichten.
// =====================================================================
(() => {
  const R2D = 180 / Math.PI;

  class Hud {
    constructor(canvas) {
      this.canvas = canvas;
      this.ctx = canvas.getContext("2d");
      this.resize();
      window.addEventListener("resize", () => this.resize());
    }
    resize() {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      this.dpr = dpr;
      this.canvas.width = innerWidth * dpr;
      this.canvas.height = innerHeight * dpr;
    }

    draw(fm, mode, rig) {
      const ctx = this.ctx, W = this.canvas.width / this.dpr, H = this.canvas.height / this.dpr;
      ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
      ctx.clearRect(0, 0, W, H);
      if (mode !== "cockpit") return;
      // Panel bewegt sich mit, wenn man den Kopf dreht
      const ox = -rig.lookYaw * R2D * (W / 90);
      const oy = (rig.lookPitch * R2D + 6) * (H / 60);
      if (Math.abs(rig.lookYaw * R2D) > 75) return;
      ctx.save();
      ctx.translate(ox, oy);
      this.drawPanel(ctx, W, H, fm);
      ctx.restore();
    }

    drawPanel(ctx, W, H, fm) {
      const panelTop = H * 0.6;
      // Blendschutz und Instrumentenbrett
      ctx.fillStyle = "#1c1f24";
      ctx.beginPath();
      ctx.moveTo(-W, H * 2);
      ctx.lineTo(-W, panelTop + 30);
      ctx.quadraticCurveTo(W / 2, panelTop - 40, W * 2, panelTop + 30);
      ctx.lineTo(W * 2, H * 2);
      ctx.fill();
      ctx.fillStyle = "#2a2e35";
      ctx.fillRect(-W, panelTop + 40, W * 3, H * 2);
      // Fensterrahmen links/rechts
      ctx.fillStyle = "#16181c";
      ctx.beginPath(); ctx.moveTo(-W, 0); ctx.lineTo(W * 0.06, 0); ctx.lineTo(W * 0.02, panelTop + 30); ctx.lineTo(-W, panelTop + 30); ctx.fill();
      ctx.beginPath(); ctx.moveTo(W * 2, 0); ctx.lineTo(W * 0.94, 0); ctx.lineTo(W * 0.98, panelTop + 30); ctx.lineTo(W * 2, panelTop + 30); ctx.fill();

      const size = Math.min(H * 0.3, W * 0.24);
      const y = panelTop + 45;
      this.drawPFD(ctx, W / 2 - size * 1.15, y, size, fm);
      this.drawND(ctx, W / 2 + size * 0.15, y, size, fm);
    }

    drawPFD(ctx, x, y, s, fm) {
      ctx.save();
      ctx.fillStyle = "#000"; ctx.fillRect(x, y, s, s);
      ctx.beginPath(); ctx.rect(x, y, s, s); ctx.clip();
      const cx = x + s * 0.5, cy = y + s * 0.47;
      const pxDeg = s / 45;
      // künstlicher Horizont
      ctx.save();
      ctx.beginPath(); ctx.rect(x + s * 0.22, y + s * 0.12, s * 0.56, s * 0.66); ctx.clip();
      ctx.translate(cx, cy);
      ctx.rotate(-fm.roll);
      ctx.translate(0, fm.pitch * R2D * pxDeg);
      ctx.fillStyle = "#2c7bd6"; ctx.fillRect(-s * 2, -s * 4, s * 4, s * 4);
      ctx.fillStyle = "#8a5a2b"; ctx.fillRect(-s * 2, 0, s * 4, s * 4);
      ctx.strokeStyle = "#fff"; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(-s, 0); ctx.lineTo(s, 0); ctx.stroke();
      ctx.font = `${Math.round(s * 0.04)}px sans-serif`; ctx.fillStyle = "#fff"; ctx.textAlign = "left";
      for (let p = -30; p <= 30; p += 5) {
        if (!p) continue;
        const yy = -p * pxDeg, w = p % 10 === 0 ? s * 0.12 : s * 0.06;
        ctx.beginPath(); ctx.moveTo(-w, yy); ctx.lineTo(w, yy); ctx.stroke();
        if (p % 10 === 0) ctx.fillText(Math.abs(p), w + 4, yy + 4);
      }
      ctx.restore();
      // Flugzeugsymbol
      ctx.strokeStyle = "#ffd400"; ctx.lineWidth = 4;
      ctx.beginPath(); ctx.moveTo(cx - s * 0.17, cy); ctx.lineTo(cx - s * 0.06, cy); ctx.moveTo(cx + s * 0.06, cy); ctx.lineTo(cx + s * 0.17, cy); ctx.stroke();
      ctx.fillStyle = "#ffd400"; ctx.fillRect(cx - 3, cy - 3, 6, 6);
      // Flugbahn-Markierung (wohin das Flugzeug tatsächlich fliegt)
      const fpmY = cy + (fm.pitch - fm.gamma) * R2D * pxDeg;
      ctx.strokeStyle = "#3df07a"; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(cx, fpmY, 6, 0, Math.PI * 2);
      ctx.moveTo(cx - 14, fpmY); ctx.lineTo(cx - 6, fpmY); ctx.moveTo(cx + 6, fpmY); ctx.lineTo(cx + 14, fpmY); ctx.stroke();

      // Fahrt-Band (links)
      const kt = fm.ias * 1.94384;
      this.tape(ctx, x + s * 0.02, y + s * 0.12, s * 0.17, s * 0.66, kt, 10, 4, s, "left");
      // Höhen-Band (rechts)
      const ft = fm.alt * 3.28084;
      this.tape(ctx, x + s * 0.81, y + s * 0.12, s * 0.17, s * 0.66, ft, 100, 0.25, s, "right");
      // Kurs unten
      ctx.fillStyle = "#222"; ctx.fillRect(x + s * 0.22, y + s * 0.84, s * 0.56, s * 0.12);
      ctx.fillStyle = "#fff"; ctx.textAlign = "center"; ctx.font = `bold ${Math.round(s * 0.06)}px sans-serif`;
      const hdg = ((fm.heading * R2D) % 360 + 360) % 360;
      ctx.fillText(String(Math.round(hdg) % 360).padStart(3, "0") + "°", cx, y + s * 0.92);
      // Steigrate
      const fpm = fm.vs * 196.85;
      ctx.font = `${Math.round(s * 0.045)}px sans-serif`;
      ctx.fillStyle = Math.abs(fpm) > 3000 ? "#ffb000" : "#3df07a";
      ctx.fillText((fpm >= 0 ? "▲ " : "▼ ") + Math.abs(Math.round(fpm / 10) * 10) + " ft/min", cx, y + s * 0.07);
      if (fm.stall) { ctx.fillStyle = "#ff3030"; ctx.font = `bold ${Math.round(s * 0.08)}px sans-serif`; ctx.fillText("STALL", cx, cy - s * 0.2); }
      ctx.restore();
    }

    tape(ctx, x, y, w, h, value, step, pxPer, s, side) {
      ctx.save();
      ctx.fillStyle = "#3a3f47"; ctx.fillRect(x, y, w, h);
      ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip();
      const mid = y + h / 2;
      ctx.strokeStyle = "#fff"; ctx.fillStyle = "#fff"; ctx.lineWidth = 1;
      ctx.font = `${Math.round(s * 0.042)}px sans-serif`;
      ctx.textAlign = side === "left" ? "right" : "left";
      const pxPerUnit = pxPer * (s / 300) * (side === "left" ? 1 : 1);
      const start = Math.floor((value - h / 2 / pxPerUnit) / step) * step;
      for (let v = start; v < value + h / 2 / pxPerUnit + step; v += step) {
        const yy = mid - (v - value) * pxPerUnit;
        const big = side === "left" ? v % 20 === 0 : v % 500 === 0;
        ctx.beginPath();
        if (side === "left") { ctx.moveTo(x + w, yy); ctx.lineTo(x + w - (big ? 10 : 5), yy); }
        else { ctx.moveTo(x, yy); ctx.lineTo(x + (big ? 10 : 5), yy); }
        ctx.stroke();
        if (big && v >= 0) ctx.fillText(v, side === "left" ? x + w - 13 : x + 13, yy + 4);
      }
      ctx.restore();
      // aktueller Wert im Kästchen
      ctx.fillStyle = "#000"; ctx.strokeStyle = "#ffd400"; ctx.lineWidth = 1.5;
      ctx.fillRect(x, mid - s * 0.04, w, s * 0.08); ctx.strokeRect(x, mid - s * 0.04, w, s * 0.08);
      ctx.fillStyle = "#3df07a"; ctx.textAlign = "center"; ctx.font = `bold ${Math.round(s * 0.05)}px sans-serif`;
      ctx.fillText(Math.round(value), x + w / 2, mid + s * 0.018);
    }

    drawND(ctx, x, y, s, fm) {
      // vereinfachte Navigations-/Statusanzeige
      ctx.save();
      ctx.fillStyle = "#000"; ctx.fillRect(x, y, s, s);
      const cx = x + s / 2, cy = y + s * 0.55, r = s * 0.36;
      ctx.strokeStyle = "#fff"; ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.stroke();
      ctx.save(); ctx.translate(cx, cy); ctx.rotate(-fm.heading);
      ctx.font = `${Math.round(s * 0.045)}px sans-serif`; ctx.fillStyle = "#fff"; ctx.textAlign = "center";
      for (let d = 0; d < 360; d += 10) {
        const a = d * Math.PI / 180;
        ctx.save(); ctx.rotate(a);
        ctx.beginPath(); ctx.moveTo(0, -r); ctx.lineTo(0, -r + (d % 30 === 0 ? 10 : 5)); ctx.stroke();
        if (d % 30 === 0) ctx.fillText(d === 0 ? "N" : d === 90 ? "E" : d === 180 ? "S" : d === 270 ? "W" : d / 10, 0, -r + 24);
        ctx.restore();
      }
      if (fm.ap.on) { // Sollkurs-Markierung
        ctx.save(); ctx.rotate(fm.ap.hdg * Math.PI / 180);
        ctx.fillStyle = "#d24bff"; ctx.beginPath(); ctx.moveTo(-6, -r - 2); ctx.lineTo(6, -r - 2); ctx.lineTo(0, -r + 8); ctx.fill();
        ctx.restore();
      }
      ctx.restore();
      // Flugzeug in der Mitte
      ctx.strokeStyle = "#ffd400"; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(cx, cy - 14); ctx.lineTo(cx, cy + 14); ctx.moveTo(cx - 12, cy - 2); ctx.lineTo(cx + 12, cy - 2); ctx.moveTo(cx - 5, cy + 11); ctx.lineTo(cx + 5, cy + 11); ctx.stroke();
      // Statuszeilen
      ctx.font = `${Math.round(s * 0.045)}px monospace`; ctx.textAlign = "left"; ctx.fillStyle = "#3df07a";
      const lines = [
        `GS ${Math.round(fm.tas * 1.94384)}  TAS ${Math.round(fm.tas * 1.94384)}`,
        `N1 ${Math.round(20 + fm.throttle * 80)}%   FLAPS ${["0", "1", "2", "3", "FULL"][fm.flaps]}`,
        `GEAR ${fm.gearDown ? "DOWN" : "UP"}  ${fm.brakes ? "BRK" : ""}`,
      ];
      lines.forEach((l, i) => ctx.fillText(l, x + 8, y + 18 + i * s * 0.055));
      if (fm.ap.on) {
        ctx.fillStyle = "#d24bff";
        ctx.fillText(`AP ALT ${fm.ap.alt}  HDG ${String(fm.ap.hdg).padStart(3, "0")}  SPD ${fm.ap.spd}`, x + 8, y + s - 10);
      }
      ctx.restore();
    }
  }

  Object.assign((window.FS = window.FS || {}), { Hud });
})();
