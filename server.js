// ═══════════════════════════════════════════════════════════
// PRODTRACK backend — main entry point
// ═══════════════════════════════════════════════════════════
require('dotenv').config();
const express = require('express');
const cookieParser = require('cookie-parser');
const path = require('path');
const pool = require('./db/pool');

const app = express();

app.use(express.json({ limit: '5mb' }));
app.use(cookieParser());

// --- API routes ---
app.use('/api/auth', require('./routes/auth'));
app.use('/api/workorders', require('./routes/workorders'));
app.use('/api/documents', require('./routes/documents'));
app.use('/api/employees', require('./routes/employees'));

// --- Health check (used to confirm DB connectivity) ---
app.get('/api/health', async (req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ status: 'ok', db: 'connected' });
  } catch {
    res.status(503).json({ status: 'degraded', db: 'unreachable' });
  }
});

// --- Serve the frontend (index.html + assets) ---
app.use(express.static(path.join(__dirname, 'public')));

// Anything not matched above returns the app shell (single-page app).
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, '127.0.0.1', () => {
  console.log(`PRODTRACK backend listening on 127.0.0.1:${PORT}`);
});
