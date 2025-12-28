const { app, Tray, Menu, BrowserWindow, nativeImage, globalShortcut, ipcMain } = require("electron");
const path = require("path");
const fs = require("fs");
const { spawn } = require("child_process");
const screenshot = require("screenshot-desktop");
const activeWin = require("active-win");
const sharp = require("sharp");

let tray = null;
let win = null;

// Brain endpoints
const CHAT_URL = process.env.SOMA_BRAIN_CHAT_URL || "http://localhost:7171/chat";
const VISION_URL = process.env.SOMA_BRAIN_VISION_URL || "http://localhost:7171/vision";
const HISTORY_URL = process.env.SOMA_BRAIN_HISTORY_URL || "http://localhost:7171/history";

// Session persistence
const SESSION_FILE = path.join(app.getPath('userData'), '.soma_session');
const SESSION_TIMEOUT_DAYS = 7; // Start new session after 7 days

// Load or create session ID
function getOrCreateSessionId() {
  const crypto = require("crypto");
  
  try {
    // Try to load existing session
    if (fs.existsSync(SESSION_FILE)) {
      const data = JSON.parse(fs.readFileSync(SESSION_FILE, 'utf8'));
      const sessionAge = Date.now() - data.timestamp;
      const maxAge = SESSION_TIMEOUT_DAYS * 24 * 60 * 60 * 1000;
      
      // Reuse session if it's recent (within timeout period)
      if (sessionAge < maxAge) {
        console.log("[SOMA] Resuming session:", data.sessionId);
        console.log("[SOMA] Session age:", Math.floor(sessionAge / 1000 / 60 / 60), "hours");
        return data.sessionId;
      } else {
        console.log("[SOMA] Session expired, creating new session");
      }
    }
  } catch (error) {
    console.log("[SOMA] Could not load session:", error.message);
  }
  
  // Create new session ID
  const newSessionId = crypto.randomUUID ? crypto.randomUUID() : crypto.randomBytes(16).toString("hex");
  
  try {
    // Save session to file
    fs.writeFileSync(SESSION_FILE, JSON.stringify({
      sessionId: newSessionId,
      timestamp: Date.now(),
      created: new Date().toISOString()
    }));
    console.log("[SOMA] Created new session:", newSessionId);
  } catch (error) {
    console.log("[SOMA] Could not save session:", error.message);
  }
  
  return newSessionId;
}

// Update session timestamp (keep session alive)
function updateSessionTimestamp() {
  try {
    if (fs.existsSync(SESSION_FILE)) {
      const data = JSON.parse(fs.readFileSync(SESSION_FILE, 'utf8'));
      data.timestamp = Date.now();
      data.lastActive = new Date().toISOString();
      fs.writeFileSync(SESSION_FILE, JSON.stringify(data));
    }
  } catch (error) {
    console.log("[SOMA] Could not update session:", error.message);
  }
}

// Start new session manually
function startNewSession() {
  const crypto = require("crypto");
  const newSessionId = crypto.randomUUID ? crypto.randomUUID() : crypto.randomBytes(16).toString("hex");
  
  try {
    fs.writeFileSync(SESSION_FILE, JSON.stringify({
      sessionId: newSessionId,
      timestamp: Date.now(),
      created: new Date().toISOString()
    }));
    console.log("[SOMA] Started new session:", newSessionId);
    return newSessionId;
  } catch (error) {
    console.log("[SOMA] Could not create new session:", error.message);
    return newSessionId;
  }
}

let SOMA_SESSION_ID = getOrCreateSessionId();

// Update session timestamp every 5 minutes to keep it active
setInterval(updateSessionTimestamp, 5 * 60 * 1000);


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

// View conversation history
async function viewHistory() {
  try {
    const historyUrl = `${HISTORY_URL}/${SOMA_SESSION_ID}?limit=50`;
    const res = await fetch(historyUrl, {
      headers: { "x-session-id": SOMA_SESSION_ID }
    });
    
    if (!res.ok) {
      throw new Error(`Failed to fetch history: ${res.status}`);
    }
    
    const data = await res.json();
    const history = data.history || [];
    
    if (history.length === 0) {
      speakWindowsTTS("No conversation history found for this session.");
      return;
    }
    
    // Create a simple text summary
    let summary = `You have ${history.length} messages in this session. `;
    const recent = history.slice(-3);
    summary += "Here are the last few exchanges.";
    
    speakWindowsTTS(summary);
    
    // Log to console for user to see
    console.log("\n=== Conversation History ===");
    history.forEach(msg => {
      const time = new Date(msg.timestamp).toLocaleString();
      console.log(`[${time}] ${msg.role}: ${msg.content}`);
    });
    console.log("========================\n");
    
  } catch (error) {
    console.error("[HISTORY] Error:", error);
    speakWindowsTTS("Could not retrieve conversation history.");
  }
}

// Start a new session
function resetSession() {
  const oldSession = SOMA_SESSION_ID;
  SOMA_SESSION_ID = startNewSession();
  
  console.log(`[SOMA] Session reset: ${oldSession} -> ${SOMA_SESSION_ID}`);
  speakWindowsTTS("Started a new session. Previous conversations are saved and can be accessed from the database.");
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
      { label: "View Conversation History", click: () => viewHistory() },
      { label: "Start New Session", click: () => resetSession() },
      { type: "separator" },
      { label: "Mute/Unmute (Ctrl+M)", click: () => { isMuted = !isMuted; if (isMuted) stopSpeech(); } },
      { label: "Stop Speaking", click: () => stopSpeech() },
      { type: "separator" },
      { label: "Quit", click: () => app.quit() },
    ])
  );

  tray.on("click", () => toggleWindow());

  createWindow();

  // Hotkey to open the input
  globalShortcut.register("Control+Shift+Space", () => toggleWindow());

  // Hotkey to mute/unmute
  globalShortcut.register("Control+M", () => {
    isMuted = !isMuted;
    if (isMuted) stopSpeech();
  });

  // Hotkey to stop speech immediately
  globalShortcut.register("Control+Shift+S", () => stopSpeech());
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

// IPC: Get session info
ipcMain.handle("soma:session-info", async () => {
  try {
    if (fs.existsSync(SESSION_FILE)) {
      const data = JSON.parse(fs.readFileSync(SESSION_FILE, 'utf8'));
      const sessionAge = Date.now() - data.timestamp;
      return {
        ok: true,
        sessionId: SOMA_SESSION_ID,
        created: data.created,
        ageHours: Math.floor(sessionAge / 1000 / 60 / 60),
        ageDays: Math.floor(sessionAge / 1000 / 60 / 60 / 24)
      };
    }
  } catch (error) {
    return { ok: false, error: error.message };
  }
  return { ok: true, sessionId: SOMA_SESSION_ID };
});

// IPC: Get conversation history
ipcMain.handle("soma:get-history", async () => {
  try {
    const historyUrl = `${HISTORY_URL}/${SOMA_SESSION_ID}?limit=50`;
    const res = await fetch(historyUrl, {
      headers: { "x-session-id": SOMA_SESSION_ID }
    });
    
    if (!res.ok) {
      throw new Error(`Failed to fetch history: ${res.status}`);
    }
    
    const data = await res.json();
    return { ok: true, history: data.history || [] };
  } catch (error) {
    return { ok: false, error: error.message };
  }
});

// IPC: Start new session
ipcMain.handle("soma:new-session", async () => {
  try {
    const oldSession = SOMA_SESSION_ID;
    SOMA_SESSION_ID = startNewSession();
    return { 
      ok: true, 
      oldSessionId: oldSession,
      newSessionId: SOMA_SESSION_ID,
      message: "New session started. Previous conversations are saved."
    };
  } catch (error) {
    return { ok: false, error: error.message };
  }
});







