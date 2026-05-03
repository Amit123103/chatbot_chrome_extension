/**
 * AI Smart Selection Assistant — Background Service Worker
 * 
 * - Clicking the extension icon → opens the chatbot in a new tab
 * - Keyboard shortcuts → toggle/hide the chatbot
 * - Forwards selected text from content script to chatbot tab
 */

const BACKEND_URL = 'https://chatbot-chrome-extension-wnhp.onrender.com';

let chatTabId = null;
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
    // Just minimize — do nothing for tab mode
    sendResponse({ success: true });

  } else if (message.action === 'restore-stealth-chat') {
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

// ─── Chatbot Tab Management ──────────────────────────────────────────────
async function openChatbot() {
  // If tab already exists, focus it
  if (chatTabId !== null) {
    try {
      var tab = await chrome.tabs.get(chatTabId);
      if (tab) {
        await chrome.tabs.update(chatTabId, { active: true });
        return;
      }
    } catch (e) {
      chatTabId = null;
    }
  }

  // Create a new tab with the chatbot
  try {
    var newTab = await chrome.tabs.create({
      url: chrome.runtime.getURL('popup-chat.html'),
      active: true
    });
    chatTabId = newTab.id;
  } catch (e) {
    console.log('[AI Assistant] Error opening tab:', e.message);
  }

  // Track when tab is closed
  chrome.tabs.onRemoved.addListener(function onRemoved(tabId) {
    if (tabId === chatTabId) {
      chatTabId = null;
      chrome.tabs.onRemoved.removeListener(onRemoved);
    }
  });
}

async function closeChatbot() {
  if (chatTabId !== null) {
    try {
      await chrome.tabs.remove(chatTabId);
    } catch (e) {}
    chatTabId = null;
  }
}

async function toggleChatbot() {
  try {
    if (chatTabId !== null) {
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
