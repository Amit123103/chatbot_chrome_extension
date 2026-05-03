/**
 * AI Smart Selection Assistant — Background Service Worker
 * 
 * - Clicking the extension icon → opens the floating chatbot popup
 * - Keyboard shortcuts → toggle/hide the chatbot
 * - Forwards selected text from content script to chatbot
 */

const BACKEND_URL = 'https://chatbot-chrome-extension-wnhp.onrender.com';

let popupWindowId = null;
let pendingSelection = null;

// ─── CLICKING THE EXTENSION ICON → Opens Chatbot ────────────────────────
chrome.action.onClicked.addListener(function () {
  openChatbot().catch(function () {});
});

// ─── Keyboard Commands (from manifest) ──────────────────────────────────
chrome.commands.onCommand.addListener(function (command) {
  if (command === 'toggle-chat') {
    toggleChatbot();
  } else if (command === 'quick-hide') {
    closeChatbot();
  }
});

// ─── Message Handling ────────────────────────────────────────────────────
chrome.runtime.onMessage.addListener(function (message, sender, sendResponse) {
  if (message.action === 'selection-made') {
    pendingSelection = {
      text: message.text,
      prompt: message.prompt,
      type: message.type
    };
    openChatbot().then(function () {
      setTimeout(function () {
        chrome.runtime.sendMessage({
          action: 'new-selection',
          text: message.text,
          prompt: message.prompt,
          type: message.type
        }).catch(function () {});
      }, 800);
    });
    sendResponse({ success: true });

  } else if (message.action === 'open-stealth-chat') {
    openChatbot();
    sendResponse({ success: true });

  } else if (message.action === 'close-stealth-chat') {
    closeChatbot();
    sendResponse({ success: true });

  } else if (message.action === 'toggle-stealth-chat') {
    toggleChatbot();
    sendResponse({ success: true });

  } else if (message.action === 'hide-stealth-chat') {
    if (popupWindowId !== null) {
      chrome.windows.update(popupWindowId, { state: 'minimized' }).catch(()=>{});
    }
    sendResponse({ success: true });

  } else if (message.action === 'restore-stealth-chat') {
    if (popupWindowId !== null) {
      chrome.windows.update(popupWindowId, { state: 'normal', focused: false }).catch(()=>{});
    }
    sendResponse({ success: true });

  } else if (message.action === 'get-pending-selection') {
    sendResponse({ selection: pendingSelection });
    pendingSelection = null;

  } else if (message.action === 'open-popup-window') {
    openChatbot();
    sendResponse({ success: true });

  } else if (message.action === 'check-backend') {
    fetch(BACKEND_URL + '/health', { method: 'GET' })
      .then(function (r) {
        sendResponse({ status: r.ok ? 'connected' : 'disconnected' });
      })
      .catch(function () {
        sendResponse({ status: 'disconnected' });
      });
    return true;
  }
});

// ─── Chatbot Popup Management ──────────────────────────────────────────────
async function openChatbot() {
  // If window already exists, focus it
  if (popupWindowId !== null) {
    try {
      var win = await chrome.windows.get(popupWindowId);
      if (win) {
        if (win.state === 'minimized') {
          await chrome.windows.update(popupWindowId, { state: 'normal', focused: true });
        } else {
          await chrome.windows.update(popupWindowId, { focused: true });
        }
        return;
      }
    } catch (e) {
      popupWindowId = null;
    }
  }

  // Create a new floating popup window with safe screen coordinates
  try {
    var newWin = await chrome.windows.create({
      url: chrome.runtime.getURL('popup-chat.html'),
      type: 'popup',
      width: 400,
      height: 600,
      top: 100,
      left: 100,
      focused: true
    });
    popupWindowId = newWin.id;
  } catch (e) {
    console.log('[AI Assistant] Error opening window with explicit bounds, falling back to defaults:', e.message);
    try {
      // Fallback 1: No bounds
      var newWinFallback = await chrome.windows.create({
        url: chrome.runtime.getURL('popup-chat.html'),
        type: 'popup',
        focused: true
      });
      popupWindowId = newWinFallback.id;
    } catch (e2) {
      console.log('[AI Assistant] Error opening window with defaults, falling back to tab:', e2.message);
      try {
        // Fallback 2: Normal Tab
        await chrome.tabs.create({ url: chrome.runtime.getURL('popup-chat.html'), active: true });
      } catch (e3) {}
    }
  }

  // Track when window is closed
  chrome.windows.onRemoved.addListener(function onRemoved(winId) {
    if (winId === popupWindowId) {
      popupWindowId = null;
      chrome.windows.onRemoved.removeListener(onRemoved);
    }
  });
}

async function closeChatbot() {
  if (popupWindowId !== null) {
    try {
      await chrome.windows.remove(popupWindowId);
    } catch (e) {}
    popupWindowId = null;
  }
}

async function toggleChatbot() {
  try {
    if (popupWindowId !== null) {
      await closeChatbot();
    } else {
      await openChatbot();
    }
  } catch (e) {}
}

// ─── Extension Install ──────────────────────────────────────────────────
chrome.runtime.onInstalled.addListener(function () {
  console.log('[AI Assistant] Extension installed — click the icon to open chatbot.');
});
