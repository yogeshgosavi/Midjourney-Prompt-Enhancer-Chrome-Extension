// Icon paths
const ICONS = {
  enabled: {
    "16": "icons/enabled/icon16.png",
    "32": "icons/enabled/icon32.png",
    "48": "icons/enabled/icon48.png",
    "128": "icons/enabled/icon128.png"
  },
  disabled: {
    "16": "icons/disabled/icon16.png",
    "32": "icons/disabled/icon32.png",
    "48": "icons/disabled/icon48.png",
    "128": "icons/disabled/icon128.png"
  }
};

// Default settings
const DEFAULT_SETTINGS = {
  isEnabled: true,
  includedUrls: [
    'midjourney.com',
    'alpha.midjourney.com'
  ]
};

// Initialize default settings on installation
chrome.runtime.onInstalled.addListener(({ reason }) => {
  if (reason === 'install') {
    chrome.storage.sync.set(DEFAULT_SETTINGS);
  }
});

// Update tooltip based on URL and enabled state
async function updateTooltip(tabId) {
  try {
    const tab = await chrome.tabs.get(tabId);
    const { includedUrls = DEFAULT_SETTINGS.includedUrls, isEnabled = DEFAULT_SETTINGS.isEnabled } = 
      await new Promise(resolve => {
        chrome.storage.sync.get(['includedUrls', 'isEnabled'], resolve);
      });

    // Get just the hostname without www prefix
    const hostname = new URL(tab.url).hostname.toLowerCase().replace(/^www\./, '');
    
    // Check if hostname matches any included domain
    const isUrlEnabled = includedUrls.some(url => {
      // Remove any paths from the stored URL to match just the domain
      const domainToMatch = url.split('/')[0].toLowerCase();
      return hostname === domainToMatch || hostname.endsWith('.' + domainToMatch);
    });
    
    const shouldBeEnabled = isEnabled && isUrlEnabled;

    const tooltip = shouldBeEnabled 
      ? 'Midjourney Prompt Enhancer (Enabled for this site)'
      : 'Midjourney Prompt Enhancer (Disabled for this site)';
    await chrome.action.setTitle({ tabId: tabId, title: tooltip });
  } catch (error) {
    console.error('Error updating tooltip:', error);
  }
}

// Listen for tab updates
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete') {
    updateTooltip(tabId);
  }
});

// Listen for tab activation
chrome.tabs.onActivated.addListener(({ tabId }) => {
  updateTooltip(tabId);
});

// Listen for storage changes
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'sync' && (changes.includedUrls || changes.isEnabled)) {
    chrome.tabs.query({}, tabs => {
      tabs.forEach(tab => updateTooltip(tab.id));
    });
  }
}); 