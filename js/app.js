// js/app.js
/* =========================================================================
   TOKYO SUPERMIX / APURA RMC PLANT — SALES & QC MANAGEMENT SYSTEM
   Core Application Controller, Form Handlers, & Master DB Import/Export Logic
   ========================================================================= */

import { dbManager } from "./db.js";

// Global System Application State reference
window.state = window.state || {
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

/**
 * Initializes application event listeners and loads persistent state on DOM ready.
 */
document.addEventListener('DOMContentLoaded', async () => {
  console.log("🚀 Initializing Tokyo Supermix RMC Application Logic...");
  
  // Attach event listeners for restore file inputs and import buttons
  setupImportExportListeners();

  // Attach form submit interceptors with event.preventDefault()
  setupFormSubmitInterceptors();

  // Load state from Cloud Firestore or LocalStorage
  await dbManager.loadState();
});

/**
 * Attaches event listeners to database JSON import & export buttons/inputs.
 */
function setupImportExportListeners() {
  const restoreFileInputs = [
    document.getElementById('restore-file'),
    document.getElementById('input-import-db')
  ];

  restoreFileInputs.forEach(input => {
    if (input) {
      input.addEventListener('change', async (evt) => {
        const file = evt.target.files?.[0];
        if (file) {
          try {
            await dbManager.importMasterDB(file);
            evt.target.value = '';
          } catch (err) {
            console.error("Import listener error:", err);
          }
        }
      });
    }
  });

  const importTriggerBtns = [
    document.getElementById('btn-restore-json'),
    document.getElementById('btn-trigger-import-db')
  ];

  importTriggerBtns.forEach(btn => {
    if (btn) {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        const fileInput = document.getElementById('restore-file') || document.getElementById('input-import-db');
        if (fileInput) fileInput.click();
      });
    }
  });

  const exportBtn = document.getElementById('btn-backup-json');
  if (exportBtn) {
    exportBtn.addEventListener('click', (e) => {
      e.preventDefault();
      dbManager.exportMasterDB();
    });
  }
}

/**
 * Intercepts form submissions across the application to prevent page reloads
 * before data is saved asynchronously to Cloud Firestore and LocalStorage.
 */
function setupFormSubmitInterceptors() {
  const forms = document.querySelectorAll('form');
  forms.forEach(form => {
    form.addEventListener('submit', (e) => {
      e.preventDefault();
    });
  });
}

/**
 * Global wrapper for importJSON called directly from inline HTML onchange
 */
export async function importJSON(evt) {
  if (evt && typeof evt.preventDefault === 'function') evt.preventDefault();
  const file = evt?.target?.files?.[0];
  if (file) {
    await dbManager.importMasterDB(file);
    if (evt.target) evt.target.value = '';
  }
}

/**
 * Global wrapper for exportJSON called directly from inline HTML onclick
 */
export function exportJSON(evt) {
  if (evt && typeof evt.preventDefault === 'function') evt.preventDefault();
  dbManager.exportMasterDB();
}

/**
 * Handles New Cube Entry Form submission with e.preventDefault()
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

  if (!castingDate || !customer || !site || !designCode || !bulk || !grade || !slump || !silo) {
    window.toast?.('Please complete all required fields.');
    return;
  }
  if (isNaN(cement) || cement < 0 || isNaN(volume) || volume < 0 || isNaN(numCubes) || numCubes < 1) {
    window.toast?.('Please check numeric field inputs.');
    return;
  }

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
  dbManager.logActivity("New Entry", tn, castedBy, `Created casting record for ${customer} at ${site} (${numCubes} Cubes, ${volume} m³)`);

  await dbManager.addCastingRecord(castingRecord);
  await dbManager.saveState(window.state);

  if (typeof window.updateSuggestions === 'function') window.updateSuggestions();
  if (typeof window.renderTestingSidebarList === 'function') window.renderTestingSidebarList();
  window.toast?.(`Saved — Tracking Number ${tn} generated.`);
  if (typeof window.clearEntryForm === 'function') window.clearEntryForm();
}

/**
 * Handles Cube Test Result submission with e.preventDefault()
 */
export async function saveTestResult(e) {
  if (e && typeof e.preventDefault === 'function') e.preventDefault();
  if (!window.currentTestingTN) { window.toast?.('No Tracking Number selected.'); return; }

  const tn = window.currentTestingTN;
  const m = window.state.master.find(rec => rec.trackingNumber === tn);
  if (!m) return;

  const testingDate = document.getElementById('tt-e-date')?.value;
  const ageLabel = document.getElementById('tt-e-age')?.value;
  const testedBy = (document.getElementById('tt-e-testedby')?.value || '').trim() || (window.currentUser ? window.currentUser.username : 'QC');
  const load = parseFloat(document.getElementById('tt-e-load')?.value);
  const weight = parseFloat(document.getElementById('tt-e-weight')?.value) || 8.25;

  if (!testingDate || isNaN(load) || load <= 0) {
    window.toast?.('Please specify a valid testing date and failure load (kN).');
    return;
  }

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
  dbManager.logActivity("Test Recorded", tn, testedBy, `Recorded ${ageLabel} test ${testId} (${strength} N/mm², ${load} kN)`);

  await dbManager.addCubeTestResult(testData);
  await dbManager.saveState(window.state);

  if (typeof window.renderTestingSidebarList === 'function') window.renderTestingSidebarList();
  window.toast?.(`Test result ${testId} recorded (${strength} N/mm²).`);
}

// Expose app functions onto window object
window.importJSON = importJSON;
window.exportJSON = exportJSON;
window.saveCubeEntry = saveCubeEntry;
window.saveTestResult = saveTestResult;
window.saveState = (st) => dbManager.saveState(st);
window.loadState = () => dbManager.loadState();
