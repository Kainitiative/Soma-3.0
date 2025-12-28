// Local Speech-to-Text Manager for Soma 3.0
// Uses whisper.cpp for privacy-first, offline STT

const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const WindowsSTTFallback = require('./stt-windows-fallback');

class STTManager {
  constructor() {
    this.isRecording = false;
    this.recordingProcess = null;
    this.whisperDir = path.join(__dirname, 'whisper');
    this.whisperExe = path.join(this.whisperDir, 'bin', 'main.exe');
    this.modelPath = path.join(this.whisperDir, 'models', 'ggml-base.en.bin');
    this.tempDir = path.join(this.whisperDir, 'temp');
    
    // Create temp directory
    if (!fs.existsSync(this.tempDir)) {
      fs.mkdirSync(this.tempDir, { recursive: true });
    }

    // Check if Whisper is available
    this.useWindowsSpeech = !fs.existsSync(this.whisperExe) || !fs.existsSync(this.modelPath);
    
    // Initialize fallback if needed
    if (this.useWindowsSpeech) {
      this.windowsSTT = new WindowsSTTFallback();
      console.log('[STT] Using Windows Speech Recognition (fallback mode)');
      console.log('[STT] For better accuracy, install whisper.cpp:');
      console.log('      Binary:', this.whisperExe);
      console.log('      Model:', this.modelPath);
      console.log('[STT] See STT_SETUP.md for installation instructions');
    } else {
      console.log('[STT] Using Whisper.cpp (high-quality local STT)');
      console.log('[STT] Model:', path.basename(this.modelPath));
    }
  }

  // Start recording audio
  startRecording() {
    if (this.isRecording) {
      return { ok: false, error: 'Already recording' };
    }

    // Use Windows STT fallback if Whisper not available
    if (this.useWindowsSpeech && this.windowsSTT) {
      return this.windowsSTT.startRecording();
    }

    // TODO: Implement actual audio recording for Whisper
    // For now, return error indicating setup needed
    return {
      ok: false,
      error: 'Whisper.cpp recording not yet implemented. Using Windows STT...'
    };
  }

  // Stop recording and transcribe
  async stopRecording() {
    if (!this.isRecording) {
      return { ok: false, error: 'Not recording' };
    }

    // Use Windows STT fallback
    if (this.useWindowsSpeech && this.windowsSTT) {
      return await this.windowsSTT.stopRecording();
    }

    // TODO: Implement Whisper transcription
    return { ok: false, error: 'Whisper transcription not yet implemented' };
  }

  // Cancel recording without transcription
  cancelRecording() {
    if (this.useWindowsSpeech && this.windowsSTT) {
      return this.windowsSTT.cancelRecording();
    }
    
    this.isRecording = false;
    return { ok: true };
  }

  // Transcribe using Whisper.cpp
  async transcribeWithWhisper(audioFile) {
    return new Promise((resolve, reject) => {
      const args = [
        '-m', this.modelPath,
        '-f', audioFile,
        '--output-txt',
        '--no-timestamps',
        '-l', 'en',
        '-t', '4'  // 4 threads
      ];

      const whisper = spawn(this.whisperExe, args, {
        windowsHide: true
      });

      let output = '';
      let errorOutput = '';

      whisper.stdout.on('data', (data) => {
        output += data.toString();
      });

      whisper.stderr.on('data', (data) => {
        errorOutput += data.toString();
      });

      whisper.on('exit', (code) => {
        if (code === 0) {
          // Parse output - whisper usually outputs the transcription
          const transcription = this.parseWhisperOutput(output);
          resolve(transcription);
        } else {
          reject(new Error(`Whisper failed: ${errorOutput.slice(0, 200)}`));
        }
      });

      whisper.on('error', (err) => {
        reject(err);
      });

      // Timeout after 30 seconds
      setTimeout(() => {
        whisper.kill();
        reject(new Error('Whisper timeout'));
      }, 30000);
    });
  }

  // Parse Whisper output to extract transcription
  parseWhisperOutput(output) {
    // Whisper.cpp outputs transcription in various formats
    // Usually the last line contains the transcription
    const lines = output.trim().split('\n');
    for (let i = lines.length - 1; i >= 0; i--) {
      const line = lines[i].trim();
      // Skip empty lines and progress indicators
      if (line && !line.startsWith('[') && !line.includes('%')) {
        return line;
      }
    }
    return output.trim() || '';
  }

  // Check if STT is available
  isAvailable() {
    return true; // Always available (fallback mode exists)
  }

  // Get STT status
  getStatus() {
    return {
      available: this.isAvailable(),
      recording: this.isRecording,
      engine: this.useWindowsSpeech ? 'Windows Speech' : 'Whisper.cpp',
      quality: this.useWindowsSpeech ? 'medium' : 'high'
    };
  }
}

module.exports = STTManager;
