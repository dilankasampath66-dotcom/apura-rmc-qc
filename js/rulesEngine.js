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

// Expose onto window
window.validateStageTransition = validateStageTransition;
window.computeTestingSchedule = computeTestingSchedule;
window.CRM_PIPELINE_STAGES = CRM_PIPELINE_STAGES;
