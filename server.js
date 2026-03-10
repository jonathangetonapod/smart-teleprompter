const express = require('express');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// API keys
const DEEPGRAM_API_KEY = process.env.DEEPGRAM_API_KEY || 'aae323f183d9722757af4b74b651d3c6e37b23e4';
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || '';

app.use(express.static('public'));
app.use(express.json());

// Endpoint to get API keys for client
app.get('/api/deepgram-key', (req, res) => {
  res.json({ apiKey: DEEPGRAM_API_KEY });
});

app.get('/api/keys', (req, res) => {
  res.json({ deepgram: DEEPGRAM_API_KEY });
});

// Endpoint to convert text to teleprompter script using Claude
app.post('/api/convert-script', async (req, res) => {
  const { text } = req.body;
  
  if (!text) {
    return res.status(400).json({ error: 'No text provided' });
  }
  
  if (!ANTHROPIC_API_KEY) {
    return res.status(500).json({ error: 'Anthropic API key not configured' });
  }
  
  try {
    console.log('Calling Anthropic API...');
    console.log('API Key present:', !!ANTHROPIC_API_KEY);
    
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 4096,
        messages: [{
          role: 'user',
          content: `You are a teleprompter script writer. Convert the following notes into a script optimized for reading aloud on camera.

CRITICAL RULES — follow every single one:
- Write like you TALK, not like you write. Use contractions (I'm, you're, we'll, don't, can't, it's).
- Short sentences. Max 12 words per sentence. One idea per sentence.
- Use fragments when natural. "Pretty cool, right?" "Here's the thing." "Quick example."
- Start sentences with "So", "Now", "Look", "Here's the thing" — conversational starters.
- Add rhetorical questions to break up long stretches: "Sound familiar?" "Make sense?"
- Break paragraphs often. Every 2-3 sentences, start a new paragraph.
- Put a blank line between paragraphs (these become breathing pauses).
- Write the hook (first 2 sentences) and CTA (last 2 sentences) word-for-word and punchy.
- NO stage directions, NO [pause], NO (emphasis), NO markdown formatting.
- NO bullet points, NO headers, NO numbered lists.
- Just clean spoken text, paragraph by paragraph.

Content to convert:
${text}`
        }]
      })
    });
    
    const data = await response.json();
    console.log('Anthropic response status:', response.status);
    console.log('Anthropic response:', JSON.stringify(data).slice(0, 500));
    
    if (data.content && data.content[0]) {
      res.json({ script: data.content[0].text });
    } else if (data.error) {
      res.status(500).json({ error: data.error.message || 'API error', details: data });
    } else {
      res.status(500).json({ error: 'Failed to generate script', details: data });
    }
  } catch (error) {
    console.error('Error calling Claude:', error);
    res.status(500).json({ error: 'Failed to convert script: ' + error.message });
  }
});

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`🎬 Smart Teleprompter running on port ${PORT}`);
});
