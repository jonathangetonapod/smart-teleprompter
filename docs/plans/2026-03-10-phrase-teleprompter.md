# Phrase-Level Teleprompter Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Transform word-by-word highlighting into phrase-level "glance and grab" display with focus zone dimming and a better AI script converter — making it feel like a professional teleprompter that helps you speak naturally.

**Architecture:** Replace word-level rendering/highlighting with phrase groups (3-5 words at natural boundaries). Add CSS focus zone that dims past/future text so only the current area is bright. Upgrade the Claude prompt to write conversational, ear-friendly scripts. All changes are in the existing 4 files (app.js, style.css, index.html, server.js).

**Tech Stack:** Vanilla JS, CSS, Express, Claude API

---

### Task 1: Phrase-level parsing

**Files:**
- Modify: `public/app.js` — `parseScript()` method (line 372-379)

**Step 1: Replace `parseScript` with phrase-aware version**

Replace the `parseScript` method with one that groups words into phrases:

```javascript
parseScript(text) {
  // Split into lines first (preserves paragraph breaks for pause markers)
  const lines = text.split(/\n+/);
  this.words = [];
  this.phrases = [];
  this.pauseAfterPhrase = new Set(); // phrase indices that have a breathing pause after them

  let wordIndex = 0;
  let phraseIndex = 0;

  for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
    const line = lines[lineIdx].trim();
    if (!line) {
      // Blank line = breathing pause after previous phrase
      if (phraseIndex > 0) {
        this.pauseAfterPhrase.add(phraseIndex - 1);
      }
      continue;
    }

    const lineWords = line.split(/\s+/).filter(w => w.length > 0);
    let phraseWords = [];

    for (let i = 0; i < lineWords.length; i++) {
      const word = lineWords[i];
      const wordObj = {
        original: word,
        normalized: this.normalizeWord(word),
        index: wordIndex,
        phraseIndex: phraseIndex
      };
      this.words.push(wordObj);
      phraseWords.push(wordObj);
      wordIndex++;

      // Check if this is a phrase boundary
      const endsWithPunctuation = /[.!?;:,]$/.test(word);
      const nextIsConjunction = i + 1 < lineWords.length &&
        /^(and|but|so|because|when|if|then|now|also|however|or|yet|still|next|first|finally|actually|honestly|basically|look|see|think|remember)$/i
          .test(lineWords[i + 1]);
      const atMaxLength = phraseWords.length >= 5;
      const atMinLength = phraseWords.length >= 3;

      if (phraseWords.length > 0 && (
        (endsWithPunctuation && atMinLength) ||
        (nextIsConjunction && atMinLength) ||
        atMaxLength ||
        i === lineWords.length - 1 // end of line
      )) {
        this.phrases.push({
          words: [...phraseWords],
          index: phraseIndex,
          startWordIndex: phraseWords[0].index,
          endWordIndex: phraseWords[phraseWords.length - 1].index
        });
        phraseIndex++;
        phraseWords = [];
      }
    }

    // Flush any remaining words as a phrase
    if (phraseWords.length > 0) {
      this.phrases.push({
        words: [...phraseWords],
        index: phraseIndex,
        startWordIndex: phraseWords[0].index,
        endWordIndex: phraseWords[phraseWords.length - 1].index
      });
      phraseIndex++;
      phraseWords = [];
    }
  }

  this.currentWordIndex = 0;
  this.currentPhraseIndex = 0;
}
```

**Step 2: Add `currentPhraseIndex` to constructor**

In the constructor (line 3-28), add after `this.lastSTTIndex = 0;`:

```javascript
this.currentPhraseIndex = 0;
```

**Step 3: Add helper to find phrase from word index**

Add this method after `normalizeWord`:

```javascript
phraseIndexForWord(wordIndex) {
  for (let i = 0; i < this.phrases.length; i++) {
    if (wordIndex >= this.phrases[i].startWordIndex && wordIndex <= this.phrases[i].endWordIndex) {
      return i;
    }
  }
  return this.phrases.length - 1;
}
```

**Step 4: Verify parsing works**

Open browser console, run:
```javascript
teleprompter.parseScript("Hello everyone, welcome to my channel. Today we are going to talk about something really cool. And I think you're going to love it.");
console.log(teleprompter.phrases.map(p => p.words.map(w => w.original).join(' ')));
```

Expected: Array of 3-5 word phrase strings, broken at commas, periods, and conjunctions.

---

### Task 2: Phrase-level rendering with pause markers

**Files:**
- Modify: `public/app.js` — `renderScript()` method (line 385-394)

**Step 1: Replace `renderScript` with phrase-based rendering**

```javascript
renderScript() {
  const container = document.getElementById('script-text');
  let html = '';

  for (let p = 0; p < this.phrases.length; p++) {
    const phrase = this.phrases[p];
    const phraseClass = p === 0 ? 'phrase current-phrase' : 'phrase';
    html += `<span class="${phraseClass}" data-phrase="${p}">`;
    for (const word of phrase.words) {
      html += `<span class="word" data-index="${word.index}">${word.original} </span>`;
    }
    html += '</span>';

    // Insert pause marker after phrase if it's a breathing point
    if (this.pauseAfterPhrase.has(p)) {
      html += '<span class="pause-marker" aria-hidden="true"></span>';
    }
  }

  container.innerHTML = html;
  container.style.fontSize = `${this.fontSize}px`;

  // Cache elements
  this._wordElements = container.querySelectorAll('.word');
  this._phraseElements = container.querySelectorAll('.phrase');
  this._prevHighlightIndex = 0;
  this._prevPhraseIndex = 0;
}
```

**Step 2: Verify rendering**

Hard refresh browser. Enter a multi-paragraph script. Click Start. Confirm the DOM has `<span class="phrase">` wrappers around word groups, and `<span class="pause-marker">` between paragraphs.

---

### Task 3: Focus zone CSS

**Files:**
- Modify: `public/style.css` — teleprompter word/phrase styles (lines 171-203)

**Step 1: Replace word styles with phrase-level focus zone**

Replace the `.word` and focus-line styles (lines 171-203) with:

```css
/* Phrase-level display */
#script-text .phrase {
  display: inline;
  padding: 4px 2px;
  border-radius: 6px;
  transition: opacity 0.3s ease, background 0.3s ease;
  opacity: 0.25; /* default: far future, dimmed */
}

#script-text .phrase.spoken-phrase {
  opacity: 0.15; /* past phrases fade out more */
}

#script-text .phrase.current-phrase {
  opacity: 1;
  background: rgba(102, 126, 234, 0.15);
  border-radius: 8px;
}

#script-text .phrase.near-phrase {
  opacity: 0.7; /* 1-2 phrases ahead — visible but not distracting */
}

#script-text .phrase .word {
  display: inline;
  padding: 2px 4px;
  border-radius: 4px;
}

/* Current phrase words are all bright white */
#script-text .phrase.current-phrase .word {
  color: #fff;
}

body.light-mode #script-text .phrase.current-phrase .word {
  color: #111;
}

/* Pause marker — breathing point between paragraphs */
.pause-marker {
  display: block;
  height: 40px;
  position: relative;
}

.pause-marker::after {
  content: '';
  position: absolute;
  top: 50%;
  left: 30%;
  right: 30%;
  height: 2px;
  background: linear-gradient(90deg, transparent, rgba(102, 126, 234, 0.3), transparent);
}

/* Focus line */
#script-container::before {
  content: '';
  position: absolute;
  top: 30%;
  left: 0;
  right: 0;
  height: 3px;
  background: linear-gradient(90deg, transparent, rgba(102, 126, 234, 0.5), transparent);
  pointer-events: none;
  z-index: 10;
}
```

**Step 2: Remove old `.word.spoken`, `.word.current`, `.word.upcoming` rules**

Delete these CSS rules entirely (they're replaced by phrase-level styles):
- `#script-text .word.spoken`
- `#script-text .word.current`
- `#script-text .word.upcoming`

---

### Task 4: Phrase-level highlighting

**Files:**
- Modify: `public/app.js` — `highlightWord()` method (line 396-413)

**Step 1: Replace `highlightWord` with `highlightPhrase`**

```javascript
highlightPhrase(phraseIndex) {
  if (phraseIndex === this._prevPhraseIndex || !this._phraseElements) return;
  if (phraseIndex < 0 || phraseIndex >= this._phraseElements.length) return;

  // Update all phrase classes efficiently — only touch changed elements
  const prev = this._prevPhraseIndex ?? 0;
  const nearRange = 2; // how many phrases ahead are "near"

  // Clear old state
  const minChanged = Math.min(prev, phraseIndex);
  const maxChanged = Math.max(prev, phraseIndex) + nearRange + 1;

  for (let i = Math.max(0, minChanged - nearRange); i < Math.min(this._phraseElements.length, maxChanged + nearRange + 1); i++) {
    let cls = 'phrase';
    if (i < phraseIndex) {
      cls = 'phrase spoken-phrase';
    } else if (i === phraseIndex) {
      cls = 'phrase current-phrase';
    } else if (i <= phraseIndex + nearRange) {
      cls = 'phrase near-phrase';
    }
    this._phraseElements[i].className = cls;
  }

  this._prevPhraseIndex = phraseIndex;
}
```

**Step 2: Update all calls from `highlightWord` to phrase-based**

Replace the old `highlightWord(index)` method entirely. Keep the name but change the internals:

```javascript
highlightWord(wordIndex) {
  const phraseIndex = this.phraseIndexForWord(wordIndex);
  this.highlightPhrase(phraseIndex);
}
```

This way all existing callers (predictiveAdvance, scrollToWord, etc.) still work without changes.

**Step 3: Verify highlighting**

Hard refresh. Start teleprompter. Speak. Confirm:
- Current phrase is bright with subtle background
- 1-2 phrases ahead are partially visible
- Past phrases are very dim
- Far future phrases are dim

---

### Task 5: Update predictive advance for phrase pacing

**Files:**
- Modify: `public/app.js` — `startPredictiveAdvance()` method (line 232-257)

**Step 1: Replace predictive advance with phrase-aware version**

```javascript
startPredictiveAdvance() {
  if (this.predictiveInterval || this.isPaused) return;
  this.isSpeaking = true;

  // Advance by phrase — timing based on word count in current phrase
  const advancePhrase = () => {
    if (!this.isSpeaking || this.isPaused) return;

    const currentPhrase = this.phrases[this.currentPhraseIndex];
    if (!currentPhrase) return;

    // Move to next phrase
    const nextPhraseIndex = this.currentPhraseIndex + 1;
    if (nextPhraseIndex < this.phrases.length) {
      const nextPhrase = this.phrases[nextPhraseIndex];
      this.currentPhraseIndex = nextPhraseIndex;
      this.currentWordIndex = nextPhrase.endWordIndex;
      this.highlightPhrase(nextPhraseIndex);

      // In word-follow mode, scroll to keep the phrase visible
      if (!this.autoScrollMode) {
        const el = this._phraseElements?.[nextPhraseIndex];
        if (el) {
          const container = document.getElementById('script-container');
          const containerRect = container.getBoundingClientRect();
          const targetY = containerRect.height * 0.3;
          const phraseRect = el.getBoundingClientRect();
          const phraseOffset = phraseRect.top - containerRect.top;
          this.currentScrollY -= (phraseOffset - targetY);
          this.applyScroll(true);
        }
      }

      // Schedule next advance — timing proportional to phrase word count
      const wordsInNextPhrase = nextPhrase.words.length;
      const msForPhrase = (wordsInNextPhrase / this.wordsPerSecond) * 1000;

      // Check if there's a pause marker after this phrase
      const pauseTime = this.pauseAfterPhrase.has(nextPhraseIndex) ? 800 : 0;

      this.predictiveInterval = setTimeout(advancePhrase, msForPhrase + pauseTime);
    }
  };

  // Start first advance based on current phrase's word count
  const currentPhrase = this.phrases[this.currentPhraseIndex];
  const wordsInPhrase = currentPhrase ? currentPhrase.words.length : 3;
  const msForPhrase = (wordsInPhrase / this.wordsPerSecond) * 1000;
  this.predictiveInterval = setTimeout(advancePhrase, msForPhrase);
}
```

**Step 2: Update `stopPredictiveAdvance` for setTimeout**

```javascript
stopPredictiveAdvance() {
  this.isSpeaking = false;
  if (this.predictiveInterval) {
    clearTimeout(this.predictiveInterval);
    this.predictiveInterval = null;
  }
}
```

---

### Task 6: Update scrollToWord for phrase awareness

**Files:**
- Modify: `public/app.js` — `scrollToWord()` method (line 523-547)

**Step 1: Replace scrollToWord**

```javascript
scrollToWord(index) {
  if (index < this.currentWordIndex - 10) return;
  if (index === this.currentWordIndex) return;

  this.lastSTTIndex = index;
  this.currentWordIndex = index;

  // Update phrase tracking
  const newPhraseIndex = this.phraseIndexForWord(index);
  this.currentPhraseIndex = newPhraseIndex;
  this.highlightPhrase(newPhraseIndex);

  // In word-follow mode, scroll to the phrase
  if (!this.autoScrollMode) {
    const el = this._phraseElements?.[newPhraseIndex];
    if (el) {
      const container = document.getElementById('script-container');
      const containerRect = container.getBoundingClientRect();
      const targetY = containerRect.height * 0.3;
      const phraseRect = el.getBoundingClientRect();
      const phraseOffset = phraseRect.top - containerRect.top;

      this.currentScrollY -= (phraseOffset - targetY);
      this.applyScroll();
    }
  }
}
```

---

### Task 7: Update reset and exit for phrase state

**Files:**
- Modify: `public/app.js` — `reset()` (line 571) and constructor

**Step 1: Update reset**

```javascript
reset() {
  this.currentWordIndex = 0;
  this.currentScrollY = 0;
  this.lastSTTIndex = 0;
  this.currentPhraseIndex = 0;
  this._wordElements = null;
  this._phraseElements = null;
  this._prevHighlightIndex = -1;
  this._prevPhraseIndex = -1;
  this.stopPredictiveAdvance();
  this.renderScript();
  this.applyScroll();
  this.stopAutoScroll();
}
```

---

### Task 8: Upgrade AI script converter

**Files:**
- Modify: `server.js` — Claude prompt in `/api/convert-script` (lines 49-64)

**Step 1: Replace the Claude prompt**

Replace the content string in the messages array:

```javascript
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
```

**Step 2: Verify conversion**

Paste bullet points into the textarea. Click "Convert to Script". Confirm the output is:
- Short sentences with contractions
- Paragraph breaks (blank lines) between thoughts
- Conversational tone, not formal

---

### Task 9: Final cleanup and commit

**Step 1: Remove dead code**

- Remove the old `highlightWord` method body (replaced by the wrapper that calls `highlightPhrase`)
- Remove any remaining references to `this.sttProvider` or ElevenLabs in comments

**Step 2: Test full flow**

1. Open http://localhost:3000
2. Paste a script or use AI convert
3. Set Word Follow mode
4. Start teleprompter
5. Speak — confirm phrases highlight as groups, focus zone dims past/future, pause markers show between paragraphs
6. Confirm predictive advance moves by phrase
7. Confirm STT corrections snap to correct phrase

**Step 3: Commit**

```bash
git add public/app.js public/style.css public/index.html server.js
git commit -m "feat: phrase-level teleprompter with focus zone and better AI scripts

- Group words into 3-5 word thought phrases at natural boundaries
- Highlight entire phrases instead of individual words (glance-and-grab)
- Focus zone: current phrase bright, past fades, future dimmed
- Pause markers between paragraphs for breathing cues
- Predictive advance moves by phrase with timing proportional to length
- Upgraded AI prompt: conversational tone, contractions, short sentences"
```
