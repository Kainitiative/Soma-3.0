# Session Persistence - Feature Documentation

## Overview

Soma 3.0 now includes **persistent session management** that remembers conversations across application restarts. Your conversation history is automatically saved and can be resumed even after closing and reopening the app.

---

## 🎯 Key Features

### 1. **Automatic Session Resume**
- Session ID is saved to disk when created
- Automatically loaded on app restart
- Conversations continue seamlessly across restarts
- No manual action required

### 2. **Session Timeout**
- Sessions expire after **7 days** of inactivity
- After 7 days, a new session automatically starts
- Configurable timeout period (see below)

### 3. **Session Keep-Alive**
- Session timestamp updates every 5 minutes while app is running
- Prevents premature session expiration
- Resets the 7-day timer with each use

### 4. **Manual Session Control**
- **View History**: See all messages from current session
- **Start New Session**: Manually create a fresh session
- Both available from tray menu and UI buttons

---

## 📁 How It Works

### Session Storage
- Session ID saved to: `{UserData}/.soma_session`
- On Windows: `C:\Users\{Username}\AppData\Roaming\desktop\.soma_session`
- File contains:
  ```json
  {
    "sessionId": "uuid-v4-string",
    "timestamp": 1234567890000,
    "created": "2025-01-15T10:30:00.000Z",
    "lastActive": "2025-01-15T14:45:00.000Z"
  }
  ```

### Session Lifecycle
1. **App Start** → Check for existing session file
2. **Session Found** → Check age
3. **Age < 7 days** → Resume session
4. **Age > 7 days** → Start new session
5. **No Session File** → Create new session

### Database Integration
- All conversations saved with session ID
- Context window uses session ID to fetch history
- Identity bindings tied to session
- Search works across all sessions

---

## 🎮 Usage

### Automatic (Default Behavior)

**First Time:**
```
1. Start Soma
2. Chat normally
3. Close app
4. Reopen app
5. Say: "What did we talk about?"
6. Soma remembers! ✅
```

### Manual Controls

#### Via Tray Menu
Right-click tray icon:
- **View Conversation History** - Shows all messages
- **Start New Session** - Creates fresh session

#### Via UI Buttons
In the Soma input window:
- **📜 History** button - Load conversation history
- **🔄 New** button - Start new session

#### Via Chat Commands
Natural language:
```
"What did we talk about earlier?"
"Remind me of our conversation"
"Show me our chat history"
```

---

## ⚙️ Configuration

### Change Session Timeout

Edit `/app/desktop/main.js`:

```javascript
const SESSION_TIMEOUT_DAYS = 7; // Change to desired days
```

Options:
- `1` = New session daily
- `7` = Weekly (default)
- `30` = Monthly
- `365` = Yearly

### Disable Auto-Resume

To always start fresh sessions:

```javascript
// In main.js, modify getOrCreateSessionId():
function getOrCreateSessionId() {
  // Skip loading logic, always create new
  const crypto = require("crypto");
  const newSessionId = crypto.randomUUID();
  // ... save logic
  return newSessionId;
}
```

---

## 📊 Session Info Display

The UI now shows session age:
```
Session: 2 hours old
Session: 3 days old
Session: 1 day old
```

This helps you understand:
- How long current session has been active
- When conversations started
- If you're continuing an old session

---

## 🔍 Viewing History

### Method 1: UI Button
1. Open Soma input window
2. Click **📜 History** button
3. Transcript loads with all saved messages
4. Shows timestamps and who said what

### Method 2: Tray Menu
1. Right-click Soma tray icon
2. Select **View Conversation History**
3. History logged to console
4. Soma speaks summary

### Method 3: API Call
```bash
curl http://localhost:7171/history/{session-id}?limit=50
```

---

## 🔄 Starting New Sessions

### When to Start New Session?

**Good Reasons:**
- Starting a completely different topic
- Want clean slate for testing
- Privacy (new project, different person using)
- Session got too long/cluttered

**Not Needed For:**
- General use (auto-resume works great)
- Different topics (context window handles this)
- After restart (automatically resumes)

### How to Start New Session

**Via UI:**
1. Click **🔄 New** button
2. Confirm when prompted
3. Previous conversations saved
4. Fresh transcript starts

**Via Tray:**
1. Right-click tray icon
2. Select **Start New Session**
3. Confirmation spoken
4. New session active

### What Happens to Old Sessions?

- ✅ **Saved in database** - Nothing is lost
- ✅ **Searchable** - Can still search old conversations
- ✅ **Accessible** - View via database tools
- ❌ Not automatically loaded to UI
- ❌ Not included in current context window

---

## 🗄️ Database Integration

### Conversation Storage
All messages stored with session ID:
```sql
SELECT * FROM conversations 
WHERE session_id = 'your-session-id'
ORDER BY timestamp DESC;
```

### Multiple Sessions
```sql
-- View all sessions
SELECT DISTINCT session_id, COUNT(*) as messages
FROM conversations
GROUP BY session_id;

-- View recent sessions
SELECT * FROM sessions
ORDER BY last_active DESC
LIMIT 10;
```

### Search Across Sessions
```bash
# Via API
curl "http://localhost:7171/search?q=python&limit=20"

# Via database
cd brain
node db-utils.js search "python"
```

---

## 🛠️ Troubleshooting

### Session Not Resuming

**Check session file exists:**
```bash
# Windows
dir "%APPDATA%\desktop\.soma_session"

# Or in code, check:
console.log(app.getPath('userData'));
```

**Verify file contents:**
```bash
type "%APPDATA%\desktop\.soma_session"
```

Should show valid JSON with session ID.

**Check session age:**
- Must be < 7 days old
- Check `timestamp` field in session file

### Can't See Old Conversations

**After restart:**
1. Click **📜 History** button to load from database
2. Or ask: "What did we talk about?"

**Different session:**
- Use database tools to search: `node db-utils.js search "query"`
- Or view all sessions in database

### Session File Errors

**Delete and recreate:**
```bash
# Windows
del "%APPDATA%\desktop\.soma_session"
# Restart app - new session created
```

**Check permissions:**
- UserData folder must be writable
- Usually automatic, no action needed

---

## 📈 Benefits

### For Users
✅ Conversations survive restarts
✅ Natural conversation flow maintained
✅ Context awareness across sessions
✅ No manual saving required
✅ Easy to start fresh when needed

### Technical Benefits
✅ Reduces database queries (session-scoped)
✅ Better context window management
✅ Consistent identity binding
✅ Improved memory recall
✅ Session analytics possible

---

## 🔐 Privacy Notes

- Session file stored locally only
- Contains only session ID and timestamps
- No conversation content in session file
- Delete session file to reset
- Conversations in database until cleanup (30 days default)

---

## 🚀 Future Enhancements

Possible future features:
- Multiple named sessions
- Session switching in UI
- Session search by date/topic
- Export session as PDF/text
- Session sharing (encrypted)
- Cloud session sync

---

## 📝 Examples

### Example 1: Resume After Restart
```
Day 1, 10 AM:
You: "Help me with Python code"
Soma: "Sure! What do you need?"

[Close app, go to lunch]

Day 1, 2 PM:
[Open app]
You: "What were we working on?"
Soma: "We were discussing Python code. What would you like to continue with?"
```

### Example 2: Long-Running Session
```
Day 1: Start project discussion
Day 2: Continue with implementation
Day 3: Debugging session
Day 4: Final review
Day 8: New session auto-starts (7 day timeout)
```

### Example 3: Manual New Session
```
Working on Project A...
[Click 🔄 New button]
Now working on Project B (fresh context)
Project A conversations still in database
```

---

## 🎓 Best Practices

### DO:
✅ Let sessions auto-resume normally
✅ Start new session for completely different topics
✅ Use history button to review past conversations
✅ Keep session timeout at 7 days (default)

### DON'T:
❌ Start new sessions too frequently
❌ Worry about database size (auto-cleanup)
❌ Delete session file unless troubleshooting
❌ Expect old sessions to auto-load (use history button)

---

## 📞 Support

**Session not working?**
1. Check console for `[SOMA] Session ID:` message
2. Verify session file exists
3. Test with: `window.soma.getSessionInfo()` in browser console
4. Check brain server logs

**Lost conversations?**
- Check database: `node db-utils.js stats`
- Search: `node db-utils.js search "keyword"`
- View history via API: `curl http://localhost:7171/history/{id}`

---

**Session persistence makes Soma truly remember your conversations! 🧠✨**
