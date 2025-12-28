// Context Window Management for Soma 3.0
// Handles message history, token estimation, and context pruning

const config = require('./config.json');
const { getConversationHistory } = require('./database');

// Rough token estimation (1 token ≈ 4 characters for English)
function estimateTokens(text) {
  return Math.ceil(text.length / 4);
}

// Build context window from conversation history
function buildContextWindow(sessionId, maxMessages = null, maxTokens = null) {
  const limit = maxMessages || config.maxContextMessages || 10;
  const tokenLimit = maxTokens || config.maxContextTokens || 4000;
  
  const history = getConversationHistory(sessionId, limit * 2); // Get more than needed
  
  const messages = [];
  let totalTokens = 0;
  
  // Add messages from most recent, stopping when we hit token limit
  for (let i = history.length - 1; i >= 0; i--) {
    const msg = history[i];
    const msgTokens = estimateTokens(msg.content);
    
    if (totalTokens + msgTokens > tokenLimit && messages.length > 0) {
      break;
    }
    
    messages.unshift({
      role: msg.role,
      content: msg.content,
      timestamp: msg.timestamp
    });
    
    totalTokens += msgTokens;
    
    if (messages.length >= limit) {
      break;
    }
  }
  
  return {
    messages,
    totalTokens,
    messageCount: messages.length
  };
}

// Format context for Ollama prompt
function formatContextForPrompt(sessionId, currentPrompt) {
  const contextWindow = buildContextWindow(sessionId);
  
  if (contextWindow.messages.length === 0) {
    return currentPrompt;
  }
  
  // Build conversation history string
  let contextStr = '\n\n[Conversation History]\n';
  
  for (const msg of contextWindow.messages) {
    const timestamp = new Date(msg.timestamp).toLocaleTimeString();
    if (msg.role === 'user') {
      contextStr += `[${timestamp}] User: ${msg.content}\n`;
    } else if (msg.role === 'assistant') {
      contextStr += `[${timestamp}] You: ${msg.content}\n`;
    }
  }
  
  contextStr += `\n[Current Message]\nUser: ${currentPrompt}\n`;
  
  return contextStr;
}

// Summarize old conversations (for future implementation)
function summarizeConversation(messages) {
  // Placeholder for conversation summarization
  // Could use Ollama to generate summaries of old conversations
  const summary = {
    messageCount: messages.length,
    timespan: {
      start: messages[0]?.timestamp,
      end: messages[messages.length - 1]?.timestamp
    },
    topics: [] // Could extract key topics
  };
  
  return summary;
}

// Get context statistics
function getContextStats(sessionId) {
  const history = getConversationHistory(sessionId, 100);
  
  let totalTokens = 0;
  let userMessages = 0;
  let assistantMessages = 0;
  
  for (const msg of history) {
    totalTokens += estimateTokens(msg.content);
    if (msg.role === 'user') userMessages++;
    if (msg.role === 'assistant') assistantMessages++;
  }
  
  return {
    totalMessages: history.length,
    userMessages,
    assistantMessages,
    estimatedTokens: totalTokens,
    timespan: {
      start: history[0]?.timestamp,
      end: history[history.length - 1]?.timestamp
    }
  };
}

// Check if context window is getting too large
function shouldPruneContext(sessionId) {
  const stats = getContextStats(sessionId);
  const maxTokens = config.maxContextTokens || 4000;
  
  return stats.estimatedTokens > maxTokens * 0.8; // Prune at 80% capacity
}

module.exports = {
  estimateTokens,
  buildContextWindow,
  formatContextForPrompt,
  summarizeConversation,
  getContextStats,
  shouldPruneContext
};
