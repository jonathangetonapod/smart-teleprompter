// Smart Teleprompter - Voice-controlled scrolling with Deepgram
class SmartTeleprompter {
  constructor() {
    this.words = [];
    this.currentWordIndex = 0;
    this.isListening = false;
    this.isPaused = false;
    this.fontSize = 48;
    this.scrollSpeed = 300;
    this.deepgramSocket = null;
    this.mediaRecorder = null;
    this.audioStream = null;
    
    this.init();
  }
  
  init() {
    this.setupEventListeners();
  }
  
  setupEventListeners() {
    // Setup panel
    document.getElementById('start-btn').addEventListener('click', () => this.start());
    document.getElementById('font-size').addEventListener('input', (e) => this.updateFontSize(e.target.value));
    document.getElementById('scroll-speed').addEventListener('input', (e) => this.scrollSpeed = parseInt(e.target.value));
    document.getElementById('mirror-mode').addEventListener('change', (e) => this.setMirrorMode(e.target.value));
    document.getElementById('dark-mode').addEventListener('change', (e) => this.toggleDarkMode(e.target.checked));
    
    // Teleprompter controls
    document.getElementById('pause-btn').addEventListener('click', () => this.togglePause());
    document.getElementById('reset-btn').addEventListener('click', () => this.reset());
    document.getElementById('exit-btn').addEventListener('click', () => this.exit());
    document.getElementById('mirror-mode-live').addEventListener('change', (e) => this.setMirrorMode(e.target.value));
    
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
          this.jumpWords(-5);
          break;
        case 'ArrowDown':
          e.preventDefault();
          this.jumpWords(5);
          break;
        case 'Escape':
          this.exit();
          break;
      }
    });
  }
  
  async setupDeepgram() {
    try {
      // Get API key from server
      const response = await fetch('/api/deepgram-key');
      const { apiKey } = await response.json();
      
      // Get microphone access
      this.audioStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      
      // Connect to Deepgram WebSocket
      this.deepgramSocket = new WebSocket(
        `wss://api.deepgram.com/v1/listen?model=nova-2&punctuate=true&interim_results=true&encoding=linear16&sample_rate=16000`,
        ['token', apiKey]
      );
      
      this.deepgramSocket.onopen = () => {
        console.log('Deepgram connected');
        this.startRecording();
        this.updateMicStatus();
      };
      
      this.deepgramSocket.onmessage = (event) => {
        if (this.isPaused) return;
        
        const data = JSON.parse(event.data);
        if (data.channel?.alternatives?.[0]?.transcript) {
          const transcript = data.channel.alternatives[0].transcript;
          if (transcript.trim()) {
            document.getElementById('transcript').textContent = transcript;
            this.matchAndScroll(transcript);
          }
        }
      };
      
      this.deepgramSocket.onerror = (error) => {
        console.error('Deepgram error:', error);
        this.fallbackToWebSpeech();
      };
      
      this.deepgramSocket.onclose = () => {
        console.log('Deepgram disconnected');
        if (this.isListening && !this.isPaused) {
          // Reconnect if still supposed to be listening
          setTimeout(() => this.setupDeepgram(), 1000);
        }
      };
      
    } catch (error) {
      console.error('Failed to setup Deepgram:', error);
      this.fallbackToWebSpeech();
    }
  }
  
  startRecording() {
    const audioContext = new AudioContext({ sampleRate: 16000 });
    const source = audioContext.createMediaStreamSource(this.audioStream);
    const processor = audioContext.createScriptProcessor(4096, 1, 1);
    
    processor.onaudioprocess = (e) => {
      if (this.deepgramSocket?.readyState === WebSocket.OPEN && !this.isPaused) {
        const inputData = e.inputBuffer.getChannelData(0);
        const pcmData = new Int16Array(inputData.length);
        for (let i = 0; i < inputData.length; i++) {
          pcmData[i] = Math.max(-32768, Math.min(32767, inputData[i] * 32768));
        }
        this.deepgramSocket.send(pcmData.buffer);
      }
    };
    
    source.connect(processor);
    processor.connect(audioContext.destination);
    this.audioContext = audioContext;
    this.processor = processor;
  }
  
  fallbackToWebSpeech() {
    console.log('Falling back to Web Speech API');
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
    this.updateMicStatus();
  }
  
  async start() {
    const scriptText = document.getElementById('script-input').value.trim();
    if (!scriptText) {
      alert('Please enter a script first!');
      return;
    }
    
    this.parseScript(scriptText);
    this.renderScript();
    
    document.getElementById('setup-panel').classList.add('hidden');
    document.getElementById('teleprompter').classList.remove('hidden');
    
    // Sync mirror mode from setup to live controls
    const mirrorMode = document.getElementById('mirror-mode').value;
    document.getElementById('mirror-mode-live').value = mirrorMode;
    this.setMirrorMode(mirrorMode);
    
    this.isListening = true;
    
    // Try Deepgram first, fallback to Web Speech
    await this.setupDeepgram();
  }
  
  parseScript(text) {
    this.words = text.split(/\s+/).map((word, index) => ({
      original: word,
      normalized: this.normalizeWord(word),
      index: index
    }));
    this.currentWordIndex = 0;
  }
  
  normalizeWord(word) {
    return word.toLowerCase().replace(/[^a-z0-9]/g, '');
  }
  
  renderScript() {
    const container = document.getElementById('script-text');
    container.innerHTML = this.words.map((word, i) => 
      `<span class="word ${i < this.currentWordIndex ? 'spoken' : ''} ${i === this.currentWordIndex ? 'current' : ''}" data-index="${i}">${word.original} </span>`
    ).join('');
    container.style.fontSize = `${this.fontSize}px`;
  }
  
  matchAndScroll(transcript) {
    const spokenWords = transcript.toLowerCase().split(/\s+/).map(w => this.normalizeWord(w)).filter(w => w);
    
    if (spokenWords.length === 0) return;
    
    // Look for matches in a window ahead of current position
    const searchStart = Math.max(0, this.currentWordIndex - 2);
    const searchEnd = Math.min(this.words.length, this.currentWordIndex + 20);
    
    let bestMatch = -1;
    let bestScore = 0;
    
    // Try to match the last few spoken words
    const recentSpoken = spokenWords.slice(-3);
    
    for (let i = searchStart; i < searchEnd; i++) {
      let score = 0;
      for (let j = 0; j < recentSpoken.length && i + j < this.words.length; j++) {
        if (this.fuzzyMatch(recentSpoken[j], this.words[i + j].normalized)) {
          score += 1;
        }
      }
      
      if (score > bestScore) {
        bestScore = score;
        bestMatch = i + recentSpoken.length - 1;
      }
    }
    
    if (bestMatch > this.currentWordIndex && bestScore > 0) {
      this.scrollToWord(bestMatch);
    }
  }
  
  fuzzyMatch(spoken, script) {
    if (spoken === script) return true;
    if (spoken.length < 2 || script.length < 2) return spoken === script;
    
    // Check if one contains the other
    if (script.includes(spoken) || spoken.includes(script)) return true;
    
    // Levenshtein distance for fuzzy matching
    const distance = this.levenshtein(spoken, script);
    const maxLen = Math.max(spoken.length, script.length);
    return distance / maxLen < 0.3;
  }
  
  levenshtein(a, b) {
    const matrix = [];
    for (let i = 0; i <= b.length; i++) {
      matrix[i] = [i];
    }
    for (let j = 0; j <= a.length; j++) {
      matrix[0][j] = j;
    }
    for (let i = 1; i <= b.length; i++) {
      for (let j = 1; j <= a.length; j++) {
        if (b.charAt(i - 1) === a.charAt(j - 1)) {
          matrix[i][j] = matrix[i - 1][j - 1];
        } else {
          matrix[i][j] = Math.min(
            matrix[i - 1][j - 1] + 1,
            matrix[i][j - 1] + 1,
            matrix[i - 1][j] + 1
          );
        }
      }
    }
    return matrix[b.length][a.length];
  }
  
  scrollToWord(index) {
    if (index <= this.currentWordIndex) return;
    
    this.currentWordIndex = index;
    
    // Update word classes
    document.querySelectorAll('.word').forEach((el, i) => {
      el.classList.remove('spoken', 'current', 'upcoming');
      if (i < this.currentWordIndex) {
        el.classList.add('spoken');
      } else if (i === this.currentWordIndex) {
        el.classList.add('current');
      } else {
        el.classList.add('upcoming');
      }
    });
    
    // Scroll to keep current word in view
    const currentEl = document.querySelector(`.word[data-index="${this.currentWordIndex}"]`);
    if (currentEl) {
      const container = document.getElementById('script-container');
      const containerRect = container.getBoundingClientRect();
      const targetY = containerRect.height * 0.3;
      
      const wordRect = currentEl.getBoundingClientRect();
      const scrollText = document.getElementById('script-text');
      const currentTransform = new DOMMatrix(getComputedStyle(scrollText).transform);
      const currentY = currentTransform.m42 || 0;
      
      const wordOffset = wordRect.top - containerRect.top;
      const newY = currentY - (wordOffset - targetY);
      
      // Get current mirror mode and preserve it
      const mirrorMode = document.getElementById('mirror-mode-live')?.value || 'none';
      let mirrorTransform = '';
      if (mirrorMode === 'horizontal') mirrorTransform = 'scaleX(-1)';
      else if (mirrorMode === 'vertical') mirrorTransform = 'scaleY(-1)';
      else if (mirrorMode === 'both') mirrorTransform = 'scale(-1, -1)';
      
      scrollText.style.transition = `transform ${this.scrollSpeed}ms ease-out`;
      scrollText.style.transform = `translateY(${newY}px) ${mirrorTransform}`.trim();
    }
  }
  
  jumpWords(count) {
    const newIndex = Math.max(0, Math.min(this.words.length - 1, this.currentWordIndex + count));
    this.scrollToWord(newIndex);
  }
  
  togglePause() {
    this.isPaused = !this.isPaused;
    const btn = document.getElementById('pause-btn');
    
    if (this.isPaused) {
      btn.textContent = '▶️ Resume';
      btn.classList.add('paused');
    } else {
      btn.textContent = '⏸️ Pause';
      btn.classList.remove('paused');
    }
    
    this.updateMicStatus();
  }
  
  reset() {
    this.currentWordIndex = 0;
    this.renderScript();
    document.getElementById('script-text').style.transform = 'translateY(0)';
  }
  
  exit() {
    this.isListening = false;
    this.isPaused = false;
    
    // Cleanup Deepgram
    if (this.deepgramSocket) {
      this.deepgramSocket.close();
      this.deepgramSocket = null;
    }
    if (this.audioStream) {
      this.audioStream.getTracks().forEach(track => track.stop());
      this.audioStream = null;
    }
    if (this.audioContext) {
      this.audioContext.close();
      this.audioContext = null;
    }
    
    // Cleanup Web Speech fallback
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
    if (scriptText) {
      scriptText.style.fontSize = `${size}px`;
    }
  }
  
  setMirrorMode(mode) {
    const scriptText = document.getElementById('script-text');
    // Get current translateY value
    const currentTransform = new DOMMatrix(getComputedStyle(scriptText).transform);
    const currentY = currentTransform.m42 || 0;
    
    let mirrorTransform = '';
    if (mode === 'horizontal') mirrorTransform = 'scaleX(-1)';
    else if (mode === 'vertical') mirrorTransform = 'scaleY(-1)';
    else if (mode === 'both') mirrorTransform = 'scale(-1, -1)';
    
    scriptText.style.transform = `translateY(${currentY}px) ${mirrorTransform}`.trim();
  }
  
  toggleDarkMode(enabled) {
    if (enabled) {
      document.body.classList.remove('light-mode');
    } else {
      document.body.classList.add('light-mode');
    }
  }
  
  updateMicStatus() {
    const status = document.getElementById('mic-status');
    if (this.isPaused) {
      status.textContent = '⏸️ Paused';
      status.className = 'paused';
    } else {
      status.textContent = '🎤 Listening (Deepgram)';
      status.className = 'listening';
    }
  }
}

// Initialize
document.addEventListener('DOMContentLoaded', () => {
  window.teleprompter = new SmartTeleprompter();
});
