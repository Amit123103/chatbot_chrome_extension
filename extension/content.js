/**
 * AI Smart Selection Assistant — Content Script (Stealth Mode)
 * 
 * STEALTH ARCHITECTURE:
 * - ZERO DOM injection on the page (nothing to detect or capture)
 * - Chat runs ONLY in a separate Chrome popup window
 * - Popup window is NOT part of the tab — invisible to tab-capture
 * - Selected text is sent to background → forwarded to popup window
 * - Ctrl+X opens, Ctrl+Z closes
 * - Auto-hides on fullscreen, tab switch, and focus loss
 */

(function () {
  'use strict';

  const MIN_TEXT_LENGTH = 5;
  const DEBOUNCE_MS = 400;

  let debounceTimer = null;
  let extensionEnabled = true;

  // ─── Runtime Validity Check ─────────────────────────────────────────────
  // After extension reload, old content scripts lose their connection.
  // This check prevents "Extension context invalidated" errors.
  function isRuntimeValid() {
    try {
      return !!(chrome.runtime && chrome.runtime.id);
    } catch {
      return false;
    }
  }

  function safeSendMessage(msg) {
    if (!isRuntimeValid()) return;
    chrome.runtime.sendMessage(msg).catch(() => {});
  }

  // ─── Code Detection ─────────────────────────────────────────────────────
  function isCode(text) {
    const codePatterns = [
      /function\s+\w+\s*\(/,
      /const\s+\w+\s*=/,
      /let\s+\w+\s*=/,
      /var\s+\w+\s*=/,
      /=>\s*\{/,
      /if\s*\(.*\)\s*\{/,
      /for\s*\(.*\)\s*\{/,
      /while\s*\(.*\)\s*\{/,
      /class\s+\w+/,
      /import\s+.*from/,
      /require\s*\(/,
      /def\s+\w+\s*\(/,
      /print\s*\(/,
      /public\s+(static\s+)?void/,
      /System\.out\.println/,
      /#include\s*</,
      /std::/,
      /SELECT\s+.*FROM/i,
      /CREATE\s+TABLE/i,
      /console\.log\s*\(/,
      /document\.querySelector/,
      /addEventListener\s*\(/,
      /\}\s*else\s*\{/,
      /return\s+.*;/,
      /async\s+function/,
      /await\s+/,
      /try\s*\{/,
      /catch\s*\(/,
      /throw\s+new/,
      /interface\s+\w+/,
      /type\s+\w+\s*=/,
      /<\/?[a-z]+[^>]*>/i,
      /\{\{.*\}\}/,
      /\w+\.\w+\(.*\)/,
    ];

    const indicators = ['{', '}', ';', '=>', '===', '!==', '&&', '||', '++', '--', '//'];
    let score = 0;

    for (const pattern of codePatterns) {
      if (pattern.test(text)) score += 2;
    }
    for (const ind of indicators) {
      if (text.includes(ind)) score += 1;
    }

    const lines = text.split('\n');
    if (lines.length > 1) {
      const indented = lines.filter(l => /^\s{2,}/.test(l)).length;
      if (indented / lines.length > 0.3) score += 3;
    }

    return score >= 4;
  }

  // ─── Build Prompt ────────────────────────────────────────────────────────
  function buildPrompt(text, isCodeText) {
    if (isCodeText) {
      return `You are an expert code analyst. Analyze the following code and provide:

1. **Language Detection**: Identify the programming language.
2. **Code Explanation**: Explain what the code does in simple terms.
3. **Bug Detection**: Identify any bugs, errors, or potential issues.
4. **Optimization**: Suggest performance and readability improvements.
5. **Best Practices**: Note any violations of coding best practices.

Format your response with clear headings and use code blocks for any code suggestions.

\`\`\`
${text}
\`\`\``;
    }

    return `You are a knowledgeable AI assistant. The user selected the following text from a webpage. Provide a helpful, clear, and concise response.

If it's a question, answer it directly.
If it's a concept, explain it clearly.
If it contains data, analyze and summarize it.

Selected text:
"${text}"`;
  }

  // ─── Send selected text to popup window via background ──────────────────
  function sendSelectionToPopup(selectedText) {
    const trimmed = selectedText.trim();
    if (trimmed.length < MIN_TEXT_LENGTH) return;
    if (!extensionEnabled) return;
    if (!isRuntimeValid()) return;

    const isCodeText = isCode(trimmed);
    const prompt = buildPrompt(trimmed, isCodeText);

    safeSendMessage({
      action: 'selection-made',
      text: trimmed,
      prompt: prompt,
      type: isCodeText ? 'code' : 'text'
    });
  }

  // ─── Text Selection Listener (with debounce) ───────────────────────────
  document.addEventListener('mouseup', () => {
    if (!extensionEnabled || !isRuntimeValid()) return;
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      const selection = window.getSelection();
      const selectedText = selection?.toString();
      if (selectedText && selectedText.trim().length >= MIN_TEXT_LENGTH) {
        sendSelectionToPopup(selectedText);
      }
    }, DEBOUNCE_MS);
  });

  // ─── Keyboard Shortcuts ────────────────────────────────────────────────
  // Ctrl+X → Open chatbot popup
  // Ctrl+Z → Close chatbot popup
  document.addEventListener('keydown', (e) => {
    if (!isRuntimeValid()) return;

    // Ctrl+X — Open chatbot (intercept only when nothing is selected to avoid breaking Cut)
    if (e.ctrlKey && !e.shiftKey && !e.altKey && e.key === 'x') {
      const sel = window.getSelection()?.toString()?.trim();
      if (!sel || sel.length === 0) {
        e.preventDefault();
        e.stopPropagation();
        safeSendMessage({ action: 'open-stealth-chat' });
      }
    }

    // Ctrl+Z — Close chatbot (intercept only when not in an input/textarea)
    if (e.ctrlKey && !e.shiftKey && !e.altKey && e.key === 'z') {
      const tag = document.activeElement?.tagName?.toLowerCase();
      const isEditable = tag === 'input' || tag === 'textarea' || document.activeElement?.isContentEditable;
      if (!isEditable) {
        e.preventDefault();
        e.stopPropagation();
        safeSendMessage({ action: 'close-stealth-chat' });
      }
    }
  }, true);

  // ─── Fullscreen Detection — Auto-hide on fullscreen ─────────────────────
  document.addEventListener('fullscreenchange', () => {
    if (document.fullscreenElement) {
      safeSendMessage({ action: 'hide-stealth-chat' });
    }
  });

  // ─── Auto-hide on Tab Visibility Change ─────────────────────────────────
  document.addEventListener('visibilitychange', () => {
    if (!isRuntimeValid()) return;
    if (document.hidden) {
      safeSendMessage({ action: 'hide-stealth-chat' });
    } else {
      safeSendMessage({ action: 'restore-stealth-chat' });
    }
  });

  // ─── Message Listener from Background ───────────────────────────────────
  if (isRuntimeValid()) {
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      if (!isRuntimeValid()) return;
      if (message.action === 'toggle-chat') {
        safeSendMessage({ action: 'toggle-stealth-chat' });
        sendResponse({ success: true });
      } else if (message.action === 'hide-chat') {
        safeSendMessage({ action: 'close-stealth-chat' });
        sendResponse({ success: true });
      } else if (message.action === 'enable') {
        extensionEnabled = true;
        sendResponse({ success: true });
      } else if (message.action === 'disable') {
        extensionEnabled = false;
        safeSendMessage({ action: 'close-stealth-chat' });
        sendResponse({ success: true });
      }
    });
  }

})();
