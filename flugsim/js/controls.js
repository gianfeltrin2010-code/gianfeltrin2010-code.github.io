// =====================================================================
//  Tastatur-Steuerung. Hält fest, welche Tasten gerade gedrückt sind,
//  und meldet einmalige Aktionen (Fahrwerk, Klappen, Kamera ...).
// =====================================================================
(() => {
  class Controls {
    constructor() {
      this.down = new Set();
      this.handlers = {};
      this.invertPitch = false;
      this.enabled = true;
      window.addEventListener("keydown", (e) => {
        if (!this.enabled || e.target.closest("input, select, textarea")) return;
        const k = this.keyName(e);
        if (["arrowup", "arrowdown", "arrowleft", "arrowright", "pageup", "pagedown", " "].includes(k)) e.preventDefault();
        if (!e.repeat && this.handlers[k]) this.handlers[k](e);
        this.down.add(k);
      });
      window.addEventListener("keyup", (e) => this.down.delete(this.keyName(e)));
      window.addEventListener("blur", () => this.down.clear());
    }
    keyName(e) {
      if (e.key === "Shift") return "shift";
      return e.key.length === 1 ? e.key.toLowerCase() : e.key.toLowerCase();
    }
    on(key, fn) { for (const k of key.split(",")) this.handlers[k] = fn; }
    is(...keys) { return keys.some((k) => this.down.has(k)); }

    // Liefert Steuerausschläge zwischen -1 und 1
    read() {
      let pitch = 0, roll = 0, yaw = 0, throttle = 0;
      // "Nase hoch" = Pfeil runter / S (wie ein Steuerhorn zu sich ziehen)
      if (this.is("arrowdown", "s")) pitch += 1;
      if (this.is("arrowup", "w")) pitch -= 1;
      if (this.invertPitch) pitch = -pitch;
      if (this.is("arrowleft", "a")) roll -= 1;
      if (this.is("arrowright", "d")) roll += 1;
      if (this.is("q")) yaw -= 1;
      if (this.is("e")) yaw += 1;
      if (this.is("pageup", "shift", "+")) throttle += 1;
      if (this.is("pagedown", "x", "-")) throttle -= 1;
      return { pitch, roll, yaw, throttle };
    }
  }

  Object.assign((window.FS = window.FS || {}), { Controls });
})();
