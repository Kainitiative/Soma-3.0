const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

// Ensure data directory exists
const dataDir = path.join(__dirname, 'data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const dbPath = path.join(dataDir, 'soma_memory.db');
const db = new Database(dbPath);

// Enable WAL mode for better concurrent access
db.pragma('journal_mode = WAL');

// Initialize database schema
function initDB() {
  // Conversation history
  db.exec(`
    CREATE TABLE IF NOT EXISTS conversations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id TEXT NOT NULL,
      timestamp INTEGER NOT NULL,
      role TEXT NOT NULL,
      content TEXT NOT NULL,
      metadata TEXT
    )
  `);

  // Identity bindings (persistent)
  db.exec(`
    CREATE TABLE IF NOT EXISTS identities (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      image_hash TEXT UNIQUE NOT NULL,
      subject TEXT NOT NULL,
      confidence TEXT DEFAULT 'medium',
      source TEXT DEFAULT 'user',
      created_at INTEGER NOT NULL,
      last_seen INTEGER NOT NULL,
      notes TEXT
    )
  `);

  // Learned facts about the user
  db.exec(`
    CREATE TABLE IF NOT EXISTS facts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      category TEXT NOT NULL,
      fact_key TEXT NOT NULL,
      fact_value TEXT NOT NULL,
      confidence REAL DEFAULT 0.8,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      UNIQUE(category, fact_key)
    )
  `);

  // Session metadata
  db.exec(`
    CREATE TABLE IF NOT EXISTS sessions (
      session_id TEXT PRIMARY KEY,
      started_at INTEGER NOT NULL,
      last_active INTEGER NOT NULL,
      message_count INTEGER DEFAULT 0
    )
  `);

  // Create indexes for better query performance
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_conversations_session ON conversations(session_id, timestamp);
    CREATE INDEX IF NOT EXISTS idx_conversations_timestamp ON conversations(timestamp);
    CREATE INDEX IF NOT EXISTS idx_identities_hash ON identities(image_hash);
    CREATE INDEX IF NOT EXISTS idx_sessions_active ON sessions(last_active);
  `);

  console.log('[DB] Database initialized:', dbPath);
}

initDB();

// =============================
// Conversation History
// =============================

function saveMessage(sessionId, role, content, metadata = null) {
  const stmt = db.prepare(
    'INSERT INTO conversations (session_id, timestamp, role, content, metadata) VALUES (?, ?, ?, ?, ?)'
  );
  stmt.run(sessionId, Date.now(), role, content, metadata ? JSON.stringify(metadata) : null);
  
  // Update session activity
  updateSession(sessionId);
}

function getConversationHistory(sessionId, limit = 20) {
  const stmt = db.prepare(
    'SELECT * FROM conversations WHERE session_id = ? ORDER BY timestamp DESC LIMIT ?'
  );
  const rows = stmt.all(sessionId, limit);
  return rows.reverse().map(row => ({
    ...row,
    metadata: row.metadata ? JSON.parse(row.metadata) : null
  }));
}

function getRecentConversations(limit = 50) {
  const stmt = db.prepare(
    'SELECT * FROM conversations ORDER BY timestamp DESC LIMIT ?'
  );
  const rows = stmt.all(limit);
  return rows.reverse().map(row => ({
    ...row,
    metadata: row.metadata ? JSON.parse(row.metadata) : null
  }));
}

function searchConversations(query, limit = 10) {
  const stmt = db.prepare(
    'SELECT * FROM conversations WHERE content LIKE ? ORDER BY timestamp DESC LIMIT ?'
  );
  return stmt.all(`%${query}%`, limit);
}

// =============================
// Identity Management
// =============================

function saveIdentity(imageHash, subject, confidence = 'high', source = 'user', notes = null) {
  const now = Date.now();
  const stmt = db.prepare(`
    INSERT INTO identities (image_hash, subject, confidence, source, created_at, last_seen, notes)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(image_hash) DO UPDATE SET
      subject = excluded.subject,
      confidence = excluded.confidence,
      last_seen = excluded.last_seen,
      notes = excluded.notes
  `);
  stmt.run(imageHash, subject, confidence, source, now, now, notes);
  console.log(`[DB] Identity saved: ${imageHash.slice(0, 10)}... => ${subject}`);
}

function getIdentity(imageHash) {
  const stmt = db.prepare('SELECT * FROM identities WHERE image_hash = ?');
  return stmt.get(imageHash);
}

function getAllIdentities() {
  const stmt = db.prepare('SELECT * FROM identities ORDER BY last_seen DESC');
  return stmt.all();
}

function updateIdentityLastSeen(imageHash) {
  const stmt = db.prepare('UPDATE identities SET last_seen = ? WHERE image_hash = ?');
  stmt.run(Date.now(), imageHash);
}

// =============================
// Facts & Knowledge
// =============================

function saveFact(category, key, value, confidence = 0.8) {
  const now = Date.now();
  const stmt = db.prepare(`
    INSERT INTO facts (category, fact_key, fact_value, confidence, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(category, fact_key) DO UPDATE SET
      fact_value = excluded.fact_value,
      confidence = excluded.confidence,
      updated_at = excluded.updated_at
  `);
  stmt.run(category, key, value, confidence, now, now);
}

function getFact(category, key) {
  const stmt = db.prepare('SELECT * FROM facts WHERE category = ? AND fact_key = ?');
  return stmt.get(category, key);
}

function getAllFacts(category = null) {
  if (category) {
    const stmt = db.prepare('SELECT * FROM facts WHERE category = ? ORDER BY updated_at DESC');
    return stmt.all(category);
  }
  const stmt = db.prepare('SELECT * FROM facts ORDER BY category, updated_at DESC');
  return stmt.all();
}

// =============================
// Session Management
// =============================

function updateSession(sessionId) {
  const now = Date.now();
  const stmt = db.prepare(`
    INSERT INTO sessions (session_id, started_at, last_active, message_count)
    VALUES (?, ?, ?, 1)
    ON CONFLICT(session_id) DO UPDATE SET
      last_active = excluded.last_active,
      message_count = message_count + 1
  `);
  stmt.run(sessionId, now, now);
}

function getSession(sessionId) {
  const stmt = db.prepare('SELECT * FROM sessions WHERE session_id = ?');
  return stmt.get(sessionId);
}

// =============================
// Cleanup & Maintenance
// =============================

function cleanupOldData(retentionDays = 30) {
  const cutoffTime = Date.now() - (retentionDays * 24 * 60 * 60 * 1000);
  
  // Delete old conversations
  const stmt1 = db.prepare('DELETE FROM conversations WHERE timestamp < ?');
  const result1 = stmt1.run(cutoffTime);
  
  // Delete inactive sessions
  const stmt2 = db.prepare('DELETE FROM sessions WHERE last_active < ?');
  const result2 = stmt2.run(cutoffTime);
  
  console.log(`[DB] Cleanup: ${result1.changes} conversations, ${result2.changes} sessions deleted`);
  
  // Optimize database
  db.exec('VACUUM');
}

// Run cleanup on startup
setTimeout(() => {
  const config = require('./config.json');
  cleanupOldData(config.memoryRetentionDays || 30);
}, 5000);

module.exports = {
  db,
  saveMessage,
  getConversationHistory,
  getRecentConversations,
  searchConversations,
  saveIdentity,
  getIdentity,
  getAllIdentities,
  updateIdentityLastSeen,
  saveFact,
  getFact,
  getAllFacts,
  updateSession,
  getSession,
  cleanupOldData
};
