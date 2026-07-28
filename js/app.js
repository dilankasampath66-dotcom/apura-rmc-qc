// js/app.js
/* =========================================================================
   APURA / TOKYO SUPERMIX RMC QC & SALES MANAGEMENT SYSTEM
   Core Application Controller, Form Handling, & Database Interface
   ========================================================================= */

import { 
  isFirebaseActive, 
  saveStateToFirestore, 
  loadStateFromFirestore, 
  addCastingRecord, 
  updateCastingRecord, 
  addCubeTestResult, 
  deleteTestReading, 
  addCRMSiteVisit, 
  updateCRMPipelineStage, 
  addConcreteGrade, 
  addTestSkipLog 
} from "./db.js";

const LS_KEY = 'apura_rmc_qc_data_v1';

// Global System Application State
window.state = {
  master: [],
  tests: [],
  activities: [],
  users: [],
  skippedTests: [],
  crmVisits: [],
  mixGrades: [],
  currentUser: null
};

window.currentUser = null;
window.nextTrackingSeq = 1;

/* ---------------------- PERSISTENCE & TIMING ---------------------- */

/**
 * Saves current application state asynchronously to LocalStorage and Cloud Firestore.
 */
export async function saveState() {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(window.state));
    if (isFirebaseActive()) {
      await saveStateToFirestore(window.state);
    }
  } catch (err) {
    console.error("⚠️ State persistence error:", err);
  }
}

/**
 * Asynchronously loads state from Cloud Firestore or Local Storage fallback.
 */
export async function loadState() {
  let loadedFromCloud = false;
  try {
    if (isFirebaseActive()) {
      const cloudData = await loadStateFromFirestore();
      if (cloudData && typeof cloudData === 'object') {
        window.state = {
          master: Array.isArray(cloudData.master) ? cloudData.master : [],
          tests: Array.isArray(cloudData.tests) ? cloudData.tests : [],
          activities: Array.isArray(cloudData.activities) ? cloudData.activities : [],
          users: Array.isArray(cloudData.users) ? cloudData.users : [],
          skippedTests: Array.isArray(cloudData.skippedTests) ? cloudData.skippedTests : [],
          crmVisits: Array.isArray(cloudData.crmVisits) ? cloudData.crmVisits : [],
          mixGrades: Array.isArray(cloudData.mixGrades) ? cloudData.mixGrades : [],
          currentUser: null
        };
        if (window.state.master.length || window.state.tests.length) {
          loadedFromCloud = true;
        }
      }
    }
  } catch (err) {
    console.warn("⚠️ Cloud load error, resorting to Local Storage:", err);
  }

  if (!loadedFromCloud) {
    const raw = localStorage.getItem(LS_KEY);
    if (raw) {
      try {
        const parsed = JSON.parse(raw);
        window.state = {
          master: Array.isArray(parsed.master) ? parsed.master : [],
          tests: Array.isArray(parsed.tests) ? parsed.tests : [],
          activities: Array.isArray(parsed.activities) ? parsed.activities : [],
          users: Array.isArray(parsed.users) ? parsed.users : [],
          skippedTests: Array.isArray(parsed.skippedTests) ? parsed.skippedTests : [],
          crmVisits: Array.isArray(parsed.crmVisits) ? parsed.crmVisits : [],
          mixGrades: Array.isArray(parsed.mixGrades) ? parsed.mixGrades : [],
          currentUser: null
        };
      } catch (e) {
        console.error('Error parsing stored Local Storage data:', e);
      }
    } else {
      populateSampleDataIfEmpty();
    }
  }

  if (!window.state.master) window.state.master = [];
  if (!window.state.tests) window.state.tests = [];
  if (!window.state.activities) window.state.activities = [];
  if (!window.state.users) window.state.users = [];
  if (!window.state.skippedTests) window.state.skippedTests = [];
  if (!window.state.crmVisits) window.state.crmVisits = [];
  if (!window.state.mixGrades) window.state.mixGrades = [];

  let maxSeq = 0;
  window.state.master.forEach(m => {
    if (!m.activeAges) m.activeAges = ['3 Days', '7 Days', '14 Days', '28 Days'];
    const n = parseInt((m.trackingNumber || '').split('-')[1], 10);
    if (!isNaN(n) && n > maxSeq) maxSeq = n;
  });
  window.nextTrackingSeq = maxSeq + 1;

  // Seed default admin and operator users if empty
  if (!window.state.users || !window.state.users.length) {
    window.state.users = [
      { username: 'admin', password: '123', role: 'admin' },
      { username: 'Jagath', password: '123', role: 'operator' },
      { username: 'Pushpe', password: '123', role: 'operator' },
      { username: 'Sunil', password: '123', role: 'operator' }
    ];
  } else {
    if (!window.state.users.some(u => u.username && u.username.toLowerCase() === 'admin')) {
      window.state.users.unshift({ username: 'admin', password: '123', role: 'admin' });
    }
  }

  await saveState();
  if (typeof window.updateSuggestions === 'function') window.updateSuggestions();
  if (typeof window.applyRoleRestrictions === 'function') window.applyRoleRestrictions();
}

/**
 * Seed initial sample RMC plant data if empty
 */
function populateSampleDataIfEmpty() {
  window.state.master = [
    {
      trackingNumber: "TKC-000001",
      castingDate: "2026-01-01",
      castTime: "09:00",
      customer: "SRI CONSTRUCTION",
      site: "VIJAYAPURA",
      weather: "☀ Sunny",
      designCode: "AB/C25/64",
      grade: "C25",
      slump: "160 mm",
      cementContent: 300,
      volume: 22.75,
      cementSilo: "Silo 01",
      bulkNumber: "BN-4521",
      castedBy: "Jagath",
      numCubes: 4,
      activeAges: ["3 Days", "7 Days", "14 Days", "28 Days"],
      remarks: "Plant pour Vijayapura",
      dateCreated: "2026-01-01T09:00:00.000Z",
      lastUpdated: "2026-01-29T10:00:00.000Z"
    }
  ];

  window.state.tests = [
    { testId: "TKC-000001-T1", trackingNumber: "TKC-000001", testingDate: "2026-01-08", testingAge: "7 Days", testedBy: "QC", load: 482.63, weight: 8.25, cubeSize: 150, strength: 21.45, designCode: "AB/C25/64", grade: "C25" },
    { testId: "TKC-000001-T2", trackingNumber: "TKC-000001", testingDate: "2026-01-29", testingAge: "28 Days", testedBy: "Technician", load: 717.75, weight: 8.30, cubeSize: 150, strength: 31.90, designCode: "AB/C25/64", grade: "C25" }
  ];

  window.state.activities = [
    { id: "ACT-00001", timestamp: "2026-01-01T09:00:00.000Z", formattedTime: "01/01/2026 09:00:00", actionType: "New Entry", trackingNumber: "TKC-000001", user: "Jagath", details: "Created casting record for SRI CONSTRUCTION (VIJAYAPURA, Grade C25, 4 Cubes, 22.75 m³)" }
  ];

  window.state.crmVisits = [
    { visitId: "CRM-001", customerName: "MAGA ENGINEERING", siteLocation: "Anuradhapura Hospital Project", contactNumber: "0771234567", requestedGrade: "C30", estimatedVolume: 150, pumpRequired: true, pumpCarRate: 25000, stage: "Quotation Sent", dateCreated: "2026-01-15T10:00:00.000Z" }
  ];
}

/* ---------------------- FORM SUBMISSION HANDLERS ---------------------- */

/**
 * Handles New Cube Casting Entry Form Submission.
 * Prevents default page reload and saves record asynchronously to database.
 */
export async function saveCubeEntry(e) {
  if (e && typeof e.preventDefault === 'function') e.preventDefault();
  if (!window.currentUser) { 
    if (typeof window.applyRoleRestrictions === 'function') window.applyRoleRestrictions(); 
    return; 
  }

  const customer = (document.getElementById('f-customer')?.value || '').trim();
  const site = (document.getElementById('f-site')?.value || '').trim();
  const designCode = (document.getElementById('f-designCode')?.value || '').trim();
  const bulk = (document.getElementById('f-bulk')?.value || '').trim();
  const castingDate = document.getElementById('f-castingDate')?.value;
  const grade = document.getElementById('f-grade')?.value;
  const slump = document.getElementById('f-slump')?.value;
  const silo = document.getElementById('f-silo')?.value;
  const weather = document.getElementById('f-weather')?.value;
  const castedBy = (document.getElementById('f-castedBy')?.value || '').trim() || window.currentUser.username;
  const cement = parseFloat(document.getElementById('f-cement')?.value);
  const volume = parseFloat(document.getElementById('f-volume')?.value);
  const numCubes = parseInt(document.getElementById('f-numCubes')?.value, 10);

  if (!castingDate) { window.toast?.('Casting Date is required.'); return; }
  if (!customer) { window.toast?.('Customer Name is required.'); return; }
  if (!site) { window.toast?.('Supply Site Location is required.'); return; }
  if (!designCode) { window.toast?.('Design Code is required.'); return; }
  if (!bulk) { window.toast?.('Bulk Number is required.'); return; }
  if (!grade) { window.toast?.('Grade is required.'); return; }
  if (!slump) { window.toast?.('Slump is required.'); return; }
  if (!silo) { window.toast?.('Cement Silo is required.'); return; }
  if (isNaN(cement) || cement < 0) { window.toast?.('Cement Content cannot be negative.'); return; }
  if (isNaN(volume) || volume < 0) { window.toast?.('Volume (m³) cannot be negative.'); return; }
  if (isNaN(numCubes) || numCubes < 1 || numCubes > 20) { window.toast?.('Number of Cubes must be between 1 and 20.'); return; }

  const selectedAges = [];
  if (document.getElementById('f-age-3d')?.checked) selectedAges.push('3 Days');
  if (document.getElementById('f-age-7d')?.checked) selectedAges.push('7 Days');
  if (document.getElementById('f-age-14d')?.checked) selectedAges.push('14 Days');
  if (document.getElementById('f-age-28d')?.checked) selectedAges.push('28 Days');
  const activeAges = selectedAges.length ? selectedAges : ['7 Days', '28 Days'];

  const tn = 'TKC-' + String(window.nextTrackingSeq).padStart(6, '0');
  window.nextTrackingSeq++;
  const now = new Date().toISOString();

  const castingRecord = {
    trackingNumber: tn, 
    castingDate, 
    castTime: document.getElementById('f-castTime')?.value || '',
    customer, 
    site, 
    weather, 
    designCode, 
    grade, 
    slump, 
    cementContent: cement, 
    volume, 
    cementSilo: silo,
    bulkNumber: bulk, 
    castedBy, 
    numCubes, 
    activeAges, 
    remarks: (document.getElementById('f-remarks')?.value || '').trim(),
    dateCreated: now, 
    lastUpdated: now
  };

  window.state.master.push(castingRecord);
  logActivity("New Entry", tn, castedBy, `Cast ${numCubes} cubes for ${customer} at ${site} (Grade: ${grade}, Vol: ${volume} m³, Active Ages: ${activeAges.join(', ')})`);

  // Direct Firestore collection update & unified state save
  await addCastingRecord(castingRecord);
  await saveState();

  if (typeof window.updateSuggestions === 'function') window.updateSuggestions();
  if (typeof window.renderTestingSidebarList === 'function') window.renderTestingSidebarList();
  window.toast?.(`Saved — Tracking Number ${tn} generated.`);
  if (typeof window.clearEntryForm === 'function') window.clearEntryForm();
}

/**
 * Handles Cube Testing Entry Result Form Submission.
 * Prevents default page reload and records test strength asynchronously.
 */
export async function saveTestResult(e) {
  if (e && typeof e.preventDefault === 'function') e.preventDefault();
  if (!window.currentTestingTN) { window.toast?.('No Tracking Number selected for testing.'); return; }

  const tn = window.currentTestingTN;
  const m = window.state.master.find(rec => rec.trackingNumber === tn);
  if (!m) return;

  const testingDate = document.getElementById('tt-e-date')?.value;
  const ageLabel = document.getElementById('tt-e-age')?.value;
  const testedBy = (document.getElementById('tt-e-testedby')?.value || '').trim() || (window.currentUser ? window.currentUser.username : 'QC');
  const load = parseFloat(document.getElementById('tt-e-load')?.value);
  const weight = parseFloat(document.getElementById('tt-e-weight')?.value) || 8.25;

  if (!testingDate) { window.toast?.('Testing Date is required.'); return; }
  if (isNaN(load) || load <= 0) { window.toast?.('Failure Load (kN) must be greater than 0.'); return; }
  if (isNaN(weight) || weight <= 0) { window.toast?.('Sample Weight (kg) must be greater than 0.'); return; }

  // BS EN 12390 Compressive Strength Formula: Strength (N/mm²) = Load (kN) * 1000 / (150mm * 150mm Area = 22500 mm²)
  const area = 22500;
  const strength = parseFloat(((load * 1000) / area).toFixed(2));

  const testId = `${tn}-T${window.state.tests.filter(t => t.trackingNumber === tn).length + 1}`;
  const testData = {
    testId,
    trackingNumber: tn,
    testingDate,
    testingAge: ageLabel,
    testedBy,
    load,
    weight,
    cubeSize: 150,
    strength,
    designCode: m.designCode,
    grade: m.grade
  };

  window.state.tests.push(testData);
  logActivity("Test Recorded", tn, testedBy, `Recorded ${ageLabel} test ${testId} (${strength} N/mm², ${load} kN)`);

  await addCubeTestResult(testData);
  await saveState();

  if (typeof window.renderTestingSidebarList === 'function') window.renderTestingSidebarList();
  window.toast?.(`Test result ${testId} recorded successfully (${strength} N/mm²).`);
}

/**
 * Handles Sales CRM Site Visit & Commercial Inquiry Form Submission.
 */
export async function saveCRMSiteVisit(e) {
  if (e && typeof e.preventDefault === 'function') e.preventDefault();

  const customerName = (document.getElementById('crm-customer')?.value || '').trim();
  const siteLocation = (document.getElementById('crm-site')?.value || '').trim();
  const contactNumber = (document.getElementById('crm-contact')?.value || '').trim();
  const requestedGrade = document.getElementById('crm-grade')?.value || 'C25';
  const estimatedVolume = parseFloat(document.getElementById('crm-volume')?.value || 0);
  const pumpRequired = document.getElementById('crm-pump')?.checked || false;
  const pumpCarRate = parseFloat(document.getElementById('crm-pumprate')?.value || 0);

  if (!customerName || !siteLocation) {
    window.toast?.('Customer Name and Site Location are required.');
    return;
  }

  const visitId = `CRM-${Date.now()}`;
  const visitData = {
    visitId,
    customerName,
    siteLocation,
    contactNumber,
    requestedGrade,
    estimatedVolume,
    pumpRequired,
    pumpCarRate,
    stage: 'Lead',
    dateCreated: new Date().toISOString()
  };

  if (!window.state.crmVisits) window.state.crmVisits = [];
  window.state.crmVisits.unshift(visitData);

  logActivity("CRM Visit Created", "—", window.currentUser ? window.currentUser.username : 'Sales', `Created CRM inquiry for ${customerName} at ${siteLocation} (${estimatedVolume} m³)`);

  await addCRMSiteVisit(visitData);
  await saveState();

  window.toast?.(`Sales inquiry for ${customerName} created.`);
}

/**
 * Helper to log system activity log entries.
 */
export function logActivity(actionType, trackingNumber, user, details) {
  if (!window.state.activities) window.state.activities = [];
  const act = {
    id: `ACT-${String(window.state.activities.length + 1).padStart(5, '0')}`,
    timestamp: new Date().toISOString(),
    formattedTime: new Date().toLocaleString(),
    actionType,
    trackingNumber: trackingNumber || '—',
    user: user || 'System',
    details
  };
  window.state.activities.unshift(act);
}

// Expose app controller methods to window object
window.saveState = saveState;
window.loadState = loadState;
window.saveCubeEntry = saveCubeEntry;
window.saveTestResult = saveTestResult;
window.saveCRMSiteVisit = saveCRMSiteVisit;
window.logActivity = logActivity;

// Initialize App Data on DOM Load
document.addEventListener('DOMContentLoaded', () => {
  loadState();
});
