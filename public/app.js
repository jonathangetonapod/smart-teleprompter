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
    this.sttProvider = document.getElementById('stt-provider')?.value || 'deepgram';
    console.log('Setting up STT provider:', this.sttProvider);
    
    if (this.sttProvider === 'elevenlabs') {
      await this.setupElevenLabs();
    } else {
      await this.setupDeepgram();
    }
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
      
      // Connect to Deepgram WebSocket (Nova-3 with smart_format)
      this.sttSocket = new WebSocket(
        `wss://api.deepgram.com/v1/listen?model=nova-3&language=${language}&smart_format=true&interim_results=true&endpointing=300&encoding=linear16&sample_rate=16000`,
        ['token', apiKey]
      );
      
      this.sttSocket.onopen = () => {
        console.log('Deepgram connected');
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
        // Don't auto-reconnect if we closed intentionally or auth failed
        if (this.isListening && !this.isPaused && event.code !== 1000) {
          console.log('Reconnecting in 2 seconds...');
          setTimeout(() => this.setupDeepgram(), 2000);
        }
      };
      
    } catch (error) {
      console.error('Failed to setup Deepgram:', error);
      this.fallbackToWebSpeech();
    }
  }
  
  async setupElevenLabs() {
    try {
      // Get API key from server
      const response = await fetch('/api/elevenlabs-key');
      const { apiKey } = await response.json();
      
      if (!apiKey) {
        console.error('No ElevenLabs API key configured');
        document.getElementById('mic-status').textContent = '⚠️ No ElevenLabs API Key';
        this.fallbackToWebSpeech();
        return;
      }
      
      // Get microphone access
      this.audioStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      
      // Get selected language
      const language = document.getElementById('language')?.value || 'en';
      
      // Connect to ElevenLabs Scribe WebSocket
      this.sttSocket = new WebSocket('wss://api.elevenlabs.io/v1/speech-to-text/stream');
      
      this.sttSocket.onopen = () => {
        console.log('ElevenLabs WebSocket opened, sending config...');
        // Send initial config
        this.sttSocket.send(JSON.stringify({
          type: 'config',
          data: {
            model: 'scribe_v2',
            language: language === 'multi' ? 'auto' : language,
            sample_rate: 16000,
            encoding: 'pcm_s16le'
          },
          authorization: `Bearer ${apiKey}`
        }));
        document.getElementById('mic-status').textContent = '🎤 ElevenLabs Scribe Connected';
        this.startRecordingElevenLabs();
      };
      
      this.sttSocket.onmessage = (event) => {
        if (this.isPaused) return;
        
        const data = JSON.parse(event.data);
        console.log('ElevenLabs message:', data);
        
        // Handle transcription based on ElevenLabs response format
        if (data.text || data.transcript) {
          const transcript = data.text || data.transcript;
          if (transcript.trim()) {
            console.log('Heard:', transcript);
            document.getElementById('transcript').textContent = transcript;
            this.onSpeechDetected();
            this.matchAndScroll(transcript);
          }
        }
        
        // Handle partial/interim results
        if (data.type === 'transcript' && data.data?.text) {
          const transcript = data.data.text;
          if (transcript.trim()) {
            console.log('Heard:', transcript);
            document.getElementById('transcript').textContent = transcript;
            this.onSpeechDetected();
            this.matchAndScroll(transcript);
          }
        }
      };
      
      this.sttSocket.onerror = (error) => {
        console.error('ElevenLabs error:', error);
        document.getElementById('mic-status').textContent = '⚠️ ElevenLabs Error - Using Fallback';
        this.fallbackToWebSpeech();
      };
      
      this.sttSocket.onclose = (event) => {
        console.log('ElevenLabs disconnected', event.code, event.reason);
        if (this.isListening && !this.isPaused && event.code !== 1000) {
          console.log('Reconnecting in 2 seconds...');
          setTimeout(() => this.setupElevenLabs(), 2000);
        }
      };
      
    } catch (error) {
      console.error('Failed to setup ElevenLabs:', error);
      this.fallbackToWebSpeech();
    }
  }
  
  startRecordingElevenLabs() {
    try {
      const audioContext = new AudioContext({ sampleRate: 16000 });
      const source = audioContext.createMediaStreamSource(this.audioStream);
      const processor = audioContext.createScriptProcessor(4096, 1, 1);
      
      let audioSent = 0;
      
      processor.onaudioprocess = (e) => {
        if (this.sttSocket?.readyState === WebSocket.OPEN && !this.isPaused) {
          const inputData = e.inputBuffer.getChannelData(0);
          const pcmData = new Int16Array(inputData.length);
          for (let i = 0; i < inputData.length; i++) {
            pcmData[i] = Math.max(-32768, Math.min(32767, inputData[i] * 32768));
          }
          // ElevenLabs expects audio data wrapped in a message
          this.sttSocket.send(JSON.stringify({
            type: 'audio',
            data: btoa(String.fromCharCode.apply(null, new Uint8Array(pcmData.buffer)))
          }));
          audioSent++;
          if (audioSent % 50 === 0) {
            console.log(`Audio chunks sent: ${audioSent}`);
          }
        }
      };
      
      source.connect(processor);
      processor.connect(audioContext.destination);
      this.audioContext = audioContext;
      this.processor = processor;
      console.log('ElevenLabs audio recording started');
    } catch (error) {
      console.error('Error starting ElevenLabs recording:', error);
    }
  }
  
  startRecording() {
    try {
      const audioContext = new AudioContext({ sampleRate: 16000 });
      const source = audioContext.createMediaStreamSource(this.audioStream);
      const processor = audioContext.createScriptProcessor(4096, 1, 1);
      
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
          if (audioSent % 50 === 0) {
            console.log(`Audio chunks sent: ${audioSent}`);
          }
        }
      };
      
      source.connect(processor);
      processor.connect(audioContext.destination);
      this.audioContext = audioContext;
      this.processor = processor;
      console.log('Deepgram audio recording started');
    } catch (error) {
      console.error('Error starting recording:', error);
    }
  }
  
  onSpeechStart() {
    if (this.autoScrollMode && !this.isScrolling && !this.isPaused) {
      this.startAutoScroll();
    }
  }
  
  onSpeechDetected() {
    this.lastSpeechTime = Date.now();
    
    if (this.autoScrollMode && !this.isScrolling && !this.isPaused) {
      this.startAutoScroll();
    }
    
    // Clear existing silence timeout
    if (this.silenceTimeout) {
      clearTimeout(this.silenceTimeout);
    }
    
    // Stop scrolling after 1.5 seconds of silence
    this.silenceTimeout = setTimeout(() => {
      if (this.autoScrollMode && this.isScrolling) {
        this.stopAutoScroll();
      }
    }, 1500);
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
      
      if (!this.autoScrollMode) {
        this.matchAndScroll(transcript);
      }
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
      `<span class="word ${i === 0 ? 'current' : ''}" data-index="${i}">${word.original} </span>`
    ).join('');
    container.style.fontSize = `${this.fontSize}px`;
  }
  
  highlightWord(index) {
    document.querySelectorAll('.word').forEach((el, i) => {
      el.classList.remove('spoken', 'current');
      if (i < index) {
        el.classList.add('spoken');
      } else if (i === index) {
        el.classList.add('current');
      }
    });
  }
  
  matchAndScroll(transcript) {
    const spokenWords = transcript.toLowerCase().split(/\s+/).map(w => this.normalizeWord(w)).filter(w => w.length > 1);
    
    if (spokenWords.length === 0) return;
    
    // Search ahead from current position
    const searchStart = this.currentWordIndex;
    const searchEnd = Math.min(this.words.length, this.currentWordIndex + 30);
    
    // Get last spoken word for quick matching
    const lastWord = spokenWords[spokenWords.length - 1];
    
    // Quick exact match first (fastest)
    for (let i = searchStart; i < searchEnd; i++) {
      if (this.words[i].normalized === lastWord) {
        console.log(`Exact match: "${lastWord}" at index ${i}`);
        this.scrollToWord(i);
        return;
      }
    }
    
    // Fuzzy match if no exact match
    for (let i = searchStart; i < searchEnd; i++) {
      if (this.fuzzyMatch(lastWord, this.words[i].normalized)) {
        console.log(`Fuzzy match: "${lastWord}" ~ "${this.words[i].normalized}" at index ${i}`);
        this.scrollToWord(i);
        return;
      }
    }
    
    console.log(`No match for: "${lastWord}" (searching ${searchStart}-${searchEnd})`);
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
    if (index < this.currentWordIndex) return;
    if (index === this.currentWordIndex) {
      // Just update highlighting
      this.highlightWord(index);
      return;
    }
    this.currentWordIndex = index;
    
    // Highlight current word
    this.highlightWord(index);
    
    const currentEl = document.querySelector(`.word[data-index="${this.currentWordIndex}"]`);
    if (currentEl) {
      const container = document.getElementById('script-container');
      const containerRect = container.getBoundingClientRect();
      const targetY = containerRect.height * 0.3;
      const wordRect = currentEl.getBoundingClientRect();
      const wordOffset = wordRect.top - containerRect.top;
      
      this.currentScrollY = this.currentScrollY - (wordOffset - targetY);
      
      // Instant scroll (no lag)
      this.applyScroll();
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
    this.renderScript();
    this.applyScroll();
    this.stopAutoScroll();
  }
  
  exit() {
    this.isListening = false;
    this.isPaused = false;
    this.stopAutoScroll();
    
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
