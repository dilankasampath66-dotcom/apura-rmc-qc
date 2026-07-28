// js/rulesEngine.js
/* =========================================================================
   TOKYO SUPERMIX / APURA RMC PLANT — RULES & WORKFLOW ENGINE
   Pipeline Stage Progression, Order Fulfillment, & Active Testing Schedule
   ========================================================================= */

export const CRM_PIPELINE_STAGES = [
  'Lead',
  'Site Inspection',
  'Quotation Sent',
  'Order Confirmed',
  'Pour Completed'
];

/**
 * Validates whether a CRM sales inquiry can advance to the requested pipeline stage.
 * @param {string} currentStage - Current stage
 * @param {string} targetStage - Desired target stage
 * @returns {Object} Validation status { valid: boolean, message: string }
 */
export function validateStageTransition(currentStage, targetStage) {
  const currentIndex = CRM_PIPELINE_STAGES.indexOf(currentStage);
  const targetIndex = CRM_PIPELINE_STAGES.indexOf(targetStage);

  if (currentIndex === -1 || targetIndex === -1) {
    return { valid: false, message: "Invalid CRM Pipeline Stage specified." };
  }

  if (targetIndex > currentIndex + 1) {
    return { 
      valid: false, 
      message: `Cannot skip stages. Inquiry must pass through '${CRM_PIPELINE_STAGES[currentIndex + 1]}' before advancing to '${targetStage}'.` 
    };
  }

  return { valid: true, message: "Stage transition allowed." };
}

/**
 * Computes scheduled testing dates based on casting date and active required test intervals.
 * @param {string} castingDateStr - ISO date string (YYYY-MM-DD)
 * @param {Array<string>} activeAges - Active test ages (['3 Days', '7 Days', '14 Days', '28 Days'])
 * @returns {Array<Object>} Scheduled test dates
 */
export function computeTestingSchedule(castingDateStr, activeAges = ['3 Days', '7 Days', '14 Days', '28 Days']) {
  if (!castingDateStr) return [];
  const castDate = new Date(castingDateStr);
  
  const intervals = [
    { label: '3 Days', days: 3 },
    { label: '7 Days', days: 7 },
    { label: '14 Days', days: 14 },
    { label: '28 Days', days: 28 }
  ];

  return intervals
    .filter(item => activeAges.includes(item.label))
    .map(item => {
      const dueDate = new Date(castDate);
      dueDate.setDate(dueDate.getDate() + item.days);
      const isoDueDate = dueDate.toISOString().slice(0, 10);
      
      const today = new Date().toISOString().slice(0, 10);
      let status = 'Pending';
      if (isoDueDate < today) status = 'Overdue';
      else if (isoDueDate === today) status = 'Due Today';
      else status = 'Upcoming';

      return {
        age: item.label,
        days: item.days,
        dueDate: isoDueDate,
        status
      };
    });
}

/**
 * Evaluates the testing cycle status of a concrete casting record based on engineering maturity hierarchy.
 *
 * ENGINEERING & HYDRATION REALITIES:
 * 1. 28-Day Maturity Stage: If a valid 28-day strength (> 0 N/mm²) is recorded, the testing cycle is
 *    fully completed. Missed early tests (3, 7, 14 days) are obsolete and marked as "Skipped".
 * 2. Early Strength Pass: If an early test (3D, 7D, or 14D) hits/exceeds the characteristic target Grade
 *    (e.g., >= 25 N/mm² for C25), early structural integrity is proven -> "Target Achieved - Awaiting 28D".
 * 3. Mandatory 28-Day Requirement: 28-day testing remains MANDATORY even after early target achievement
 *    to establish the ultimate 28-day design strength capacity of the concrete mix design.
 * 4. Pending Hydration: If 28-day is unrecorded and early strengths are below target Grade (or unrecorded),
 *    the cycle remains "Pending".
 *
 * @param {Object} record - Casting record object.
 * @param {string|number} [record.grade] - Concrete mix grade string (e.g. "C25", "C30", "C35A", "G25") or numeric grade.
 * @param {number|string|null} [record.strength3D] - 3-day compressive strength (N/mm²).
 * @param {number|string|null} [record.strength7D] - 7-day compressive strength (N/mm²).
 * @param {number|string|null} [record.strength14D] - 14-day compressive strength (N/mm²).
 * @param {number|string|null} [record.strength28D] - 28-day compressive strength (N/mm²).
 * @returns {{ overallStatus: string, skipEarlyTests: boolean, is28DayPending: boolean }}
 */
export function evaluateTestingStatus(record) {
  if (!record || typeof record !== 'object') {
    return {
      overallStatus: 'Pending',
      skipEarlyTests: false,
      is28DayPending: true
    };
  }

  // Helper to safely parse numeric strength values (> 0)
  const parseStrength = (val) => {
    if (val === null || val === undefined || val === '') return null;
    const num = Number(val);
    return !isNaN(num) && num > 0 ? num : null;
  };

  // Helper to dynamically extract numeric target grade (e.g., "C25" -> 25, "C35A" -> 35, "G30" -> 30)
  const extractTargetGrade = (gradeStr) => {
    if (typeof gradeStr === 'number') return gradeStr > 0 ? gradeStr : 0;
    if (!gradeStr || typeof gradeStr !== 'string') return 0;
    const match = gradeStr.match(/\d+/);
    return match ? parseFloat(match[0]) : 0;
  };

  const s3 = parseStrength(record.strength3D);
  const s7 = parseStrength(record.strength7D);
  const s14 = parseStrength(record.strength14D);
  const s28 = parseStrength(record.strength28D);
  const targetGrade = extractTargetGrade(record.grade);

  // HIERARCHY 1: FULLY COMPLETED
  // 28-day strength has been recorded with a valid value (> 0 N/mm²)
  if (s28 !== null) {
    return {
      overallStatus: 'Completed',
      skipEarlyTests: true,
      is28DayPending: false
    };
  }

  // HIERARCHY 2: EARLY TARGET ACHIEVED (BUT 28-DAY PENDING)
  // 28-day is not yet recorded, but any recorded early strength (3D, 7D, 14D) >= target Grade value
  const earlyStrengths = [s3, s7, s14].filter(val => val !== null);
  const hasAchievedEarly = targetGrade > 0 && earlyStrengths.some(val => val >= targetGrade);

  if (hasAchievedEarly) {
    return {
      overallStatus: 'Target Achieved - Awaiting 28D',
      skipEarlyTests: true,
      is28DayPending: true
    };
  }

  // HIERARCHY 3: PENDING / NORMAL HYDRATION
  // 28-day not recorded, early tests are recorded but strictly below target Grade or empty
  return {
    overallStatus: 'Pending',
    skipEarlyTests: false,
    is28DayPending: true
  };
}

// Expose onto window for global compatibility across legacy UI & Cloud Firestore scripts
window.validateStageTransition = validateStageTransition;
window.computeTestingSchedule = computeTestingSchedule;
window.evaluateTestingStatus = evaluateTestingStatus;
window.CRM_PIPELINE_STAGES = CRM_PIPELINE_STAGES;

