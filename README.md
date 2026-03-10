# 🎬 Smart Teleprompter

AI-powered teleprompter that follows along as you speak and converts your notes into camera-ready scripts.

## Features

### 🤖 AI Script Converter
- Paste rough notes, bullet points, or outlines
- AI converts them into natural, easy-to-read teleprompter scripts
- Powered by Claude (Anthropic)

### 🎯 Voice-Controlled Scrolling
- Uses Deepgram for fast, accurate speech recognition (~200ms latency)
- **Word Follow Mode**: Highlights and follows your exact words
- **Auto-Scroll Mode**: Scrolls continuously while you speak

### 🪞 Mirror Mode
- Horizontal, vertical, or both
- Perfect for teleprompter glass/beam splitter setups

### ⚙️ Customizable
- Adjustable font size (24-120px)
- Scroll speed control
- Dark/Light mode
- Manual scroll with buttons, keyboard, or mouse wheel

## Tech Stack

- **Frontend**: Vanilla JS, HTML, CSS
- **Backend**: Node.js + Express
- **Speech Recognition**: Deepgram Nova-2
- **AI**: Claude 3.5 Sonnet (Anthropic)

## Setup

### Environment Variables

```
DEEPGRAM_API_KEY=your_deepgram_key
ANTHROPIC_API_KEY=your_anthropic_key
```

### Local Development

```bash
npm install
npm start
```

Open http://localhost:3000

## Keyboard Shortcuts

| Key | Action |
|-----|--------|
| Space | Pause/Resume |
| ↑/↓ | Manual scroll |
| Escape | Exit to setup |

## Deployment

[![Deploy on Railway](https://railway.app/button.svg)](https://railway.app)

## Browser Support

Requires Chrome, Edge, or Safari (browsers with microphone access).

---

Built with 🦾 by Iron Man
