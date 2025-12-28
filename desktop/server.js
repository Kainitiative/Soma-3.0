const express = require("express");
const cors = require("cors");

const app = express();
app.use(cors());
app.use(express.json({ limit: "10mb" }));

app.get("/health", (req, res) => {
  res.json({ ok: true, service: "soma3-brain", time: new Date().toISOString() });
});

app.post("/chat", (req, res) => {
  const text = (req.body?.text ?? "").toString().trim();
  if (!text) return res.status(400).json({ error: "Missing 'text'." });

  const assistant_text = `Got it. You said: ${text}`;
  res.json({ assistant_text, suggested_actions: [] });
});

// v1 vision stub: proves end-to-end screen pipeline works.
// Later we swap this for a real vision model/API.
app.post("/vision", (req, res) => {
  const windowTitle = (req.body?.windowTitle ?? "").toString();
  const imageB64 = (req.body?.imageB64 ?? "").toString();

  if (!imageB64) return res.status(400).json({ error: "Missing 'imageB64'." });

  const assistant_text =
    `Snapshot received. ` +
    (windowTitle ? `Active window looks like: ${windowTitle}. ` : "") +
    `Tell me what you want help with on this screen and I’ll guide you step by step.`;

  res.json({
    assistant_text,
    screen_summary: "Snapshot captured (v1 stub, no vision analysis yet).",
    issues: [],
    suggested_next_steps: [
      "Ask: 'What error do you see?'",
      "Ask: 'What should I click next?'",
      "Ask: 'Summarise what’s on this screen.'",
    ],
  });
});

const PORT = process.env.PORT || 7171;
app.listen(PORT, () => console.log(`Soma 3 Brain listening on http://localhost:${PORT}`));
