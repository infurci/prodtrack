// ─────────────────────────────────────────────────────────
// /api/employees — employee roster + login access management.
// Read (name only, for autocomplete): any logged-in user.
// Everything else (full detail, create, edit, grant/revoke login access):
// the 'quality' role only. Granting/revoking access also requires the
// acting quality user's own password.
// ─────────────────────────────────────────────────────────
const express = require('express');
const bcrypt = require('bcryptjs');
const pool = require('../db/pool');
const { requireAuth, requireRole } = require('../middleware/auth');
const { checkPassword } = require('../middleware/password');

const router = express.Router();

function rowToEmployee(r) {
  return {
    id: r.id, fullName: r.full_name, active: r.active,
    username: r.username || null, role: r.role || null,
    hasAccess: !!r.user_id && !!r.user_active,
  };
}

const SELECT_FULL = `
  SELECT e.*, u.username, u.role, u.active AS user_active
  FROM employees e
  LEFT JOIN users u ON u.id = e.user_id`;

// GET /api/employees — name-only list, powers autocomplete
router.get('/', requireAuth, async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT id, full_name FROM employees WHERE active = TRUE ORDER BY full_name');
    res.json(rows.map((r) => ({ id: r.id, fullName: r.full_name })));
  } catch (err) {
    console.error('List employees error:', err.message);
    res.status(500).json({ error: 'Could not load employees.' });
  }
});

// GET /api/employees/full — full detail incl. login access (quality only)
router.get('/full', requireAuth, requireRole('quality'), async (req, res) => {
  try {
    const { rows } = await pool.query(`${SELECT_FULL} ORDER BY e.full_name`);
    res.json(rows.map(rowToEmployee));
  } catch (err) {
    console.error('List employees (full) error:', err.message);
    res.status(500).json({ error: 'Could not load employees.' });
  }
});

// POST /api/employees   (quality only)
router.post('/', requireAuth, requireRole('quality'), async (req, res) => {
  const fullName = (req.body && req.body.fullName || '').trim();
  if (!fullName) return res.status(400).json({ error: 'A name is required.' });
  try {
    const { rows } = await pool.query(
      'INSERT INTO employees (full_name, created_by) VALUES ($1,$2) RETURNING *',
      [fullName, req.user.id]
    );
    res.status(201).json(rowToEmployee(rows[0]));
  } catch (err) {
    console.error('Create employee error:', err.message);
    res.status(500).json({ error: 'Could not add employee.' });
  }
});

// PUT /api/employees/:id   (quality only) — rename / activate / deactivate
router.put('/:id', requireAuth, requireRole('quality'), async (req, res) => {
  const { fullName, active } = req.body || {};
  try {
    const { rows } = await pool.query(
      'UPDATE employees SET full_name=COALESCE($2,full_name), active=COALESCE($3,active) WHERE id=$1 RETURNING *',
      [req.params.id, fullName || null, active === undefined ? null : !!active]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Employee not found.' });
    const { rows: full } = await pool.query(`${SELECT_FULL} WHERE e.id = $1`, [req.params.id]);
    res.json(rowToEmployee(full[0]));
  } catch (err) {
    console.error('Update employee error:', err.message);
    res.status(500).json({ error: 'Could not update employee.' });
  }
});

// POST /api/employees/:id/access   (quality only, quality's own password required)
// Grants (or updates) a login account for this employee.
router.post('/:id/access', requireAuth, requireRole('quality'), async (req, res) => {
  const { username, password, role, confirmPassword } = req.body || {};
  if (!(await checkPassword(req.user.id, confirmPassword))) {
    return res.status(401).json({ error: 'Incorrect password.' });
  }
  if (!username || !password || !role) {
    return res.status(400).json({ error: 'Username, password and role are required.' });
  }
  if (!['operator', 'quality', 'engineer', 'admin'].includes(role)) {
    return res.status(400).json({ error: 'Invalid role.' });
  }
  try {
    const { rows: empRows } = await pool.query('SELECT * FROM employees WHERE id = $1', [req.params.id]);
    const emp = empRows[0];
    if (!emp) return res.status(404).json({ error: 'Employee not found.' });
    const hash = await bcrypt.hash(password, 12);
    const cleanUsername = username.toLowerCase().trim();
    if (emp.user_id) {
      await pool.query(
        'UPDATE users SET username=$2, role=$3, password_hash=$4, active=TRUE WHERE id=$1',
        [emp.user_id, cleanUsername, role, hash]
      );
    } else {
      const { rows: uRows } = await pool.query(
        'INSERT INTO users (username, full_name, role, password_hash) VALUES ($1,$2,$3,$4) RETURNING id',
        [cleanUsername, emp.full_name, role, hash]
      );
      await pool.query('UPDATE employees SET user_id=$2 WHERE id=$1', [req.params.id, uRows[0].id]);
    }
    const { rows: full } = await pool.query(`${SELECT_FULL} WHERE e.id = $1`, [req.params.id]);
    res.json(rowToEmployee(full[0]));
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'That username is already taken.' });
    console.error('Grant access error:', err.message);
    res.status(500).json({ error: 'Could not grant access.' });
  }
});

// DELETE /api/employees/:id/access   (quality only, quality's own password required)
router.delete('/:id/access', requireAuth, requireRole('quality'), async (req, res) => {
  const { password } = req.body || {};
  if (!(await checkPassword(req.user.id, password))) {
    return res.status(401).json({ error: 'Incorrect password.' });
  }
  try {
    const { rows: empRows } = await pool.query('SELECT user_id FROM employees WHERE id = $1', [req.params.id]);
    const emp = empRows[0];
    if (!emp) return res.status(404).json({ error: 'Employee not found.' });
    if (emp.user_id) await pool.query('UPDATE users SET active=FALSE WHERE id=$1', [emp.user_id]);
    const { rows: full } = await pool.query(`${SELECT_FULL} WHERE e.id = $1`, [req.params.id]);
    res.json(rowToEmployee(full[0]));
  } catch (err) {
    console.error('Revoke access error:', err.message);
    res.status(500).json({ error: 'Could not revoke access.' });
  }
});

module.exports = router;
