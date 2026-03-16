/**
 * Benchmark Report Normalizer
 *
 * Single source of truth for every numeric value displayed on the result page.
 * Centralizes sourcing, fallback logic, calculations, and validation so that
 * renderResult() and initResultEnhancements() never define their own numbers.
 */
(function () {
  "use strict";

  // ---------------------------------------------------------------------------
  // Benchmark lookup tables (state × household-size → monthly premium)
  // ---------------------------------------------------------------------------
  var BENCHMARK_TABLE = {
    GA: { 1: 498, 2: 845, 3: 1090, 4: 1210, 5: 1350 },
    TX: { 1: 520, 2: 880, 3: 1140, 4: 1280, 5: 1420 },
    FL: { 1: 545, 2: 920, 3: 1180, 4: 1320, 5: 1460 },
    CA: { 1: 580, 2: 980, 3: 1260, 4: 1410, 5: 1560 },
    NY: { 1: 620, 2: 1050, 3: 1340, 4: 1500, 5: 1660 },
    IL: { 1: 510, 2: 865, 3: 1110, 4: 1240, 5: 1380 },
    OH: { 1: 475, 2: 810, 3: 1040, 4: 1160, 5: 1300 },
    NC: { 1: 505, 2: 855, 3: 1100, 4: 1230, 5: 1370 },
    CO: { 1: 530, 2: 900, 3: 1150, 4: 1290, 5: 1430 },
    AZ: { 1: 490, 2: 830, 3: 1070, 4: 1200, 5: 1340 }
  };

  // ---------------------------------------------------------------------------
  // Premium-tier plan structure estimation
  // When user only provides premium, infer plan structure from premium ratio.
  // ---------------------------------------------------------------------------
  var PREMIUM_TIERS = [
    { maxRatio: 0.60, label: "Catastrophic",    deductible: 8000, coinsurance: 0.40, maxOop: 9000  },
    { maxRatio: 0.90, label: "High Deductible", deductible: 5000, coinsurance: 0.30, maxOop: 8000  },
    { maxRatio: 1.30, label: "Benchmark Plan",  deductible: 3000, coinsurance: 0.20, maxOop: 7000  },
    { maxRatio: Infinity, label: "Rich Coverage", deductible: 1500, coinsurance: 0.15, maxOop: 5000 }
  ];

  // Benchmark plan structure (the "typical plan" reference)
  var BENCHMARK_PLAN_DEDUCTIBLE = 3000;
  var BENCHMARK_PLAN_COINSURANCE = 0.20;
  var BENCHMARK_PLAN_MAX_OOP = 7000;

  var MAJOR_EVENT_PROBABILITY = 0.08;
  var DEFAULT_COINSURANCE_RATE = 0.20;
  var EXAMPLE_EVENT_COST = 40000;

  // Midpoint deductible assumptions by plan type (used when no premium ratio)
  var DEDUCTIBLE_BY_PLAN = {
    ACA_MARKETPLACE: 6500,
    EMPLOYER_GROUP: 3500,
    PRIVATE_PPO: 5000,
    SHORT_TERM: 7500,
    LIMITED_BENEFIT: 10000,
    HEALTH_SHARE: 5000,
    HDHP_HSA: 7000,
    COBRA: 3500,
    UNKNOWN: 6000
  };

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------
  function isNum(v) {
    return typeof v === "number" && isFinite(v) && !isNaN(v);
  }

  function clampHouseholdSize(n) {
    if (!isNum(n) || n < 1) return 1;
    return Math.min(Math.round(n), 10);
  }

  function lookupBenchmark(stateCode, householdSize) {
    var table = BENCHMARK_TABLE[stateCode];
    if (!table) return null;
    var hs = clampHouseholdSize(householdSize);
    if (hs > 5) hs = 5;
    return table[hs] || null;
  }

  function getTierFromRatio(ratio) {
    for (var i = 0; i < PREMIUM_TIERS.length; i++) {
      if (ratio <= PREMIUM_TIERS[i].maxRatio) return PREMIUM_TIERS[i];
    }
    return PREMIUM_TIERS[PREMIUM_TIERS.length - 1];
  }

  function inferMaxOop(deductible) {
    if (!isNum(deductible)) return null;
    if (deductible <= 2000) return 5000;
    if (deductible <= 3000) return 7000;
    if (deductible <= 5000) return 8000;
    if (deductible <= 7000) return 9000;
    if (deductible <= 10000) return 14000;
    return Math.round(deductible * 1.6);
  }

  function formatCurrency(n) {
    if (!isNum(n)) return "\u2014";
    return "$" + n.toLocaleString("en-US");
  }

  function formatTimestamp() {
    var now = new Date();
    var display = now.toLocaleString("en-US", {
      year: "numeric",
      month: "short",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
      timeZone: "UTC"
    });
    return "Benchmarks generated " + display + " UTC using state-level premium benchmarks and plan structure assumptions.";
  }

  function computeEventScenario(eventCost, deductible, coinsuranceRate, maxOop) {
    var userDeductible = deductible;
    var remaining = Math.max(0, eventCost - deductible);
    var rawCoinsurance = Math.round(remaining * coinsuranceRate);
    var totalUser = deductible + rawCoinsurance;
    var userCoinsurance;
    if (isNum(maxOop) && totalUser > maxOop) {
      userCoinsurance = Math.max(0, maxOop - deductible);
    } else {
      userCoinsurance = rawCoinsurance;
    }
    var insurancePays = Math.max(0, eventCost - userDeductible - userCoinsurance);
    return {
      userDeductible: userDeductible,
      userCoinsurance: userCoinsurance,
      insurancePays: insurancePays
    };
  }

  // ---------------------------------------------------------------------------
  // buildResolvedBenchmarkReport(input) → ResolvedBenchmarkReport
  // ---------------------------------------------------------------------------
  function buildResolvedBenchmarkReport(input) {
    input = input || {};
    var assumptions = [];
    var warnings = [];

    // --- Monthly premium ---
    var monthlyPremium = null;
    var noCurrentPremium = !!input.noCurrentPremium;
    if (!noCurrentPremium && isNum(input.monthlyPremium) && input.monthlyPremium > 0) {
      monthlyPremium = Math.round(input.monthlyPremium);
    }

    // --- Household size ---
    var householdSize = isNum(input.householdSize) ? clampHouseholdSize(input.householdSize) : 1;

    // --- State ---
    var stateCode = (input.state || "").toUpperCase().trim() || null;

    // --- Plan type ---
    var planType = (input.planType || "UNKNOWN").toUpperCase();

    // --- Directional benchmark ---
    var directionalBenchmark = null;
    if (stateCode) {
      directionalBenchmark = lookupBenchmark(stateCode, householdSize);
    }
    if (!isNum(directionalBenchmark) && isNum(input.formulaBenchmark) && input.formulaBenchmark > 0) {
      directionalBenchmark = Math.round(input.formulaBenchmark);
      assumptions.push("Benchmark derived from age-based formula (state-specific data unavailable).");
    }
    if (!isNum(directionalBenchmark)) {
      directionalBenchmark = null;
      warnings.push("Unable to compute a directional benchmark \u2014 insufficient data.");
    }

    // --- Premium ratio and tier-based estimation ---
    var premiumRatio = null;
    var tier = null;
    if (isNum(monthlyPremium) && isNum(directionalBenchmark) && directionalBenchmark > 0) {
      premiumRatio = monthlyPremium / directionalBenchmark;
      tier = getTierFromRatio(premiumRatio);
    }

    // --- Annual premium ---
    var annualPremium = null;
    if (isNum(monthlyPremium)) {
      annualPremium = monthlyPremium * 12;
    } else if (isNum(directionalBenchmark)) {
      annualPremium = directionalBenchmark * 12;
      assumptions.push("Annual premium estimated from benchmark (user did not provide current premium).");
    }

    // --- Deductible (tier-based when available, then plan type, then fallback) ---
    var deductible = null;
    if (isNum(input.deductible) && input.deductible >= 0) {
      deductible = Math.round(input.deductible);
    } else if (tier) {
      deductible = tier.deductible;
      assumptions.push("Deductible estimated from premium tier (" + tier.label + ").");
    } else {
      deductible = DEDUCTIBLE_BY_PLAN[planType] || DEDUCTIBLE_BY_PLAN.UNKNOWN;
      assumptions.push("Deductible estimated from typical " + (planType !== "UNKNOWN" ? planType.replace(/_/g, " ").toLowerCase() : "plan") + " structure.");
    }

    // --- Coinsurance rate (tier-based when available) ---
    var coinsuranceRate = DEFAULT_COINSURANCE_RATE;
    if (isNum(input.coinsuranceRate) && input.coinsuranceRate >= 0 && input.coinsuranceRate <= 1) {
      coinsuranceRate = input.coinsuranceRate;
    } else if (tier) {
      coinsuranceRate = tier.coinsurance;
      assumptions.push("Coinsurance rate estimated from premium tier (" + tier.label + ").");
    } else {
      assumptions.push("Coinsurance rate assumed at " + (DEFAULT_COINSURANCE_RATE * 100) + "%.");
    }

    // --- Max out-of-pocket (tier-based when available) ---
    var maxOutOfPocket = null;
    if (isNum(input.maxOutOfPocket) && input.maxOutOfPocket >= 0) {
      maxOutOfPocket = Math.round(input.maxOutOfPocket);
    } else if (tier) {
      maxOutOfPocket = tier.maxOop;
      assumptions.push("Maximum out-of-pocket estimated from premium tier (" + tier.label + ").");
    } else {
      maxOutOfPocket = inferMaxOop(deductible);
      if (isNum(maxOutOfPocket)) {
        assumptions.push("Maximum out-of-pocket inferred from deductible band.");
      }
    }

    if (isNum(maxOutOfPocket) && isNum(deductible) && maxOutOfPocket < deductible) {
      maxOutOfPocket = deductible;
      warnings.push("Maximum out-of-pocket was adjusted to match deductible.");
    }

    // --- Coinsurance exposure ---
    var coinsuranceExposure = null;
    if (isNum(maxOutOfPocket) && isNum(deductible)) {
      coinsuranceExposure = Math.max(0, maxOutOfPocket - deductible);
    }

    // --- Exposure range ---
    var estimatedExposureLow = deductible;
    var estimatedExposureHigh = maxOutOfPocket;

    // --- Medical event scenario ($40k) ---
    var exampleMedicalEventCost = EXAMPLE_EVENT_COST;
    var exampleUserDeductible = null;
    var exampleUserCoinsurance = null;
    var exampleInsurancePays = null;

    if (isNum(deductible)) {
      var scenario = computeEventScenario(exampleMedicalEventCost, deductible, coinsuranceRate, maxOutOfPocket);
      exampleUserDeductible = scenario.userDeductible;
      exampleUserCoinsurance = scenario.userCoinsurance;
      exampleInsurancePays = scenario.insurancePays;
    }

    // --- Benchmark plan structure (the "typical plan" reference) ---
    var benchmarkAnnualPremium = isNum(directionalBenchmark) ? directionalBenchmark * 12 : null;
    var benchmarkDeductible = BENCHMARK_PLAN_DEDUCTIBLE;
    var benchmarkCoinsurance = BENCHMARK_PLAN_COINSURANCE;
    var benchmarkMaxOop = BENCHMARK_PLAN_MAX_OOP;

    // --- Risk scores ---
    var yourExpectedOopRisk = isNum(maxOutOfPocket) ? Math.round(maxOutOfPocket * MAJOR_EVENT_PROBABILITY) : null;
    var benchmarkExpectedOopRisk = Math.round(benchmarkMaxOop * MAJOR_EVENT_PROBABILITY);
    var yourTotalRiskCost = (isNum(annualPremium) && isNum(yourExpectedOopRisk)) ? annualPremium + yourExpectedOopRisk : null;
    var benchmarkTotalRiskCost = isNum(benchmarkAnnualPremium) ? benchmarkAnnualPremium + benchmarkExpectedOopRisk : null;
    var riskMultiplier = (isNum(yourTotalRiskCost) && isNum(benchmarkTotalRiskCost) && benchmarkTotalRiskCost > 0)
      ? Math.round((yourTotalRiskCost / benchmarkTotalRiskCost) * 10) / 10
      : null;

    // --- Exposure meter: best / typical / worst ---
    var exposureBestCase = annualPremium;
    var exposureTypicalCase = (isNum(annualPremium) && isNum(deductible))
      ? annualPremium + Math.round(deductible * 0.5) : null;
    var exposureWorstCase = (isNum(annualPremium) && isNum(maxOutOfPocket))
      ? annualPremium + maxOutOfPocket : null;

    // --- Timestamp ---
    var timestamp = formatTimestamp();

    // --- Build values ---
    var values = {
      currentMonthlyPremium: monthlyPremium,
      directionalBenchmark: directionalBenchmark,
      householdSize: householdSize,
      annualPremium: annualPremium,
      deductible: deductible,
      coinsuranceRate: coinsuranceRate,
      coinsuranceExposure: coinsuranceExposure,
      maxOutOfPocket: maxOutOfPocket,
      estimatedExposureLow: estimatedExposureLow,
      estimatedExposureHigh: estimatedExposureHigh,
      exampleMedicalEventCost: exampleMedicalEventCost,
      exampleUserDeductible: exampleUserDeductible,
      exampleUserCoinsurance: exampleUserCoinsurance,
      exampleInsurancePays: exampleInsurancePays,
      timestamp: timestamp,
      premiumRatio: premiumRatio,
      tierLabel: tier ? tier.label : null,
      benchmarkAnnualPremium: benchmarkAnnualPremium,
      benchmarkDeductible: benchmarkDeductible,
      benchmarkCoinsurance: benchmarkCoinsurance,
      benchmarkMaxOop: benchmarkMaxOop,
      yourExpectedOopRisk: yourExpectedOopRisk,
      benchmarkExpectedOopRisk: benchmarkExpectedOopRisk,
      yourTotalRiskCost: yourTotalRiskCost,
      benchmarkTotalRiskCost: benchmarkTotalRiskCost,
      riskMultiplier: riskMultiplier,
      exposureBestCase: exposureBestCase,
      exposureTypicalCase: exposureTypicalCase,
      exposureWorstCase: exposureWorstCase
    };

    // --- Validate ---
    var validationWarnings = validateBenchmarkReport(values);
    warnings = warnings.concat(validationWarnings);

    // --- Chart eligibility ---
    var hasEnoughDataForExposureChart =
      isNum(annualPremium) && isNum(deductible) && isNum(maxOutOfPocket);
    var hasEnoughDataForMedicalEventChart =
      isNum(exampleUserDeductible) && isNum(exampleUserCoinsurance) && isNum(exampleInsurancePays) &&
      (exampleUserDeductible + exampleUserCoinsurance + exampleInsurancePays === exampleMedicalEventCost);
    var hasEnoughDataForRiskChart =
      isNum(annualPremium) && isNum(yourExpectedOopRisk) &&
      isNum(benchmarkAnnualPremium) && isNum(benchmarkExpectedOopRisk) &&
      !noCurrentPremium && isNum(monthlyPremium);

    return {
      values: values,
      assumptions: assumptions,
      warnings: warnings,
      hasEnoughDataForExposureChart: hasEnoughDataForExposureChart,
      hasEnoughDataForMedicalEventChart: hasEnoughDataForMedicalEventChart,
      hasEnoughDataForRiskChart: hasEnoughDataForRiskChart
    };
  }

  // ---------------------------------------------------------------------------
  // validateBenchmarkReport(values) → string[]
  // ---------------------------------------------------------------------------
  function validateBenchmarkReport(values) {
    var w = [];

    if (isNum(values.currentMonthlyPremium) && isNum(values.annualPremium)) {
      if (Math.abs(values.annualPremium - values.currentMonthlyPremium * 12) > 1) {
        w.push("Annual premium does not equal monthly premium \u00d7 12.");
      }
    }

    if (isNum(values.maxOutOfPocket) && isNum(values.deductible)) {
      if (values.maxOutOfPocket < values.deductible) {
        w.push("Maximum out-of-pocket is less than deductible.");
      }
    }

    if (isNum(values.coinsuranceExposure) && values.coinsuranceExposure < 0) {
      w.push("Coinsurance exposure is negative.");
    }

    if (isNum(values.estimatedExposureHigh) && isNum(values.estimatedExposureLow)) {
      if (values.estimatedExposureHigh < values.estimatedExposureLow) {
        w.push("Exposure high is less than exposure low.");
      }
    }

    if (isNum(values.exampleUserDeductible) && isNum(values.exampleUserCoinsurance) && isNum(values.exampleInsurancePays)) {
      var eventTotal = values.exampleUserDeductible + values.exampleUserCoinsurance + values.exampleInsurancePays;
      if (Math.abs(eventTotal - (values.exampleMedicalEventCost || 0)) > 1) {
        w.push("Medical event scenario totals do not balance (" + eventTotal + " vs " + values.exampleMedicalEventCost + ").");
      }
    }

    return w;
  }

  // ---------------------------------------------------------------------------
  // Exports
  // ---------------------------------------------------------------------------
  window.buildResolvedBenchmarkReport = buildResolvedBenchmarkReport;
  window.validateBenchmarkReport = validateBenchmarkReport;
  window.formatBenchmarkCurrency = formatCurrency;
})();
