document.addEventListener('DOMContentLoaded', async () => {
  const toggleBtn = document.getElementById('toggleBtn');
  const settingsBtn = document.getElementById('settingsBtn');
  const statusText = document.getElementById('statusText');

  // Load initial state
  const { isEnabled = false } = await chrome.storage.sync.get('isEnabled');
  updateToggleState(isEnabled);

  // Handle toggle button click
  toggleBtn.addEventListener('click', async () => {
    const { isEnabled = false } = await chrome.storage.sync.get('isEnabled');
    const newState = !isEnabled;
    
    await chrome.storage.sync.set({ isEnabled: newState });
    updateToggleState(newState);

    // Update status text
    statusText.textContent = newState ? 'Active' : 'Disabled';
  });

  // Handle settings button click
  settingsBtn.addEventListener('click', () => {
    chrome.runtime.openOptionsPage();
  });

  // Check if current site is in included URLs
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const { includedUrls = [] } = await chrome.storage.sync.get('includedUrls');
  const isIncluded = includedUrls.some(url => tab.url.includes(url));
  
  statusText.textContent = isIncluded ? 'Active on this site' : 'Inactive on this site';
});

function updateToggleState(isEnabled) {
  const toggleBtn = document.getElementById('toggleBtn');
  toggleBtn.textContent = isEnabled ? 'Disable Extension' : 'Enable Extension';
  toggleBtn.style.background = isEnabled ? 'var(--success-color)' : 'var(--primary-color)';
} 