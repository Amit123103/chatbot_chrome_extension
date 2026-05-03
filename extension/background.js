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
    let wasOpen = popupWindowId !== null;
    openChatbot().then(function () {
      if (wasOpen) {
        // If window is already open, it won't fetch pendingSelection on load, so we push it.
        // Adding a tiny 50ms delay to ensure focus completes before sending.
        setTimeout(function () {
          chrome.runtime.sendMessage({
            action: 'new-selection',
            text: message.text,
            prompt: message.prompt,
            type: message.type
          }).catch(function () {});
        }, 50);
        pendingSelection = null;
      }
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

  // Calculate safe bounds using chrome.system.display to guarantee no errors
  try {
    const displays = await chrome.system.display.getInfo();
    const primary = displays.find(d => d.isPrimary) || displays[0];
    
    // Fallbacks if display info is unavailable
    const sw = primary && primary.workArea ? primary.workArea.width : 1920;
    const sh = primary && primary.workArea ? primary.workArea.height : 1080;
    const sx = primary && primary.workArea ? primary.workArea.left : 0;
    const sy = primary && primary.workArea ? primary.workArea.top : 0;

    const width = 420;
    const height = 620;
    const left = Math.max(sx, Math.floor(sx + (sw - width) / 2));
    const top = Math.max(sy, Math.floor(sy + (sh - height) / 2));

    var newWin = await chrome.windows.create({
      url: chrome.runtime.getURL('popup-chat.html'),
      type: 'popup',
      width: width,
      height: height,
      top: top,
      left: left,
      focused: true
    });
    popupWindowId = newWin.id;
  } catch (e) {
    // Ultimate fallback: Tab
    try {
      var tab = await chrome.tabs.create({ url: chrome.runtime.getURL('popup-chat.html'), active: true });
      popupWindowId = tab.id; // Store tab ID to prevent multi-open
    } catch (e2) {}
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

// ─── Browser Startup & Extension Install ──────────────────────────────────
chrome.runtime.onStartup.addListener(function () {
  console.log('[AI Assistant] Chrome started — auto-opening chatbot.');
  openChatbot().catch(function () {});
});

chrome.runtime.onInstalled.addListener(function () {
  console.log('[AI Assistant] Extension installed — auto-opening chatbot.');
  openChatbot().catch(function () {});
});
