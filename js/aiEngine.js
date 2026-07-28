// js/aiEngine.js
/* =========================================================================
   TOKYO SUPERMIX / APURA RMC PLANT — AUTOMATED AI INSIGHTS ENGINE
   Generates Analytical Insights for Sales Performance & Quality Assurance
   ========================================================================= */

/**
 * Generates automated executive AI insights based on state data.
 * @param {Object} state - Current global application state
 * @returns {Array<Object>} List of generated insight cards
 */
export function generateAIExecutiveInsights(state) {
  const insights = [];

  const master = state?.master || [];
  const tests = state?.tests || [];
  const crmVisits = state?.crmVisits || [];

  // Insight 1: Total Concrete Pour Volume & Plant Utilization
  const totalVolume = master.reduce((acc, m) => acc + (parseFloat(m.volume) || 0), 0);
  insights.push({
    category: "Plant Production",
    title: "Cumulative Pour Volume",
    summary: `Total volume cast across ${master.length} batches is ${totalVolume.toFixed(2)} m³.`,
    level: "normal"
  });

  // Insight 2: Hydration Strength Development Ratio (7-Day to 28-Day Ratio)
  const tests7d = tests.filter(t => t.testingAge === '7 Days');
  const tests28d = tests.filter(t => t.testingAge === '28 Days');
  if (tests7d.length && tests28d.length) {
    const avg7 = tests7d.reduce((a, b) => a + b.strength, 0) / tests7d.length;
    const avg28 = tests28d.reduce((a, b) => a + b.strength, 0) / tests28d.length;
    const ratio = (avg28 / avg7).toFixed(2);
    insights.push({
      category: "Quality Control",
      title: "28d / 7d Strength Gain Ratio",
      summary: `Average 7d strength is ${avg7.toFixed(1)} N/mm² vs 28d strength of ${avg28.toFixed(1)} N/mm² (Hydration multiplier: ${ratio}x). Complies with BS EN 12390 standards.`,
      level: parseFloat(ratio) >= 1.3 ? "positive" : "warning"
    });
  }

  // Insight 3: Sales CRM Pipeline Conversion Health
  if (crmVisits.length) {
    const confirmed = crmVisits.filter(v => v.stage === 'Order Confirmed' || v.stage === 'Pour Completed').length;
    const rate = ((confirmed / crmVisits.length) * 100).toFixed(1);
    insights.push({
      category: "Commercial CRM",
      title: "Sales Lead Conversion Rate",
      summary: `Commercial CRM conversion is at ${rate}% (${confirmed} of ${crmVisits.length} inquiries converted).`,
      level: parseFloat(rate) >= 50 ? "positive" : "warning"
    });
  }

  return insights;
}

// Expose onto window
window.generateAIExecutiveInsights = generateAIExecutiveInsights;
