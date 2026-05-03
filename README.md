# 🤖 AI Smart Selection Assistant (Stealth Mode)

A Chrome Extension (Manifest V3) that acts as a mini AI coding assistant on any webpage. Select text to get instant AI analysis — code explanations, bug detection, optimization, and more. Runs in a **separate popup window** for maximum stealth.

---

## ✨ Features

### 🔍 Smart Text Selection
- Automatically detects text selection on any webpage
- Intelligent code vs. natural text detection
- 400ms debounce to prevent spam
- Minimum 5-character filter

### 🧠 AI-Powered Analysis
- **General text**: Clear explanations, answers, and summaries
- **Code detection**: Automatic language identification
- **Bug finding**: Identifies errors and potential issues
- **Optimization**: Suggests performance improvements
- **Best practices**: Flags code standard violations

### 🎨 Premium Chat UI
- Dark theme with glassmorphism design
- Runs in a **separate popup window** (not injected into the page)
- Scrollable message history
- Markdown rendering with code blocks
- Copy-to-clipboard for code snippets
- Loading animations
- Follow-up question input

### 🕵️ Stealth Architecture
- **ZERO DOM injection** — nothing is added to the webpage
- Chat runs in a **separate Chrome window** — invisible to tab-capture
- DOM inspection on the page will find **nothing**
- Auto-hides when tab loses focus or page goes fullscreen
- Auto-restores when you return to the tab
- Quick keyboard shortcuts for instant show/hide

### ⌨️ Keyboard Shortcuts
| Shortcut | Action |
|---|---|
| `Ctrl+X` | Open chatbot (when no text selected) |
| `Ctrl+Z` | Close chatbot (when not in input field) |
| `Ctrl+Shift+Y` | Toggle chatbot |
| `Ctrl+Shift+H` | Quick hide chatbot |

### 🔐 Security
- API keys stored only on the backend server
- No sensitive data in extension files
- Rate limiting on API requests
- Helmet security headers

---

## 📁 Project Structure

```
chatbotchrome/
├── extension/                  # Chrome Extension
│   ├── manifest.json           # Manifest V3 configuration
│   ├── content.js              # Text selection detection (zero UI injection)
│   ├── background.js           # Popup window management + commands
│   ├── popup-chat.html         # Stealth popup window chat UI
│   ├── popup.html              # Extension toolbar popup
│   ├── popup.js                # Popup logic
│   ├── popup.css               # Popup styles
│   ├── styles.css              # Legacy styles (unused in stealth mode)
│   └── icons/                  # Extension icons
├── backend/                    # Node.js Server
│   ├── server.js               # Express API server (NVIDIA AI)
│   ├── package.json            # Dependencies
│   ├── .env                    # Your API key (never commit this!)
│   ├── .env.example            # Environment template
│   └── .gitignore
└── README.md
```

---

## 🚀 Setup Instructions

### Prerequisites
- **Node.js** 18+ installed → [download here](https://nodejs.org/)
- **Google Chrome** browser
- **NVIDIA API key** → [get one here](https://build.nvidia.com/)

---

### Step 1: Add Your API Key

Open the file `backend/.env` and replace the placeholder with your real key:

```
NVIDIA_API_KEY=nvapi-your-real-key-here
```

---

### Step 2: Start the Backend Server

Open a terminal and run:

```bash
cd chatbotchrome/backend
npm install
npm start
```

You should see:
```
╔══════════════════════════════════════════════════╗
║   AI Smart Selection Assistant — Backend         ║
║   Server running on http://localhost:3001        ║
║   API Key: ✅ Configured                        ║
╚══════════════════════════════════════════════════╝
```

**Keep this terminal open!** The server must be running.

---

### Step 3: Load the Extension in Chrome

1. Open Chrome
2. Type `chrome://extensions/` in the address bar and press Enter
3. Turn ON **"Developer mode"** (toggle in the top-right corner)
4. Click the **"Load unpacked"** button
5. Navigate to and select the `chatbotchrome/extension` folder
6. The extension icon will appear in your Chrome toolbar

---

### Step 4: Test It!

1. Go to any webpage (e.g., google.com, stackoverflow.com, github.com)
2. **Select any text** with your mouse → a popup window opens with AI analysis
3. Press **`Ctrl+X`** → opens the chatbot popup
4. Press **`Ctrl+Z`** → closes the chatbot popup
5. Type a question in the input box at the bottom of the popup

---

## 💡 Usage Tips

- **Select text** on any page → AI responds in the popup window
- **Ctrl+X** opens chat, **Ctrl+Z** closes it
- The popup is a **separate window** — drag it anywhere, even to a second monitor
- **Tab switch** → chatbot auto-hides, returns when you come back
- **Fullscreen** → chatbot auto-hides
- Click the **extension icon** in toolbar to check backend status

---

## ⚙️ Configuration

### Backend Environment Variables (backend/.env)

| Variable | Default | Description |
|---|---|---|
| `NVIDIA_API_KEY` | (required) | Your NVIDIA API key |
| `PORT` | `3001` | Server port |
| `MODEL` | `openai/gpt-oss-20b` | AI model |

---

## 🐛 Troubleshooting

### "Cannot connect to backend"
- Make sure the backend is running: `cd backend && npm start`
- Check that port 3001 is not used by another app

### "Invalid API key"
- Check `backend/.env` has a valid `NVIDIA_API_KEY`
- No extra spaces or quotes around the key

### Chat doesn't appear on text selection
- Check if the extension is enabled in `chrome://extensions/`
- Refresh the webpage (content script loads once per page)
- Check browser console (F12) for errors

### Keyboard shortcuts don't work
- `Ctrl+X` only opens chat when **no text is selected** (to preserve Cut)
- `Ctrl+Z` only closes chat when **not in an input field** (to preserve Undo)
- Check `chrome://extensions/shortcuts` to verify shortcuts

### Extension shows errors
- Click "Errors" button on the extension card in `chrome://extensions/`
- Common fix: click the refresh icon on the extension card

---

## 📝 License

MIT License — Free to use, modify, and distribute.
