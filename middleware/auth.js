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

// Gate for a named, one-off module grant (users.permissions JSONB) —
// independent of role. The 'quality' role always passes, since quality
// is who hands these grants out in the first place; anyone else needs
// permissions[name] === true on their own account.
function requirePermission(name) {
  return (req, res, next) => {
    if (!req.user) return res.status(403).json({ error: 'You do not have permission for this action.' });
    if (req.user.role === 'quality') return next();
    const perms = req.user.permissions || {};
    if (perms[name] === true) return next();
    return res.status(403).json({ error: 'You do not have permission for this action.' });
  };
}

module.exports = { requireAuth, requireRole, requirePermission };
