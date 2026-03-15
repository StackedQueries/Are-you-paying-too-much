/**
 * Shared defaults for the benchmark flow. Pages may override RESULT_COPY (and other globals) in inline script after loading this file.
 */
(function () {
  window.MULTIPLIER = window.MULTIPLIER || 11.5;
  window.CTA_URL = window.CTA_URL || "https://richards.health";
  window.CTA_PRIMARY = window.CTA_PRIMARY || "Continue to Coverage Review";
  window.CTA_SUB = window.CTA_SUB || "Review your benchmark and continue with next-step guidance.";
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
})();
