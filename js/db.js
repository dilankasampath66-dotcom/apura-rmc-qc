// js/db.js
/* =========================================================================
   APURA / TOKYO SUPERMIX RMC QC & SALES MANAGEMENT SYSTEM
   Firebase Firestore Database Communication & CRUD API Module
   ========================================================================= */

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-app.js";
import { 
  getFirestore, 
  doc, 
  setDoc, 
  getDoc, 
  collection, 
  addDoc, 
  updateDoc, 
  deleteDoc, 
  getDocs, 
  query, 
  where, 
  orderBy 
} from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";

// Production Firebase Configuration for APURA RMC PLANT
const firebaseConfig = {
  apiKey: "AIzaSyDBIC3FUgKMqpN2OeCP6o43xoG7kYAs9Ok",
  authDomain: "apura-rmc-qc.firebaseapp.com",
  projectId: "apura-rmc-qc",
  storageBucket: "apura-rmc-qc.firebasestorage.app",
  messagingSenderId: "521259667866",
  appId: "1:521259667866:web:c46d5156a65e592ba46a23"
};

let db = null;
let firebaseActive = false;

// Initialize Firebase App & Cloud Firestore Service
try {
  if (firebaseConfig.apiKey) {
    const app = initializeApp(firebaseConfig);
    db = getFirestore(app);
    firebaseActive = true;
    console.log("🔥 Firebase Cloud Firestore initialized successfully for apura-rmc-qc.");
  }
} catch (err) {
  console.warn("⚠️ Firebase Cloud Firestore initialization failed. Local Storage fallback active:", err);
}

/**
 * Checks if Cloud Firestore service is active and connected
 */
export function isFirebaseActive() {
  return firebaseActive && db !== null;
}

/**
 * Saves the entire global application state object to Cloud Firestore as a unified document.
 * @param {Object} stateData - Complete state JSON tree { master, tests, activities, users, skippedTests, crmVisits, mixGrades }
 * @returns {Promise<boolean>} Success status
 */
export async function saveStateToFirestore(stateData) {
  if (!isFirebaseActive()) return false;
  try {
    const cleanState = JSON.parse(JSON.stringify(stateData));
    const docRef = doc(db, "apura_qc_system", "main_state");
    await setDoc(docRef, cleanState);
    console.log("☁️ Full system state saved to Cloud Firestore (apura_qc_system/main_state).");
    return true;
  } catch (err) {
    console.error("⚠️ Error saving state to Cloud Firestore:", err);
    return false;
  }
}

/**
 * Retrieves the full system state document from Cloud Firestore.
 * @returns {Promise<Object|null>} State data object or null if unavailable
 */
export async function loadStateFromFirestore() {
  if (!isFirebaseActive()) return null;
  try {
    const docRef = doc(db, "apura_qc_system", "main_state");
    const snap = await getDoc(docRef);
    if (snap.exists()) {
      console.log("☁️ Full system state loaded from Cloud Firestore (apura_qc_system/main_state).");
      return snap.data();
    } else {
      console.log("ℹ️ No existing Cloud Firestore document found. Default initialized.");
    }
  } catch (err) {
    console.error("⚠️ Error loading state from Cloud Firestore:", err);
  }
  return null;
}

/**
 * Adds a new Ready-Mix Concrete (RMC) casting record to Firestore.
 * @param {Object} castingRecord - Casting metadata (trackingNumber, customer, site, grade, volume, slump, cementContent, activeAges, etc.)
 */
export async function addCastingRecord(castingRecord) {
  if (!isFirebaseActive()) return false;
  try {
    const docRef = doc(db, "casting_records", castingRecord.trackingNumber);
    await setDoc(docRef, JSON.parse(JSON.stringify(castingRecord)));
    console.log(`✅ Casting record ${castingRecord.trackingNumber} saved to Firestore collection.`);
    return true;
  } catch (err) {
    console.error("⚠️ Error adding casting record to Firestore:", err);
    return false;
  }
}

/**
 * Updates parameters of an existing casting record.
 * @param {string} trackingNumber - Tracking number key (e.g., TKC-000001)
 * @param {Object} updateData - Updated parameters
 */
export async function updateCastingRecord(trackingNumber, updateData) {
  if (!isFirebaseActive()) return false;
  try {
    const docRef = doc(db, "casting_records", trackingNumber);
    await updateDoc(docRef, JSON.parse(JSON.stringify(updateData)));
    console.log(`✅ Casting record ${trackingNumber} updated in Firestore.`);
    return true;
  } catch (err) {
    console.error(`⚠️ Error updating casting record ${trackingNumber} in Firestore:`, err);
    return false;
  }
}

/**
 * Adds a cube test reading (3d, 7d, 14d, 28d) to Firestore.
 * @param {Object} testData - Test result (testId, trackingNumber, testingAge, load, weight, strength, testedBy)
 */
export async function addCubeTestResult(testData) {
  if (!isFirebaseActive()) return false;
  try {
    const docRef = doc(db, "cube_tests", testData.testId);
    await setDoc(docRef, JSON.parse(JSON.stringify(testData)));
    console.log(`✅ Cube test result ${testData.testId} saved to Firestore.`);
    return true;
  } catch (err) {
    console.error(`⚠️ Error adding cube test result ${testData.testId} to Firestore:`, err);
    return false;
  }
}

/**
 * Deletes a cube test sample reading.
 * @param {string} testId - Test reading identifier (e.g. TKC-000001-T1)
 */
export async function deleteTestReading(testId) {
  if (!isFirebaseActive()) return false;
  try {
    const docRef = doc(db, "cube_tests", testId);
    await deleteDoc(docRef);
    console.log(`🗑️ Cube test result ${testId} deleted from Firestore.`);
    return true;
  } catch (err) {
    console.error(`⚠️ Error deleting cube test ${testId} from Firestore:`, err);
    return false;
  }
}

/**
 * Adds a new Sales CRM Site Visit & Commercial Inquiry record.
 * @param {Object} visitData - CRM Site Visit (visitId, customerName, siteLocation, contactNumber, requestedGrade, estimatedVolume, pumpRequired, pumpCarRate, stage)
 */
export async function addCRMSiteVisit(visitData) {
  if (!isFirebaseActive()) return false;
  try {
    const docRef = doc(db, "crm_site_visits", visitData.visitId || `CRM-${Date.now()}`);
    await setDoc(docRef, JSON.parse(JSON.stringify(visitData)));
    console.log(`💼 CRM Site Visit ${visitData.customerName} saved to Firestore.`);
    return true;
  } catch (err) {
    console.error("⚠️ Error saving CRM Site Visit to Firestore:", err);
    return false;
  }
}

/**
 * Updates the sales CRM pipeline stage for a commercial inquiry.
 * @param {string} visitId - Visit ID
 * @param {string} newStage - Pipeline stage ('Lead', 'Site Inspection', 'Quotation Sent', 'Order Confirmed', 'Pour Completed')
 */
export async function updateCRMPipelineStage(visitId, newStage) {
  if (!isFirebaseActive()) return false;
  try {
    const docRef = doc(db, "crm_site_visits", visitId);
    await updateDoc(docRef, { stage: newStage, lastUpdated: new Date().toISOString() });
    console.log(`💼 CRM Visit ${visitId} updated to stage '${newStage}'.`);
    return true;
  } catch (err) {
    console.error(`⚠️ Error updating CRM Pipeline Stage for ${visitId}:`, err);
    return false;
  }
}

/**
 * Adds or updates custom Concrete Mix Design details.
 * @param {Object} gradeData - Mix design details (gradeCode, targetStrength, cementContent, wRatio, pumpable)
 */
export async function addConcreteGrade(gradeData) {
  if (!isFirebaseActive()) return false;
  try {
    const docRef = doc(db, "concrete_mixes", gradeData.gradeCode);
    await setDoc(docRef, JSON.parse(JSON.stringify(gradeData)));
    console.log(`🧪 Concrete Mix Grade ${gradeData.gradeCode} saved to Firestore.`);
    return true;
  } catch (err) {
    console.error("⚠️ Error saving Concrete Mix Grade to Firestore:", err);
    return false;
  }
}

/**
 * Logs a BS EN 12390 test skip deviation entry for Admin compliance auditing.
 * @param {Object} skipData - Test skip log (id, trackingNumber, skippedAge, skippedBy, reason, severity)
 */
export async function addTestSkipLog(skipData) {
  if (!isFirebaseActive()) return false;
  try {
    const docRef = doc(db, "skipped_test_logs", skipData.id);
    await setDoc(docRef, JSON.parse(JSON.stringify(skipData)));
    console.log(`⚠️ Test skip audit log ${skipData.id} recorded in Firestore.`);
    return true;
  } catch (err) {
    console.error("⚠️ Error saving Test Skip Audit Log to Firestore:", err);
    return false;
  }
}

// Expose database module functions onto window for legacy HTML event compatibility
window.dbAPI = {
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
};
