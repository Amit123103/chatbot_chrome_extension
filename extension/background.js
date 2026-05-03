/**
 * AI Smart Selection Assistant — Background Service Worker (Stealth Mode)
 * 
 * - Clicking the extension icon → opens the chatbot popup window
 * - Keyboard shortcuts → toggle/hide the chatbot
 * - Forwards selected text from content script to popup
 * - Auto-hide/restore on tab switch
 */

const BACKEND_URL = 'https://chatbot-chrome-extension-wnhp.onrender.com';

let popupWindowId = null;
let popupWasOpen = false;
let pendingSelection = null;

// ─── CLICKING THE EXTENSION ICON → Opens Chatbot ────────────────────────
chrome.action.onClicked.addListener(() => {
  openPopupWindow();
});

// ─── Keyboard Commands (from manifest) ──────────────────────────────────
chrome.commands.onCommand.addListener(async (command) => {
  if (command === 'toggle-chat') {
    togglePopupWindow();
  } else if (command === 'quick-hide') {
    closePopupWindow();
  }
});

// ─── Message Handling ────────────────────────────────────────────────────
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  switch (message.action) {
    case 'selection-made':
      pendingSelection = {
        text: message.text,
        prompt: message.prompt,
        type: message.type
      };
      openPopupWindow().then(() => {
        setTimeout(() => {
          sendToPopup({
            action: 'new-selection',
            text: message.text,
            prompt: message.prompt,
            type: message.type
          });
        }, 600);
      });
      sendResponse({ success: true });
      break;

    case 'open-stealth-chat':
      openPopupWindow();
      sendResponse({ success: true });
      break;

    case 'close-stealth-chat':
      closePopupWindow();
      sendResponse({ success: true });
      break;

    case 'toggle-stealth-chat':
      togglePopupWindow();
      sendResponse({ success: true });
      break;

    case 'hide-stealth-chat':
      hidePopupWindow();
      sendResponse({ success: true });
      break;

    case 'restore-stealth-chat':
      if (popupWasOpen) restorePopupWindow();
      sendResponse({ success: true });
      break;

    case 'get-pending-selection':
      sendResponse({ selection: pendingSelection });
      pendingSelection = null;
      break;

    case 'open-popup-window':
      openPopupWindow();
      sendResponse({ success: true });
      break;

    case 'check-backend':
      fetch(`${BACKEND_URL}/health`, { method: 'GET' })
        .then(r => r.ok ? sendResponse({ status: 'connected' }) : sendResponse({ status: 'disconnected' }))
        .catch(() => sendResponse({ status: 'disconnected' }));
      return true;

    default:
      break;
  }
});

// ─── Popup Window Management ─────────────────────────────────────────────
async function openPopupWindow() {
  if (popupWindowId !== null) {
    try {
      const win = await chrome.windows.get(popupWindowId);
      if (win.state === 'minimized') {
        await chrome.windows.update(popupWindowId, { state: 'normal', focused: true });
      } else {
        await chrome.windows.update(popupWindowId, { focused: true });
      }
      popupWasOpen = true;
      return;
    } catch {
      popupWindowId = null;
    }
  }

  try {
    const win = await chrome.windows.create({
      url: chrome.runtime.getURL('popup-chat.html'),
      type: 'popup',
      width: 420,
      height: 580,
      focused: true
    });

    popupWindowId = win.id;
    popupWasOpen = true;
  } catch (e) {
    console.log('[AI Assistant] Could not open popup:', e.message);
    return;
  }

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
    try { await chrome.windows.remove(popupWindowId); } catch {}
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

function sendToPopup(message) {
  if (popupWindowId === null) return;
  chrome.runtime.sendMessage(message).catch(() => {});
}

// ─── Extension Install ──────────────────────────────────────────────────
chrome.runtime.onInstalled.addListener(() => {
  console.log('[AI Assistant] Extension installed — click the icon to open chatbot.');
});
