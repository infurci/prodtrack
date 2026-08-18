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

-- ---------- WORK ORDER CHANGE REQUESTS ----------
-- Editing "planning" fields (component, part numbers, drawing/batch no.,
-- rev, dates, priority, assigned personnel, hazmat) on an existing Work
-- Order doesn't apply immediately — it's staged here until a different
-- quality/engineering/admin user approves it with their password.
ALTER TABLE work_orders ADD COLUMN IF NOT EXISTS pending_change JSONB;
ALTER TABLE work_orders ADD COLUMN IF NOT EXISTS pending_requested_by INTEGER REFERENCES users(id);
ALTER TABLE work_orders ADD COLUMN IF NOT EXISTS pending_requested_at TIMESTAMPTZ;

-- ---------- EMPLOYEES ----------
-- Roster of real people, managed only by the 'quality' role. Powers the
-- name-autocomplete used across Work Order / document forms, and is the
-- only place login accounts (users rows) can be granted or revoked from.
CREATE TABLE IF NOT EXISTS employees (
  id           SERIAL PRIMARY KEY,
  full_name    TEXT NOT NULL,
  active       BOOLEAN NOT NULL DEFAULT TRUE,
  user_id      INTEGER REFERENCES users(id),
  created_by   INTEGER REFERENCES users(id),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_employees_active ON employees(active);

-- ---------- DOA DOCUMENTS (DOA Processes Map) ----------
-- Same feature set as controlled_documents (register, approval-chain
-- signatures, revision history, PDF attachment storage) but scoped to the
-- Design Organisation Approval / DAS Panel and using its own terminology
-- (doc_no, owner/verified_by/approved_by, levels L1/L2/L3/VMF/VML).
CREATE TABLE IF NOT EXISTS doa_documents (
  id                        TEXT PRIMARY KEY,
  doc_no                    TEXT NOT NULL,
  level                     TEXT NOT NULL CHECK (level IN ('L1','L2','L3','VMF','VML')),
  title                     TEXT NOT NULL,
  rev                       TEXT NOT NULL DEFAULT 'A00',
  status                    TEXT NOT NULL DEFAULT 'draft',
  doc_date                  TEXT,
  owner                     TEXT DEFAULT '',
  verified_by               TEXT DEFAULT '',
  approved_by               TEXT DEFAULT '',
  storage                   TEXT DEFAULT '',
  compliance                TEXT DEFAULT '',
  description               TEXT DEFAULT '',
  applicability             TEXT DEFAULT '',
  approvals                 JSONB NOT NULL DEFAULT '{}'::jsonb,
  rev_history               JSONB NOT NULL DEFAULT '[]'::jsonb,
  tags                      JSONB NOT NULL DEFAULT '[]'::jsonb,
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

CREATE INDEX IF NOT EXISTS idx_doad_level  ON doa_documents(level);
CREATE INDEX IF NOT EXISTS idx_doad_status ON doa_documents(status);

DROP TRIGGER IF EXISTS trg_doad_touch ON doa_documents;
CREATE TRIGGER trg_doad_touch
  BEFORE UPDATE ON doa_documents
  FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

-- ---------- WORK INSTRUCTIONS ----------
-- Each WI's `ops` is the single source of truth for its routing: operation
-- names, order, steps and attached media. Work Orders link to a WI via
-- work_orders.wi_id instead of keeping their own frozen copy, so editing a
-- WI's steps/order/media here is immediately reflected in every Work Order
-- that follows it — the per-WO status/by/at/notes stays on work_orders.ops.
CREATE TABLE IF NOT EXISTS work_instructions (
  id           TEXT PRIMARY KEY,
  title        TEXT NOT NULL,
  part_no      TEXT,
  drawing_no   TEXT,
  rev          TEXT DEFAULT '—',
  status       TEXT NOT NULL DEFAULT 'draft',
  author       TEXT DEFAULT '',
  ops          JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_by   INTEGER REFERENCES users(id),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

DROP TRIGGER IF EXISTS trg_wi_touch ON work_instructions;
CREATE TRIGGER trg_wi_touch
  BEFORE UPDATE ON work_instructions
  FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

ALTER TABLE work_orders ADD COLUMN IF NOT EXISTS wi_id TEXT REFERENCES work_instructions(id);

-- Complementary operations called into this WO from a Work Instruction's
-- pool of optional ops (never authored directly on the WO itself — only
-- picked from an existing WI, by quality/engineer/admin). Each entry is
-- {wiId, opId} identifying the source operation, which is still rendered
-- live from that WI (steps/media follow WI edits just like the core ops).
ALTER TABLE work_orders ADD COLUMN IF NOT EXISTS extra_ops JSONB NOT NULL DEFAULT '[]'::jsonb;

-- ---------- DESIGN & DEVELOPMENT MANAGEMENT ----------
-- New Part Design (NPD) records, Engineering Work Orders (EWO) and
-- Engineering Change Orders (ECO). Each record's whole nested shape
-- (phase gates, approvals, exit criteria, implementation tracking, etc.)
-- is kept as-is in `data` — the frontend already treats these as
-- arbitrarily-shaped objects it mutates in place and re-saves whole,
-- the same way work_instructions.ops is a single JSONB blob rather than
-- a normalised table.
CREATE TABLE IF NOT EXISTS design_npds (
  id          TEXT PRIMARY KEY,
  data        JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by  INTEGER REFERENCES users(id),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
DROP TRIGGER IF EXISTS trg_npd_touch ON design_npds;
CREATE TRIGGER trg_npd_touch
  BEFORE UPDATE ON design_npds
  FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

CREATE TABLE IF NOT EXISTS design_ecos (
  id          TEXT PRIMARY KEY,
  data        JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by  INTEGER REFERENCES users(id),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
DROP TRIGGER IF EXISTS trg_eco_touch ON design_ecos;
CREATE TRIGGER trg_eco_touch
  BEFORE UPDATE ON design_ecos
  FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

CREATE TABLE IF NOT EXISTS design_ewos (
  id          TEXT PRIMARY KEY,
  data        JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by  INTEGER REFERENCES users(id),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
DROP TRIGGER IF EXISTS trg_ewo_touch ON design_ewos;
CREATE TRIGGER trg_ewo_touch
  BEFORE UPDATE ON design_ewos
  FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
