// js/db.js
/* =========================================================================
   TOKYO SUPERMIX / APURA RMC PLANT — SALES & QC MANAGEMENT SYSTEM
   Real-Time Firebase Cloud Firestore Synchronization Engine (onSnapshot)
   (Firebase Firestore is the Single Source of Truth; LocalStorage is Silent Cache)
   ========================================================================= */

const LS_KEY = 'apura_rmc_qc_data_v1';
const LS_SYNC_QUEUE = 'apura_rmc_qc_sync_queue_v1';

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
    this.unsubscribeMainState = null;
    this.initFirebase();
    this.setupNetworkListeners();
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
        this.db.settings({
          experimentalForceLongPolling: true,
          merge: true
        });

        this.db.enablePersistence({ synchronizeTabs: true }).catch((err) => {
          console.warn("⚠️ Firestore persistence notice:", err.code);
        });

        this.firebaseActive = true;
        console.log("🔥 Firebase Firestore DatabaseManager initialized with Real-Time Listeners (onSnapshot).");
      } else {
        console.warn("⚠️ Firebase Compat SDK not available globally on window.");
      }
    } catch (err) {
      console.warn("⚠️ Firebase initialization error:", err);
    }
  }

  isFirebaseActive() {
    return this.firebaseActive && this.db !== null;
  }

  setupNetworkListeners() {
    if (typeof window !== 'undefined') {
      window.addEventListener('online', () => {
        console.log("🌐 Internet connection restored. Processing offline sync queue...");
        this.syncOfflineQueue();
      });
    }
  }

  /* =========================================================================
     1. REAL-TIME SNAPSHOT LISTENERS (onSnapshot - Cross-Browser Synchronization)
     ========================================================================= */

  /**
   * Subscribes to real-time Cloud Firestore updates via onSnapshot.
   * Whenever data is added or modified in Chrome, Safari automatically re-renders in real-time.
   */
  setupRealtimeListeners() {
    if (!this.isFirebaseActive()) return;

    if (this.unsubscribeMainState) {
      try { this.unsubscribeMainState(); } catch (e) {}
    }

    try {
      // Real-Time Document Listener on main state
      this.unsubscribeMainState = this.db.collection("apura_qc_system").doc("main_state")
        .onSnapshot((docSnap) => {
          if (docSnap.exists) {
            const cloudData = docSnap.data();
            if (cloudData && typeof cloudData === 'object') {
              window.state = {
                master: Array.isArray(cloudData.master) ? cloudData.master : [],
                tests: Array.isArray(cloudData.tests) ? cloudData.tests : [],
                activities: Array.isArray(cloudData.activities) ? cloudData.activities : [],
                users: Array.isArray(cloudData.users) ? cloudData.users : (window.state?.users || []),
                skippedTests: Array.isArray(cloudData.skippedTests) ? cloudData.skippedTests : [],
                crmVisits: Array.isArray(cloudData.crmVisits) ? cloudData.crmVisits : [],
                mixGrades: Array.isArray(cloudData.mixGrades) ? cloudData.mixGrades : [],
                currentUser: window.currentUser
              };

              // Overwrite LocalStorage cache silently as secondary offline backup
              localStorage.setItem(LS_KEY, JSON.stringify(window.state));
              console.log("⚡ Real-time Firestore snapshot received! UI updating automatically across browsers.");

              // Automatically re-render all UI views in real-time!
              this.renderAllUIViews();
            }
          }
        }, (err) => {
          console.warn("⚠️ Real-time snapshot listener notice:", err);
        });
    } catch (err) {
      console.warn("⚠️ Failed to initialize real-time snapshot listeners:", err);
    }
  }

  /**
   * Re-renders all active application UI views in real-time.
   */
  renderAllUIViews() {
    if (typeof window.updateSuggestions === 'function') window.updateSuggestions();
    if (typeof window.renderTestingSidebarList === 'function') window.renderTestingSidebarList();
    if (typeof window.renderMaster === 'function') window.renderMaster();
    if (typeof window.renderDashboard === 'function') window.renderDashboard();
    if (typeof window.renderWarnings === 'function') window.renderWarnings();
    if (typeof window.renderActivityLog === 'function') window.renderActivityLog();
    if (typeof window.renderUsers === 'function') window.renderUsers();
    if (typeof window.renderSchedule === 'function') window.renderSchedule();
    if (typeof window.generateAIExecutiveInsights === 'function' && window.state) {
      window.generateAIExecutiveInsights(window.state);
    }
  }

  /* =========================================================================
     2. ON APP LOAD (Read-Only Cloud-First Initialization)
     ========================================================================= */

  /**
   * Initializes application state on startup directly from Cloud Firestore.
   * Attach real-time snapshot listeners so data remains 100% in sync across browsers.
   * STRICT RULE: NEVER pushes LocalStorage data to Firebase on startup!
   */
  async initializeApp() {
    console.log("☁️ Executing Real-Time Cloud-First Startup Initialization...");
    let loadedFromCloud = false;

    if (this.isFirebaseActive()) {
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
            loadedFromCloud = true;
          }
        }
      } catch (err) {
        console.warn("⚠️ Cloud Firestore startup fetch error, resorting to local cache:", err);
      }
    }

    if (loadedFromCloud) {
      localStorage.setItem(LS_KEY, JSON.stringify(window.state));
      console.log("✅ Application State initialized from Cloud Firestore.");
    } else {
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
          console.log("⚡ Offline mode: Application State initialized from LocalStorage cache.");
        } catch (e) {
          console.error("Error parsing Local Storage cache:", e);
        }
      } else {
        this.seedInitialData();
      }
    }

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

    // Attach Real-Time Snapshot Listener for instant multi-browser sync
    this.setupRealtimeListeners();

    // Process any pending offline sync queue
    this.syncOfflineQueue();

    return window.state;
  }

  /* =========================================================================
     3. ON DATA INPUT / CREATION (Direct Cloud Writes)
     ========================================================================= */

  /**
   * Creates a new document directly in Cloud Firestore.
   * Does NOT update local UI manually; onSnapshot listener detects and renders automatically!
   */
  async createDocument(collectionName, docId, data) {
    const cleanData = JSON.parse(JSON.stringify(data));
    let cloudSaved = false;

    if (this.isFirebaseActive() && navigator.onLine !== false) {
      try {
        await this.db.collection(collectionName).doc(docId).set(cleanData);
        await this.saveMainStateDoc();
        cloudSaved = true;
        console.log(`☁️ Successfully created document in '${collectionName}/${docId}'.`);
      } catch (err) {
        console.warn(`⚠️ Cloud write error for '${collectionName}/${docId}', queueing offline:`, err);
        this.enqueueOfflineOp({ type: 'set', collection: collectionName, docId, data: cleanData });
      }
    } else {
      console.log(`⚡ Offline: Queued creation operation for '${collectionName}/${docId}'.`);
      this.enqueueOfflineOp({ type: 'set', collection: collectionName, docId, data: cleanData });
    }

    localStorage.setItem(LS_KEY, JSON.stringify(window.state));
    return cloudSaved;
  }

  /* =========================================================================
     4. ON DATA UPDATE (Targeted Cloud Updates)
     ========================================================================= */

  async updateDocument(collectionName, docId, updateFields) {
    const cleanFields = JSON.parse(JSON.stringify(updateFields));
    let cloudUpdated = false;

    if (this.isFirebaseActive() && navigator.onLine !== false) {
      try {
        await this.db.collection(collectionName).doc(docId).update(cleanFields);
        await this.saveMainStateDoc();
        cloudUpdated = true;
        console.log(`☁️ Successfully updated target document '${collectionName}/${docId}'.`);
      } catch (err) {
        console.warn(`⚠️ Targeted update error for '${collectionName}/${docId}', queueing offline:`, err);
        this.enqueueOfflineOp({ type: 'update', collection: collectionName, docId, data: cleanFields });
      }
    } else {
      this.enqueueOfflineOp({ type: 'update', collection: collectionName, docId, data: cleanFields });
    }

    localStorage.setItem(LS_KEY, JSON.stringify(window.state));
    return cloudUpdated;
  }

  async saveMainStateDoc() {
    if (!this.isFirebaseActive() || navigator.onLine === false) return;
    try {
      const cleanState = JSON.parse(JSON.stringify(window.state));
      await this.db.collection("apura_qc_system").doc("main_state").set(cleanState);
    } catch (err) {
      console.warn("⚠️ saveMainStateDoc notice:", err.message);
    }
  }

  /* =========================================================================
     5. OFFLINE FALLBACK & SYNC QUEUE MANAGEMENT
     ========================================================================= */

  enqueueOfflineOp(operation) {
    try {
      const queue = JSON.parse(localStorage.getItem(LS_SYNC_QUEUE) || '[]');
      queue.push({ ...operation, timestamp: Date.now() });
      localStorage.setItem(LS_SYNC_QUEUE, JSON.stringify(queue));
      window.toast?.("⚡ Operation saved to offline queue. Will sync when reconnected.");
    } catch (e) {
      console.error("Error enqueueing offline operation:", e);
    }
  }

  async syncOfflineQueue() {
    if (!this.isFirebaseActive() || navigator.onLine === false) return;
    const rawQueue = localStorage.getItem(LS_SYNC_QUEUE);
    if (!rawQueue) return;

    try {
      const queue = JSON.parse(rawQueue);
      if (!queue.length) return;

      console.log(`🔄 Flushing ${queue.length} queued offline operations to Cloud Firestore...`);
      const remaining = [];

      for (const op of queue) {
        try {
          if (op.type === 'set') {
            await this.db.collection(op.collection).doc(op.docId).set(op.data);
          } else if (op.type === 'update') {
            await this.db.collection(op.collection).doc(op.docId).update(op.data);
          }
        } catch (err) {
          console.warn(`⚠️ Failed to sync queued item ${op.collection}/${op.docId}:`, err);
          remaining.push(op);
        }
      }

      localStorage.setItem(LS_SYNC_QUEUE, JSON.stringify(remaining));
      if (remaining.length < queue.length) {
        await this.saveMainStateDoc();
        window.toast?.("☁️ Offline sync complete. Cloud Firestore updated.");
      }
    } catch (e) {
      console.error("Error processing offline sync queue:", e);
    }
  }

  /* =========================================================================
     MASTER BACKUP IMPORT & UTILITIES
     ========================================================================= */

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

          this.logActivity("Backup Restore", "—", window.currentUser ? window.currentUser.username : 'Admin', `Restored database backup (${window.state.master.length} castings)`);

          localStorage.setItem(LS_KEY, JSON.stringify(window.state));
          await this.saveMainStateDoc();

          if (this.isFirebaseActive()) {
            const batch = this.db.batch();
            for (const m of window.state.master) {
              batch.set(this.db.collection("casting_records").doc(m.trackingNumber), JSON.parse(JSON.stringify(m)));
            }
            for (const t of window.state.tests) {
              batch.set(this.db.collection("cube_tests").doc(t.testId), JSON.parse(JSON.stringify(t)));
            }
            for (const v of window.state.crmVisits) {
              batch.set(this.db.collection("crm_site_visits").doc(v.visitId || `CRM-${Date.now()}`), JSON.parse(JSON.stringify(v)));
            }
            await batch.commit();
          }

          this.renderAllUIViews();
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
