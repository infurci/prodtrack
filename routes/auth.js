// ─────────────────────────────────────────────────────────
// /api/auth  — login, logout, "who am I"
// ─────────────────────────────────────────────────────────
const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const pool = require('../db/pool');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

// POST /api/auth/login  { username, password }
router.post('/login', async (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) {
    return res.status(400).json({ error: 'Enter a username and password.' });
  }
  try {
    const { rows } = await pool.query(
      'SELECT * FROM users WHERE username = $1 AND active = TRUE',
      [username.toLowerCase().trim()]
    );
    const user = rows[0];
    // Same generic message whether user missing or password wrong (no leaks).
    if (!user || !(await bcrypt.compare(password, user.password_hash))) {
      return res.status(401).json({ error: 'Incorrect username or password.' });
    }

    const token = jwt.sign(
      { id: user.id, username: user.username, role: user.role, full_name: user.full_name },
      process.env.JWT_SECRET,
      { expiresIn: '12h' }
    );

    res.cookie('pt_token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production', // HTTPS-only in prod
      sameSite: 'lax',
      maxAge: 12 * 60 * 60 * 1000,
    });
    res.json({ user: { id: user.id, username: user.username, role: user.role, full_name: user.full_name } });
  } catch (err) {
    console.error('Login error:', err.message);
    res.status(500).json({ error: 'Server error during login.' });
  }
});

// POST /api/auth/logout
router.post('/logout', (req, res) => {
  res.clearCookie('pt_token');
  res.json({ ok: true });
});

// GET /api/auth/me  — used by the frontend on load to restore the session
router.get('/me', requireAuth, (req, res) => {
  res.json({ user: {
    id: req.user.id, username: req.user.username, role: req.user.role, full_name: req.user.full_name,
  }});
});

module.exports = router;
