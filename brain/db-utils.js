// Database utility script for Soma 3.0
// Run with: node db-utils.js [command]

const db = require('./database');
const config = require('./config.json');

// Commands
const commands = {
  stats: showStats,
  cleanup: runCleanup,
  export: exportData,
  identities: showIdentities,
  search: searchConversations,
  clear: clearAllData,
  help: showHelp
};

function showStats() {
  console.log('\n=== Soma 3.0 Database Statistics ===\n');
  
  // Conversation stats
  const convCount = db.db.prepare('SELECT COUNT(*) as count FROM conversations').get();
  const sessionCount = db.db.prepare('SELECT COUNT(*) as count FROM sessions').get();
  const identityCount = db.db.prepare('SELECT COUNT(*) as count FROM identities').get();
  const factCount = db.db.prepare('SELECT COUNT(*) as count FROM facts').get();
  
  console.log(`Total Conversations: ${convCount.count}`);
  console.log(`Active Sessions: ${sessionCount.count}`);
  console.log(`Known Identities: ${identityCount.count}`);
  console.log(`Learned Facts: ${factCount.count}`);
  
  // Recent activity
  const recent = db.db.prepare(
    'SELECT timestamp FROM conversations ORDER BY timestamp DESC LIMIT 1'
  ).get();
  
  if (recent) {
    const lastActivity = new Date(recent.timestamp);
    console.log(`\nLast Activity: ${lastActivity.toLocaleString()}`);
  }
  
  // Disk usage
  const fs = require('fs');
  const path = require('path');
  const dbPath = path.join(__dirname, 'data', 'soma_memory.db');
  
  if (fs.existsSync(dbPath)) {
    const stats = fs.statSync(dbPath);
    const sizeMB = (stats.size / 1024 / 1024).toFixed(2);
    console.log(`Database Size: ${sizeMB} MB`);
  }
  
  console.log('\n');
}

function runCleanup() {
  console.log('\n=== Running Database Cleanup ===\n');
  const days = config.memoryRetentionDays || 30;
  console.log(`Retention period: ${days} days`);
  
  db.cleanupOldData(days);
  console.log('Cleanup complete!\n');
  showStats();
}

function exportData() {
  console.log('\n=== Exporting Data ===\n');
  const fs = require('fs');
  const path = require('path');
  
  const exportDir = path.join(__dirname, 'exports');
  if (!fs.existsSync(exportDir)) {
    fs.mkdirSync(exportDir, { recursive: true });
  }
  
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  
  // Export conversations
  const conversations = db.getRecentConversations(1000);
  const convFile = path.join(exportDir, `conversations_${timestamp}.json`);
  fs.writeFileSync(convFile, JSON.stringify(conversations, null, 2));
  console.log(`Exported ${conversations.length} conversations to: ${convFile}`);
  
  // Export identities
  const identities = db.getAllIdentities();
  const idFile = path.join(exportDir, `identities_${timestamp}.json`);
  fs.writeFileSync(idFile, JSON.stringify(identities, null, 2));
  console.log(`Exported ${identities.length} identities to: ${idFile}`);
  
  // Export facts
  const facts = db.getAllFacts();
  const factFile = path.join(exportDir, `facts_${timestamp}.json`);
  fs.writeFileSync(factFile, JSON.stringify(facts, null, 2));
  console.log(`Exported ${facts.length} facts to: ${factFile}`);
  
  console.log('\nExport complete!\n');
}

function showIdentities() {
  console.log('\n=== Known Identities ===\n');
  const identities = db.getAllIdentities();
  
  if (identities.length === 0) {
    console.log('No identities found.\n');
    return;
  }
  
  for (const identity of identities) {
    const created = new Date(identity.created_at).toLocaleDateString();
    const lastSeen = new Date(identity.last_seen).toLocaleDateString();
    
    console.log(`Subject: ${identity.subject}`);
    console.log(`  Hash: ${identity.image_hash.slice(0, 16)}...`);
    console.log(`  Confidence: ${identity.confidence}`);
    console.log(`  Source: ${identity.source}`);
    console.log(`  Created: ${created}`);
    console.log(`  Last Seen: ${lastSeen}`);
    if (identity.notes) {
      console.log(`  Notes: ${identity.notes}`);
    }
    console.log('');
  }
}

function searchConversations() {
  const query = process.argv[3];
  if (!query) {
    console.log('\nUsage: node db-utils.js search "your query"\n');
    return;
  }
  
  console.log(`\n=== Search Results for "${query}" ===\n`);
  const results = db.searchConversations(query, 20);
  
  if (results.length === 0) {
    console.log('No results found.\n');
    return;
  }
  
  for (const msg of results) {
    const timestamp = new Date(msg.timestamp).toLocaleString();
    console.log(`[${timestamp}] ${msg.role}:`);
    console.log(`  ${msg.content}`);
    console.log('');
  }
  
  console.log(`Found ${results.length} results.\n`);
}

function clearAllData() {
  const readline = require('readline').createInterface({
    input: process.stdin,
    output: process.stdout
  });
  
  readline.question('\n⚠️  Are you sure you want to delete ALL data? (yes/no): ', (answer) => {
    if (answer.toLowerCase() === 'yes') {
      console.log('\nDeleting all data...');
      
      db.db.exec('DELETE FROM conversations');
      db.db.exec('DELETE FROM identities');
      db.db.exec('DELETE FROM facts');
      db.db.exec('DELETE FROM sessions');
      db.db.exec('VACUUM');
      
      console.log('All data deleted!\n');
    } else {
      console.log('\nCancelled.\n');
    }
    
    readline.close();
  });
}

function showHelp() {
  console.log(`
╔═══════════════════════════════════════════════╗
║      Soma 3.0 Database Utility Script         ║
╚═══════════════════════════════════════════════╝

Usage: node db-utils.js [command]

Commands:
  stats       - Show database statistics
  cleanup     - Clean up old data (respects retention period)
  export      - Export all data to JSON files
  identities  - List all known identities
  search      - Search conversations (usage: search "query")
  clear       - Delete ALL data (requires confirmation)
  help        - Show this help message

Examples:
  node db-utils.js stats
  node db-utils.js search "python"
  node db-utils.js export

Configuration:
  Edit config.json to adjust:
  - memoryRetentionDays (default: 30)
  - maxContextMessages (default: 10)
  - personality settings

`);
}

// Main
const command = process.argv[2] || 'help';
const handler = commands[command];

if (handler) {
  handler();
} else {
  console.log(`\nUnknown command: ${command}\n`);
  showHelp();
}
