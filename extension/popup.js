/**
 * AI Smart Selection Assistant — Popup Script
 * Handles extension popup UI interactions.
 */

document.addEventListener('DOMContentLoaded', () => {
  checkBackendStatus();
  loadSettings();

  document.getElementById('enableToggle').addEventListener('change', handleToggle);
  document.getElementById('openPopupBtn').addEventListener('click', handleOpenPopup);
});

async function checkBackendStatus() {
  const dot = document.querySelector('.status-dot');
  const text = document.getElementById('statusText');

  try {
    const response = await chrome.runtime.sendMessage({ action: 'check-backend' });
    if (response?.status === 'connected') {
      dot.className = 'status-dot connected';
      text.textContent = 'Connected';
    } else {
      dot.className = 'status-dot disconnected';
      text.textContent = 'Disconnected';
    }
  } catch {
    dot.className = 'status-dot disconnected';
    text.textContent = 'Disconnected';
  }
}

async function loadSettings() {
  try {
    const result = await chrome.storage.local.get(['enabled']);
    const enabled = result.enabled !== undefined ? result.enabled : true;
    document.getElementById('enableToggle').checked = enabled;
  } catch {
    document.getElementById('enableToggle').checked = true;
  }
}

async function handleToggle(e) {
  const enabled = e.target.checked;
  await chrome.storage.local.set({ enabled });

  // Notify active tab
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab?.id) {
    chrome.tabs.sendMessage(tab.id, {
      action: enabled ? 'enable' : 'disable'
    }).catch(() => {});
  }
}

async function handleOpenPopup() {
  chrome.runtime.sendMessage({ action: 'open-popup-window' });
  window.close();
}
