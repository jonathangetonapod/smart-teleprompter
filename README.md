# Smart Teleprompter

AI-powered teleprompter that helps you speak naturally on camera. Highlights phrases as you read, converts notes into conversational scripts, and tracks your voice in real-time.

## Features

### Phrase-Level Highlighting
- Groups your script into 3-5 word **thought phrases** instead of individual words
- Current phrase is bright, upcoming phrases are visible, past text fades out
- Matches how your brain naturally reads aloud (glance and grab)
- Breathing pause markers between paragraphs

### AI Script Converter
- Paste rough notes, bullet points, or outlines
- AI rewrites them in a **conversational, speakable tone** — contractions, short sentences, natural flow
- Powered by Claude (Anthropic)

### Voice-Controlled Scrolling
- **Word Follow Mode**: Tracks your speech and advances phrases as you speak
- **Auto-Scroll Mode**: Scrolls continuously while you speak, stops on silence
- Deepgram Nova-3 for fast speech recognition with Web Speech API fallback

### Mirror Mode
- Horizontal, vertical, or both
- Perfect for teleprompter glass/beam splitter setups

### Customizable
- Font size (24-120px)
- Scroll speed control
- Dark/Light mode
- Manual scroll with buttons, keyboard, or mouse wheel

## Tech Stack

- **Frontend**: Vanilla JS, HTML, CSS
- **Backend**: Node.js + Express
- **Speech Recognition**: Deepgram Nova-3 (with Web Speech API fallback)
- **AI**: Claude Sonnet 4.6 (Anthropic)

## Setup

### Environment Variables

```
DEEPGRAM_API_KEY=your_deepgram_key
ANTHROPIC_API_KEY=your_anthropic_key
```

A fallback Deepgram key is included for testing, but you should use your own for production.

### Local Development

```bash
npm install
npm start
```

Open http://localhost:3000

## How It Works

1. **Paste or convert** your script
2. **Choose your mode** — Word Follow (recommended) or Auto-Scroll
3. **Start speaking** — phrases highlight in real-time as you read
4. The focus zone keeps your eyes on the right phrase while dimming everything else

## Keyboard Shortcuts

| Key | Action |
|-----|--------|
| Space | Pause/Resume |
| Up/Down | Manual scroll |
| Escape | Exit to setup |

## Deployment

[![Deploy on Railway](https://railway.app/button.svg)](https://railway.app)

## Browser Support

Requires Chrome, Edge, or Safari (browsers with microphone access).

---

Built with Claude Code
