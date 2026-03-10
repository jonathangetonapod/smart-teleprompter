const express = require('express');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// API keys
const DEEPGRAM_API_KEY = process.env.DEEPGRAM_API_KEY || 'aae323f183d9722757af4b74b651d3c6e37b23e4';
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || '';
const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY || '';

app.use(express.static('public'));
app.use(express.json());

// Endpoint to get API keys for client
app.get('/api/deepgram-key', (req, res) => {
  res.json({ apiKey: DEEPGRAM_API_KEY });
});

app.get('/api/elevenlabs-key', (req, res) => {
  res.json({ apiKey: ELEVENLABS_API_KEY });
});

// Get ElevenLabs single-use token for WebSocket auth
app.get('/api/elevenlabs-token', async (req, res) => {
  if (!ELEVENLABS_API_KEY) {
    return res.status(500).json({ error: 'No ElevenLabs API key configured' });
  }
  
  try {
    const response = await fetch('https://api.elevenlabs.io/v1/speech-to-text/token', {
      method: 'POST',
      headers: {
        'xi-api-key': ELEVENLABS_API_KEY,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        max_duration_secs: 3600  // 1 hour token
      })
    });
    
    const data = await response.json();
    console.log('ElevenLabs token response:', data);
    
    if (data.token) {
      res.json({ token: data.token });
    } else {
      res.status(500).json({ error: 'Failed to get token', details: data });
    }
  } catch (error) {
    console.error('Error getting ElevenLabs token:', error);
    res.status(500).json({ error: 'Failed to get token: ' + error.message });
  }
});

app.get('/api/keys', (req, res) => {
  res.json({ 
    deepgram: DEEPGRAM_API_KEY,
    elevenlabs: ELEVENLABS_API_KEY 
  });
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
          content: `Convert the following notes/content into a clean, natural teleprompter script for someone recording a video. 

Rules:
- Write in a conversational, natural speaking tone
- Break into short, easy-to-read sentences
- Remove bullet points, formatting, headers
- Add natural transitions between ideas
- Keep the same meaning and key points
- Make it flow smoothly when read aloud
- Don't add [pause] or stage directions
- Just output the clean script text, nothing else

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
