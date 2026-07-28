// js/app.js
/* =========================================================================
   TOKYO SUPERMIX / APURA RMC PLANT — SALES & QC MANAGEMENT SYSTEM
   Main Application Controller & Event Initialization Engine
   ========================================================================= */

import { dbManager } from "./db.js";
import { calculateConcreteQuotation } from "./pricingEngine.js";
import { validateStageTransition, computeTestingSchedule } from "./rulesEngine.js";
import { generateAIExecutiveInsights } from "./aiEngine.js";
import { validateEntryIntegrity } from "./selfImprovement.js";
import { runQAAutoTests } from "./autoQA.js";
import { exportFullExcelReport } from "./excelExport.js";

// Global Application State initialization
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
 * Initializes application event listeners, loads database state, and binds handlers on DOM load.
 */
document.addEventListener('DOMContentLoaded', async () => {
  console.log("🚀 Initializing Tokyo Supermix RMC Master Application (Cloud-First Architecture)...");

  // Intercept all form submit events to prevent page reloads
  setupFormInterceptors();

  // Attach Database Restore (JSON) and Export event listeners
  setupDatabaseIO();

  // Load state directly from Cloud Firestore (overwriting LocalStorage cache)
  await dbManager.initializeApp();

  // Run initial AI insights computation and QA test suite check
  if (typeof window.generateAIExecutiveInsights === 'function') {
    window.generateAIExecutiveInsights(window.state);
  }
});

/**
 * Intercepts form submissions across the application to prevent page reloads.
 */
function setupFormInterceptors() {
  document.querySelectorAll('form').forEach(form => {
    form.addEventListener('submit', (e) => {
      e.preventDefault();
    });
  });
}

/**
 * Attaches event listeners for JSON backup file restore and export buttons.
 */
function setupDatabaseIO() {
  const fileInputs = [
    document.getElementById('restore-file'),
    document.getElementById('input-import-db')
  ];

  fileInputs.forEach(input => {
    if (input) {
      input.addEventListener('change', async (evt) => {
        const file = evt.target.files?.[0];
        if (file) {
          try {
            await dbManager.importMasterDB(file);
            evt.target.value = '';
          } catch (err) {
            console.error("⚠️ Database import error:", err);
          }
        }
      });
    }
  });

  const importBtns = [
    document.getElementById('btn-restore-json'),
    document.getElementById('btn-trigger-import-db')
  ];

  importBtns.forEach(btn => {
    if (btn) {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        const input = document.getElementById('restore-file') || document.getElementById('input-import-db');
        if (input) input.click();
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
 * Global export wrappers for HTML event attributes
 */
export async function importJSON(evt) {
  if (evt && typeof evt.preventDefault === 'function') evt.preventDefault();
  const file = evt?.target?.files?.[0];
  if (file) {
    await dbManager.importMasterDB(file);
    if (evt.target) evt.target.value = '';
  }
}

export function exportJSON(evt) {
  if (evt && typeof evt.preventDefault === 'function') evt.preventDefault();
  dbManager.exportMasterDB();
}

export function exportExcel(evt) {
  if (evt && typeof evt.preventDefault === 'function') evt.preventDefault();
  exportFullExcelReport(window.state);
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

  const castingDate = document.getElementById('f-castingDate')?.value;
  const customer = (document.getElementById('f-customer')?.value || '').trim();
  const site = (document.getElementById('f-site')?.value || '').trim();
  const designCode = (document.getElementById('f-designCode')?.value || '').trim();
  const bulkNumber = (document.getElementById('f-bulk')?.value || '').trim();
  const grade = document.getElementById('f-grade')?.value;
  const slump = document.getElementById('f-slump')?.value;
  const cementSilo = document.getElementById('f-silo')?.value;
  const weather = document.getElementById('f-weather')?.value;
  const castedBy = (document.getElementById('f-castedBy')?.value || '').trim() || window.currentUser.username;
  const cementContent = parseFloat(document.getElementById('f-cement')?.value);
  const volume = parseFloat(document.getElementById('f-volume')?.value);
  const numCubes = parseInt(document.getElementById('f-numCubes')?.value, 10);

  const errors = validateEntryIntegrity({
    castingDate, customer, site, designCode, bulkNumber, volume, cementContent
  });

  if (errors.length) {
    window.toast?.(errors[0]);
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
    cementContent,
    volume,
    cementSilo,
    bulkNumber,
    castedBy,
    numCubes,
    activeAges,
    remarks: (document.getElementById('f-remarks')?.value || '').trim(),
    dateCreated: now,
    lastUpdated: now
  };

  window.state.master.push(castingRecord);
  dbManager.logActivity("New Entry", tn, castedBy, `Created casting record for ${customer} at ${site} (${numCubes} Cubes, ${volume} m³)`);

  // Direct targeted write to Cloud Firestore collection 'casting_records'
  await dbManager.createDocument("casting_records", tn, castingRecord);

  if (typeof window.updateSuggestions === 'function') window.updateSuggestions();
  if (typeof window.renderTestingSidebarList === 'function') window.renderTestingSidebarList();
  window.toast?.(`Saved — Tracking Number ${tn} generated.`);
  if (typeof window.clearEntryForm === 'function') window.clearEntryForm();
}

/**
 * Handles Cube Testing Result Submission
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

  // Direct targeted write to Cloud Firestore collection 'cube_tests'
  await dbManager.createDocument("cube_tests", testId, testData);

  if (typeof window.renderTestingSidebarList === 'function') window.renderTestingSidebarList();
  window.toast?.(`Test result ${testId} recorded (${strength} N/mm²).`);
}

// Expose app functions onto window object
window.importJSON = importJSON;
window.exportJSON = exportJSON;
window.exportExcel = exportExcel;
window.saveCubeEntry = saveCubeEntry;
window.saveTestResult = saveTestResult;
window.saveState = (st) => dbManager.saveMainStateDoc(st);
window.loadState = () => dbManager.initializeApp();
