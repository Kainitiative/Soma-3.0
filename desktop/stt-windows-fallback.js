// Windows Speech Recognition Fallback for Soma 3.0
// Uses PowerShell and Windows.Speech API for basic STT
// This provides better functionality when Whisper.cpp is not available

const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

class WindowsSTTFallback {
  constructor() {
    this.isRecording = false;
    this.recognitionProcess = null;
    this.tempDir = path.join(__dirname, 'whisper', 'temp');
    
    // Create temp directory
    if (!fs.existsSync(this.tempDir)) {
      fs.mkdirSync(this.tempDir, { recursive: true });
    }
  }

  // Start recording and recognition
  startRecording() {
    if (this.isRecording) {
      return { ok: false, error: 'Already recording' };
    }

    try {
      this.isRecording = true;
      console.log('[STT-Windows] Starting Windows Speech Recognition...');
      return { ok: true };
    } catch (error) {
      this.isRecording = false;
      return { ok: false, error: error.message };
    }
  }

  // Stop and get transcription
  async stopRecording() {
    if (!this.isRecording) {
      return { ok: false, error: 'Not recording' };
    }

    try {
      this.isRecording = false;
      
      // Use PowerShell with Windows.Speech.Recognition
      const transcription = await this.recognizeSpeech();
      
      return { ok: true, text: transcription };
    } catch (error) {
      console.error('[STT-Windows] Recognition failed:', error.message);
      return { ok: false, error: error.message };
    }
  }

  // Cancel recording
  cancelRecording() {
    if (this.isRecording && this.recognitionProcess) {
      try {
        this.recognitionProcess.kill();
      } catch (e) {
        // Ignore
      }
    }
    this.isRecording = false;
    this.recognitionProcess = null;
    return { ok: true };
  }

  // Use PowerShell to capture speech via Windows Speech Recognition
  async recognizeSpeech() {
    return new Promise((resolve, reject) => {
      // PowerShell script to use Windows Speech Recognition
      const psScript = `
Add-Type -AssemblyName System.Speech
$recognizer = New-Object System.Speech.Recognition.SpeechRecognitionEngine
$recognizer.SetInputToDefaultAudioDevice()
$grammar = New-Object System.Speech.Recognition.DictationGrammar
$recognizer.LoadGrammar($grammar)
$recognizer.BabbleTimeout = [TimeSpan]::FromSeconds(3)
$recognizer.InitialSilenceTimeout = [TimeSpan]::FromSeconds(5)
$recognizer.EndSilenceTimeout = [TimeSpan]::FromSeconds(1)

try {
    $result = $recognizer.Recognize()
    if ($result -ne $null) {
        Write-Output $result.Text
    } else {
        Write-Output ""
    }
} catch {
    Write-Error $_.Exception.Message
} finally {
    $recognizer.Dispose()
}
      `.trim();

      const scriptFile = path.join(this.tempDir, `speech_${Date.now()}.ps1`);
      fs.writeFileSync(scriptFile, psScript, 'utf8');

      const ps = spawn('powershell.exe', [
        '-NoProfile',
        '-ExecutionPolicy', 'Bypass',
        '-File', scriptFile
      ], {
        windowsHide: true
      });

      let output = '';
      let errorOutput = '';

      ps.stdout.on('data', (data) => {
        output += data.toString();
      });

      ps.stderr.on('data', (data) => {
        errorOutput += data.toString();
      });

      ps.on('exit', (code) => {
        // Cleanup script file
        try {
          fs.unlinkSync(scriptFile);
        } catch (e) {
          // Ignore
        }

        if (code === 0) {
          const text = output.trim();
          resolve(text || '[No speech detected]');
        } else {
          reject(new Error(`Speech recognition failed: ${errorOutput.slice(0, 200)}`));
        }
      });

      ps.on('error', (err) => {
        reject(err);
      });

      this.recognitionProcess = ps;

      // Timeout after 10 seconds
      setTimeout(() => {
        if (this.recognitionProcess) {
          this.recognitionProcess.kill();
          reject(new Error('Speech recognition timeout'));
        }
      }, 10000);
    });
  }
}

module.exports = WindowsSTTFallback;
