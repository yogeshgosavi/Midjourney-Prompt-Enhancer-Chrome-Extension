class TextEnhancer {
  constructor() {
    this.enabled = false;
    this.dropdown = null;
    this.currentField = null;
    this.selectedIndex = -1;
    this.currentOptions = [];
    this.keywords = {};
    this.triggerChar = '#';

    this.init();
  }

  async init() {
    // Check if the extension should be active on this site
    const isAllowed = await this.checkSiteAccess();
    if (!isAllowed) return;

    // Load initial state and keywords
    const [stateData, keywordData] = await Promise.all([
      this.getStorageData('isEnabled'),
      this.getStorageData('keywords')
    ]);

    this.enabled = stateData.isEnabled || false;
    this.keywords = keywordData.keywords || this.getDefaultKeywords();

    // Create dropdown element
    this.createDropdown();

    // Add event listeners
    this.setupEventListeners();

    // Listen for keyword updates
    this.setupStorageListener();
  }

  setupEventListeners() {
    // Input event for detecting keywords
    document.addEventListener('input', (e) => {
      this.handleInput(e);
    });

    // Click outside to close dropdown
    document.addEventListener('click', (e) => {
      this.handleClickOutside(e);
    });

    // Keyboard navigation
    document.addEventListener('keydown', (e) => {
      this.handleKeydown(e);
    });

    // Window events for dropdown positioning
    window.addEventListener('scroll', () => this.updateDropdownPosition());
    window.addEventListener('resize', () => this.updateDropdownPosition());
  }

  setupStorageListener() {
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area === 'sync') {
        if (changes.keywords) {
          this.keywords = changes.keywords.newValue || {};
        }
        if (changes.isEnabled !== undefined) {
          this.enabled = changes.isEnabled.newValue;
        }
      }
    });
  }

  async handleInput(event) {
    if (!this.enabled) return;
    
    const target = event.target;
    if (target.tagName !== 'INPUT' && target.tagName !== 'TEXTAREA') return;

    this.currentField = target;
    const { word, start, end, isTrigger, hasWord } = this.getWordAtCursor(target);
    const counts = await this.getSelectionCounts();

    if (isTrigger) {
      const rect = target.getBoundingClientRect();
      if (!hasWord) {
        // Show all keywords when only the trigger is typed
        const sortedKeywords = Object.keys(this.keywords)
          .map(k => ({
            text: k,
            category: k,
            count: counts[k] || 0
          }))
          .sort((a, b) => b.count - a.count);

        this.showDropdown(sortedKeywords, {
          left: rect.left + window.scrollX,
          top: rect.bottom + window.scrollY,
          keyword: '',
          counts: counts
        });
      } else {
        // Filter and sort keywords based on partial input
        const matchingKeywords = Object.keys(this.keywords)
          .filter(k => k.toLowerCase().startsWith(word.toLowerCase()))
          .map(k => ({
            text: k,
            category: k,
            count: counts[k] || 0
          }))
          .sort((a, b) => b.count - a.count);
        
        if (matchingKeywords.length > 0) {
          this.showDropdown(matchingKeywords, {
            left: rect.left + window.scrollX,
            top: rect.bottom + window.scrollY,
            keyword: word,
            counts: counts
          });
        } else {
          this.hideDropdown();
        }
      }
    } else if (this.keywords[word?.toLowerCase()]) {
      // Show options for exact keyword match
      const keyword = word.toLowerCase();
      const rect = target.getBoundingClientRect();
      const options = await this.getSortedOptions(keyword, counts);
      
      this.showDropdown(options, {
        left: rect.left + window.scrollX,
        top: rect.bottom + window.scrollY,
        keyword: keyword,
        counts: counts
      });
    } else {
      this.hideDropdown();
    }
  }

  createDropdown() {
    if (this.dropdown) {
      this.dropdown.remove();
    }

    this.dropdown = document.createElement('div');
    this.dropdown.className = 'text-enhancer-dropdown hidden';
    this.dropdown.style.position = 'absolute';
    this.dropdown.style.zIndex = '999999';
    document.body.appendChild(this.dropdown);
  }

  getWordAtCursor(input) {
    const cursor = input.selectionStart;
    const text = input.value;
    
    // Find word boundaries
    let start = cursor;
    let end = cursor;

    // Check if we're right after a trigger character
    if (cursor > 0 && text[cursor - 1] === this.triggerChar) {
      return {
        word: '',
        start: cursor - 1,  // Position of the # character
        end: cursor,        // Position right after the # character
        isTrigger: true,
        hasWord: false
      };
    }

    // Move start back to find the beginning of the word or trigger
    while (start > 0) {
      const char = text[start - 1];
      if (char === this.triggerChar) {
        // Found a trigger character
        start--;
        break;
      }
      if (!/[\w-]/.test(char)) {
        break;
      }
      start--;
    }

    // Move end forward to find the end of the word
    while (end < text.length && /[\w-]/.test(text[end])) {
      end++;
    }

    // Check if we found a trigger character at the start
    const hasTrigger = text[start] === this.triggerChar;

    // If we have a trigger, the word starts after it
    const word = hasTrigger ? text.slice(start + 1, end) : text.slice(start, end);

    return {
      word: word,
      start: start,        // Start includes the # if present
      end: end,           // End of the current word
      isTrigger: hasTrigger,
      hasWord: word.length > 0
    };
  }

  async getSelectionCounts() {
    return new Promise(resolve => {
      chrome.storage.local.get('selectionCounts', (result) => {
        const counts = result.selectionCounts || {};
        resolve(counts);
      });
    });
  }

  async getSortedOptions(keyword, counts) {
    const options = this.keywords[keyword] || [];
    
    if (keyword === 'color') {
      return options.map(color => ({
        text: color,
        color,
        count: counts[color] || 0
      })).sort((a, b) => b.count - a.count);
    }

    return options.map(option => ({
      text: option,
      count: counts[option] || 0
    })).sort((a, b) => b.count - a.count);
  }

  showDropdown(options, position) {
    this.dropdown.innerHTML = '';
    const ul = document.createElement('ul');
    this.currentOptions = options;
    this.selectedIndex = -1;

    if (options.length === 0) {
      const noResults = document.createElement('div');
      noResults.className = 'no-results';
      noResults.textContent = 'No matching options found';
      this.dropdown.appendChild(noResults);
    } else {
      let currentCategory = null;

      options.forEach((option, index) => {
        // Add category header if needed
        if (option.category && option.category !== currentCategory) {
          currentCategory = option.category;
          const header = document.createElement('div');
          header.className = 'category-header';
          header.textContent = currentCategory.toUpperCase();
          if (option.count > 0) {
            header.textContent += ` (${option.count})`;
          }
          ul.appendChild(header);
        }

        const li = document.createElement('li');
        
        if (typeof option === 'object' && option.color) {
          // Color option
          li.className = 'color-option';
          const preview = document.createElement('span');
          preview.className = 'color-preview';
          preview.style.backgroundColor = option.color;
          li.appendChild(preview);
          li.appendChild(document.createTextNode(option.text));
        } else {
          // Regular option
          const text = typeof option === 'string' ? option : option.text;
          li.textContent = text;
        }
        
        // Add selection count if available
        const count = option.count || 0;
        if (count > 0) {
          const badge = document.createElement('span');
          badge.className = 'selection-count';
          badge.textContent = count;
          li.appendChild(badge);
        }

        li.addEventListener('click', () => this.handleOptionSelect(option, position.keyword));
        li.addEventListener('mouseover', () => this.highlightOption(index));
        ul.appendChild(li);
      });
    }

    this.dropdown.appendChild(ul);
    this.dropdown.style.left = `${position.left}px`;
    this.dropdown.style.top = `${position.top}px`;
    this.dropdown.classList.remove('hidden');

    // Highlight first option by default
    if (options.length > 0) {
      this.highlightOption(0);
    }
  }

  hideDropdown() {
    this.dropdown.classList.add('hidden');
    this.selectedIndex = -1;
    this.currentOptions = [];
  }

  async handleOptionSelect(option, keyword) {
    if (!this.currentField) return;

    const selectedText = typeof option === 'object' ? option.text : option;

    if (option.category) {
      // It's a keyword, show its options
      const counts = await this.getSelectionCounts();
      const options = await this.getSortedOptions(selectedText.toLowerCase(), counts);
      const rect = this.currentField.getBoundingClientRect();
      
      this.showDropdown(options, {
        left: rect.left + window.scrollX,
        top: rect.bottom + window.scrollY,
        keyword: selectedText,
        counts: counts
      });
      
      // Ensure the field stays in focus
      this.currentField.focus();
      return;
    }
    
    // It's a final option, insert it at the # position
    const text = this.currentField.value;
    const { start, end } = this.getWordAtCursor(this.currentField);
    
    // Find the position of the # character
    let hashPosition = text.lastIndexOf('#', start);
    if (hashPosition === -1) {
      hashPosition = start;
    }
    
    // Get text before the # and after the cursor
    const textBeforeHash = text.substring(0, hashPosition);
    const textAfterCursor = text.substring(end);
    
    // Create the new text by inserting the selected option between them
    const newText = textBeforeHash + selectedText + textAfterCursor;
    
    // Update the text field
    this.currentField.value = newText;
    
    // Move cursor after the inserted text
    const newPosition = hashPosition + selectedText.length;
    
    // Update selection count
    const counts = await this.getSelectionCounts();
    counts[selectedText] = (counts[selectedText] || 0) + 1;
    chrome.storage.local.set({ selectionCounts: counts });
    
    // Hide dropdown first
    this.hideDropdown();
    
    // Ensure the field stays in focus and cursor is positioned correctly
    this.currentField.focus();
    this.currentField.setSelectionRange(newPosition, newPosition);
    
    // Trigger an input event to notify any listeners
    this.currentField.dispatchEvent(new Event('input', { bubbles: true }));
  }
  

  highlightOption(index) {
    if (index < 0 || index >= this.currentOptions.length) return;

    const items = this.dropdown.querySelectorAll('li');
    items.forEach((item, i) => {
      if (i === index) {
        item.classList.add('highlighted');
        // Ensure the highlighted item is visible
        if (item.scrollIntoView) {
          item.scrollIntoView({ block: 'nearest' });
        }
      } else {
        item.classList.remove('highlighted');
      }
    });
    this.selectedIndex = index;
  }

  handleKeydown(event) {
    if (!this.enabled || this.dropdown.classList.contains('hidden')) return;

    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        this.highlightOption(
          this.selectedIndex === this.currentOptions.length - 1 
            ? 0 
            : this.selectedIndex + 1
        );
        break;
      case 'ArrowUp':
        event.preventDefault();
        this.highlightOption(
          this.selectedIndex <= 0 
            ? this.currentOptions.length - 1 
            : this.selectedIndex - 1
        );
        break;
      case 'Tab':
        if (!event.shiftKey) {
          event.preventDefault();
          this.highlightOption(
            this.selectedIndex === this.currentOptions.length - 1 
              ? 0 
              : this.selectedIndex + 1
          );
        } else {
          event.preventDefault();
          this.highlightOption(
            this.selectedIndex <= 0 
              ? this.currentOptions.length - 1 
              : this.selectedIndex - 1
          );
        }
        break;
      case 'Enter':
        event.preventDefault();
        if (this.selectedIndex >= 0) {
          const option = this.currentOptions[this.selectedIndex];
          const { word } = this.getWordAtCursor(this.currentField);
          this.handleOptionSelect(option, word.toLowerCase());
        }
        break;
      case 'Escape':
        event.preventDefault();
        this.hideDropdown();
        break;
    }
  }

  handleClickOutside(event) {
    if (!this.dropdown.contains(event.target)) {
      this.hideDropdown();
    }
  }

  updateDropdownPosition() {
    if (!this.currentField || this.dropdown.classList.contains('hidden')) return;

    const rect = this.currentField.getBoundingClientRect();
    this.dropdown.style.left = `${rect.left + window.scrollX}px`;
    this.dropdown.style.top = `${rect.bottom + window.scrollY}px`;
  }

  getStorageData(key) {
    return new Promise(resolve => {
      chrome.storage.sync.get(key, resolve);
    });
  }

  getDefaultKeywords() {
    return {
      color: ["red", "blue", "green", "yellow", "purple", "orange", "pink", "brown", "gray", "black", "white", "cyan", "magenta", "turquoise", "lavender", "gold", "silver", "bronze", "vibrant", "muted", "pastel", "monochromatic", "sepia", "black and white", "neon", "iridescent", "metallic", "gradient", "duotone", "high contrast", "low contrast", "saturated", "desaturated", "warm colors", "cool colors", "primary colors", "complementary colors", "analogous colors", "earth tones", "jewel tones", "pastel rainbow", "fluorescent", "ombre"],
      style: ["impressionist", "surrealist", "abstract", "realistic", "minimalist", "cubist", "pop art", "art deco", "baroque", "rococo", "gothic", "renaissance", "cyberpunk", "steampunk", "futuristic", "vintage", "retro", "pastel", "monochromatic", "vibrant", "photorealistic", "pixel art", "vaporwave", "art nouveau", "romantic", "neoclassical", "futurism", "expressionist", "bohemian", "grunge", "kawaii", "noir", "psychedelic"],
      mood: ["calm", "energetic", "mysterious", "playful", "melancholic", "joyful", "tense", "serene", "dramatic", "whimsical", "nostalgic", "dreamy", "dark", "light", "chaotic", "peaceful", "eerie", "haunting", "intense", "ethereal", "somber", "hopeful", "foreboding", "bittersweet", "surreal", "apocalyptic", "tranquil", "rebellious"],
      subject: ["landscape", "portrait", "wildlife", "urban", "architecture", "fantasy", "sci-fi", "mythological", "nature", "technology", "space", "underwater", "cityscape", "animals", "plants"],
      perspective: ["bird's eye view", "worm's eye view", "close-up", "wide shot", "macro", "aerial", "ground level", "eye level", "over the shoulder", "symmetrical"],
      lighting: ["natural light", "soft light", "hard light", "backlighting", "spotlight", "neon", "candlelight", "sunlight", "moonlight", "twilight", "golden hour", "foggy", "shadowy", "soft lighting", "harsh lighting", "backlit", "rim lighting", "dramatic lighting", "cinematic lighting", "studio lighting", "low key lighting", "high key lighting", "blue hour", "volumetric lighting", "ambient lighting", "directional lighting", "diffused lighting", "overcast", "silhouette", "prismatic", "strobing", "underlit"],
      composition: ["rule of thirds", "golden ratio", "symmetry", "asymmetry", "leading lines", "framing", "negative space", "depth", "layering", "focal point", "centered", "off-center", "foreground interest", "minimalist", "busy", "chaotic", "balanced", "unbalanced", "dynamic", "static", "geometric", "organic", "layered"],
      emotion: ["happiness", "sadness", "anger", "fear", "love", "excitement", "curiosity", "hope", "despair", "anxiety"],
      time: ["morning", "afternoon", "evening", "night", "dawn", "dusk", "golden hour", "blue hour", "sunset", "sunrise"],
      season: ["spring", "summer", "autumn", "winter", "rainy season", "harvest", "blooming", "frozen"],
      weather: ["sunny", "cloudy", "rainy", "snowy", "windy", "stormy", "foggy", "clear", "thunderstorm", "rainbow"],
      texture: ["smooth", "rough", "grainy", "silky", "metallic", "wooden", "stone", "glassy", "cracked", "matte", "textured", "patterned", "woven", "knitted", "embossed", "engraved", "carved", "polished", "glossy", "reflective", "transparent", "translucent", "opaque", "frosted", "weathered", "distressed", "velvety", "scaly", "feathered", "rugged", "prickly"],
      movement: ["still", "flowing", "swirling", "floating", "falling", "rising", "twisting", "exploding"],
      scale: ["tiny", "small", "medium", "large", "huge", "gigantic", "miniature", "vast"],
      shape: ["circle", "square", "triangle", "oval", "star", "spiral", "wave", "fractal", "sphere", "cube"],
      camera: ["wide angle", "telephoto", "fisheye", "macro", "aerial view", "bird's eye view", "worm's eye view", "dutch angle", "panoramic", "tilt-shift", "bokeh", "depth of field", "shallow focus", "deep focus", "motion blur", "freeze frame", "time-lapse", "long exposure", "multiple exposure", "HDR"],
      material: ["glass", "metal", "wood", "stone", "fabric", "leather", "paper", "plastic", "ceramic", "concrete", "marble", "gold", "silver", "bronze", "copper", "crystal", "diamond", "rubber", "velvet", "silk"],
      render: ["3D render", "CGI", "digital art", "digital painting", "vector art", "raster art", "pixel art", "voxel art", "low poly", "high poly", "wireframe", "clay render", "ambient occlusion", "global illumination", "ray tracing", "path tracing", "radiosity", "subsurface scattering", "physically based rendering", "non-photorealistic rendering", "hand-painted", "sketch render", "toon shading", "real-time render", "cinematic render"],
      artist: ["Salvador Dali", "Vincent van Gogh", "Pablo Picasso", "Claude Monet", "Leonardo da Vinci", "Frida Kahlo", "Andy Warhol", "Georgia O'Keeffe", "Jackson Pollock", "Wassily Kandinsky", "Hieronymus Bosch", "Rembrandt", "Johannes Vermeer", "Michelangelo", "Gustav Klimt", "Edvard Munch", "Henri Matisse", "René Magritte", "Banksy", "Yayoi Kusama"],
      genre: ["movie poster", "book cover", "comic book", "video game art", "album cover", "magazine illustration", "storybook", "propaganda poster", "advertisement", "concept art"],
      era: ["medieval", "Victorian", "1920s", "1950s", "1980s", "futuristic", "ancient", "prehistoric", "industrial revolution", "cyber era"],
      cultural_influence: ["Japanese", "African", "Nordic", "Indian", "Celtic", "Chinese", "Mediterranean", "Indigenous", "Middle Eastern", "Latin American"],
      level_of_detail: ["highly detailed", "simplistic", "cartoonish", "sketch-like", "intricate", "sparse", "ornate", "clean", "hyper-realistic", "abstracted"],
      atmosphere: ["cozy", "industrial", "magical", "sterile", "wild", "urban", "rural", "cosmic", "gritty", "ethereal"],
      action: ["running", "dancing", "fighting", "resting", "flying", "exploring", "celebrating", "working", "meditating", "traveling"],
      objects: ["mountains", "rivers", "cars", "robots", "trees", "castles", "spaceships", "books", "mirrors", "clocks"],
      art_medium: ["watercolor", "oil paint", "charcoal", "pencil sketch", "acrylic", "ink", "pastel drawing", "digital painting", "collage", "mosaic"],
      technical_aspects: ["high resolution", "low resolution", "pixelated", "4K", "8K", "retro gaming", "hand-drawn", "photocollage", "matte painting", "blueprint"],
      aspect_ratio: ["portrait", "landscape", "square", "widescreen", "cinematic", "vertical", "horizontal", "panoramic", "circular", "golden rectangle"]
    };
  }

  async checkSiteAccess() {
    try {
      // Get extension settings
      const { includedUrls = [], isEnabled = false } = await new Promise(resolve => {
        chrome.storage.sync.get(['includedUrls', 'isEnabled'], resolve);
      });
      
      if (!isEnabled) {
        return false;
      }
      
      // Get current hostname without www prefix
      const currentUrl = window.location.hostname
        .toLowerCase()
        .replace(/^www\./, '');
      
      // Check if current hostname matches any included URL
      const isIncluded = includedUrls.some(url => {
        // Remove any paths from the stored URL to match just the domain
        const domainToMatch = url.split('/')[0].toLowerCase();
        return currentUrl === domainToMatch || currentUrl.endsWith('.' + domainToMatch);
      });
      
      return isIncluded;
    } catch (error) {
      console.error('Error checking site access:', error);
      return false;
    }
  }
}

// Initialize the enhancer
console.log('[TextEnhancer] Starting initialization...');
new TextEnhancer(); 