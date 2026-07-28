/**
 * Frontend User Management Module - APURA RMC QC Platform
 * js/userManagement.js
 *
 * Handles calling the Firebase Cloud Function to create staff accounts
 * WITHOUT disrupting the admin's current session.
 *
 * PREREQUISITES in index.html <script type="module">:
 *   import { getFunctions, httpsCallable } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-functions.js";
 *   window.appFunctions = getFunctions(app, "us-central1"); // expose to global scope
 */

/**
 * submitNewUserForm
 *
 * Called by the "Create User" button in the User Management tab.
 * Validates inputs, invokes the Cloud Function, and handles all UI states.
 *
 * @param {string} email    - New staff email (from form input)
 * @param {string} password - New staff password (from form input)
 * @param {string} role     - Role to assign: "qc_tech" | "company_admin" | "viewer"
 * @param {string} username - Display name for the new account
 */
async function submitNewUserForm(email, password, role, username) {

  // ─── UI Elements ────────────────────────────────────────────────────────────
  const submitBtn  = document.getElementById('create-user-btn');
  const statusMsg  = document.getElementById('create-user-status');
  const spinner    = document.getElementById('create-user-spinner');

  // ─── Client-Side Validation ─────────────────────────────────────────────────
  if (!email || !password || !role) {
    _setUserFormStatus('error', 'Email, password, and role are all required.');
    return;
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    _setUserFormStatus('error', 'Please enter a valid email address.');
    return;
  }

  if (password.length < 8) {
    _setUserFormStatus('error', 'Password must be at least 8 characters long.');
    return;
  }

  // ─── Loading State ──────────────────────────────────────────────────────────
  if (submitBtn)  { submitBtn.disabled = true; submitBtn.textContent = 'Creating...'; }
  if (spinner)    { spinner.style.display = 'inline-block'; }
  if (statusMsg)  { statusMsg.textContent = ''; statusMsg.className = ''; }

  try {
    // ─── Check Cloud Functions are available ──────────────────────────────────
    if (!window.appFunctions) {
      throw new Error("Firebase Functions not initialized. Ensure appFunctions is set up in the module script.");
    }

    // ─── Invoke Cloud Function ────────────────────────────────────────────────
    const createStaffAccount = httpsCallable(window.appFunctions, 'createStaffAccount');

    const result = await createStaffAccount({
      email:    email.trim().toLowerCase(),
      password: password,
      role:     role,
      username: username || email.split('@')[0],
    });

    // ─── Success State ────────────────────────────────────────────────────────
    const { message, uid, companyId } = result.data;

    _setUserFormStatus(
      'success',
      `✅ ${message} (UID: ${uid.substring(0, 8)}…, Company: ${companyId})`
    );

    // Log locally to the activity feed if the function exists
    if (typeof logActivity === 'function') {
      logActivity(
        "User Created",
        "—",
        window.currentUser?.username || "Admin",
        `Created new Firebase Auth account for ${email} with role: ${role}`
      );
    }

    // Clear the form fields on success
    _clearUserForm();

    // Refresh the users list if a render function exists
    if (typeof renderUsersView === 'function') {
      setTimeout(renderUsersView, 500);
    }

  } catch (error) {
    // ─── Error State ──────────────────────────────────────────────────────────
    let userMessage = 'An unexpected error occurred. Please try again.';

    // Firebase HttpsError codes from the Cloud Function
    switch (error.code) {
      case 'functions/unauthenticated':
        userMessage = '🔒 Session expired. Please log in again before creating accounts.';
        break;
      case 'functions/permission-denied':
        userMessage = '🚫 Access Denied: Only Company Admins can create new staff accounts.';
        break;
      case 'functions/already-exists':
        userMessage = `⚠️ An account with email "${email}" already exists in the system.`;
        break;
      case 'functions/invalid-argument':
        userMessage = `❌ Validation Error: ${error.message}`;
        break;
      case 'functions/not-found':
        userMessage = '❌ Admin profile not found. Contact system support.';
        break;
      case 'functions/internal':
        userMessage = `❌ Server Error: ${error.message}`;
        break;
      default:
        userMessage = `❌ Error: ${error.message || error.code}`;
    }

    _setUserFormStatus('error', userMessage);
    console.error('[submitNewUserForm] Cloud Function error:', error);
  } finally {
    // ─── Restore UI ───────────────────────────────────────────────────────────
    if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = 'Create Account'; }
    if (spinner)   { spinner.style.display = 'none'; }
  }
}

/**
 * Helper: Display a status message in the form
 * @param {'success'|'error'} type
 * @param {string} message
 */
function _setUserFormStatus(type, message) {
  const statusEl = document.getElementById('create-user-status');
  if (!statusEl) return;
  statusEl.textContent = message;
  statusEl.className = type === 'success' ? 'form-status success' : 'form-status error';
  statusEl.style.display = 'block';
}

/**
 * Helper: Clear the create user form inputs
 */
function _clearUserForm() {
  ['create-user-email', 'create-user-password', 'create-user-username'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
  const roleEl = document.getElementById('create-user-role');
  if (roleEl) roleEl.value = 'qc_tech';
}

// Expose to global scope for use with inline onclick handlers
window.submitNewUserForm = submitNewUserForm;
