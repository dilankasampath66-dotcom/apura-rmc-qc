// js/selfImprovement.js
/* =========================================================================
   TOKYO SUPERMIX / APURA RMC PLANT — SELF IMPROVEMENT & INTEGRITY ENGINE
   Real-Time Form Error Safeguards, Price Lock Controls, & Audit Warnings
   ========================================================================= */

/**
 * Validates a new cube entry form object and returns any detected integrity errors.
 * @param {Object} formData - Key-value pair of entry form inputs
 * @returns {Array<string>} List of validation error strings
 */
export function validateEntryIntegrity(formData) {
  const errors = [];
  
  if (!formData.castingDate) errors.push("Casting Date cannot be empty.");
  if (!formData.customer || !formData.customer.trim()) errors.push("Customer Name is required.");
  if (!formData.site || !formData.site.trim()) errors.push("Supply Site Location is required.");
  if (!formData.designCode || !formData.designCode.trim()) errors.push("Design Mix Code is required.");
  if (!formData.bulkNumber || !formData.bulkNumber.trim()) errors.push("Cement Bulk Batch Number is required.");
  
  const volume = parseFloat(formData.volume);
  if (isNaN(volume) || volume <= 0) errors.push("Concrete Volume must be greater than 0 m³.");
  
  const cement = parseFloat(formData.cementContent);
  if (isNaN(cement) || cement < 200 || cement > 600) errors.push("Cement content should be between 200 and 600 kg/m³ for standard structural mixes.");
  
  return errors;
}

/**
 * Ensures order price locks cannot be overridden once an inquiry transitions to 'Order Confirmed'.
 * @param {Object} crmInquiry - CRM Inquiry object
 * @returns {boolean} Whether price is locked
 */
export function isPriceLocked(crmInquiry) {
  if (!crmInquiry) return false;
  return crmInquiry.stage === 'Order Confirmed' || crmInquiry.stage === 'Pour Completed';
}

// Expose onto window
window.validateEntryIntegrity = validateEntryIntegrity;
window.isPriceLocked = isPriceLocked;
