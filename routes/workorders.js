// ─────────────────────────────────────────────────────────
// /api/workorders  — list, get one, create, update, delete
// Read: any logged-in user.  Create/update: engineer or admin.
// Delete: admin only.
// ─────────────────────────────────────────────────────────
const express = require('express');
const pool = require('../db/pool');
const { requireAuth, requireRole } = require('../middleware/auth');
const { checkPassword } = require('../middleware/password');

const router = express.Router();

// Fields a change request may propose — these never change via a plain PUT,
// only through the change-request/approve flow below.
const GATED_FIELDS = ['component', 'partNo', 'elbitPn', 'drawingNo', 'batchNo', 'rev', 'startDate', 'priority', 'assignedTo', 'hazmat'];

// Convert a DB row (snake_case) into the camelCase shape the frontend expects.
function rowToWO(r) {
  return {
    id: r.id, component: r.component, partNo: r.part_no, elbitPn: r.elbit_pn,
    drawingNo: r.drawing_no, batchNo: r.batch_no, rev: r.rev, status: r.status,
    priority: r.priority, startDate: r.start_date, assignedTo: r.assigned_to,
    hazmat: r.hazmat, notes: r.notes, ops: r.ops, ...r.extra,
    pendingChange: r.pending_change,
    pendingRequestedById: r.pending_requested_by,
    pendingRequestedByName: r.pending_requested_by_name,
    pendingRequestedAt: r.pending_requested_at,
  };
}

const SELECT_WO = `
  SELECT wo.*, u.full_name AS pending_requested_by_name
  FROM work_orders wo
  LEFT JOIN users u ON u.id = wo.pending_requested_by`;

// GET /api/workorders
router.get('/', requireAuth, async (req, res) => {
  try {
    const { rows } = await pool.query(`${SELECT_WO} ORDER BY wo.id`);
    res.json(rows.map(rowToWO));
  } catch (err) {
    console.error('List WO error:', err.message);
    res.status(500).json({ error: 'Could not load work orders.' });
  }
});

// GET /api/workorders/:id
router.get('/:id', requireAuth, async (req, res) => {
  try {
    const { rows } = await pool.query(`${SELECT_WO} WHERE wo.id = $1`, [req.params.id]);
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
// Day-to-day fields only (status, notes, operation progress). Planning
// fields (component, part numbers, drawing/batch no., rev, dates, priority,
// assigned personnel, hazmat) can't be changed here — see the change-request
// endpoints below, which route those through approval.
router.put('/:id', requireAuth, requireRole('engineer', 'admin'), async (req, res) => {
  const b = req.body || {};
  try {
    const { rows } = await pool.query(
      `UPDATE work_orders SET status=$2, notes=$3, ops=$4 WHERE id=$1 RETURNING *`,
      [req.params.id, b.status, b.notes || '', JSON.stringify(b.ops || [])]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Work order not found.' });
    const { rows: full } = await pool.query(`${SELECT_WO} WHERE wo.id = $1`, [req.params.id]);
    res.json(rowToWO(full[0]));
  } catch (err) {
    console.error('Update WO error:', err.message);
    res.status(500).json({ error: 'Could not update work order.' });
  }
});

// POST /api/workorders/:id/change-request   (engineer/admin)
// Stages a proposed change to the planning fields — not applied until a
// different quality/engineering/admin user approves it (see below).
router.post('/:id/change-request', requireAuth, requireRole('engineer', 'admin'), async (req, res) => {
  const b = req.body || {};
  try {
    const { rows: existing } = await pool.query('SELECT pending_change FROM work_orders WHERE id = $1', [req.params.id]);
    if (!existing[0]) return res.status(404).json({ error: 'Work order not found.' });
    if (existing[0].pending_change) {
      return res.status(409).json({ error: 'A change request is already pending approval for this work order.' });
    }
    const change = {};
    GATED_FIELDS.forEach((k) => { change[k] = b[k]; });
    await pool.query(
      `UPDATE work_orders SET pending_change=$2, pending_requested_by=$3, pending_requested_at=now() WHERE id=$1`,
      [req.params.id, JSON.stringify(change), req.user.id]
    );
    const { rows } = await pool.query(`${SELECT_WO} WHERE wo.id = $1`, [req.params.id]);
    res.json(rowToWO(rows[0]));
  } catch (err) {
    console.error('WO change-request error:', err.message);
    res.status(500).json({ error: 'Could not submit change request.' });
  }
});

// POST /api/workorders/:id/change-request/approve   (quality/engineer/admin, password required)
router.post('/:id/change-request/approve', requireAuth, requireRole('quality', 'engineer', 'admin'), async (req, res) => {
  const { password } = req.body || {};
  if (!(await checkPassword(req.user.id, password))) {
    return res.status(401).json({ error: 'Incorrect password.' });
  }
  try {
    const { rows: existing } = await pool.query('SELECT pending_change, pending_requested_by FROM work_orders WHERE id = $1', [req.params.id]);
    const wo = existing[0];
    if (!wo) return res.status(404).json({ error: 'Work order not found.' });
    if (!wo.pending_change) return res.status(400).json({ error: 'No pending change to approve.' });
    if (wo.pending_requested_by === req.user.id) {
      return res.status(403).json({ error: 'You cannot approve your own change request — a different quality, engineering or admin user must approve it.' });
    }
    const c = wo.pending_change;
    await pool.query(
      `UPDATE work_orders SET
         component=$2, part_no=$3, elbit_pn=$4, drawing_no=$5, batch_no=$6, rev=$7,
         priority=$8, start_date=$9, assigned_to=$10, hazmat=$11,
         pending_change=NULL, pending_requested_by=NULL, pending_requested_at=NULL
       WHERE id=$1`,
      [req.params.id, c.component, c.partNo, c.elbitPn, c.drawingNo, c.batchNo, c.rev,
       c.priority, c.startDate || null, JSON.stringify(c.assignedTo || []), !!c.hazmat]
    );
    const { rows } = await pool.query(`${SELECT_WO} WHERE wo.id = $1`, [req.params.id]);
    res.json(rowToWO(rows[0]));
  } catch (err) {
    console.error('WO change-approve error:', err.message);
    res.status(500).json({ error: 'Could not approve change request.' });
  }
});

// POST /api/workorders/:id/change-request/reject   (quality/engineer/admin, password required)
router.post('/:id/change-request/reject', requireAuth, requireRole('quality', 'engineer', 'admin'), async (req, res) => {
  const { password, reason } = req.body || {};
  if (!(await checkPassword(req.user.id, password))) {
    return res.status(401).json({ error: 'Incorrect password.' });
  }
  try {
    const { rows: existing } = await pool.query('SELECT pending_change FROM work_orders WHERE id = $1', [req.params.id]);
    if (!existing[0]) return res.status(404).json({ error: 'Work order not found.' });
    if (!existing[0].pending_change) return res.status(400).json({ error: 'No pending change to reject.' });
    const note = reason ? `\n[Change request rejected: ${reason}]` : '\n[Change request rejected]';
    await pool.query(
      `UPDATE work_orders SET pending_change=NULL, pending_requested_by=NULL, pending_requested_at=NULL, notes=notes||$2 WHERE id=$1`,
      [req.params.id, note]
    );
    const { rows } = await pool.query(`${SELECT_WO} WHERE wo.id = $1`, [req.params.id]);
    res.json(rowToWO(rows[0]));
  } catch (err) {
    console.error('WO change-reject error:', err.message);
    res.status(500).json({ error: 'Could not reject change request.' });
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
