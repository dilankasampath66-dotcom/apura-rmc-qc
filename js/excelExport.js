// js/excelExport.js
/* =========================================================================
   TOKYO SUPERMIX / APURA RMC PLANT — EXCEL REPORTING ENGINE
   Generates Structured Excel (.xlsx) Workbooks using SheetJS CDN Integration
   ========================================================================= */

/**
 * Exports Master Database, Cube Test Records, CRM Sales Inquiries, and Activity Logs to an Excel workbook.
 * @param {Object} state - Application state
 */
export function exportFullExcelReport(state) {
  if (typeof XLSX === 'undefined') {
    window.toast?.('SheetJS Excel library is loading or unavailable.');
    return false;
  }

  const masterList = state?.master || [];
  const testList = state?.tests || [];
  const crmList = state?.crmVisits || [];
  const logList = state?.activities || [];

  if (!masterList.length && !testList.length && !crmList.length) {
    window.toast?.('No database records available to export.');
    return false;
  }

  // Sheet 1: Master Casting Database
  const masterRows = masterList.map((m, idx) => ({
    'No': idx + 1,
    'Tracking Number': m.trackingNumber,
    'Casting Date': m.castingDate,
    'Customer Name': m.customer || '—',
    'Supply Site': m.site || '—',
    'Weather': m.weather || '—',
    'Design Code': m.designCode,
    'Concrete Grade': m.grade,
    'Slump (mm)': m.slump,
    'Cement Content (kg/m3)': m.cementContent,
    'Volume (m3)': m.volume != null ? m.volume : '—',
    'Cement Silo': m.cementSilo,
    'Bulk Batch Number': m.bulkNumber,
    'Casted By': m.castedBy,
    'Number of Cubes': m.numCubes,
    'Active Test Intervals': (m.activeAges || []).join(', ')
  }));

  // Sheet 2: Cube Testing Records
  const testRows = testList.map((t, idx) => ({
    'No': idx + 1,
    'Test ID': t.testId,
    'Tracking Number': t.trackingNumber,
    'Testing Date': t.testingDate,
    'Testing Age': t.testingAge,
    'Tested By': t.testedBy,
    'Sample Weight (kg)': t.weight || 8.25,
    'Failure Load (kN)': t.load,
    'Cube Size (mm)': t.cubeSize || 150,
    'Compressive Strength (N/mm2)': t.strength,
    'Design Code': t.designCode,
    'Concrete Grade': t.grade
  }));

  // Sheet 3: Commercial CRM Sales Inquiries
  const crmRows = crmList.map((v, idx) => ({
    'No': idx + 1,
    'Inquiry ID': v.visitId,
    'Customer Name': v.customerName,
    'Site Location': v.siteLocation,
    'Contact Number': v.contactNumber,
    'Requested Grade': v.requestedGrade,
    'Estimated Volume (m3)': v.estimatedVolume,
    'Pump Required': v.pumpRequired ? 'Yes' : 'No',
    'Pump Rate (LKR)': v.pumpCarRate,
    'Pipeline Stage': v.stage,
    'Created Date': v.dateCreated
  }));

  // Sheet 4: Activity Log Audit Trail
  const logRows = logList.map((a, idx) => ({
    'No': idx + 1,
    'Log ID': a.id,
    'Timestamp': a.formattedTime || a.timestamp,
    'Action Type': a.actionType,
    'Tracking Number': a.trackingNumber || '—',
    'Operator / User': a.user,
    'Details': a.details
  }));

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(masterRows.length ? masterRows : [{ Note: 'No master entries' }]), 'Master Database');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(testRows.length ? testRows : [{ Note: 'No test entries' }]), 'Testing Records');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(crmRows.length ? crmRows : [{ Note: 'No CRM entries' }]), 'Commercial CRM');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(logRows.length ? logRows : [{ Note: 'No logs' }]), 'Activity Log');

  const filename = `Tokyo_Supermix_RMC_QC_Export_${new Date().toISOString().slice(0, 10)}.xlsx`;
  XLSX.writeFile(wb, filename);

  window.toast?.(`Exported Excel workbook: ${filename}`);
  return true;
}

// Expose onto window
window.exportFullExcelReport = exportFullExcelReport;
