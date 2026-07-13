// ─────────────────────────────────────────────────────────
// /api/workorders  — list, get one, create, update, delete
// Read: any logged-in user.  Create/update: engineer or admin.
// Delete: admin only.
// ─────────────────────────────────────────────────────────
const express = require('express');
const pool = require('../db/pool');
const { requireAuth, requireRole } = require('../middleware/auth');

const router = express.Router();

// Convert a DB row (snake_case) into the camelCase shape the frontend expects.
function rowToWO(r) {
  return {
    id: r.id, component: r.component, partNo: r.part_no, elbitPn: r.elbit_pn,
    drawingNo: r.drawing_no, batchNo: r.batch_no, rev: r.rev, status: r.status,
    priority: r.priority, startDate: r.start_date, assignedTo: r.assigned_to,
    hazmat: r.hazmat, notes: r.notes, ops: r.ops, ...r.extra,
  };
}

// GET /api/workorders
router.get('/', requireAuth, async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM work_orders ORDER BY id');
    res.json(rows.map(rowToWO));
  } catch (err) {
    console.error('List WO error:', err.message);
    res.status(500).json({ error: 'Could not load work orders.' });
  }
});

// GET /api/workorders/:id
router.get('/:id', requireAuth, async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM work_orders WHERE id = $1', [req.params.id]);
    if (!rows[0]) return res.status(404).json({ error: 'Work order not found.' });
    res.json(rowToWO(rows[0]));
  } catch (err) {
    res.status(500).json({ error: 'Could not load work order.' });
  }
});

// POST /api/workorders   (engineer/admin)
router.post('/', requireAuth, requireRole('engineer', 'admin'), async (req, res) => {
  const b = req.body || {};
  if (!b.id || !b.component) {
    return res.status(400).json({ error: 'A work order needs at least an ID and a component name.' });
  }
  try {
    const { rows } = await pool.query(
      `INSERT INTO work_orders
        (id, component, part_no, elbit_pn, drawing_no, batch_no, rev,
         status, priority, start_date, assigned_to, hazmat, notes, ops, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
       RETURNING *`,
      [b.id, b.component, b.partNo, b.elbitPn, b.drawingNo, b.batchNo, b.rev || '—',
       b.status || 'pending', b.priority || 'normal', b.startDate || null,
       JSON.stringify(b.assignedTo || []), !!b.hazmat, b.notes || '',
       JSON.stringify(b.ops || []), req.user.id]
    );
    res.status(201).json(rowToWO(rows[0]));
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: `Work order "${b.id}" already exists.` });
    console.error('Create WO error:', err.message);
    res.status(500).json({ error: 'Could not create work order.' });
  }
});

// PUT /api/workorders/:id   (engineer/admin)
router.put('/:id', requireAuth, requireRole('engineer', 'admin'), async (req, res) => {
  const b = req.body || {};
  try {
    const { rows } = await pool.query(
      `UPDATE work_orders SET
         component=$2, part_no=$3, elbit_pn=$4, drawing_no=$5, batch_no=$6, rev=$7,
         status=$8, priority=$9, start_date=$10, assigned_to=$11, hazmat=$12,
         notes=$13, ops=$14
       WHERE id=$1 RETURNING *`,
      [req.params.id, b.component, b.partNo, b.elbitPn, b.drawingNo, b.batchNo, b.rev,
       b.status, b.priority, b.startDate || null, JSON.stringify(b.assignedTo || []),
       !!b.hazmat, b.notes || '', JSON.stringify(b.ops || [])]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Work order not found.' });
    res.json(rowToWO(rows[0]));
  } catch (err) {
    console.error('Update WO error:', err.message);
    res.status(500).json({ error: 'Could not update work order.' });
  }
});

// DELETE /api/workorders/:id   (admin only)
router.delete('/:id', requireAuth, requireRole('admin'), async (req, res) => {
  try {
    const { rowCount } = await pool.query('DELETE FROM work_orders WHERE id = $1', [req.params.id]);
    if (!rowCount) return res.status(404).json({ error: 'Work order not found.' });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Could not delete work order.' });
  }
});

module.exports = router;
