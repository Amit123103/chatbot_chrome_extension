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

    const isCodeText = isCode(trimmed);
    const prompt = buildPrompt(trimmed, isCodeText);

    // Send to background → background forwards to popup window
    chrome.runtime.sendMessage({
      action: 'selection-made',
      text: trimmed,
      prompt: prompt,
      type: isCodeText ? 'code' : 'text'
    }).catch(() => {
      // Extension context may be invalidated — silently fail
    });
  }

  // ─── Text Selection Listener (with debounce) ───────────────────────────
  document.addEventListener('mouseup', () => {
    if (!extensionEnabled) return;
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
    // Ctrl+X — Open chatbot (intercept only when nothing is selected to avoid breaking Cut)
    if (e.ctrlKey && !e.shiftKey && !e.altKey && e.key === 'x') {
      const sel = window.getSelection()?.toString()?.trim();
      if (!sel || sel.length === 0) {
        e.preventDefault();
        e.stopPropagation();
        chrome.runtime.sendMessage({ action: 'open-stealth-chat' }).catch(() => {});
      }
      // If text is selected, let normal Ctrl+X (Cut) work
    }

    // Ctrl+Z — Close chatbot (intercept only when not in an input/textarea)
    if (e.ctrlKey && !e.shiftKey && !e.altKey && e.key === 'z') {
      const tag = document.activeElement?.tagName?.toLowerCase();
      const isEditable = tag === 'input' || tag === 'textarea' || document.activeElement?.isContentEditable;
      if (!isEditable) {
        e.preventDefault();
        e.stopPropagation();
        chrome.runtime.sendMessage({ action: 'close-stealth-chat' }).catch(() => {});
      }
      // If in an editable field, let normal Ctrl+Z (Undo) work
    }
  }, true); // Use capture phase to intercept before page handlers

  // ─── Fullscreen Detection — Auto-hide on fullscreen ─────────────────────
  document.addEventListener('fullscreenchange', () => {
    if (document.fullscreenElement) {
      // Page entered fullscreen — hide the popup
      chrome.runtime.sendMessage({ action: 'hide-stealth-chat' }).catch(() => {});
    }
  });

  // ─── Auto-hide on Tab Visibility Change ─────────────────────────────────
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      chrome.runtime.sendMessage({ action: 'hide-stealth-chat' }).catch(() => {});
    } else {
      chrome.runtime.sendMessage({ action: 'restore-stealth-chat' }).catch(() => {});
    }
  });

  // ─── Message Listener from Background ───────────────────────────────────
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === 'toggle-chat') {
      chrome.runtime.sendMessage({ action: 'toggle-stealth-chat' }).catch(() => {});
      sendResponse({ success: true });
    } else if (message.action === 'hide-chat') {
      chrome.runtime.sendMessage({ action: 'close-stealth-chat' }).catch(() => {});
      sendResponse({ success: true });
    } else if (message.action === 'enable') {
      extensionEnabled = true;
      sendResponse({ success: true });
    } else if (message.action === 'disable') {
      extensionEnabled = false;
      chrome.runtime.sendMessage({ action: 'close-stealth-chat' }).catch(() => {});
      sendResponse({ success: true });
    }
  });

})();
