// ─────────────────────────────────────────────────────────
// Authentication + role guard middleware.
// requireAuth  -> blocks anyone without a valid login token.
// requireRole  -> blocks anyone whose role isn't in the allowed list.
// ─────────────────────────────────────────────────────────
const jwt = require('jsonwebtoken');

function requireAuth(req, res, next) {
  const token = req.cookies && req.cookies.pt_token;
  if (!token) return res.status(401).json({ error: 'Not logged in.' });
  try {
    req.user = jwt.verify(token, process.env.JWT_SECRET);
    next();
  } catch {
    return res.status(401).json({ error: 'Session expired. Please log in again.' });
  }
}

function requireRole(...allowed) {
  return (req, res, next) => {
    if (!req.user || !allowed.includes(req.user.role)) {
      return res.status(403).json({ error: 'You do not have permission for this action.' });
    }
    next();
  };
}

module.exports = { requireAuth, requireRole };
