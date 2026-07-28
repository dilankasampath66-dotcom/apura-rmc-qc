// js/pricingEngine.js
/* =========================================================================
   TOKYO SUPERMIX / APURA RMC PLANT — PRICING & COMMERCIAL ENGINE
   Calculates Concrete Grade Prices, Transport Distance Surcharges, and Pump Rates
   ========================================================================= */

// Base Concrete Grade Pricing Table (LKR per m³)
export const GRADE_BASE_PRICES = {
  'C15': 22500,
  'C20': 24000,
  'C25': 25500,
  'C30': 27500,
  'C35': 30000,
  'C40': 33000,
  'C50': 38000
};

// Transport Policy Rules
export const TRANSPORT_RULES = {
  FREE_DISTANCE_KM: 15,          // First 15 km transport is free
  EXTRA_KM_RATE_PER_M3: 250      // LKR 250 per km per m³ beyond 15 km
};

// Concrete Pump Car Pricing Policy
export const PUMP_RULES = {
  SETUP_FEE: 25000,               // Flat pump setup fee (LKR)
  INCLUDED_BASE_VOLUME: 30,      // Included volume in base setup (m³)
  EXTRA_VOLUME_RATE: 500         // LKR 500 per m³ above 30 m³
};

/**
 * Calculates complete pricing breakdown for an RMC supply quotation order.
 * @param {string} grade - Concrete Grade Code (e.g., 'C25')
 * @param {number} volume - Total volume in m³
 * @param {number} distanceKm - Transport distance from plant in km
 * @param {boolean} pumpRequired - Whether a concrete pump car is required
 * @returns {Object} Complete pricing breakdown object
 */
export function calculateConcreteQuotation({ grade = 'C25', volume = 0, distanceKm = 0, pumpRequired = false }) {
  const safeVolume = Math.max(0, parseFloat(volume) || 0);
  const safeDistance = Math.max(0, parseFloat(distanceKm) || 0);
  
  // 1. Concrete Mix Grade Base Cost
  const baseRatePerM3 = GRADE_BASE_PRICES[grade] || GRADE_BASE_PRICES['C25'];
  const mixCostTotal = safeVolume * baseRatePerM3;

  // 2. Transport Surcharge Calculation
  let extraKm = 0;
  let transportFeeTotal = 0;
  if (safeDistance > TRANSPORT_RULES.FREE_DISTANCE_KM) {
    extraKm = safeDistance - TRANSPORT_RULES.FREE_DISTANCE_KM;
    transportFeeTotal = extraKm * TRANSPORT_RULES.EXTRA_KM_RATE_PER_M3 * safeVolume;
  }

  // 3. Concrete Pump Car Surcharge Calculation
  let pumpFeeTotal = 0;
  let extraPumpVolume = 0;
  if (pumpRequired && safeVolume > 0) {
    pumpFeeTotal += PUMP_RULES.SETUP_FEE;
    if (safeVolume > PUMP_RULES.INCLUDED_BASE_VOLUME) {
      extraPumpVolume = safeVolume - PUMP_RULES.INCLUDED_BASE_VOLUME;
      pumpFeeTotal += extraPumpVolume * PUMP_RULES.EXTRA_VOLUME_RATE;
    }
  }

  // 4. Totals and Tax Computations (18% VAT)
  const subtotalBeforeTax = mixCostTotal + transportFeeTotal + pumpFeeTotal;
  const vatAmount = subtotalBeforeTax * 0.18;
  const grandTotalWithTax = subtotalBeforeTax + vatAmount;

  return {
    grade,
    volume: safeVolume,
    distanceKm: safeDistance,
    extraKm,
    baseRatePerM3,
    mixCostTotal,
    transportFeeTotal,
    pumpRequired,
    pumpFeeTotal,
    subtotalBeforeTax,
    vatAmount,
    grandTotalWithTax,
    formattedSubtotal: subtotalBeforeTax.toLocaleString('en-LK', { style: 'currency', currency: 'LKR' }),
    formattedGrandTotal: grandTotalWithTax.toLocaleString('en-LK', { style: 'currency', currency: 'LKR' })
  };
}

// Expose onto window for global application access
window.calculateConcreteQuotation = calculateConcreteQuotation;
window.GRADE_BASE_PRICES = GRADE_BASE_PRICES;
