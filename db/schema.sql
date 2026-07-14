-- ═══════════════════════════════════════════════════════════
-- PRODTRACK — Layer 1 schema (users + roles + work orders)
-- Safe to run more than once: uses IF NOT EXISTS everywhere.
-- ═══════════════════════════════════════════════════════════

-- ---------- USERS & ROLES ----------
-- Roles map directly to the ST.role values used in the frontend:
-- 'operator', 'quality', 'engineer', 'admin'.
CREATE TABLE IF NOT EXISTS users (
  id            SERIAL PRIMARY KEY,
  username      TEXT UNIQUE NOT NULL,
  full_name     TEXT NOT NULL,
  role          TEXT NOT NULL CHECK (role IN ('operator','quality','engineer','admin')),
  password_hash TEXT NOT NULL,
  active        BOOLEAN NOT NULL DEFAULT TRUE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------- WORK ORDERS ----------
-- Core fields are real columns (so we can filter/sort/report on them).
-- The nested operations array is kept as JSONB to preserve the exact
-- shape the frontend already uses (ops: [{seq,name,type,...}]).
CREATE TABLE IF NOT EXISTS work_orders (
  id           TEXT PRIMARY KEY,          -- e.g. 'WO-2024-001' (human-facing ID)
  component    TEXT,
  part_no      TEXT,
  elbit_pn     TEXT,
  drawing_no   TEXT,
  batch_no     TEXT,
  rev          TEXT,
  status       TEXT NOT NULL DEFAULT 'pending',
  priority     TEXT NOT NULL DEFAULT 'normal',
  start_date   TEXT,
  assigned_to  JSONB NOT NULL DEFAULT '[]'::jsonb,   -- array of names
  hazmat       BOOLEAN NOT NULL DEFAULT FALSE,
  notes        TEXT DEFAULT '',
  ops          JSONB NOT NULL DEFAULT '[]'::jsonb,   -- nested operations
  extra        JSONB NOT NULL DEFAULT '{}'::jsonb,   -- room for Layer-2 WO-form fields
  created_by   INTEGER REFERENCES users(id),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_wo_status   ON work_orders(status);
CREATE INDEX IF NOT EXISTS idx_wo_priority ON work_orders(priority);

-- Auto-touch updated_at on any UPDATE.
CREATE OR REPLACE FUNCTION touch_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_wo_touch ON work_orders;
CREATE TRIGGER trg_wo_touch
  BEFORE UPDATE ON work_orders
  FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

-- ---------- CONTROLLED DOCUMENTS (Document Pyramid) ----------
-- Register behind the QMS "Document Pyramid" screen (AS9100D §7.5).
-- attachment_stored_name is the server-generated filename of the PDF saved
-- under uploads/documents/ — it is never derived from client input, so it
-- can't be used for path traversal. attachment_original_name is just the
-- display name shown to users.
CREATE TABLE IF NOT EXISTS controlled_documents (
  id                        TEXT PRIMARY KEY,
  ref                       TEXT NOT NULL,
  level                     TEXT NOT NULL CHECK (level IN ('QM','H4','H5','REC')),
  category                  TEXT NOT NULL DEFAULT 'procedures',
  title                     TEXT NOT NULL,
  rev                       TEXT NOT NULL DEFAULT 'R00',
  status                    TEXT NOT NULL DEFAULT 'draft',
  doc_date                  TEXT,
  owner                     TEXT DEFAULT '',
  standard                  TEXT DEFAULT '',
  retention                 TEXT DEFAULT '',
  description               TEXT DEFAULT '',
  applicability             TEXT DEFAULT '',
  writer                    TEXT DEFAULT '',
  checker                   TEXT DEFAULT '',
  approver                  TEXT DEFAULT '',
  approvals                 JSONB NOT NULL DEFAULT '{}'::jsonb,
  rev_history               JSONB NOT NULL DEFAULT '[]'::jsonb,
  tags                      JSONB NOT NULL DEFAULT '[]'::jsonb,
  format                    TEXT DEFAULT '',
  language                  TEXT DEFAULT '',
  linked_docs               JSONB NOT NULL DEFAULT '[]'::jsonb,
  attachment_original_name  TEXT,
  attachment_stored_name    TEXT,
  attachment_mime           TEXT,
  attachment_size           INTEGER,
  attachment_uploaded_at    TIMESTAMPTZ,
  attachment_uploaded_by    INTEGER REFERENCES users(id),
  created_by                INTEGER REFERENCES users(id),
  created_at                TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cd_level  ON controlled_documents(level);
CREATE INDEX IF NOT EXISTS idx_cd_status ON controlled_documents(status);

DROP TRIGGER IF EXISTS trg_cd_touch ON controlled_documents;
CREATE TRIGGER trg_cd_touch
  BEFORE UPDATE ON controlled_documents
  FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
