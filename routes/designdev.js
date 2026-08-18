// ─────────────────────────────────────────────────────────
// /api/design/{npds,ecos,ewos} — Design & Development Management
// (New Part Design records, Engineering Change Orders, Engineering
// Work Orders). Each record's full nested shape is stored as-is in a
// single `data` JSONB column and saved back whole on every edit — the
// frontend already treats these as one mutable object per record.
// Read: any logged-in user. Create/update: engineer or admin — these
// are engineering-authored artifacts, same gating as Work Instructions.
// ─────────────────────────────────────────────────────────
const express = require('express');
const pool = require('../db/pool');
const { requireAuth, requireRole } = require('../middleware/auth');

const router = express.Router();

function crudRouter(table, label) {
  const r = express.Router();

  r.get('/', requireAuth, async (req, res) => {
    try {
      const { rows } = await pool.query(`SELECT * FROM ${table} ORDER BY id`);
      res.json(rows.map((row) => ({ ...row.data, id: row.id })));
    } catch (err) {
      console.error(`List ${label} error:`, err.message);
      res.status(500).json({ error: `Could not load ${label}.` });
    }
  });

  r.post('/', requireAuth, requireRole('engineer', 'admin'), async (req, res) => {
    const b = req.body || {};
    if (!b.id) return res.status(400).json({ error: 'A record needs an ID.' });
    try {
      const { rows } = await pool.query(
        `INSERT INTO ${table} (id, data, created_by) VALUES ($1,$2,$3) RETURNING *`,
        [b.id, JSON.stringify(b), req.user.id]
      );
      res.status(201).json({ ...rows[0].data, id: rows[0].id });
    } catch (err) {
      if (err.code === '23505') return res.status(409).json({ error: `"${b.id}" already exists.` });
      console.error(`Create ${label} error:`, err.message);
      res.status(500).json({ error: `Could not create ${label}.` });
    }
  });

  r.put('/:id', requireAuth, requireRole('engineer', 'admin'), async (req, res) => {
    const b = req.body || {};
    try {
      const { rows } = await pool.query(
        `UPDATE ${table} SET data = $2 WHERE id = $1 RETURNING *`,
        [req.params.id, JSON.stringify(b)]
      );
      if (!rows[0]) return res.status(404).json({ error: `${label} not found.` });
      res.json({ ...rows[0].data, id: rows[0].id });
    } catch (err) {
      console.error(`Update ${label} error:`, err.message);
      res.status(500).json({ error: `Could not update ${label}.` });
    }
  });

  return r;
}

router.use('/npds', crudRouter('design_npds', 'part design record'));
router.use('/ecos', crudRouter('design_ecos', 'engineering change order'));
router.use('/ewos', crudRouter('design_ewos', 'engineering work order'));

module.exports = router;
