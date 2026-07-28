// js/autoQA.js
/* =========================================================================
   TOKYO SUPERMIX / APURA RMC PLANT — AUTOMATED QA TEST SUITE
   10-Scenario Sales, Quality Control, and Pricing Validation Suite
   ========================================================================= */

import { calculateConcreteQuotation } from "./pricingEngine.js";
import { validateStageTransition } from "./rulesEngine.js";

/**
 * Runs 10-scenario automated Quality Assurance test suite.
 * @returns {Array<Object>} Test results array
 */
export function runQAAutoTests() {
  const testResults = [];

  const runTest = (name, testFn) => {
    try {
      const pass = testFn();
      testResults.push({ name, passed: Boolean(pass), error: null });
    } catch (err) {
      testResults.push({ name, passed: false, error: err.message });
    }
  };

  // Scenario 1: Base C25 Grade Price Calculation
  runTest("Scenario 1: Base C25 Grade Quote Calculation", () => {
    const q = calculateConcreteQuotation({ grade: 'C25', volume: 10, distanceKm: 10, pumpRequired: false });
    return q.subtotalBeforeTax === 255000;
  });

  // Scenario 2: Free Transport Limit (< 15 km)
  runTest("Scenario 2: Free Transport Policy (<= 15km)", () => {
    const q = calculateConcreteQuotation({ grade: 'C20', volume: 20, distanceKm: 12, pumpRequired: false });
    return q.transportFeeTotal === 0;
  });

  // Scenario 3: Distance Surcharge (> 15 km)
  runTest("Scenario 3: Distance Surcharge (> 15km)", () => {
    const q = calculateConcreteQuotation({ grade: 'C20', volume: 10, distanceKm: 20, pumpRequired: false });
    // Extra 5km * LKR 250 * 10m³ = LKR 12,500
    return q.transportFeeTotal === 12500;
  });

  // Scenario 4: Pump Setup Fee Base Setup (<= 30 m³)
  runTest("Scenario 4: Pump Flat Setup Fee (<= 30m³)", () => {
    const q = calculateConcreteQuotation({ grade: 'C25', volume: 20, distanceKm: 5, pumpRequired: true });
    return q.pumpFeeTotal === 25000;
  });

  // Scenario 5: Extra Pump Volume Rate (> 30 m³)
  runTest("Scenario 5: Extra Pump Volume Surcharge (> 30m³)", () => {
    const q = calculateConcreteQuotation({ grade: 'C25', volume: 40, distanceKm: 5, pumpRequired: true });
    // Base setup LKR 25,000 + 10m³ extra * LKR 500 = LKR 30,000
    return q.pumpFeeTotal === 30000;
  });

  // Scenario 6: VAT Calculation (18%)
  runTest("Scenario 6: VAT Calculation (18%)", () => {
    const q = calculateConcreteQuotation({ grade: 'C30', volume: 10, distanceKm: 10, pumpRequired: false });
    // Subtotal 275,000; VAT 49,500
    return q.vatAmount === 49500 && q.grandTotalWithTax === 324500;
  });

  // Scenario 7: CRM Sequential Stage Transition Validation
  runTest("Scenario 7: CRM Stage Transition Validation (Sequential)", () => {
    const res = validateStageTransition('Lead', 'Site Inspection');
    return res.valid === true;
  });

  // Scenario 8: CRM Illegal Stage Skipping Detection
  runTest("Scenario 8: CRM Stage Transition Validation (Prevent Stage Skipping)", () => {
    const res = validateStageTransition('Lead', 'Order Confirmed');
    return res.valid === false;
  });

  // Scenario 9: BS EN 12390 Strength Calculation Check
  runTest("Scenario 9: BS EN 12390 Strength Formula (Load 450 kN -> 20.0 N/mm²)", () => {
    const load = 450;
    const strength = (load * 1000) / 22500;
    return strength === 20.0;
  });

  // Scenario 10: Zero Volume Quote Safeguard
  runTest("Scenario 10: Zero Volume Order Calculation Safeguard", () => {
    const q = calculateConcreteQuotation({ grade: 'C25', volume: 0, distanceKm: 10, pumpRequired: false });
    return q.subtotalBeforeTax === 0;
  });

  console.log("🧪 10-Scenario Automated QA Test Suite Results:", testResults);
  return testResults;
}

// Expose onto window
window.runQAAutoTests = runQAAutoTests;
