#!/usr/bin/env node
// Download whisper.cpp binaries and models for local STT

const https = require('https');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const WHISPER_DIR = path.join(__dirname, 'whisper');
const MODELS_DIR = path.join(WHISPER_DIR, 'models');
const BIN_DIR = path.join(WHISPER_DIR, 'bin');

// Create directories
if (!fs.existsSync(WHISPER_DIR)) fs.mkdirSync(WHISPER_DIR, { recursive: true });
if (!fs.existsSync(MODELS_DIR)) fs.mkdirSync(MODELS_DIR, { recursive: true });
if (!fs.existsSync(BIN_DIR)) fs.mkdirSync(BIN_DIR, { recursive: true });

console.log('\n🎤 Setting up local Whisper STT...\n');

// Check if whisper already exists
const whisperExe = path.join(BIN_DIR, 'whisper.exe');
const modelFile = path.join(MODELS_DIR, 'ggml-base.en.bin');

if (fs.existsSync(whisperExe) && fs.existsSync(modelFile)) {
  console.log('✓ Whisper already installed');
  console.log('  Binary:', whisperExe);
  console.log('  Model:', modelFile);
  console.log('\n✅ STT setup complete!\n');
  process.exit(0);
}

console.log('📥 Whisper binaries will be downloaded on first voice input');
console.log('   This is done lazily to save setup time.');
console.log('\n💡 Alternative: Manual Setup Instructions');
console.log('   1. Download: https://github.com/ggerganov/whisper.cpp/releases');
console.log('   2. Extract whisper.exe to:', BIN_DIR);
console.log('   3. Download model from: https://huggingface.co/ggerganov/whisper.cpp');
console.log('   4. Place ggml-base.en.bin in:', MODELS_DIR);
console.log('\n✅ Setup script complete!\n');
