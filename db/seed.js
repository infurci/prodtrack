// ─────────────────────────────────────────────────────────
// Seeds starter user accounts and the initial work orders.
// Run with:  npm run seed
//
// It reads the four starter passwords from environment variables
// so real passwords are never written into this file:
//   SEED_ADMIN_PW, SEED_ENGINEER_PW, SEED_QUALITY_PW, SEED_OPERATOR_PW
// If a variable is missing, that account is skipped with a warning.
// Safe to run more than once (ON CONFLICT DO NOTHING).
// ─────────────────────────────────────────────────────────
require('dotenv').config();
const bcrypt = require('bcryptjs');
const pool = require('./pool');

const cloneOps = (states) => {
  // Mirrors the frontend's 11-operation default routing so seeded WOs
  // look identical to what you see today. States is an array of statuses.
  const base = [
    { seq: '05',  name: 'Mould preparation',    type: 'prep' },
    { seq: '10',  name: 'Laminating',           type: 'laminating' },
    { seq: '20',  name: 'De-bulk #1',           type: 'debulk' },
    { seq: '30',  name: 'Laminating (cont.)',   type: 'laminating' },
    { seq: '40',  name: 'De-bulk #2',           type: 'debulk' },
    { seq: '150-QG', name: 'QG — Pre-cure',     type: 'quality-gate' },
    { seq: '150', name: 'Curing',               type: 'curing' },
    { seq: '160-QG', name: 'QG — Final',        type: 'quality-gate' },
    { seq: '160', name: 'Trimming',             type: 'trimming' },
    { seq: 'INS', name: 'Inspection',           type: 'inspection' },
    { seq: 'H&S', name: 'Safety sign-off',      type: 'safety' },
  ];
  return base.map((op, i) => ({
    id: i + 1, ...op, dur: 60, hazmat: false,
    status: states[i] || 'pending', steps: [], mats: [], media: [],
  }));
};

const WOS = [
  { id:'WO-2024-001', component:'Fwd Fuel Tank Bulkhead', part_no:'362-12120', elbit_pn:'54-10-00560-00', drawing_no:'54-DP-000675', batch_no:'B-2024-FTB-001', rev:'—', status:'in-progress', start_date:'2024-06-10', priority:'high', assigned_to:['A. Lima','T. Ribeiro'], hazmat:true, notes:'Resins — gloves mandatory at all times. PPE per H&S sheet p.3.', ops:cloneOps(['done','done','done','done','in-progress','pending','pending','pending','pending','pending','pending']) },
  { id:'WO-2024-002', component:'Aft Fuselage Skin Panel', part_no:'362-14200', elbit_pn:'54-10-00581-00', drawing_no:'54-DP-000681', batch_no:'B-2024-AFS-002', rev:'A', status:'in-progress', start_date:'2024-06-11', priority:'high', assigned_to:['M. Santos'], hazmat:true, notes:'Check fibre direction carefully — asymmetric layup.', ops:cloneOps(['done','done','in-progress','pending','pending','pending','pending','pending','pending','pending','pending']) },
  { id:'WO-2024-003', component:'Main Spar Web — Centre Section', part_no:'362-15010', elbit_pn:'54-10-00590-00', drawing_no:'54-DP-000695', batch_no:'B-2024-MSW-003', rev:'B', status:'quality-hold', start_date:'2024-06-09', priority:'critical', assigned_to:['C. Neves','R. Alves'], hazmat:true, notes:'Critical primary structure — 100% inspection required.', ops:cloneOps(['done','done','done','done','done','done','quality-hold','pending','pending','pending','pending']) },
  { id:'WO-2024-004', component:'Rudder Trailing Edge', part_no:'362-16400', elbit_pn:'54-10-00602-00', drawing_no:'54-DP-000710', batch_no:'B-2024-RTE-004', rev:'—', status:'complete', start_date:'2024-06-07', priority:'normal', assigned_to:['P. Mota'], hazmat:false, notes:'', ops:cloneOps(['done','done','done','done','done','done','done','done','done','done','done']) },
  { id:'WO-2024-005', component:'Elevator Skin — Upper', part_no:'362-17100', elbit_pn:'54-10-00615-00', drawing_no:'54-DP-000722', batch_no:'B-2024-ESU-005', rev:'A', status:'pending', start_date:'2024-06-13', priority:'normal', assigned_to:[], hazmat:false, notes:'Awaiting mould release from WO-2024-004.', ops:cloneOps([]) },
  { id:'WO-2024-006', component:'Wing Root Rib No.3', part_no:'362-18050', elbit_pn:'54-10-00627-00', drawing_no:'54-DP-000735', batch_no:'B-2024-WRR-006', rev:'—', status:'pending', start_date:'2024-06-14', priority:'low', assigned_to:[], hazmat:false, notes:'', ops:cloneOps([]) },
];

const STARTER_USERS = [
  { username:'admin',    full_name:'System Administrator', role:'admin',    envKey:'SEED_ADMIN_PW' },
  { username:'engineer', full_name:'Engineering',          role:'engineer', envKey:'SEED_ENGINEER_PW' },
  { username:'quality',  full_name:'Quality',              role:'quality',  envKey:'SEED_QUALITY_PW' },
  { username:'operator', full_name:'Shop-floor Operator',  role:'operator', envKey:'SEED_OPERATOR_PW' },
];

(async () => {
  try {
    // Users
    for (const u of STARTER_USERS) {
      const pw = process.env[u.envKey];
      if (!pw) { console.warn(`⚠ Skipping "${u.username}" — ${u.envKey} not set.`); continue; }
      const hash = await bcrypt.hash(pw, 12);
      await pool.query(
        `INSERT INTO users (username, full_name, role, password_hash)
         VALUES ($1,$2,$3,$4)
         ON CONFLICT (username) DO NOTHING`,
        [u.username, u.full_name, u.role, hash]
      );
      console.log(`✓ User ready: ${u.username} (${u.role})`);
    }

    // Work orders
    for (const w of WOS) {
      await pool.query(
        `INSERT INTO work_orders
           (id, component, part_no, elbit_pn, drawing_no, batch_no, rev,
            status, priority, start_date, assigned_to, hazmat, notes, ops)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
         ON CONFLICT (id) DO NOTHING`,
        [w.id, w.component, w.part_no, w.elbit_pn, w.drawing_no, w.batch_no, w.rev,
         w.status, w.priority, w.start_date, JSON.stringify(w.assigned_to),
         w.hazmat, w.notes, JSON.stringify(w.ops)]
      );
    }
    console.log(`✓ Seeded ${WOS.length} work orders.`);
    console.log('\nDone. You can now start the server.');
  } catch (err) {
    console.error('✗ Seed failed:', err.message);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
})();
