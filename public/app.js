// Smart Teleprompter - Voice-controlled scrolling
class SmartTeleprompter {
  constructor() {
    this.words = [];
    this.currentWordIndex = 0;
    this.recognition = null;
    this.isListening = false;
    this.isPaused = false;
    this.fontSize = 48;
    this.scrollSpeed = 300;
    
    this.init();
  }
  
  init() {
    // Check for speech recognition support
    if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
      alert('Speech recognition not supported. Please use Chrome or Edge.');
      return;
    }
    
    this.setupEventListeners();
    this.setupSpeechRecognition();
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
  
  setupSpeechRecognition() {
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
      if (event.error === 'no-speech') {
        // Restart on no speech
        if (this.isListening && !this.isPaused) {
          this.recognition.start();
        }
      }
    };
  }
  
  start() {
    const scriptText = document.getElementById('script-input').value.trim();
    if (!scriptText) {
      alert('Please enter a script first!');
      return;
    }
    
    this.parseScript(scriptText);
    this.renderScript();
    
    document.getElementById('setup-panel').classList.add('hidden');
    document.getElementById('teleprompter').classList.remove('hidden');
    
    this.isListening = true;
    this.recognition.start();
    this.updateMicStatus();
  }
  
  parseScript(text) {
    // Split into words, keeping punctuation attached
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
    
    // Check if one contains the other (for partial words)
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
      const targetY = containerRect.height * 0.3; // 30% from top
      
      const wordRect = currentEl.getBoundingClientRect();
      const scrollText = document.getElementById('script-text');
      const currentTransform = new DOMMatrix(getComputedStyle(scrollText).transform);
      const currentY = currentTransform.m42 || 0;
      
      const wordOffset = wordRect.top - containerRect.top;
      const newY = currentY - (wordOffset - targetY);
      
      scrollText.style.transition = `transform ${this.scrollSpeed}ms ease-out`;
      scrollText.style.transform = `translateY(${newY}px)`;
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
      this.recognition.stop();
      btn.textContent = '▶️ Resume';
      btn.classList.add('paused');
    } else {
      this.recognition.start();
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
    this.recognition.stop();
    
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
    scriptText.classList.remove('mirrored-horizontal', 'mirrored-vertical', 'mirrored-both');
    if (mode === 'horizontal') {
      scriptText.classList.add('mirrored-horizontal');
    } else if (mode === 'vertical') {
      scriptText.classList.add('mirrored-vertical');
    } else if (mode === 'both') {
      scriptText.classList.add('mirrored-both');
    }
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
      status.textContent = '🎤 Listening...';
      status.className = 'listening';
    }
  }
}

// Initialize
document.addEventListener('DOMContentLoaded', () => {
  window.teleprompter = new SmartTeleprompter();
});
