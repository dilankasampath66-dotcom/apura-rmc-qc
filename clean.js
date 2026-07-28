/* =========================================================================
   APURA RMC PLANT — CUBE QC SYSTEM (BS EN 12390 COMPLIANT)
   Single-file local web app. Runs offline via browser localStorage.
   ========================================================================= */

const LS_KEY = 'apura_rmc_qc_data_v1';

let state = {
  master: [],
  tests: [],
  activities: [],
  users: [],
  skippedTests: [],
  currentUser: null
};

let currentUser = null;
let nextTrackingSeq = 1;

/* ---------------------- ACCESS CONTROL & AUTH ---------------------- */
function isAdmin(){
  return currentUser && currentUser.role === 'admin';
}

function login(){
  const userEl = document.getElementById('login-username-input');
  const passEl = document.getElementById('login-password-input');
  const errEl = document.getElementById('login-error-msg');
  if(!userEl || !passEl) return;

  const uname = userEl.value.trim();
  const pass = passEl.value.trim();

  if(!uname || !pass){
    if(errEl){ errEl.textContent = 'Please enter both Username and Password.'; errEl.style.display = 'block'; }
    return;
  }

  const found = state.users.find(u => u.username.toLowerCase() === uname.toLowerCase() && u.password === pass);

  if(!found){
    if(errEl){ errEl.textContent = 'Invalid username or password. Please try again.'; errEl.style.display = 'block'; }
    return;
  }

  currentUser = found;
  state.currentUser = found.username;
  saveState();

  if(errEl) errEl.style.display = 'none';
  userEl.value = '';
  passEl.value = '';

  // Auto-fill technician names in forms
  const castSelect = document.getElementById('f-castedBy');
  if(castSelect) castSelect.value = found.username;
  const testSelect = document.getElementById('tt-e-testedby');
  if(testSelect) testSelect.value = found.username;

  logActivity("User Login", "—", found.username, `User ${found.username} (${found.role}) logged in successfully`);
  toast(`Welcome ${found.username}! Logged in as ${found.role.toUpperCase()}.`);

  applyRoleRestrictions();
  setTimeout(() => {
    showView('home');
  }, 60);
}

function logout(){
  if(currentUser){
    logActivity("User Logout", "—", currentUser.username, `User ${currentUser.username} logged out`);
  }
  currentUser = null;
  state.currentUser = null;
  saveState();
  applyRoleRestrictions();
  toast('Logged out successfully.');
}

function applyRoleRestrictions(){
  const sidebar = document.getElementById('sidebar');
  const liveBar = document.getElementById('live-user-bar');
  const mobileBar = document.getElementById('mobile-topbar');
  const mobileBottomNav = document.getElementById('mobile-bottom-nav');
  const navUsers = document.getElementById('nav-users-li');
  const navWarnings = document.getElementById('nav-warnings-li');
  const isMobile = window.innerWidth <= 960;

  if(!currentUser){
    // Hide App Navigation & Show ONLY Login View
    // On mobile: use CSS classes, never force display:flex on sidebar
    if(sidebar){
      sidebar.classList.remove('show');
      if(!isMobile) sidebar.style.display = 'none';
      else sidebar.style.display = '';  // let CSS handle it
    }
    if(liveBar) liveBar.style.display = 'none';
    if(mobileBar) mobileBar.style.display = 'none';
    if(mobileBottomNav) mobileBottomNav.style.display = 'none';
    showView('login');
    return;
  }

  // User is logged in — show application layout
  // CRITICAL: On mobile, NEVER set sidebar display inline — let CSS @media handle it
  if(sidebar){
    if(isMobile){
      sidebar.style.display = '';   // clear any inline override, CSS controls mobile
    } else {
      sidebar.style.display = 'flex';  // desktop: sidebar always visible
    }
  }
  // Show/hide desktop user bar
  if(liveBar) liveBar.style.display = isMobile ? 'none' : 'flex';
  // Mobile topbar: shown on mobile, hidden on desktop
  if(mobileBar) mobileBar.style.display = isMobile ? 'flex' : 'none';
  // Mobile bottom nav: shown on mobile only
  if(mobileBottomNav) mobileBottomNav.style.display = isMobile ? 'block' : 'none';

  const isAdminUser = (currentUser.role === 'admin');

  // Update User Badges
  const uNameEl = document.getElementById('sidebar-user-name');
  if(uNameEl) uNameEl.textContent = `${currentUser.username} (${currentUser.role.toUpperCase()})`;
  const liveUNameEl = document.getElementById('live-user-name');
  if(liveUNameEl) liveUNameEl.textContent = `${currentUser.username} [${currentUser.role.toUpperCase()}]`;
  // Mobile topbar user chip
  const mobileChip = document.getElementById('mobile-user-chip');
  if(mobileChip){ mobileChip.textContent = currentUser.username.toUpperCase(); mobileChip.style.display = 'inline'; }

  // a) User Management & Warning Alerts sidebar link (Admin only)
  if(navUsers){
    navUsers.style.display = isAdminUser ? 'block' : 'none';
  }
  if(navWarnings){
    navWarnings.style.display = isAdminUser ? 'block' : 'none';
  }

  const highRiskCount = (state.skippedTests || []).filter(s => s.severity === 'HIGH').length;
  const badgeWarn = document.getElementById('badge-warning-count');
  if(badgeWarn){
    badgeWarn.textContent = highRiskCount;
    badgeWarn.style.display = highRiskCount > 0 ? 'inline-block' : 'none';
  }

  // b) Backup, Restore, Reset Data buttons in Master Database (Admin only)
  const btnBackup = document.getElementById('btn-backup-json');
  if(btnBackup) btnBackup.style.display = isAdminUser ? 'inline-flex' : 'none';

  const btnRestore = document.getElementById('btn-restore-json');
  if(btnRestore) btnRestore.style.display = isAdminUser ? 'inline-flex' : 'none';

  const btnReset = document.getElementById('btn-reset-data');
  if(btnReset) btnReset.style.display = isAdminUser ? 'inline-flex' : 'none';

  // c) Clear Activity Log & Warning Log buttons (Admin only)
  const btnClearLog = document.getElementById('btn-clear-activity');
  if(btnClearLog) btnClearLog.style.display = isAdminUser ? 'inline-flex' : 'none';

  const btnClearWarnings = document.getElementById('btn-clear-warnings');
  if(btnClearWarnings) btnClearWarnings.style.display = isAdminUser ? 'inline-flex' : 'none';

  // d) Clear Form buttons (Admin only)
  document.querySelectorAll('.btn-clear-form').forEach(btn => {
    btn.style.display = isAdminUser ? 'inline-flex' : 'none';
  });
}

/* ---------------------- DYNAMIC AUTOCOMPLETE / SUGGESTION ENGINE ---------------------- */
function updateSuggestions(){
  const customers = [...new Set(state.master.map(m => (m.customer || '').trim()).filter(Boolean))].sort();
  const sites = [...new Set(state.master.map(m => (m.site || '').trim()).filter(Boolean))].sort();
  const designCodes = [...new Set(state.master.map(m => (m.designCode || '').trim()).filter(Boolean))].sort();
  const bulkNumbers = [...new Set(state.master.map(m => (m.bulkNumber || '').trim()).filter(Boolean))].sort();

  const userList = (state.users || []).map(u => u.username);
  const defaultCastTechs = ["Jagath", "Sunil", "Pushpe", "admin", ...userList];
  const castedByList = [...new Set([...defaultCastTechs, ...state.master.map(m => (m.castedBy || '').trim()).filter(Boolean)])].sort();

  const defaultTestTechs = ["QC", "Technician", "Lab Helper", "Jagath", "Sunil", "Pushpe", "admin", ...userList];
  const testedByList = [...new Set([...defaultTestTechs, ...state.tests.map(t => (t.testedBy || '').trim()).filter(Boolean)])].sort();

  populateDatalist('dl-customers', customers);
  populateDatalist('dl-sites', sites);
  populateDatalist('dl-designCodes', designCodes);
  populateDatalist('dl-bulkNumbers', bulkNumbers);
  populateDatalist('dl-castedBy', castedByList);
  populateDatalist('dl-testedBy', testedByList);

  filterReportTrackingNumbers();
}

function populateDatalist(id, values){
  const dl = document.getElementById(id);
  if(!dl) return;
  dl.innerHTML = values.map(val => `<option value="${escapeHtml(val)}"></option>`).join('');
}

function escapeHtml(str){
  return String(str).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/* ---------------------- AUDIT LOGGING SYSTEM ---------------------- */
function logActivity(actionType, trackingNumber, user, details){
  if(!state.activities) state.activities = [];
  const now = new Date();
  const activeUser = user || (currentUser ? currentUser.username : 'System');
  const logItem = {
    id: 'ACT-' + String(state.activities.length + 1).padStart(5, '0'),
    timestamp: now.toISOString(),
    formattedTime: fmtDateTime(now),
    actionType,
    trackingNumber: trackingNumber || '—',
    user: activeUser,
    details
  };
  state.activities.unshift(logItem);
  saveState();
}

function fmtDateTime(d){
  if(!d) return '';
  const dt = (d instanceof Date) ? d : new Date(d);
  if(isNaN(dt)) return '';
  const dd = String(dt.getDate()).padStart(2,'0');
  const mm = String(dt.getMonth()+1).padStart(2,'0');
  const yyyy = dt.getFullYear();
  const hh = String(dt.getHours()).padStart(2,'0');
  const min = String(dt.getMinutes()).padStart(2,'0');
  const ss = String(dt.getSeconds()).padStart(2,'0');
  return `${dd}/${mm}/${yyyy} ${hh}:${min}:${ss}`;
}

/* ---------------------- INITIAL SAMPLE DATA GENERATOR ---------------------- */
function populateSampleDataIfEmpty(){
  if(state.master.length > 0) return;

  state.master = [
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
      cementContent: 280,
      volume: 22.75,
      cementSilo: "Silo 01",
      bulkNumber: "BN-4521",
      castedBy: "Jagath",
      numCubes: 4,
      remarks: "Plant pour Vijayapura",
      dateCreated: "2026-01-01T09:00:00.000Z",
      lastUpdated: "2026-01-29T10:00:00.000Z"
    },
    {
      trackingNumber: "TKC-000002",
      castingDate: "2026-01-01",
      castTime: "11:30",
      customer: "SAMPATH HARDWARE - IRRIGATION",
      site: "RAMBEWA",
      weather: "☁ Cloudy",
      designCode: "AB/C25/64",
      grade: "C25",
      slump: "165 mm",
      cementContent: 280,
      volume: 5.8,
      cementSilo: "Silo 02",
      bulkNumber: "BN-4525",
      castedBy: "Sunil",
      numCubes: 4,
      remarks: "Canal structure pour",
      dateCreated: "2026-01-01T11:30:00.000Z",
      lastUpdated: "2026-01-29T11:00:00.000Z"
    },
    {
      trackingNumber: "TKC-000003",
      castingDate: "2026-01-02",
      castTime: "14:15",
      customer: "MR.PREDEEP",
      site: "MIHINTHALE",
      weather: "☀ Sunny",
      designCode: "AB/C20/38",
      grade: "C20",
      slump: "160 mm",
      cementContent: 270,
      volume: 4,
      cementSilo: "Silo 01",
      bulkNumber: "BN-4530",
      castedBy: "Pushpe",
      numCubes: 4,
      remarks: "Residential slab",
      dateCreated: "2026-01-02T14:15:00.000Z",
      lastUpdated: "2026-01-30T10:00:00.000Z"
    }
  ];

  state.tests = [
    // Casting 1 tests (7d: 21.45 MPa, 28d: 31.9 MPa)
    { testId: "TKC-000001-T1", trackingNumber: "TKC-000001", testingDate: "2026-01-08", testingAge: "7 Days", testedBy: "QC", load: 482.63, weight: 8.25, cubeSize: 150, strength: 21.45, designCode: "AB/C25/64", grade: "C25" },
    { testId: "TKC-000001-T2", trackingNumber: "TKC-000001", testingDate: "2026-01-29", testingAge: "28 Days", testedBy: "Technician", load: 717.75, weight: 8.30, cubeSize: 150, strength: 31.90, designCode: "AB/C25/64", grade: "C25" },

    // Casting 2 tests (7d: 21.77 MPa, 28d: 30.99 MPa)
    { testId: "TKC-000002-T1", trackingNumber: "TKC-000002", testingDate: "2026-01-08", testingAge: "7 Days", testedBy: "Technician", load: 489.83, weight: 8.22, cubeSize: 150, strength: 21.77, designCode: "AB/C25/64", grade: "C25" },
    { testId: "TKC-000002-T2", trackingNumber: "TKC-000002", testingDate: "2026-01-29", testingAge: "28 Days", testedBy: "QC", load: 697.28, weight: 8.28, cubeSize: 150, strength: 30.99, designCode: "AB/C25/64", grade: "C25" },

    // Casting 3 tests (7d: 19.54 MPa, 28d: 26.4 MPa)
    { testId: "TKC-000003-T1", trackingNumber: "TKC-000003", testingDate: "2026-01-09", testingAge: "7 Days", testedBy: "QC", load: 439.65, weight: 8.18, cubeSize: 150, strength: 19.54, designCode: "AB/C20/38", grade: "C20" },
    { testId: "TKC-000003-T2", trackingNumber: "TKC-000003", testingDate: "2026-01-30", testingAge: "28 Days", testedBy: "Technician", load: 594.00, weight: 8.24, cubeSize: 150, strength: 26.40, designCode: "AB/C20/38", grade: "C20" }
  ];

  state.activities = [
    { id: "ACT-00001", timestamp: "2026-01-01T09:00:00.000Z", formattedTime: "01/01/2026 09:00:00", actionType: "New Entry", trackingNumber: "TKC-000001", user: "Jagath", details: "Created casting record for SRI CONSTRUCTION (VIJAYAPURA, Grade C25, 4 Cubes, 22.75 m³)" },
    { id: "ACT-00002", timestamp: "2026-01-08T09:30:00.000Z", formattedTime: "08/01/2026 09:30:00", actionType: "Test Recorded", trackingNumber: "TKC-000001", user: "QC", details: "Recorded 7 Days test TKC-000001-T1 (21.45 N/mm², 482.63 kN)" },
    { id: "ACT-00003", timestamp: "2026-01-29T10:00:00.000Z", formattedTime: "29/01/2026 10:00:00", actionType: "Test Recorded", trackingNumber: "TKC-000001", user: "admin", details: "Recorded 28 Days test TKC-000001-T2 (31.90 N/mm², 717.75 kN)" }
  ];

  nextTrackingSeq = 4;
}

/* ---------------------- PERSISTENCE ---------------------- */
async function saveState(){
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(state));
    if(window.saveStateToFirebase){
      await window.saveStateToFirebase(state);
    }
  } catch (err) {
    console.error("⚠️ Error during state persistence:", err);
  }
}

// ---- Loading screen helpers ----
function showLoader(msg) {
  const el = document.getElementById('app-loader');
  const msgEl = document.getElementById('loader-msg');
  if (el) el.classList.remove('hidden');
  if (msgEl && msg) msgEl.textContent = msg;
}
function hideLoader() {
  const el = document.getElementById('app-loader');
  if (el) el.classList.add('hidden');
}

async function loadState(){
  // Wait up to 4s for the ES module to expose window.loadStateFromFirebase
  // (ES modules are async and may not be ready when this inline script runs)
  let waited = 0;
  while (!window.loadStateFromFirebase && waited < 4000) {
    await new Promise(r => setTimeout(r, 100));
    waited += 100;
  }

  let loadedFromCloud = false;
  try {
    if(window.loadStateFromFirebase){
      const msgEl = document.getElementById('loader-msg');
      if (msgEl) msgEl.textContent = 'Loading data from cloud\u2026';
      const cloudData = await window.loadStateFromFirebase();
      if(cloudData && typeof cloudData === 'object'){
        state = {
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
        localStorage.setItem(LS_KEY, JSON.stringify(state));
        console.log('☁️ Primary Cloud Firestore state loaded into application.');
      }
    } else {
      console.warn('⚠️ Firebase module not ready after 4s, using localStorage fallback.');
    }
  } catch (err) {
    console.warn('⚠️ Cloud load error, falling back to localStorage:', err);
  }

  if(!loadedFromCloud){
    const raw = localStorage.getItem(LS_KEY);
    if(raw){
      try{
        const parsed = JSON.parse(raw);
        state = {
          master: Array.isArray(parsed.master) ? parsed.master : [],
          tests: Array.isArray(parsed.tests) ? parsed.tests : [],
          activities: Array.isArray(parsed.activities) ? parsed.activities : [],
          users: Array.isArray(parsed.users) ? parsed.users : [],
          skippedTests: Array.isArray(parsed.skippedTests) ? parsed.skippedTests : [],
          currentUser: null
        };
        if(!state.tests && Array.isArray(parsed.tests)) state.tests = parsed.tests;
      }catch(e){ console.error('Error parsing stored data', e); }
    }

    if(!state.master || !state.master.length){
      populateSampleDataIfEmpty();
    }
  }

  if(!state.master) state.master = [];
  if(!state.tests) state.tests = [];
  if(!state.activities) state.activities = [];
  if(!state.users) state.users = [];
  if(!state.skippedTests) state.skippedTests = [];

  let maxSeq = 0;
  state.master.forEach(m=>{
    if(!m.activeAges) m.activeAges = ['3 Days', '7 Days', '14 Days', '28 Days'];
    const n = parseInt((m.trackingNumber||'').split('-')[1],10);
    if(!isNaN(n) && n>maxSeq) maxSeq=n;
  });
  nextTrackingSeq = maxSeq+1;

  if(!state.users || !state.users.length){
    state.users = [
      { username: 'admin', password: '123', role: 'admin' },
      { username: 'Jagath', password: '123', role: 'operator' },
      { username: 'Pushpe', password: '123', role: 'operator' },
      { username: 'Sunil', password: '123', role: 'operator' }
    ];
  } else {
    if(!state.users.some(u => u.username && u.username.toLowerCase() === 'admin')){
      state.users.unshift({ username: 'admin', password: '123', role: 'admin' });
    }
  }

  // STRICT RULE: DO NOT call saveState() here on page load!
  updateSuggestions();

  currentUser = null;
  state.currentUser = null;
  applyRoleRestrictions();

  // ✅ All done — hide the loading screen
  hideLoader();
}
loadState();

/* ---------------------- HELPERS & CALCULATIONS ---------------------- */
function toast(msg){
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  setTimeout(()=>t.classList.remove('show'), 2800);
}

function fmtDate(d){
  if(!d) return '';
  const dt = (d instanceof Date) ? d : new Date(d + (typeof d==='string' && !d.includes('T') ? 'T00:00:00':''));
  if(isNaN(dt)) return '';
  const dd = String(dt.getDate()).padStart(2,'0');
  const mm = String(dt.getMonth()+1).padStart(2,'0');
  return `${dd}/${mm}/${dt.getFullYear()}`;
}

function daysBetween(dateStrA, dateStrB){
  const MS = 24*60*60*1000;
  const da = new Date(dateStrA + (typeof dateStrA==='string' && !dateStrA.includes('T') ? 'T00:00:00':''));
  const db = new Date(dateStrB + (typeof dateStrB==='string' && !dateStrB.includes('T') ? 'T00:00:00':''));
  da.setHours(0,0,0,0); db.setHours(0,0,0,0);
  return Math.round((db - da)/MS);
}

function addDays(dateStr, n){
  const dt = new Date(dateStr + (typeof dateStr==='string' && !dateStr.includes('T') ? 'T00:00:00':''));
  dt.setDate(dt.getDate()+n);
  return dt;
}

function gradeTarget(grade){
  const m = (grade||'').match(/(\d+)/);
  return m ? parseInt(m[1],10) : null;
}

function nextTrackingNumber(){
  const tn = 'TKC-' + String(nextTrackingSeq).padStart(6,'0');
  nextTrackingSeq++;
  return tn;
}

function findMaster(tn){
  return state.master.find(m=>m.trackingNumber.toLowerCase() === (tn||'').trim().toLowerCase());
}

function testsFor(tn){
  return state.tests.filter(t=>t.trackingNumber === tn);
}

const STANDARD_AGES = [
  {label:'3 Days', days:3},
  {label:'7 Days', days:7},
  {label:'14 Days', days:14},
  {label:'28 Days', days:28},
];

function detectAge(castingDate, testingDate){
  const gap = daysBetween(castingDate, testingDate);
  let best = STANDARD_AGES[0], bestDiff = Infinity;
  STANDARD_AGES.forEach(a=>{
    const diff = Math.abs(a.days - gap);
    if(diff < bestDiff){ bestDiff = diff; best = a; }
  });
  return bestDiff <= 2 ? best.label : 'Other';
}

function buildSchedule(){
  const rows = [];
  const today = new Date(); today.setHours(0,0,0,0);
  const todayStr = today.toISOString().slice(0,10);

  state.master.forEach(m=>{
    const activeAges = (m.activeAges && m.activeAges.length) ? m.activeAges : ['3 Days', '7 Days', '14 Days', '28 Days'];
    const activeAgeObjects = STANDARD_AGES.filter(a => activeAges.includes(a.label));

    activeAgeObjects.forEach(age=>{
      const due = addDays(m.castingDate, age.days);
      const dueStr = due.toISOString().slice(0,10);
      const completedTest = state.tests.find(t=>t.trackingNumber===m.trackingNumber && t.testingAge===age.label);
      const skippedTest = (state.skippedTests || []).find(s=>s.trackingNumber===m.trackingNumber && s.skippedAge===age.label);

      let status;
      if(completedTest){ status='Completed'; }
      else if(skippedTest){ status='Skipped'; }
      else if(dueStr < todayStr){ status='Overdue'; }
      else if(dueStr === todayStr){ status='Due Today'; }
      else{ status='Future'; }

      rows.push({
        trackingNumber:m.trackingNumber, castingDate:m.castingDate, dueDate:due,
        age:age.label, site:m.site, grade:m.grade, designCode:m.designCode,
        technician: completedTest ? completedTest.testedBy : (skippedTest ? skippedTest.skippedBy : ''),
        status, daysRemaining: daysBetween(todayStr, dueStr)
      });
    });
  });
  return rows;
}

/* Maintain core 28-day mature result strength calculation */
function computeDerived(m){
  const tests = testsFor(m.trackingNumber);
  const testsCompleted = tests.length;
  const standardCompleted = tests.filter(t=>STANDARD_AGES.some(a=>a.label===t.testingAge)).length;
  const cappedStandard = Math.min(4, m.numCubes);

  let status;
  if(testsCompleted===0) status='Open';
  else if(standardCompleted >= cappedStandard) status='Completed';
  else status='Partially Tested';

  const mature = tests.filter(t=>t.testingAge==='28 Days');
  let avgStrength = null, passFail = 'Pending';
  if(mature.length){
    avgStrength = mature.reduce((s,t)=>s+t.strength,0)/mature.length;
    const target = gradeTarget(m.grade);
    passFail = (target!=null && avgStrength >= target) ? 'Pass' : 'Fail';
  }
  return {status, testsCompleted, avgStrength, passFail};
}

/* ---------------------- NAVIGATION & LAYOUT ---------------------- */
function showView(name){
  if(!currentUser && name !== 'login'){
    applyRoleRestrictions();
    return;
  }

  if(name === 'users' && (!currentUser || currentUser.role !== 'admin')){
    toast('Access Denied: User Management is restricted to Admin users only.');
    return;
  }

  if(name === 'warnings' && (!currentUser || currentUser.role !== 'admin')){
    toast('Access Denied: Warning Alerts log is restricted to Admin users only.');
    return;
  }

  document.querySelectorAll('.view').forEach(v=>{
    v.style.display = '';
    v.classList.remove('active');
  });

  const targetView = document.getElementById('view-'+name);
  if(targetView){
    targetView.classList.add('active');
  }

  document.querySelectorAll('.navlist button').forEach(b=>b.classList.toggle('active', b.dataset.view===name));

  // Close mobile drawer when navigating
  if(window.innerWidth <= 960){
    closeMobileNav();
    updateMobileBottomNav(name);
  }

  if(name==='home') renderHome();
  if(name==='testing') renderTestingSidebarList();
  if(name==='schedule') renderSchedule();
  if(name==='dashboard') renderDashboard();
  if(name==='reports') filterReportTrackingNumbers();
  if(name==='daily') renderDailyReport();
  if(name==='master') renderMaster();
  if(name==='activity') renderActivityLog();
  if(name==='users') renderUsers();
  if(name==='warnings') renderWarnings();
}

document.getElementById('navlist').addEventListener('click', e=>{
  const btn = e.target.closest('button[data-view]');
  if(btn) showView(btn.dataset.view);
});

function toggleMobileNav(){
  const sb = document.getElementById('sidebar');
  if(sb) sb.classList.toggle('show');
  // When drawer opens, prevent body scroll
  if(sb && sb.classList.contains('show')){
    document.body.style.overflow = 'hidden';
  } else {
    document.body.style.overflow = '';
  }
}

function closeMobileNav(){
  const sb = document.getElementById('sidebar');
  if(sb) sb.classList.remove('show');
  document.body.style.overflow = '';
}

// Update mobile bottom nav active tab to match current view
function updateMobileBottomNav(viewName){
  document.querySelectorAll('.tab-btn[data-view]').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.view === viewName);
  });
}

/* ---------------------- USER MANAGEMENT (ADMIN ONLY) ---------------------- */
function renderUsers(){
  const tbody = document.querySelector('#users-table tbody');
  if(!tbody) return;

  if(!state.users || !state.users.length){
    tbody.innerHTML = `<tr><td colspan="3"><div class="empty-state">No user accounts found.</div></td></tr>`;
    return;
  }

  tbody.innerHTML = state.users.map(u => {
    const isSelf = currentUser && (u.username.toLowerCase() === currentUser.username.toLowerCase());
    const roleBadge = u.role === 'admin' ? '<span class="badge badge-purple">Admin</span>' : '<span class="badge badge-blue">Operator</span>';
    
    return `
      <tr>
        <td class="mono"><strong>${escapeHtml(u.username)}</strong> ${isSelf ? ' <span style="font-size:11px;color:var(--slate);">(You)</span>' : ''}</td>
        <td>${roleBadge}</td>
        <td>
          <button class="btn btn-sm btn-ghost" onclick="editUser('${escapeHtml(u.username)}')">Edit</button>
          ${!isSelf ? `<button class="btn btn-sm btn-danger" onclick="deleteUser('${escapeHtml(u.username)}')">Delete</button>` : '<span style="font-size:11px;color:var(--ink-soft);">Self</span>'}
        </td>
      </tr>
    `;
  }).join('');
}

function clearUserForm(){
  document.getElementById('um-username').value = '';
  document.getElementById('um-password').value = '';
  document.getElementById('um-role').value = 'operator';
  document.getElementById('um-editing-username').value = '';
  document.getElementById('um-username').removeAttribute('readonly');
  document.getElementById('um-form-title').textContent = 'Add New User';
}

function editUser(username){
  const u = state.users.find(x => x.username.toLowerCase() === username.toLowerCase());
  if(!u) return;

  document.getElementById('um-username').value = u.username;
  document.getElementById('um-username').setAttribute('readonly', 'true');
  document.getElementById('um-password').value = u.password;
  document.getElementById('um-role').value = u.role;
  document.getElementById('um-editing-username').value = u.username;
  document.getElementById('um-form-title').textContent = `Edit User: ${u.username}`;
}

function saveUser(){
  if(!currentUser || currentUser.role !== 'admin'){
    toast('Access Denied: Only Admins can manage user accounts.');
    return;
  }

  const uname = document.getElementById('um-username').value.trim();
  const pass = document.getElementById('um-password').value.trim();
  const role = document.getElementById('um-role').value;
  const editingUser = document.getElementById('um-editing-username').value;

  if(!uname || !pass){
    toast('Both Username and Password are required.');
    return;
  }

  if(editingUser){
    // Update existing user
    const existing = state.users.find(u => u.username.toLowerCase() === editingUser.toLowerCase());
    if(existing){
      existing.password = pass;
      existing.role = role;
      logActivity("User Updated", "—", currentUser.username, `Updated user account ${existing.username} (Role: ${role})`);
      toast(`User ${existing.username} updated.`);
    }
  } else {
    // Add new user
    if(state.users.some(u => u.username.toLowerCase() === uname.toLowerCase())){
      toast(`User "${uname}" already exists.`);
      return;
    }
    state.users.push({ username: uname, password: pass, role: role });
    logActivity("User Created", "—", currentUser.username, `Created new ${role} account for ${uname}`);
    toast(`User ${uname} created successfully.`);
  }

  saveState();
  clearUserForm();
  renderUsers();
  updateSuggestions();
}

function deleteUser(username){
  if(!currentUser || currentUser.role !== 'admin'){
    toast('Access Denied: Only Admins can manage user accounts.');
    return;
  }

  if(currentUser && username.toLowerCase() === currentUser.username.toLowerCase()){
    toast('Cannot delete your own logged-in admin account.');
    return;
  }

  showModal(
    "Delete User Account",
    `Are you sure you want to delete user account "${username}"?`,
    ()=>{
      state.users = state.users.filter(u => u.username.toLowerCase() !== username.toLowerCase());
      logActivity("User Deleted", "—", currentUser.username, `Deleted user account ${username}`);
      saveState();
      renderUsers();
      updateSuggestions();
      toast(`User ${username} deleted.`);
    }
  );
}

/* ---------------------- CUBE ENTRY ---------------------- */
function clearEntryForm(){
  ['f-castingDate','f-castTime','f-customer','f-site','f-designCode','f-cement','f-volume','f-bulk','f-remarks','f-grade','f-slump','f-silo','f-castedBy']
    .forEach(id=>{ const el=document.getElementById(id); if(el) el.value=''; });
  document.getElementById('f-weather').value = '☀ Sunny';
  document.getElementById('f-numCubes').value = 4;
  document.getElementById('f-castingDate').valueAsDate = new Date();
  if(currentUser) document.getElementById('f-castedBy').value = currentUser.username;

  // Default all planned testing interval checkboxes to checked
  ['f-age-3d', 'f-age-7d', 'f-age-14d', 'f-age-28d'].forEach(id => {
    const cb = document.getElementById(id);
    if(cb) cb.checked = true;
  });
}

function saveCubeEntry(){
  if(!currentUser){ applyRoleRestrictions(); return; }

  const customer = document.getElementById('f-customer').value.trim();
  const site = document.getElementById('f-site').value.trim();
  const designCode = document.getElementById('f-designCode').value.trim();
  const bulk = document.getElementById('f-bulk').value.trim();
  const castingDate = document.getElementById('f-castingDate').value;
  const grade = document.getElementById('f-grade').value;
  const slump = document.getElementById('f-slump').value;
  const silo = document.getElementById('f-silo').value;
  const weather = document.getElementById('f-weather').value;
  const castedBy = document.getElementById('f-castedBy').value.trim() || currentUser.username;
  const cement = parseFloat(document.getElementById('f-cement').value);
  const volume = parseFloat(document.getElementById('f-volume').value);
  const numCubes = parseInt(document.getElementById('f-numCubes').value,10);

  if(!castingDate){ toast('Casting Date is required.'); return; }
  if(!customer){ toast('Customer Name is required.'); return; }
  if(!site){ toast('Supply Site Location is required.'); return; }
  if(!designCode){ toast('Design Code is required.'); return; }
  if(!bulk){ toast('Bulk Number is required.'); return; }
  if(!grade){ toast('Grade is required.'); return; }
  if(!slump){ toast('Slump is required.'); return; }
  if(!silo){ toast('Cement Silo is required.'); return; }
  if(!castedBy){ toast('Casted By is required.'); return; }
  if(isNaN(cement) || cement < 0){ toast('Cement Content cannot be negative.'); return; }
  if(isNaN(volume) || volume < 0){ toast('Volume (m³) cannot be negative.'); return; }
  if(isNaN(numCubes) || numCubes < 1 || numCubes > 20){ toast('Number of Cubes must be between 1 and 20.'); return; }

  // Read selected planned testing intervals (fallback to 7d & 28d if empty)
  const selectedAges = [];
  if(document.getElementById('f-age-3d') && document.getElementById('f-age-3d').checked) selectedAges.push('3 Days');
  if(document.getElementById('f-age-7d') && document.getElementById('f-age-7d').checked) selectedAges.push('7 Days');
  if(document.getElementById('f-age-14d') && document.getElementById('f-age-14d').checked) selectedAges.push('14 Days');
  if(document.getElementById('f-age-28d') && document.getElementById('f-age-28d').checked) selectedAges.push('28 Days');
  const activeAges = selectedAges.length ? selectedAges : ['7 Days', '28 Days'];

  const tn = nextTrackingNumber();
  const now = new Date().toISOString();
  state.master.push({
    trackingNumber: tn, castingDate, castTime: document.getElementById('f-castTime').value,
    customer, site, weather, designCode, grade, slump, cementContent: cement, volume, cementSilo: silo,
    bulkNumber: bulk, castedBy, numCubes, activeAges, remarks: document.getElementById('f-remarks').value.trim(),
    dateCreated: now, lastUpdated: now
  });

  logActivity("New Entry", tn, castedBy, `Cast ${numCubes} cubes for ${customer} at ${site} (Grade: ${grade}, Active Ages: ${activeAges.join(', ')})`);

  updateSuggestions();
  renderTestingSidebarList();
  toast(`Saved — Tracking Number ${tn} generated.`);
  clearEntryForm();
}

/* ---------------------- RECALL RECORD & JUMP TO RECALL ---------------------- */
function recallRecord(){
  const tn = document.getElementById('recall-search').value;
  const m = findMaster(tn);
  const body = document.getElementById('recall-body');
  const testCard = document.getElementById('recall-tests-card');

  if(!m){ 
    toast('Tracking Number not found.'); 
    if(body) body.style.display='none'; 
    if(testCard) testCard.style.display='none'; 
    return; 
  }

  const d = computeDerived(m);
  if(body) body.style.display='block';

  document.getElementById('rc-tn').textContent = m.trackingNumber;
  document.getElementById('rc-date').textContent = fmtDate(m.castingDate);
  document.getElementById('rc-design').textContent = m.designCode;
  document.getElementById('rc-castedby').textContent = m.castedBy;
  document.getElementById('rc-numcubes').textContent = m.numCubes;
  document.getElementById('rc-status').textContent = d.status;

  document.getElementById('rc-e-customer').value = m.customer || '';
  document.getElementById('rc-e-site').value = m.site;
  document.getElementById('rc-e-volume').value = m.volume != null ? m.volume : '';
  document.getElementById('rc-e-weather').value = m.weather || '☀ Sunny';
  document.getElementById('rc-e-grade').value = m.grade;
  document.getElementById('rc-e-slump').value = m.slump;
  document.getElementById('rc-e-cement').value = m.cementContent;
  document.getElementById('rc-e-silo').value = m.cementSilo;
  document.getElementById('rc-e-bulk').value = m.bulkNumber;
  document.getElementById('rc-e-remarks').value = m.remarks || '';

  const activeAges = m.activeAges || ['3 Days', '7 Days', '14 Days', '28 Days'];
  if(document.getElementById('rc-age-3d')) document.getElementById('rc-age-3d').checked = activeAges.includes('3 Days');
  if(document.getElementById('rc-age-7d')) document.getElementById('rc-age-7d').checked = activeAges.includes('7 Days');
  if(document.getElementById('rc-age-14d')) document.getElementById('rc-age-14d').checked = activeAges.includes('14 Days');
  if(document.getElementById('rc-age-28d')) document.getElementById('rc-age-28d').checked = activeAges.includes('28 Days');

  // Role-Based Control: Admins can edit, Operators can only view
  const isAdminUser = isAdmin();
  const editableIds = ['rc-e-customer', 'rc-e-site', 'rc-e-volume', 'rc-e-weather', 'rc-e-grade', 'rc-e-slump', 'rc-e-cement', 'rc-e-silo', 'rc-e-bulk', 'rc-e-remarks', 'rc-age-3d', 'rc-age-7d', 'rc-age-14d', 'rc-age-28d'];

  editableIds.forEach(id => {
    const el = document.getElementById(id);
    if(el){
      if(isAdminUser){
        el.removeAttribute('disabled');
        el.removeAttribute('readonly');
      } else {
        el.setAttribute('disabled', 'true');
      }
    }
  });

  const btnUpdate = document.getElementById('btn-update-record');
  if(btnUpdate){
    btnUpdate.style.display = isAdminUser ? 'inline-flex' : 'none';
  }

  renderRecallTestsHistory(m.trackingNumber);
}

function renderRecallTestsHistory(tn){
  const card = document.getElementById('recall-tests-card');
  const tbody = document.querySelector('#recall-tests-table tbody');
  if(!card || !tbody) return;

  const tests = testsFor(tn);
  card.style.display = 'block';

  if(!tests.length){
    tbody.innerHTML = `<tr><td colspan="8"><div class="empty-state" style="padding:16px;"><div class="ic">&#9744;</div>No test results recorded for this casting yet.</div></td></tr>`;
    return;
  }

  const isAdminUser = isAdmin();

  tbody.innerHTML = tests.map(t => `
    <tr>
      <td class="mono"><strong>${t.testId}</strong></td>
      <td><span class="badge badge-blue">${t.testingAge}</span></td>
      <td class="mono">${fmtDate(t.testingDate)}</td>
      <td style="font-weight:600;color:var(--slate-deep);">${escapeHtml(t.testedBy)}</td>
      <td style="text-align:right;" class="mono">${t.weight ? t.weight.toFixed(2) : '8.25'}</td>
      <td style="text-align:right;" class="mono">${t.load.toFixed(2)}</td>
      <td style="text-align:right;font-weight:700;" class="mono">${t.strength.toFixed(2)}</td>
      <td>
        ${isAdminUser ? `<button class="btn btn-sm btn-danger" onclick="deleteTestSample('${t.testId}', '${t.trackingNumber}')" title="Delete sample reading">Delete</button>` : '—'}
      </td>
    </tr>
  `).join('');
}

function deleteTestSample(testId, tn){
  if(!isAdmin()){
    toast("Access Denied: Deleting individual test readings is restricted to Admin users only.");
    return;
  }
  showModal(
    "Delete Test Sample Reading",
    `Are you sure you want to delete test reading "${testId}"? This will update the batch average strength.`,
    ()=>{
      state.tests = state.tests.filter(t => t.testId !== testId);
      logActivity("Test Reading Deleted", tn, currentUser.username, `Deleted test sample reading ${testId}`);
      saveState();
      updateSuggestions();
      renderRecallTestsHistory(tn);
      recallRecord();
      toast(`Test reading ${testId} deleted.`);
    }
  );
}

function jumpToRecall(tn){
  showView('recall');
  const input = document.getElementById('recall-search');
  if(input){
    input.value = tn;
    recallRecord();
  }
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function updateRecord(){
  if(!isAdmin()){ 
    toast('Access Denied: Only Admins are authorized to update casting records.'); 
    return; 
  }

  const tn = document.getElementById('rc-tn').textContent;
  const m = findMaster(tn);
  if(!m) return;
  const customer = document.getElementById('rc-e-customer').value.trim();
  const site = document.getElementById('rc-e-site').value.trim();
  const bulk = document.getElementById('rc-e-bulk').value.trim();
  const cement = parseFloat(document.getElementById('rc-e-cement').value);
  const volume = parseFloat(document.getElementById('rc-e-volume').value);

  if(!customer){ toast('Customer Name cannot be blank.'); return; }
  if(!site){ toast('Supply Site Location cannot be blank.'); return; }
  if(!bulk){ toast('Bulk Number cannot be blank.'); return; }
  if(isNaN(cement) || cement < 0){ toast('Cement Content cannot be negative.'); return; }
  if(isNaN(volume) || volume < 0){ toast('Volume (m³) cannot be negative.'); return; }

  const selectedAges = [];
  if(document.getElementById('rc-age-3d') && document.getElementById('rc-age-3d').checked) selectedAges.push('3 Days');
  if(document.getElementById('rc-age-7d') && document.getElementById('rc-age-7d').checked) selectedAges.push('7 Days');
  if(document.getElementById('rc-age-14d') && document.getElementById('rc-age-14d').checked) selectedAges.push('14 Days');
  if(document.getElementById('rc-age-28d') && document.getElementById('rc-age-28d').checked) selectedAges.push('28 Days');

  m.customer = customer;
  m.site = site;
  m.volume = volume;
  m.weather = document.getElementById('rc-e-weather').value;
  m.grade = document.getElementById('rc-e-grade').value;
  m.slump = document.getElementById('rc-e-slump').value;
  m.cementContent = cement;
  m.cementSilo = document.getElementById('rc-e-silo').value;
  m.bulkNumber = bulk;
  m.activeAges = selectedAges.length ? selectedAges : ['7 Days', '28 Days'];
  m.remarks = document.getElementById('rc-e-remarks').value.trim();
  m.lastUpdated = new Date().toISOString();

  logActivity("Record Updated", tn, currentUser.username, `Updated record parameters (Customer: ${customer}, Site: ${site}, Active Ages: ${m.activeAges.join(', ')})`);

  saveState();
  updateSuggestions();
  toast(`${tn} updated successfully.`);
  recallRecord();
}

/* ---------------------- TESTING ENTRY & SIDEBAR LIST ---------------------- */
let currentTestingTN = null;

function renderTestingSidebarList(){
  const container = document.getElementById('testing-sidebar-container');
  const table = document.getElementById('testing-sidebar-table');
  if(!container || !table) return;

  const sched = buildSchedule();
  let pendingItems = sched.filter(s => s.status === 'Overdue' || s.status === 'Due Today');
  pendingItems.sort((a,b) => new Date(a.dueDate) - new Date(b.dueDate));

  const tbody = table.querySelector('tbody');
  if(!pendingItems.length){
    tbody.innerHTML = `<tr><td colspan="4"><div class="empty-state" style="padding:24px 10px;"><div class="ic">&#10003;</div>No pending or overdue tests!</div></td></tr>`;
    return;
  }

  tbody.innerHTML = pendingItems.map(item => `
    <tr>
      <td><a href="#" onclick="jumpToRecall('${item.trackingNumber}'); return false;" class="tn-link">${item.trackingNumber}</a></td>
      <td>${item.age}</td>
      <td>${statusBadge(item.status)}</td>
      <td style="display:flex;gap:4px;">
        <button class="btn btn-sm btn-primary" onclick="jumpToTesting('${item.trackingNumber}')">Record</button>
        <button class="btn btn-sm btn-ghost" style="color:var(--amber);" onclick="promptSkipTest('${item.trackingNumber}', '${item.age}')" title="Skip this test age">Skip</button>
      </td>
    </tr>
  `).join('');
}

function updateAgeReminderBanner(m){
  const container = document.getElementById('tt-age-badges');
  if(!container || !m) return;

  const existingTests = testsFor(m.trackingNumber);
  const existingSkips = (state.skippedTests || []).filter(s => s.trackingNumber === m.trackingNumber);
  const activeAges = m.activeAges || ['3 Days', '7 Days', '14 Days', '28 Days'];
  const allAges = ['3 Days', '7 Days', '14 Days', '28 Days'];

  container.innerHTML = allAges.map(age => {
    const isCompleted = existingTests.some(t => t.testingAge === age);
    const isSkipped = existingSkips.some(s => s.skippedAge === age);
    const isActive = activeAges.includes(age);

    if(isCompleted){
      return `<span class="badge badge-green" style="font-size:11.5px; padding:4px 10px;">${age} [Completed]</span>`;
    } else if(isSkipped){
      return `<span class="badge badge-amber" style="font-size:11.5px; padding:4px 10px;">${age} [Skipped]</span>`;
    } else if(isActive){
      return `<span class="badge badge-blue" style="font-size:11.5px; padding:4px 10px;">${age} [Pending]</span>`;
    } else {
      return `<span class="badge badge-grey" style="font-size:11.5px; padding:4px 10px; opacity:0.6;">${age} [Not Required]</span>`;
    }
  }).join('');
}

function recallForTesting(){
  const tn = document.getElementById('test-search').value;
  const m = findMaster(tn);
  if(!m){ toast('Tracking Number not found.'); document.getElementById('testing-body').style.display='none'; return; }
  currentTestingTN = m.trackingNumber;
  const d = computeDerived(m);
  document.getElementById('testing-body').style.display='block';
  document.getElementById('tt-tn').textContent = m.trackingNumber;
  document.getElementById('tt-date').textContent = fmtDate(m.castingDate);
  document.getElementById('tt-customer').textContent = m.customer || '—';
  document.getElementById('tt-site').textContent = m.site;
  document.getElementById('tt-volume').textContent = m.volume != null ? `${m.volume} m³` : '—';
  document.getElementById('tt-weather').textContent = m.weather || '—';
  document.getElementById('tt-design').textContent = m.designCode;
  document.getElementById('tt-grade').textContent = `${m.grade} (${gradeTarget(m.grade)||'—'} N/mm²)`;
  document.getElementById('tt-slump').textContent = m.slump || '—';
  document.getElementById('tt-cement').textContent = m.cementContent ? `${m.cementContent} kg/m³` : '—';
  document.getElementById('tt-silo').textContent = m.cementSilo || '—';
  document.getElementById('tt-bulk').textContent = m.bulkNumber || '—';
  document.getElementById('tt-castedby').textContent = m.castedBy || '—';
  document.getElementById('tt-completed').textContent = `${d.testsCompleted} / ${m.numCubes}`;
  document.getElementById('tt-e-date').valueAsDate = new Date();
  if(currentUser) document.getElementById('tt-e-testedby').value = currentUser.username;
  
  updateAgeReminderBanner(m);
  clearTestingForm();
}

function jumpToTesting(trackingNumber){
  showView('testing');
  document.getElementById('test-search').value = trackingNumber;
  recallForTesting();
  document.getElementById('tt-e-date').valueAsDate = new Date();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function addSampleLoadField(loadVal = '', weightVal = ''){
  const container = document.getElementById('load-inputs-container');
  const count = container.querySelectorAll('.load-input-row').length + 1;
  const div = document.createElement('div');
  div.className = 'load-input-row';
  div.style.cssText = 'display:flex;gap:10px;margin-bottom:8px;align-items:center;';
  div.innerHTML = `
    <input type="number" class="tt-e-load-item" min="0" step="0.01" placeholder="Sample ${count} Load (kN), e.g. 742.5" value="${loadVal}" oninput="updateTestPreview()" style="flex:1;">
    <input type="number" class="tt-e-weight-item" min="0" step="0.01" placeholder="Weight (kg), e.g. 8.25" value="${weightVal}" style="width:160px;">
    ${count > 1 ? `<button type="button" class="btn btn-danger btn-sm" style="padding:5px 9px;" onclick="this.parentElement.remove(); updateTestPreview();" title="Remove sample">✕</button>` : ''}
  `;
  container.appendChild(div);
  updateTestPreview();
}

function clearTestingForm(){
  document.getElementById('tt-e-date').valueAsDate = new Date();
  const container = document.getElementById('load-inputs-container');
  container.innerHTML = `
    <div class="load-input-row" style="display:flex;gap:10px;margin-bottom:8px;align-items:center;">
      <input type="number" class="tt-e-load-item" min="0" step="0.01" placeholder="Sample 1 Load (kN), e.g. 742.5" oninput="updateTestPreview()" style="flex:1;">
      <input type="number" class="tt-e-weight-item" min="0" step="0.01" placeholder="Weight (kg), e.g. 8.25" style="width:160px;">
    </div>
  `;
  document.getElementById('tt-e-testedby').value = currentUser ? currentUser.username : '';
  document.getElementById('tt-e-cubesize').value = 150;
  document.getElementById('tt-preview').textContent = '—';
}

function resetTestingEntryForm(){
  document.getElementById('test-search').value = '';
  document.getElementById('testing-body').style.display = 'none';
  currentTestingTN = null;
  clearTestingForm();
}

function updateTestPreview(){
  const m = findMaster(currentTestingTN);
  if(!m) return;
  const date = document.getElementById('tt-e-date').value;
  const loadRows = Array.from(document.querySelectorAll('.load-input-row'));
  const sampleItems = loadRows.map(row=>{
    const load = parseFloat(row.querySelector('.tt-e-load-item').value);
    const weight = parseFloat(row.querySelector('.tt-e-weight-item').value) || 8.25;
    return { load, weight };
  }).filter(s=>!isNaN(s.load) && s.load>=0);

  if(!date || sampleItems.length === 0){
    document.getElementById('tt-preview').textContent = '—';
    return;
  }
  const age = detectAge(m.castingDate, date);
  const strengths = sampleItems.map(item=>Math.round((item.load/22.5)*100)/100);
  const avgStrength = strengths.reduce((s,v)=>s+v,0)/strengths.length;
  
  document.getElementById('tt-preview').textContent = `${age} · ${sampleItems.length} Sample(s) · Avg: ${avgStrength.toFixed(2)} N/mm² (Loads: ${sampleItems.map(i=>i.load).join(', ')} kN)`;
}
document.getElementById('tt-e-date').addEventListener('change', updateTestPreview);

function saveTestResult(){
  if(!currentUser){ applyRoleRestrictions(); return; }

  const m = findMaster(currentTestingTN);
  if(!m){ toast('Recall a record first.'); return; }
  const date = document.getElementById('tt-e-date').value;
  const testedBy = document.getElementById('tt-e-testedby').value.trim() || currentUser.username;
  const loadRows = Array.from(document.querySelectorAll('.load-input-row'));
  const sampleItems = loadRows.map(row=>{
    const load = parseFloat(row.querySelector('.tt-e-load-item').value);
    const weight = parseFloat(row.querySelector('.tt-e-weight-item').value) || 8.25;
    return { load, weight };
  }).filter(s=>!isNaN(s.load) && s.load>=0);

  const cubeSize = parseFloat(document.getElementById('tt-e-cubesize').value) || 150;

  if(!date){ toast('Testing Date is required.'); return; }
  if(!testedBy){ toast('Tested By is required.'); return; }
  if(sampleItems.length === 0){ toast('At least one valid positive Failure Load (kN) sample is required.'); return; }

  const existing = testsFor(m.trackingNumber);
  if(existing.length + sampleItems.length > m.numCubes){
    toast(`Cannot save ${sampleItems.length} sample(s). Only ${m.numCubes - existing.length} slot(s) remaining for this casting (Total Cast: ${m.numCubes}).`);
    return;
  }

  const age = detectAge(m.castingDate, date);
  let sampleStrengths = [];

  sampleItems.forEach((item, idx) => {
    const strength = Math.round((item.load / 22.5) * 100) / 100;
    sampleStrengths.push(strength);
    const testId = `${m.trackingNumber}-T${existing.length + idx + 1}`;
    state.tests.push({
      testId,
      trackingNumber: m.trackingNumber,
      testingDate: date,
      testingAge: age,
      testedBy,
      load: item.load,
      weight: item.weight,
      cubeSize,
      strength,
      designCode: m.designCode,
      grade: m.grade
    });
  });

  m.lastUpdated = new Date().toISOString();
  const avgStr = sampleStrengths.reduce((s, v) => s + v, 0) / sampleStrengths.length;

  logActivity(
    "Test Recorded",
    m.trackingNumber,
    testedBy,
    `Recorded ${sampleItems.length} sample(s) for ${age} test (Avg: ${avgStr.toFixed(2)} N/mm²)`
  );

  saveState();
  updateSuggestions();
  renderTestingSidebarList();
  toast(`Saved ${sampleItems.length} sample test record(s) for ${age} (Avg ${avgStr.toFixed(2)} N/mm²).`);
  resetTestingEntryForm();
}

/* ---------------------- HOME VIEW ---------------------- */
function renderHome(){
  const sched = buildSchedule();
  const overdue = sched.filter(s=>s.status==='Overdue').length;
  const dueToday = sched.filter(s=>s.status==='Due Today').length;
  const totalCubes = state.master.reduce((s,m)=>s+m.numCubes,0);
  const pending = sched.filter(s=>s.status!=='Completed').length;

  const kpis = [
    {label:'Total Cubes', value:totalCubes},
    {label:'Castings on File', value:state.master.length},
    {label:'Pending Tests', value:pending},
    {label:"Due Today", value:dueToday, cls: dueToday>0?'amber':''},
    {label:'Overdue', value:overdue, cls: overdue>0?'warn':'good'},
    {label:'Tests Recorded', value:state.tests.length},
  ];
  document.getElementById('home-kpis').innerHTML = kpis.map(k=>`
    <div class="kpi"><div class="label">${k.label}</div><div class="value ${k.cls||''}">${k.value}</div></div>
  `).join('');

  const recent = [...state.master].sort((a,b)=>new Date(b.dateCreated)-new Date(a.dateCreated));
  document.getElementById('home-recent').innerHTML = recent.length ? `
    <table><thead><tr><th>Tracking No.</th><th>Site</th><th>Grade</th><th>Cast Date</th></tr></thead>
    <tbody>${recent.map(m=>`<tr><td><a href="#" onclick="jumpToRecall('${m.trackingNumber}'); return false;" class="tn-link">${m.trackingNumber}</a></td><td>${escapeHtml(m.site)}</td><td>${escapeHtml(m.grade)}</td><td>${fmtDate(m.castingDate)}</td></tr>`).join('')}</tbody></table>
  ` : `<div class="empty-state"><div class="ic">&#9744;</div>No castings recorded yet.</div>`;

  const dueSoon = sched.filter(s=>s.status!=='Completed' && s.daysRemaining<=7 && s.daysRemaining>=-90)
                        .sort((a,b)=>a.daysRemaining-b.daysRemaining);
  document.getElementById('home-due').innerHTML = dueSoon.length ? `
    <table><thead><tr><th>Tracking No.</th><th>Age</th><th>Due Date</th><th>Status</th></tr></thead>
    <tbody>${dueSoon.map(s=>`<tr><td><a href="#" onclick="jumpToRecall('${s.trackingNumber}'); return false;" class="tn-link">${s.trackingNumber}</a></td><td>${s.age}</td><td>${fmtDate(s.dueDate)}</td><td>${statusBadge(s.status)}</td></tr>`).join('')}</tbody></table>
  ` : `<div class="empty-state"><div class="ic">&#10003;</div>No tests due this week.</div>`;
}

function statusBadge(status){
  const map = {
    Completed:'green', Overdue:'red', 'Due Today':'amber', Future:'blue', Open:'grey', 'Partially Tested':'amber', Pass:'green', Fail:'red', Pending:'grey',
    'New Entry':'blue', 'Test Recorded':'green', 'Record Updated':'amber', 'Record Deleted':'red', 'User Login':'purple', 'User Logout':'grey', 'User Created':'purple', 'User Updated':'amber', 'User Deleted':'red', 'Excel Export':'purple', 'Backup Download':'purple', 'Backup Restore':'blue', 'Data Reset':'red'
  };
  return `<span class="badge badge-${map[status]||'grey'}">${status}</span>`;
}

/* ---------------------- TESTING SCHEDULE VIEW ---------------------- */
function renderSchedule(){
  const filter = (document.getElementById('sched-filter').value||'').toLowerCase();
  const statusFilter = document.getElementById('sched-status-filter').value;
  let rows = buildSchedule();
  if(filter) rows = rows.filter(r=>[r.trackingNumber,r.site,r.grade,r.designCode].join(' ').toLowerCase().includes(filter));
  if(statusFilter) rows = rows.filter(r=>r.status===statusFilter);
  rows.sort((a,b)=> new Date(a.dueDate) - new Date(b.dueDate));

  const table = document.getElementById('schedule-table');
  table.querySelector('thead').innerHTML = `<tr><th>Tracking No.</th><th>Cast Date</th><th>Due Date</th><th>Age</th><th>Site</th><th>Grade</th><th>Design Code</th><th>Technician</th><th>Status</th><th>Action</th></tr>`;
  table.querySelector('tbody').innerHTML = rows.length ? rows.map(r=>`
    <tr>
      <td><a href="#" onclick="jumpToRecall('${r.trackingNumber}'); return false;" class="tn-link">${r.trackingNumber}</a></td><td>${fmtDate(r.castingDate)}</td><td>${fmtDate(r.dueDate)}</td>
      <td>${r.age}</td><td>${r.site}</td><td>${r.grade}</td><td>${r.designCode}</td>
      <td>${r.technician||'—'}</td><td>${statusBadge(r.status)}</td>
      <td>${r.status !== 'Completed' ? `<button class="btn btn-sm btn-primary" onclick="jumpToTesting('${r.trackingNumber}')">Record Test</button>` : '—'}</td>
    </tr>`).join('') : `<tr><td colspan="10"><div class="empty-state">No schedule items match your search.</div></td></tr>`;
}

/* ---------------------- DASHBOARD VIEW & ENGINEERING QC TABLES ---------------------- */

function populateDashboardFilterDropdowns(){
  const gradeSelect = document.getElementById('dash-grade');
  const custSelect = document.getElementById('dash-customer');
  if(!gradeSelect || !custSelect) return;

  const currentGrade = gradeSelect.value;
  const currentCust = custSelect.value;

  const grades = [...new Set(state.master.map(m => (m.grade || '').trim()).filter(Boolean))].sort();
  const customers = [...new Set(state.master.map(m => (m.customer || '').trim()).filter(Boolean))].sort();

  gradeSelect.innerHTML = `<option value="">All Grades</option>` + grades.map(g => `<option value="${escapeHtml(g)}" ${g===currentGrade?'selected':''}>${escapeHtml(g)}</option>`).join('');
  custSelect.innerHTML = `<option value="">All Customers</option>` + customers.map(c => `<option value="${escapeHtml(c)}" ${c===currentCust?'selected':''}>${escapeHtml(c)}</option>`).join('');
}

function clearDashboardFilters(){
  if(document.getElementById('dash-start')) document.getElementById('dash-start').value = '';
  if(document.getElementById('dash-end')) document.getElementById('dash-end').value = '';
  if(document.getElementById('dash-grade')) document.getElementById('dash-grade').value = '';
  if(document.getElementById('dash-customer')) document.getElementById('dash-customer').value = '';
  handleApplyFilters();
}

function renderDashboard(){
  populateDashboardFilterDropdowns();
  handleApplyFilters();
}

function renderDashboardKPIs(filteredMaster, filteredTests) {

  // Data is now passed in as parameters

  // Schedule status calculation for filtered set
  const sched = [];
  const today = new Date(); today.setHours(0,0,0,0);
  const todayStr = today.toISOString().slice(0,10);

  filteredMaster.forEach(m=>{
    STANDARD_AGES.forEach(age=>{
      const due = addDays(m.castingDate, age.days);
      const dueStr = due.toISOString().slice(0,10);
      const completedTest = filteredTests.find(t=>t.trackingNumber===m.trackingNumber && t.testingAge===age.label);

      let status;
      if(completedTest){ status='Completed'; }
      else if(dueStr < todayStr){ status='Overdue'; }
      else if(dueStr === todayStr){ status='Due Today'; }
      else{ status='Future'; }

      sched.push({ status });
    });
  });

  const overdue = sched.filter(s=>s.status==='Overdue').length;
  const dueToday = sched.filter(s=>s.status==='Due Today').length;
  const pending = sched.filter(s=>s.status!=='Completed').length;

  const withDerived = filteredMaster.map(m=>({m, d:computeDerived(m)}));
  const matureRows = withDerived.filter(x=>x.d.avgStrength!=null);
  const avgStrength = matureRows.length ? matureRows.reduce((s,x)=>s+x.d.avgStrength,0)/matureRows.length : 0;
  const passCount = matureRows.filter(x=>x.d.passFail==='Pass').length;
  const failCount = matureRows.filter(x=>x.d.passFail==='Fail').length;

  const passPct = (passCount+failCount) ? (passCount/(passCount+failCount)*100) : 0;
  const failPct = (passCount+failCount) ? (failCount/(passCount+failCount)*100) : 0;

  const gradeCounts = {};
  filteredMaster.forEach(m=>gradeCounts[m.grade]=(gradeCounts[m.grade]||0)+1);
  const mostGrade = Object.entries(gradeCounts).sort((a,b)=>b[1]-a[1])[0];
  const avgCement = filteredMaster.length ? filteredMaster.reduce((s,m)=>s+parseFloat(m.cementContent||0),0)/filteredMaster.length : 0;

  const kpis = [
    {label:'Total Cubes', value: filteredMaster.reduce((s,m)=>s+(parseInt(m.numCubes,10)||0),0)},
    {label:'Pending Tests', value: pending},
    {label:'Due Today', value: dueToday, cls: dueToday>0?'amber':''},
    {label:'Overdue', value: overdue, cls: overdue>0?'warn':'good'},
    {label:'Avg 28d Strength', value: avgStrength.toFixed(1)+' N/mm²'},
    {label:'Pass %', value: passPct.toFixed(1)+'%', cls:'good'},
    {label:'Fail %', value: failPct.toFixed(1)+'%', cls: failPct>0?'warn':''},
    {label:'Most Used Grade', value: mostGrade? mostGrade[0] : '—'},
    {label:'Avg Cement Content', value: avgCement.toFixed(0)+' kg/m³'},
    {label:'Castings Filtered', value: filteredMaster.length},
    {label:'Tests Recorded', value: filteredTests.length},
    {label:'28-Day Results', value: matureRows.length},
  ];

  const kpisEl = document.getElementById('dash-kpis');
  if(kpisEl){
    kpisEl.innerHTML = kpis.map(k=>`
      <div class="kpi"><div class="label">${k.label}</div><div class="value ${k.cls||''}">${k.value}</div></div>
    `).join('');
  }

  // 1. Render Table A: Age-wise Strength Development (Hydration Analysis)
  renderDashboardAgeTable(filteredTests);

  // 2. Render Table B: Grade-wise Performance Summary
  renderDashboardGradeTable(filteredMaster);

  // 3. Render Table C: Technician & Laboratory Testing Breakdown
  renderDashboardTechTable(filteredTests);

  // 4. Render Engineering Interpretation Text
  const logPoints = STANDARD_AGES.map(a=>{
    const vals = filteredTests.filter(t=>t.testingAge===a.label).map(t=>parseFloat(t.strength)).filter(v=>!isNaN(v));
    const avg = vals.length ? parseFloat((vals.reduce((s,v)=>s+v,0)/vals.length).toFixed(2)) : null;
    return avg !== null ? { x: a.days, y: avg } : null;
  }).filter(Boolean);

  const startVal = document.getElementById('dash-start') ? document.getElementById('dash-start').value : '';
  const endVal = document.getElementById('dash-end') ? document.getElementById('dash-end').value : '';
  const gradeVal = document.getElementById('dash-grade') ? document.getElementById('dash-grade').value : '';
  const custVal = document.getElementById('dash-customer') ? document.getElementById('dash-customer').value : '';

  renderInterpretation(filteredMaster, matureRows, passCount, failCount, passPct, gradeVal, custVal, startVal, endVal, logPoints);
}

/* ---- Table A: Age-wise Strength Development ---- */
function renderDashboardAgeTable(filteredTests){
  const tbody = document.querySelector('#dash-tbl-age tbody');
  if(!tbody) return;

  const ages = ['3 Days', '7 Days', '14 Days', '28 Days'];

  tbody.innerHTML = ages.map(age => {
    const tests = filteredTests.filter(t => t.testingAge === age);
    const vals = tests.map(t => parseFloat(t.strength)).filter(v => !isNaN(v));
    
    if(!vals.length){
      return `
        <tr>
          <td><strong>${age}</strong></td>
          <td style="text-align:right;">0</td>
          <td style="text-align:right;" class="mono">—</td>
          <td style="text-align:right;" class="mono">—</td>
          <td style="text-align:right;" class="mono">—</td>
          <td><span class="badge badge-grey">No Test Data</span></td>
        </tr>
      `;
    }

    const avg = (vals.reduce((s,v)=>s+v,0)/vals.length).toFixed(2);
    const min = Math.min(...vals).toFixed(2);
    const max = Math.max(...vals).toFixed(2);

    let badgeCls = 'badge-blue';
    let statusText = 'Normal Early Gain';
    if(age === '7 Days') statusText = 'Normal Hydration';
    if(age === '14 Days') { badgeCls = 'badge-amber'; statusText = 'Intermediate Gain'; }
    if(age === '28 Days') { badgeCls = 'badge-green'; statusText = 'Mature Characteristic'; }

    return `
      <tr>
        <td><strong>${age}</strong></td>
        <td style="text-align:right;" class="mono">${vals.length}</td>
        <td style="text-align:right;font-weight:700;" class="mono">${avg} N/mm²</td>
        <td style="text-align:right;" class="mono">${min}</td>
        <td style="text-align:right;" class="mono">${max}</td>
        <td><span class="badge ${badgeCls}">${statusText}</span></td>
      </tr>
    `;
  }).join('');
}

/* ---- Table B: Grade-wise Performance Summary ---- */
function renderDashboardGradeTable(filteredMaster){
  const tbody = document.querySelector('#dash-tbl-grade tbody');
  if(!tbody) return;

  const distinctGrades = [...new Set(filteredMaster.map(m => (m.grade || '').trim()).filter(Boolean))].sort();

  if(!distinctGrades.length){
    tbody.innerHTML = `<tr><td colspan="5"><div class="empty-state" style="padding:16px;">No grade data found.</div></td></tr>`;
    return;
  }

  tbody.innerHTML = distinctGrades.map(grade => {
    const target = gradeTarget(grade);
    const masters = filteredMaster.filter(m => m.grade === grade);
    const matureDerived = masters.map(m => computeDerived(m)).filter(d => d.avgStrength != null);
    
    const count = matureDerived.length;
    const avg28d = count ? (matureDerived.reduce((s,d)=>s+d.avgStrength,0)/count).toFixed(2) : null;
    const passCount = matureDerived.filter(d => d.passFail === 'Pass').length;
    const failCount = matureDerived.filter(d => d.passFail === 'Fail').length;
    
    const passPct = count ? Math.round((passCount/count)*100) : 0;
    const failPct = count ? (100 - passPct) : 0;

    let badgeHtml = '<span class="badge badge-grey">Pending</span>';
    if(count > 0){
      if(failCount > 0){
        badgeHtml = `<span class="badge badge-red">${passPct}% Pass / ${failPct}% Fail</span>`;
      } else {
        badgeHtml = `<span class="badge badge-green">${passPct}% Pass</span>`;
      }
    }

    return `
      <tr>
        <td><strong>${escapeHtml(grade)}</strong></td>
        <td style="text-align:right;" class="mono">${target != null ? target + ' N/mm²' : '—'}</td>
        <td style="text-align:right;" class="mono">${masters.length}</td>
        <td style="text-align:right;font-weight:700;" class="mono">${avg28d ? avg28d + ' N/mm²' : '—'}</td>
        <td>${badgeHtml}</td>
      </tr>
    `;
  }).join('');
}

/* ---- Table C: Technician & Laboratory Testing Breakdown ---- */
function renderDashboardTechTable(filteredTests){
  const tbody = document.querySelector('#dash-tbl-tech tbody');
  if(!tbody) return;

  const techs = [...new Set(filteredTests.map(t => (t.testedBy || '').trim()).filter(Boolean))].sort();

  if(!techs.length){
    tbody.innerHTML = `<tr><td colspan="4"><div class="empty-state" style="padding:16px;">No technician test records in this filter range.</div></td></tr>`;
    return;
  }

  tbody.innerHTML = techs.map(tech => {
    const techTests = filteredTests.filter(t => t.testedBy === tech);
    const vals = techTests.map(t => parseFloat(t.strength)).filter(v => !isNaN(v));
    const avg = vals.length ? (vals.reduce((s,v)=>s+v,0)/vals.length).toFixed(2) : '—';
    const roleBadge = tech.toLowerCase().includes('admin') || tech.toLowerCase().includes('qc') 
      ? '<span class="badge badge-purple">QC Verified</span>' 
      : '<span class="badge badge-blue">Active Technician</span>';

    return `
      <tr>
        <td><strong>${escapeHtml(tech)}</strong></td>
        <td style="text-align:right;" class="mono">${techTests.length}</td>
        <td style="text-align:right;font-weight:700;" class="mono">${avg !== '—' ? avg + ' N/mm²' : '—'}</td>
        <td>${roleBadge}</td>
      </tr>
    `;
  }).join('');
}

function renderInterpretation(filteredMaster, matureRows, passCount, failCount, passPct, gradeVal, custVal, startVal, endVal, logPoints){
  let interp = '';

  const filterDesc = [];
  if(gradeVal) filterDesc.push(`Grade <strong>${gradeVal}</strong>`);
  if(custVal) filterDesc.push(`Customer <strong>${custVal}</strong>`);
  if(startVal || endVal) filterDesc.push(`Date Range <strong>${fmtDate(startVal)||"Start"} to ${fmtDate(endVal)||"Present"}</strong>`);

  const scopeText = filterDesc.length ? `[Filtered Scope: ${filterDesc.join(' · ')}]` : `[All Plant Batches Scope]`;

  const validAverages = (logPoints||[]).map(p=>p.y);
  if(validAverages.length >= 2){
    const increasing = validAverages.every((v,i)=> i===0 || v >= validAverages[i-1]);
    interp = `<strong>Hydration Trend ${scopeText}:</strong> ${increasing
      ? 'Concrete strength gain follows a standard log-time curve from 3-day through 28-day testing, fully consistent with BS EN 12390 characteristic strength progression.'
      : 'Strength gain curve shows non-monotonic readings across ages. Verify laboratory curing conditions, compaction, or machine calibration.'}`;
  } else {
    interp = `<strong>Hydration Trend ${scopeText}:</strong> Insufficient test age data in this filtered set to plot a complete 3/7/14/28-day hydration curve. Record additional test results to generate full engineering curve.`;
  }

  if(matureRows.length){
    interp += `<br><strong>Quality Compliance:</strong> ${passPct.toFixed(1)}% of 28-day mature test sets (${passCount}/${passCount+failCount}) meet or exceed their specified characteristic strength target (${filteredMaster.length} total batch(es) evaluated).`;
  } else {
    interp += `<br><strong>Quality Compliance:</strong> No 28-day mature test results available for the selected filters yet.`;
  }

  const interpEl = document.getElementById('dash-interpretation');
  if(interpEl) interpEl.innerHTML = interp;
}

window.addEventListener('load', () => {
  const dashView = document.getElementById('view-dashboard');
  if(dashView && dashView.classList.contains('active')){
    renderDashboard();
  }
});

/* ---------------------- REPORTS VIEW & DYNAMIC FILTERING ---------------------- */
function filterReportTrackingNumbers(){
  const custVal = (document.getElementById('rep-customer') ? document.getElementById('rep-customer').value : '').trim().toLowerCase();
  const select = document.getElementById('rep-tn');
  if(!select) return;

  const currentSelected = select.value;
  let matches = state.master;

  if(custVal){
    matches = matches.filter(m => (m.customer || '').toLowerCase().includes(custVal));
  }

  matches = [...matches].sort((a,b) => new Date(b.castingDate) - new Date(a.castingDate));

  if(!matches.length){
    select.innerHTML = `<option value="">No tracking numbers found for "${escapeHtml(custVal)}"</option>`;
    return;
  }

  let optionsHtml = `<option value="">Select Tracking Number (${matches.length} available)…</option>`;
  optionsHtml += matches.map(m => {
    const custLabel = m.customer ? ` [${m.customer}]` : '';
    const sel = (m.trackingNumber === currentSelected) ? 'selected' : '';
    return `<option value="${m.trackingNumber}" ${sel}>${m.trackingNumber}${custLabel} — ${m.site} (${m.grade})</option>`;
  }).join('');

  select.innerHTML = optionsHtml;
}

function generateCubeReport(){
  const tnSelect = document.getElementById('rep-tn');
  const tn = tnSelect ? tnSelect.value : '';
  if(!tn){
    toast('Please select a Tracking Number from the dropdown.');
    return;
  }

  const selectedAge = document.getElementById('rep-age') ? document.getElementById('rep-age').value : 'All Ages';
  const m = findMaster(tn);
  if(!m){ toast('Tracking Number not found.'); return; }
  const d = computeDerived(m);
  const allTests = testsFor(m.trackingNumber);
  
  // Filter test results by selected age (unless "All Ages")
  const filteredTests = (selectedAge === 'All Ages') ? allTests : allTests.filter(t=>t.testingAge === selectedAge);
  
  const printStampTime = fmtDateTime(new Date());
  const printUser = currentUser ? currentUser.username : 'Guest';

  // Average Compressive Strength calculation
  const avgStrengthVal = filteredTests.length ? (filteredTests.reduce((s,t)=>s+t.strength,0)/filteredTests.length).toFixed(2) : '—';
  
  // Metadata fields mapping
  const repTestingDate = filteredTests.length ? fmtDate(filteredTests[0].testingDate) : '—';
  const repTestingAge = selectedAge !== 'All Ages' ? selectedAge : (filteredTests.length ? filteredTests[0].testingAge : '—');
  const repTestedBy = filteredTests.length ? filteredTests[0].testedBy : (currentUser ? currentUser.username : 'Lab Technician');

  const rowsHtml = filteredTests.length ? filteredTests.map((t, idx)=>`
    <tr style="text-align:center;">
      <td style="padding:6px 8px;border:1px solid var(--line);">${idx + 1}</td>
      <td style="padding:6px 8px;border:1px solid var(--line);">${t.weight ? t.weight.toFixed(2) : '8.25'}</td>
      <td style="padding:6px 8px;border:1px solid var(--line);">${t.load.toFixed(2)}</td>
      <td style="padding:6px 8px;border:1px solid var(--line);font-weight:700;">${t.strength.toFixed(2)}</td>
      <td style="padding:6px 8px;border:1px solid var(--line);font-family:var(--font-mono);font-size:11.5px;">${t.testId}</td>
    </tr>
  `).join('') : `<tr><td colspan="5" style="text-align:center;color:var(--ink-soft);padding:14px;border:1px solid var(--line);">No test results recorded for age "${selectedAge}".</td></tr>`;

  document.getElementById('report-output').innerHTML = `
    <div class="report-sheet official-report-sheet" style="font-family:var(--font-body);color:#000;">
      
      <!-- HEADER SECTION -->
      <div style="text-align:center;border-bottom:2px solid var(--slate-deep);padding-bottom:12px;margin-bottom:14px;">
        <div style="font-family:var(--font-display);font-weight:800;font-size:20px;color:var(--slate-deep);letter-spacing:0.03em;">TOKYO SUPER MIX (PVT) LTD</div>
        <div style="font-weight:700;font-size:13.5px;color:var(--ink);margin-top:2px;">TOKYO SUPER MIX READY MIXED CONCRETE PLANT</div>
        <div style="font-size:12px;color:var(--ink-soft);">Saliya Mawatha Anuradhapura</div>
        <div style="font-size:11.5px;color:var(--ink-soft);margin-top:1px;">Tel/Fax: 025-2234193 &nbsp;|&nbsp; E-mail : Supermix.anurap@tokyocement.lk</div>
      </div>

      <div style="text-align:center;margin-bottom:16px;">
        <div style="font-family:var(--font-display);font-weight:800;font-size:15px;color:var(--slate-deep);text-transform:uppercase;letter-spacing:0.04em;">CONCRETE COMPRESSIVE STRENGTH TEST REPORT</div>
        <div style="font-size:11.5px;color:var(--ink-soft);font-style:italic;margin-top:2px;">(Specification Reference : BS 1881-116)</div>
      </div>

      <!-- METADATA SECTION (Formal Label : Value Alignment) -->
      <table style="width:100%;border-collapse:collapse;margin-bottom:16px;font-size:12.5px;line-height:1.6;">
        <tr>
          <td style="width:18%;font-weight:600;padding:4px 0;">Customer</td>
          <td style="width:32%;padding:4px 0;">: ${m.customer || m.site}</td>
          <td style="width:20%;font-weight:600;padding:4px 0;">Date of test</td>
          <td style="width:30%;padding:4px 0;">: ${repTestingDate}</td>
        </tr>
        <tr>
          <td style="font-weight:600;padding:4px 0;">Project/Site</td>
          <td style="padding:4px 0;">: ${m.site}</td>
          <td style="font-weight:600;padding:4px 0;">Age of cubes at testing</td>
          <td style="padding:4px 0;">: ${repTestingAge}</td>
        </tr>
        <tr>
          <td style="font-weight:600;padding:4px 0;">Grade of concrete</td>
          <td style="padding:4px 0;">: ${m.grade} (Target: ${gradeTarget(m.grade)||'—'} N/mm²)</td>
          <td style="font-weight:600;padding:4px 0;">Dimensions of cube</td>
          <td style="padding:4px 0;">: 150mm * 150mm * 150mm</td>
        </tr>
        <tr>
          <td style="font-weight:600;padding:4px 0;">Slump</td>
          <td style="padding:4px 0;">: ${m.slump}</td>
          <td style="font-weight:600;padding:4px 0;">Location</td>
          <td style="padding:4px 0;">: ${m.bulkNumber}${m.remarks ? ' ('+m.remarks+')' : ''}</td>
        </tr>
        <tr>
          <td style="font-weight:600;padding:4px 0;">Casted Date</td>
          <td style="padding:4px 0;">: ${fmtDate(m.castingDate)}</td>
          <td style="font-weight:600;padding:4px 0;">Tracking Number</td>
          <td style="padding:4px 0;font-family:var(--font-mono);font-weight:600;">: ${m.trackingNumber}</td>
        </tr>
      </table>

      <!-- TEST RESULTS TABLE -->
      <table style="width:100%;border-collapse:collapse;margin:14px 0;">
        <thead>
          <tr style="background:var(--surface-sunk);font-weight:700;font-size:12px;">
            <th style="padding:8px;border:1px solid var(--line);text-align:center;">Cube No</th>
            <th style="padding:8px;border:1px solid var(--line);text-align:center;">Weight (kg)</th>
            <th style="padding:8px;border:1px solid var(--line);text-align:center;">Load at failure (kN)</th>
            <th style="padding:8px;border:1px solid var(--line);text-align:center;">Compressive Strength (N/mm²)</th>
            <th style="padding:8px;border:1px solid var(--line);text-align:center;">Remarks</th>
          </tr>
        </thead>
        <tbody>
          ${rowsHtml}
        </tbody>
      </table>

      <!-- SUMMARY SECTION -->
      <div style="margin:16px 0;padding:10px 14px;background:var(--surface-sunk);border:1px solid var(--line);border-radius:var(--radius-sm);font-size:13.5px;">
        <strong>Average Compressive Strength :</strong> <span style="font-size:16px;font-weight:800;color:var(--slate-deep);font-family:var(--font-mono);">${avgStrengthVal}</span> <strong>N/mm²</strong>
      </div>

      <!-- SIGNATURE SECTION -->
      <div class="sig-area" style="display:flex;justify-content:space-between;margin-top:40px;padding-top:10px;">
        <div style="width:45%;font-size:12px;line-height:1.9;">
          <div style="font-weight:700;color:var(--slate-deep);margin-bottom:4px;">Tested By (Lab Technician)</div>
          <div>Name : <strong>${repTestedBy}</strong></div>
          <div>Signature : …………………………………………………</div>
        </div>
        <div style="width:45%;font-size:12px;line-height:1.9;">
          <div style="font-weight:700;color:var(--slate-deep);margin-bottom:4px;">Witnessed By</div>
          <div>Name (QC) : …………………………………………………</div>
          <div>Signature : …………………………………………………</div>
        </div>
      </div>

      <!-- DOCUMENT CONTROL FOOTER & TIMESTAMP -->
      <div style="margin-top:40px;display:flex;justify-content:space-between;align-items:flex-end;font-size:10.5px;color:var(--ink-soft);font-family:var(--font-mono);border-top:1px solid var(--line);padding-top:8px;">
        <div>
          <div>F/QAQC/30</div>
          <div>Issue 3 Rev 0</div>
          <div>01/09/2018</div>
        </div>
        <div style="text-align:right;">
          Printed: ${printStampTime}<br>
          User: ${printUser} | Tokyo Super Mix Anuradhapura
        </div>
      </div>

      <div class="btn-row no-print" style="margin-top:24px;gap:12px;">
        <button class="btn btn-primary" onclick="generateCubeTestReport('${tn}')">📄 Download Official PDF Report (A4)</button>
        <button class="btn btn-ghost" onclick="window.print()">🖨 Print View</button>
      </div>

      <!-- Bottom right 4px time date user print stamp -->
      <div class="report-print-stamp">Printed: ${printStampTime} | User: ${printUser} | Tokyo Super Mix Anuradhapura BS EN 1881-116</div>
    </div>
  `;
}

function generateMonthlyReport(){
  const dateVal = document.getElementById('rep-month').value;
  if(!dateVal){ toast('Pick a date within the target month.'); return; }
  const target = new Date(dateVal + 'T00:00:00');
  const y = target.getFullYear(), mo = target.getMonth();
  const printStampTime = fmtDateTime(new Date());
  const printUser = currentUser ? currentUser.username : 'Guest';

  const inMonth = state.master.filter(m=>{
    const cd = new Date(m.castingDate + 'T00:00:00');
    return cd.getFullYear()===y && cd.getMonth()===mo;
  });

  const withDerived = inMonth.map(m=>({m,d:computeDerived(m)}));
  const gradeSummary = {}, siteSummary = {}, designSummary = {};
  withDerived.forEach(x=>{
    gradeSummary[x.m.grade] = (gradeSummary[x.m.grade]||0)+1;
    siteSummary[x.m.site] = (siteSummary[x.m.site]||0)+1;
    designSummary[x.m.designCode] = (designSummary[x.m.designCode]||0)+1;
  });

  const mature = withDerived.filter(x=>x.d.avgStrength!=null);
  const avgStrength = mature.length ? mature.reduce((s,x)=>s+x.d.avgStrength,0)/mature.length : null;
  const pending = withDerived.filter(x=>x.d.status!=='Completed').length;
  const sched = buildSchedule().filter(s=>{
    const cd = new Date(s.castingDate + 'T00:00:00');
    return cd.getFullYear()===y && cd.getMonth()===mo;
  });
  const overdue = sched.filter(s=>s.status==='Overdue').length;

  const listRows = (obj) => Object.entries(obj).sort((a,b)=>b[1]-a[1]).map(([k,v])=>`<tr><td>${k}</td><td><strong>${v}</strong></td></tr>`).join('') || `<tr><td colspan="2" style="color:var(--ink-soft)">No records</td></tr>`;

  document.getElementById('report-output').innerHTML = `
    <div class="report-sheet">
      <div class="report-head">
        <div class="logo">TOKYO SUPER MIX <span>(PVT) LTD</span></div>
        <div class="doc-type">
          <strong>MONTHLY CONCRETE QC SUMMARY</strong><br>
          Period: ${target.toLocaleString('en-GB',{month:'long',year:'numeric'})}<br>
          Generated: ${fmtDate(new Date())}
        </div>
      </div>

      <div class="grid grid-2">
        <div>
          <h3 style="font-size:13px;color:var(--slate-deep);margin-bottom:6px;">Concrete Grade Breakdown</h3>
          <table class="report-table"><tr><td class="k">Grade</td><td class="k">Cast Batches</td></tr>${listRows(gradeSummary)}</table>
        </div>
        <div>
          <h3 style="font-size:13px;color:var(--slate-deep);margin-bottom:6px;">Supply Site Breakdown</h3>
          <table class="report-table"><tr><td class="k">Site</td><td class="k">Cast Batches</td></tr>${listRows(siteSummary)}</table>
        </div>
      </div>

      <h3 style="font-size:13px;color:var(--slate-deep);margin-top:14px;margin-bottom:6px;">Mix Design Code Summary</h3>
      <table class="report-table"><tr><td class="k">Design Code</td><td class="k">Cast Batches</td></tr>${listRows(designSummary)}</table>

      <h3 style="font-size:13px;color:var(--slate-deep);margin-top:14px;margin-bottom:6px;">Monthly Performance Overview</h3>
      <table class="report-table">
        <tr><td class="k">Total Cast Batches This Month</td><td>${inMonth.length}</td></tr>
        <tr><td class="k">Total Cubes Cast</td><td>${inMonth.reduce((s,m)=>s+m.numCubes,0)}</td></tr>
        <tr><td class="k">Average 28-day Compressive Strength</td><td style="font-weight:700;">${avgStrength!=null?avgStrength.toFixed(2)+' N/mm²':'No 28-day mature results yet'}</td></tr>
        <tr><td class="k">Pending Schedule Tests</td><td>${pending}</td></tr>
        <tr><td class="k">Overdue Tests</td><td>${overdue}</td></tr>
      </table>

      <div class="sig-area">
        <div class="sig-line">Prepared By (QC Officer)</div>
        <div class="sig-line">Approved By (Quality Manager)</div>
      </div>

      <div class="btn-row no-print" style="margin-top:24px;">
        <button class="btn btn-primary" onclick="window.print()">🖨 Print / Save as PDF</button>
      </div>

      <!-- Bottom right 4px time date user print stamp -->
      <div class="report-print-stamp">Printed: ${printStampTime} | User: ${printUser} | Tokyo Super Mix Anuradhapura BS EN 1881-116</div>
    </div>
  `;
}

/* ---------------------- DAILY PRODUCTION & QA REPORT VIEW ---------------------- */
function renderDailyReport(){
  const startVal = document.getElementById('daily-start').value;
  const endVal = document.getElementById('daily-end').value;
  
  let records = state.master;
  if(startVal){
    records = records.filter(m => m.castingDate >= startVal);
  }
  if(endVal){
    records = records.filter(m => m.castingDate <= endVal);
  }
  
  records.sort((a,b) => new Date(a.castingDate) - new Date(b.castingDate));
  
  const tbody = document.querySelector('#daily-table tbody');
  if(!records.length){
    tbody.innerHTML = `<tr><td colspan="14"><div class="empty-state"><div class="ic">&#128202;</div>No production records found for the selected date range.</div></td></tr>`;
    return;
  }
  
  tbody.innerHTML = records.map((m, idx) => {
    const tests = testsFor(m.trackingNumber);
    
    // 7-Day tests
    const tests7d = tests.filter(t => t.testingAge === '7 Days');
    const date7d = tests7d.length ? fmtDate(tests7d[0].testingDate) : '—';
    const str7d = tests7d.length ? (tests7d.reduce((s,t) => s + t.strength, 0) / tests7d.length).toFixed(2) : '—';
    
    // 28-Day tests
    const tests28d = tests.filter(t => t.testingAge === '28 Days');
    const date28d = tests28d.length ? fmtDate(tests28d[0].testingDate) : '—';
    const str28d = tests28d.length ? (tests28d.reduce((s,t) => s + t.strength, 0) / tests28d.length).toFixed(2) : '—';
    
    return `
      <tr>
        <td>${idx + 1}</td>
        <td class="mono">${fmtDate(m.castingDate)}</td>
        <td><strong>${m.customer || '—'}</strong></td>
        <td>${m.site}</td>
        <td>${m.weather || '—'}</td>
        <td>${m.grade}</td>
        <td>${m.designCode}</td>
        <td>${m.cementContent}</td>
        <td>${m.volume != null ? m.volume : '—'}</td>
        <td class="mono">${date7d}</td>
        <td style="font-weight:600;">${str7d}</td>
        <td class="mono">${date28d}</td>
        <td style="font-weight:700;color:var(--slate-deep);">${str28d}</td>
        <td>${m.slump}</td>
      </tr>
    `;
  }).join('');
}

function exportDailyExcel(){
  if(typeof XLSX === 'undefined'){
    toast('⚠️ Excel library (SheetJS) is not loaded. Please check your internet connection and refresh the page.');
    return;
  }
  const startVal = document.getElementById('daily-start').value;
  const endVal = document.getElementById('daily-end').value;
  
  let records = state.master;
  if(startVal) records = records.filter(m => m.castingDate >= startVal);
  if(endVal) records = records.filter(m => m.castingDate <= endVal);
  
  if(!records.length){ toast('No production data to export.'); return; }
  
  records.sort((a,b) => new Date(a.castingDate) - new Date(b.castingDate));
  
  const excelRows = records.map((m, idx) => {
    const tests = testsFor(m.trackingNumber);
    const tests7d = tests.filter(t => t.testingAge === '7 Days');
    const tests28d = tests.filter(t => t.testingAge === '28 Days');
    
    return {
      'No': idx + 1,
      'Casting Date': fmtDate(m.castingDate),
      'Customer': m.customer || '',
      'Site Location': m.site,
      'Weather': m.weather || '',
      'Grade': m.grade,
      'Design Code': m.designCode,
      'Cement (kg)': m.cementContent,
      'Volume (m3)': m.volume != null ? m.volume : '',
      '7Day Date': tests7d.length ? fmtDate(tests7d[0].testingDate) : '',
      '7Day Strength (N/mm2)': tests7d.length ? (tests7d.reduce((s,t) => s + t.strength, 0) / tests7d.length).toFixed(2) : '',
      '28Day Date': tests28d.length ? fmtDate(tests28d[0].testingDate) : '',
      '28Day Strength (N/mm2)': tests28d.length ? (tests28d.reduce((s,t) => s + t.strength, 0) / tests28d.length).toFixed(2) : '',
      'Slump': m.slump
    };
  });
  
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet(excelRows);
  XLSX.utils.book_append_sheet(wb, ws, 'Daily Production QA');
  XLSX.writeFile(wb, `Daily_Production_QA_Report_${new Date().toISOString().slice(0,10)}.xlsx`);
  
  logActivity("Excel Export", "—", currentUser ? currentUser.username : 'User', `Exported Daily Production & QA Report (${records.length} records)`);
  toast('Daily Production & QA Report exported to Excel.');
}

/* ---------------------- MASTER DATABASE TABLE ---------------------- */
function renderMaster(){
  const filter = (document.getElementById('master-filter').value||'').toLowerCase();
  let rows = state.master.map(m=>({m, d:computeDerived(m)}));
  if(filter){
    rows = rows.filter(x=>[x.m.trackingNumber,x.m.customer,x.m.site,x.m.grade,x.m.designCode,x.m.bulkNumber,x.m.castedBy].join(' ').toLowerCase().includes(filter));
  }
  rows.sort((a,b)=>new Date(b.m.castingDate)-new Date(a.m.castingDate));

  const isAdminUser = isAdmin();

  const table = document.getElementById('master-table');
  table.querySelector('thead').innerHTML = `<tr>
    <th>Tracking No.</th><th>Cast Date</th><th>Customer</th><th>Supply Site</th><th>Weather</th><th>Design Code</th><th>Grade</th><th>Slump</th>
    <th>Cement (kg/m³)</th><th>Volume (m³)</th><th>Silo</th><th>Bulk No.</th><th>Casted By</th><th>Cubes</th>
    <th>Status</th><th>Tests</th><th>Avg 28d Strength</th><th>Pass/Fail</th>${isAdminUser ? '<th>Actions</th>' : ''}
  </tr>`;
  table.querySelector('tbody').innerHTML = rows.length ? rows.map(({m,d})=>`
    <tr>
      <td><a href="#" onclick="jumpToRecall('${m.trackingNumber}'); return false;" class="tn-link">${m.trackingNumber}</a></td><td>${fmtDate(m.castingDate)}</td>
      <td><strong>${m.customer || '—'}</strong></td><td>${m.site}</td><td>${m.weather || '—'}</td>
      <td>${m.designCode}</td><td>${m.grade}</td><td>${m.slump}</td><td>${m.cementContent}</td>
      <td>${m.volume != null ? m.volume : '—'}</td>
      <td>${m.cementSilo}</td><td>${m.bulkNumber}</td><td>${m.castedBy}</td><td>${m.numCubes}</td>
      <td>${statusBadge(d.status)}</td><td>${d.testsCompleted}/${Math.min(4,m.numCubes)}</td>
      <td style="font-weight:600;">${d.avgStrength!=null? d.avgStrength.toFixed(2) + ' N/mm²':'—'}</td><td>${statusBadge(d.passFail)}</td>
      ${isAdminUser ? `<td><button class="btn btn-danger btn-sm" onclick="confirmDeleteRecord('${m.trackingNumber}')" title="Admin only">Delete</button></td>` : ''}
    </tr>
  `).join('') : `<tr><td colspan="${isAdminUser ? 19 : 18}"><div class="empty-state"><div class="ic">&#9744;</div>No records found. Create a record using New Cube Entry.</div></td></tr>`;
}

function confirmDeleteRecord(tn){
  if(!isAdmin()){
    toast("Access Denied: Deleting records is restricted to Admin user only.");
    return;
  }
  showModal(
    "Delete Casting Record",
    `Are you sure you want to permanently delete tracking record ${tn} and all associated test entries?`,
    ()=>{
      state.master = state.master.filter(m=>m.trackingNumber!==tn);
      state.tests = state.tests.filter(t=>t.trackingNumber!==tn);
      logActivity("Record Deleted", tn, currentUser ? currentUser.username : 'Admin', `Deleted casting record ${tn} and associated test readings`);
      saveState();
      updateSuggestions();
      renderTestingSidebarList();
      renderMaster();
      toast(`Record ${tn} deleted successfully.`);
    }
  );
}

/* ---------------------- ACTIVITY LOG VIEW ---------------------- */
function renderActivityLog(){
  const filter = (document.getElementById('activity-filter').value||'').toLowerCase();
  const typeFilter = document.getElementById('activity-type-filter').value;
  let rows = state.activities || [];

  if(filter){
    rows = rows.filter(r=>[r.id, r.trackingNumber, r.user, r.actionType, r.details].join(' ').toLowerCase().includes(filter));
  }
  if(typeFilter){
    rows = rows.filter(r=>r.actionType===typeFilter);
  }

  const table = document.getElementById('activity-table');
  table.querySelector('thead').innerHTML = `<tr>
    <th>Log ID</th><th>Timestamp</th><th>Action Type</th><th>Tracking No.</th><th>User / Operator</th><th>Activity Details</th>
  </tr>`;

  table.querySelector('tbody').innerHTML = rows.length ? rows.map(r=>`
    <tr>
      <td class="mono">${r.id}</td>
      <td class="mono">${r.formattedTime || fmtDateTime(r.timestamp)}</td>
      <td>${statusBadge(r.actionType)}</td>
      <td>${r.trackingNumber && r.trackingNumber !== '—' ? `<a href="#" onclick="jumpToRecall('${r.trackingNumber}'); return false;" class="tn-link">${r.trackingNumber}</a>` : '—'}</td>
      <td style="font-weight:600;color:var(--slate-deep);">${r.user}</td>
      <td style="white-space:normal;max-width:400px;line-height:1.4;">${r.details}</td>
    </tr>
  `).join('') : `<tr><td colspan="6"><div class="empty-state"><div class="ic">&#128221;</div>No activity logs recorded yet.</div></td></tr>`;
}

function confirmClearActivityLog(){
  if(!isAdmin()){
    toast("Access Denied: Clearing activity logs is restricted to Admin user only.");
    return;
  }
  showModal(
    "Clear Activity Log",
    "Are you sure you want to clear all activity recordings? This will remove the audit log history from local storage.",
    ()=>{
      state.activities = [];
      saveState();
      renderActivityLog();
      toast("Activity Log cleared.");
    }
  );
}

/* ---------------------- EXPORT & BACKUP ---------------------- */
function exportExcel(){
  if(typeof XLSX === 'undefined'){
    toast('⚠️ Excel library (SheetJS) is not loaded. Please check your internet connection and refresh the page.');
    return;
  }
  if(!state.master.length){ toast('No database records to export.'); return; }

  const rows = state.master.map(m=>{
    const d = computeDerived(m);
    return {
      'Tracking Number': m.trackingNumber,
      'Casting Date': fmtDate(m.castingDate),
      'Customer': m.customer || '',
      'Supply Site': m.site,
      'Weather': m.weather || '',
      'Design Code': m.designCode,
      'Grade': m.grade,
      'Slump': m.slump,
      'Cement Content (kg/m3)': m.cementContent,
      'Volume (m3)': m.volume != null ? m.volume : '',
      'Cement Silo': m.cementSilo,
      'Bulk Number': m.bulkNumber,
      'Casted By': m.castedBy,
      'Number of Cubes': m.numCubes,
      'Cast Time': m.castTime || '',
      'Remarks': m.remarks || '',
      'Status': d.status,
      'Tests Completed': d.testsCompleted,
      'Average 28d Strength (N/mm2)': d.avgStrength!=null ? d.avgStrength.toFixed(2) : '',
      'Pass/Fail': d.passFail,
      'Date Created': fmtDate(m.dateCreated),
      'Last Updated': fmtDate(m.lastUpdated),
    };
  });

  const testRows = state.tests.map(t=>({
    'Test ID': t.testId,
    'Tracking Number': t.trackingNumber,
    'Testing Date': fmtDate(t.testingDate),
    'Testing Age': t.testingAge,
    'Tested By': t.testedBy,
    'Weight (kg)': t.weight || 8.25,
    'Load (kN)': t.load,
    'Cube Size (mm)': t.cubeSize,
    'Strength (N/mm2)': t.strength,
    'Design Code': t.designCode,
    'Grade': t.grade
  }));

  const logRows = (state.activities || []).map(a=>({
    'Log ID': a.id,
    'Timestamp': a.formattedTime || fmtDateTime(a.timestamp),
    'Action Type': a.actionType,
    'Tracking Number': a.trackingNumber,
    'User / Operator': a.user,
    'Details': a.details
  }));

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), 'Master Database');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(testRows), 'Testing Records');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(logRows), 'Activity Log');
  XLSX.writeFile(wb, `Tokyo_Supermix_QC_Export_${new Date().toISOString().slice(0,10)}.xlsx`);

  logActivity("Excel Export", "—", currentUser ? currentUser.username : 'User', `Exported Excel workbook with Master Database, Testing Records, and Activity Log sheets`);
  toast('Excel workbook exported with Activity Log sheet.');
}

function exportJSON(){
  if(!isAdmin()){ toast('Access Denied: Only Admins can download JSON backups.'); return; }
  const blob = new Blob([JSON.stringify(state,null,2)], {type:'application/json'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `tokyo_supermix_qc_backup_${new Date().toISOString().slice(0,10)}.json`;
  a.click();
  URL.revokeObjectURL(url);

  logActivity("Backup Download", "—", currentUser ? currentUser.username : 'Admin', `Downloaded full JSON database backup`);
  toast('JSON database backup downloaded.');
}

async function importJSON(evt){
  if(!isAdmin()){ toast('Access Denied: Only Admins can restore JSON backups.'); return; }
  const file = evt.target.files[0];
  if(!file) return;
  const reader = new FileReader();
  reader.onload = async e=>{
    try{
      const data = JSON.parse(e.target.result);
      if(!data.master && !data.tests && !data.crmVisits) throw new Error('Invalid schema');
      
      state = {
        master: Array.isArray(data.master) ? data.master : [],
        tests: Array.isArray(data.tests) ? data.tests : [],
        activities: Array.isArray(data.activities) ? data.activities : [],
        users: Array.isArray(data.users) ? data.users : (state.users || []),
        skippedTests: Array.isArray(data.skippedTests) ? data.skippedTests : [],
        crmVisits: Array.isArray(data.crmVisits) ? data.crmVisits : [],
        mixGrades: Array.isArray(data.mixGrades) ? data.mixGrades : [],
        currentUser: currentUser
      };

      if(!state.users || !state.users.length){
        state.users = [
          { username: 'admin', password: '123', role: 'admin' },
          { username: 'Jagath', password: '123', role: 'operator' },
          { username: 'Pushpe', password: '123', role: 'operator' },
          { username: 'Sunil', password: '123', role: 'operator' }
        ];
      } else {
        if(!state.users.some(u => u.username && u.username.toLowerCase() === 'admin')){
          state.users.unshift({ username: 'admin', password: '123', role: 'admin' });
        }
      }

      let maxSeq = 0;
      state.master.forEach(m=>{
        if(!m.activeAges) m.activeAges = ['3 Days', '7 Days', '14 Days', '28 Days'];
        const n = parseInt((m.trackingNumber || '').split('-')[1],10);
        if(!isNaN(n) && n>maxSeq) maxSeq=n;
      });
      nextTrackingSeq = maxSeq+1;

      logActivity("Backup Restore", "—", currentUser ? currentUser.username : 'Admin', `Restored database backup (${state.master.length} castings, ${state.tests.length} tests, ${state.crmVisits.length} CRM inquiries)`);

      // Await saving to LocalStorage and Cloud Firestore
      await saveState();

      // Push collection documents directly to Cloud Firestore if DB module is active
      if(window.dbAPI && window.dbAPI.isFirebaseActive()){
        for(const m of state.master){
          await window.dbAPI.addCastingRecord(m);
        }
        for(const t of state.tests){
          await window.dbAPI.addCubeTestResult(t);
        }
        for(const v of state.crmVisits){
          await window.dbAPI.addCRMSiteVisit(v);
        }
        for(const k of state.skippedTests){
          await window.dbAPI.addTestSkipLog(k);
        }
        console.log("🔥 All imported collections synced directly to Cloud Firestore collections.");
      }

      // Re-render UI views
      if(typeof updateSuggestions === 'function') updateSuggestions();
      if(typeof renderTestingSidebarList === 'function') renderTestingSidebarList();
      if(typeof renderMaster === 'function') renderMaster();
      if(typeof renderDashboard === 'function') renderDashboard();
      if(typeof renderWarnings === 'function') renderWarnings();
      if(typeof renderActivityLog === 'function') renderActivityLog();
      if(typeof renderUsers === 'function') renderUsers();
      if(typeof renderSchedule === 'function') renderSchedule();

      toast('Database backup restored and synced to Firebase Cloud Firestore successfully.');
    }catch(err){
      console.error("Import error:", err);
      toast('Failed to restore backup — invalid JSON file format.');
    }
  };
  reader.readAsText(file);
  evt.target.value = '';
}

function confirmResetData(){
  if(!isAdmin()){
    toast("Access Denied: Resetting database is restricted to Admin user only.");
    return;
  }
  showModal(
    "Reset All Data",
    "Are you sure you want to delete all castings, test records, and activity logs from local storage? This action cannot be undone unless you have a JSON backup.",
    ()=>{
      const savedUsers = state.users;
      state = { master: [], tests: [], activities: [], users: savedUsers, currentUser: currentUser ? currentUser.username : null };
      nextTrackingSeq = 1;
      logActivity("Data Reset", "—", currentUser ? currentUser.username : 'Admin', "Reset all database records and activity logs");
      saveState();
      updateSuggestions();
      renderTestingSidebarList();
      renderMaster();
      renderDashboard();
      toast("Data reset to empty state.");
    }
  );
}

/* ---------------------- MODAL DIALOG ---------------------- */
let modalCallback = null;
function showModal(title, body, onConfirm){
  document.getElementById('modal-title').textContent = title;
  document.getElementById('modal-body').textContent = body;
  modalCallback = onConfirm;
  document.getElementById('modal-backdrop').classList.add('show');
}
function closeModal(){
  document.getElementById('modal-backdrop').classList.remove('show');
  modalCallback = null;
}
document.getElementById('modal-confirm-btn').addEventListener('click', ()=>{
  if(modalCallback) modalCallback();
  closeModal();
});

/* ---------------------- TEST SKIP WORKFLOW & WARNING ALERTS ---------------------- */
let pendingSkipItem = null;

function promptSkipTest(tn, age){
  const m = findMaster(tn);
  if(!m){ toast('Tracking Number not found.'); return; }

  pendingSkipItem = { trackingNumber: tn, age, master: m };

  const is28d = (age === '28 Days');
  const modal = document.getElementById('skip-modal-backdrop');
  const title = document.getElementById('skip-modal-title');
  const body = document.getElementById('skip-modal-body');
  const warnBox = document.getElementById('skip-warning-box');
  const confirmBtn = document.getElementById('skip-confirm-btn');

  if(title) title.textContent = is28d ? "⚠️ CRITICAL WARNING: Skip 28-Day Test" : `Skip ${age} Test — ${tn}`;
  if(body) body.textContent = `You are skipping the ${age} test for ${tn} (${m.site}, Grade ${m.grade}). Please provide an engineering justification.`;
  
  if(warnBox){
    warnBox.style.display = is28d ? 'block' : 'none';
  }

  if(confirmBtn){
    confirmBtn.className = is28d ? "btn btn-danger" : "btn btn-primary";
    confirmBtn.textContent = is28d ? "Proceed & Record Deviation" : "Confirm Skip";
  }

  document.getElementById('skip-reason-select').value = "Target strength already achieved via early test";
  document.getElementById('skip-custom-reason-input').value = "";
  document.getElementById('skip-custom-reason-field').style.display = "none";

  modal.classList.add('show');
}

function toggleCustomReasonField(){
  const sel = document.getElementById('skip-reason-select').value;
  const field = document.getElementById('skip-custom-reason-field');
  if(field) field.style.display = (sel === 'Other') ? 'block' : 'none';
}

function closeSkipModal(){
  const modal = document.getElementById('skip-modal-backdrop');
  if(modal) modal.classList.remove('show');
  pendingSkipItem = null;
}

function executeSkipTest(){
  if(!pendingSkipItem) return;
  const { trackingNumber, age, master } = pendingSkipItem;

  const selReason = document.getElementById('skip-reason-select').value;
  const customReason = document.getElementById('skip-custom-reason-input').value.trim();
  const finalReason = (selReason === 'Other') ? (customReason || 'Other reason unspecified') : selReason;

  const is28d = (age === '28 Days');
  const severity = is28d ? 'HIGH' : 'MODERATE';

  if(!state.skippedTests) state.skippedTests = [];

  const skipEntry = {
    id: 'SKP-' + String(state.skippedTests.length + 1).padStart(5, '0'),
    timestamp: new Date().toISOString(),
    formattedTime: fmtDateTime(new Date()),
    trackingNumber,
    customer: master.customer || '—',
    site: master.site || '—',
    skippedAge: age,
    skippedBy: currentUser ? currentUser.username : 'Operator',
    reason: finalReason,
    severity
  };

  state.skippedTests.unshift(skipEntry);

  logActivity(
    "Test Skipped",
    trackingNumber,
    currentUser ? currentUser.username : 'Operator',
    `Skipped ${age} test for ${trackingNumber} (${severity} Severity). Reason: ${finalReason}`
  );

  saveState();
  closeSkipModal();

  renderTestingSidebarList();
  if(document.getElementById('view-schedule') && document.getElementById('view-schedule').classList.contains('active')) renderSchedule();
  if(document.getElementById('view-warnings') && document.getElementById('view-warnings').classList.contains('active')) renderWarnings();
  applyRoleRestrictions();

  toast(`Skipped ${age} test for ${trackingNumber}. Recorded in Warning Alerts.`);
}

function renderWarnings(){
  const filter = (document.getElementById('warnings-filter') ? document.getElementById('warnings-filter').value : '').toLowerCase();
  const sevFilter = document.getElementById('warnings-severity-filter') ? document.getElementById('warnings-severity-filter').value : '';

  let rows = state.skippedTests || [];

  if(filter){
    rows = rows.filter(r => [r.id, r.trackingNumber, r.customer, r.site, r.skippedBy, r.reason, r.skippedAge].join(' ').toLowerCase().includes(filter));
  }
  if(sevFilter){
    rows = rows.filter(r => r.severity === sevFilter);
  }

  const tbody = document.querySelector('#warnings-table tbody');
  if(!tbody) return;

  if(!rows.length){
    tbody.innerHTML = `<tr><td colspan="8"><div class="empty-state"><div class="ic">&#10003;</div>No skipped tests or compliance warnings recorded.</div></td></tr>`;
    return;
  }

  tbody.innerHTML = rows.map(r => {
    const riskBadge = r.severity === 'HIGH' 
      ? '<span class="badge badge-red">⚠️ HIGH RISK (28d)</span>' 
      : '<span class="badge badge-amber">MODERATE</span>';

    return `
      <tr>
        <td class="mono">${r.id}</td>
        <td class="mono">${r.formattedTime || fmtDateTime(r.timestamp)}</td>
        <td><a href="#" onclick="jumpToRecall('${r.trackingNumber}'); return false;" class="tn-link">${r.trackingNumber}</a></td>
        <td><strong>${escapeHtml(r.customer)}</strong> (${escapeHtml(r.site)})</td>
        <td><span class="badge badge-blue">${r.skippedAge}</span></td>
        <td>${riskBadge}</td>
        <td style="font-weight:600;color:var(--slate-deep);">${escapeHtml(r.skippedBy)}</td>
        <td style="white-space:normal;max-width:320px;line-height:1.4;">${escapeHtml(r.reason)}</td>
      </tr>
    `;
  }).join('');
}

function confirmClearWarnings(){
  if(!isAdmin()){
    toast("Access Denied: Clearing warning logs is restricted to Admin user only.");
    return;
  }
  showModal(
    "Clear Warning Alerts Log",
    "Are you sure you want to clear all skipped test warning alerts? This will clear the compliance log from local storage.",
    ()=>{
      state.skippedTests = [];
      saveState();
      renderWarnings();
      applyRoleRestrictions();
      toast("Warning Alerts log cleared.");
    }
  );
}

/* =========================================================================
   STEP 2 & STEP 3: ENGINEERING INTERPRETATION ANALYTICAL CHARTS MODULE
   BS EN 12390 Quality Control Analysis (Chart.js 4.x Compatible)
   ========================================================================= */

// Global registry for active chart instances (Lifecycle & Destroy control)
const engineeringChartInstances = {};

/**
 * Destroys an existing Chart.js instance on a canvas if present.
 * Prevents hover-flickering and canvas re-use errors.
 * @param {string} canvasId - HTML element ID of the canvas
 */
function destroyEngineeringChart(canvasId) {
  if (engineeringChartInstances[canvasId]) {
    try {
      engineeringChartInstances[canvasId].destroy();
    } catch (err) {
      console.warn(`[Chart Safeguard] Error destroying chart ${canvasId}:`, err);
    }
    delete engineeringChartInstances[canvasId];
  }
}

/**
 * Displays a graceful fallback placeholder within the canvas parent container
 * when data is empty, null, or insufficient to render a chart.
 * @param {string} canvasId - HTML element ID of the canvas
 * @param {string} message - User-friendly message explaining data status
 */
function showChartPlaceholder(canvasId, message) {
  destroyEngineeringChart(canvasId);
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;
  const parent = canvas.parentElement;
  if (!parent) return;

  canvas.style.display = 'none';
  let placeholder = parent.querySelector('.chart-placeholder');
  if (!placeholder) {
    placeholder = document.createElement('div');
    placeholder.className = 'chart-placeholder';
    placeholder.style.cssText = 'display:flex; align-items:center; justify-content:center; height:100%; width:100%; color:var(--ink-soft); font-size:13px; font-style:italic; background:var(--surface-sunk); border-radius:var(--radius-sm); padding:20px; text-align:center;';
    parent.appendChild(placeholder);
  }
  placeholder.innerHTML = `⚠️ ${message}`;
}

/**
 * Restores visibility of the canvas element and removes any active fallback placeholders.
 * @param {string} canvasId - HTML element ID of the canvas
 */
function clearChartPlaceholder(canvasId) {
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;
  canvas.style.display = 'block';
  const parent = canvas.parentElement;
  if (!parent) return;
  const placeholder = parent.querySelector('.chart-placeholder');
  if (placeholder) placeholder.remove();
}

/**
 * Core Filter Logic: Reads DOM inputs and filters raw dataset
 */
function applyGlobalFilters(rawData) {
  const startVal = document.getElementById('dash-start') ? document.getElementById('dash-start').value : '';
  const endVal = document.getElementById('dash-end') ? document.getElementById('dash-end').value : '';
  const gradeVal = document.getElementById('dash-grade') ? document.getElementById('dash-grade').value : '';
  const custVal = document.getElementById('dash-customer') ? document.getElementById('dash-customer').value.trim().toLowerCase() : '';

  let filteredMaster = rawData.master || [];
  if (startVal) filteredMaster = filteredMaster.filter(m => m && m.castingDate >= startVal);
  if (endVal) filteredMaster = filteredMaster.filter(m => m && m.castingDate <= endVal);
  if (gradeVal) filteredMaster = filteredMaster.filter(m => m && m.grade === gradeVal);
  if (custVal) filteredMaster = filteredMaster.filter(m => m && (m.customer || '').toLowerCase().includes(custVal));

  const filteredTNs = new Set(filteredMaster.map(m => m ? m.trackingNumber : null).filter(Boolean));
  const filteredTests = (rawData.tests || []).filter(t => t && filteredTNs.has(t.trackingNumber));

  return { filteredMaster, filteredTests };
}

/**
 * Triggered by the "Apply Filters" button. Coordinates data fetching, filtering, and UI updates.
 */
async function handleApplyFilters() {
  try {
    let masterData = window.state && Array.isArray(window.state.master) ? window.state.master : [];
    let testData = window.state && Array.isArray(window.state.tests) ? window.state.tests : [];

    if (window.loadStateFromFirebase && typeof window.loadStateFromFirebase === 'function') {
      try {
        const cloudData = await window.loadStateFromFirebase();
        if (cloudData && typeof cloudData === 'object') {
          masterData = Array.isArray(cloudData.master) ? cloudData.master : masterData;
          testData = Array.isArray(cloudData.tests) ? cloudData.tests : testData;
        }
      } catch (fbErr) {
        console.warn("⚠️ Firebase cloud fetch error during apply filters:", fbErr);
      }
    }

    const { filteredMaster, filteredTests } = applyGlobalFilters({ master: masterData, tests: testData });
    
    // Update KPI panels directly with filtered data
    if (typeof renderDashboardKPIs === 'function') {
      renderDashboardKPIs(filteredMaster, filteredTests);
    }
    
    // Update all charts via the new .update() orchestrator
    updateAllCharts(filteredMaster, filteredTests);
  } catch (err) {
    console.error("⚠️ Error handling apply filters:", err);
  }
}
window.handleApplyFilters = handleApplyFilters;

/**
 * Orchestrator to update all active Chart.js instances with newly filtered data.
 */
function updateAllCharts(filteredMaster, filteredTests) {
  renderChartCorrelation(filteredMaster, filteredTests);
  renderChartWeather(filteredMaster, filteredTests);
  renderChartSlump(filteredMaster, filteredTests);
  renderChartSiloPerformance(filteredMaster, filteredTests);
  renderChartTargetControl(filteredMaster, filteredTests);
  renderChartSlumpSensitivity(filteredMaster, filteredTests);
  renderChartHistogram(filteredMaster, filteredTests);
}

/**
 * CHART 1: 7-Day vs. 28-Day Predictive Correlation (Scatter Plot)
 * Matches 7-day and 28-day compressive strength readings for the same Tracking Number.
 */
function renderChartCorrelation(filteredMaster, filteredTests) {
  const canvasId = 'chart-correlation';
  try {
    const tnMap = {};
    (filteredTests || []).forEach(t => {
      if (!t || !t.trackingNumber) return;
      const tn = t.trackingNumber;
      if (!tnMap[tn]) tnMap[tn] = { str7: [], str28: [] };
      
      // Strict numeric casting & validation
      const str = parseFloat(t.strength);
      if (isNaN(str) || str <= 0) return;

      if (t.testingAge === '7 Days') tnMap[tn].str7.push(str);
      if (t.testingAge === '28 Days') tnMap[tn].str28.push(str);
    });

    const scatterPoints = [];
    Object.keys(tnMap).forEach(tn => {
      const item = tnMap[tn];
      if (item.str7.length > 0 && item.str28.length > 0) {
        const avg7 = parseFloat((item.str7.reduce((a, b) => a + b, 0) / item.str7.length).toFixed(2));
        const avg28 = parseFloat((item.str28.reduce((a, b) => a + b, 0) / item.str28.length).toFixed(2));
        if (!isNaN(avg7) && !isNaN(avg28)) {
          scatterPoints.push({ x: avg7, y: avg28, trackingNumber: tn });
        }
      }
    });

    if (scatterPoints.length === 0) {
      destroyEngineeringChart(canvasId);
      showChartPlaceholder(canvasId, "Insufficient matched 7-Day & 28-Day test pairs available.");
      return;
    }

    clearChartPlaceholder(canvasId);
    
    if (engineeringChartInstances[canvasId]) {
      engineeringChartInstances[canvasId].data.datasets[0].data = scatterPoints;
      engineeringChartInstances[canvasId].update();
    } else {
      const ctx = document.getElementById(canvasId).getContext('2d');
      engineeringChartInstances[canvasId] = new Chart(ctx, {
        type: 'scatter',
        data: {
          datasets: [{
            label: '7d vs 28d Strength',
            data: scatterPoints,
            backgroundColor: '#eb1c24',
            borderColor: '#c9151c',
            pointRadius: 6,
            pointHoverRadius: 8
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { display: false },
            tooltip: {
              callbacks: {
                label: (ctx) => {
                  const pt = ctx.raw;
                  return ` ${pt.trackingNumber}: 7d=${pt.x} N/mm², 28d=${pt.y} N/mm²`;
                }
              }
            }
          },
          scales: {
            x: {
              title: { display: true, text: '7-Day Strength (N/mm²)', font: { size: 11, weight: 'bold' } }
            },
            y: {
              title: { display: true, text: '28-Day Strength (N/mm²)', font: { size: 11, weight: 'bold' } }
            }
          }
        }
      });
    }
  } catch (err) {
    console.error("Error rendering Chart 1 (Correlation):", err);
    showChartPlaceholder(canvasId, "Unable to render 7d vs 28d Correlation Chart: " + err.message);
  }
}

/**
 * CHART 2: Weather Impact Analysis (Bar Chart)
 * Groups 28-day mature test results by casting weather (Sunny, Cloudy, Rainy, etc.).
 */
function renderChartWeather(filteredMaster, filteredTests) {
  const canvasId = 'chart-weather';
  try {
    const masterWeatherMap = {};
    (filteredMaster || []).forEach(m => {
      if (m && m.trackingNumber) {
        masterWeatherMap[m.trackingNumber] = (m.weather || 'Unspecified').trim();
      }
    });

    const weatherGroups = {};
    (filteredTests || []).forEach(t => {
      if (!t || t.testingAge !== '28 Days') return;
      const str = parseFloat(t.strength);
      if (isNaN(str) || str <= 0) return;

      const weather = masterWeatherMap[t.trackingNumber] || 'Unspecified';
      if (!weatherGroups[weather]) weatherGroups[weather] = { sum: 0, count: 0 };
      weatherGroups[weather].sum += str;
      weatherGroups[weather].count += 1;
    });

    const categories = Object.keys(weatherGroups);
    if (categories.length === 0) {
      destroyEngineeringChart(canvasId);
      showChartPlaceholder(canvasId, "No 28-Day test data categorized by weather condition.");
      return;
    }

    const labels = categories;
    const dataValues = categories.map(c => parseFloat((weatherGroups[c].sum / weatherGroups[c].count).toFixed(2)));

    clearChartPlaceholder(canvasId);

    const bgColors = ['#f5b041', '#5d6d7e', '#2980b9', '#27ae60', '#8e44ad', '#eb1c24'];
    
    if (engineeringChartInstances[canvasId]) {
      engineeringChartInstances[canvasId].data.labels = labels;
      engineeringChartInstances[canvasId].data.datasets[0].data = dataValues;
      engineeringChartInstances[canvasId].data.datasets[0].backgroundColor = labels.map((_, i) => bgColors[i % bgColors.length]);
      engineeringChartInstances[canvasId].update();
    } else {
      const ctx = document.getElementById(canvasId).getContext('2d');
      engineeringChartInstances[canvasId] = new Chart(ctx, {
        type: 'bar',
        data: {
          labels: labels,
          datasets: [{
            label: 'Avg 28-Day Strength (N/mm²)',
            data: dataValues,
            backgroundColor: labels.map((_, i) => bgColors[i % bgColors.length]),
            borderRadius: 6
          }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          x: { title: { display: true, text: 'Casting Weather Condition', font: { size: 11, weight: 'bold' } } },
          y: { title: { display: true, text: 'Avg 28-Day Strength (N/mm²)', font: { size: 11, weight: 'bold' } }, beginAtZero: true }
        }
      }
    });
    }
  } catch (err) {
    console.error("Error rendering Chart 2 (Weather Impact):", err);
    showChartPlaceholder(canvasId, "Unable to render Weather Impact Chart: " + err.message);
  }
}

/**
 * CHART 3: Slump & Cement Efficiency (Line Chart)
 * Tracks ascending Slump (mm) workability vs. 28-Day Strength for a target concrete Grade.
 */
function renderChartSlump(filteredMaster, filteredTests) {
  const canvasId = 'chart-slump';
  try {
    const gradeCounts = {};
    (filteredMaster || []).forEach(m => {
      if (m && m.grade) gradeCounts[m.grade] = (gradeCounts[m.grade] || 0) + 1;
    });
    const sortedGrades = Object.entries(gradeCounts).sort((a, b) => b[1] - a[1]);
    const targetGrade = sortedGrades.length ? sortedGrades[0][0] : 'C25';

    const tnSlumpMap = {};
    (filteredMaster || []).forEach(m => {
      if (!m || m.grade !== targetGrade) return;
      const slumpVal = parseFloat(m.slump);
      if (!isNaN(slumpVal) && slumpVal > 0) {
        tnSlumpMap[m.trackingNumber] = slumpVal;
      }
    });

    const slumpGroups = {};
    (filteredTests || []).forEach(t => {
      if (!t || t.testingAge !== '28 Days') return;
      const slump = tnSlumpMap[t.trackingNumber];
      if (slump === undefined) return;
      const str = parseFloat(t.strength);
      if (isNaN(str) || str <= 0) return;

      if (!slumpGroups[slump]) slumpGroups[slump] = { sum: 0, count: 0 };
      slumpGroups[slump].sum += str;
      slumpGroups[slump].count += 1;
    });

    const sortedSlumps = Object.keys(slumpGroups).map(Number).sort((a, b) => a - b);

    if (sortedSlumps.length === 0) {
      destroyEngineeringChart(canvasId);
      showChartPlaceholder(canvasId, `Insufficient slump test data for grade ${targetGrade}.`);
      return;
    }

    const labels = sortedSlumps.map(s => `${s} mm`);
    const dataValues = sortedSlumps.map(s => parseFloat((slumpGroups[s].sum / slumpGroups[s].count).toFixed(2)));

    clearChartPlaceholder(canvasId);

    if (engineeringChartInstances[canvasId]) {
      engineeringChartInstances[canvasId].data.labels = labels;
      engineeringChartInstances[canvasId].data.datasets[0].data = dataValues;
      engineeringChartInstances[canvasId].data.datasets[0].label = `Avg 28d Strength — Grade ${targetGrade} (N/mm²)`;
      engineeringChartInstances[canvasId].options.scales.x.title.text = `Slump Workability (mm) — Target Grade ${targetGrade}`;
      engineeringChartInstances[canvasId].update();
    } else {
      const ctx = document.getElementById(canvasId).getContext('2d');
      engineeringChartInstances[canvasId] = new Chart(ctx, {
        type: 'line',
        data: {
          labels: labels,
          datasets: [{
            label: `Avg 28d Strength — Grade ${targetGrade} (N/mm²)`,
            data: dataValues,
            borderColor: '#1668b3',
            backgroundColor: 'rgba(22, 104, 179, 0.1)',
            fill: true,
            tension: 0.3,
            pointRadius: 5,
            pointHoverRadius: 7
          }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          x: { title: { display: true, text: `Slump Workability (mm) — Target Grade ${targetGrade}`, font: { size: 11, weight: 'bold' } } },
          y: { title: { display: true, text: 'Avg 28-Day Strength (N/mm²)', font: { size: 11, weight: 'bold' } } }
        }
      }
    });
    }
  } catch (err) {
    console.error("Error rendering Chart 3 (Slump Efficiency):", err);
    showChartPlaceholder(canvasId, "Unable to render Slump & Efficiency Chart: " + err.message);
  }
}

/**
 * CHART 4: Bulk / Silo Performance Comparison (Bar Chart)
 * Compares average 28-day strength across different silos and bulks for a specific grade.
 */
function renderChartSiloPerformance(filteredMaster, filteredTests) {
  const canvasId = 'chart-silo-performance';
  try {
    const targetGrade = document.getElementById('dash-filter-grade') ? document.getElementById('dash-filter-grade').value : '';
    if (!targetGrade) {
      showChartPlaceholder(canvasId, "Please select a specific Concrete Grade (e.g., C25) from the filters above to view Silo/Bulk performance.");
      return;
    }

    // Map TN to Silo and Bulk
    const tnMap = {};
    (filteredMaster || []).forEach(m => {
      if (m.trackingNumber) {
        tnMap[m.trackingNumber] = {
          silo: m.cementSilo || 'Unknown Silo',
          bulk: m.bulkNumber || 'Unknown Bulk'
        };
      }
    });

    // Group 28-Day strengths by Silo + Bulk
    const groups = {};
    (filteredTests || []).forEach(t => {
      if (!t || t.testingAge !== '28 Days') return;
      const str = parseFloat(t.strength);
      if (isNaN(str) || str <= 0) return;
      
      const masterData = tnMap[t.trackingNumber];
      if (!masterData) return;

      const groupKey = `${masterData.silo} ${masterData.bulk && masterData.bulk !== 'Unknown Bulk' ? '(' + masterData.bulk + ')' : ''}`.trim();
      
      if (!groups[groupKey]) groups[groupKey] = { sum: 0, count: 0 };
      groups[groupKey].sum += str;
      groups[groupKey].count += 1;
    });

    const labels = Object.keys(groups).sort();
    if (labels.length === 0) {
      destroyEngineeringChart(canvasId);
      showChartPlaceholder(canvasId, `No 28-Day test data available for grade ${targetGrade} to compare silos/bulks.`);
      return;
    }

    const dataValues = labels.map(label => parseFloat((groups[label].sum / groups[label].count).toFixed(2)));

    clearChartPlaceholder(canvasId);

    if (engineeringChartInstances[canvasId]) {
      engineeringChartInstances[canvasId].data.labels = labels;
      engineeringChartInstances[canvasId].data.datasets[0].data = dataValues;
      engineeringChartInstances[canvasId].update();
    } else {
      const ctx = document.getElementById(canvasId).getContext('2d');
      engineeringChartInstances[canvasId] = new Chart(ctx, {
        type: 'bar',
        data: {
          labels: labels,
          datasets: [{
            label: 'Avg 28-Day Strength (N/mm²)',
            data: dataValues,
            backgroundColor: '#4B6B61',
            borderColor: '#1E2A28',
            borderWidth: 1,
            borderRadius: 4
          }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false }
        },
        scales: {
          x: { title: { display: true, text: 'Cement Silo (Bulk Consignment)', font: { size: 11, weight: 'bold' } } },
          y: { title: { display: true, text: 'Avg 28-Day Strength (N/mm²)', font: { size: 11, weight: 'bold' } }, beginAtZero: false }
        }
      }
    });
    }
  } catch (err) {
    console.error("Error rendering Chart (Silo Performance):", err);
    showChartPlaceholder(canvasId, "Unable to render Silo/Bulk Performance Chart: " + err.message);
  }
}

/**
 * CHART 6: Slump vs. Strength Sensitivity (Scatter Plot with Regression Trendline)
 * Analyzes how slump increases affect final compressive strength for a specific grade.
 */
function renderChartSlumpSensitivity(filteredMaster, filteredTests) {
  const canvasId = 'chart-slump-sensitivity';
  try {
    const targetGrade = document.getElementById('dash-filter-grade') ? document.getElementById('dash-filter-grade').value : '';
    if (!targetGrade) {
      showChartPlaceholder(canvasId, "Please select a specific Concrete Grade (e.g., C25) from the filters to analyze slump sensitivity.");
      return;
    }

    const tnSlumpMap = {};
    (filteredMaster || []).forEach(m => {
      if (m.trackingNumber && m.slump) {
        const slumpVal = parseFloat(m.slump);
        if (!isNaN(slumpVal) && slumpVal > 0) {
          tnSlumpMap[m.trackingNumber] = slumpVal;
        }
      }
    });

    const scatterPoints = [];
    (filteredTests || []).forEach(t => {
      if (!t || t.testingAge !== '28 Days') return;
      const str = parseFloat(t.strength);
      if (isNaN(str) || str <= 0) return;
      
      const slumpX = tnSlumpMap[t.trackingNumber];
      if (slumpX !== undefined) {
        scatterPoints.push({ x: slumpX, y: str, trackingNumber: t.trackingNumber });
      }
    });

    if (scatterPoints.length < 2) {
      destroyEngineeringChart(canvasId);
      showChartPlaceholder(canvasId, `Insufficient paired slump/strength data for grade ${targetGrade} to generate a sensitivity correlation.`);
      return;
    }

    // Calculate Linear Regression for Trendline
    let sumX = 0, sumY = 0, sumXY = 0, sumXX = 0;
    const n = scatterPoints.length;
    scatterPoints.forEach(p => {
      sumX += p.x;
      sumY += p.y;
      sumXY += p.x * p.y;
      sumXX += p.x * p.x;
    });
    
    // Protect against perfectly vertical lines (divide by zero)
    const denominator = (n * sumXX - sumX * sumX);
    if (denominator === 0) {
      destroyEngineeringChart(canvasId);
      showChartPlaceholder(canvasId, `Data lacks variation in slump to plot a trendline.`);
      return;
    }
    
    const slope = (n * sumXY - sumX * sumY) / denominator;
    const intercept = (sumY - slope * sumX) / n;

    const minX = Math.min(...scatterPoints.map(p => p.x));
    const maxX = Math.max(...scatterPoints.map(p => p.x));
    
    // Add some padding to trendline extending slightly past min and max points
    const trendMinX = Math.max(0, minX - 10);
    const trendMaxX = maxX + 10;
    const trendPoints = [
      { x: trendMinX, y: slope * trendMinX + intercept },
      { x: trendMaxX, y: slope * trendMaxX + intercept }
    ];

    clearChartPlaceholder(canvasId);

    if (engineeringChartInstances[canvasId]) {
      engineeringChartInstances[canvasId].data.datasets[0].data = scatterPoints;
      engineeringChartInstances[canvasId].data.datasets[1].data = trendPoints;
      
      // Update dynamic tooltip logic directly on the chart instance
      engineeringChartInstances[canvasId].options.plugins.tooltip.callbacks.label = (ctx) => {
        if (ctx.datasetIndex === 1) return `Trendline: y = ${slope.toFixed(2)}x + ${intercept.toFixed(2)}`;
        const pt = ctx.raw;
        return ` ${pt.trackingNumber}: Slump ${pt.x}mm, Str ${pt.y} N/mm²`;
      };
      
      engineeringChartInstances[canvasId].update();
    } else {
      const ctx = document.getElementById(canvasId).getContext('2d');
      engineeringChartInstances[canvasId] = new Chart(ctx, {
        type: 'scatter',
        data: {
          datasets: [
            {
              label: '28-Day Strength (N/mm²)',
              data: scatterPoints,
              backgroundColor: 'rgba(54, 162, 235, 0.7)',
              borderColor: 'rgba(54, 162, 235, 1)',
              pointRadius: 5,
              pointHoverRadius: 7,
              order: 2
            },
            {
              label: 'Sensitivity Trendline',
              data: trendPoints,
              type: 'line',
              showLine: true,
              borderColor: '#eb1c24',
              borderWidth: 2,
              borderDash: [5, 5],
              pointRadius: 0,
              fill: false,
              order: 1
            }
          ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: true },
          tooltip: {
            callbacks: {
              label: (ctx) => {
                if (ctx.datasetIndex === 1) return `Trendline: y = ${slope.toFixed(2)}x + ${intercept.toFixed(2)}`;
                const pt = ctx.raw;
                return ` ${pt.trackingNumber}: Slump ${pt.x}mm, Str ${pt.y} N/mm²`;
              }
            }
          }
        },
        scales: {
          x: { title: { display: true, text: `Slump Workability (mm)`, font: { size: 11, weight: 'bold' } } },
          y: { title: { display: true, text: '28-Day Strength (N/mm²)', font: { size: 11, weight: 'bold' } } }
        }
      }
    });
    }
  } catch (err) {
    console.error("Error rendering Chart (Slump Sensitivity):", err);
    showChartPlaceholder(canvasId, "Unable to render Slump Sensitivity Chart: " + err.message);
  }
}

/**
 * CHART 5: Target Strength Control (Line Chart with Baseline)
 * Plots chronological 28-day strengths against Characteristic Target Strength fck baseline.
 */
function renderChartTargetControl(filteredMaster, filteredTests) {
  const canvasId = 'chart-target-control';
  try {
    const matureTests = [];
    (filteredTests || []).forEach(t => {
      if (!t || t.testingAge !== '28 Days') return;
      const str = parseFloat(t.strength);
      if (isNaN(str) || str <= 0) return;

      const grade = t.grade || 'C25';
      const fck = window.gradeTarget ? (window.gradeTarget(grade) || parseFloat(grade.replace(/\D/g, '')) || 25) : 25;

      matureTests.push({
        date: t.testingDate || '',
        testId: t.testId || t.trackingNumber,
        strength: str,
        grade: grade,
        fck: fck
      });
    });

    matureTests.sort((a, b) => new Date(a.date) - new Date(b.date));
    const recentMature = matureTests.slice(-30);

    if (recentMature.length === 0) {
      destroyEngineeringChart(canvasId);
      showChartPlaceholder(canvasId, "No 28-day mature test results available for Target Control analysis.");
      return;
    }

    const labels = recentMature.map(t => `${t.testId} (${t.grade})`);
    const actualStrengths = recentMature.map(t => t.strength);
    const targetBaselines = recentMature.map(t => t.fck);

    clearChartPlaceholder(canvasId);

    if (engineeringChartInstances[canvasId]) {
      engineeringChartInstances[canvasId].data.labels = labels;
      engineeringChartInstances[canvasId].data.datasets[0].data = actualStrengths;
      engineeringChartInstances[canvasId].data.datasets[1].data = targetBaselines;
      engineeringChartInstances[canvasId].update();
    } else {
      const ctx = document.getElementById(canvasId).getContext('2d');
      engineeringChartInstances[canvasId] = new Chart(ctx, {
        type: 'line',
        data: {
          labels: labels,
          datasets: [
            {
              label: 'Actual 28d Strength (N/mm²)',
              data: actualStrengths,
              borderColor: '#1e7e34',
              backgroundColor: 'rgba(30, 126, 52, 0.1)',
              fill: true,
              tension: 0.2,
              pointRadius: 5,
              pointHoverRadius: 7
            },
            {
              label: 'Target Characteristic Strength fck (Baseline)',
              data: targetBaselines,
              borderColor: '#eb1c24',
              borderWidth: 2,
              borderDash: [5, 5],
              pointRadius: 0,
              fill: false
            }
          ]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            tooltip: {
              callbacks: {
                label: (ctx) => {
                  const idx = ctx.dataIndex;
                  const item = recentMature[idx];
                  if (ctx.datasetIndex === 0 && item) {
                    const margin = (item.strength - item.fck).toFixed(2);
                    const prefix = margin >= 0 ? '+' : '';
                    return ` Actual: ${item.strength} N/mm² (Safety Margin: ${prefix}${margin} N/mm²)`;
                  }
                  return ` Target fck (${item.grade}): ${item.fck} N/mm²`;
                }
              }
            }
          },
          scales: {
            x: { title: { display: true, text: '28-Day Tests (Chronological Order)', font: { size: 11, weight: 'bold' } } },
            y: { title: { display: true, text: 'Compressive Strength (N/mm²)', font: { size: 11, weight: 'bold' } }, beginAtZero: false }
          }
        }
      });
    }
  } catch (err) {
    console.error("Error rendering Chart 5 (Target Control):", err);
    showChartPlaceholder(canvasId, "Unable to render Target Control Chart: " + err.message);
  }
}

/**
 * CHART 7: Statistical Distribution (Histogram)
 * Groups 28-day strength results into 2.0 N/mm² bins to visualize standard deviation.
 */
function renderChartHistogram(filteredMaster, filteredTests) {
  const canvasId = 'chart-histogram';
  try {
    const matureStrengths = [];
    (filteredTests || []).forEach(t => {
      if (!t || t.testingAge !== '28 Days') return;
      const str = parseFloat(t.strength);
      if (!isNaN(str) && str > 0) matureStrengths.push(str);
    });

    if (matureStrengths.length < 3) {
      destroyEngineeringChart(canvasId);
      showChartPlaceholder(canvasId, "Insufficient 28-day data points to generate a statistical distribution histogram.");
      return;
    }

    const minStr = Math.floor(Math.min(...matureStrengths) / 2) * 2;
    const maxStr = Math.ceil(Math.max(...matureStrengths) / 2) * 2;
    const binSize = 2.0;
    const bins = {};
    
    for (let i = minStr; i <= maxStr; i += binSize) {
      bins[`${i.toFixed(1)}-${(i + binSize).toFixed(1)}`] = 0;
    }

    matureStrengths.forEach(str => {
      const binStart = Math.floor(str / binSize) * binSize;
      const key = `${binStart.toFixed(1)}-${(binStart + binSize).toFixed(1)}`;
      if (bins[key] !== undefined) {
        bins[key]++;
      }
    });

    const labels = Object.keys(bins);
    const dataValues = Object.values(bins);

    clearChartPlaceholder(canvasId);

    if (engineeringChartInstances[canvasId]) {
      engineeringChartInstances[canvasId].data.labels = labels;
      engineeringChartInstances[canvasId].data.datasets[0].data = dataValues;
      engineeringChartInstances[canvasId].update();
    } else {
      const ctx = document.getElementById(canvasId).getContext('2d');
      engineeringChartInstances[canvasId] = new Chart(ctx, {
        type: 'bar',
        data: {
          labels: labels,
          datasets: [{
            label: 'Frequency (Count)',
            data: dataValues,
            backgroundColor: 'rgba(54, 162, 235, 0.6)',
            borderColor: 'rgba(54, 162, 235, 1)',
            borderWidth: 1,
            borderRadius: 2
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { display: false }
          },
          scales: {
            x: { 
              title: { display: true, text: '28-Day Compressive Strength Range (N/mm²)', font: { size: 11, weight: 'bold' } }
            },
            y: { 
              title: { display: true, text: 'Frequency', font: { size: 11, weight: 'bold' } },
              beginAtZero: true,
              ticks: { stepSize: 1 }
            }
          }
        }
      });
    }
  } catch (err) {
    console.error("Error rendering Chart 7 (Histogram):", err);
    showChartPlaceholder(canvasId, "Unable to render Histogram Chart: " + err.message);
  }
}

/* ---------------------- INIT ---------------------- */
document.getElementById('f-castingDate').valueAsDate = new Date();
