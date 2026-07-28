// js/db.js
/* =========================================================================
   TOKYO SUPERMIX / APURA RMC PLANT — SALES & QC MANAGEMENT SYSTEM
   DatabaseManager Class & Firebase Firestore Database Communication Module
   (Strict Top-Down Cloud -> Local Initialization Architecture)
   ========================================================================= */

const LS_KEY = 'apura_rmc_qc_data_v1';

// Production Firebase Configuration for APURA RMC PLANT
const firebaseConfig = {
  apiKey: "AIzaSyDBIC3FUgKMqpN2OeCP6o43xoG7kYAs9Ok",
  authDomain: "apura-rmc-qc.firebaseapp.com",
  projectId: "apura-rmc-qc",
  storageBucket: "apura-rmc-qc.firebasestorage.app",
  messagingSenderId: "521259667866",
  appId: "1:521259667866:web:c46d5156a65e592ba46a23"
};

export class DatabaseManager {
  constructor() {
    this.db = null;
    this.firebaseActive = false;
    this.initFirebase();
  }

  /**
   * Initializes Firebase App & Cloud Firestore Service using Compat API
   */
  initFirebase() {
    try {
      if (typeof firebase !== 'undefined' && firebase.initializeApp) {
        if (!firebase.apps.length) {
          firebase.initializeApp(firebaseConfig);
        }
        this.db = firebase.firestore();
        // Enable Long Polling to prevent WebChannel RPC Write stream transport errors
        this.db.settings({
          experimentalForceLongPolling: true,
          merge: true
        });

        // Enable Offline IndexedDB Persistence
        this.db.enablePersistence({ synchronizeTabs: true }).catch((err) => {
          console.warn("⚠️ Firestore persistence notice:", err.code);
        });

        this.firebaseActive = true;
        console.log("🔥 Firebase Firestore DatabaseManager connected via Compat CDN API.");
      } else {
        console.warn("⚠️ Firebase Compat SDK not available globally on window.");
      }
    } catch (err) {
      console.warn("⚠️ Firebase initialization error. Falling back to LocalStorage:", err);
    }
  }

  isFirebaseActive() {
    return this.firebaseActive && this.db !== null;
  }

  /**
   * Single Source of Truth on Startup: Fetches live data directly FROM Firebase Cloud Firestore.
   * If data exists in Firebase, populates window.state and caches to LocalStorage.
   * STRICT RULE: NEVER pushes or syncs LocalStorage data to Firebase during initialization.
   */
  async loadFromFirebase() {
    if (!this.isFirebaseActive()) return false;
    try {
      const docRef = this.db.collection("apura_qc_system").doc("main_state");
      const snap = await docRef.get();
      if (snap.exists) {
        const cloudData = snap.data();
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

          // Cache cloud state to LocalStorage for offline backup (WITHOUT pushing to Firebase)
          localStorage.setItem(LS_KEY, JSON.stringify(window.state));
          console.log("☁️ Primary Cloud Firestore state loaded as Single Source of Truth on startup.");
          return true;
        }
      }
    } catch (err) {
      console.warn("⚠️ loadFromFirebase error, falling back to Local Storage:", err);
    }
    return false;
  }

  /**
   * Saves global application state to Local Storage and Cloud Firestore document.
   * STRICT RULE: Called ONLY when user explicitly performs an action (form submission, JSON restore, etc.).
   * @param {Object} stateData - Unified state object
   */
  async saveState(stateData) {
    const targetState = stateData || window.state;
    try {
      localStorage.setItem(LS_KEY, JSON.stringify(targetState));
      if (this.isFirebaseActive()) {
        if (typeof navigator !== 'undefined' && navigator.onLine === false) {
          console.log("⚡ Device offline: Data preserved in LocalStorage and IndexedDB queue.");
          return true;
        }
        const cleanState = JSON.parse(JSON.stringify(targetState));
        await this.db.collection("apura_qc_system").doc("main_state").set(cleanState);
        console.log("☁️ State synced to Cloud Firestore (apura_qc_system/main_state).");
      }
      return true;
    } catch (err) {
      console.warn("⚡ Firestore save queued locally (offline / network error):", err.message || err);
      return false;
    }
  }

  /**
   * Top-Down Initialization Logic: Loads state FROM Cloud Firestore first on app load.
   * DOES NOT push LocalStorage or seed data to Firebase on page load.
   */
  async loadState() {
    // 1. Attempt to fetch from Firebase Cloud Firestore first
    let loadedFromCloud = await this.loadFromFirebase();

    // 2. If Cloud read failed or offline, fallback to LocalStorage
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
          console.error("Error parsing Local Storage state:", e);
        }
      } else {
        this.seedInitialData();
      }
    }

    // Default arrays & Admin user verification
    if (!window.state.master) window.state.master = [];
    if (!window.state.tests) window.state.tests = [];
    if (!window.state.activities) window.state.activities = [];
    if (!window.state.users) window.state.users = [];
    if (!window.state.skippedTests) window.state.skippedTests = [];
    if (!window.state.crmVisits) window.state.crmVisits = [];
    if (!window.state.mixGrades) window.state.mixGrades = [];

    if (!window.state.users.some(u => u.username && u.username.toLowerCase() === 'admin')) {
      window.state.users.unshift({ username: 'admin', password: '123', role: 'admin' });
    }

    let maxSeq = 0;
    window.state.master.forEach(m => {
      if (!m.activeAges) m.activeAges = ['3 Days', '7 Days', '14 Days', '28 Days'];
      const n = parseInt((m.trackingNumber || '').split('-')[1], 10);
      if (!isNaN(n) && n > maxSeq) maxSeq = n;
    });
    window.nextTrackingSeq = maxSeq + 1;

    // STRICT RULE: DO NOT call saveState() here on page load!
    return window.state;
  }

  /**
   * Imports a Master DB JSON backup file using FileReader, updates local state,
   * and performs asynchronous batch writes to Cloud Firestore collections.
   * @param {File} file - Uploaded JSON backup file
   */
  async importMasterDB(file) {
    if (!file) return false;
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = async (e) => {
        try {
          const data = JSON.parse(e.target.result);
          if (!data.master && !data.tests && !data.crmVisits) {
            throw new Error("Invalid Master Database JSON schema");
          }

          // Update application state
          window.state = {
            master: Array.isArray(data.master) ? data.master : [],
            tests: Array.isArray(data.tests) ? data.tests : [],
            activities: Array.isArray(data.activities) ? data.activities : [],
            users: Array.isArray(data.users) ? data.users : (window.state.users || []),
            skippedTests: Array.isArray(data.skippedTests) ? data.skippedTests : [],
            crmVisits: Array.isArray(data.crmVisits) ? data.crmVisits : [],
            mixGrades: Array.isArray(data.mixGrades) ? data.mixGrades : [],
            currentUser: window.currentUser
          };

          if (!window.state.users.some(u => u.username && u.username.toLowerCase() === 'admin')) {
            window.state.users.unshift({ username: 'admin', password: '123', role: 'admin' });
          }

          let maxSeq = 0;
          window.state.master.forEach(m => {
            if (!m.activeAges) m.activeAges = ['3 Days', '7 Days', '14 Days', '28 Days'];
            const n = parseInt((m.trackingNumber || '').split('-')[1], 10);
            if (!isNaN(n) && n > maxSeq) maxSeq = n;
          });
          window.nextTrackingSeq = maxSeq + 1;

          this.logActivity(
            "Backup Restore", 
            "—", 
            window.currentUser ? window.currentUser.username : 'Admin', 
            `Restored database backup (${window.state.master.length} castings, ${window.state.tests.length} tests, ${window.state.crmVisits.length} CRM inquiries)`
          );

          // User explicitly triggered restore — save to Cloud Firestore & LocalStorage
          await this.saveState(window.state);

          // Batch Sync to Cloud Firestore Individual Collections
          if (this.isFirebaseActive()) {
            const batch = this.db.batch();
            
            for (const m of window.state.master) {
              const ref = this.db.collection("casting_records").doc(m.trackingNumber);
              batch.set(ref, JSON.parse(JSON.stringify(m)));
            }

            for (const t of window.state.tests) {
              const ref = this.db.collection("cube_tests").doc(t.testId);
              batch.set(ref, JSON.parse(JSON.stringify(t)));
            }

            for (const v of window.state.crmVisits) {
              const ref = this.db.collection("crm_site_visits").doc(v.visitId || `CRM-${Date.now()}`);
              batch.set(ref, JSON.parse(JSON.stringify(v)));
            }

            await batch.commit();
            console.log("🔥 Master DB JSON batch write successfully committed to Cloud Firestore.");
          }

          // Trigger UI updates
          if (typeof window.updateSuggestions === 'function') window.updateSuggestions();
          if (typeof window.renderTestingSidebarList === 'function') window.renderTestingSidebarList();
          if (typeof window.renderMaster === 'function') window.renderMaster();
          if (typeof window.renderDashboard === 'function') window.renderDashboard();
          if (typeof window.renderWarnings === 'function') window.renderWarnings();
          if (typeof window.renderActivityLog === 'function') window.renderActivityLog();
          if (typeof window.renderUsers === 'function') window.renderUsers();
          if (typeof window.renderSchedule === 'function') window.renderSchedule();

          window.toast?.('Master Database restored and synced to Firebase Cloud Firestore successfully.');
          resolve(true);
        } catch (err) {
          console.error("⚠️ importMasterDB error:", err);
          window.toast?.('Failed to restore backup — invalid JSON file format.');
          reject(err);
        }
      };
      reader.onerror = (err) => reject(err);
      reader.readAsText(file);
    });
  }

  exportMasterDB() {
    try {
      const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(window.state, null, 2));
      const downloadAnchor = document.createElement('a');
      downloadAnchor.setAttribute("href", dataStr);
      downloadAnchor.setAttribute("download", `tokyo_supermix_qc_backup_${new Date().toISOString().slice(0,10)}.json`);
      document.body.appendChild(downloadAnchor);
      downloadAnchor.click();
      downloadAnchor.remove();
      this.logActivity("Backup Export", "—", window.currentUser ? window.currentUser.username : 'Admin', "Exported Master Database JSON backup");
      window.toast?.('Master Database JSON backup exported.');
    } catch (err) {
      console.error("⚠️ exportMasterDB error:", err);
    }
  }

  async addCastingRecord(record) {
    if (!this.isFirebaseActive()) return false;
    try {
      await this.db.collection("casting_records").doc(record.trackingNumber).set(JSON.parse(JSON.stringify(record)));
      return true;
    } catch (err) {
      console.error("⚠️ addCastingRecord error:", err);
      return false;
    }
  }

  async addCubeTestResult(testData) {
    if (!this.isFirebaseActive()) return false;
    try {
      await this.db.collection("cube_tests").doc(testData.testId).set(JSON.parse(JSON.stringify(testData)));
      return true;
    } catch (err) {
      console.error("⚠️ addCubeTestResult error:", err);
      return false;
    }
  }

  async addCRMSiteVisit(visitData) {
    if (!this.isFirebaseActive()) return false;
    try {
      await this.db.collection("crm_site_visits").doc(visitData.visitId || `CRM-${Date.now()}`).set(JSON.parse(JSON.stringify(visitData)));
      return true;
    } catch (err) {
      console.error("⚠️ addCRMSiteVisit error:", err);
      return false;
    }
  }

  logActivity(actionType, trackingNumber, user, details) {
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

  seedInitialData() {
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
  }
}

// Export Singleton Instance
export const dbManager = new DatabaseManager();
window.dbManager = dbManager;
