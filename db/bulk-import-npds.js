// ─────────────────────────────────────────────────────────
// One-time bulk import: creates New Part Design (NPD) records from
// db/data/npd-import-swb.json — one record per row of the "swb.xlsx"
// spreadsheet the user supplied, deduplicated to one record per
// distinct (part number, title) pair (the sheet is a BOM export where
// common hardware repeats once per location it's used in the
// structure; an NPD tracks the design effort for a part, not a BOM
// line item).
//
// Each record is built with exactly the shape ddmBlankNPD() produces
// in the frontend, then only the fields the spreadsheet actually
// supplies are filled in — everything else (DE2, CM, ME, DevQA,
// material spec, marking method, notes, phase pre-fill refs beyond
// the three the sheet covers, all phase-gate sign-offs, exit
// criteria) is left at the same blank/default state a freshly opened
// "New Part Design" form would show, exactly as if each row had been
// typed into that form by hand and submitted.
//
// Run once from the backend directory on the server:
//   node db/bulk-import-npds.js
// Safe to re-run: skips any (pn, title) pair that already exists.
// ─────────────────────────────────────────────────────────
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const pool = require('./pool');

const records = JSON.parse(fs.readFileSync(path.join(__dirname, 'data', 'npd-import-swb.json'), 'utf8'));

function blankNPD(id) {
  const today = new Date().toISOString().split('T')[0];
  return {
    id, pn: '', title: '', system: 'Airframe', partType: '', dal: '',
    de1: '', de2: '', cve: '', qm: '', cm: '', me: '', devqa: '',
    created: today, initiator: '', phase: 'Architecture', status: 'in-progress',
    description: '', entryRequirements: '',
    architecturePhase: { sddChapter: '', interfaceDoc: '', reviewChecklist: '', configControlled: false, de2Review: false, de1Review: false, cveReview: false, qmReview: false, approvalDate: '', approver: '', gateStatus: 'open', gateDate: '' },
    prelimDesignPhase: { icdRef: '', moldSurfaces3D: '', loadSpecDoc: '', reviewChecklist: '', configControlled: false, de2Review: false, de1Review: false, cveReview: false, qmReview: false, approvalDate: '', approver: '', gateStatus: 'not-started', gateDate: '', pdrHeld: false, pdrDate: '' },
    detailedDesignPhase: { engineeringDwgRef: '', productionDwgRef: '', assemblyDwgRef: '', threeDModelRef: '', stressAnalysisRef: '', freqAnalysisRef: '', aeroAnalysisRef: '', designDescRef: '', reviewChecklist: '', de2Review: false, de1Review: false, cveReview: false, qmReview: false, configControlled: false, approvalDate: '', approver: '', gateStatus: 'not-started', gateDate: '', cdrHeld: false, bundleReleased: false },
    exitCriteria: { allDocsCCd: false, allCVESigned: false, qmWorkInstrCheck: false, noUncompliancies: false, finalDeclCompliance: false },
    qaIssues: [], prLinks: [], ecnLinks: [], markingMethod: 'D2', materialSpec: '', notes: '',
  };
}

(async () => {
  try {
    const { rows: existingRows } = await pool.query('SELECT id, data FROM design_npds');
    const existingKeys = new Set(existingRows.map((r) => `${r.data.pn}::${r.data.title}`));
    let nextNum = existingRows.length + 1;
    let created = 0;
    let skipped = 0;

    for (const rec of records) {
      const key = `${rec.pn}::${rec.title}`;
      if (existingKeys.has(key)) { skipped++; continue; }

      const id = 'NPD-2024-' + String(nextNum).padStart(3, '0');
      nextNum++;

      const npd = blankNPD(id);
      npd.pn = rec.pn;
      npd.title = rec.title;
      npd.partType = rec.partType;
      npd.system = rec.system || 'Airframe';
      npd.dal = rec.dal;
      npd.description = rec.description;
      npd.entryRequirements = rec.entryRequirements;
      npd.de1 = rec.de1;
      npd.cve = rec.cve;
      npd.qm = rec.qm;
      if (rec.moldSurfaces3D) npd.prelimDesignPhase.moldSurfaces3D = rec.moldSurfaces3D;
      if (rec.engineeringDwgRef) npd.detailedDesignPhase.engineeringDwgRef = rec.engineeringDwgRef;
      if (rec.threeDModelRef) npd.detailedDesignPhase.threeDModelRef = rec.threeDModelRef;

      await pool.query(
        'INSERT INTO design_npds (id, data) VALUES ($1,$2) ON CONFLICT (id) DO NOTHING',
        [id, JSON.stringify(npd)]
      );
      existingKeys.add(key);
      created++;
    }

    console.log(`✓ Created ${created} new part design records.`);
    if (skipped) console.log(`  (skipped ${skipped} already present — same part number + title)`);
  } catch (err) {
    console.error('✗ Bulk import failed:', err.message);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
})();
