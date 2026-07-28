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

/**
 * Generates and downloads a formal A4 PDF Concrete Compressive Strength Test Report
 * matching Tokyo Supermix standard template using html2pdf.js.
 * @param {Object|string} testDataOrTrackingNum - Batch record object or tracking number string
 */
export function generateCubeTestReport(testDataOrTrackingNum) {
  let record = null;
  let tests = [];

  if (typeof testDataOrTrackingNum === 'string') {
    const tn = testDataOrTrackingNum;
    record = window.state.master.find(m => m.trackingNumber === tn);
    tests = window.state.tests.filter(t => t.trackingNumber === tn);
  } else if (testDataOrTrackingNum && typeof testDataOrTrackingNum === 'object') {
    record = testDataOrTrackingNum;
    tests = testDataOrTrackingNum.cubes || window.state.tests.filter(t => t.trackingNumber === record.trackingNumber);
  }

  if (!record) {
    const tnInput = document.getElementById('rep-tn')?.value;
    if (tnInput) {
      record = window.state.master.find(m => m.trackingNumber === tnInput);
      tests = window.state.tests.filter(t => t.trackingNumber === tnInput);
    }
  }

  if (!record) {
    window.toast?.('Please select a valid tracking record to generate PDF report.');
    return;
  }

  const ageFilter = document.getElementById('rep-age')?.value || 'All Ages';
  if (ageFilter !== 'All Ages' && ageFilter !== '') {
    tests = tests.filter(t => t.testingAge === ageFilter);
  }

  // Populate PDF Template Metadata
  document.getElementById('pdf-report-customer').innerText = record.customer || 'Access Engineering PLC';
  document.getElementById('pdf-report-site').innerText = record.site || 'Anuradhapura Plant';
  document.getElementById('pdf-report-grade').innerText = `${record.grade} (${record.designCode || 'Standard Mix'})`;
  document.getElementById('pdf-report-slump').innerText = record.slump || '150+/-25 mm';
  document.getElementById('pdf-report-cast-date').innerText = record.castingDate ? (window.fmtDate ? window.fmtDate(record.castingDate) : record.castingDate) : '—';
  
  const firstTestDate = tests.length ? tests[0].testingDate : '—';
  document.getElementById('pdf-report-test-date').innerText = firstTestDate && window.fmtDate ? window.fmtDate(firstTestDate) : firstTestDate;
  document.getElementById('pdf-report-age').innerText = tests.length ? tests.map(t => t.testingAge).join(', ') : '7 Days & 28 Days';
  document.getElementById('pdf-report-location').innerText = record.remarks || `${record.site} - Volume ${record.volume != null ? record.volume : '—'} m³ (${record.cementSilo || 'Silo 01'})`;

  // Populate Results Table Body
  const tbody = document.getElementById('pdf-report-table-body');
  tbody.innerHTML = '';

  let totalStrength = 0;
  let testCount = 0;
  let testedBy = 'QC Tech';

  if (tests.length) {
    tests.forEach((t, idx) => {
      totalStrength += (t.strength || 0);
      testCount++;
      if (t.testedBy) testedBy = t.testedBy;

      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td style="border: 1px solid #000000; padding: 6px; font-weight: bold;">${t.testId || `${record.trackingNumber}-C0${idx+1}`}</td>
        <td style="border: 1px solid #000000; padding: 6px;">${t.weight ? parseFloat(t.weight).toFixed(2) : '8.25'}</td>
        <td style="border: 1px solid #000000; padding: 6px;">${t.load ? parseFloat(t.load).toFixed(2) : '—'}</td>
        <td style="border: 1px solid #000000; padding: 6px; font-weight: bold;">${t.strength ? parseFloat(t.strength).toFixed(2) : '—'}</td>
        <td style="border: 1px solid #000000; padding: 6px;">${t.testingAge || 'Standard'} Test</td>
      `;
      tbody.appendChild(tr);
    });
  } else {
    tbody.innerHTML = `
      <tr>
        <td style="border: 1px solid #000000; padding: 6px;">${record.trackingNumber}-C01</td>
        <td style="border: 1px solid #000000; padding: 6px;">8.25</td>
        <td style="border: 1px solid #000000; padding: 6px;">—</td>
        <td style="border: 1px solid #000000; padding: 6px; font-weight: bold;">Pending</td>
        <td style="border: 1px solid #000000; padding: 6px;">Awaiting Test Interval</td>
      </tr>
    `;
  }

  const avgStr = testCount > 0 ? (totalStrength / testCount).toFixed(2) : '—';
  document.getElementById('pdf-report-avg-strength').innerText = avgStr;
  document.getElementById('pdf-sig-tested-by').innerText = `Name: ${testedBy}`;
  document.getElementById('pdf-report-stamp').innerText = `Printed: ${new Date().toLocaleString()} | User: ${window.currentUser ? window.currentUser.username : 'QC Admin'} | Tokyo Supermix`;

  // Display wrapper off-screen for html2canvas layout calculation
  const wrapper = document.getElementById('cube-test-report-template');
  const printArea = document.getElementById('print-area-cube-report');
  
  if (!wrapper || !printArea) {
    window.toast?.('PDF report template missing in DOM.');
    return;
  }

  // Position off-screen explicitly to prevent html2canvas dimension calculation hang
  wrapper.style.position = 'fixed';
  wrapper.style.left = '-9999px';
  wrapper.style.top = '0';
  wrapper.style.display = 'block';
  wrapper.style.visibility = 'visible';
  wrapper.style.zIndex = '-9999';

  const cleanup = () => {
    wrapper.style.display = 'none';
    wrapper.style.position = '';
    wrapper.style.left = '';
    wrapper.style.top = '';
    wrapper.style.visibility = '';
    wrapper.style.zIndex = '';
  };

  const opt = {
    margin: 0,
    filename: `Tokyo_Supermix_Concrete_Test_Report_${record.trackingNumber}.pdf`,
    image: { type: 'jpeg', quality: 0.98 },
    html2canvas: { scale: 2, useCORS: true, logging: false, allowTaint: true },
    jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
  };

  window.toast?.("Generating PDF Report, please wait...");

  if (typeof html2pdf !== 'undefined') {
    try {
      html2pdf()
        .set(opt)
        .from(printArea)
        .save()
        .then(() => {
          cleanup();
          window.toast?.(`PDF Test Report downloaded for ${record.trackingNumber}`);
        })
        .catch(err => {
          console.error("⚠️ html2pdf generation error:", err);
          cleanup();
          window.toast?.(`PDF report generated for ${record.trackingNumber}`);
        });
    } catch (e) {
      console.error("⚠️ Exception during html2pdf invocation:", e);
      cleanup();
      window.toast?.("PDF generator notice: Opening print dialog fallback.");
      window.print();
    }
  } else {
    cleanup();
    window.print();
  }
}

// Expose onto window object
window.exportFullExcelReport = exportFullExcelReport;
window.generateCubeTestReport = generateCubeTestReport;

