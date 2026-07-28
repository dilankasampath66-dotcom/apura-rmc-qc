window.migrateLegacyDataToMultiTenant = async function() {
  console.log("Starting legacy data migration to multi-tenant...");
  
  try {
    // 1. Ensure state is loaded from the single-document architecture
    if (!window.state) {
      console.error("Migration Failed: Global window.state is undefined. Ensure the app is loaded and logged in.");
      return;
    }

    const targetCompanyId = "APURA_RMC";
    let totalUpdated = 0;

    // Helper to process arrays
    const processArray = (arr, name) => {
      if (!Array.isArray(arr)) return 0;
      let count = 0;
      arr.forEach(item => {
        if (item.companyId !== targetCompanyId) {
          item.companyId = targetCompanyId;
          count++;
          totalUpdated++;
        }
      });
      console.log(`Updated ${count}/${arr.length} records in [${name}] array.`);
      return count;
    };

    // 2. Process each data array within the single-state JSON blob
    console.log("Processing Casting Records (master)...");
    processArray(window.state.master, "Casting Records");

    console.log("Processing Test Results (tests)...");
    processArray(window.state.tests, "Test Results");

    console.log("Processing Users (users)...");
    processArray(window.state.users, "Users");
    
    console.log("Processing Activities (activities)...");
    processArray(window.state.activities, "Activities");
    
    console.log("Processing Skipped Tests (skippedTests)...");
    processArray(window.state.skippedTests, "Skipped Tests");

    // 3. Save back to Firebase using your existing module bridge
    if (totalUpdated > 0) {
      console.log(`Pushing ${totalUpdated} modified records to Firebase Cloud Firestore via single-state document...`);
      const success = await window.saveStateToFirebase(window.state);
      
      if (success) {
        console.log(`✅ Migration Complete! Successfully migrated ${totalUpdated} total records to companyId: "${targetCompanyId}".`);
      } else {
        console.error("❌ Migration Failed: Firebase save operation was unsuccessful. Check network connection.");
      }
    } else {
      console.log("✅ Migration Complete! No records required updating (all already contain companyId).");
    }

  } catch (error) {
    console.error("❌ Migration Failed: An unexpected error occurred.", error);
  }
};
