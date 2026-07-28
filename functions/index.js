/**
 * Firebase Cloud Functions - APURA RMC QC Platform
 * functions/index.js
 *
 * SETUP INSTRUCTIONS:
 * 1. cd functions/
 * 2. npm install firebase-admin firebase-functions
 * 3. firebase deploy --only functions
 */

const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { initializeApp } = require("firebase-admin/app");
const { getAuth } = require("firebase-admin/auth");
const { getFirestore } = require("firebase-admin/firestore");

// Initialize Firebase Admin SDK (auto-uses service account in Cloud Functions env)
initializeApp();

const db = getFirestore();
const auth = getAuth();

/**
 * Callable Cloud Function: createStaffAccount
 *
 * Creates a new Firebase Auth user and Firestore profile for a QC staff member.
 * Must be called by an authenticated user with the "company_admin" role.
 *
 * @param {object} data
 * @param {string} data.email    - New staff member's email address
 * @param {string} data.password - New staff member's initial password (min 8 chars)
 * @param {string} data.role     - Role to assign: "qc_tech" | "company_admin" | "viewer"
 * @param {string} data.username - Display username for the new account
 */
exports.createStaffAccount = onCall(
  { region: "us-central1" }, // Change to your preferred region (e.g., "asia-south1")
  async (request) => {

    // ─── STEP 1: Authentication Guard ─────────────────────────────────────────
    if (!request.auth) {
      throw new HttpsError(
        "unauthenticated",
        "You must be logged in to perform this action."
      );
    }

    const callerUid = request.auth.uid;

    // ─── STEP 2: Verify Caller is a Company Admin ──────────────────────────────
    const callerDoc = await db.collection("Users").doc(callerUid).get();

    if (!callerDoc.exists) {
      throw new HttpsError(
        "not-found",
        "Your admin profile could not be found in the database."
      );
    }

    const callerData = callerDoc.data();

    if (callerData.role !== "company_admin") {
      throw new HttpsError(
        "permission-denied",
        "Only Company Admins are authorized to create new staff accounts."
      );
    }

    // Inherit companyId from admin - enforces multi-tenant data isolation
    const callerCompanyId = callerData.companyId;

    if (!callerCompanyId) {
      throw new HttpsError(
        "failed-precondition",
        "Admin profile is missing companyId. Contact system support."
      );
    }

    // ─── STEP 3: Validate Input ───────────────────────────────────────────────
    const { email, password, role, username } = request.data;

    if (!email || !password || !role) {
      throw new HttpsError("invalid-argument", "Email, password, and role are required.");
    }

    if (password.length < 8) {
      throw new HttpsError("invalid-argument", "Password must be at least 8 characters.");
    }

    const allowedRoles = ["qc_tech", "company_admin", "viewer"];
    if (!allowedRoles.includes(role)) {
      throw new HttpsError("invalid-argument", `Invalid role. Allowed: ${allowedRoles.join(", ")}`);
    }

    // ─── STEP 4: Create Firebase Auth User (no session disruption) ─────────────
    let newAuthUser;
    try {
      newAuthUser = await auth.createUser({
        email: email.trim().toLowerCase(),
        password: password,
        displayName: username || email.split("@")[0],
        emailVerified: false,
        disabled: false,
      });
    } catch (authError) {
      if (authError.code === "auth/email-already-exists") {
        throw new HttpsError("already-exists", `An account with email "${email}" already exists.`);
      }
      if (authError.code === "auth/invalid-email") {
        throw new HttpsError("invalid-argument", "The email address is invalid.");
      }
      throw new HttpsError("internal", `Auth creation failed: ${authError.message}`);
    }

    // ─── STEP 5: Write Firestore User Profile (with companyId inheritance) ─────
    const newUserProfile = {
      uid: newAuthUser.uid,
      email: email.trim().toLowerCase(),
      username: username || email.split("@")[0],
      role: role,
      companyId: callerCompanyId,     // Tenant lock-in enforced here
      createdAt: new Date().toISOString(),
      createdByUid: callerUid,
      createdByEmail: callerData.email || "",
      isActive: true,
    };

    try {
      await db.collection("Users").doc(newAuthUser.uid).set(newUserProfile);
    } catch (dbError) {
      // Rollback Auth user if Firestore write fails to keep state consistent
      await auth.deleteUser(newAuthUser.uid);
      throw new HttpsError(
        "internal",
        `Profile write failed. Auth user rolled back. Error: ${dbError.message}`
      );
    }

    console.log(
      `[createStaffAccount] Admin ${callerData.email} created ${email} ` +
      `(role: ${role}) for companyId: ${callerCompanyId}`
    );

    // ─── STEP 6: Return Success ───────────────────────────────────────────────
    return {
      success: true,
      message: `Staff account successfully created for ${email}.`,
      uid: newAuthUser.uid,
      companyId: callerCompanyId,
    };
  }
);
