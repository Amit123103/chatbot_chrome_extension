const BACKEND_URL = 'https://chatbot-chrome-extension-wnhp.onrender.com';
const messagesEl = document.getElementById('messages');
const inputEl = document.getElementById('input');
const sendBtn = document.getElementById('sendBtn');
const clearBtn = document.getElementById('clearBtn');
const closeBtn = document.getElementById('closeBtn');

// ─── Theme Management ────────────────────────────────────────
const themeBtn = document.getElementById('themeBtn');

function initTheme() {
  const savedTheme = localStorage.getItem('chat-theme') || 'dark';
  document.documentElement.setAttribute('data-theme', savedTheme);
}

function toggleTheme() {
  const current = document.documentElement.getAttribute('data-theme') || 'dark';
  const next = current === 'dark' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', next);
  localStorage.setItem('chat-theme', next);
}

initTheme();
themeBtn.addEventListener('click', toggleTheme);

// ─── Event Listeners ───────────────────────────────────────
sendBtn.addEventListener('click', handleSend);
inputEl.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); }
});
clearBtn.addEventListener('click', clearChat);
closeBtn.addEventListener('click', () => window.close());

// Keyboard: Ctrl+Z to close this window too
document.addEventListener('keydown', (e) => {
  if (e.ctrlKey && !e.shiftKey && e.key === 'z') {
    const tag = document.activeElement?.tagName?.toLowerCase();
    if (tag !== 'input' && tag !== 'textarea') {
      window.close();
    }
  }
});

// ─── Listen for selections from background ─────────────────
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'new-selection') {
    handleNewSelection(message);
    sendResponse({ success: true });
  }
});

// On load: check if there's a pending selection
chrome.runtime.sendMessage({ action: 'get-pending-selection' }, (response) => {
  if (response?.selection) {
    handleNewSelection(response.selection);
  }
});

// ─── Handle new selection from content script ──────────────
async function handleNewSelection(data) {
  removeWelcome();
  addUserMessage(data.text, data.type === 'code');
  addLoading();

  try {
    const res = await fetch(`${BACKEND_URL}/ask`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt: data.prompt, type: data.type })
    });
    const result = await res.json();
    removeLoading();

    if (res.ok && result.response) {
      addAIMessage(result.response);
    } else {
      addError(result.error || 'Unknown error from server.');
    }
  } catch (err) {
    removeLoading();
    addError('Cannot connect to backend. Is it running on port 3001?');
  }
}

// ─── Manual Send ───────────────────────────────────────────
async function handleSend() {
  const text = inputEl.value.trim();
  if (!text) return;
  inputEl.value = '';
  removeWelcome();

  // User message
  const userDiv = document.createElement('div');
  userDiv.className = 'msg msg-user';
  userDiv.innerHTML = `<div class="msg-header"><span class="msg-role">You</span></div><div class="msg-body"><p>${esc(text)}</p></div>`;
  messagesEl.appendChild(userDiv);
  scroll();

  addLoading();

  try {
    const res = await fetch(`${BACKEND_URL}/ask`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt: text, type: 'text' })
    });
    const data = await res.json();
    removeLoading();

    if (res.ok && data.response) {
      addAIMessage(data.response);
    } else {
      addError(data.error || 'Unknown error.');
    }
  } catch {
    removeLoading();
    addError('Cannot connect to backend. Is it running on port 3001?');
  }
}

// ─── Message Helpers ───────────────────────────────────────
function addUserMessage(text, isCode) {
  removeWelcome();
  const badge = isCode
    ? '<span class="msg-badge code">Code</span>'
    : '<span class="msg-badge text">Text</span>';
  const preview = text.length > 200 ? text.substring(0, 200) + '…' : text;

  const div = document.createElement('div');
  div.className = 'msg msg-user';
  div.innerHTML = `
    <div class="msg-header"><span class="msg-role">You</span>${badge}</div>
    <div class="msg-body">${isCode ? '<pre><code>' + esc(preview) + '</code></pre>' : '<p>' + esc(preview) + '</p>'}</div>
  `;
  messagesEl.appendChild(div);
  scroll();
}

function addAIMessage(text) {
  const div = document.createElement('div');
  div.className = 'msg msg-ai';
  div.innerHTML = `
    <div class="msg-header"><span class="msg-role">AI Assistant</span></div>
    <div class="msg-body">${fmt(text)}</div>
  `;
  messagesEl.appendChild(div);

  // Copy buttons
  div.querySelectorAll('pre').forEach(pre => {
    const btn = document.createElement('button');
    btn.className = 'copy-btn'; btn.textContent = 'Copy';
    btn.onclick = () => {
      navigator.clipboard.writeText(pre.querySelector('code')?.textContent || pre.textContent);
      btn.textContent = 'Copied!'; btn.classList.add('copied');
      setTimeout(() => { btn.textContent = 'Copy'; btn.classList.remove('copied'); }, 2000);
    };
    pre.appendChild(btn);
  });

  scroll();
}

function addLoading() {
  removeLoading();
  const div = document.createElement('div');
  div.className = 'msg msg-ai';
  div.id = 'loadingMsg';
  div.innerHTML = `
    <div class="msg-header"><span class="msg-role">AI Assistant</span></div>
    <div class="msg-body">
      <div class="loading-dots"><span></span><span></span><span></span></div>
      <span class="loading-text">Analyzing...</span>
    </div>
  `;
  messagesEl.appendChild(div);
  scroll();
}

function removeLoading() {
  document.getElementById('loadingMsg')?.remove();
}

function addError(msg) {
  removeLoading();
  const div = document.createElement('div');
  div.className = 'error-msg';
  div.innerHTML = `<span>⚠️</span><span>${esc(msg)}</span>`;
  messagesEl.appendChild(div);
  scroll();
}

function removeWelcome() {
  document.getElementById('welcome')?.remove();
}

function clearChat() {
  messagesEl.innerHTML = `
    <div class="welcome" id="welcome">
      <div class="welcome-icon">
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
          <path d="M12 2L2 7l10 5 10-5-10-5z"/>
          <path d="M2 17l10 5 10-5"/>
          <path d="M2 12l10 5 10-5"/>
        </svg>
      </div>
      <h3>AI Smart Selection Assistant</h3>
      <p>Select text on any page, or type a question below.</p>
      <div class="shortcuts">
        <span><kbd>Ctrl</kbd>+<kbd>X</kbd> Open Chat</span>
        <span><kbd>Ctrl</kbd>+<kbd>Z</kbd> Close Chat</span>
      </div>
    </div>`;
}

// ─── Formatting ────────────────────────────────────────────
function fmt(text) {
  let h = text.replace(/```(\w*)\n([\s\S]*?)```/g, (_, l, c) =>
    `<pre><code>${esc(c.trim())}</code></pre>`);
  h = h.replace(/`([^`]+)`/g, '<code>$1</code>');
  h = h.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
  h = h.replace(/^### (.*$)/gm, '<h4>$1</h4>');
  h = h.replace(/^## (.*$)/gm, '<h3>$1</h3>');
  h = h.replace(/^# (.*$)/gm, '<h2>$1</h2>');
  h = h.replace(/^\d+\.\s+(.*$)/gm, '<li class="ol">$1</li>');
  h = h.replace(/^[-*]\s+(.*$)/gm, '<li>$1</li>');
  h = h.replace(/\n\n/g, '</p><p>');
  h = h.replace(/\n/g, '<br/>');
  if (!h.startsWith('<')) h = '<p>' + h + '</p>';
  return h;
}

function esc(s) {
  const m = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' };
  return s.replace(/[&<>"']/g, c => m[c]);
}

function scroll() {
  messagesEl.scrollTop = messagesEl.scrollHeight;
}
