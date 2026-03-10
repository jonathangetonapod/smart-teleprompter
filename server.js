const express = require('express');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// API keys
const DEEPGRAM_API_KEY = process.env.DEEPGRAM_API_KEY || 'aae323f183d9722757af4b74b651d3c6e37b23e4';
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || '';

app.use(express.static('public'));
app.use(express.json());

// Endpoint to get Deepgram key for client
app.get('/api/deepgram-key', (req, res) => {
  res.json({ apiKey: DEEPGRAM_API_KEY });
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
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-3-5-sonnet-20241022',
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
    
    if (data.content && data.content[0]) {
      res.json({ script: data.content[0].text });
    } else {
      res.status(500).json({ error: 'Failed to generate script', details: data });
    }
  } catch (error) {
    console.error('Error calling Claude:', error);
    res.status(500).json({ error: 'Failed to convert script' });
  }
});

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`🎬 Smart Teleprompter running on port ${PORT}`);
});
