const express = require('express');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Deepgram API key (from environment or hardcoded for now)
const DEEPGRAM_API_KEY = process.env.DEEPGRAM_API_KEY || 'aae323f183d9722757af4b74b651d3c6e37b23e4';

app.use(express.static('public'));

// Endpoint to get Deepgram key for client
app.get('/api/deepgram-key', (req, res) => {
  res.json({ apiKey: DEEPGRAM_API_KEY });
});

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`🎬 Smart Teleprompter running on port ${PORT}`);
});
