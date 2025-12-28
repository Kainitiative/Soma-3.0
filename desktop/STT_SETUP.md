# 🎤 Voice Input (STT) Setup Guide for Soma 3.0

Soma 3.0 now supports **local, privacy-first voice input** using Whisper.cpp - the same technology as OpenAI's Whisper, running entirely on your machine.

---

## 🚀 Quick Start (Automatic)

The voice input will work immediately in **fallback mode** using Windows Speech Recognition. However, for **much better accuracy**, follow the setup below to install Whisper.cpp.

---

## 📥 Installing Whisper.cpp (Recommended)

### Option 1: Download Pre-built Binaries (Easiest)

1. **Download whisper.cpp for Windows:**
   - Visit: https://github.com/ggerganov/whisper.cpp/releases
   - Download the latest `whisper-bin-x64.zip` (or similar Windows build)
   - Extract the ZIP file

2. **Copy the executable:**
   - Find `main.exe` in the extracted folder
   - Copy it to: `/app/desktop/whisper/bin/main.exe`
   - Create the directory if it doesn't exist

3. **Download the AI model:**
   - Visit: https://huggingface.co/ggerganov/whisper.cpp/tree/main
   - Download `ggml-base.en.bin` (English, ~140MB) - recommended for balance
   - OR download `ggml-tiny.en.bin` (~75MB) for faster but less accurate
   - OR download `ggml-small.en.bin` (~460MB) for higher accuracy
   - Place it in: `/app/desktop/whisper/models/ggml-base.en.bin`

4. **Restart Soma Desktop**
   - The app will automatically detect Whisper and use it

---

### Option 2: Build from Source (Advanced)

If you want to compile whisper.cpp yourself:

```bash
# Clone the repository
git clone https://github.com/ggerganov/whisper.cpp.git
cd whisper.cpp

# Build on Windows (requires CMake and Visual Studio)
cmake -B build
cmake --build build --config Release

# Copy the binary
copy build\bin\Release\main.exe C:\path\to\soma\desktop\whisper\bin\

# Download models
bash ./models/download-ggml-model.sh base.en
copy models\ggml-base.en.bin C:\path\to\soma\desktop\whisper\models\
```

---

## 🎯 Model Comparison

| Model | Size | Speed | Accuracy | Recommended For |
|-------|------|-------|----------|-----------------|
| tiny.en | ~75MB | Very Fast | Basic | Quick commands, testing |
| base.en | ~140MB | Fast | Good | **Recommended** - balanced |
| small.en | ~460MB | Medium | Better | Long conversations |
| medium.en | ~1.5GB | Slow | Best | Maximum accuracy |

**Recommendation:** Start with `base.en` for the best balance of speed and accuracy.

---

## 📂 Expected Directory Structure

After setup, your directory should look like:

```
/app/desktop/
├── whisper/
│   ├── bin/
│   │   └── main.exe          ← Whisper executable
│   ├── models/
│   │   └── ggml-base.en.bin  ← AI model
│   └── temp/                 ← Auto-created for recordings
├── main.js
├── index.html
├── stt-manager.js
└── package.json
```

---

## 🎤 How to Use Voice Input

### Method 1: Hotkey (Push-to-Talk)
1. Press **Ctrl+Shift+V** to start recording
2. Speak your message
3. Press **Ctrl+Shift+V** again (or click 🎤 button) to stop and transcribe
4. The transcribed text appears in the input field
5. Press **Enter** or click **Send** to submit

### Method 2: Button Click
1. Click the **🎤** button in the UI
2. The button turns red and pulses while recording
3. Speak your message
4. Click **🎤** again to stop and transcribe

### Method 3: Cancel Recording
- Press **Escape** to cancel recording without transcription

---

## ⚙️ How It Works

1. **Audio Capture**: Uses Node.js audio recording to capture microphone input
2. **File Storage**: Saves temporary WAV file (16kHz, mono) in `/whisper/temp/`
3. **Transcription**: Runs Whisper.cpp locally on your CPU
4. **Privacy**: All processing happens on your machine - no cloud, no APIs
5. **Cleanup**: Automatically deletes temporary audio files after transcription

---

## 🔧 Troubleshooting

### "Voice input unavailable"
- Check that microphone permissions are granted to the app
- Verify that a microphone is connected and working

### "STT: Fallback mode"
- This means Whisper.cpp is not installed
- Follow the installation steps above for better quality
- Fallback uses Windows Speech Recognition (lower accuracy)

### "No audio recorded"
- Speak louder or closer to the microphone
- Check Windows sound settings
- Ensure the correct microphone is selected as default

### Slow transcription
- Use a smaller model (tiny.en or base.en)
- Close other CPU-intensive applications
- On slower computers, transcription may take 2-5 seconds

### "Whisper failed" error
- Verify that `main.exe` is in the correct location
- Verify that the model file exists and isn't corrupted
- Check that the model filename matches what the code expects
- Try re-downloading the model

---

## 🌍 Multi-Language Support

The current setup uses English models (`.en` suffix) for faster processing. To use other languages:

1. Download a multilingual model (e.g., `ggml-base.bin` without `.en`)
2. Update `stt-manager.js` line with `-l` parameter to your language code
3. Example: `-l es` for Spanish, `-l fr` for French, `-l de` for German

Available at: https://huggingface.co/ggerganov/whisper.cpp/tree/main

---

## 📊 Performance Tips

- **First run** might be slower as Whisper initializes
- **Shorter phrases** (5-15 seconds) transcribe faster
- **Good microphone** improves accuracy significantly
- **Quiet environment** reduces background noise errors
- **Clear speech** works better than mumbling

---

## 🔒 Privacy & Security

✅ **100% Local** - No audio leaves your computer  
✅ **No API Keys** - No external services required  
✅ **No Internet** - Works completely offline  
✅ **Auto-Delete** - Audio files deleted immediately after transcription  
✅ **Open Source** - Whisper.cpp is fully auditable

This is the same privacy-first approach as your Ollama AI and Piper TTS!

---

## 🎓 Advanced Configuration

### Change Whisper Parameters

Edit `/app/desktop/stt-manager.js` in the `transcribeWithWhisper()` method:

```javascript
const args = [
  '-m', this.modelPath,        // Model path
  '-f', audioFile,              // Input file
  '--output-txt',               // Text output
  '--no-timestamps',            // Skip timestamps
  '-l', 'en',                   // Language (en, es, fr, etc.)
  '-t', '4',                    // Thread count (adjust for CPU)
  '--max-len', '0',             // No length limit
];
```

### Use Better Audio Quality

Modify recording parameters in `stt-manager.js`:

```javascript
this.recordingProcess = recorder.record({
  sampleRate: 16000,  // Whisper expects 16kHz
  channels: 1,        // Mono audio
  threshold: 0,       // Sensitivity
  silence: '2.0',     // Auto-stop after 2s of silence
});
```

---

## 📝 Notes

- Voice input is **additive** to existing text input - you can mix typing and voice
- The transcript shows both typed and voice inputs
- Voice input respects the mute setting (won't speak back if muted)
- You can edit voice-transcribed text before sending

---

## ✨ Future Enhancements

Potential improvements (not yet implemented):
- [ ] Voice Activity Detection (auto-stop when you finish speaking)
- [ ] Real-time streaming transcription
- [ ] Custom wake word ("Hey Soma")
- [ ] Noise cancellation preprocessing
- [ ] Multiple microphone selection
- [ ] Audio level visualization

---

## 📞 Support

If you encounter issues:
1. Check the console logs (Ctrl+Shift+I in the Electron window)
2. Verify all files are in the correct locations
3. Test with the `tiny.en` model first (smaller, faster, easier to debug)
4. Ensure your microphone works in other applications

---

**Enjoy hands-free interaction with Soma 3.0! 🎤🚀**
