// YAGBE-Seite: Download-Daten von GitHub holen und den Game Boy auf der Seite bedienbar machen.
"use strict";

const REPO = "Malte007/YAGBE";
const DL = `https://github.com/${REPO}/releases/latest/download/`;

// Menüeinträge des Game Boy = Download-Dateien
const TARGETS = [
  { id: "win",       name: "WINDOWS",   label: "Windows",          file: "YAGBE-win-x64.zip" },
  { id: "linux",     name: "LINUX",     label: "Linux",            file: "YAGBE-linux-x64.zip" },
  { id: "mac-arm",   name: "MAC APPLE", label: "macOS Apple-Chip", file: "YAGBE-osx-arm64.zip" },
  { id: "mac-intel", name: "MAC INTEL", label: "macOS Intel",      file: "YAGBE-osx-x64.zip" },
];

// Farbthemen wie in der App (hell -> dunkel)
const PALETTES = [
  { name: "DMG GRUEN",  c: ["#9BBC0F", "#8BAC0F", "#306230", "#0F380F"] },
  { name: "POCKET",     c: ["#C4CFA1", "#8B956D", "#4D533C", "#1F1F1F"] },
  { name: "KIROKAZE",   c: ["#E2F3E4", "#94E344", "#46878F", "#332C50"] },
  { name: "ICE CREAM",  c: ["#FFF6D3", "#F9A875", "#EB6B6F", "#7C3F58"] },
  { name: "MIST",       c: ["#C4F0C2", "#5AB9A8", "#1E606E", "#2D1B00"] },
  { name: "RUSTIC",     c: ["#EDB4A1", "#A96868", "#764462", "#2C2137"] },
  { name: "NOSTALGIE",  c: ["#D0D058", "#A0A840", "#708028", "#405010"] },
  { name: "GRAUSTUFEN", c: ["#FFFFFF", "#AAAAAA", "#555555", "#000000"] },
];

// #region Betriebssystem erkennen
function detectOs() {
  const ua = navigator.userAgent;
  if (/Windows/i.test(ua)) return "win";
  if (/Android|iPhone|iPad/i.test(ua)) return null;          // Handy: kein passender Download
  if (/Mac/i.test(ua)) return isIntelMac() ? "mac-intel" : "mac-arm";
  if (/Linux|X11/i.test(ua)) return "linux";
  return null;
}

// Intel-Macs verraten sich meist über den Grafiktreiber, sonst Apple-Chip annehmen
function isIntelMac() {
  try {
    const gl = document.createElement("canvas").getContext("webgl");
    const ext = gl && gl.getExtension("WEBGL_debug_renderer_info");
    return !!ext && /Intel|AMD|Radeon/i.test(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL));
  } catch { return false; }
}
// #endregion

// #region Download-Knöpfe und Versionsinfo
const myOs = detectOs();
const mine = TARGETS.find(t => t.id === myOs);
if (mine) {
  document.getElementById("main-download").href = DL + mine.file;
  document.getElementById("main-download-sub").textContent = `für ${mine.label}`;
  document.querySelector(`.dl[data-os="${mine.id}"]`)?.classList.add("mine");
  // passende Starthilfe aufklappen
  for (const d of document.querySelectorAll(".howto details")) d.open = mine.id.startsWith(d.dataset.os);
}

// Neueste Version abfragen (nur für Anzeige; Links funktionieren auch ohne)
let latestTag = "";
fetch(`https://api.github.com/repos/${REPO}/releases/latest`)
  .then(r => (r.ok ? r.json() : Promise.reject(r.status)))
  .then(rel => {
    latestTag = rel.tag_name;
    const date = new Date(rel.published_at).toLocaleDateString("de-DE");
    document.getElementById("version").textContent = `Version ${rel.tag_name.replace(/^v/, "")} vom ${date}`;
    for (const el of document.querySelectorAll(".dl-size")) {
      const asset = rel.assets.find(a => a.name === el.dataset.file);
      if (asset) el.textContent = `ZIP · ${(asset.size / 1048576).toFixed(0)} MB`;
    }
  })
  .catch(() => {
    document.getElementById("version").textContent = "Noch keine Version veröffentlicht, schau bald wieder vorbei.";
  });
// #endregion

// #region Game Boy: Bildschirm
const lcd = document.getElementById("lcd");
const ctx = lcd.getContext("2d");
const FONT = '"Press Start 2P"';
let pal = 0;          // aktuelles Farbthema
let state = "boot";   // boot | menu | load | info
let t0 = 0;           // Startzeit des aktuellen Zustands
let cursor = Math.max(0, TARGETS.indexOf(mine));
let sound = false;    // Ton erst nach einem Klick (Browser-Regel)

const col = i => PALETTES[pal].c[i];

// Text zentriert oder ab x zeichnen, Größe 8 = ein Game-Boy-Kachelraster
function text(str, y, { x = null, size = 8, c = 3 } = {}) {
  ctx.font = `${size}px ${FONT}`;
  ctx.fillStyle = col(c);
  ctx.textBaseline = "top";
  const w = ctx.measureText(str).width;
  ctx.fillText(str, x ?? Math.round((160 - w) / 2), y);
}

function setState(s) { state = s; t0 = performance.now(); }

function draw(now) {
  const t = now - t0;
  ctx.fillStyle = col(0);
  ctx.fillRect(0, 0, 160, 144);

  if (state === "boot") {
    // Logo fällt von oben in die Mitte, wie beim echten Einschalten
    const y = Math.min(56, -16 + t / 30);
    text("YAGBE", Math.round(y), { size: 16 });
    if (y >= 56 && !draw.plinged) { draw.plinged = true; pling(); }
    if (t > 3600) setState("menu");
  } else if (state === "menu") {
    text("DOWNLOAD", 8);
    text(latestTag || "NEUESTE", 20, { c: 2 });
    TARGETS.forEach((tg, i) => {
      const y = 44 + i * 16;
      text(tg.name, y, { x: 28, c: i === cursor ? 3 : 2 });
      if (i === cursor && Math.floor(t / 400) % 2 === 0) text(">", y, { x: 14 });
    });
    text("A:LADEN  B:INFO", 116, { c: 2 });
    text("SEL:FARBE", 128, { c: 2 });
  } else if (state === "load") {
    // kleiner Ladebalken, danach startet der echte Download
    const p = Math.min(1, t / 1200);
    text("LADE", 40);
    text(TARGETS[cursor].name, 56, { c: 2 });
    ctx.fillStyle = col(3);
    ctx.fillRect(24, 80, 112, 10);
    ctx.fillStyle = col(1);
    ctx.fillRect(26, 82, Math.round(108 * p), 6);
    if (p >= 1) {
      // ohne veröffentlichte Version gäbe der Link nur eine Fehlerseite
      if (!draw.started && latestTag) { draw.started = true; location.href = DL + TARGETS[cursor].file; }
      text(latestTag ? "VIEL SPASS!" : "NOCH NICHT DA", 104);
      if (t > 3200) setState("menu");
    }
  } else if (state === "info") {
    text("YAGBE", 12, { size: 16 });
    text("YET ANOTHER", 40, { c: 2 });
    text("GAME BOY", 52, { c: 2 });
    text("EMULATOR", 64, { c: 2 });
    text(`FARBE:${PALETTES[pal].name}`, 88, { c: 2 });
    text("(C) 2026", 108, { c: 1 });
    text("MALTE & CLAUDE", 120, { c: 1 });
  }
  requestAnimationFrame(draw);
}
// #endregion

// #region Game Boy: Tasten
function press(key) {
  if (key === "start") { draw.plinged = false; setState("boot"); return; }
  if (key === "select") { pal = (pal + 1) % PALETTES.length; applyPalette(); blip(330); return; }
  if (state === "boot") { setState("menu"); return; }  // Intro überspringen
  if (state === "info") { setState("menu"); return; }
  if (state !== "menu") return;
  if (key === "up" || key === "down") {
    cursor = (cursor + (key === "up" ? -1 : 1) + TARGETS.length) % TARGETS.length;
    t0 = performance.now();                          // Cursor sofort sichtbar
    blip(880);
  } else if (key === "a") {
    draw.started = false; blip(1320); setState("load");
  } else if (key === "b") {
    blip(440); setState("info");
  }
}

// Seitenfarbe folgt dem Farbthema
function applyPalette() {
  document.documentElement.style.setProperty("--lcd-0", col(0) === "#FFFFFF" ? col(1) : col(0));
  document.documentElement.style.setProperty("--lcd-3", col(3));
}

// Klicks auf die Tasten; Tastatur erst, wenn man den Game Boy angeklickt hat
const gb = document.getElementById("gameboy");
let kbActive = false;
gb.addEventListener("pointerdown", e => {
  kbActive = true; sound = true;
  const k = e.target.dataset?.key;
  if (k) { e.preventDefault(); press(k); }
});
document.addEventListener("pointerdown", e => { if (!gb.contains(e.target)) kbActive = false; });

const KEYS = {
  ArrowUp: "up", ArrowDown: "down", ArrowLeft: "up", ArrowRight: "down",
  Enter: "a", x: "a", a: "a", Backspace: "b", z: "b", y: "b", b: "b",
  Shift: "select", " ": "start",
};
document.addEventListener("keydown", e => {
  const k = KEYS[e.key];
  if (!kbActive || !k || e.repeat) return;
  e.preventDefault();
  const btn = gb.querySelector(`[data-key="${k}"]`);
  btn?.classList.add("pressed");
  setTimeout(() => btn?.classList.remove("pressed"), 120);
  press(k);
});
// #endregion

// #region Ton (Rechteckwelle wie beim Game Boy)
let audio = null;
function tone(freq, start, dur, vol = 0.06) {
  if (!sound) return;
  audio ??= new AudioContext();
  const o = audio.createOscillator(), g = audio.createGain();
  o.type = "square";
  o.frequency.value = freq;
  g.gain.setValueAtTime(vol, audio.currentTime + start);
  g.gain.exponentialRampToValueAtTime(0.0001, audio.currentTime + start + dur);
  o.connect(g).connect(audio.destination);
  o.start(audio.currentTime + start);
  o.stop(audio.currentTime + start + dur);
}
const blip = f => tone(f, 0, 0.06, 0.04);
const pling = () => { tone(1046, 0, 0.08); tone(2093, 0.08, 0.6); };
// #endregion

// Start: Power-LED an, sobald die Schrift geladen ist (sonst wäre die Schrift kurz falsch)
document.fonts.load(`8px ${FONT}`).finally(() => {
  document.getElementById("gb-power").classList.add("on");
  setState("boot");
  requestAnimationFrame(draw);
});
