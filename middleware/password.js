// ─────────────────────────────────────────────────────────
// Shared helper: re-verify the acting user's own password.
// Used to gate every approval action (document sign-off, WO change
// approval, granting/revoking employee access) behind a fresh password
// check, on top of the session cookie.
// ─────────────────────────────────────────────────────────
const bcrypt = require('bcryptjs');
const pool = require('../db/pool');

async function checkPassword(userId, password) {
  if (!password) return false;
  const { rows } = await pool.query(
    'SELECT password_hash FROM users WHERE id = $1 AND active = TRUE',
    [userId]
  );
  const user = rows[0];
  if (!user) return false;
  return bcrypt.compare(password, user.password_hash);
}

module.exports = { checkPassword };
