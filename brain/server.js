const express = require("express");
const cors = require("cors");

const app = express();
app.use(cors());
app.use(express.json({ limit: "50mb" }));
// Attach sessionId + sessionMemory to every request
app.use((req, res, next) => {
  const sessionId =
    req.headers["x-session-id"] ||
    (req.body && req.body.sessionId) ||
    (req.query && req.query.sessionId) ||
    null;

  const finalSessionId =
    sessionId || `temp-${Date.now()}-${Math.random().toString(16).slice(2)}`;

  req.sessionId = finalSessionId;
  req.sessionMemory = getSessionMemory(finalSessionId);

  next();
});


const OLLAMA_URL = "http://localhost:11434/api/generate";
const CHAT_MODEL = process.env.SOMA_CHAT_MODEL || "llama3.1:8b";
const VISION_MODEL = process.env.SOMA_VISION_MODEL || "llava";
const crypto = require("crypto");

// =============================
// Level 2 Working Memory (RAM)
// Session-scoped, clears on restart
// =============================
const sessionStore = new Map();

function createBlankSessionMemory() {
  return {
    lastTurn: null,
    lastVision: null,
    imageBindings: {} // keyed by imageHash
  };
}

function getSessionMemory(sessionId) {
  if (!sessionStore.has(sessionId)) {
    sessionStore.set(sessionId, createBlankSessionMemory());
    console.log(`[WM] New session created: ${sessionId}`);
  }
  return sessionStore.get(sessionId);
}


app.get("/health", (req, res) => {
  res.json({ ok: true });
});

// ---------------- CHAT ----------------
app.post("/chat", async (req, res) => {
  try {
    const text = String(req.body?.text || "").trim();
    if (!text) return res.status(400).json({ error: "Missing text" });

    // Normalize once
    const qNorm = text
      .toLowerCase()
      .replace(/[’‘]/g, "'")
      .replace(/[^a-z0-9\s']/g, " ")
      .replace(/\s+/g, " ")
      .trim();

    const lv = req.sessionMemory?.lastVision || null;

    // ---------- Last screenshot (direct, no model) ----------
    const asksLastScreenshot =
      qNorm.includes("last screenshot") ||
      qNorm.includes("last screen shot") ||
      qNorm.includes("previous screenshot") ||
      qNorm.includes("what was on my screen") ||
      qNorm.includes("what did you just see");

    if (asksLastScreenshot) {
      if (!lv) {
        return res.json({ assistant_text: "I don’t have a recent screenshot in working memory for this session." });
      }
      const when = new Date(lv.timestamp || Date.now()).toLocaleTimeString();
      return res.json({
        assistant_text: `Last screenshot (${when}) — Window: ${lv.windowTitle || "unknown"}. Summary: ${lv.visionSummary || "none"}`
      });
    }

    // ---------- Identity binding (explicit only) ----------
    if (lv && lv.imageHash) {
      const bind = (subject, msg) => {
        req.sessionMemory.imageBindings[lv.imageHash] = {
          subject,
          source: "user",
          confidence: "high",
          createdAt: Date.now()
        };
        console.log(`[WM] imageBinding set: ${lv.imageHash.slice(0,10)}... => ${subject}`);
        return res.json({ assistant_text: msg });
      };

      if (
        /\b(thats|that's|that is|this is)\s+me\b/.test(qNorm) ||
        /\b(the\s+)?(man|woman|person|photo|picture|image)\b.*\b(is|was)\s+me\b/.test(qNorm)
      ) {
        return bind("user", "Got it — I’ll treat that last screenshot as you for this session.");
      }
    }

    // ---------- Who is the person? (never guess) ----------
    if (qNorm.startsWith("who")) {
      if (!lv) {
        return res.json({ assistant_text: "I don’t have a recent screenshot in working memory." });
      }
      const b = req.sessionMemory.imageBindings?.[lv.imageHash];
      if (b) {
        return res.json({ assistant_text: `Based on what you told me, the person in the screenshot is ${b.subject === "user" ? "you" : b.subject}.` });
      }
      return res.json({ assistant_text: "I don’t know who the person is yet. Is that you?" });
    }

    // ---------- Fallback to model ----------
    const context = lv
      ? `\n\n[Recent screen]\nWindow: ${lv.windowTitle}\nSummary: ${lv.visionSummary}\n`
      : "";

    const r = await fetch(LLAMA_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model: LLAMA_MODEL, prompt: text + context, stream: false })
    });

    const j = await r.json();
    const out = j.response?.trim() || "";
    res.json({ assistant_text: out });

  } catch (e) {
    console.error("[CHAT ERROR]", e);
    res.status(500).json({ error: "Chat failed" });
  }
});
app.post("/vision", async (req, res) => {
  try {
    const imageB64 = String(req.body?.imageB64 || "");
    const windowTitle = String(req.body?.windowTitle || "");
    if (!imageB64) return res.status(400).json({ error: "Missing image" });

// Hash image bytes so memory can bind to THIS image only (no bleed-over)
const imageBuf = Buffer.from(imageB64, "base64");
const imageHash = crypto.createHash("sha256").update(imageBuf).digest("hex");

    const prompt =
`You are Soma, a calm desktop co-worker.
This is a screenshot of my screen.
${windowTitle ? `Active window: "${windowTitle}".` : ""}

Rules:
- Do NOT describe obvious UI.
- If no error is visible, say so briefly.
- Speak in ONE short sentence.
- Then give up to TWO concrete next actions.
- No hedging, no explanations.`;

    const r = await fetch(OLLAMA_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: VISION_MODEL,
        prompt,
        images: [imageB64],
        stream: false,
        options: { num_predict: 120, temperature: 0.2 }
      })
    });

    const j = await r.json();
    const visionSummary = j.response?.trim() || "";

// Level 2 Working Memory: remember only what just happened
req.sessionMemory.lastVision = {
  imageHash,
  windowTitle,
  visionSummary,
  timestamp: Date.now()
};

console.log(`[WM] lastVision set: ${imageHash.slice(0, 10)}... (${windowTitle || "no-title"})`);

res.json({ assistant_text: visionSummary, imageHash });
  } catch (e) {
    console.error('[CHAT ERROR]', e);
res.status(500).json({ error: "Vision failed" });
  }
});

app.listen(7171, () =>
  console.log("Soma 3 Brain listening on http://localhost:7171")
);












