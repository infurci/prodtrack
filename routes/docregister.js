// ─────────────────────────────────────────────────────────
// /api/doc-register — Document & Drawing Management Register (DDMR),
// also known as the Master Document Register List (MDRL): tracks
// contractor↔client transmittals for project documents/drawings.
//
// Managing the register itself (listing every column, creating,
// editing, deleting, attaching/replacing/removing its PDF) stays
// restricted to the 'quality' role or a user explicitly granted
// permissions.ddmr = true (set via Manage Users).
//
// Two endpoints are deliberately NOT gated that way: /lookup (a
// lightweight search returning only id/number/title/hasAttachment) and
// GET /:id/attachment (viewing a specific entry's PDF). Those exist so
// New Part Design / Engineering Work Order / Engineering Change Order
// forms can reference a controlled document by number and open its PDF
// without needing DDMR access themselves — referencing a document
// isn't the same as managing the register.
// ─────────────────────────────────────────────────────────
const express = require('express');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const multer = require('multer');
const pool = require('../db/pool');
const { requireAuth, requirePermission } = require('../middleware/auth');

const router = express.Router();

const UPLOAD_DIR = path.join(__dirname, '..', 'uploads', 'doc-register');
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
    if (!isPdf) return cb(new Error('Only PDF files can be attached.'));
    cb(null, true);
  },
});

function rowToEntry(row) {
  return {
    ...row.data,
    id: row.id,
    attachmentName: row.attachment_original_name,
    attachmentMime: row.attachment_mime,
    attachmentSize: row.attachment_size,
    attachmentUploadedAt: row.attachment_uploaded_at,
  };
}

function fullNumber(d) {
  const parts = [d.docCode, d.productCode, d.domainCode, d.seqCode].filter(Boolean);
  if (!parts.length) return '';
  let s = parts.join('-');
  if (d.tableCode) s += '-' + d.tableCode;
  if (d.revisionLetter) s += '_' + d.revisionLetter + (d.iterationIndex || '00');
  return s;
}

router.use(requireAuth);

// GET /api/doc-register/lookup?q=... — any logged-in user
router.get('/lookup', async (req, res) => {
  const q = String(req.query.q || '').toLowerCase().trim();
  try {
    const { rows } = await pool.query('SELECT id, data, attachment_original_name FROM doc_registers ORDER BY id');
    const results = rows
      .map((r) => {
        const d = r.data || {};
        return {
          id: r.id,
          fullNumber: fullNumber(d),
          title: d.title || '',
          hasAttachment: !!r.attachment_original_name,
        };
      })
      .filter((e) => !q || (e.fullNumber + ' ' + e.title).toLowerCase().includes(q));
    res.json(results);
  } catch (err) {
    console.error('Doc register lookup error:', err.message);
    res.status(500).json({ error: 'Could not search the document register.' });
  }
});

// GET /api/doc-register/:id/attachment — any logged-in user
router.get('/:id/attachment', async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT attachment_stored_name, attachment_original_name FROM doc_registers WHERE id = $1',
      [req.params.id]
    );
    if (!rows[0] || !rows[0].attachment_stored_name) {
      return res.status(404).json({ error: 'No PDF attached to this register entry.' });
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

// Everything below — full register CRUD, attaching/replacing/removing a
// PDF — stays restricted to quality or a ddmr-granted user.
router.use(requirePermission('ddmr'));

router.get('/', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM doc_registers ORDER BY id');
    res.json(rows.map(rowToEntry));
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
    res.status(201).json(rowToEntry(rows[0]));
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
    res.json(rowToEntry(rows[0]));
  } catch (err) {
    console.error('Update doc register entry error:', err.message);
    res.status(500).json({ error: 'Could not update the register entry.' });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT attachment_stored_name FROM doc_registers WHERE id = $1', [req.params.id]);
    if (!rows[0]) return res.status(404).json({ error: 'Register entry not found.' });
    await pool.query('DELETE FROM doc_registers WHERE id = $1', [req.params.id]);
    if (rows[0].attachment_stored_name) fs.unlink(path.join(UPLOAD_DIR, rows[0].attachment_stored_name), () => {});
    res.json({ ok: true });
  } catch (err) {
    console.error('Delete doc register entry error:', err.message);
    res.status(500).json({ error: 'Could not delete the register entry.' });
  }
});

// POST /api/doc-register/:id/attachment — upload/replace the PDF
router.post('/:id/attachment', (req, res) => {
  upload.single('file')(req, res, async (err) => {
    if (err) return res.status(400).json({ error: err.message || 'Upload failed.' });
    if (!req.file) return res.status(400).json({ error: 'No PDF file received.' });
    try {
      const { rows: existingRows } = await pool.query(
        'SELECT attachment_stored_name FROM doc_registers WHERE id = $1', [req.params.id]
      );
      if (!existingRows[0]) {
        fs.unlink(req.file.path, () => {});
        return res.status(404).json({ error: 'Register entry not found.' });
      }
      const { rows } = await pool.query(
        `UPDATE doc_registers SET
           attachment_original_name=$2, attachment_stored_name=$3, attachment_mime=$4,
           attachment_size=$5, attachment_uploaded_at=now(), attachment_uploaded_by=$6
         WHERE id=$1 RETURNING *`,
        [req.params.id, req.file.originalname, req.file.filename, req.file.mimetype, req.file.size, req.user.id]
      );
      const prevStored = existingRows[0].attachment_stored_name;
      if (prevStored && prevStored !== req.file.filename) fs.unlink(path.join(UPLOAD_DIR, prevStored), () => {});
      res.json(rowToEntry(rows[0]));
    } catch (e) {
      fs.unlink(req.file.path, () => {});
      console.error('Attach PDF error:', e.message);
      res.status(500).json({ error: 'Could not save the attached PDF.' });
    }
  });
});

// DELETE /api/doc-register/:id/attachment
router.delete('/:id/attachment', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT attachment_stored_name FROM doc_registers WHERE id = $1', [req.params.id]);
    if (!rows[0]) return res.status(404).json({ error: 'Register entry not found.' });
    const stored = rows[0].attachment_stored_name;
    await pool.query(
      `UPDATE doc_registers SET
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
