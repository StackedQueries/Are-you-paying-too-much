/**
 * Shared defaults for the benchmark flow. Pages may override RESULT_COPY (and other globals) in inline script after loading this file.
 */
(function () {
  window.MULTIPLIER = window.MULTIPLIER || 11.5;
  window.CTA_URL = window.CTA_URL || "https://richards.health";
  window.CTA_PRIMARY = window.CTA_PRIMARY || "Review My Coverage Options";
  window.CTA_SUB = window.CTA_SUB || "Most consultations take about 10 minutes.";
  window.CONSENT_VERSION_ID = window.CONSENT_VERSION_ID || "v1.0-2026-03";
  window.RESULT_COPY = window.RESULT_COPY || {
    over: { verdict: "Your structure may be inefficient.", detail: "Your premium appears higher than typical benchmarks for your household profile." },
    ballpark: { verdict: "You are in a typical range.", detail: "Your premium aligns with common benchmarks, though structure still matters." },
    under: { verdict: "Lower premium can still mean higher exposure.", detail: "Your premium is below typical benchmarks. That may be positive, but it can also indicate coverage tradeoffs." },
    benchmark_note: "This is a directional benchmark based on your inputs.",
    follow_up: "After submission, a licensed advisor may follow up with tailored next steps."
  };
  window.SITUATION_OPTIONS = window.SITUATION_OPTIONS || [
    { id: "self_employed", label: "Self-employed / business owner" },
    { id: "contractor", label: "Contractor / freelancer / 1099" },
    { id: "small_business_owner", label: "Small business owner comparing options" },
    { id: "leaving_job", label: "Leaving a job" },
    { id: "cobra_expensive", label: "COBRA is too expensive" },
    { id: "between_jobs", label: "Between jobs" },
    { id: "open_enrollment", label: "Open enrollment" },
    { id: "turning_26", label: "Turning 26" },
    { id: "new_state", label: "Moved to a new state" },
    { id: "newly_married", label: "Newly married" },
    { id: "new_baby", label: "New baby" },
    { id: "divorce", label: "Divorce / separation" },
    { id: "early_retirement", label: "Early retirement before Medicare" },
    { id: "missed_open_enrollment", label: "Missed ACA open enrollment" },
    { id: "other", label: "Other" }
  ];

  // Plan intelligence: normalized plan profiles and plan-aware copy for the report.
  window.PLAN_PROFILES = window.PLAN_PROFILES || {
    ACA_MARKETPLACE: {
      id: "ACA_MARKETPLACE",
      label: "ACA Marketplace Plan",
      network_type: "restricted",
      deductible_structure: "high",
      out_of_pocket_risk: "moderate",
      underwriting: false,
      renewal_behavior: "guaranteed",
      tax_treatment: "after_tax",
      suitability_notes: [
        "Best fit when income qualifies for meaningful premium subsidies.",
        "Stronger protections for pre-existing conditions and essential benefits."
      ],
      blind_spots: [
        "Narrow HMO or EPO networks can limit out-of-state or specialist access.",
        "High deductibles and coinsurance can create large one-year exposure."
      ],
      ideal_for: ["lower to moderate income households", "pre-existing conditions"]
    },
    EMPLOYER_GROUP: {
      id: "EMPLOYER_GROUP",
      label: "Employer Group Plan",
      network_type: "broad",
      deductible_structure: "moderate",
      out_of_pocket_risk: "moderate",
      underwriting: false,
      renewal_behavior: "guaranteed",
      tax_treatment: "premium_pre_tax",
      suitability_notes: [
        "Group plans often provide stronger protection for complex conditions.",
        "Pre-tax premiums can improve after-tax affordability."
      ],
      blind_spots: [
        "Adding family members can be significantly more expensive than employee-only coverage.",
        "COBRA or continuation coverage can become cost-inefficient after life changes."
      ],
      ideal_for: ["employees of larger firms", "households with complex medical history"]
    },
    PRIVATE_PPO: {
      id: "PRIVATE_PPO",
      label: "Private PPO / Underwritten Plan",
      network_type: "broad",
      deductible_structure: "moderate",
      out_of_pocket_risk: "moderate",
      underwriting: true,
      renewal_behavior: "underwritten",
      tax_treatment: "after_tax",
      suitability_notes: [
        "Often designed for broader networks and more predictable out-of-pocket exposure.",
        "Can improve access for frequent travelers or multi-state households."
      ],
      blind_spots: [
        "Underwriting means changes in health may affect future eligibility.",
        "Benefits and access can vary meaningfully by carrier and state."
      ],
      ideal_for: ["healthy households", "frequent travelers", "self-employed operators"]
    },
    SHORT_TERM: {
      id: "SHORT_TERM",
      label: "Short-Term Medical Plan",
      network_type: "variable",
      deductible_structure: "high",
      out_of_pocket_risk: "high",
      underwriting: true,
      renewal_behavior: "underwritten",
      tax_treatment: "after_tax",
      suitability_notes: [
        "Short-term plans can temporarily reduce premium outlay.",
        "Often used as a bridge between coverage events."
      ],
      blind_spots: [
        "Pre-existing conditions may be excluded at the time of claim.",
        "Coverage caps and exclusions can leave large gaps in a major claim year."
      ],
      ideal_for: ["short gaps in coverage for generally healthy people"]
    },
    LIMITED_BENEFIT: {
      id: "LIMITED_BENEFIT",
      label: "Limited Benefit / Indemnity Plan",
      network_type: "variable",
      deductible_structure: "very_high",
      out_of_pocket_risk: "severe",
      underwriting: true,
      renewal_behavior: "underwritten",
      tax_treatment: "after_tax",
      suitability_notes: [
        "May provide some first-dollar benefits for minor events.",
        "Best viewed as a supplement, not a full replacement for major medical coverage."
      ],
      blind_spots: [
        "Fixed benefit caps can leave almost all of a major claim unpaid.",
        "No true out-of-pocket maximum on catastrophic events."
      ],
      ideal_for: ["niche supplemental use cases"]
    },
    HEALTH_SHARE: {
      id: "HEALTH_SHARE",
      label: "Health Sharing Plan",
      network_type: "variable",
      deductible_structure: "high",
      out_of_pocket_risk: "high",
      underwriting: false,
      renewal_behavior: "voluntary_share",
      tax_treatment: "after_tax",
      suitability_notes: [
        "Monthly contributions can be lower than traditional insurance for some households.",
        "Appeals to people comfortable with community-based cost sharing."
      ],
      blind_spots: [
        "No true insurance contract or guarantee of payment.",
        "Eligibility and sharing rules can change based on community guidelines."
      ],
      ideal_for: ["households prioritizing lower monthly costs and aligned with membership rules"]
    },
    HDHP_HSA: {
      id: "HDHP_HSA",
      label: "High Deductible HSA Plan",
      network_type: "restricted",
      deductible_structure: "high",
      out_of_pocket_risk: "moderate",
      underwriting: false,
      renewal_behavior: "guaranteed",
      tax_treatment: "hsa_eligible",
      suitability_notes: [
        "HSA eligibility can create meaningful long-term tax advantages.",
        "Works best when you can comfortably cash-flow the higher deductible."
      ],
      blind_spots: [
        "Large out-of-pocket exposure in years with significant claims.",
        "HSA strategy only works when contributions are actually funded."
      ],
      ideal_for: ["higher-income households", "people comfortable self-funding routine care"]
    },
    COBRA: {
      id: "COBRA",
      label: "COBRA Coverage",
      network_type: "broad",
      deductible_structure: "moderate",
      out_of_pocket_risk: "moderate",
      underwriting: false,
      renewal_behavior: "guaranteed",
      tax_treatment: "after_tax",
      suitability_notes: [
        "Lets you keep existing networks and doctors after leaving an employer.",
        "Often best as a short-term bridge, not a multi-year solution."
      ],
      blind_spots: [
        "Employer subsidy may disappear, making premiums much higher than expected.",
        "Limited duration and future premium increases can make long-term cost unpredictable."
      ],
      ideal_for: ["short-term bridge after job changes or during treatment"]
    },
    UNKNOWN: {
      id: "UNKNOWN",
      label: "Current plan (unspecified)",
      network_type: "variable",
      deductible_structure: "moderate",
      out_of_pocket_risk: "moderate",
      underwriting: false,
      renewal_behavior: "unknown",
      tax_treatment: "unknown",
      suitability_notes: [
        "Benchmarking still helps calibrate whether your current premium is directionally appropriate.",
        "A structured review can uncover blind spots in deductible, coinsurance, and network design."
      ],
      blind_spots: [
        "Without clarity on plan type, it’s hard to know how claims will behave.",
        "Many households underestimate total exposure beyond the deductible number."
      ],
      ideal_for: ["any household unsure how their plan really works"]
    }
  };

  window.RESULT_PLAN_COPY = window.RESULT_PLAN_COPY || {
    ACA_MARKETPLACE: {
      summary_tagline: "You’re on an ACA marketplace structure.",
      premium_interpretation_over: "Your premium sits above what many similar marketplace enrollees pay.",
      premium_interpretation_under: "Your premium is lower than typical, but network and cost-sharing still matter."
    },
    EMPLOYER_GROUP: {
      summary_tagline: "You’re covered through an employer group plan.",
      premium_interpretation_over: "Family premiums on group plans can drift well above individual benchmarks.",
      premium_interpretation_under: "Lower premium may still hide exposure in deductibles and out-of-pocket maximums."
    },
    PRIVATE_PPO: {
      summary_tagline: "You’re on a private PPO / underwritten structure.",
      premium_interpretation_over: "Higher premiums may be buying broader networks or richer benefits—worth sanity checking.",
      premium_interpretation_under: "Lower premium can be efficient if underwriting and coverage terms are well-understood."
    },
    SHORT_TERM: {
      summary_tagline: "You’re on a short-term / bridge-style medical plan.",
      premium_interpretation_over: "Higher premiums don’t always translate into better protection on short-term contracts.",
      premium_interpretation_under: "Low premium often reflects exclusions, caps, or strict underwriting at claim time."
    },
    LIMITED_BENEFIT: {
      summary_tagline: "You’re on a limited benefit / indemnity-style plan.",
      premium_interpretation_over: "Spending more on fixed-benefit coverage rarely closes the gap on catastrophic claims.",
      premium_interpretation_under: "Low premium can be fine if you view this only as a supplement—not major medical."
    },
    HEALTH_SHARE: {
      summary_tagline: "You’re using a health sharing arrangement.",
      premium_interpretation_over: "Higher contributions don’t necessarily guarantee more predictable claim sharing.",
      premium_interpretation_under: "Lower contributions come with tradeoffs in certainty and contract protections."
    },
    HDHP_HSA: {
      summary_tagline: "You’re on a high deductible, HSA-eligible structure.",
      premium_interpretation_over: "Higher premium may not be necessary if you’re also self-funding a large deductible.",
      premium_interpretation_under: "Lower premium can work well when HSA contributions are funded consistently."
    },
    COBRA: {
      summary_tagline: "You’re on COBRA continuation coverage.",
      premium_interpretation_over: "COBRA premiums often jump once the employer subsidy disappears.",
      premium_interpretation_under: "If COBRA costs are modest, it can be an efficient short-term bridge."
    },
    UNKNOWN: {
      summary_tagline: "You’re benchmarking an existing structure.",
      premium_interpretation_over: "Your premium appears higher than typical benchmarks—worth a closer look.",
      premium_interpretation_under: "Your premium is below typical; structure still deserves a sanity check."
    }
  };

  window.STRATEGY_COPY = window.STRATEGY_COPY || {
    SHORT_TERM: {
      option3_title: "Option 3 — Transition to a more predictable structure",
      option3_bullets: [
        "Trade low premium for clearer rules on what’s covered in a major claim.",
        "Compare ACA or private PPO strategies available in your state."
      ]
    },
    LIMITED_BENEFIT: {
      option3_title: "Option 3 — Add or replace with major medical coverage",
      option3_bullets: [
        "Use limited benefit coverage only as a supplement, not the primary safety net.",
        "Evaluate ACA or private PPO options to cap worst-case exposure."
      ]
    },
    HEALTH_SHARE: {
      option3_title: "Option 3 — Pair or replace with contractual coverage",
      option3_bullets: [
        "Consider pairing sharing arrangements with a more predictable major medical structure.",
        "Model worst-case years assuming sharing is delayed or limited."
      ]
    },
    COBRA: {
      option3_title: "Option 3 — Compare COBRA to individual strategies",
      option3_bullets: [
        "Benchmark COBRA premiums against ACA and private options in your state.",
        "Time the transition so you don’t create gaps in treatment or networks."
      ]
    }
  };
})();
