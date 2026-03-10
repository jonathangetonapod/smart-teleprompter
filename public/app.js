// Smart Teleprompter - Voice-controlled scrolling with Deepgram or ElevenLabs
class SmartTeleprompter {
  constructor() {
    this.words = [];
    this.currentWordIndex = 0;
    this.isListening = false;
    this.isPaused = false;
    this.fontSize = 48;
    this.scrollSpeed = 50;
    this.autoScrollMode = true;
    this.isScrolling = false;
    this.scrollInterval = null;
    this.currentScrollY = 0;
    this.sttSocket = null;  // Generic socket for either provider
    this.audioStream = null;
    this.lastSpeechTime = 0;
    this.silenceTimeout = null;
    this.sttProvider = 'deepgram';  // 'deepgram' or 'elevenlabs'
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 3;

    // Predictive word advance — highlights words immediately based on speaking pace
    this.predictiveInterval = null;
    this.isSpeaking = false;
    this.wordsPerSecond = 2.8; // ~170 wpm average speaking rate
    this.lastSTTIndex = 0;     // last position confirmed by STT
    this.currentPhraseIndex = 0;
    this.phrases = [];
    this.pauseAfterPhrase = new Set();

    this.init();
  }
  
  init() {
    this.setupEventListeners();
  }
  
  setupEventListeners() {
    // Setup panel
    document.getElementById('start-btn').addEventListener('click', () => this.start());
    document.getElementById('convert-btn').addEventListener('click', () => this.convertToScript());
    document.getElementById('font-size').addEventListener('input', (e) => this.updateFontSize(e.target.value));
    document.getElementById('scroll-speed').addEventListener('input', (e) => {
      this.scrollSpeed = parseInt(e.target.value);
      document.getElementById('scroll-speed-value').textContent = e.target.value;
    });
    document.getElementById('mirror-mode').addEventListener('change', (e) => this.setMirrorMode(e.target.value));
    document.getElementById('dark-mode').addEventListener('change', (e) => this.toggleDarkMode(e.target.checked));
    document.getElementById('scroll-mode').addEventListener('change', (e) => {
      this.autoScrollMode = e.target.value === 'auto-scroll';
    });
    
    // Teleprompter controls
    document.getElementById('pause-btn').addEventListener('click', () => this.togglePause());
    document.getElementById('reset-btn').addEventListener('click', () => this.reset());
    document.getElementById('exit-btn').addEventListener('click', () => this.exit());
    document.getElementById('mirror-mode-live').addEventListener('change', (e) => this.setMirrorMode(e.target.value));
    document.getElementById('scroll-up-btn').addEventListener('click', () => this.manualScroll(-100));
    document.getElementById('scroll-down-btn').addEventListener('click', () => this.manualScroll(100));
    
    // Mouse wheel scroll
    document.getElementById('script-container')?.addEventListener('wheel', (e) => {
      e.preventDefault();
      this.manualScroll(e.deltaY > 0 ? 50 : -50);
    });
    
    // Keyboard shortcuts
    document.addEventListener('keydown', (e) => {
      if (document.getElementById('teleprompter').classList.contains('hidden')) return;
      
      switch(e.key) {
        case ' ':
          e.preventDefault();
          this.togglePause();
          break;
        case 'ArrowUp':
          e.preventDefault();
          this.manualScroll(-100);
          break;
        case 'ArrowDown':
          e.preventDefault();
          this.manualScroll(100);
          break;
        case 'Escape':
          this.exit();
          break;
      }
    });
  }
  
  async setupSTT() {
    console.log('Setting up Deepgram STT');
    await this.setupDeepgram();
  }
  
  async setupDeepgram() {
    try {
      // Get API key from server
      const response = await fetch('/api/deepgram-key');
      const { apiKey } = await response.json();
      
      // Get microphone access
      this.audioStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      
      // Get selected language
      const language = document.getElementById('language')?.value || 'en';
      
      // Connect to Deepgram WebSocket (Nova-3, optimized for low latency)
      this.sttSocket = new WebSocket(
        `wss://api.deepgram.com/v1/listen?model=nova-3&language=${language}&interim_results=true&endpointing=150&no_delay=true&encoding=linear16&sample_rate=16000`,
        ['token', apiKey]
      );
      
      this.sttSocket.onopen = () => {
        console.log('Deepgram connected');
        this.reconnectAttempts = 0;
        document.getElementById('mic-status').textContent = '🎤 Deepgram Nova-3 Connected';
        this.startRecording();
      };
      
      this.sttSocket.onmessage = (event) => {
        if (this.isPaused) return;
        
        const data = JSON.parse(event.data);
        console.log('Deepgram message:', data.type || 'transcript', data);
        
        // Handle speech detection
        if (data.type === 'SpeechStarted') {
          this.onSpeechStart();
        }
        
        // Handle transcription
        if (data.channel?.alternatives?.[0]?.transcript) {
          const transcript = data.channel.alternatives[0].transcript;
          if (transcript.trim()) {
            console.log('Heard:', transcript);
            document.getElementById('transcript').textContent = transcript;
            this.onSpeechDetected();
            
            // Always try to match words (for highlighting), scroll based on mode
            this.matchAndScroll(transcript);
          }
        }
      };
      
      this.sttSocket.onerror = (error) => {
        console.error('Deepgram error:', error);
        document.getElementById('mic-status').textContent = '⚠️ Deepgram Error - Using Fallback';
        this.fallbackToWebSpeech();
      };
      
      this.sttSocket.onclose = (event) => {
        console.log('Deepgram disconnected', event.code, event.reason);
        if (this.isListening && !this.isPaused && event.code !== 1000) {
          this.reconnectAttempts++;
          if (this.reconnectAttempts <= this.maxReconnectAttempts) {
            console.log(`Reconnecting Deepgram (${this.reconnectAttempts}/${this.maxReconnectAttempts})...`);
            setTimeout(() => this.setupDeepgram(), 2000);
          } else {
            console.log('Deepgram reconnect limit reached, falling back to Web Speech');
            this.fallbackToWebSpeech();
          }
        }
      };
      
    } catch (error) {
      console.error('Failed to setup Deepgram:', error);
      this.fallbackToWebSpeech();
    }
  }
  
  startRecording() {
    try {
      const audioContext = new AudioContext({ sampleRate: 16000 });
      const source = audioContext.createMediaStreamSource(this.audioStream);
      // Minimal buffer for lowest latency (512 = 32ms at 16kHz)
      const processor = audioContext.createScriptProcessor(512, 1, 1);
      
      let audioSent = 0;
      
      processor.onaudioprocess = (e) => {
        if (this.sttSocket?.readyState === WebSocket.OPEN && !this.isPaused) {
          const inputData = e.inputBuffer.getChannelData(0);
          const pcmData = new Int16Array(inputData.length);
          for (let i = 0; i < inputData.length; i++) {
            pcmData[i] = Math.max(-32768, Math.min(32767, inputData[i] * 32768));
          }
          this.sttSocket.send(pcmData.buffer);
          audioSent++;
          if (audioSent % 100 === 0) {
            console.log(`Audio chunks sent: ${audioSent}`);
          }
        }
      };
      
      source.connect(processor);
      processor.connect(audioContext.destination);
      this.audioContext = audioContext;
      this.processor = processor;
      console.log('Deepgram audio recording started (1024 buffer)');
    } catch (error) {
      console.error('Error starting recording:', error);
    }
  }
  
  onSpeechStart() {
    if (this.autoScrollMode && !this.isScrolling && !this.isPaused) {
      this.startAutoScroll();
    }
    this.startPredictiveAdvance();
  }

  onSpeechDetected() {
    this.lastSpeechTime = Date.now();

    if (this.autoScrollMode && !this.isScrolling && !this.isPaused) {
      this.startAutoScroll();
    }
    this.startPredictiveAdvance();

    // Clear existing silence timeout
    if (this.silenceTimeout) {
      clearTimeout(this.silenceTimeout);
    }

    // Stop after 1.5 seconds of silence
    this.silenceTimeout = setTimeout(() => {
      if (this.autoScrollMode && this.isScrolling) {
        this.stopAutoScroll();
      }
      this.stopPredictiveAdvance();
    }, 1500);
  }

  startPredictiveAdvance() {
    if (this.predictiveInterval || this.isPaused) return;
    this.isSpeaking = true;

    const advancePhrase = () => {
      if (!this.isSpeaking || this.isPaused) return;

      const currentPhrase = this.phrases[this.currentPhraseIndex];
      if (!currentPhrase) return;

      const nextPhraseIndex = this.currentPhraseIndex + 1;
      if (nextPhraseIndex < this.phrases.length) {
        const nextPhrase = this.phrases[nextPhraseIndex];
        this.currentPhraseIndex = nextPhraseIndex;
        this.currentWordIndex = nextPhrase.endWordIndex;
        this.highlightPhrase(nextPhraseIndex);

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

        const wordsInNextPhrase = nextPhrase.words.length;
        const msForPhrase = (wordsInNextPhrase / this.wordsPerSecond) * 1000;
        const pauseTime = this.pauseAfterPhrase.has(nextPhraseIndex) ? 800 : 0;
        this.predictiveInterval = setTimeout(advancePhrase, msForPhrase + pauseTime);
      }
    };

    const currentPhrase = this.phrases[this.currentPhraseIndex];
    const wordsInPhrase = currentPhrase ? currentPhrase.words.length : 3;
    const msForPhrase = (wordsInPhrase / this.wordsPerSecond) * 1000;
    this.predictiveInterval = setTimeout(advancePhrase, msForPhrase);
  }

  stopPredictiveAdvance() {
    this.isSpeaking = false;
    if (this.predictiveInterval) {
      clearTimeout(this.predictiveInterval);
      this.predictiveInterval = null;
    }
  }
  
  startAutoScroll() {
    if (this.isScrolling) return;
    this.isScrolling = true;
    document.getElementById('mic-status').textContent = '🎤 Scrolling...';
    document.getElementById('mic-status').className = 'listening';
    
    this.scrollInterval = setInterval(() => {
      this.currentScrollY -= this.scrollSpeed / 30; // pixels per frame at ~30fps
      this.applyScroll();
    }, 33);
  }
  
  stopAutoScroll() {
    if (!this.isScrolling) return;
    this.isScrolling = false;
    document.getElementById('mic-status').textContent = '🎤 Listening...';
    
    if (this.scrollInterval) {
      clearInterval(this.scrollInterval);
      this.scrollInterval = null;
    }
  }
  
  applyScroll(smooth = false) {
    const scriptText = document.getElementById('script-text');
    const mirrorMode = document.getElementById('mirror-mode-live')?.value || 'none';
    let mirrorTransform = '';
    if (mirrorMode === 'horizontal') mirrorTransform = 'scaleX(-1)';
    else if (mirrorMode === 'vertical') mirrorTransform = 'scaleY(-1)';
    else if (mirrorMode === 'both') mirrorTransform = 'scale(-1, -1)';
    
    scriptText.style.transition = smooth ? 'transform 100ms linear' : 'none';
    scriptText.style.transform = `translateY(${this.currentScrollY}px) ${mirrorTransform}`.trim();
  }
  
  fallbackToWebSpeech() {
    console.log('Falling back to Web Speech API');
    document.getElementById('mic-status').textContent = '🎤 Web Speech (Fallback)';
    
    if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
      alert('Speech recognition not supported. Please use Chrome or Edge.');
      return;
    }
    
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    this.recognition = new SpeechRecognition();
    this.recognition.continuous = true;
    this.recognition.interimResults = true;
    this.recognition.lang = 'en-US';
    
    this.recognition.onresult = (event) => {
      if (this.isPaused) return;
      
      let transcript = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        transcript += event.results[i][0].transcript;
      }
      
      document.getElementById('transcript').textContent = transcript;
      this.onSpeechDetected();
      this.matchAndScroll(transcript);
    };
    
    this.recognition.onend = () => {
      if (this.isListening && !this.isPaused) {
        this.recognition.start();
      }
    };
    
    this.recognition.onerror = (event) => {
      console.error('Speech recognition error:', event.error);
      if (event.error === 'no-speech' && this.isListening && !this.isPaused) {
        this.recognition.start();
      }
    };
    
    this.recognition.start();
  }
  
  async start() {
    const scriptText = document.getElementById('script-input').value.trim();
    if (!scriptText) {
      alert('Please enter a script first!');
      return;
    }
    
    this.parseScript(scriptText);
    this.renderScript();
    this.currentScrollY = 0;
    
    document.getElementById('setup-panel').classList.add('hidden');
    document.getElementById('teleprompter').classList.remove('hidden');
    
    // Sync settings
    const mirrorMode = document.getElementById('mirror-mode').value;
    document.getElementById('mirror-mode-live').value = mirrorMode;
    this.setMirrorMode(mirrorMode);
    this.autoScrollMode = document.getElementById('scroll-mode').value === 'auto-scroll';
    
    this.isListening = true;
    document.getElementById('mic-status').textContent = '🎤 Connecting...';
    
    await this.setupSTT();
  }
  
  parseScript(text) {
    const lines = text.split(/\n+/);
    this.words = [];
    this.phrases = [];
    this.pauseAfterPhrase = new Set();

    let wordIndex = 0;
    let phraseIndex = 0;

    for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
      const line = lines[lineIdx].trim();
      if (!line) {
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
          i === lineWords.length - 1
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

      if (phraseWords.length > 0) {
        this.phrases.push({
          words: [...phraseWords],
          index: phraseIndex,
          startWordIndex: phraseWords[0].index,
          endWordIndex: phraseWords[phraseWords.length - 1].index
        });
        phraseIndex++;
      }
    }

    this.currentWordIndex = 0;
    this.currentPhraseIndex = 0;
  }
  
  normalizeWord(word) {
    return word.toLowerCase().replace(/[^a-z0-9]/g, '');
  }

  phraseIndexForWord(wordIndex) {
    for (let i = 0; i < this.phrases.length; i++) {
      if (wordIndex >= this.phrases[i].startWordIndex && wordIndex <= this.phrases[i].endWordIndex) {
        return i;
      }
    }
    return this.phrases.length - 1;
  }

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

      if (this.pauseAfterPhrase.has(p)) {
        html += '<span class="pause-marker" aria-hidden="true"></span>';
      }
    }

    container.innerHTML = html;
    container.style.fontSize = `${this.fontSize}px`;

    this._wordElements = container.querySelectorAll('.word');
    this._phraseElements = container.querySelectorAll('.phrase');
    this._prevPhraseIndex = -1;
  }
  
  highlightPhrase(phraseIndex) {
    if (phraseIndex === this._prevPhraseIndex || !this._phraseElements) return;
    if (phraseIndex < 0 || phraseIndex >= this._phraseElements.length) return;

    const prev = this._prevPhraseIndex ?? 0;
    const nearRange = 2;

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

  highlightWord(wordIndex) {
    const phraseIndex = this.phraseIndexForWord(wordIndex);
    this.highlightPhrase(phraseIndex);
  }
  
  matchAndScroll(transcript) {
    const spokenWords = transcript.toLowerCase().split(/\s+/)
      .map(w => this.normalizeWord(w))
      .filter(w => w.length > 0);

    if (spokenWords.length === 0) return;

    // Adaptive search window — allow small backward correction, wide forward range
    const searchStart = Math.max(0, this.currentWordIndex - 5);
    const searchEnd = Math.min(this.words.length, this.currentWordIndex + 80);

    // Fast path: 1-2 words — direct match for lowest latency
    if (spokenWords.length <= 2) {
      const lastWord = spokenWords[spokenWords.length - 1];
      for (let i = searchStart; i < searchEnd; i++) {
        if (this.words[i].normalized === lastWord) {
          this.scrollToWord(i);
          return;
        }
      }
      for (let i = searchStart; i < searchEnd; i++) {
        if (this.fuzzyMatch(lastWord, this.words[i].normalized)) {
          this.scrollToWord(i);
          return;
        }
      }
      return;
    }

    // Full path: 3+ words — sequence matching for accuracy
    const windowSize = Math.min(spokenWords.length, 6);
    const matchWords = spokenWords.slice(-windowSize);

    let bestScore = 0;
    let bestIndex = -1;

    for (let i = searchStart; i <= searchEnd; i++) {
      let score = 0;
      let consecutive = 0;
      let maxConsecutive = 0;

      for (let j = 0; j < matchWords.length; j++) {
        if (i + j >= this.words.length) break;
        const scriptWord = this.words[i + j].normalized;
        const spokenWord = matchWords[j];

        if (scriptWord === spokenWord) {
          score += 2;
          consecutive++;
        } else if (this.fuzzyMatch(spokenWord, scriptWord)) {
          score += 1;
          consecutive++;
        } else {
          consecutive = 0;
        }
        maxConsecutive = Math.max(maxConsecutive, consecutive);
      }

      const totalScore = score + maxConsecutive * 0.5 + (i >= this.currentWordIndex ? 0.1 : 0);

      if (totalScore > bestScore) {
        bestScore = totalScore;
        bestIndex = Math.min(i + matchWords.length - 1, this.words.length - 1);
      }
    }

    if (bestIndex >= 0 && bestScore >= 3) {
      this.scrollToWord(bestIndex);
    }
  }
  
  fuzzyMatch(spoken, script) {
    if (!spoken || !script) return false;
    if (spoken === script) return true;
    
    // Short words - must be exact or very close
    if (spoken.length <= 2 || script.length <= 2) {
      return spoken === script;
    }
    
    // Check if one contains the other
    if (script.includes(spoken) || spoken.includes(script)) return true;
    
    // Check if they start the same (good for partial words during speech)
    if (script.startsWith(spoken) || spoken.startsWith(script)) return true;
    
    // Levenshtein distance - more lenient threshold
    const distance = this.levenshtein(spoken, script);
    const maxLen = Math.max(spoken.length, script.length);
    return distance / maxLen < 0.4; // 40% tolerance
  }
  
  levenshtein(a, b) {
    const matrix = [];
    for (let i = 0; i <= b.length; i++) matrix[i] = [i];
    for (let j = 0; j <= a.length; j++) matrix[0][j] = j;
    for (let i = 1; i <= b.length; i++) {
      for (let j = 1; j <= a.length; j++) {
        if (b.charAt(i - 1) === a.charAt(j - 1)) {
          matrix[i][j] = matrix[i - 1][j - 1];
        } else {
          matrix[i][j] = Math.min(matrix[i - 1][j - 1] + 1, matrix[i][j - 1] + 1, matrix[i - 1][j] + 1);
        }
      }
    }
    return matrix[b.length][a.length];
  }
  
  scrollToWord(index) {
    if (index < this.currentWordIndex - 10) return;
    if (index === this.currentWordIndex) return;

    this.lastSTTIndex = index;
    this.currentWordIndex = index;

    const newPhraseIndex = this.phraseIndexForWord(index);
    this.currentPhraseIndex = newPhraseIndex;
    this.highlightPhrase(newPhraseIndex);

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
  
  manualScroll(delta) {
    this.currentScrollY -= delta;
    this.applyScroll();
  }
  
  togglePause() {
    this.isPaused = !this.isPaused;
    const btn = document.getElementById('pause-btn');
    
    if (this.isPaused) {
      btn.textContent = '▶️ Resume';
      btn.classList.add('paused');
      this.stopAutoScroll();
      this.stopPredictiveAdvance();
      document.getElementById('mic-status').textContent = '⏸️ Paused';
    } else {
      btn.textContent = '⏸️ Pause';
      btn.classList.remove('paused');
      document.getElementById('mic-status').textContent = '🎤 Listening...';
    }
  }
  
  reset() {
    this.currentWordIndex = 0;
    this.currentScrollY = 0;
    this.lastSTTIndex = 0;
    this.currentPhraseIndex = 0;
    this._wordElements = null;
    this._phraseElements = null;
    this._prevPhraseIndex = -1;
    this.stopPredictiveAdvance();
    this.renderScript();
    this.applyScroll();
    this.stopAutoScroll();
  }
  
  exit() {
    this.isListening = false;
    this.isPaused = false;
    this.stopAutoScroll();
    this.stopPredictiveAdvance();
    
    if (this.silenceTimeout) {
      clearTimeout(this.silenceTimeout);
    }
    
    if (this.sttSocket) {
      this.sttSocket.close();
      this.sttSocket = null;
    }
    if (this.audioStream) {
      this.audioStream.getTracks().forEach(track => track.stop());
      this.audioStream = null;
    }
    if (this.audioContext) {
      this.audioContext.close();
      this.audioContext = null;
    }
    if (this.recognition) {
      this.recognition.stop();
      this.recognition = null;
    }
    
    document.getElementById('teleprompter').classList.add('hidden');
    document.getElementById('setup-panel').classList.remove('hidden');
    document.getElementById('pause-btn').textContent = '⏸️ Pause';
    document.getElementById('pause-btn').classList.remove('paused');
  }
  
  updateFontSize(size) {
    this.fontSize = parseInt(size);
    document.getElementById('font-size-value').textContent = `${size}px`;
    const scriptText = document.getElementById('script-text');
    if (scriptText) scriptText.style.fontSize = `${size}px`;
  }
  
  setMirrorMode(mode) {
    const mirrorMode = document.getElementById('mirror-mode-live')?.value || mode;
    document.getElementById('mirror-mode-live').value = mode;
    this.applyScroll();
  }
  
  toggleDarkMode(enabled) {
    if (enabled) {
      document.body.classList.remove('light-mode');
    } else {
      document.body.classList.add('light-mode');
    }
  }
  
  async convertToScript() {
    const textarea = document.getElementById('script-input');
    const text = textarea.value.trim();
    
    if (!text) {
      alert('Please paste some content first!');
      return;
    }
    
    const btn = document.getElementById('convert-btn');
    const originalText = btn.textContent;
    btn.textContent = '⏳ Converting...';
    btn.disabled = true;
    
    try {
      const response = await fetch('/api/convert-script', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text })
      });
      
      const data = await response.json();
      
      if (data.script) {
        textarea.value = data.script;
        btn.textContent = '✅ Converted!';
        setTimeout(() => {
          btn.textContent = originalText;
          btn.disabled = false;
        }, 2000);
      } else {
        throw new Error(data.error || 'Failed to convert');
      }
    } catch (error) {
      console.error('Error converting script:', error);
      alert('Failed to convert script: ' + error.message);
      btn.textContent = originalText;
      btn.disabled = false;
    }
  }
}

// Initialize
document.addEventListener('DOMContentLoaded', () => {
  window.teleprompter = new SmartTeleprompter();
});
