const express = require("express");
const cors = require("cors");
const crypto = require("crypto");
const config = require("./config.json");
const db = require("./database");
const context = require("./context");

const app = express();
app.use(cors());
app.use(express.json({ limit: "50mb" }));

// Enhanced error logging
function logError(location, error, context = {}) {
  console.error(`\n[ERROR] ${location}`);
  console.error(`Message: ${error.message}`);
  console.error(`Context:`, context);
  if (error.stack) {
    console.error(`Stack: ${error.stack.split('\n').slice(0, 3).join('\n')}`);
  }
  console.error('---');
}

// Attach sessionId + sessionMemory to every request
app.use((req, res, next) => {
  try {
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
  } catch (error) {
    logError("Session Middleware", error);
    next(error);
  }
});

// Configuration with validation
const OLLAMA_URL = config.ollamaUrl || "http://localhost:11434/api/generate";
const CHAT_MODEL = process.env.SOMA_CHAT_MODEL || config.chatModel;
const VISION_MODEL = process.env.SOMA_VISION_MODEL || config.visionModel;

console.log(`[CONFIG] Ollama URL: ${OLLAMA_URL}`);
console.log(`[CONFIG] Chat Model: ${CHAT_MODEL}`);
console.log(`[CONFIG] Vision Model: ${VISION_MODEL}`);

// Get current personality settings
function getPersonalitySettings() {
  const personalityName = config.personality || "friendly";
  return config.personalities[personalityName] || config.personalities.friendly;
}

// =============================
// Ollama Connection Validation
// =============================
let ollamaAvailable = false;

async function checkOllamaConnection() {
  try {
    const response = await fetch(OLLAMA_URL.replace('/api/generate', '/api/tags'), {
      method: 'GET',
      signal: AbortSignal.timeout(5000)
    });
    
    if (response.ok) {
      ollamaAvailable = true;
      const data = await response.json();
      const models = data.models || [];
      console.log(`[OLLAMA] ✓ Connected - ${models.length} models available`);
      
      // Check if required models are available
      const modelNames = models.map(m => m.name);
      const hasChatModel = modelNames.some(name => name.includes(CHAT_MODEL.split(':')[0]));
      const hasVisionModel = modelNames.some(name => name.includes(VISION_MODEL.split(':')[0]));
      
      if (!hasChatModel) {
        console.warn(`[OLLAMA] ⚠ Chat model "${CHAT_MODEL}" not found. Available: ${modelNames.join(', ')}`);
      }
      if (!hasVisionModel) {
        console.warn(`[OLLAMA] ⚠ Vision model "${VISION_MODEL}" not found. Available: ${modelNames.join(', ')}`);
      }
      
      return true;
    }
  } catch (error) {
    ollamaAvailable = false;
    console.error(`[OLLAMA] ✗ Not available: ${error.message}`);
    console.error(`[OLLAMA] Make sure Ollama is running: https://ollama.com`);
    console.error(`[OLLAMA] Try: ollama serve`);
  }
  return false;
}

// Check connection on startup
checkOllamaConnection();

// Recheck every 30 seconds
setInterval(checkOllamaConnection, 30000);

// =============================
// Level 2 Working Memory (RAM)
// Session-scoped, clears on restart
// =============================
const sessionStore = new Map();

function createBlankSessionMemory() {
  return {
    lastTurn: null,
    lastVision: null,
    imageBindings: {} // keyed by imageHash - now backed by DB
  };
}

function getSessionMemory(sessionId) {
  try {
    if (!sessionStore.has(sessionId)) {
      sessionStore.set(sessionId, createBlankSessionMemory());
      console.log(`[WM] New session created: ${sessionId}`);
      
      // Load persistent identity bindings from database
      if (config.features.enableIdentityPersistence) {
        try {
          const identities = db.getAllIdentities();
          const memory = sessionStore.get(sessionId);
          for (const identity of identities) {
            memory.imageBindings[identity.image_hash] = {
              subject: identity.subject,
              source: identity.source,
              confidence: identity.confidence,
              createdAt: identity.created_at
            };
          }
          console.log(`[WM] Loaded ${identities.length} identities from persistent storage`);
        } catch (dbError) {
          console.error(`[WM] Failed to load identities:`, dbError.message);
        }
      }
    }
    return sessionStore.get(sessionId);
  } catch (error) {
    logError("getSessionMemory", error, { sessionId });
    return createBlankSessionMemory();
  }
}

app.get("/health", (req, res) => {
  res.json({ 
    ok: true, 
    version: "3.0",
    ollama: {
      available: ollamaAvailable,
      url: OLLAMA_URL,
      chatModel: CHAT_MODEL,
      visionModel: VISION_MODEL
    },
    features: {
      longTermMemory: config.features.enableLongTermMemory,
      contextWindow: config.features.enableContextWindow,
      identityPersistence: config.features.enableIdentityPersistence
    }
  });
});

// ---------------- CHAT ----------------
app.post("/chat", async (req, res) => {
  try {
    const text = String(req.body?.text || "").trim();
    if (!text) return res.status(400).json({ error: "Missing text" });

    console.log(`[CHAT] Request from session ${req.sessionId.slice(0, 8)}...: "${text.slice(0, 50)}..."`);

    // Save user message to long-term memory
    if (config.features.enableLongTermMemory) {
      try {
        db.saveMessage(req.sessionId, "user", text);
      } catch (dbError) {
        console.error(`[CHAT] Failed to save user message:`, dbError.message);
        // Continue anyway
      }
    }

    // Normalize once
    const qNorm = text
      .toLowerCase()
      .replace(/['']/g, "'")
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
        const response = "I don't have a recent screenshot in working memory for this session.";
        if (config.features.enableLongTermMemory) {
          try {
            db.saveMessage(req.sessionId, "assistant", response);
          } catch (e) { /* ignore */ }
        }
        return res.json({ assistant_text: response });
      }
      const when = new Date(lv.timestamp || Date.now()).toLocaleTimeString();
      const response = `Last screenshot (${when}) — Window: ${lv.windowTitle || "unknown"}. Summary: ${lv.visionSummary || "none"}`;
      if (config.features.enableLongTermMemory) {
        try {
          db.saveMessage(req.sessionId, "assistant", response);
        } catch (e) { /* ignore */ }
      }
      return res.json({ assistant_text: response });
    }

    // ---------- Identity binding (explicit with names) ----------
    if (lv && lv.imageHash) {
      const bind = (subject, msg) => {
        req.sessionMemory.imageBindings[lv.imageHash] = {
          subject,
          source: "user",
          confidence: "high",
          createdAt: Date.now()
        };
        
        // Save to persistent storage
        if (config.features.enableIdentityPersistence) {
          try {
            db.saveIdentity(lv.imageHash, subject, "high", "user");
          } catch (e) {
            console.error(`[CHAT] Failed to save identity:`, e.message);
          }
        }
        
        console.log(`[WM] imageBinding set: ${lv.imageHash.slice(0,10)}... => ${subject}`);
        
        if (config.features.enableLongTermMemory) {
          try {
            db.saveMessage(req.sessionId, "assistant", msg);
            db.saveFact("identity", lv.imageHash, subject, 0.95);
          } catch (e) { /* ignore */ }
        }
        
        return res.json({ assistant_text: msg });
      };

      // Enhanced identity binding with names
      // "that's me" or "this is me"
      if (/\b(thats|that's|that is|this is)\s+me\b/.test(qNorm)) {
        return bind("user", "Got it — I'll remember that's you.");
      }
      
      // "this is [name]" or "that's [name]"
      const nameMatch = text.match(/\b(?:this|that)(?:'s| is)\s+(\w+)\b/i);
      if (nameMatch && nameMatch[1] && !['me', 'my', 'the', 'a'].includes(nameMatch[1].toLowerCase())) {
        const name = nameMatch[1];
        return bind(name, `Got it — I'll remember that's ${name}.`);
      }
    }

    // ---------- Who is the person? ----------
    if (qNorm.startsWith("who")) {
      if (!lv) {
        const response = "I don't have a recent screenshot in working memory.";
        if (config.features.enableLongTermMemory) {
          try {
            db.saveMessage(req.sessionId, "assistant", response);
          } catch (e) { /* ignore */ }
        }
        return res.json({ assistant_text: response });
      }
      
      // Check in-memory first
      let b = req.sessionMemory.imageBindings?.[lv.imageHash];
      
      // Check database if not in memory
      if (!b && config.features.enableIdentityPersistence) {
        try {
          const dbIdentity = db.getIdentity(lv.imageHash);
          if (dbIdentity) {
            b = {
              subject: dbIdentity.subject,
              source: dbIdentity.source,
              confidence: dbIdentity.confidence
            };
            // Update last seen
            db.updateIdentityLastSeen(lv.imageHash);
          }
        } catch (e) {
          console.error(`[CHAT] Failed to get identity:`, e.message);
        }
      }
      
      if (b) {
        const response = `Based on what you told me, the person in the screenshot is ${b.subject === "user" ? "you" : b.subject}.`;
        if (config.features.enableLongTermMemory) {
          try {
            db.saveMessage(req.sessionId, "assistant", response);
          } catch (e) { /* ignore */ }
        }
        return res.json({ assistant_text: response });
      }
      
      const response = "I don't know who the person is yet. You can tell me by saying 'that's me' or 'that's [name]'.";
      if (config.features.enableLongTermMemory) {
        try {
          db.saveMessage(req.sessionId, "assistant", response);
        } catch (e) { /* ignore */ }
      }
      return res.json({ assistant_text: response });
    }

    // ---------- Check Ollama availability ----------
    if (!ollamaAvailable) {
      const errorMsg = "Ollama service is not available. Please make sure Ollama is running and try again.";
      console.error(`[CHAT] ${errorMsg}`);
      return res.status(503).json({ 
        error: errorMsg,
        details: "Run 'ollama serve' or check if Ollama is installed at https://ollama.com",
        fallback: "I'm unable to process your request because the AI service is not available."
      });
    }

    // ---------- Fallback to model with context ----------
    const personality = getPersonalitySettings();
    
    // Build context from conversation history
    let prompt = text;
    if (config.features.enableContextWindow) {
      try {
        prompt = context.formatContextForPrompt(req.sessionId, text);
      } catch (contextError) {
        console.error(`[CHAT] Context formatting error:`, contextError.message);
        // Fall back to original prompt
        prompt = text;
      }
    }
    
    // Add vision context if available
    if (lv) {
      prompt += `\n\n[Recent screen]\nWindow: ${lv.windowTitle}\nSummary: ${lv.visionSummary}\n`;
    }
    
    // Add system prompt for personality
    const fullPrompt = `${personality.systemPrompt}\n\n${prompt}`;

    console.log(`[CHAT] Calling Ollama with model ${CHAT_MODEL}...`);

    try {
      const r = await fetch(OLLAMA_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          model: CHAT_MODEL, 
          prompt: fullPrompt, 
          stream: false,
          options: {
            temperature: personality.temperature || 0.5,
            num_predict: personality.maxTokens || 150
          }
        }),
        signal: AbortSignal.timeout(60000) // 60 second timeout
      });

      if (!r.ok) {
        const errorText = await r.text().catch(() => "Unknown error");
        throw new Error(`Ollama API error (${r.status}): ${errorText.slice(0, 200)}`);
      }

      const j = await r.json();
      
      if (!j.response) {
        throw new Error(`No response from Ollama. Response: ${JSON.stringify(j).slice(0, 200)}`);
      }

      const out = j.response.trim() || "I'm not sure how to respond to that.";
      
      console.log(`[CHAT] Response generated: "${out.slice(0, 50)}..."`);
      
      // Save assistant response
      if (config.features.enableLongTermMemory) {
        try {
          db.saveMessage(req.sessionId, "assistant", out);
        } catch (e) {
          console.error(`[CHAT] Failed to save assistant message:`, e.message);
        }
      }
      
      res.json({ assistant_text: out });

    } catch (fetchError) {
      logError("Ollama Fetch", fetchError, { model: CHAT_MODEL, url: OLLAMA_URL });
      
      // Check if it's a timeout
      if (fetchError.name === 'TimeoutError' || fetchError.message.includes('timeout')) {
        return res.status(504).json({ 
          error: "Request timed out. The AI model is taking too long to respond.",
          details: fetchError.message
        });
      }
      
      // Check if it's a connection error
      if (fetchError.message.includes('ECONNREFUSED') || fetchError.message.includes('fetch failed')) {
        ollamaAvailable = false; // Update availability
        return res.status(503).json({ 
          error: "Cannot connect to Ollama. Please make sure Ollama is running.",
          details: "Run 'ollama serve' or check if Ollama is installed at https://ollama.com"
        });
      }
      
      throw fetchError; // Re-throw for general error handler
    }

  } catch (e) {
    logError("Chat Endpoint", e, { sessionId: req.sessionId });
    res.status(500).json({ 
      error: "Chat failed",
      message: e.message,
      suggestion: "Check if Ollama is running and the correct models are installed. Try: ollama list"
    });
  }
});

// ---------------- VISION ----------------
app.post("/vision", async (req, res) => {
  try {
    const imageB64 = String(req.body?.imageB64 || "");
    const windowTitle = String(req.body?.windowTitle || "");
    if (!imageB64) return res.status(400).json({ error: "Missing image" });

    console.log(`[VISION] Request for window: "${windowTitle}"`);

    // Hash image bytes so memory can bind to THIS image only (no bleed-over)
    const imageBuf = Buffer.from(imageB64, "base64");
    const imageHash = crypto.createHash("sha256").update(imageBuf).digest("hex");

    // Check Ollama availability
    if (!ollamaAvailable) {
      const errorMsg = "Ollama service is not available for vision analysis.";
      console.error(`[VISION] ${errorMsg}`);
      return res.status(503).json({ 
        error: errorMsg,
        details: "Run 'ollama serve' or check if Ollama is installed"
      });
    }

    // Build vision prompt from config
    const visionConfig = config.visionPrompt;
    const prompt = `${visionConfig.base}
${windowTitle ? `Active window: "${windowTitle}".` : ""}

Rules:
${visionConfig.rules.map(r => `- ${r}`).join('\n')}`;

    console.log(`[VISION] Calling Ollama with model ${VISION_MODEL}...`);

    try {
      const r = await fetch(OLLAMA_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: VISION_MODEL,
          prompt,
          images: [imageB64],
          stream: false,
          options: { 
            num_predict: visionConfig.maxTokens || 120, 
            temperature: visionConfig.temperature || 0.2 
          }
        }),
        signal: AbortSignal.timeout(90000) // 90 second timeout for vision
      });

      if (!r.ok) {
        const errorText = await r.text().catch(() => "Unknown error");
        throw new Error(`Ollama API error (${r.status}): ${errorText.slice(0, 200)}`);
      }

      const j = await r.json();
      
      if (!j.response) {
        throw new Error(`No response from Ollama vision model`);
      }

      const visionSummary = j.response.trim() || "Screenshot captured.";

      console.log(`[VISION] Analysis: "${visionSummary.slice(0, 50)}..."`);

      // Level 2 Working Memory: remember only what just happened
      req.sessionMemory.lastVision = {
        imageHash,
        windowTitle,
        visionSummary,
        timestamp: Date.now()
      };

      console.log(`[WM] lastVision set: ${imageHash.slice(0, 10)}... (${windowTitle || "no-title"})`);

      // Save to long-term memory
      if (config.features.enableLongTermMemory) {
        try {
          db.saveMessage(req.sessionId, "user", `📸 Screenshot: ${windowTitle}`, { 
            type: "vision", 
            imageHash,
            windowTitle 
          });
          db.saveMessage(req.sessionId, "assistant", visionSummary, { 
            type: "vision_response", 
            imageHash 
          });
        } catch (e) {
          console.error(`[VISION] Failed to save to DB:`, e.message);
        }
      }

      res.json({ assistant_text: visionSummary, imageHash });

    } catch (fetchError) {
      logError("Ollama Vision Fetch", fetchError, { model: VISION_MODEL });
      
      if (fetchError.name === 'TimeoutError' || fetchError.message.includes('timeout')) {
        return res.status(504).json({ 
          error: "Vision analysis timed out. The model is taking too long to respond.",
          details: fetchError.message
        });
      }
      
      if (fetchError.message.includes('ECONNREFUSED') || fetchError.message.includes('fetch failed')) {
        ollamaAvailable = false;
        return res.status(503).json({ 
          error: "Cannot connect to Ollama for vision analysis.",
          details: "Make sure Ollama is running with the vision model installed"
        });
      }
      
      throw fetchError;
    }

  } catch (e) {
    logError('Vision Endpoint', e);
    res.status(500).json({ 
      error: "Vision failed",
      message: e.message,
      suggestion: "Check if Ollama is running and llava model is installed. Try: ollama pull llava"
    });
  }
});

// ---------------- NEW: Memory & Stats Endpoints ----------------

// Get conversation history
app.get("/history/:sessionId", (req, res) => {
  try {
    const { sessionId } = req.params;
    const limit = parseInt(req.query.limit) || 50;
    const history = db.getConversationHistory(sessionId, limit);
    res.json({ history });
  } catch (e) {
    logError('History Endpoint', e);
    res.status(500).json({ error: "Failed to get history", message: e.message });
  }
});

// Get context statistics
app.get("/context/stats/:sessionId", (req, res) => {
  try {
    const { sessionId } = req.params;
    const stats = context.getContextStats(sessionId);
    res.json(stats);
  } catch (e) {
    logError('Context Stats Endpoint', e);
    res.status(500).json({ error: "Failed to get stats", message: e.message });
  }
});

// Get all identities
app.get("/identities", (req, res) => {
  try {
    const identities = db.getAllIdentities();
    res.json({ identities });
  } catch (e) {
    logError('Identities Endpoint', e);
    res.status(500).json({ error: "Failed to get identities", message: e.message });
  }
});

// Search conversations
app.get("/search", (req, res) => {
  try {
    const query = req.query.q || "";
    const limit = parseInt(req.query.limit) || 10;
    const results = db.searchConversations(query, limit);
    res.json({ results });
  } catch (e) {
    logError('Search Endpoint', e);
    res.status(500).json({ error: "Search failed", message: e.message });
  }
});

// Get configuration
app.get("/config", (req, res) => {
  try {
    res.json(config);
  } catch (e) {
    logError('Config Endpoint', e);
    res.status(500).json({ error: "Failed to get config", message: e.message });
  }
});

// Update personality (runtime)
app.post("/config/personality", (req, res) => {
  try {
    const { personality } = req.body;
    if (!personality || !config.personalities[personality]) {
      return res.status(400).json({ 
        error: "Invalid personality",
        available: Object.keys(config.personalities)
      });
    }
    config.personality = personality;
    console.log(`[CONFIG] Personality changed to: ${personality}`);
    res.json({ ok: true, personality, settings: config.personalities[personality] });
  } catch (e) {
    logError('Config Update Endpoint', e);
    res.status(500).json({ error: "Failed to update config", message: e.message });
  }
});

// Global error handler
app.use((err, req, res, next) => {
  logError('Global Error Handler', err);
  res.status(500).json({ 
    error: "Internal server error",
    message: err.message
  });
});

const PORT = 7171;
app.listen(PORT, () => {
  console.log(`
╔═══════════════════════════════════════════════╗
║         Soma 3.0 Brain - Enhanced            ║
║      http://localhost:${PORT}                    ║
╚═══════════════════════════════════════════════╝

Configuration:
  • Personality: ${config.personality}
  • Chat Model: ${CHAT_MODEL}
  • Vision Model: ${VISION_MODEL}
  • Ollama URL: ${OLLAMA_URL}

Features:
  ${config.features.enableLongTermMemory ? '✓' : '✗'} Long-term Memory (SQLite)
  ${config.features.enableContextWindow ? '✓' : '✗'} Context Window Management
  ${config.features.enableIdentityPersistence ? '✓' : '✗'} Persistent Identity Bindings

Available Personalities: ${Object.keys(config.personalities).join(', ')}

Checking Ollama connection...
  `);
  
  // Final connection check after startup
  setTimeout(async () => {
    const isConnected = await checkOllamaConnection();
    if (!isConnected) {
      console.log(`
⚠️  WARNING: Ollama is not available!

To fix:
  1. Install Ollama: https://ollama.com
  2. Run: ollama serve
  3. Install models:
     ollama pull ${CHAT_MODEL}
     ollama pull ${VISION_MODEL}

The server will continue checking for Ollama every 30 seconds.
`);
    }
  }, 1000);
});
