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

  const MIN_TEXT_LENGTH = 1;
  const DEBOUNCE_MS = 100;

  let debounceTimer = null;
  let extensionEnabled = true;

  // ─── Runtime Validity Check ─────────────────────────────────────────────
  function isAlive() {
    try { return !!(chrome && chrome.runtime && chrome.runtime.id); }
    catch (e) { return false; }
  }

  function send(msg) {
    try {
      if (!isAlive()) return;
      chrome.runtime.sendMessage(msg).catch(function(){});
    } catch (e) {
      // Extension context invalidated — do nothing
    }
  }

  // ─── Code Detection ─────────────────────────────────────────────────────
  function isCode(text) {
    var codePatterns = [
      /function\s+\w+\s*\(/, /const\s+\w+\s*=/, /let\s+\w+\s*=/,
      /var\s+\w+\s*=/, /=>\s*\{/, /if\s*\(.*\)\s*\{/,
      /for\s*\(.*\)\s*\{/, /while\s*\(.*\)\s*\{/, /class\s+\w+/,
      /import\s+.*from/, /require\s*\(/, /def\s+\w+\s*\(/,
      /print\s*\(/, /public\s+(static\s+)?void/, /System\.out\.println/,
      /#include\s*</, /std::/, /SELECT\s+.*FROM/i,
      /CREATE\s+TABLE/i, /console\.log\s*\(/, /document\.querySelector/,
      /addEventListener\s*\(/, /\}\s*else\s*\{/, /return\s+.*;/,
      /async\s+function/, /await\s+/, /try\s*\{/,
      /catch\s*\(/, /throw\s+new/, /interface\s+\w+/,
      /type\s+\w+\s*=/, /<\/?[a-z]+[^>]*>/i, /\{\{.*\}\}/,
      /\w+\.\w+\(.*\)/
    ];

    var indicators = ['{', '}', ';', '=>', '===', '!==', '&&', '||', '++', '--', '//'];
    var score = 0;

    for (var i = 0; i < codePatterns.length; i++) {
      if (codePatterns[i].test(text)) score += 2;
    }
    for (var j = 0; j < indicators.length; j++) {
      if (text.indexOf(indicators[j]) !== -1) score += 1;
    }

    var lines = text.split('\n');
    if (lines.length > 1) {
      var indented = 0;
      for (var k = 0; k < lines.length; k++) {
        if (/^\s{2,}/.test(lines[k])) indented++;
      }
      if (indented / lines.length > 0.3) score += 3;
    }

    return score >= 4;
  }

  // ─── Build Prompt ────────────────────────────────────────────────────────
  function buildPrompt(text, isCodeText) {
    if (isCodeText) {
      return 'You are an expert code analyst. Analyze the following code and provide:\n\n' +
        '1. **Language Detection**: Identify the programming language.\n' +
        '2. **Code Explanation**: Explain what the code does in simple terms.\n' +
        '3. **Bug Detection**: Identify any bugs, errors, or potential issues.\n' +
        '4. **Optimization**: Suggest performance and readability improvements.\n' +
        '5. **Best Practices**: Note any violations of coding best practices.\n\n' +
        'Format your response with clear headings and use code blocks for any code suggestions.\n\n' +
        '```\n' + text + '\n```';
    }

    return 'You are a knowledgeable AI assistant. The user selected the following text from a webpage. ' +
      'Provide a helpful, clear, and concise response.\n\n' +
      'If it\'s a question, answer it directly.\n' +
      'If it\'s a concept, explain it clearly.\n' +
      'If it contains data, analyze and summarize it.\n\n' +
      'Selected text:\n"' + text + '"';
  }

  // ─── Send selected text to popup window via background ──────────────────
  function sendSelectionToPopup(selectedText) {
    try {
      var trimmed = selectedText.trim();
      if (trimmed.length < MIN_TEXT_LENGTH) return;
      if (!extensionEnabled) return;
      if (!isAlive()) return;

      var isCodeText = isCode(trimmed);
      var prompt = buildPrompt(trimmed, isCodeText);

      send({
        action: 'selection-made',
        text: trimmed,
        prompt: prompt,
        type: isCodeText ? 'code' : 'text'
      });
    } catch (e) {
      // Silently fail
    }
  }

  // ─── Text Selection Listener (with debounce) ───────────────────────────
  document.addEventListener('mouseup', function () {
    try {
      if (!extensionEnabled || !isAlive()) return;
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(function () {
        try {
          var selection = window.getSelection();
          var selectedText = selection ? selection.toString() : '';
          if (selectedText && selectedText.trim().length >= MIN_TEXT_LENGTH) {
            sendSelectionToPopup(selectedText);
          }
        } catch (e) {}
      }, DEBOUNCE_MS);
    } catch (e) {}
  });

  // ─── Keyboard Shortcuts ────────────────────────────────────────────────
  document.addEventListener('keydown', function (e) {
    try {
      if (!isAlive()) return;

      // Ctrl+X — Open chatbot globally (and send text if selected)
      if (e.ctrlKey && !e.shiftKey && !e.altKey && (e.key.toLowerCase() === 'x' || e.code === 'KeyX')) {
        var sel = window.getSelection();
        var selText = sel ? sel.toString().trim() : '';
        
        // Prevent default cut behavior if we're using this as our global hotkey
        e.preventDefault();
        e.stopPropagation();

        if (selText && selText.length >= MIN_TEXT_LENGTH) {
          // If text is selected, send it to the chatbot and open it
          sendSelectionToPopup(selText);
        } else {
          // Otherwise just open the empty chatbot
          send({ action: 'open-stealth-chat' });
        }
      }

      // Ctrl+Z — Close chatbot
      if (e.ctrlKey && !e.shiftKey && !e.altKey && e.key === 'z') {
        var tag = document.activeElement ? document.activeElement.tagName.toLowerCase() : '';
        var isEditable = tag === 'input' || tag === 'textarea' ||
          (document.activeElement && document.activeElement.isContentEditable);
        if (!isEditable) {
          e.preventDefault();
          e.stopPropagation();
          send({ action: 'close-stealth-chat' });
        }
      }
    } catch (e) {}
  }, true);

  // ─── Fullscreen Detection ──────────────────────────────────────────────
  document.addEventListener('fullscreenchange', function () {
    try {
      if (document.fullscreenElement) {
        send({ action: 'hide-stealth-chat' });
      }
    } catch (e) {}
  });

  // ─── Auto-hide on Tab Visibility Change ────────────────────────────────
  document.addEventListener('visibilitychange', function () {
    try {
      if (!isAlive()) return;
      if (document.hidden) {
        send({ action: 'hide-stealth-chat' });
      } else {
        send({ action: 'restore-stealth-chat' });
      }
    } catch (e) {}
  });

  // ─── Message Listener from Background ──────────────────────────────────
  try {
    if (isAlive()) {
      chrome.runtime.onMessage.addListener(function (message, sender, sendResponse) {
        try {
          if (!isAlive()) return;
          if (message.action === 'toggle-chat') {
            send({ action: 'toggle-stealth-chat' });
            sendResponse({ success: true });
          } else if (message.action === 'hide-chat') {
            send({ action: 'close-stealth-chat' });
            sendResponse({ success: true });
          } else if (message.action === 'enable') {
            extensionEnabled = true;
            sendResponse({ success: true });
          } else if (message.action === 'disable') {
            extensionEnabled = false;
            send({ action: 'close-stealth-chat' });
            sendResponse({ success: true });
          }
        } catch (e) {}
      });
    }
  } catch (e) {}

})();
