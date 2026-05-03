/**
 * AI Smart Selection Assistant — Backend Server
 * Express server that proxies AI requests via NVIDIA API.
 * Keeps API keys secure on the server side.
 */

require('dotenv').config();

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const { OpenAI } = require('openai');

const app = express();
const PORT = process.env.PORT || 3001;

// ─── NVIDIA AI Client (OpenAI-compatible) ───────────────────────────────────
const openai = new OpenAI({
  baseURL: 'https://integrate.api.nvidia.com/v1',
  apiKey: process.env.NVIDIA_API_KEY,
});

// ─── Middleware ───────────────────────────────────────────────────────────────
app.use(helmet());

app.use(cors({
  origin: '*', // Chrome extensions use chrome-extension:// origins
  methods: ['GET', 'POST'],
  allowedHeaders: ['Content-Type'],
}));

app.use(express.json({ limit: '10kb' }));

// Rate limiting: 30 requests per minute per IP
const limiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  message: { error: 'Too many requests. Please wait a moment.' },
  standardHeaders: true,
  legacyHeaders: false,
});
app.use('/ask', limiter);

// ─── Health Check ─────────────────────────────────────────────────────────────
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    hasApiKey: !!process.env.NVIDIA_API_KEY,
  });
});

// ─── Main AI Endpoint ─────────────────────────────────────────────────────────
app.post('/ask', async (req, res) => {
  try {
    const { prompt, type } = req.body;

    if (!prompt || typeof prompt !== 'string') {
      return res.status(400).json({ error: 'Prompt is required and must be a string.' });
    }

    if (prompt.trim().length < 3) {
      return res.status(400).json({ error: 'Prompt is too short.' });
    }

    if (!process.env.NVIDIA_API_KEY) {
      return res.status(500).json({
        error: 'NVIDIA API key not configured. Please add NVIDIA_API_KEY to your .env file.',
      });
    }

    // Build system prompt based on content type
    let systemPrompt;
    if (type === 'code') {
      systemPrompt = `You are an expert code analyst and software engineer. When analyzing code:
- Always identify the programming language first
- Explain the code's purpose clearly and concisely
- List any bugs, errors, or potential issues
- Suggest optimizations for performance and readability
- Mention any best practice violations
- If asked, show how to convert the code to another language

Format your response using markdown with clear headings (##), bullet points, and code blocks (\`\`\`).
Keep responses focused and actionable.`;
    } else {
      systemPrompt = `You are a knowledgeable AI assistant. Provide clear, concise, and helpful responses.
- If it's a question, answer it directly
- If it's a concept, explain it clearly with examples if helpful
- If it contains data, analyze and summarize the key points
- Use markdown formatting with headings, bullet points, and code blocks where appropriate
Keep responses focused and well-structured.`;
    }

    const completion = await openai.chat.completions.create({
      model: process.env.MODEL || 'openai/gpt-oss-20b',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: prompt },
      ],
      max_tokens: 4096,
      temperature: 1,
      top_p: 1,
    });

    const response = completion.choices?.[0]?.message?.content;

    if (!response) {
      return res.status(500).json({ error: 'No response from AI model.' });
    }

    res.json({ response });

  } catch (error) {
    console.error('[AI Assistant Backend] Error:', error.message);

    if (error.status === 401) {
      return res.status(401).json({ error: 'Invalid API key. Please check your NVIDIA_API_KEY.' });
    }

    if (error.status === 429) {
      return res.status(429).json({ error: 'API rate limit exceeded. Please try again later.' });
    }

    if (error.status === 400) {
      return res.status(400).json({ error: 'Bad request to AI model. The prompt may be too long.' });
    }

    res.status(500).json({ error: 'Internal server error. Please try again.' });
  }
});

// ─── 404 Handler ──────────────────────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({ error: 'Endpoint not found.' });
});

// ─── Start Server ─────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`
╔══════════════════════════════════════════════════╗
║   AI Smart Selection Assistant — Backend         ║
║   Server running on http://localhost:${PORT}        ║
║   API Key: ${process.env.NVIDIA_API_KEY ? '✅ Configured' : '❌ Missing'}                       ║
╚══════════════════════════════════════════════════╝
  `);
});
