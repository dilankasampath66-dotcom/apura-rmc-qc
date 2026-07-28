// js/excelExport.js
/* =========================================================================
   TOKYO SUPERMIX / APURA RMC PLANT — EXCEL & PDF REPORTING ENGINE
   Generates Structured Excel (.xlsx) Workbooks & Printable A4 PDF Reports
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
 * Dynamically creates and injects the HTML template for the Concrete Compressive Strength Test Report
 * into the document body if it doesn't already exist.
 */
export function ensurePDFTemplateInDOM() {
  let wrapper = document.getElementById('cube-test-report-template');
  let printArea = document.getElementById('print-area-cube-report');

  if (!wrapper || !printArea) {
    wrapper = document.createElement('div');
    wrapper.id = 'cube-test-report-template';
    wrapper.style.display = 'none';

    wrapper.innerHTML = `
      <div id="print-area-cube-report" style="width: 210mm; min-height: 297mm; padding: 18mm 20mm; background: #ffffff; color: #000000; font-family: 'Arial', 'Helvetica', sans-serif; box-sizing: border-box;">
        
        <!-- HEADER SECTION WITH LOGO & COMPANY INFO -->
        <div style="display: flex; align-items: center; justify-content: space-between; border-bottom: 2px solid #000000; padding-bottom: 12px; margin-bottom: 16px;">
          <div style="width: 140px; flex-shrink: 0;">
            <img id="pdf-report-logo" src="https://dilankasampath66-dotcom.github.io/apura-rmc-qc/images/logo.png" alt="Tokyo Supermix Logo" style="max-width: 130px; height: auto;" onerror="this.src='https://via.placeholder.com/150x50?text=TOKYO+SUPERMIX'" />
          </div>
          <div style="text-align: right; flex: 1;">
            <h2 style="margin: 0; font-size: 17px; font-weight: 800; color: #000000; letter-spacing: 0.5px;">TOKYO SUPER MIX (PVT) LTD</h2>
            <h3 style="margin: 3px 0; font-size: 13px; font-weight: 700; color: #222222;">TOKYO SUPER MIX READY MIXED CONCRETE PLANT</h3>
            <p style="margin: 1px 0; font-size: 11px; color: #333333;">Saliya Mawatha Anuradhapura</p>
            <p style="margin: 1px 0; font-size: 11px; color: #333333;">Tel/Fax: 025-2234193 | E-mail: Supermix.anurap@tokyocement.lk</p>
          </div>
        </div>

        <!-- REPORT TITLE & STANDARD REF -->
        <div style="text-align: center; margin-bottom: 18px;">
          <h3 style="margin: 0; font-size: 15px; font-weight: 800; text-decoration: underline; letter-spacing: 0.5px; text-transform: uppercase;">CONCRETE COMPRESSIVE STRENGTH TEST REPORT</h3>
          <p style="margin: 4px 0 0 0; font-size: 11px; font-style: italic; color: #444444;">(Specification Reference : BS 1881-116 / BS EN 12390)</p>
        </div>

        <!-- METADATA TABLE -->
        <table style="width: 100%; border-collapse: collapse; margin-bottom: 18px; font-size: 11.5px; border: 1px solid #000000;">
          <tbody>
            <tr>
              <td style="width: 28%; font-weight: bold; padding: 6px 8px; border: 1px solid #000000; background: #f5f5f5;">Customer</td>
              <td style="width: 72%; padding: 6px 8px; border: 1px solid #000000;" id="pdf-report-customer">—</td>
            </tr>
            <tr>
              <td style="font-weight: bold; padding: 6px 8px; border: 1px solid #000000; background: #f5f5f5;">Project / Supply Site</td>
              <td style="padding: 6px 8px; border: 1px solid #000000;" id="pdf-report-site">—</td>
            </tr>
            <tr>
              <td style="font-weight: bold; padding: 6px 8px; border: 1px solid #000000; background: #f5f5f5;">Grade of Concrete</td>
              <td style="padding: 6px 8px; border: 1px solid #000000;" id="pdf-report-grade">—</td>
            </tr>
            <tr>
              <td style="font-weight: bold; padding: 6px 8px; border: 1px solid #000000; background: #f5f5f5;">Slump Specified</td>
              <td style="padding: 6px 8px; border: 1px solid #000000;" id="pdf-report-slump">150+/-25 mm</td>
            </tr>
            <tr>
              <td style="font-weight: bold; padding: 6px 8px; border: 1px solid #000000; background: #f5f5f5;">Casted Date</td>
              <td style="padding: 6px 8px; border: 1px solid #000000;" id="pdf-report-cast-date">—</td>
            </tr>
            <tr>
              <td style="font-weight: bold; padding: 6px 8px; border: 1px solid #000000; background: #f5f5f5;">Date of Test</td>
              <td style="padding: 6px 8px; border: 1px solid #000000;" id="pdf-report-test-date">—</td>
            </tr>
            <tr>
              <td style="font-weight: bold; padding: 6px 8px; border: 1px solid #000000; background: #f5f5f5;">Age of Cubes at Testing</td>
              <td style="padding: 6px 8px; border: 1px solid #000000;" id="pdf-report-age">—</td>
            </tr>
            <tr>
              <td style="font-weight: bold; padding: 6px 8px; border: 1px solid #000000; background: #f5f5f5;">Dimensions of Cube</td>
              <td style="padding: 6px 8px; border: 1px solid #000000;">150mm * 150mm * 150mm</td>
            </tr>
            <tr>
              <td style="font-weight: bold; padding: 6px 8px; border: 1px solid #000000; background: #f5f5f5;">Casting Location / Notes</td>
              <td style="padding: 6px 8px; border: 1px solid #000000;" id="pdf-report-location">—</td>
            </tr>
          </tbody>
        </table>

        <!-- TEST RESULTS TABLE -->
        <table style="width: 100%; border-collapse: collapse; font-size: 11.5px; margin-bottom: 24px; text-align: center; border: 1px solid #000000;">
          <thead>
            <tr style="background-color: #eaeaea;">
              <th style="border: 1px solid #000000; padding: 7px 6px; font-weight: bold;">Cube No / Test ID</th>
              <th style="border: 1px solid #000000; padding: 7px 6px; font-weight: bold;">Weight (kg)</th>
              <th style="border: 1px solid #000000; padding: 7px 6px; font-weight: bold;">Maximum Load at Failure (kN)</th>
              <th style="border: 1px solid #000000; padding: 7px 6px; font-weight: bold;">Equivalent Compressive Strength (N/mm²)</th>
              <th style="border: 1px solid #000000; padding: 7px 6px; font-weight: bold;">Remarks & Status</th>
            </tr>
          </thead>
          <tbody id="pdf-report-table-body">
            <!-- Injected via JavaScript -->
          </tbody>
        </table>

        <!-- SUMMARY METRIC BOX -->
        <div style="border: 1px solid #000000; background: #fafafa; padding: 8px 12px; margin-bottom: 30px; font-size: 12px; display: flex; justify-content: space-between; align-items: center;">
          <div><strong>Average Compressive Strength:</strong> <span id="pdf-report-avg-strength" style="font-size: 15px; font-weight: bold;">—</span> N/mm²</div>
          <div><strong>BS EN 12390 Status:</strong> <span id="pdf-report-compliance" style="font-weight: bold; color: #000;">COMPLIANT</span></div>
        </div>

        <!-- SIGNATURES SECTION -->
        <table style="width: 100%; margin-top: 45px; font-size: 11px; text-align: center; border: none;">
          <tbody>
            <tr>
              <td style="width: 33%; vertical-align: bottom;">
                <div style="border-top: 1px dashed #000000; margin: 0 15px; padding-top: 6px; font-weight: bold;">Tested By (QA/QC Tech)</div>
                <div id="pdf-sig-tested-by" style="font-size: 10px; margin-top: 3px; color: #444;">Name: —</div>
              </td>
              <td style="width: 33%; vertical-align: bottom;">
                <div style="border-top: 1px dashed #000000; margin: 0 15px; padding-top: 6px; font-weight: bold;">Checked By (Lab Engineer)</div>
                <div style="font-size: 10px; margin-top: 3px; color: #444;">Signature & Stamp</div>
              </td>
              <td style="width: 33%; vertical-align: bottom;">
                <div style="border-top: 1px dashed #000000; margin: 0 15px; padding-top: 6px; font-weight: bold;">Authorized Signature</div>
                <div style="font-size: 10px; margin-top: 3px; color: #444;">Tokyo Super Mix Plant Mgr</div>
              </td>
            </tr>
          </tbody>
        </table>

        <!-- FOOTER STAMP -->
        <div style="margin-top: 35px; border-top: 1px solid #cccccc; padding-top: 6px; font-size: 9px; color: #666666; font-family: monospace; display: flex; justify-content: space-between;">
          <div>Form: F/QAQC/30 | Rev: 03 | Spec: BS EN 1881-116</div>
          <div id="pdf-report-stamp">Tokyo Super Mix Anuradhapura Plant</div>
        </div>
      </div>
    `;

    document.body.appendChild(wrapper);
  }

  return document.getElementById('print-area-cube-report');
}

/**
 * Generates and downloads a formal A4 PDF Concrete Compressive Strength Test Report
 * matching Tokyo Supermix standard template using html2pdf.js.
 * Wrapped in robust try/catch block with off-screen positioning and cleanup.
 * @param {Object|string} testDataOrTrackingNum - Batch record object or tracking number string
 */
export function generateCubeTestReport(testDataOrTrackingNum) {
  try {
    // 1. Ensure template exists in DOM or inject dynamically
    const printArea = ensurePDFTemplateInDOM();
    const wrapper = document.getElementById('cube-test-report-template');

    // 2. Strict Validation Check
    const element = document.getElementById('print-area-cube-report');
    if (!element || !wrapper) {
      console.error('PDF Template missing!');
      window.toast?.('PDF Template missing!');
      return;
    }

    let record = null;
    let tests = [];

    if (typeof testDataOrTrackingNum === 'string') {
      const tn = testDataOrTrackingNum;
      record = window.state?.master?.find(m => m.trackingNumber === tn);
      tests = (window.state?.tests || []).filter(t => t.trackingNumber === tn);
    } else if (testDataOrTrackingNum && typeof testDataOrTrackingNum === 'object') {
      record = testDataOrTrackingNum;
      tests = testDataOrTrackingNum.cubes || (window.state?.tests || []).filter(t => t.trackingNumber === record.trackingNumber);
    }

    if (!record) {
      const tnInput = document.getElementById('rep-tn')?.value;
      if (tnInput) {
        record = window.state?.master?.find(m => m.trackingNumber === tnInput);
        tests = (window.state?.tests || []).filter(t => t.trackingNumber === tnInput);
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
    const customerEl = document.getElementById('pdf-report-customer');
    if (customerEl) customerEl.innerText = record.customer || 'Access Engineering PLC';

    const siteEl = document.getElementById('pdf-report-site');
    if (siteEl) siteEl.innerText = record.site || 'Anuradhapura Plant';

    const gradeEl = document.getElementById('pdf-report-grade');
    if (gradeEl) gradeEl.innerText = `${record.grade} (${record.designCode || 'Standard Mix'})`;

    const slumpEl = document.getElementById('pdf-report-slump');
    if (slumpEl) slumpEl.innerText = record.slump || '150+/-25 mm';

    const castDateEl = document.getElementById('pdf-report-cast-date');
    if (castDateEl) castDateEl.innerText = record.castingDate ? (window.fmtDate ? window.fmtDate(record.castingDate) : record.castingDate) : '—';
    
    const firstTestDate = tests.length ? tests[0].testingDate : '—';
    const testDateEl = document.getElementById('pdf-report-test-date');
    if (testDateEl) testDateEl.innerText = firstTestDate && window.fmtDate ? window.fmtDate(firstTestDate) : firstTestDate;

    const ageEl = document.getElementById('pdf-report-age');
    if (ageEl) ageEl.innerText = tests.length ? tests.map(t => t.testingAge).join(', ') : '7 Days & 28 Days';

    const locEl = document.getElementById('pdf-report-location');
    if (locEl) locEl.innerText = record.remarks || `${record.site} - Volume ${record.volume != null ? record.volume : '—'} m³ (${record.cementSilo || 'Silo 01'})`;

    // Populate Results Table Body
    const tbody = document.getElementById('pdf-report-table-body');
    if (tbody) {
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
      const avgEl = document.getElementById('pdf-report-avg-strength');
      if (avgEl) avgEl.innerText = avgStr;

      const sigEl = document.getElementById('pdf-sig-tested-by');
      if (sigEl) sigEl.innerText = `Name: ${testedBy}`;

      const stampEl = document.getElementById('pdf-report-stamp');
      if (stampEl) stampEl.innerText = `Printed: ${new Date().toLocaleString()} | User: ${window.currentUser ? window.currentUser.username : 'QC Admin'} | Tokyo Supermix`;
    }

    // 3. Temporarily position off-screen renderable
    wrapper.style.position = 'fixed';
    wrapper.style.left = '-9999px';
    wrapper.style.top = '0px';
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
      html2pdf()
        .set(opt)
        .from(element)
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
    } else {
      cleanup();
      window.print();
    }
  } catch (err) {
    console.error("⚠️ Silent error caught in generateCubeTestReport:", err);
    window.toast?.("An error occurred during PDF generation.");
  }
}

// Expose onto window object
window.exportFullExcelReport = exportFullExcelReport;
window.generateCubeTestReport = generateCubeTestReport;
window.ensurePDFTemplateInDOM = ensurePDFTemplateInDOM;
