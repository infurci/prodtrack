// ─────────────────────────────────────────────────────────
// Blanket read-only enforcement for 'viewer' access-level accounts.
//
// access_level is independent of role: role decides what a user can SEE,
// this decides whether they can change ANYTHING at all. Rather than
// threading a check into every individual write route across every
// route file, this runs once for every /api request: any non-GET
// request from a 'viewer' account is rejected before it reaches its
// route handler, whatever that route is.
//
// Mount this BEFORE the feature routers, at app.use('/api', ...), so it
// sees every API call. Login/logout are always allowed through — a
// viewer still needs to be able to sign in and out.
// ─────────────────────────────────────────────────────────
const jwt = require('jsonwebtoken');

const ALWAYS_ALLOWED = new Set(['/auth/login', '/auth/logout']);

function blockViewerWrites(req, res, next) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  if (ALWAYS_ALLOWED.has(req.path)) return next();

  const token = req.cookies && req.cookies.pt_token;
  if (token) {
    try {
      const payload = jwt.verify(token, process.env.JWT_SECRET);
      if (payload.access_level === 'viewer') {
        return res.status(403).json({ error: 'Your account has view-only access and cannot make changes.' });
      }
    } catch {
      // Invalid/expired token — let the route's own requireAuth respond.
    }
  }
  next();
}

module.exports = { blockViewerWrites };
