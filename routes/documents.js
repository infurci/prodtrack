// ─────────────────────────────────────────────────────────
// /api/documents — Document Pyramid controlled-document register,
// plus attachment (PDF) upload/download for the quality document itself.
// Read: any logged-in user.  Create/update/attach: quality, engineer or admin.
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

const UPLOAD_DIR = path.join(__dirname, '..', 'uploads', 'documents');
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const upload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, UPLOAD_DIR),
    // Server-generated name only — never derived from client input, so it
    // can't be used for path traversal or to overwrite another file.
    filename: (req, file, cb) => cb(null, crypto.randomUUID() + '.pdf'),
  }),
  limits: { fileSize: 25 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const isPdf = file.mimetype === 'application/pdf' && /\.pdf$/i.test(file.originalname);
    if (!isPdf) return cb(new Error('Only PDF files can be attached as the quality document.'));
    cb(null, true);
  },
});

// Convert a DB row (snake_case) into the camelCase shape the frontend expects.
function rowToDoc(r) {
  return {
    id: r.id, ref: r.ref, level: r.level, category: r.category, title: r.title, rev: r.rev,
    status: r.status, date: r.doc_date, owner: r.owner, standard: r.standard, retention: r.retention,
    description: r.description, applicability: r.applicability, writer: r.writer, checker: r.checker,
    approver: r.approver, approvals: r.approvals, revHistory: r.rev_history, tags: r.tags,
    format: r.format, language: r.language, linkedDocs: r.linked_docs,
    attachmentName: r.attachment_original_name, attachmentMime: r.attachment_mime,
    attachmentSize: r.attachment_size, attachmentUploadedAt: r.attachment_uploaded_at,
  };
}

// GET /api/documents
router.get('/', requireAuth, async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM controlled_documents ORDER BY level, ref');
    res.json(rows.map(rowToDoc));
  } catch (err) {
    console.error('List documents error:', err.message);
    res.status(500).json({ error: 'Could not load controlled documents.' });
  }
});

// GET /api/documents/:id
router.get('/:id', requireAuth, async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM controlled_documents WHERE id = $1', [req.params.id]);
    if (!rows[0]) return res.status(404).json({ error: 'Document not found.' });
    res.json(rowToDoc(rows[0]));
  } catch (err) {
    res.status(500).json({ error: 'Could not load document.' });
  }
});

// POST /api/documents   (quality/engineer/admin)
router.post('/', requireAuth, requireRole('quality', 'engineer', 'admin'), async (req, res) => {
  const b = req.body || {};
  if (!b.id || !b.ref || !b.title) {
    return res.status(400).json({ error: 'A controlled document needs an ID, reference and title.' });
  }
  try {
    const { rows } = await pool.query(
      `INSERT INTO controlled_documents
        (id, ref, level, category, title, rev, status, doc_date, owner, standard, retention,
         description, applicability, writer, checker, approver, approvals, rev_history, tags,
         format, language, linked_docs, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23)
       RETURNING *`,
      [b.id, b.ref, b.level || 'H4', b.category || 'procedures', b.title, b.rev || 'R00',
       b.status || 'draft', b.date || null, b.owner || '', b.standard || '', b.retention || '',
       b.description || '', b.applicability || '', b.writer || '', b.checker || '', b.approver || '',
       JSON.stringify(b.approvals || {}), JSON.stringify(b.revHistory || []), JSON.stringify(b.tags || []),
       b.format || '', b.language || '', JSON.stringify(b.linkedDocs || []), req.user.id]
    );
    res.status(201).json(rowToDoc(rows[0]));
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: `Document "${b.id}" already exists.` });
    console.error('Create document error:', err.message);
    res.status(500).json({ error: 'Could not create controlled document.' });
  }
});

// PUT /api/documents/:id   (quality/engineer/admin)
router.put('/:id', requireAuth, requireRole('quality', 'engineer', 'admin'), async (req, res) => {
  const b = req.body || {};
  try {
    const { rows } = await pool.query(
      `UPDATE controlled_documents SET
         ref=$2, level=$3, category=$4, title=$5, rev=$6, status=$7, doc_date=$8, owner=$9,
         standard=$10, retention=$11, description=$12, applicability=$13, writer=$14, checker=$15,
         approver=$16, approvals=$17, rev_history=$18, tags=$19, format=$20, language=$21, linked_docs=$22
       WHERE id=$1 RETURNING *`,
      [req.params.id, b.ref, b.level, b.category, b.title, b.rev, b.status, b.date || null, b.owner || '',
       b.standard || '', b.retention || '', b.description || '', b.applicability || '', b.writer || '',
       b.checker || '', b.approver || '', JSON.stringify(b.approvals || {}), JSON.stringify(b.revHistory || []),
       JSON.stringify(b.tags || []), b.format || '', b.language || '', JSON.stringify(b.linkedDocs || [])]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Document not found.' });
    res.json(rowToDoc(rows[0]));
  } catch (err) {
    console.error('Update document error:', err.message);
    res.status(500).json({ error: 'Could not update controlled document.' });
  }
});

// POST /api/documents/:id/sign   (quality/engineer/admin, password required)
// Records a writer/checker/approver signature on the approval chain.
router.post('/:id/sign', requireAuth, requireRole('quality', 'engineer', 'admin'), async (req, res) => {
  const { role, name, password } = req.body || {};
  if (!['writer', 'checker', 'approver'].includes(role)) {
    return res.status(400).json({ error: 'Invalid signature role.' });
  }
  if (!name) return res.status(400).json({ error: 'Enter your full name to sign.' });
  if (!(await checkPassword(req.user.id, password))) {
    return res.status(401).json({ error: 'Incorrect password.' });
  }
  try {
    const { rows: existing } = await pool.query('SELECT approvals, status FROM controlled_documents WHERE id = $1', [req.params.id]);
    if (!existing[0]) return res.status(404).json({ error: 'Document not found.' });
    const approvals = existing[0].approvals || {};
    approvals[role] = { signed: true, name, date: new Date().toISOString().split('T')[0] };
    const sigCount = Object.values(approvals).filter((a) => a.signed).length;
    let status = existing[0].status;
    if (sigCount >= 3 && status === 'draft') status = 'in-review';
    const { rows } = await pool.query(
      `UPDATE controlled_documents SET approvals=$2, status=$3 WHERE id=$1 RETURNING *`,
      [req.params.id, JSON.stringify(approvals), status]
    );
    res.json(rowToDoc(rows[0]));
  } catch (err) {
    console.error('Document sign error:', err.message);
    res.status(500).json({ error: 'Could not record signature.' });
  }
});

// POST /api/documents/:id/approve   (quality/engineer/admin, password required)
router.post('/:id/approve', requireAuth, requireRole('quality', 'engineer', 'admin'), async (req, res) => {
  const { password } = req.body || {};
  if (!(await checkPassword(req.user.id, password))) {
    return res.status(401).json({ error: 'Incorrect password.' });
  }
  try {
    const { rows } = await pool.query(`UPDATE controlled_documents SET status='approved' WHERE id=$1 RETURNING *`, [req.params.id]);
    if (!rows[0]) return res.status(404).json({ error: 'Document not found.' });
    res.json(rowToDoc(rows[0]));
  } catch (err) {
    console.error('Document approve error:', err.message);
    res.status(500).json({ error: 'Could not approve document.' });
  }
});

// POST /api/documents/:id/attachment   (quality/engineer/admin) — upload/replace the PDF
router.post('/:id/attachment', requireAuth, requireRole('quality', 'engineer', 'admin'), (req, res) => {
  upload.single('file')(req, res, async (err) => {
    if (err) return res.status(400).json({ error: err.message || 'Upload failed.' });
    if (!req.file) return res.status(400).json({ error: 'No PDF file received.' });
    try {
      const { rows: existingRows } = await pool.query(
        'SELECT attachment_stored_name FROM controlled_documents WHERE id = $1', [req.params.id]
      );
      if (!existingRows[0]) {
        fs.unlink(req.file.path, () => {});
        return res.status(404).json({ error: 'Document not found.' });
      }
      const { rows } = await pool.query(
        `UPDATE controlled_documents SET
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

// GET /api/documents/:id/attachment — view/download the stored PDF
router.get('/:id/attachment', requireAuth, async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT attachment_stored_name, attachment_original_name FROM controlled_documents WHERE id = $1',
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

// DELETE /api/documents/:id/attachment   (quality/engineer/admin)
router.delete('/:id/attachment', requireAuth, requireRole('quality', 'engineer', 'admin'), async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT attachment_stored_name FROM controlled_documents WHERE id = $1', [req.params.id]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Document not found.' });
    const stored = rows[0].attachment_stored_name;
    await pool.query(
      `UPDATE controlled_documents SET
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
