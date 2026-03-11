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

Detect the language of the input. Follow ALL rules below:

GENERAL RULES:
- Write like you TALK, not like you write.
- Short sentences. Max 12 words per sentence. One idea per sentence.
- Use fragments when natural.
- Break paragraphs often. Every 2-3 sentences, start a new paragraph.
- Put a blank line between paragraphs (these become breathing pauses).
- Write the hook (first 2 sentences) and CTA (last 2 sentences) word-for-word and punchy.
- NO stage directions, NO [pause], NO (emphasis), NO markdown formatting.
- NO bullet points, NO headers, NO numbered lists.
- Just clean spoken text, paragraph by paragraph.

IF THE INPUT IS IN SPANISH (or mostly Spanish):
- Keep the output in Spanish.
- Replace difficult, formal, or literary words with simple everyday alternatives.
- Use common spoken Spanish, not written/academic Spanish.
- Examples: "implementar" → "hacer", "adquirir" → "conseguir", "posteriormente" → "después", "mediante" → "con", "sin embargo" → "pero", "debido a" → "por", "realizar" → "hacer", "establecer" → "poner", "fundamental" → "clave" or "importante", "actualmente" → "hoy en día" or "ahora".
- Avoid subjunctive when possible — use simpler verb forms.
- Use "tú" style (informal), not "usted" — unless the content is clearly formal.
- Add conversational starters: "Mira", "Bueno", "O sea", "La verdad es que", "Fíjate que".
- Add rhetorical questions: "¿Me explico?", "¿Verdad?", "¿Tiene sentido?".

IF THE INPUT IS IN ENGLISH:
- Keep the output in English.
- Use contractions (I'm, you're, we'll, don't, can't, it's).
- Use conversational starters: "So", "Now", "Look", "Here's the thing".
- Add rhetorical questions: "Sound familiar?", "Make sense?".

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
