# Soma 3.0 - AI Desktop Assistant

An intelligent, voice-first desktop assistant with long-term memory, screen awareness, and customizable personality.

## 🌟 Features

### Core Capabilities
- **Voice-First Interaction** - Audio responses using Piper TTS
- **Screen Awareness** - Screenshot analysis with window context
- **Chat Interface** - Natural conversation with AI assistant
- **Tray Integration** - Minimal UI, always accessible

### 🧠 Memory & Intelligence (NEW)

#### 1. **Long-Term Memory**
- Persistent SQLite database stores all conversations
- Survives application restarts
- Automatic cleanup of old data (configurable retention period)
- Search through past conversations

#### 2. **Context Window Management**
- Maintains conversation context across multiple messages
- Smart token estimation and pruning
- Configurable context size (default: last 10 messages)
- Prevents context overflow while preserving relevance

#### 3. **Enhanced Identity Binding**
- Remember people across sessions
- Support for named identities ("that's John", "this is Sarah")
- Persistent storage - never forget who someone is
- Quick recall: "Who is this person?"

#### 4. **Custom Personalities**
Four built-in personality modes:
- **Professional** - Formal, precise, efficient (temp: 0.3)
- **Friendly** (default) - Warm, conversational, supportive (temp: 0.5)
- **Technical** - Detailed technical expert (temp: 0.2)
- **Casual** - Relaxed, natural, approachable (temp: 0.7)

#### 5. **Session Persistence** ⭐ NEW
- **Auto-resume conversations** - Pick up where you left off after restarts
- **7-day session memory** - Sessions stay active for a week
- **View full history** - Access all past conversations from UI
- **Manual session control** - Start fresh sessions when needed
- See: [SESSION_PERSISTENCE.md](./SESSION_PERSISTENCE.md) for details

## 🏗️ Architecture

```
/app/
├── brain/              # Node.js Backend (Express + Ollama)
│   ├── server.js       # Main API server (Enhanced)
│   ├── database.js     # SQLite memory management (NEW)
│   ├── context.js      # Context window handler (NEW)
│   ├── config.json     # Configuration file (NEW)
│   └── data/           # SQLite database storage (auto-created)
├── desktop/            # Electron Desktop App
│   ├── main.js         # Electron main process
│   ├── preload.js      # IPC bridge
│   ├── index.html      # UI
│   └── server.js       # Fallback stub server
└── piper/              # Text-to-Speech Engine
    ├── piper.exe       # TTS executable
    └── voices/         # Voice models
```

## 📦 Requirements

### System Requirements
- Windows 10/11
- Node.js 16+ 
- Ollama installed and running

### Ollama Models
Install required models:
```bash
ollama pull llama3.1:8b    # Chat model
ollama pull llava          # Vision model
```

## 🚀 Installation

### 1. Install Dependencies

**Brain (Backend):**
```bash
cd brain
npm install
# or
yarn install
```

**Desktop (Frontend):**
```bash
cd desktop
npm install
# or
yarn install
```

### 2. Configuration

Edit `/app/brain/config.json` to customize:

```json
{
  "personality": "friendly",           // Change personality
  "maxContextMessages": 10,            // Messages in context window
  "maxContextTokens": 4000,            // Token limit for context
  "memoryRetentionDays": 30,           // How long to keep history
  "chatModel": "llama3.1:8b",         // Ollama chat model
  "visionModel": "llava",              // Ollama vision model
  "features": {
    "enableLongTermMemory": true,      // Persistent memory
    "enableContextWindow": true,       // Conversation context
    "enableIdentityPersistence": true, // Remember people
    "enableFactLearning": true,        // Learn facts about user
    "autoCleanup": true                // Auto-cleanup old data
  }
}
```

### 3. Environment Variables (Optional)

**Piper TTS paths** (in desktop/main.js or set as env vars):
- `SOMA_PIPER_EXE` - Path to piper.exe
- `SOMA_PIPER_MODEL` - Path to voice model
- `SOMA_CHAT_MODEL` - Override Ollama chat model
- `SOMA_VISION_MODEL` - Override Ollama vision model

## 🎮 Usage

### Starting the Application

**Terminal 1 - Start Brain:**
```bash
cd brain
npm start
# or
npm run dev  # with auto-reload
```

**Terminal 2 - Start Desktop:**
```bash
cd desktop
npm start
```

### Keyboard Shortcuts

- **Ctrl+Shift+Space** - Open Soma input window
- **Ctrl+M** - Mute/unmute voice
- **Ctrl+Shift+S** - Stop current speech
- **Enter** - Send message
- **Escape** - Close input window

### Commands & Examples

#### Basic Chat
```
"What's the weather like today?"
"Help me write an email"
"Explain quantum computing"
```

#### Screenshot Analysis
```
1. Click the 📸 button
2. Then ask: "What do you see?"
3. Or: "What error is on my screen?"
4. Or: "What should I click next?"
```

#### Identity Binding
```
[After taking screenshot with a person]
"That's me"
"This is John"
"That's Sarah"

[Later, with another screenshot]
"Who is this person?"
```

#### Memory & Context
```
"What did we talk about earlier?"
"Summarize our conversation"
"Search our chat for 'Python'"
```

## 🔧 API Endpoints

The brain server exposes these endpoints:

### Core
- `POST /chat` - Send chat message
- `POST /vision` - Analyze screenshot

### Memory (NEW)
- `GET /history/:sessionId` - Get conversation history
- `GET /identities` - List all remembered people
- `GET /search?q=query` - Search conversations
- `GET /context/stats/:sessionId` - Context statistics

### Configuration (NEW)
- `GET /config` - Get current configuration
- `POST /config/personality` - Change personality

### Example API Calls
```bash
# Get conversation history
curl http://localhost:7171/history/your-session-id

# Search conversations
curl "http://localhost:7171/search?q=python&limit=5"

# Change personality
curl -X POST http://localhost:7171/config/personality \
  -H "Content-Type: application/json" \
  -d '{"personality": "technical"}'

# Get all identities
curl http://localhost:7171/identities
```

## 💾 Database Schema

SQLite database location: `/app/brain/data/soma_memory.db`

### Tables
- **conversations** - All chat messages with timestamps
- **identities** - Person identifications from screenshots
- **facts** - Learned facts about the user
- **sessions** - Session metadata and activity

### Data Retention
- Default: 30 days (configurable)
- Auto-cleanup runs on server startup
- Manual cleanup: Set `memoryRetentionDays` in config

## 🎨 Customizing Personalities

Add your own personality in `config.json`:

```json
{
  "personalities": {
    "mybot": {
      "systemPrompt": "You are MyBot, a [description]. [behavior instructions]",
      "temperature": 0.6,
      "maxTokens": 180
    }
  }
}
```

Then set: `"personality": "mybot"`

### Personality Parameters
- **systemPrompt** - Instructions for the AI
- **temperature** - Creativity (0.0 = focused, 1.0 = creative)
- **maxTokens** - Response length limit

## 🔍 Troubleshooting

### Brain server won't start
- Check if Ollama is running: `ollama list`
- Verify models are installed: `ollama pull llama3.1:8b`
- Check port 7171 is not in use

### No voice output
- Check Piper paths in `desktop/main.js`
- Verify voice model exists in `/piper/voices/`
- Check TTS log: `/piper/tts_log.txt`
- Unmute with Ctrl+M

### Memory not persisting
- Check `config.json`: `enableLongTermMemory: true`
- Verify database file exists: `/brain/data/soma_memory.db`
- Check write permissions on `/brain/data/` directory

### Context not working
- Check `config.json`: `enableContextWindow: true`
- Increase `maxContextMessages` if needed
- Check context stats: `GET /context/stats/:sessionId`

## 📊 Monitoring

### Check Server Status
```bash
curl http://localhost:7171/health
```

Response:
```json
{
  "ok": true,
  "version": "3.0",
  "features": {
    "longTermMemory": true,
    "contextWindow": true,
    "identityPersistence": true
  }
}
```

### View Database Contents
```bash
cd brain/data
sqlite3 soma_memory.db

# List all tables
.tables

# View recent conversations
SELECT * FROM conversations ORDER BY timestamp DESC LIMIT 10;

# View identities
SELECT * FROM identities;

# View learned facts
SELECT * FROM facts;
```

## 🚧 Development

### Running in Development Mode

**With auto-reload:**
```bash
cd brain
npm run dev
```

### Project Structure
- `brain/server.js` - Main server with all integrations
- `brain/database.js` - Database operations
- `brain/context.js` - Context window management
- `brain/config.json` - Configuration (edit this!)
- `desktop/main.js` - Electron app logic
- `desktop/index.html` - UI

### Adding New Features

1. **Add new database table** - Edit `database.js`
2. **Add new API endpoint** - Edit `server.js`
3. **Add new personality** - Edit `config.json`
4. **Modify UI** - Edit `desktop/index.html`

## 📝 Version History

### v3.0 (Current)
- ✅ Long-term memory with SQLite
- ✅ Context window management
- ✅ Persistent identity bindings
- ✅ Custom personalities (4 built-in)
- ✅ Conversation search
- ✅ Enhanced API endpoints
- ✅ Configurable via JSON

### v2.0 (Previous)
- Working memory (session-scoped)
- Basic identity binding
- Screenshot analysis
- Chat with Ollama

## 🤝 Contributing

This is a personal project, but feel free to:
1. Fork the repository
2. Create feature branches
3. Submit pull requests
4. Report issues

## 📄 License

ISC

## 🙏 Credits

- **Ollama** - Local LLM inference
- **Piper TTS** - Text-to-speech engine
- **Electron** - Desktop app framework
- **better-sqlite3** - SQLite database

---

**Soma 3.0** - Your intelligent desktop companion with memory that lasts. 🧠✨
