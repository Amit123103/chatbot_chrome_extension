/**
 * AI Smart Selection Assistant — Background Service Worker (Stealth Mode)
 * 
 * Manages the stealth popup window lifecycle:
 * - Opens/closes/hides the popup window
 * - Forwards selected text from content script to popup
 * - Handles all keyboard command routing
 * - Popup window is separate from the tab = invisible to tab capture
 */

let popupWindowId = null;
let popupWasOpen = false;
let pendingSelection = null;

// ─── Keyboard Command Handling (from manifest) ──────────────────────────
chrome.commands.onCommand.addListener(async (command) => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) return;

  if (command === 'toggle-chat') {
    togglePopupWindow();
  } else if (command === 'quick-hide') {
    closePopupWindow();
  } else if (command === 'popup-mode') {
    openPopupWindow();
  }
});

// ─── Message Handling ────────────────────────────────────────────────────
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  switch (message.action) {
    // Content script: text was selected
    case 'selection-made':
      pendingSelection = {
        text: message.text,
        prompt: message.prompt,
        type: message.type
      };
      openPopupWindow().then(() => {
        // Send to popup after a short delay to let it initialize
        setTimeout(() => {
          sendToPopup({
            action: 'new-selection',
            text: message.text,
            prompt: message.prompt,
            type: message.type
          });
        }, 500);
      });
      sendResponse({ success: true });
      break;

    // Content script: open chat
    case 'open-stealth-chat':
      openPopupWindow();
      sendResponse({ success: true });
      break;

    // Content script: close chat
    case 'close-stealth-chat':
      closePopupWindow();
      sendResponse({ success: true });
      break;

    // Content script: toggle chat
    case 'toggle-stealth-chat':
      togglePopupWindow();
      sendResponse({ success: true });
      break;

    // Content script: hide (minimize) on fullscreen/blur
    case 'hide-stealth-chat':
      hidePopupWindow();
      sendResponse({ success: true });
      break;

    // Content script: restore after tab regains focus
    case 'restore-stealth-chat':
      if (popupWasOpen) {
        restorePopupWindow();
      }
      sendResponse({ success: true });
      break;

    // Popup window: requesting pending selection data
    case 'get-pending-selection':
      sendResponse({ selection: pendingSelection });
      pendingSelection = null;
      break;

    // Popup panel: open popup window
    case 'open-popup-window':
      openPopupWindow();
      sendResponse({ success: true });
      break;

    // Health check from popup panel
    case 'check-backend':
      fetch('http://localhost:3001/health', { method: 'GET' })
        .then(r => r.ok ? sendResponse({ status: 'connected' }) : sendResponse({ status: 'disconnected' }))
        .catch(() => sendResponse({ status: 'disconnected' }));
      return true; // async response

    default:
      break;
  }
});

// ─── Popup Window Management ─────────────────────────────────────────────

async function openPopupWindow() {
  // If already open, just focus it
  if (popupWindowId !== null) {
    try {
      await chrome.windows.update(popupWindowId, { focused: true });
      popupWasOpen = true;
      return;
    } catch {
      popupWindowId = null;
    }
  }

  // Position: bottom-right corner of the screen
  const screenWidth = 1920; // fallback
  const screenHeight = 1080;

  const win = await chrome.windows.create({
    url: chrome.runtime.getURL('popup-chat.html'),
    type: 'popup',
    width: 420,
    height: 580,
    top: screenHeight - 620,
    left: screenWidth - 460,
    focused: true
  });

  popupWindowId = win.id;
  popupWasOpen = true;

  // Track window close
  chrome.windows.onRemoved.addListener(function onRemoved(wId) {
    if (wId === popupWindowId) {
      popupWindowId = null;
      popupWasOpen = false;
      chrome.windows.onRemoved.removeListener(onRemoved);
    }
  });
}

async function closePopupWindow() {
  if (popupWindowId !== null) {
    try {
      await chrome.windows.remove(popupWindowId);
    } catch {
      // Already closed
    }
    popupWindowId = null;
    popupWasOpen = false;
  }
}

async function togglePopupWindow() {
  if (popupWindowId !== null) {
    closePopupWindow();
  } else {
    openPopupWindow();
  }
}

async function hidePopupWindow() {
  if (popupWindowId !== null) {
    try {
      // Minimize the window (makes it disappear from screen)
      await chrome.windows.update(popupWindowId, { state: 'minimized' });
      popupWasOpen = true;
    } catch {
      popupWindowId = null;
      popupWasOpen = false;
    }
  }
}

async function restorePopupWindow() {
  if (popupWindowId !== null) {
    try {
      await chrome.windows.update(popupWindowId, { state: 'normal', focused: false });
    } catch {
      popupWindowId = null;
      popupWasOpen = false;
    }
  }
}

// Send a message to the popup window's page
function sendToPopup(message) {
  if (popupWindowId === null) return;
  // Broadcast to all extension pages — popup-chat.html will pick it up
  chrome.runtime.sendMessage(message).catch(() => {});
}

// ─── Extension Install ──────────────────────────────────────────────────
chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === 'install') {
    console.log('[AI Assistant] Extension installed — Stealth Mode active.');
  }
});
