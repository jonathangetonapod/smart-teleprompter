# 🎬 Smart Teleprompter

A voice-controlled teleprompter that listens to your microphone and automatically scrolls to follow along as you speak.

## Features

- **Voice-controlled scrolling** - Uses Web Speech API to recognize your voice and automatically scroll
- **Fuzzy matching** - Handles mispronunciations and variations
- **Mirror mode** - Flip the text for teleprompter glass reflection
- **Adjustable font size** - From 24px to 120px
- **Dark/Light mode** - Easy on the eyes
- **Keyboard shortcuts**:
  - `Space` - Pause/Resume
  - `↑/↓` - Manual scroll adjustment
  - `Escape` - Exit to setup

## Usage

1. Paste your script
2. Adjust font size and settings
3. Click "Start Teleprompter"
4. Allow microphone access
5. Start speaking - the teleprompter follows along!

## Tech Stack

- Node.js + Express (server)
- Web Speech API (speech recognition)
- Vanilla JS (no frameworks)

## Deployment

[![Deploy on Railway](https://railway.app/button.svg)](https://railway.app/template)

## Local Development

```bash
npm install
npm start
```

Open http://localhost:3000

## Browser Support

Requires Chrome, Edge, or Safari (browsers with Web Speech API support).
