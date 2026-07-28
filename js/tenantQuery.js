/**
 * Tenant Query Utility - APURA RMC QC Platform
 * js/tenantQuery.js
 *
 * TASK 3: Global Data Isolation — standardises all Firestore queries
 * so they automatically scope to the active tenant (companyId).
 *
 * Usage:
 *   const q = getTenantQuery(collection(db, "CastingRecords"));
 *   const snapshot = await getDocs(q);
 *
 * Or for real-time listeners:
 *   onSnapshot(getTenantQuery(collection(db, "TestResults")), (snap) => { ... });
 */

/**
 * Returns the active tenant's companyId from sessionStorage.
 * Falls back to 'APURA_RMC' for legacy single-tenant sessions.
 * @returns {string}
 */
function getActiveTenantId() {
  return sessionStorage.getItem('companyId') || 'APURA_RMC';
}

/**
 * getTenantQuery
 *
 * Wraps a Firestore CollectionReference with a `.where("companyId", "==", ...)` filter
 * so every query is automatically scoped to the logged-in tenant's data.
 *
 * @param {import("firebase/firestore").CollectionReference} collectionRef
 *   The Firestore collection reference to apply the tenant filter to.
 * @returns {import("firebase/firestore").Query}
 *   A scoped Firestore Query object ready for getDocs() or onSnapshot().
 *
 * @example
 *   // Fetch only this tenant's casting records
 *   const q = getTenantQuery(collection(db, "CastingRecords"));
 *   const snap = await getDocs(q);
 *
 * @example
 *   // Real-time listener scoped to tenant
 *   onSnapshot(getTenantQuery(collection(db, "WarningAlerts")), (snap) => {
 *     snap.forEach(doc => console.log(doc.data()));
 *   });
 */
function getTenantQuery(collectionRef) {
  const companyId = getActiveTenantId();

  // Firebase v9+ modular query syntax
  // Uses window.query and window.where exposed from the Firebase module script
  if (typeof window.firestoreQuery === 'function' && typeof window.firestoreWhere === 'function') {
    return window.firestoreQuery(collectionRef, window.firestoreWhere("companyId", "==", companyId));
  }

  // Fallback: if using Firebase compat SDK
  if (collectionRef.where) {
    return collectionRef.where("companyId", "==", companyId);
  }

  console.warn("[getTenantQuery] Could not apply tenant filter. Returning unfiltered collection.");
  return collectionRef;
}

/**
 * buildTenantFilter
 *
 * Returns a plain filter object for use with in-memory array filtering
 * when working with the current single-state JSON blob architecture.
 *
 * @param {Array} arr - Any array from window.state (e.g., state.master, state.tests)
 * @returns {Array} Filtered array scoped to the active tenant
 *
 * @example
 *   const myRecords = buildTenantFilter(state.master);
 *   const myTests   = buildTenantFilter(state.tests);
 */
function buildTenantFilter(arr) {
  if (!Array.isArray(arr)) return [];
  const companyId = getActiveTenantId();

  // If data has not yet been migrated, return all (single-tenant compat)
  const hasTenantData = arr.some(item => item.companyId);
  if (!hasTenantData) return arr;

  return arr.filter(item => item.companyId === companyId);
}

/**
 * tenantMaster  — Returns casting records for the active tenant
 * tenantTests   — Returns test results for the active tenant
 * tenantUsers   — Returns users for the active tenant
 *
 * Drop-in replacements for: state.master, state.tests, state.users
 */
function tenantMaster()  { return buildTenantFilter(window.state?.master      || []); }
function tenantTests()   { return buildTenantFilter(window.state?.tests       || []); }
function tenantUsers()   { return buildTenantFilter(window.state?.users       || []); }
function tenantSkipped() { return buildTenantFilter(window.state?.skippedTests|| []); }

// Expose to global scope for use in index.html inline scripts
window.getActiveTenantId  = getActiveTenantId;
window.getTenantQuery     = getTenantQuery;
window.buildTenantFilter  = buildTenantFilter;
window.tenantMaster       = tenantMaster;
window.tenantTests        = tenantTests;
window.tenantUsers        = tenantUsers;
window.tenantSkipped      = tenantSkipped;

console.log(`[TenantQuery] Utility loaded. Active Tenant: ${getActiveTenantId()}`);
