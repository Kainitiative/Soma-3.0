# Soma 3.0 - Troubleshooting Guide

## Common Errors and Solutions

### Error: "Chat failed" or 500 Error

**Symptoms:**
- Chat returns: `Error (see text). 500 {"error":"Chat failed"}`
- Cannot get responses from Soma

**Causes & Solutions:**

#### 1. Ollama Not Running
**Check:**
```bash
# Check if Ollama is running
curl http://localhost:11434/api/tags

# Or check the health endpoint
curl http://localhost:7171/health
```

**Solution:**
```bash
# Start Ollama
ollama serve

# In another terminal, verify it's running
ollama list
```

#### 2. Models Not Installed
**Check:**
```bash
ollama list
```

**Solution:**
```bash
# Install required models
ollama pull llama3.1:8b
ollama pull llava

# Verify installation
ollama list
```

#### 3. Wrong Model Names in Config
**Check:**
```bash
# See what models you have
ollama list

# Check your config
cat /app/brain/config.json | grep Model
```

**Solution:**
Edit `/app/brain/config.json` and update:
```json
{
  "chatModel": "llama3.1:8b",     // Match exact name from ollama list
  "visionModel": "llava"          // Match exact name from ollama list
}
```

#### 4. Ollama on Different Port
**Check:**
```bash
# Try different ports
curl http://localhost:11434/api/tags
curl http://localhost:8080/api/tags
```

**Solution:**
Edit `/app/brain/config.json`:
```json
{
  "ollamaUrl": "http://localhost:YOUR_PORT/api/generate"
}
```

---

### Error: "Ollama service is not available"

**Symptoms:**
- Chat returns: `503 Ollama service is not available`

**Solution:**
1. Make sure Ollama is installed: https://ollama.com
2. Start Ollama service:
   ```bash
   ollama serve
   ```
3. Wait for brain server to reconnect (checks every 30 seconds)
4. Or restart brain server:
   ```bash
   cd brain
   npm start
   ```

---

### Error: "Request timed out"

**Symptoms:**
- Chat returns: `504 Request timed out`
- Takes very long then fails

**Causes:**
- Model is too large for your hardware
- System under heavy load
- First request (model loading into memory)

**Solutions:**
1. **Wait for first request** (models load into RAM):
   ```bash
   # First request can take 30-60 seconds
   # Subsequent requests will be faster
   ```

2. **Use smaller model:**
   ```bash
   # Try a smaller model
   ollama pull llama3.1:7b
   
   # Update config.json
   "chatModel": "llama3.1:7b"
   ```

3. **Increase RAM/VRAM:**
   - Close other applications
   - Check system resources

---

### Database Errors

**Symptoms:**
- `Failed to save message`
- `Database locked`
- SQLite errors

**Solutions:**

1. **Check database file:**
   ```bash
   ls -la /app/brain/data/
   # Should see soma_memory.db
   ```

2. **Check permissions:**
   ```bash
   # Make sure directory is writable
   chmod 755 /app/brain/data
   ```

3. **Rebuild database:**
   ```bash
   # Backup first
   cp /app/brain/data/soma_memory.db /app/brain/data/soma_memory.db.backup
   
   # Delete and restart server (will recreate)
   rm /app/brain/data/soma_memory.db
   cd /app/brain
   npm start
   ```

4. **Check database integrity:**
   ```bash
   cd /app/brain
   node db-utils.js stats
   ```

---

### No Voice Output

**Symptoms:**
- Chat works but no voice
- Silence from Soma

**Solutions:**

1. **Check mute status:**
   - Press `Ctrl+M` to unmute

2. **Check Piper paths:**
   Edit `/app/desktop/main.js` and verify:
   ```javascript
   const piperExe = "C:\\Soma3\\piper\\piper\\piper.exe";
   const piperModel = "C:\\Soma3\\piper\\voices\\amy\\en_US-amy-medium.onnx";
   ```

3. **Check TTS logs:**
   ```bash
   # On Windows
   type C:\Soma3\piper\tts_log.txt
   ```

4. **Verify Piper installation:**
   - Check if `piper.exe` exists
   - Check if voice model exists
   - Try running Piper manually

---

### Desktop App Won't Start

**Symptoms:**
- Electron app doesn't launch
- No tray icon appears

**Solutions:**

1. **Check brain server:**
   ```bash
   # Make sure brain is running first
   curl http://localhost:7171/health
   ```

2. **Check dependencies:**
   ```bash
   cd desktop
   npm install
   ```

3. **Check for errors:**
   ```bash
   cd desktop
   npm start
   # Look for error messages in terminal
   ```

4. **Check ports:**
   ```bash
   # Make sure port 7171 is not blocked
   netstat -an | grep 7171
   ```

---

### Context/Memory Not Working

**Symptoms:**
- Soma doesn't remember previous messages
- No conversation continuity

**Solutions:**

1. **Check feature flags:**
   Edit `/app/brain/config.json`:
   ```json
   {
     "features": {
       "enableLongTermMemory": true,
       "enableContextWindow": true,
       "enableIdentityPersistence": true
     }
   }
   ```

2. **Restart server:**
   ```bash
   cd brain
   npm start
   ```

3. **Check database:**
   ```bash
   cd brain
   node db-utils.js stats
   # Should show conversation counts
   ```

4. **Check context stats:**
   ```bash
   curl http://localhost:7171/context/stats/your-session-id
   ```

---

### Identity Binding Not Working

**Symptoms:**
- "Who is this?" doesn't work
- Identity not remembered

**Solutions:**

1. **Take screenshot first:**
   - Must take screenshot before binding identity
   - Click 📸 button
   - Then say "That's me" or "This is John"

2. **Check working memory:**
   ```bash
   curl http://localhost:7171/identities
   ```

3. **Use exact phrases:**
   - ✓ "That's me"
   - ✓ "This is John"
   - ✗ "The person is me" (won't work)

4. **Check database:**
   ```bash
   cd brain
   node db-utils.js identities
   ```

---

## Diagnostic Commands

### Check Everything
```bash
# 1. Check Ollama
curl http://localhost:11434/api/tags

# 2. Check brain health
curl http://localhost:7171/health

# 3. Check database
cd /app/brain
node db-utils.js stats

# 4. Check configuration
cat /app/brain/config.json

# 5. Test chat
curl -X POST http://localhost:7171/chat \
  -H "Content-Type: application/json" \
  -d '{"text": "Hello, are you working?"}'
```

### View Logs
```bash
# Brain server logs (check terminal where you ran npm start)

# TTS logs (Windows)
type C:\Soma3\piper\tts_log.txt

# Check if services are running
# Windows:
tasklist | findstr node
tasklist | findstr electron
```

---

## Performance Issues

### Slow Responses

**Solutions:**
1. Use smaller models:
   ```bash
   ollama pull llama3.1:7b
   ```

2. Reduce context window:
   ```json
   {
     "maxContextMessages": 5,
     "maxContextTokens": 2000
   }
   ```

3. Reduce response length:
   ```json
   {
     "personalities": {
       "friendly": {
         "maxTokens": 100
       }
     }
   }
   ```

### High Memory Usage

**Solutions:**
1. Close unused applications
2. Use quantized models (smaller)
3. Reduce context window size
4. Clean up old database entries:
   ```bash
   cd brain
   node db-utils.js cleanup
   ```

---

## Getting Help

### Collect Information

When reporting issues, include:

1. **Health check:**
   ```bash
   curl http://localhost:7171/health
   ```

2. **Ollama status:**
   ```bash
   ollama list
   ```

3. **Error messages from terminal**

4. **Config file:**
   ```bash
   cat /app/brain/config.json
   ```

5. **Database stats:**
   ```bash
   cd brain
   node db-utils.js stats
   ```

### Resources

- Ollama Documentation: https://ollama.com
- Soma README: `/app/README.md`
- Quick Start: `/app/QUICK_START.md`
- Implementation Details: `/app/IMPLEMENTATION_SUMMARY.md`

---

## Reset Everything

If all else fails, complete reset:

```bash
# 1. Backup data
cd /app/brain
node db-utils.js export

# 2. Stop all processes
# Ctrl+C in terminals

# 3. Clear database
rm -rf /app/brain/data/

# 4. Reinstall dependencies
cd /app/brain
npm install

cd /app/desktop
npm install

# 5. Restart
cd /app/brain
npm start

# In another terminal:
cd /app/desktop
npm start
```

---

## Prevention Tips

1. **Always start brain server first**, then desktop app
2. **Keep Ollama running** in the background
3. **Install required models** before first use
4. **Check health endpoint** after starting: `curl http://localhost:7171/health`
5. **Monitor logs** in the terminal
6. **Regular database maintenance**: `node db-utils.js cleanup` monthly

---

**Still having issues?** Check the detailed logs in your terminal for specific error messages!
