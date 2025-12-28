const { app, Tray, Menu, BrowserWindow, nativeImage, globalShortcut, ipcMain } = require("electron");
const path = require("path");
const { spawn } = require("child_process");
const screenshot = require("screenshot-desktop");
const activeWin = require("active-win");
const sharp = require("sharp");
const STTManager = require("./stt-manager");

let tray = null;
let win = null;
let sttManager = null;

// Brain endpoints
const CHAT_URL = process.env.SOMA_BRAIN_CHAT_URL || "http://localhost:7171/chat";
const VISION_URL = process.env.SOMA_BRAIN_VISION_URL || "http://localhost:7171/vision";
// Level 2 Working Memory (session identity)
// One stable id per app run. Clears on restart.
const SOMA_SESSION_ID = (() => {
  const crypto = require("crypto");
  if (typeof crypto.randomUUID === "function") return crypto.randomUUID();
  return crypto.randomBytes(16).toString("hex");
})();

console.log("[SOMA] Session ID:", SOMA_SESSION_ID);


// Speech control
let isMuted = false;
let currentSpeech = null;

function stopSpeech() {
  if (currentSpeech) {
    try { currentSpeech.kill("SIGTERM"); } catch {}
    currentSpeech = null;
  }
}

function speakWindowsTTS(text) {
  if (isMuted) return;

  // Kill any current speech process
  stopSpeech();

  const trimmed = String(text || "").slice(0, 700);

  const piperExe   = process.env.SOMA_PIPER_EXE   || "C:\\Soma3\\piper\\piper\\piper.exe";
  const piperModel = process.env.SOMA_PIPER_MODEL || "C:\\Soma3\\piper\\voices\\amy\\en_US-amy-medium.onnx";
  const outWav     = "C:\\Soma3\\piper\\soma_last.wav";
  const logFile    = "C:\\Soma3\\piper\\tts_log.txt";

  const fs = require("fs");

  // Clear log each time
  try { fs.writeFileSync(logFile, "", "utf8"); } catch (e) {}

  // Start Piper directly (no cmd.exe, no quoting problems)
  const p = spawn(
    piperExe,
   ["--model", piperModel, "--output_file", outWav, "--length_scale", "0.75"],
    { windowsHide: true }
  );

  currentSpeech = p;

  // Log output for debugging
  p.stdout.on("data", (d) => { try { fs.appendFileSync(logFile, d.toString()); } catch (e) {} });
  p.stderr.on("data", (d) => { try { fs.appendFileSync(logFile, d.toString()); } catch (e) {} });

  // Feed text into Piper stdin
  try {
    p.stdin.write(trimmed, "utf8");
    p.stdin.end();
  } catch (e) {
    try { fs.appendFileSync(logFile, "\nSTDIN ERROR: " + e.message + "\n"); } catch (_) {}
  }

  // When Piper finishes, play the WAV (blocking). STOP will kill this too.
  p.on("exit", (code) => {
    try { fs.appendFileSync(logFile, "\nPIPER EXIT: " + code + "\n"); } catch (e) {}

    if (code !== 0) {
      currentSpeech = null;
      return;
    }

    const playPs = '$p=New-Object System.Media.SoundPlayer(' + "'" + outWav + "'" + ');$p.PlaySync()';
    const player = spawn("powershell.exe", ["-NoProfile", "-Command", playPs], { windowsHide: true });

    currentSpeech = player;

    player.stderr.on("data", (d) => { try { fs.appendFileSync(logFile, d.toString()); } catch (e) {} });

    player.on("exit", (c2) => {
      try { fs.appendFileSync(logFile, "\nPLAYER EXIT: " + c2 + "\n"); } catch (e) {}
      currentSpeech = null;
    });
  });
}

function createWindow() {
  win = new BrowserWindow({
    width: 520,
    height: 170,
    show: false,
    frame: false,
    resizable: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  win.loadFile(path.join(__dirname, "index.html"));

  // Hide popover when it loses focus (tray-style UX)
  win.on("blur", () => {
    if (win && win.isVisible()) win.hide();
  });
}

function toggleWindow() {
  if (!win) return;

  if (win.isVisible()) {
    win.hide();
    return;
  }

  const trayBounds = tray.getBounds();
  const winBounds = win.getBounds();

  const x = Math.round(trayBounds.x + trayBounds.width / 2 - winBounds.width / 2);
  const y = Math.round(trayBounds.y - winBounds.height - 8);

  win.setPosition(x, y, false);
  win.show();
  win.focus();
}

async function postJSON(url, body) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-session-id": SOMA_SESSION_ID },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    // Don't return giant HTML error pages to TTS
    const text = await res.text().catch(() => "");
    const short = text.replace(/\s+/g, " ").slice(0, 180);
    throw new Error(`${res.status} ${short}`);
  }

  return res.json();
}

app.whenReady().then(() => {
  const icon = nativeImage.createEmpty();
  tray = new Tray(icon);

  tray.setToolTip("Soma 3.0");

  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: "Open Soma Input", click: () => toggleWindow() },
      { type: "separator" },
      { label: "Mute/Unmute (Ctrl+M)", click: () => { isMuted = !isMuted; if (isMuted) stopSpeech(); } },
      { label: "Stop Speaking", click: () => stopSpeech() },
      { type: "separator" },
      { label: "Quit", click: () => app.quit() },
    ])
  );

  tray.on("click", () => toggleWindow());

  createWindow();

  // Initialize STT Manager
  sttManager = new STTManager();
  const sttStatus = sttManager.getStatus();
  console.log('[SOMA] STT initialized:', sttStatus.engine);

  // Hotkey to open the input
  globalShortcut.register("Control+Shift+Space", () => toggleWindow());

  // Hotkey to mute/unmute
  globalShortcut.register("Control+M", () => {
    isMuted = !isMuted;
    if (isMuted) stopSpeech();
  });

  // Hotkey to stop speech immediately
  globalShortcut.register("Control+Shift+S", () => stopSpeech());

  // Hotkey for push-to-talk voice input
  globalShortcut.register("Control+Shift+V", () => {
    if (win && win.isVisible()) {
      win.webContents.send('voice-hotkey-pressed');
    }
  });
});

app.on("window-all-closed", (e) => e.preventDefault());
app.on("will-quit", () => globalShortcut.unregisterAll());

// IPC: Send chat
ipcMain.handle("soma:send", async (event, text) => {
  const cleaned = String(text || "").trim();
  if (!cleaned) return { ok: false, error: "Empty input." };

  try {
    const data = await postJSON(CHAT_URL, { text: cleaned });
    const reply = data?.assistant_text ?? "No response returned.";
    speakWindowsTTS(reply);
    return { ok: true, reply, suggested_actions: data?.suggested_actions ?? [] };
  } catch (err) {
    const msg = err?.message || "Unknown error";
    // Speak only a short friendly error
    speakWindowsTTS("Sorry — I hit an error sending that.");
    return { ok: false, error: msg };
  }
});

// IPC: Snapshot
ipcMain.handle("soma:snapshot", async () => {
  try {
const imgBuffer = await screenshot({ format: "png" });

const smallJpg = await sharp(imgBuffer)
  .resize({ width: 1280, withoutEnlargement: true })
  .jpeg({ quality: 70 })
  .toBuffer();

const imageB64 = smallJpg.toString("base64");


    // v2: window title is just a hint; we'll improve later
    let windowTitle = "";
try {
  const info = await activeWin();
  windowTitle = info?.title || "";
} catch {
  windowTitle = "";
}


const data = await postJSON(VISION_URL, { imageB64, windowTitle, imageMime: "image/jpeg" });
    const reply = data?.assistant_text ?? "Snapshot received.";
    speakWindowsTTS(reply);
    return { ok: true, reply };
  } catch (err) {
    const msg = err?.message || "Snapshot error";
    speakWindowsTTS("Snapshot failed.");
    return { ok: false, error: msg };
  }
});

// IPC: Stop + Mute
ipcMain.handle("soma:stop", async () => {
  stopSpeech();
  return { ok: true };
});

ipcMain.handle("soma:mute", async (event, value) => {
  isMuted = Boolean(value);
  if (isMuted) stopSpeech();
  return { ok: true, muted: isMuted };
});

// IPC: Voice Recording (STT)
ipcMain.handle("soma:startRecording", async () => {
  if (!sttManager) {
    return { ok: false, error: "STT not initialized" };
  }
  return sttManager.startRecording();
});

ipcMain.handle("soma:stopRecording", async () => {
  if (!sttManager) {
    return { ok: false, error: "STT not initialized" };
  }
  const result = await sttManager.stopRecording();
  return result;
});

ipcMain.handle("soma:cancelRecording", async () => {
  if (!sttManager) {
    return { ok: false, error: "STT not initialized" };
  }
  return sttManager.cancelRecording();
});

ipcMain.handle("soma:getSTTStatus", async () => {
  if (!sttManager) {
    return { available: false };
  }
  return sttManager.getStatus();
});








