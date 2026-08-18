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

const STD_WI_ID = 'WI-STD-001';

const WOS = [
  { id:'WO-2024-001', component:'Fwd Fuel Tank Bulkhead', part_no:'362-12120', elbit_pn:'54-10-00560-00', drawing_no:'54-DP-000675', batch_no:'B-2024-FTB-001', rev:'—', status:'in-progress', start_date:'2024-06-10', priority:'high', assigned_to:['A. Lima','T. Ribeiro'], hazmat:true, notes:'Resins — gloves mandatory at all times. PPE per H&S sheet p.3.', wi_id:STD_WI_ID, ops:cloneOps(['done','done','done','done','in-progress','pending','pending','pending','pending','pending','pending']) },
  { id:'WO-2024-002', component:'Aft Fuselage Skin Panel', part_no:'362-14200', elbit_pn:'54-10-00581-00', drawing_no:'54-DP-000681', batch_no:'B-2024-AFS-002', rev:'A', status:'in-progress', start_date:'2024-06-11', priority:'high', assigned_to:['M. Santos'], hazmat:true, notes:'Check fibre direction carefully — asymmetric layup.', wi_id:STD_WI_ID, ops:cloneOps(['done','done','in-progress','pending','pending','pending','pending','pending','pending','pending','pending']) },
  { id:'WO-2024-003', component:'Main Spar Web — Centre Section', part_no:'362-15010', elbit_pn:'54-10-00590-00', drawing_no:'54-DP-000695', batch_no:'B-2024-MSW-003', rev:'B', status:'quality-hold', start_date:'2024-06-09', priority:'critical', assigned_to:['C. Neves','R. Alves'], hazmat:true, notes:'Critical primary structure — 100% inspection required.', wi_id:STD_WI_ID, ops:cloneOps(['done','done','done','done','done','done','quality-hold','pending','pending','pending','pending']) },
  { id:'WO-2024-004', component:'Rudder Trailing Edge', part_no:'362-16400', elbit_pn:'54-10-00602-00', drawing_no:'54-DP-000710', batch_no:'B-2024-RTE-004', rev:'—', status:'complete', start_date:'2024-06-07', priority:'normal', assigned_to:['P. Mota'], hazmat:false, notes:'', wi_id:STD_WI_ID, ops:cloneOps(['done','done','done','done','done','done','done','done','done','done','done']) },
  { id:'WO-2024-005', component:'Elevator Skin — Upper', part_no:'362-17100', elbit_pn:'54-10-00615-00', drawing_no:'54-DP-000722', batch_no:'B-2024-ESU-005', rev:'A', status:'pending', start_date:'2024-06-13', priority:'normal', assigned_to:[], hazmat:false, notes:'Awaiting mould release from WO-2024-004.', wi_id:STD_WI_ID, ops:cloneOps([]) },
  { id:'WO-2024-006', component:'Wing Root Rib No.3', part_no:'362-18050', elbit_pn:'54-10-00627-00', drawing_no:'54-DP-000735', batch_no:'B-2024-WRR-006', rev:'—', status:'pending', start_date:'2024-06-14', priority:'low', assigned_to:[], hazmat:false, notes:'', wi_id:STD_WI_ID, ops:cloneOps([]) },
];

// Work Instructions — WI-STD-001 is the standard generic routing template
// that the 6 work orders above actually follow (same 11-op composition
// cloneOps() used to freeze into every WO; now it's a real, editable,
// linked record instead). WI-001..003 are the part-specific instructions
// that already existed as frontend-only mock data.
const WIS = [
  { id: STD_WI_ID, title: 'Standard Composite Part Routing — Generic Template', part_no: 'GENERIC', drawing_no: '—', rev: 'A00', status: 'released', author: 'System',
    ops: [
      { id: 1,  seq: '05',      name: 'Mould preparation',  type: 'prep',         dur: 60, hazmat: false, steps: [], mats: [], media: [] },
      { id: 2,  seq: '10',      name: 'Laminating',         type: 'laminating',   dur: 60, hazmat: false, steps: [], mats: [], media: [] },
      { id: 3,  seq: '20',      name: 'De-bulk #1',         type: 'debulk',       dur: 60, hazmat: false, steps: [], mats: [], media: [] },
      { id: 4,  seq: '30',      name: 'Laminating (cont.)', type: 'laminating',   dur: 60, hazmat: false, steps: [], mats: [], media: [] },
      { id: 5,  seq: '40',      name: 'De-bulk #2',         type: 'debulk',       dur: 60, hazmat: false, steps: [], mats: [], media: [] },
      { id: 6,  seq: '150-QG',  name: 'QG — Pre-cure',      type: 'quality-gate', dur: 60, hazmat: false, steps: [], mats: [], media: [] },
      { id: 7,  seq: '150',     name: 'Curing',             type: 'curing',       dur: 60, hazmat: false, steps: [], mats: [], media: [] },
      { id: 8,  seq: '160-QG',  name: 'QG — Final',         type: 'quality-gate', dur: 60, hazmat: false, steps: [], mats: [], media: [] },
      { id: 9,  seq: '160',     name: 'Trimming',           type: 'trimming',     dur: 60, hazmat: false, steps: [], mats: [], media: [] },
      { id: 10, seq: 'INS',     name: 'Inspection',         type: 'inspection',   dur: 60, hazmat: false, steps: [], mats: [], media: [] },
      { id: 11, seq: 'H&S',     name: 'Safety sign-off',    type: 'safety',       dur: 60, hazmat: false, steps: [], mats: [], media: [] },
    ] },
  { id: 'WI-001', title: 'Fwd Fuel Tank Bulkhead — Laminating & Trimming', part_no: '362-12120', drawing_no: '54-DP-000675', rev: '—', status: 'released', author: 'A. Bullan',
    ops: [
      { id: 1, seq: '05', name: 'Mould preparation', type: 'prep', dur: 60, hazmat: false, steps: ['Ensure mould 362-12120-0MA00 is prepared to PS 11-002', 'Use dot-stickers to cover all holes', 'Inspect mould for damage or contamination'], mats: [], media: [] },
      { id: 2, seq: '10', name: 'Laminating — plies 1–6 (surface film + carbon ±45)', type: 'laminating', dur: 90, hazmat: true, steps: ['Refer to PS 11-000. Tolerance ±2 mm', 'Overlap 12–20 mm. No overlaps in hatched areas', 'Lay ply 1: Surface Film 124g @ ±45 (EL 16) — 1-493-4504601', 'Lay ply 2: Carbon 195g @ ±45 (EL 6) — 1-493-2954601', 'Trim all plies to net-edge'], mats: [{ n: 'Surface Film 124g', c: '1-493-4504601', sz: 'EL 16', q: 3, u: 'ply', b: '' }, { n: 'Carbon 195g @ ±45', c: '1-493-2954601', sz: 'EL 6', q: 3, u: 'ply', b: '' }], media: [] },
      { id: 3, seq: '20', name: 'De-bulk #1', type: 'debulk', dur: 45, hazmat: false, steps: ['Apply Release Film P3 (perforated)', 'Apply Dry Peel Ply 52008', 'Apply Breather 150g', 'Install vacuum bag', 'Seal. Pull vacuum. RETAIN DE-BULK'], mats: [], media: [] },
      { id: 4, seq: '150-QG', name: 'QUALITY GATE — Pre-cure layup inspection', type: 'quality-gate', dur: 30, hazmat: false, steps: ['QE must inspect and approve before cure', 'Verify ply count and sequence per drawing', 'Check all orientations — sign Route Sheet'], mats: [], media: [] },
      { id: 5, seq: '150', name: 'Curing — vacuum bag & cycle', type: 'curing', dur: 480, hazmat: false, steps: ['Cure per PS 11-001 section 4.4.1.1', 'Apply bagging materials per standard section', 'Install 1× Vacuum Valve and 1× Sensor Valve'], mats: [], media: [] },
      { id: 6, seq: '160-QG', name: 'QUALITY GATE — Final inspection', type: 'quality-gate', dur: 60, hazmat: false, steps: ['Qualified inspector only — SOI I-362-12120', 'Visual — no cracks, voids or delamination', 'Flange thickness 2 mm, 28× holes A, hole B 22 mm', 'Cut-out D 200×250 mm — reject if any check fails'], mats: [], media: [] },
      { id: 7, seq: '160', name: 'Trimming — routing, drilling & de-flash', type: 'trimming', dur: 120, hazmat: false, steps: ['De-bag part, leave in mould for routing', 'Rout using 1/4" cutter with 1/8" offset collar', 'Drill 28× holes 4.3 mm and 1× hole 1/4"', 'De-flash and de-burr — weigh and pass to inspection'], mats: [], media: [] },
    ] },
  { id: 'WI-002', title: 'Aft Fuselage Skin Panel — Laminating', part_no: '362-14200', drawing_no: '54-DP-000681', rev: 'A', status: 'released', author: 'M. Santos',
    ops: [
      { id: 1, seq: '05', name: 'Mould preparation', type: 'prep', dur: 45, hazmat: false, steps: ['Clean and inspect mould', 'Apply release agent per PS 11-002'], mats: [], media: [] },
      { id: 2, seq: '10', name: 'Laminating — asymmetric layup', type: 'laminating', dur: 120, hazmat: true, steps: ['Check fibre direction carefully — asymmetric layup', 'Lay plies per drawing 54-DP-000681', 'Overlap 12–20 mm'], mats: [], media: [] },
      { id: 3, seq: '150-QG', name: 'QUALITY GATE — Pre-cure', type: 'quality-gate', dur: 30, hazmat: false, steps: ['Verify layup orientation and ply count', 'QE sign-off required before cure'], mats: [], media: [] },
      { id: 4, seq: '150', name: 'Curing', type: 'curing', dur: 480, hazmat: false, steps: ['Cure per PS 11-001', 'Vacuum bag setup per standard section'], mats: [], media: [] },
    ] },
  { id: 'WI-003', title: 'Main Spar Web — Critical Laminate', part_no: '362-15010', drawing_no: '54-DP-000695', rev: 'B', status: 'draft', author: 'C. Neves',
    ops: [
      { id: 1, seq: '05', name: 'Mould preparation', type: 'prep', dur: 60, hazmat: false, steps: ['Critical primary structure — 100% mould inspection required', 'Document mould serial number on Route Sheet'], mats: [], media: [] },
    ] },
];

// Controlled documents seeded into the Document Pyramid register — mirrors
// the set the frontend used to keep in a client-only mock array.
const DOCS = [
  // QM — Quality Manual
  {id:'QD-001',ref:'QD-001',level:'QM',category:'manual',title:'Quality Management Manual',rev:'R03',status:'approved',date:'2025-01-15',owner:'QMS_MR',standard:'AS9100D §4',retention:'LOC',description:'Entry point of the QMS. Describes scope, processes, responsibilities and authorities across the INFURCI organisation.',applicability:'All INFURCI personnel and activities',writer:'QMS_MR',checker:'QLT_QMS_TM',approver:'QLT_DR',approvals:{writer:{signed:true,name:'A. Monkari',date:'2025-01-14'},checker:{signed:true,name:'M. Laduron',date:'2025-01-14'},approver:{signed:true,name:'K. Vandierendonck',date:'2025-01-15'}},revHistory:[{rev:'R00',date:'2019-06-01',editor:'QMS_MR',object:'Initial issue'},{rev:'R01',date:'2020-11-10',editor:'QMS_MR',object:'Scope update'},{rev:'R02',date:'2022-05-14',editor:'QMS_MR',object:'AS9100D Rev D alignment'},{rev:'R03',date:'2025-01-15',editor:'QMS_MR',object:'Complete overhaul — EASA Part-21 addition'}],tags:['QMS','Manual'],format:'PDF / SharePoint',language:'English',linkedDocs:['QD-002','M02-01']},
  {id:'QD-002',ref:'QD-002',level:'QM',category:'manual',title:'Design Organisation Interface Document (DOID)',rev:'R01',status:'approved',date:'2024-11-01',owner:'DES_DR',standard:'AS9100D §8.3',retention:'LOC',description:'Defines the interface between the Design Organisation and the Production Organisation, including responsibilities for design verification and release.',applicability:'Design and Production departments',writer:'DES_DR',checker:'QMS_MR',approver:'HDO',approvals:{writer:{signed:true,name:'R. Pellin',date:'2024-10-30'},checker:{signed:true,name:'QMS_MR',date:'2024-10-31'},approver:{signed:true,name:'HDO',date:'2024-11-01'}},revHistory:[{rev:'R00',date:'2023-03-01',editor:'DES_DR',object:'Initial issue'},{rev:'R01',date:'2024-11-01',editor:'DES_DR',object:'DOA scope update — EASA.21J.678 reference added'}],tags:['DOA','Design','Interface'],format:'PDF / SharePoint',language:'English',linkedDocs:['QD-001']},
  // H4 — Procedures
  {id:'M02-01',ref:'M02-02-04-01',level:'H4',category:'procedures',title:'Organisation and Management of Documentation',rev:'R09',status:'approved',date:'2025-01-07',owner:'QLT_QMS_MR',standard:'AS9100D §7.5',retention:'6 YRS',description:'Defines the management rules for creation, approval, modification, and archiving of all documents in the SABCA/INFURCI document system. Covers document pyramid H1–H6, numbering, approval chain, diffusion, archiving, and destruction.',applicability:'All document creators — Quality, POW, PKU, Program Teams',writer:'QLT_QMS_MR',checker:'AFS_ICT_MR',approver:'M02-POW-TM',approvals:{writer:{signed:true,name:'Asmaa Monkari',date:'2025-01-07'},checker:{signed:true,name:'Miguel Laduron',date:'2025-01-07'},approver:{signed:true,name:'Kristine Vandierendonck',date:'2025-01-07'}},revHistory:[{rev:'R00',date:'2019-11-06',editor:'A. Monkari',object:'Creation — replaces MG-000-00, IQ40501, IQ40502, IQ41601'},{rev:'R05',date:'2022-03-11',editor:'A. Monkari',object:'PART21J removed; level 6 added; template nomenclatures updated'},{rev:'R06',date:'2022-11-28',editor:'A. Monkari',object:'Complete overhaul'},{rev:'R09',date:'2025-01-07',editor:'H. Cox',object:'§6.8.5 Archiving in IQSMS; SW End-of-subscription; Part 21G SMS'}],tags:['Documentation','Control'],format:'PDF / SharePoint',language:'English',linkedDocs:['QD-001']},
  {id:'M02-02',ref:'M02-04-02-01',level:'H4',category:'procedures',title:'Control of Nonconforming Outputs',rev:'R05',status:'approved',date:'2024-09-12',owner:'QLT_QMS_TM',standard:'AS9100D §8.7',retention:'LOP+6 YRS',description:'Procedure for identification, segregation, disposition and records of nonconforming products and services.',applicability:'Production, Quality, Inspection',writer:'QLT_QMS_TM',checker:'QLT_QMS_MR',approver:'QLT_DR',approvals:{writer:{signed:true,name:'QLT_QMS_TM',date:'2024-09-10'},checker:{signed:true,name:'QLT_QMS_MR',date:'2024-09-11'},approver:{signed:true,name:'QLT_DR',date:'2024-09-12'}},revHistory:[{rev:'R00',date:'2019-01-10',editor:'QLT_QMS_TM',object:'Initial issue'},{rev:'R05',date:'2024-09-12',editor:'QLT_QMS_TM',object:'RDR workflow updated; IQSMS link added'}],tags:['NCR','Nonconformance'],format:'PDF / SharePoint',language:'English',linkedDocs:['M02-01']},
  {id:'M02-03',ref:'C03-06-04-01',level:'H4',category:'procedures',title:'Program and Technical Documentation Management',rev:'R02',status:'approved',date:'2024-06-01',owner:'DCC_MR',standard:'AS9100D §7.5',retention:'LOP+6 YRS',description:'Defines rules for managing program-level and technical documents including MT, FT, TH and program-specific documents.',applicability:'Engineering, DCC, Program Teams',writer:'DCC_MR',checker:'QLT_QMS_MR',approver:'QLT_DR',approvals:{writer:{signed:true,name:'DCC_MR',date:'2024-05-30'},checker:{signed:true,name:'QLT_QMS_MR',date:'2024-05-31'},approver:{signed:true,name:'QLT_DR',date:'2024-06-01'}},revHistory:[{rev:'R00',date:'2021-03-01',editor:'DCC_MR',object:'Initial issue'},{rev:'R02',date:'2024-06-01',editor:'DCC_MR',object:'Alignment with VMP-001-002 and DOA process map'}],tags:['Documentation','Program','Technical'],format:'PDF / SharePoint',language:'English',linkedDocs:['M02-01','QD-002']},
  {id:'M02-04',ref:'M02-02-05-01',level:'H4',category:'procedures',title:'Internal Audit Procedure',rev:'R04',status:'approved',date:'2024-03-20',owner:'QLT_QMS_MR',standard:'AS9100D §9.2',retention:'7 YRS',description:'Defines the planning, execution, reporting and follow-up of internal quality audits across all QMS processes.',applicability:'Internal audit function, process owners',writer:'QLT_QMS_MR',checker:'QLT_QMS_TM',approver:'QLT_DR',approvals:{writer:{signed:true,name:'QLT_QMS_MR',date:'2024-03-18'},checker:{signed:true,name:'QLT_QMS_TM',date:'2024-03-19'},approver:{signed:true,name:'QLT_DR',date:'2024-03-20'}},revHistory:[{rev:'R00',date:'2020-02-01',editor:'QLT_QMS_MR',object:'Initial issue'},{rev:'R04',date:'2024-03-20',editor:'QLT_QMS_MR',object:'Updated audit scope for EASA Part-21 surveillance'}],tags:['Audit'],format:'PDF / SharePoint',language:'English',linkedDocs:['M02-01']},
  {id:'M02-05',ref:'M02-02-06-01',level:'H4',category:'procedures',title:'Corrective and Preventive Actions (CAPA)',rev:'R06',status:'approved',date:'2024-07-08',owner:'QLT_QMS_MR',standard:'AS9100D §10.2',retention:'7 YRS',description:'Defines the process for root cause analysis, corrective action, preventive action, and effectiveness verification.',applicability:'All departments — any person can initiate a CAPA',writer:'QLT_QMS_MR',checker:'QLT_QMS_TM',approver:'QLT_DR',approvals:{writer:{signed:true,name:'QLT_QMS_MR',date:'2024-07-06'},checker:{signed:true,name:'QLT_QMS_TM',date:'2024-07-07'},approver:{signed:true,name:'QLT_DR',date:'2024-07-08'}},revHistory:[{rev:'R00',date:'2019-03-15',editor:'QLT_QMS_MR',object:'Initial issue'},{rev:'R06',date:'2024-07-08',editor:'QLT_QMS_MR',object:'Process updated; IQSMS integration for CA tracking'}],tags:['CAPA','Corrective','Preventive'],format:'PDF / SharePoint',language:'English',linkedDocs:['M02-01','M02-04']},
  {id:'M02-06',ref:'C08-01-01-01',level:'H4',category:'procedures',title:'Supplier Qualification and Evaluation',rev:'R03',status:'approved',date:'2024-10-15',owner:'PUR_MR',standard:'AS9100D §8.4',retention:'LOP+6 YRS',description:'Defines supplier qualification, ASL management, supplier audit, supplier NCR, and SQA via Quality Plan.',applicability:'Procurement, Supplier Quality Assurance',writer:'PUR_MR',checker:'QLT_QMS_MR',approver:'QLT_DR',approvals:{writer:{signed:true,name:'PUR_MR',date:'2024-10-13'},checker:{signed:true,name:'QLT_QMS_MR',date:'2024-10-14'},approver:{signed:true,name:'QLT_DR',date:'2024-10-15'}},revHistory:[{rev:'R00',date:'2021-05-01',editor:'PUR_MR',object:'Initial issue'},{rev:'R03',date:'2024-10-15',editor:'PUR_MR',object:'Tier-1/Tier-2 distinction clarified; archiving per §6.8.8 added'}],tags:['Supplier','ASL','SQA'],format:'PDF / SharePoint',language:'English',linkedDocs:['M02-01']},
  {id:'M02-07',ref:'S02-02-01-01',level:'H4',category:'procedures',title:'Training, Competence and Qualification',rev:'R02',status:'approved',date:'2024-05-30',owner:'HR_DR',standard:'AS9100D §7.2',retention:'3 YRS post-departure',description:'Defines training needs identification, qualification requirements, competence matrix, and record management for all personnel.',applicability:'All departments',writer:'HR_DR',checker:'QLT_QMS_MR',approver:'QLT_DR',approvals:{writer:{signed:true,name:'HR_DR',date:'2024-05-28'},checker:{signed:true,name:'QLT_QMS_MR',date:'2024-05-29'},approver:{signed:true,name:'QLT_DR',date:'2024-05-30'}},revHistory:[{rev:'R00',date:'2021-09-01',editor:'HR_DR',object:'Initial issue'},{rev:'R02',date:'2024-05-30',editor:'HR_DR',object:'LMS integration; certification expiry alerts added'}],tags:['Training','Competence','HR'],format:'PDF / SharePoint',language:'English',linkedDocs:['M02-01']},
  {id:'M02-08',ref:'S04-01-01-01',level:'H4',category:'procedures',title:'Control of Monitoring and Measurement Equipment',rev:'R04',status:'in-review',date:'2025-02-01',owner:'LAB_MR',standard:'AS9100D §7.1.5',retention:'LOP+6 YRS',description:'Defines calibration planning, instrument register, calibration status marking, and action required when equipment is found out of calibration.',applicability:'All measurement and test equipment users',writer:'LAB_MR',checker:'QLT_QMS_TM',approver:'QLT_DR',approvals:{writer:{signed:true,name:'LAB_MR',date:'2025-01-30'},checker:{signed:false,name:'',date:''},approver:{signed:false,name:'',date:''}},revHistory:[{rev:'R00',date:'2020-04-01',editor:'LAB_MR',object:'Initial issue'},{rev:'R04',date:'2025-02-01',editor:'LAB_MR',object:'MES calibration alert integration; NADCAP scope expanded — IN REVIEW'}],tags:['Calibration','Measurement'],format:'PDF / SharePoint',language:'English',linkedDocs:['M02-01']},
  // H5 — Instructions
  {id:'I-001',ref:'VMI-QA-001',level:'H5',category:'instructions',title:'First Article Inspection (FAI) Instruction',rev:'A01',status:'approved',date:'2024-04-10',owner:'QLT_QMS_TM',standard:'AS9100D §8.5',retention:'LOP+6 YRS',description:'Step-by-step instruction for planning and conducting First Article Inspections per AS9102 requirements.',applicability:'Quality Engineering, Production',writer:'QLT_QMS_TM',checker:'QLT_QMS_MR',approver:'QLT_DR',approvals:{writer:{signed:true,name:'QLT_QMS_TM',date:'2024-04-09'},checker:{signed:true,name:'QLT_QMS_MR',date:'2024-04-09'},approver:{signed:true,name:'QLT_DR',date:'2024-04-10'}},revHistory:[{rev:'A00',date:'2023-01-15',editor:'QLT_QMS_TM',object:'Initial issue'},{rev:'A01',date:'2024-04-10',editor:'QLT_QMS_TM',object:'AS9102 Rev C alignment; balloon drawing requirements added'}],tags:['FAI','Inspection'],format:'PDF / SharePoint',language:'English',linkedDocs:['M02-02']},
  {id:'I-002',ref:'VMI-QA-002',level:'H5',category:'instructions',title:'In-Process Inspection Record — Composites',rev:'A02',status:'approved',date:'2024-04-18',owner:'QLT_QMS_TM',standard:'AS9100D §8.5',retention:'LOP+6 YRS',description:'Worksheet for recording in-process inspection checkpoints during composite manufacturing operations.',applicability:'Quality Control, Production — Composites',writer:'QLT_QMS_TM',checker:'QLT_QMS_MR',approver:'QLT_DR',approvals:{writer:{signed:true,name:'QLT_QMS_TM',date:'2024-04-17'},checker:{signed:true,name:'QLT_QMS_MR',date:'2024-04-18'},approver:{signed:true,name:'QLT_DR',date:'2024-04-18'}},revHistory:[{rev:'A00',date:'2023-06-01',editor:'QLT_QMS_TM',object:'Initial issue'},{rev:'A02',date:'2024-04-18',editor:'QLT_QMS_TM',object:'Out-time log column added; autoclave cycle reference added'}],tags:['Composites','Inspection','In-process'],format:'PDF / SharePoint',language:'English',linkedDocs:['I-005']},
  {id:'I-003',ref:'VMI-QA-003',level:'H5',category:'instructions',title:'Receiving Inspection Instruction',rev:'A00',status:'approved',date:'2023-11-05',owner:'ASI_MR',standard:'AS9100D §8.4',retention:'LOP+6 YRS',description:'Instruction for incoming material and component inspection including certificate review and dimensional checks.',applicability:'Receiving, Quality Inspection',writer:'ASI_MR',checker:'QLT_QMS_TM',approver:'QLT_DR',approvals:{writer:{signed:true,name:'ASI_MR',date:'2023-11-04'},checker:{signed:true,name:'QLT_QMS_TM',date:'2023-11-05'},approver:{signed:true,name:'QLT_DR',date:'2023-11-05'}},revHistory:[{rev:'A00',date:'2023-11-05',editor:'ASI_MR',object:'Initial issue'}],tags:['Receiving','Inspection','Incoming'],format:'PDF / SharePoint',language:'English',linkedDocs:['M02-06']},
  {id:'I-004',ref:'VMI-QA-004',level:'H5',category:'instructions',title:'RDR / Deviation Request Completion Guide',rev:'A03',status:'approved',date:'2024-08-22',owner:'QLT_QMS_TM',standard:'AS9100D §8.7',retention:'LOP+6 YRS',description:'Guide for completing, routing and closing Rejection / Deviation Reports including MRB submission.',applicability:'Quality Engineering, Production, QC',writer:'QLT_QMS_TM',checker:'QLT_QMS_MR',approver:'QLT_DR',approvals:{writer:{signed:true,name:'QLT_QMS_TM',date:'2024-08-20'},checker:{signed:true,name:'QLT_QMS_MR',date:'2024-08-21'},approver:{signed:true,name:'QLT_DR',date:'2024-08-22'}},revHistory:[{rev:'A00',date:'2022-01-10',editor:'QLT_QMS_TM',object:'Initial issue'},{rev:'A03',date:'2024-08-22',editor:'QLT_QMS_TM',object:'IQSMS auto-notification step added; Permit for Alternative procedure'}],tags:['RDR','NCR','Deviation'],format:'PDF / SharePoint',language:'English',linkedDocs:['M02-02']},
  {id:'I-005',ref:'VMI-QA-005',level:'H5',category:'instructions',title:'Out-time and Cold-storage Monitoring Worksheet',rev:'A01',status:'approved',date:'2024-01-09',owner:'QCS_MR',standard:'NADCAP',retention:'LOP+6 YRS',description:'Log sheet for tracking prepreg and adhesive out-time accumulation and cold-storage intervals against material batch limits.',applicability:'Composites shop — laminating operators',writer:'QCS_MR',checker:'QLT_QMS_TM',approver:'QLT_DR',approvals:{writer:{signed:true,name:'QCS_MR',date:'2024-01-08'},checker:{signed:true,name:'QLT_QMS_TM',date:'2024-01-08'},approver:{signed:true,name:'QLT_DR',date:'2024-01-09'}},revHistory:[{rev:'A00',date:'2023-02-01',editor:'QCS_MR',object:'Initial issue'},{rev:'A01',date:'2024-01-09',editor:'QCS_MR',object:'Thaw time tracking column added; batch card link added'}],tags:['Composites','Out-time','NADCAP'],format:'PDF / SharePoint',language:'Dutch / English',linkedDocs:['I-002']},
  {id:'I-006',ref:'VMI-QA-006',level:'H5',category:'instructions',title:'Autoclave Cycle Log — Composites',rev:'A02',status:'draft',date:'2025-03-10',owner:'QCS_MR',standard:'NADCAP / AS9100D',retention:'LOP+6 YRS',description:'Cycle record for each autoclave run including ramp rates, dwell time, pressure, thermocouple data and operator sign-off.',applicability:'Autoclave operators, Quality',writer:'QCS_MR',checker:'',approver:'',approvals:{writer:{signed:false,name:'',date:''},checker:{signed:false,name:'',date:''},approver:{signed:false,name:'',date:''}},revHistory:[{rev:'A00',date:'2023-08-01',editor:'QCS_MR',object:'Initial issue'},{rev:'A01',date:'2024-05-20',editor:'QCS_MR',object:'Thermocouple map reference added'},{rev:'A02',date:'2025-03-10',editor:'QCS_MR',object:'DRAFT — calibration cert link and lot traceability field — pending review'}],tags:['Autoclave','NADCAP','Composites'],format:'PDF / SharePoint',language:'English',linkedDocs:['I-005','I-002']},
  // REC — Records
  {id:'R-001',ref:'FRM-QA-001',level:'REC',category:'records',title:'Route Sheet / Manufacturing Dossier',status:'active',rev:'—',date:'—',owner:'Production',standard:'AS9100D §8.5',retention:'LOP+6 YRS',description:'Paper/electronic dossier accompanying each work order through production. Contains all operational sign-offs, inspection stamps, out-time logs, and final acceptance signature.',applicability:'All production work orders',writer:'Production',checker:'QCS',approver:'QC',approvals:{writer:{signed:true,name:'(per WO)',date:'(per WO)'},checker:{signed:true,name:'(per WO)',date:'(per WO)'},approver:{signed:true,name:'(per WO)',date:'(per WO)'}},revHistory:[],tags:['Record','Production','Traceability'],format:'Paper / S4Hana',language:'Language of the user',linkedDocs:['I-002','I-005']},
  {id:'R-002',ref:'FRM-QA-002',level:'REC',category:'records',title:'Non-Conformance Report (RDR)',status:'active',rev:'—',date:'—',owner:'Quality Control',standard:'AS9100D §8.7',retention:'LOP+6 YRS',description:'Form for recording, routing, and closing nonconformances. Includes MRB disposition fields and IQSMS reference.',applicability:'Quality Control, Production, QE',writer:'QC',checker:'QE',approver:'QM',approvals:{writer:{signed:true,name:'(per NCR)',date:'(per NCR)'},checker:{signed:true,name:'(per NCR)',date:'(per NCR)'},approver:{signed:true,name:'(per NCR)',date:'(per NCR)'}},revHistory:[],tags:['Record','NCR','RDR'],format:'Paper / S4Hana',language:'Language of the user',linkedDocs:['M02-02','I-004']},
  {id:'R-003',ref:'FRM-QA-003',level:'REC',category:'records',title:'CAPA Register',status:'active',rev:'—',date:'—',owner:'QMS_MR',standard:'AS9100D §10.2',retention:'7 YRS',description:'Electronic register of all corrective and preventive actions. Fields: ID, NCR source, type, title, root cause, actions, owner, target date, status, effectiveness review.',applicability:'Quality Management',writer:'QMS_MR',checker:'QLT_QMS_TM',approver:'QLT_DR',approvals:{writer:{signed:true,name:'(per entry)',date:'(per entry)'},checker:{signed:true,name:'(per entry)',date:'(per entry)'},approver:{signed:true,name:'(per entry)',date:'(per entry)'}},revHistory:[],tags:['Record','CAPA'],format:'Electronic / SharePoint',language:'English',linkedDocs:['M02-05']},
  {id:'R-004',ref:'FRM-QA-004',level:'REC',category:'records',title:'Calibration Certificate Register',status:'active',rev:'—',date:'—',owner:'LAB_MR',standard:'AS9100D §7.1.5',retention:'LOP+6 YRS',description:'Instrument register tracking calibration intervals, last/next dates, laboratory, certificate reference, and status.',applicability:'All measurement and test equipment',writer:'LAB_MR',checker:'QLT_QMS_TM',approver:'QLT_DR',approvals:{writer:{signed:true,name:'(per entry)',date:'(per entry)'},checker:{signed:true,name:'(per entry)',date:'(per entry)'},approver:{signed:true,name:'(per entry)',date:'(per entry)'}},revHistory:[],tags:['Record','Calibration'],format:'Electronic / LAB',language:'English',linkedDocs:['M02-08']},
  {id:'R-005',ref:'FRM-QA-005',level:'REC',category:'records',title:'Internal Audit Report',status:'active',rev:'—',date:'—',owner:'QMS_MR',standard:'AS9100D §9.2',retention:'7 YRS',description:'Standardised audit report capturing scope, criteria, method, team, findings (with category), observations, and agreed CAPAs.',applicability:'Internal audit function',writer:'Audit Lead',checker:'QMS_MR',approver:'QLT_DR',approvals:{writer:{signed:true,name:'(per audit)',date:'(per audit)'},checker:{signed:true,name:'(per audit)',date:'(per audit)'},approver:{signed:true,name:'(per audit)',date:'(per audit)'}},revHistory:[],tags:['Record','Audit'],format:'Electronic / IQSMS',language:'English',linkedDocs:['M02-04']},
  {id:'R-006',ref:'FRM-QA-006',level:'REC',category:'records',title:'Training Record / Individual Qualification Dossier',status:'active',rev:'—',date:'—',owner:'HR_DR',standard:'AS9100D §7.2',retention:'Permanent',description:'Individual file per employee containing qualifications held, certification dates, training records, and competence assessment results.',applicability:'All personnel',writer:'HR_DR',checker:'Line Manager',approver:'HR_DR',approvals:{writer:{signed:true,name:'(per person)',date:'(per person)'},checker:{signed:true,name:'(per person)',date:'(per person)'},approver:{signed:true,name:'(per person)',date:'(per person)'}},revHistory:[],tags:['Record','Training','Competence'],format:'Paper / LMS',language:'Language of the user',linkedDocs:['M02-07']},
  {id:'R-007',ref:'FRM-QA-007',level:'REC',category:'records',title:'Supplier Audit Report',status:'active',rev:'—',date:'—',owner:'PUR_MR',standard:'AS9100D §8.4',retention:'9 YRS',description:'Supplier audit findings report including pre-audit questionnaire results, on-site findings, corrective action requests, and follow-up closure.',applicability:'Supplier Quality Assurance',writer:'PUR_MR / SQA',checker:'QLT_QMS_MR',approver:'QLT_DR',approvals:{writer:{signed:true,name:'(per audit)',date:'(per audit)'},checker:{signed:true,name:'(per audit)',date:'(per audit)'},approver:{signed:true,name:'(per audit)',date:'(per audit)'}},revHistory:[],tags:['Record','Supplier','Audit'],format:'Electronic',language:'English',linkedDocs:['M02-06']},
  {id:'R-008',ref:'FRM-QA-008',level:'REC',category:'records',title:'Management Review Minutes',status:'active',rev:'—',date:'—',owner:'QLT_DR',standard:'AS9100D §9.3',retention:'6 YRS',description:'Minutes of the annual management review covering QMS performance, audit results, CAPAs, customer feedback, and improvement objectives.',applicability:'Top management, QMS_MR',writer:'QMS_MR',checker:'QLT_QMS_TM',approver:'QLT_DR',approvals:{writer:{signed:true,name:'(per meeting)',date:'(per meeting)'},checker:{signed:true,name:'(per meeting)',date:'(per meeting)'},approver:{signed:true,name:'(per meeting)',date:'(per meeting)'}},revHistory:[],tags:['Record','Management Review'],format:'Electronic / SharePoint',language:'English',linkedDocs:['M02-04','M02-05']},
];

// DOA Processes Map register — same shape/features as DOCS above, but with
// DOA's own field names (docNo, owner/verifiedBy/approvedBy, levels
// L1/L2/L3/VMF/VML). docNo doubles as the id since it's already unique.
const DOA_DOCS = [
  {docNo:'VMP-001-002',level:'L2',title:'Configuration Management Procedure',rev:'C00',status:'approved',date:'2024-03-01',owner:'CM/PO',verifiedBy:'COA',approvedBy:'HDO',storage:'WM',compliance:'21.A.31,21.A.33(b)',description:'Defines the configuration management process for design data, drawings and the engineering bill of materials across the DOA.',applicability:'Configuration Management, Program Office',approvals:{owner:{signed:true,name:'CM/PO',date:'2024-02-27'},verifiedBy:{signed:true,name:'COA',date:'2024-02-28'},approvedBy:{signed:true,name:'HDO',date:'2024-03-01'}},revHistory:[{rev:'B00',date:'2022-06-01',editor:'CM/PO',object:'Initial issue'},{rev:'C00',date:'2024-03-01',editor:'CM/PO',object:'EBoM template alignment; ECR/ECN workflow updated'}],tags:['Configuration','DOA'],linkedDocs:['VMF-001-011']},
  {docNo:'VMI-001-001',level:'L3',title:'Control of Documented Information',rev:'B01',status:'approved',date:'2024-01-15',owner:'CM/PO',verifiedBy:'COA',approvedBy:'HDO',storage:'WM',compliance:'21.A.239',description:'Instruction for creation, review, approval, distribution and archiving of documented information within the DOA.',applicability:'All DOA document creators',approvals:{owner:{signed:true,name:'CM/PO',date:'2024-01-13'},verifiedBy:{signed:true,name:'COA',date:'2024-01-14'},approvedBy:{signed:true,name:'HDO',date:'2024-01-15'}},revHistory:[{rev:'B00',date:'2021-04-01',editor:'CM/PO',object:'Initial issue'},{rev:'B01',date:'2024-01-15',editor:'CM/PO',object:'Distribution list clarified'}],tags:['Documentation','DOA'],linkedDocs:['VMP-001-002']},
  {docNo:'VMI-001-002',level:'L3',title:'Identification and Marking of Parts',rev:'A02',status:'approved',date:'2023-10-05',owner:'CM/PO',verifiedBy:'AEDP',approvedBy:'COA',storage:'WM',compliance:'21.A.131, DIN EN 2851',description:'Instruction for identification and permanent marking of parts and assemblies per DIN EN 2851.',applicability:'Design, Production, Quality',approvals:{owner:{signed:true,name:'CM/PO',date:'2023-10-03'},verifiedBy:{signed:true,name:'AEDP',date:'2023-10-04'},approvedBy:{signed:true,name:'COA',date:'2023-10-05'}},revHistory:[{rev:'A00',date:'2021-09-01',editor:'CM/PO',object:'Initial issue'},{rev:'A02',date:'2023-10-05',editor:'CM/PO',object:'Marking method table updated'}],tags:['Marking','Identification'],linkedDocs:[]},
  {docNo:'VMI-001-007',level:'L3',title:'Prototype Data Configuration Management and Release',rev:'B00',status:'approved',date:'2023-05-20',owner:'CM/PO',verifiedBy:'COA',approvedBy:'HDO',storage:'WM',compliance:'21.A.31',description:'Instruction for managing and releasing prototype configuration data prior to type design freeze.',applicability:'Design, Configuration Management',approvals:{owner:{signed:true,name:'CM/PO',date:'2023-05-18'},verifiedBy:{signed:true,name:'COA',date:'2023-05-19'},approvedBy:{signed:true,name:'HDO',date:'2023-05-20'}},revHistory:[{rev:'A00',date:'2022-02-01',editor:'CM/PO',object:'Initial issue'},{rev:'B00',date:'2023-05-20',editor:'CM/PO',object:'Prototype release checklist added'}],tags:['Prototype','Configuration'],linkedDocs:['VMP-001-002']},
  {docNo:'VMI-042-004',level:'L3',title:'Flight Test Aircraft Management',rev:'A00',status:'approved',date:'2023-08-01',owner:'FTO/HoFT',verifiedBy:'HoFT',approvedBy:'HDO',storage:'WM',compliance:'21.A.239(a)',description:'Instruction for management of flight test aircraft configuration, status and airworthiness records.',applicability:'Flight Test Organisation',approvals:{owner:{signed:true,name:'FTO/HoFT',date:'2023-07-30'},verifiedBy:{signed:true,name:'HoFT',date:'2023-07-31'},approvedBy:{signed:true,name:'HDO',date:'2023-08-01'}},revHistory:[{rev:'A00',date:'2023-08-01',editor:'FTO/HoFT',object:'Initial issue'}],tags:['Flight Test'],linkedDocs:['VMP-042-001']},
  {docNo:'VMP-042-001',level:'L2',title:'Flight Test Operations Manual',rev:'B00',status:'approved',date:'2024-02-10',owner:'FTO/HoFT',verifiedBy:'COA',approvedBy:'HDO',storage:'WM',compliance:'EASA 21J.678',description:'Procedure governing flight test planning, execution, safety and reporting under the DOA privileges.',applicability:'Flight Test Organisation, Safety',approvals:{owner:{signed:true,name:'FTO/HoFT',date:'2024-02-08'},verifiedBy:{signed:true,name:'COA',date:'2024-02-09'},approvedBy:{signed:true,name:'HDO',date:'2024-02-10'}},revHistory:[{rev:'A00',date:'2022-09-01',editor:'FTO/HoFT',object:'Initial issue'},{rev:'B00',date:'2024-02-10',editor:'FTO/HoFT',object:'Flight test request/order forms referenced'}],tags:['Flight Test','Operations'],linkedDocs:['VMF-042-009','VMF-042-011']},
  {docNo:'VMP-042-002',level:'L2',title:'Approval of Flight Conditions',rev:'A02',status:'approved',date:'2024-04-05',owner:'FTO/HoFT',verifiedBy:'COA',approvedBy:'HDO',storage:'WM',compliance:'21.A.710',description:'Procedure for establishing and approving flight conditions and permit-to-fly justification.',applicability:'Flight Test Organisation, COA',approvals:{owner:{signed:true,name:'FTO/HoFT',date:'2024-04-03'},verifiedBy:{signed:true,name:'COA',date:'2024-04-04'},approvedBy:{signed:true,name:'HDO',date:'2024-04-05'}},revHistory:[{rev:'A00',date:'2022-11-01',editor:'FTO/HoFT',object:'Initial issue'},{rev:'A02',date:'2024-04-05',editor:'FTO/HoFT',object:'Permit-to-fly justification template updated'}],tags:['Flight Test','Permit to Fly'],linkedDocs:['VMP-042-001']},
  {docNo:'VCH-000-001',level:'L1',title:'Compliance Management Handbook',rev:'A01',status:'approved',date:'2022-01-27',owner:'CRCO',verifiedBy:'Head of Legal',approvedBy:'CRCO',storage:'WM',compliance:'ISO 37301, AktG §93',description:'Top-level handbook describing the compliance management system, roles and escalation paths.',applicability:'All personnel',approvals:{owner:{signed:true,name:'CRCO',date:'2022-01-25'},verifiedBy:{signed:true,name:'Head of Legal',date:'2022-01-26'},approvedBy:{signed:true,name:'CRCO',date:'2022-01-27'}},revHistory:[{rev:'A00',date:'2021-01-01',editor:'CRCO',object:'Initial issue'},{rev:'A01',date:'2022-01-27',editor:'CRCO',object:'ISO 37301 alignment'}],tags:['Compliance','Handbook'],linkedDocs:[]},
  {docNo:'VMF-000-001',level:'VMF',title:'Form QMS Non-Conformity Report',rev:'A03',status:'approved',date:'2024-06-01',owner:'CoISM',verifiedBy:'COA',approvedBy:'HDO',storage:'WM',compliance:'21.A.239',description:'Standard form for recording, routing and closing a quality non-conformity report.',applicability:'Quality, Production, Design',approvals:{owner:{signed:true,name:'CoISM',date:'2024-05-30'},verifiedBy:{signed:true,name:'COA',date:'2024-05-31'},approvedBy:{signed:true,name:'HDO',date:'2024-06-01'}},revHistory:[{rev:'A00',date:'2021-01-01',editor:'CoISM',object:'Initial issue'},{rev:'A03',date:'2024-06-01',editor:'CoISM',object:'MRB disposition fields added'}],tags:['Form','Non-Conformity'],linkedDocs:['VMF-002-001']},
  {docNo:'VMF-001-016',level:'VMF',title:'Engineering Change Note (ECN) Template',rev:'A00',status:'approved',date:'2023-03-01',owner:'CM/PO',verifiedBy:'AEDP',approvedBy:'COA',storage:'WM',compliance:'21.A.91',description:'Standard template for recording an approved Engineering Change Note.',applicability:'Design, Configuration Management',approvals:{owner:{signed:true,name:'CM/PO',date:'2023-02-27'},verifiedBy:{signed:true,name:'AEDP',date:'2023-02-28'},approvedBy:{signed:true,name:'COA',date:'2023-03-01'}},revHistory:[{rev:'A00',date:'2023-03-01',editor:'CM/PO',object:'Initial issue'}],tags:['Form','ECN'],linkedDocs:['VMF-001-018']},
  {docNo:'VMF-001-018',level:'VMF',title:'Engineering Change Request (ECR)',rev:'A00',status:'approved',date:'2023-03-01',owner:'CM/PO',verifiedBy:'AEDP',approvedBy:'COA',storage:'WM',compliance:'21.A.91',description:'Standard template for raising an Engineering Change Request ahead of CCB review.',applicability:'Design, Configuration Management',approvals:{owner:{signed:true,name:'CM/PO',date:'2023-02-27'},verifiedBy:{signed:true,name:'AEDP',date:'2023-02-28'},approvedBy:{signed:true,name:'COA',date:'2023-03-01'}},revHistory:[{rev:'A00',date:'2023-03-01',editor:'CM/PO',object:'Initial issue'}],tags:['Form','ECR'],linkedDocs:['VMF-001-016']},
  {docNo:'VMF-001-011',level:'VMF',title:'Template Engineering Bill of Materials (EBoM)',rev:'A00',status:'approved',date:'2022-08-01',owner:'CM/PO',verifiedBy:'COA',approvedBy:'HDO',storage:'WM',compliance:'21.A.31',description:'Standard EBoM template used to record part numbers, revisions and configuration status.',applicability:'Design, Configuration Management',approvals:{owner:{signed:true,name:'CM/PO',date:'2022-07-30'},verifiedBy:{signed:true,name:'COA',date:'2022-07-31'},approvedBy:{signed:true,name:'HDO',date:'2022-08-01'}},revHistory:[{rev:'A00',date:'2022-08-01',editor:'CM/PO',object:'Initial issue'}],tags:['Form','EBoM'],linkedDocs:['VMP-001-002']},
  {docNo:'VMF-002-001',level:'VMF',title:'Non-Conformity Report — Products & Parts',rev:'A00',status:'approved',date:'2022-05-01',owner:'OoA/QM',verifiedBy:'COA',approvedBy:'HDO',storage:'V-drive',compliance:'21.A.239 §4.5',description:'Standard form for reporting non-conforming products and parts identified during production or receiving inspection.',applicability:'Quality, Production',approvals:{owner:{signed:true,name:'OoA/QM',date:'2022-04-29'},verifiedBy:{signed:true,name:'COA',date:'2022-04-30'},approvedBy:{signed:true,name:'HDO',date:'2022-05-01'}},revHistory:[{rev:'A00',date:'2022-05-01',editor:'OoA/QM',object:'Initial issue'}],tags:['Form','Non-Conformity'],linkedDocs:['VMF-000-001']},
  {docNo:'VMF-042-009',level:'VMF',title:'Form Flight Test Request (FTQ)',rev:'A04',status:'approved',date:'2024-05-15',owner:'FTO/HoFT',verifiedBy:'AEDP',approvedBy:'COA',storage:'WM',compliance:'21.A.239',description:'Standard form for requesting a flight test, including objectives, conditions and risk assessment.',applicability:'Flight Test Organisation',approvals:{owner:{signed:true,name:'FTO/HoFT',date:'2024-05-13'},verifiedBy:{signed:true,name:'AEDP',date:'2024-05-14'},approvedBy:{signed:true,name:'COA',date:'2024-05-15'}},revHistory:[{rev:'A00',date:'2021-06-01',editor:'FTO/HoFT',object:'Initial issue'},{rev:'A04',date:'2024-05-15',editor:'FTO/HoFT',object:'Risk assessment section expanded'}],tags:['Form','Flight Test'],linkedDocs:['VMF-042-011']},
  {docNo:'VMF-042-011',level:'VMF',title:'Form Flight Test Order (FTO)',rev:'A03',status:'approved',date:'2024-05-15',owner:'FTO/HoFT',verifiedBy:'AEDP',approvedBy:'COA',storage:'WM',compliance:'21.A.239',description:'Standard form authorising a flight test order once the request is approved.',applicability:'Flight Test Organisation',approvals:{owner:{signed:true,name:'FTO/HoFT',date:'2024-05-13'},verifiedBy:{signed:true,name:'AEDP',date:'2024-05-14'},approvedBy:{signed:true,name:'COA',date:'2024-05-15'}},revHistory:[{rev:'A00',date:'2021-06-01',editor:'FTO/HoFT',object:'Initial issue'},{rev:'A03',date:'2024-05-15',editor:'FTO/HoFT',object:'Aligned with FTQ form fields'}],tags:['Form','Flight Test'],linkedDocs:['VMF-042-009']},
  {docNo:'VMF-042-006',level:'VMF',title:'Aircraft Technical Logbook',rev:'A00',status:'approved',date:'2022-03-01',owner:'FTO/HoFT',verifiedBy:'AEDP',approvedBy:'COA',storage:'WM',compliance:'21.A.239',description:'Standard technical logbook form for recording flight hours, defects and maintenance actions per aircraft.',applicability:'Flight Test Organisation, Maintenance',approvals:{owner:{signed:true,name:'FTO/HoFT',date:'2022-02-27'},verifiedBy:{signed:true,name:'AEDP',date:'2022-02-28'},approvedBy:{signed:true,name:'COA',date:'2022-03-01'}},revHistory:[{rev:'A00',date:'2022-03-01',editor:'FTO/HoFT',object:'Initial issue'}],tags:['Form','Logbook'],linkedDocs:[]},
];

// Design & Development Management — New Part Design records, Engineering
// Work Orders and Engineering Change Orders. Mirrors the frontend's old
// client-only mock arrays so seeded environments look identical to what
// the app used to show before these got real backend persistence.
const DDM_NPDS = [
  {id:'NPD-2024-001',pn:'PRT-V21-100-003',title:'Canopy Frame — Carbon/Epoxy',system:'Airframe',partType:'Composite primary structure',dal:'C — Major',de1:'R. Pellin',de2:'',cve:'C. Neves',qm:'QMS_MR',cm:'DCC_MR',me:'MEN_TM',devqa:'DevQA_TM',created:'2024-04-01',initiator:'R. Pellin',phase:'Detailed Design',status:'in-progress',description:'Carbon/epoxy canopy frame for VHUNTER P1. Wet layup + autoclave cure. Primary structure DAL C.',entryRequirements:'Aircraft system requirements v1.3, Initial sizing loads DS-100-002',
    architecturePhase:{sddChapter:'Canopy Integration — Aircraft SDD §6.4',interfaceDoc:'ICD-100-003 Canopy-to-Fuselage Interface',reviewChecklist:'CHK-V21-ARCH-003',configControlled:true,de2Review:true,de1Review:true,cveReview:false,qmReview:false,approvalDate:'',approver:'',gateStatus:'complete',gateDate:'2024-04-20'},
    prelimDesignPhase:{icdRef:'ICD-100-003 Rev A',moldSurfaces3D:'CAD-100-003-OML-RevA',loadSpecDoc:'DS-100-003 Canopy Load Spec',reviewChecklist:'CHK-V21-PDR-003',configControlled:true,de2Review:true,de1Review:true,cveReview:true,qmReview:false,approvalDate:'',approver:'',gateStatus:'complete',gateDate:'2024-05-25',pdrHeld:true,pdrDate:'2024-05-25'},
    detailedDesignPhase:{engineeringDwgRef:'DWG-100-003-A',productionDwgRef:'DWG-100-003-P-A',assemblyDwgRef:'DWG-100-003-ASM-A',threeDModelRef:'CAD-100-003-DET-RevA',stressAnalysisRef:'RPT-STR-003',freqAnalysisRef:'',aeroAnalysisRef:'',designDescRef:'DD-100-003',reviewChecklist:'CHK-V21-CDR-003',de2Review:false,de1Review:false,cveReview:false,qmReview:false,configControlled:false,approvalDate:'',approver:'',gateStatus:'in-progress',gateDate:'2024-09-01',cdrHeld:false,bundleReleased:false},
    exitCriteria:{allDocsCCd:false,allCVESigned:false,qmWorkInstrCheck:false,noUncompliancies:false,finalDeclCompliance:false},
    qaIssues:[],prLinks:[],ecnLinks:[],markingMethod:'D2',materialSpec:'HexPly M21 CF/Epoxy UD',notes:'Post-cure indicator label required per VMI-001-002 §3.1.7.'},
  {id:'NPD-2024-002',pn:'PRT-V21-700-001',title:'Nose Radome — Glass/Epoxy',system:'Airframe',partType:'Composite secondary structure',dal:'D — Minor',de1:'R. Pellin',de2:'',cve:'',qm:'QMS_MR',cm:'DCC_MR',me:'',devqa:'',created:'2024-06-01',initiator:'R. Pellin',phase:'Architecture',status:'open',description:'Glass fibre radome for forward radar/sensor bay. RF-transparent structure.',entryRequirements:'System requirements pending',
    architecturePhase:{sddChapter:'',interfaceDoc:'',reviewChecklist:'',configControlled:false,de2Review:false,de1Review:false,cveReview:false,qmReview:false,approvalDate:'',approver:'',gateStatus:'open',gateDate:''},
    prelimDesignPhase:{icdRef:'',moldSurfaces3D:'',loadSpecDoc:'',reviewChecklist:'',configControlled:false,de2Review:false,de1Review:false,cveReview:false,qmReview:false,approvalDate:'',approver:'',gateStatus:'not-started',gateDate:'',pdrHeld:false,pdrDate:''},
    detailedDesignPhase:{engineeringDwgRef:'',productionDwgRef:'',assemblyDwgRef:'',threeDModelRef:'',stressAnalysisRef:'',freqAnalysisRef:'',aeroAnalysisRef:'',designDescRef:'',reviewChecklist:'',de2Review:false,de1Review:false,cveReview:false,qmReview:false,configControlled:false,approvalDate:'',approver:'',gateStatus:'not-started',gateDate:'',cdrHeld:false,bundleReleased:false},
    exitCriteria:{allDocsCCd:false,allCVESigned:false,qmWorkInstrCheck:false,noUncompliancies:false,finalDeclCompliance:false},
    qaIssues:[],prLinks:[],ecnLinks:[],markingMethod:'D2',materialSpec:'',notes:''},
];

const DDM_EWOS = [
  {id:'EWO-2024-001',npdId:'NPD-2024-001',title:'Develop preliminary 3D model and OML mold surfaces — canopy frame',assignedTo:'R. Pellin',discipline:'Airframe',status:'in-progress',priority:'high',opened:'2024-04-25',due:'2024-06-30',hours:40,hoursLogged:22,deliverable:'CAD-100-003-OML-RevA released in PLM',notes:'Coordinate with FCS team on canopy actuator interface before OML finalised.'},
  {id:'EWO-2024-002',npdId:'NPD-2024-001',title:'Structural sizing — canopy frame under limit load conditions',assignedTo:'Structures CVE',discipline:'Structures',status:'open',priority:'high',opened:'2024-05-10',due:'2024-07-15',hours:60,hoursLogged:0,deliverable:'RPT-STR-003 Stress analysis report',notes:'Use DS-100-003 load cases. Check panel buckling mode.'},
  {id:'EWO-2024-003',npdId:'NPD-2024-001',title:'Engineering drawing package — canopy frame',assignedTo:'R. Pellin',discipline:'Airframe',status:'open',priority:'medium',opened:'2024-05-20',due:'2024-08-01',hours:50,hoursLogged:0,deliverable:'DWG-100-003-A, DWG-100-003-P-A, DWG-100-003-ASM-A',notes:'Use drawing template VMF-010-059. 4-eyes check required.'},
  {id:'EWO-2024-004',npdId:'NPD-2024-002',title:'Architecture definition — nose radome concept',assignedTo:'R. Pellin',discipline:'Airframe',status:'open',priority:'low',opened:'2024-06-05',due:'2024-08-30',hours:20,hoursLogged:0,deliverable:'Radome architecture section in Aircraft SDD',notes:'Coordinate RF requirements with Avionics team.'},
];

const DDM_ECOS = [
  {id:'ECO-2024-001',linkedPn:'PRT-V21-100-001',linkedNPD:'NPD-2024-001',title:'Increase aft spar CFRP local layup thickness +15% at rib station R8',changeClass:'Class I — affects airworthiness / safety / interchangeability / interface',system:'Airframe',discipline:'Structures',initiator:'R. Pellin',initiatedDate:'2024-05-12',status:'ccb-approved',priority:'high',
    reasonForChange:'Static load test showed local buckling margin <1.0 at rib 8 under limit load. Margin increase required before first flight.',problemRef:'PR-2024-001',
    preChangeConfig:'DWG-100-001-A Rev A — 8 plies UD 0° local reinforcement',postChangeConfig:'DWG-100-001-A Rev B — 10 plies UD 0° + 2 plies ±45° local reinforcement',
    impactWeight:'+0.18 kg (acceptable — within 2 kg margin)',impactCost:'Material cost +€240 per unit',impactSchedule:'2 weeks — new layup schedule',
    impactAirworthiness:'Improves structural margin. No certification impact (DAL C). CVE reviewed.',impactInterface:'No interface change. OML unchanged.',impactOtherSystems:'None',
    classificationJustification:'Primary structure modification — affects structural integrity. Class I per VMP-001-002 §4.1.1.',
    affectedDocuments:['DWG-100-001-A','MBoM-MSN001','PS-11-002 Layup Procedure'],affectedPNs:['PRT-V21-100-001 Rev B'],
    approvals:{de1:{signed:true,name:'R. Pellin',date:'2024-05-14',role:'Design Engineer (DE1)'},de2:{signed:false,name:'',date:'',role:'Senior Design Engineer (DE2)'},cve:{signed:true,name:'C. Neves',date:'2024-05-17',role:'CVE — Structures'},qm:{signed:true,name:'QMS_MR',date:'2024-05-18',role:'Quality Manager'},cm:{signed:true,name:'DCC_MR',date:'2024-05-19',role:'Configuration Manager'},ccb1:{signed:true,name:'CCB Chair',date:'2024-05-20',role:'CCB1 Approval'},ccb2:{signed:false,name:'',date:'',role:'CCB2 — Full detail review'},hdo:{signed:false,name:'',date:'',role:'Head of Design (HDO)'}},
    implementation:{ecnRef:'ECN-2024-001',ecnStatus:'issued',implementedBy:'R. Pellin',implementedDate:'',verifiedBy:'',verifiedDate:'',ebomupdated:false,plmUpdated:false,drawingsUpdated:false,closedDate:''},
    notes:'Rework MSN001 before next ground run. Document construction log per VMF-002-004.'},
  {id:'ECO-2024-002',linkedPn:'PRT-V21-200-001',linkedNPD:'',title:'FCS servo actuator gain schedule update — Rev B to Rev C',changeClass:'Class I — affects airworthiness / safety / interchangeability / interface',system:'Flight Control System',discipline:'Avionics / SW',initiator:'FCS Team',initiatedDate:'2024-06-01',status:'in-review',priority:'high',
    reasonForChange:'Flight test simulation shows oscillatory response at 40% throttle. Gain schedule requires update per control law maturity review.',problemRef:'PR-2024-002',
    preChangeConfig:'SW v1.1.0 — Gain table G-FCS-001 Rev B',postChangeConfig:'SW v1.2.0 — Gain table G-FCS-001 Rev C',
    impactWeight:'None',impactCost:'SW development 3 weeks effort',impactSchedule:'3 weeks to develop, test, verify DAL A',
    impactAirworthiness:'DAL A software change. Full DO-178C qualification loop required.',impactInterface:'No hardware interface change.',impactOtherSystems:'Autopilot tuning may require adjustment.',
    classificationJustification:'Software change affecting flight safety — DAL A. Class I per VMP-001-002.',
    affectedDocuments:['SW-FCS-001 SW Design Doc','PSAC-FCS-001','SVP-FCS-001'],affectedPNs:['PRT-V21-200-001 Rev C'],
    approvals:{de1:{signed:true,name:'FCS Lead',date:'2024-06-03',role:'Design Engineer (DE1)'},de2:{signed:false,name:'',date:'',role:'Senior Design Engineer (DE2)'},cve:{signed:false,name:'',date:'',role:'CVE — Avionics'},qm:{signed:false,name:'',date:'',role:'Quality Manager'},cm:{signed:false,name:'',date:'',role:'Configuration Manager'},ccb1:{signed:false,name:'',date:'',role:'CCB1 Approval'},ccb2:{signed:false,name:'',date:'',role:'CCB2 — Full detail review'},hdo:{signed:false,name:'',date:'',role:'Head of Design (HDO)'}},
    implementation:{ecnRef:'',ecnStatus:'not-issued',implementedBy:'',implementedDate:'',verifiedBy:'',verifiedDate:'',ebomupdated:false,plmUpdated:false,drawingsUpdated:false,closedDate:''},
    notes:'DO-178C compliance evidence must accompany CCB2 package.'},
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

    // Work instructions — seeded before work orders since work_orders.wi_id
    // references work_instructions(id).
    for (const wi of WIS) {
      await pool.query(
        `INSERT INTO work_instructions (id, title, part_no, drawing_no, rev, status, author, ops)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
         ON CONFLICT (id) DO NOTHING`,
        [wi.id, wi.title, wi.part_no, wi.drawing_no, wi.rev, wi.status, wi.author, JSON.stringify(wi.ops)]
      );
    }
    console.log(`✓ Seeded ${WIS.length} work instructions.`);

    // Work orders
    for (const w of WOS) {
      await pool.query(
        `INSERT INTO work_orders
           (id, component, part_no, elbit_pn, drawing_no, batch_no, rev,
            status, priority, start_date, assigned_to, hazmat, notes, ops, wi_id)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
         ON CONFLICT (id) DO NOTHING`,
        [w.id, w.component, w.part_no, w.elbit_pn, w.drawing_no, w.batch_no, w.rev,
         w.status, w.priority, w.start_date, JSON.stringify(w.assigned_to),
         w.hazmat, w.notes, JSON.stringify(w.ops), w.wi_id]
      );
      // Backfill wi_id for rows that already existed from an earlier seed run
      // (ON CONFLICT DO NOTHING above skips them entirely otherwise).
      await pool.query(
        `UPDATE work_orders SET wi_id = $2 WHERE id = $1 AND wi_id IS NULL`,
        [w.id, w.wi_id]
      );
    }
    console.log(`✓ Seeded ${WOS.length} work orders.`);

    // Controlled documents
    for (const d of DOCS) {
      await pool.query(
        `INSERT INTO controlled_documents
           (id, ref, level, category, title, rev, status, doc_date, owner, standard, retention,
            description, applicability, writer, checker, approver, approvals, rev_history, tags,
            format, language, linked_docs)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22)
         ON CONFLICT (id) DO NOTHING`,
        [d.id, d.ref, d.level, d.category, d.title, d.rev, d.status, d.date, d.owner, d.standard,
         d.retention, d.description, d.applicability, d.writer, d.checker, d.approver,
         JSON.stringify(d.approvals || {}), JSON.stringify(d.revHistory || []), JSON.stringify(d.tags || []),
         d.format, d.language, JSON.stringify(d.linkedDocs || [])]
      );
    }
    console.log(`✓ Seeded ${DOCS.length} controlled documents.`);

    // DOA Processes Map documents
    for (const d of DOA_DOCS) {
      await pool.query(
        `INSERT INTO doa_documents
           (id, doc_no, level, title, rev, status, doc_date, owner, verified_by, approved_by,
            storage, compliance, description, applicability, approvals, rev_history, tags, linked_docs)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)
         ON CONFLICT (id) DO NOTHING`,
        [d.docNo, d.docNo, d.level, d.title, d.rev, d.status, d.date, d.owner, d.verifiedBy,
         d.approvedBy, d.storage, d.compliance, d.description, d.applicability,
         JSON.stringify(d.approvals || {}), JSON.stringify(d.revHistory || []),
         JSON.stringify(d.tags || []), JSON.stringify(d.linkedDocs || [])]
      );
    }
    console.log(`✓ Seeded ${DOA_DOCS.length} DOA documents.`);

    // Design & Development Management — each record's full nested shape
    // is stored as-is in a single `data` JSONB column (same pattern as
    // work_instructions.ops).
    for (const n of DDM_NPDS) {
      await pool.query(
        `INSERT INTO design_npds (id, data) VALUES ($1,$2) ON CONFLICT (id) DO NOTHING`,
        [n.id, JSON.stringify(n)]
      );
    }
    console.log(`✓ Seeded ${DDM_NPDS.length} part design records.`);

    for (const e of DDM_EWOS) {
      await pool.query(
        `INSERT INTO design_ewos (id, data) VALUES ($1,$2) ON CONFLICT (id) DO NOTHING`,
        [e.id, JSON.stringify(e)]
      );
    }
    console.log(`✓ Seeded ${DDM_EWOS.length} engineering work orders.`);

    for (const e of DDM_ECOS) {
      await pool.query(
        `INSERT INTO design_ecos (id, data) VALUES ($1,$2) ON CONFLICT (id) DO NOTHING`,
        [e.id, JSON.stringify(e)]
      );
    }
    console.log(`✓ Seeded ${DDM_ECOS.length} engineering change orders.`);

    console.log('\nDone. You can now start the server.');
  } catch (err) {
    console.error('✗ Seed failed:', err.message);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
})();
