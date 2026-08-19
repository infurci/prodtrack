// ─────────────────────────────────────────────────────────
// /api/doc-register — Document & Drawing Management Register (DDMR),
// also known as the Master Document Register List (MDRL): tracks
// contractor↔client transmittals for project documents/drawings.
//
// The whole panel is restricted — not just editing — to the 'quality'
// role or a user explicitly granted permissions.ddmr = true (set via
// the Manage Users screen). Each record's full row is stored as-is in
// a single `data` JSONB column, the same pattern as design_npds/ecos/
// ewos: a flat register row with no natural nested sub-structure.
// ─────────────────────────────────────────────────────────
const express = require('express');
const pool = require('../db/pool');
const { requireAuth, requirePermission } = require('../middleware/auth');

const router = express.Router();

router.use(requireAuth, requirePermission('ddmr'));

router.get('/', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM doc_registers ORDER BY id');
    res.json(rows.map((row) => ({ ...row.data, id: row.id })));
  } catch (err) {
    console.error('List doc register error:', err.message);
    res.status(500).json({ error: 'Could not load the document register.' });
  }
});

router.post('/', async (req, res) => {
  const b = req.body || {};
  if (!b.id) return res.status(400).json({ error: 'A record needs an ID.' });
  try {
    const { rows } = await pool.query(
      'INSERT INTO doc_registers (id, data, created_by) VALUES ($1,$2,$3) RETURNING *',
      [b.id, JSON.stringify(b), req.user.id]
    );
    res.status(201).json({ ...rows[0].data, id: rows[0].id });
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: `"${b.id}" already exists.` });
    console.error('Create doc register entry error:', err.message);
    res.status(500).json({ error: 'Could not create the register entry.' });
  }
});

router.put('/:id', async (req, res) => {
  const b = req.body || {};
  try {
    const { rows } = await pool.query(
      'UPDATE doc_registers SET data = $2 WHERE id = $1 RETURNING *',
      [req.params.id, JSON.stringify(b)]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Register entry not found.' });
    res.json({ ...rows[0].data, id: rows[0].id });
  } catch (err) {
    console.error('Update doc register entry error:', err.message);
    res.status(500).json({ error: 'Could not update the register entry.' });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const { rowCount } = await pool.query('DELETE FROM doc_registers WHERE id = $1', [req.params.id]);
    if (!rowCount) return res.status(404).json({ error: 'Register entry not found.' });
    res.json({ ok: true });
  } catch (err) {
    console.error('Delete doc register entry error:', err.message);
    res.status(500).json({ error: 'Could not delete the register entry.' });
  }
});

module.exports = router;
