class KeywordManager {
  constructor() {
    this.tableBody = document.getElementById('keywordTableBody');
    this.searchInput = document.getElementById('searchInput');
    this.newKeyword = document.getElementById('newKeyword');
    this.newOptions = document.getElementById('newOptions');
    this.addKeywordBtn = document.getElementById('addKeywordBtn');
    this.toast = document.getElementById('toast');
    this.keywords = {};
    this.editingRow = null;
    this.includedUrls = [];

    this.init();
  }

  async init() {
    await this.loadKeywords();
    await this.loadIncludedUrls();
    this.setupEventListeners();
    this.renderSiteList();
  }

  async loadIncludedUrls() {
    const data = await this.getStorageData('includedUrls');
    this.includedUrls = data.includedUrls || [];
  }

  setupEventListeners() {
    this.addKeywordBtn.addEventListener('click', () => this.addKeyword());
    this.searchInput.addEventListener('input', () => this.filterKeywords());
    
    // Handle Enter key in the new keyword input
    this.newKeyword.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        this.newOptions.focus();
      }
    });

    // Handle Ctrl+Enter or Cmd+Enter in the options textarea
    this.newOptions.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        e.preventDefault();
        this.addKeyword();
      }
    });

    // Site management event listeners
    document.getElementById('addSiteBtn').addEventListener('click', () => this.addSite());
  }

  async loadKeywords() {
    const data = await this.getStorageData('keywords');
    this.keywords = data.keywords || this.getDefaultKeywords();
    this.renderKeywords();
  }

  renderKeywords(filter = '') {
    this.tableBody.innerHTML = '';
    const keywords = Object.entries(this.keywords)
      .filter(([keyword]) => keyword.includes(filter.toLowerCase()));
    
    if (keywords.length === 0) {
      const row = document.createElement('tr');
      row.innerHTML = `
        <td colspan="3" style="text-align: center; color: #888;">
          ${filter ? 'No keywords match your search' : 'No keywords found. Add some below!'}
        </td>
      `;
      this.tableBody.appendChild(row);
      return;
    }
    
    keywords.forEach(([keyword, options]) => {
      const row = document.createElement('tr');
      row.dataset.keyword = keyword;
      
      // Keyword cell
      const keywordCell = document.createElement('td');
      keywordCell.textContent = keyword;
      row.appendChild(keywordCell);
      
      // Options cell
      const optionsCell = document.createElement('td');
      optionsCell.className = 'options-cell';
      
      // Options display
      const optionsDisplay = document.createElement('div');
      optionsDisplay.className = 'options-display';
      
      if (keyword === 'color') {
        options.forEach(option => {
          const tag = document.createElement('span');
          tag.className = 'option-tag color-tag';
          const preview = document.createElement('span');
          preview.className = 'color-preview';
          preview.style.backgroundColor = option;
          tag.appendChild(preview);
          tag.appendChild(document.createTextNode(option));
          optionsDisplay.appendChild(tag);
        });
      } else {
        options.forEach(option => {
          const tag = document.createElement('span');
          tag.className = 'option-tag';
          tag.textContent = option;
          optionsDisplay.appendChild(tag);
        });
      }
      
      // Inline edit textarea
      const editInput = document.createElement('textarea');
      editInput.className = 'inline-edit';
      editInput.value = options.join('\n');
      
      optionsCell.appendChild(optionsDisplay);
      optionsCell.appendChild(editInput);
      row.appendChild(optionsCell);
      
      // Actions cell
      const actionsCell = document.createElement('td');
      const editBtn = document.createElement('button');
      editBtn.className = 'btn btn-edit';
      editBtn.textContent = 'Edit';
      editBtn.addEventListener('click', () => this.startEditing(row));
      
      const deleteBtn = document.createElement('button');
      deleteBtn.className = 'btn btn-delete';
      deleteBtn.textContent = 'Delete';
      deleteBtn.addEventListener('click', () => this.deleteKeyword(keyword));
      
      actionsCell.appendChild(editBtn);
      actionsCell.appendChild(deleteBtn);
      row.appendChild(actionsCell);
      
      this.tableBody.appendChild(row);
    });
  }

  startEditing(row) {
    if (this.editingRow) {
      this.cancelEditing();
    }

    this.editingRow = row;
    row.classList.add('editing');
    
    const actionsCell = row.cells[2];
    const oldButtons = actionsCell.innerHTML;
    actionsCell.innerHTML = `
      <button class="btn btn-save">Save</button>
      <button class="btn btn-cancel">Cancel</button>
    `;
    
    actionsCell.querySelector('.btn-save').addEventListener('click', () => this.saveEditing(row, oldButtons));
    actionsCell.querySelector('.btn-cancel').addEventListener('click', () => this.cancelEditing(oldButtons));
    
    const textarea = row.querySelector('.inline-edit');
    textarea.style.height = row.querySelector('.options-display').offsetHeight + 'px';
    textarea.focus();
  }

  async saveEditing(row, oldButtons) {
    const keyword = row.dataset.keyword;
    const textarea = row.querySelector('.inline-edit');
    const options = textarea.value
      .split('\n')
      .map(opt => opt.trim())
      .filter(opt => opt);

    if (!options.length) {
      this.showToast('Please enter at least one option', true);
      return;
    }

    this.keywords[keyword] = options;
    await this.setStorageData({ keywords: this.keywords });
    
    row.classList.remove('editing');
    this.editingRow = null;
    this.renderKeywords(this.searchInput.value);
    this.showToast('Changes saved successfully');
  }

  cancelEditing() {
    if (!this.editingRow) return;
    
    this.editingRow.classList.remove('editing');
    this.editingRow = null;
    this.renderKeywords(this.searchInput.value);
  }

  async addKeyword() {
    const keyword = this.newKeyword.value.trim().toLowerCase();
    const options = this.newOptions.value
      .split('\n')
      .map(opt => opt.trim())
      .filter(opt => opt);

    if (!keyword) {
      this.showToast('Please enter a keyword', true);
      return;
    }

    if (!options.length) {
      this.showToast('Please enter at least one option', true);
      return;
    }

    if (this.keywords[keyword]) {
      this.showToast('This keyword already exists. Edit it instead.', true);
      return;
    }

    this.keywords[keyword] = options;
    await this.setStorageData({ keywords: this.keywords });
    
    this.newKeyword.value = '';
    this.newOptions.value = '';
    this.renderKeywords(this.searchInput.value);
    this.showToast('Keyword added successfully');
    this.newKeyword.focus();
  }

  async deleteKeyword(keyword) {
    if (!confirm(`Are you sure you want to delete "${keyword}"?`)) return;

    delete this.keywords[keyword];
    await this.setStorageData({ keywords: this.keywords });
    this.renderKeywords(this.searchInput.value);
    this.showToast('Keyword deleted successfully');
  }

  filterKeywords() {
    const filter = this.searchInput.value.trim();
    this.renderKeywords(filter);
  }

  showToast(message, isError = false) {
    this.toast.textContent = message;
    this.toast.className = `toast show${isError ? ' error' : ''}`;
    
    setTimeout(() => {
      this.toast.classList.remove('show');
    }, 3000);
  }

  getStorageData(key) {
    return new Promise(resolve => {
      chrome.storage.sync.get(key, resolve);
    });
  }

  setStorageData(data) {
    return new Promise(resolve => {
      chrome.storage.sync.set(data, resolve);
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

  async addSite() {
    const url = prompt('Enter the website URL (e.g., example.com):');
    if (!url) return;

    const cleanUrl = url.toLowerCase().trim()
      .replace(/^https?:\/\//i, '')  // Remove protocol
      .replace(/^www\./i, '')        // Remove www
      .split('/')[0];                // Remove path

    if (this.includedUrls.includes(cleanUrl)) {
      this.showToast('This site is already in the list', true);
      return;
    }

    this.includedUrls.push(cleanUrl);
    await this.setStorageData({ includedUrls: this.includedUrls });
    this.renderSiteList();
    this.showToast('Site added successfully');
  }

  async deleteSite(url) {
    if (!confirm(`Are you sure you want to remove "${url}" from the list?`)) return;

    this.includedUrls = this.includedUrls.filter(u => u !== url);
    await this.setStorageData({ includedUrls: this.includedUrls });
    this.renderSiteList();
    this.showToast('Site removed successfully');
  }

  renderSiteList() {
    const siteList = document.getElementById('siteList');
    siteList.innerHTML = '';

    if (this.includedUrls.length === 0) {
      const emptyMessage = document.createElement('li');
      emptyMessage.className = 'empty-message';
      emptyMessage.textContent = 'No sites added yet. The extension will be inactive everywhere.';
      siteList.appendChild(emptyMessage);
      return;
    }

    this.includedUrls.forEach(url => {
      const li = document.createElement('li');
      li.className = 'site-item';
      
      const urlText = document.createElement('span');
      urlText.textContent = url;
      li.appendChild(urlText);

      const deleteBtn = document.createElement('button');
      deleteBtn.className = 'btn btn-delete';
      deleteBtn.textContent = 'Remove';
      deleteBtn.addEventListener('click', () => this.deleteSite(url));
      li.appendChild(deleteBtn);

      siteList.appendChild(li);
    });
  }
}

// Initialize the keyword manager
new KeywordManager();

// Default settings (matching background.js)
const DEFAULT_SETTINGS = {
  isEnabled: true,
  includedUrls: [
    'midjourney.com/imagine',
    'alpha.midjourney.com/imagine'
  ]
};

// Load settings from storage
async function loadSettings() {
  const { includedUrls = DEFAULT_SETTINGS.includedUrls } = await chrome.storage.sync.get('includedUrls');
  displayUrls(includedUrls);
}

// Initialize page
document.addEventListener('DOMContentLoaded', loadSettings); 