// ─────────────────────────────────────────────────────────
// /api/workinstructions — Work Instruction library.
// A WI's `ops` array (name, order, steps, media) is the single source of
// truth for a routing — Work Orders link to a WI by id (work_orders.wi_id)
// instead of freezing their own copy, so edits here (reordering steps,
// attaching media) are immediately visible on every Work Order that
// follows it.
// Read: any logged-in user.  Create/update: engineer or admin (matches the
// existing frontend WI-editor gate).
// ─────────────────────────────────────────────────────────
const express = require('express');
const pool = require('../db/pool');
const { requireAuth, requireRole } = require('../middleware/auth');

const router = express.Router();

function rowToWI(r) {
  return {
    id: r.id, title: r.title, partNo: r.part_no, drawingNo: r.drawing_no,
    rev: r.rev, status: r.status, author: r.author, ops: r.ops,
    lastEdit: r.updated_at ? String(r.updated_at).split('T')[0] : null,
  };
}

// GET /api/workinstructions
router.get('/', requireAuth, async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM work_instructions ORDER BY id');
    res.json(rows.map(rowToWI));
  } catch (err) {
    console.error('List WIs error:', err.message);
    res.status(500).json({ error: 'Could not load work instructions.' });
  }
});

// GET /api/workinstructions/:id
router.get('/:id', requireAuth, async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM work_instructions WHERE id = $1', [req.params.id]);
    if (!rows[0]) return res.status(404).json({ error: 'Work instruction not found.' });
    res.json(rowToWI(rows[0]));
  } catch (err) {
    res.status(500).json({ error: 'Could not load work instruction.' });
  }
});

// POST /api/workinstructions   (engineer/admin)
router.post('/', requireAuth, requireRole('engineer', 'admin'), async (req, res) => {
  const b = req.body || {};
  if (!b.id || !b.title) {
    return res.status(400).json({ error: 'A work instruction needs at least an ID and a title.' });
  }
  try {
    const { rows } = await pool.query(
      `INSERT INTO work_instructions (id, title, part_no, drawing_no, rev, status, author, ops, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
       RETURNING *`,
      [b.id, b.title, b.partNo || '', b.drawingNo || '', b.rev || '—', b.status || 'draft',
       b.author || req.user.full_name || '', JSON.stringify(b.ops || []), req.user.id]
    );
    res.status(201).json(rowToWI(rows[0]));
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: `Work instruction "${b.id}" already exists.` });
    console.error('Create WI error:', err.message);
    res.status(500).json({ error: 'Could not create work instruction.' });
  }
});

// PUT /api/workinstructions/:id   (engineer/admin)
router.put('/:id', requireAuth, requireRole('engineer', 'admin'), async (req, res) => {
  const b = req.body || {};
  try {
    const { rows } = await pool.query(
      `UPDATE work_instructions SET
         title=$2, part_no=$3, drawing_no=$4, rev=$5, status=$6, author=$7, ops=$8
       WHERE id=$1 RETURNING *`,
      [req.params.id, b.title, b.partNo || '', b.drawingNo || '', b.rev || '—', b.status || 'draft',
       b.author || '', JSON.stringify(b.ops || [])]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Work instruction not found.' });
    res.json(rowToWI(rows[0]));
  } catch (err) {
    console.error('Update WI error:', err.message);
    res.status(500).json({ error: 'Could not update work instruction.' });
  }
});

module.exports = router;
