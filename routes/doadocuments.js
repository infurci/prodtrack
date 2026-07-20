// ─────────────────────────────────────────────────────────
// /api/doa-documents — DOA Processes Map document register (Design
// Organisation Approval / DAS Panel), plus PDF attachment storage.
// Same feature set as /api/documents (routes/documents.js), scoped to
// DOA's own terminology (doc_no, owner/verified_by/approved_by, levels
// L1/L2/L3/VMF/VML).
// Read: any logged-in user.  Create/update/attach/sign/approve: quality,
// engineer or admin.
// ─────────────────────────────────────────────────────────
const express = require('express');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const multer = require('multer');
const pool = require('../db/pool');
const { requireAuth, requireRole } = require('../middleware/auth');
const { checkPassword } = require('../middleware/password');

const router = express.Router();

const UPLOAD_DIR = path.join(__dirname, '..', 'uploads', 'doa-documents');
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const upload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, UPLOAD_DIR),
    filename: (req, file, cb) => cb(null, crypto.randomUUID() + '.pdf'),
  }),
  limits: { fileSize: 25 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const isPdf = file.mimetype === 'application/pdf' && /\.pdf$/i.test(file.originalname);
    if (!isPdf) return cb(new Error('Only PDF files can be attached as the document itself.'));
    cb(null, true);
  },
});

function rowToDoc(r) {
  return {
    id: r.id, docNo: r.doc_no, level: r.level, title: r.title, rev: r.rev,
    status: r.status, date: r.doc_date, owner: r.owner, verifiedBy: r.verified_by,
    approvedBy: r.approved_by, storage: r.storage, compliance: r.compliance,
    description: r.description, applicability: r.applicability, approvals: r.approvals,
    revHistory: r.rev_history, tags: r.tags, linkedDocs: r.linked_docs,
    attachmentName: r.attachment_original_name, attachmentMime: r.attachment_mime,
    attachmentSize: r.attachment_size, attachmentUploadedAt: r.attachment_uploaded_at,
  };
}

// GET /api/doa-documents
router.get('/', requireAuth, async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM doa_documents ORDER BY level, doc_no');
    res.json(rows.map(rowToDoc));
  } catch (err) {
    console.error('List DOA documents error:', err.message);
    res.status(500).json({ error: 'Could not load DOA documents.' });
  }
});

// GET /api/doa-documents/:id
router.get('/:id', requireAuth, async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM doa_documents WHERE id = $1', [req.params.id]);
    if (!rows[0]) return res.status(404).json({ error: 'Document not found.' });
    res.json(rowToDoc(rows[0]));
  } catch (err) {
    res.status(500).json({ error: 'Could not load document.' });
  }
});

// POST /api/doa-documents   (quality/engineer/admin)
router.post('/', requireAuth, requireRole('quality', 'engineer', 'admin'), async (req, res) => {
  const b = req.body || {};
  if (!b.id || !b.docNo || !b.title) {
    return res.status(400).json({ error: 'A DOA document needs an ID, document number and title.' });
  }
  try {
    const { rows } = await pool.query(
      `INSERT INTO doa_documents
        (id, doc_no, level, title, rev, status, doc_date, owner, verified_by, approved_by,
         storage, compliance, description, applicability, approvals, rev_history, tags,
         linked_docs, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)
       RETURNING *`,
      [b.id, b.docNo, b.level || 'L3', b.title, b.rev || 'A00', b.status || 'draft',
       b.date || null, b.owner || '', b.verifiedBy || '', b.approvedBy || '', b.storage || '',
       b.compliance || '', b.description || '', b.applicability || '',
       JSON.stringify(b.approvals || {}), JSON.stringify(b.revHistory || []),
       JSON.stringify(b.tags || []), JSON.stringify(b.linkedDocs || []), req.user.id]
    );
    res.status(201).json(rowToDoc(rows[0]));
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: `Document "${b.id}" already exists.` });
    console.error('Create DOA document error:', err.message);
    res.status(500).json({ error: 'Could not create DOA document.' });
  }
});

// PUT /api/doa-documents/:id   (quality/engineer/admin)
router.put('/:id', requireAuth, requireRole('quality', 'engineer', 'admin'), async (req, res) => {
  const b = req.body || {};
  try {
    const { rows } = await pool.query(
      `UPDATE doa_documents SET
         doc_no=$2, level=$3, title=$4, rev=$5, status=$6, doc_date=$7, owner=$8,
         verified_by=$9, approved_by=$10, storage=$11, compliance=$12, description=$13,
         applicability=$14, approvals=$15, rev_history=$16, tags=$17, linked_docs=$18
       WHERE id=$1 RETURNING *`,
      [req.params.id, b.docNo, b.level, b.title, b.rev, b.status, b.date || null, b.owner || '',
       b.verifiedBy || '', b.approvedBy || '', b.storage || '', b.compliance || '',
       b.description || '', b.applicability || '', JSON.stringify(b.approvals || {}),
       JSON.stringify(b.revHistory || []), JSON.stringify(b.tags || []), JSON.stringify(b.linkedDocs || [])]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Document not found.' });
    res.json(rowToDoc(rows[0]));
  } catch (err) {
    console.error('Update DOA document error:', err.message);
    res.status(500).json({ error: 'Could not update DOA document.' });
  }
});

// POST /api/doa-documents/:id/sign   (quality/engineer/admin, password required)
router.post('/:id/sign', requireAuth, requireRole('quality', 'engineer', 'admin'), async (req, res) => {
  const { role, name, password } = req.body || {};
  if (!['owner', 'verifiedBy', 'approvedBy'].includes(role)) {
    return res.status(400).json({ error: 'Invalid signature role.' });
  }
  if (!name) return res.status(400).json({ error: 'Enter your full name to sign.' });
  if (!(await checkPassword(req.user.id, password))) {
    return res.status(401).json({ error: 'Incorrect password.' });
  }
  try {
    const { rows: existing } = await pool.query('SELECT approvals, status FROM doa_documents WHERE id = $1', [req.params.id]);
    if (!existing[0]) return res.status(404).json({ error: 'Document not found.' });
    const approvals = existing[0].approvals || {};
    approvals[role] = { signed: true, name, date: new Date().toISOString().split('T')[0] };
    const sigCount = Object.values(approvals).filter((a) => a.signed).length;
    let status = existing[0].status;
    if (sigCount >= 3 && status === 'draft') status = 'in-review';
    const { rows } = await pool.query(
      `UPDATE doa_documents SET approvals=$2, status=$3 WHERE id=$1 RETURNING *`,
      [req.params.id, JSON.stringify(approvals), status]
    );
    res.json(rowToDoc(rows[0]));
  } catch (err) {
    console.error('DOA document sign error:', err.message);
    res.status(500).json({ error: 'Could not record signature.' });
  }
});

// POST /api/doa-documents/:id/approve   (quality/engineer/admin, password required)
router.post('/:id/approve', requireAuth, requireRole('quality', 'engineer', 'admin'), async (req, res) => {
  const { password } = req.body || {};
  if (!(await checkPassword(req.user.id, password))) {
    return res.status(401).json({ error: 'Incorrect password.' });
  }
  try {
    const { rows } = await pool.query(`UPDATE doa_documents SET status='approved' WHERE id=$1 RETURNING *`, [req.params.id]);
    if (!rows[0]) return res.status(404).json({ error: 'Document not found.' });
    res.json(rowToDoc(rows[0]));
  } catch (err) {
    console.error('DOA document approve error:', err.message);
    res.status(500).json({ error: 'Could not approve document.' });
  }
});

// POST /api/doa-documents/:id/attachment   (quality/engineer/admin) — upload/replace the PDF
router.post('/:id/attachment', requireAuth, requireRole('quality', 'engineer', 'admin'), (req, res) => {
  upload.single('file')(req, res, async (err) => {
    if (err) return res.status(400).json({ error: err.message || 'Upload failed.' });
    if (!req.file) return res.status(400).json({ error: 'No PDF file received.' });
    try {
      const { rows: existingRows } = await pool.query(
        'SELECT attachment_stored_name FROM doa_documents WHERE id = $1', [req.params.id]
      );
      if (!existingRows[0]) {
        fs.unlink(req.file.path, () => {});
        return res.status(404).json({ error: 'Document not found.' });
      }
      const { rows } = await pool.query(
        `UPDATE doa_documents SET
           attachment_original_name=$2, attachment_stored_name=$3, attachment_mime=$4,
           attachment_size=$5, attachment_uploaded_at=now(), attachment_uploaded_by=$6
         WHERE id=$1 RETURNING *`,
        [req.params.id, req.file.originalname, req.file.filename, req.file.mimetype, req.file.size, req.user.id]
      );
      const prevStored = existingRows[0].attachment_stored_name;
      if (prevStored && prevStored !== req.file.filename) {
        fs.unlink(path.join(UPLOAD_DIR, prevStored), () => {});
      }
      res.json(rowToDoc(rows[0]));
    } catch (e) {
      fs.unlink(req.file.path, () => {});
      console.error('Attach PDF error:', e.message);
      res.status(500).json({ error: 'Could not save the attached PDF.' });
    }
  });
});

// GET /api/doa-documents/:id/attachment — view/download the stored PDF
router.get('/:id/attachment', requireAuth, async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT attachment_stored_name, attachment_original_name FROM doa_documents WHERE id = $1',
      [req.params.id]
    );
    if (!rows[0] || !rows[0].attachment_stored_name) {
      return res.status(404).json({ error: 'No PDF attached to this document.' });
    }
    const filePath = path.join(UPLOAD_DIR, rows[0].attachment_stored_name);
    const safeName = String(rows[0].attachment_original_name || 'document.pdf').replace(/[\r\n"]/g, '');
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${safeName}"`);
    res.sendFile(filePath, (err) => {
      if (err && !res.headersSent) res.status(404).json({ error: 'Attached PDF file is missing on disk.' });
    });
  } catch (err) {
    res.status(500).json({ error: 'Could not load the attached PDF.' });
  }
});

// DELETE /api/doa-documents/:id/attachment   (quality/engineer/admin)
router.delete('/:id/attachment', requireAuth, requireRole('quality', 'engineer', 'admin'), async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT attachment_stored_name FROM doa_documents WHERE id = $1', [req.params.id]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Document not found.' });
    const stored = rows[0].attachment_stored_name;
    await pool.query(
      `UPDATE doa_documents SET
         attachment_original_name=NULL, attachment_stored_name=NULL, attachment_mime=NULL,
         attachment_size=NULL, attachment_uploaded_at=NULL, attachment_uploaded_by=NULL
       WHERE id=$1`,
      [req.params.id]
    );
    if (stored) fs.unlink(path.join(UPLOAD_DIR, stored), () => {});
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Could not remove the attached PDF.' });
  }
});

module.exports = router;
