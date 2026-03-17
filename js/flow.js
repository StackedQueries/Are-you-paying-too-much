(function () {
  var DEPLOY_ENDPOINT = "https://script.google.com/macros/s/AKfycbwNb3E_BfV8vT_5A5u2VOrg4Oz9nwaoEWPQGtzMXkxOC9nI4gw8WvVSPGIJYILfQZ8u/exec";
  window.FORM_ACTION_URL = DEPLOY_ENDPOINT;

  var form = document.getElementById("flow-form");
  if (!form) return;

  var pageContext = window.__PAGE_CONTEXT__ || {};
  var progressFill = document.getElementById("flow-progress-fill");
  var progressCount = document.getElementById("flow-progress-count");
  var flowShell = document.getElementById("flow-shell");
  var resultEl = document.getElementById("result");
  var resultMetaEl = document.getElementById("result-meta");
  var flowStartOverWrap = document.getElementById("flow-start-over-wrap");
  var flowStartOverBtn = document.getElementById("flow-start-over");
  var progressLabelEl = document.querySelector(".flow-progress-label");
  var momentumMessageEl = document.getElementById("flow-momentum-message");

  var state = {
    visibleSteps: [],
    currentStep: null,
    selectedSituation: null,
    contextStepSkipped: false,
    situationSource: "user_select",
    spouseAdded: false,
    childCount: 0,
    data: {}
  };

  var FLOW_STORAGE_KEY = "flow_state";
  var FLOW_STORAGE_TTL_MS = 30 * 60 * 1000;
  var MAX_CHILDREN = 20;

  var STEP_LABELS = {
    1: "Situation",
    2: "Household",
    3: "Health",
    4: "Coverage",
    5: "Benchmark"
  };

  var STEP_TIME_LABELS = [
    "About 60 seconds remaining",
    "About 45 seconds remaining",
    "About 30 seconds remaining",
    "About 15 seconds remaining",
    "Under 10 seconds remaining"
  ];

  function parseNum(val) {
    var n = Number(val);
    return Number.isFinite(n) ? n : NaN;
  }

  function digitsOnly(val) {
    return String(val || "").replace(/\D+/g, "");
  }

  function ensureChartJs(callback) {
    if (window.Chart && typeof callback === "function") {
      callback();
      return;
    }
    if (!document || !document.createElement) {
      if (typeof callback === "function") callback();
      return;
    }
    var existing = document.querySelector('script[data-rh-chartjs="1"]');
    if (existing) {
      existing.addEventListener("load", function () {
        if (typeof callback === "function") callback();
      }, { once: true });
      return;
    }
    var script = document.createElement("script");
    script.src = "https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js";
    script.async = true;
    script.setAttribute("data-rh-chartjs", "1");
    script.onload = function () {
      if (typeof callback === "function") callback();
    };
    document.head.appendChild(script);
  }

  function resolveVisibleSteps() {
    var known = !!pageContext.situation_preselect;
    state.contextStepSkipped = known;
    state.selectedSituation = known ? pageContext.situation_preselect : null;
    state.situationSource = known ? "route_preselect" : "user_select";
    state.visibleSteps = known ? [2, 3, 4, 5] : [1, 2, 3, 4, 5];
  }

  function updateProgress(stepNum) {
    var idx = state.visibleSteps.indexOf(stepNum);
    var total = state.visibleSteps.length;
    if (idx === -1) return;
    var current = idx + 1;
    var pct = ((current / total) * 100).toFixed(2) + "%";
    if (progressFill) {
      progressFill.style.width = pct;
      progressFill.setAttribute("aria-valuenow", current);
      progressFill.setAttribute("aria-valuemin", "0");
      progressFill.setAttribute("aria-valuemax", String(total));
      progressFill.setAttribute("role", "progressbar");
    }
    var stepLabel = STEP_LABELS[stepNum] || "Step";
    if (progressLabelEl) {
      progressLabelEl.textContent = "Step " + current + " — " + stepLabel;
    }
    if (progressCount) {
      var remainingText = STEP_TIME_LABELS[idx] || "Under 30 seconds remaining";
      progressCount.textContent = remainingText;
    }
  }

  var prefersReducedMotion = function () {
    return window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  };

  function runStepTransition(fromStepNum, toStepNum, done) {
    var fromPanel = form.querySelector('.flow-step-panel[data-step="' + fromStepNum + '"]');
    var toPanel = form.querySelector('.flow-step-panel[data-step="' + toStepNum + '"]');
    if (!fromPanel || !toPanel || prefersReducedMotion()) {
      if (fromPanel) fromPanel.classList.add("hidden");
      if (toPanel) toPanel.classList.remove("hidden");
      done();
      return;
    }
    var doneOnce = false;
    function finish() {
      if (doneOnce) return;
      doneOnce = true;
      done();
    }
    fromPanel.classList.remove("hidden");
    fromPanel.classList.add("leaving");
    var onLeavingEnd = function () {
      fromPanel.removeEventListener("transitionend", onLeavingEnd);
      fromPanel.classList.remove("leaving");
      fromPanel.classList.add("hidden");
      toPanel.classList.remove("hidden");
      toPanel.classList.add("entering");
      requestAnimationFrame(function () {
        requestAnimationFrame(function () {
          toPanel.classList.remove("entering");
          toPanel.addEventListener("transitionend", function onEnteringEnd() {
            toPanel.removeEventListener("transitionend", onEnteringEnd);
            finish();
          });
          setTimeout(finish, 320);
        });
      });
    };
    fromPanel.addEventListener("transitionend", onLeavingEnd);
    setTimeout(onLeavingEnd, 280);
  }

  function setStepVisible(stepNum) {
    var fromStep = state.currentStep;
    var panels = form.querySelectorAll(".flow-step-panel");
    if (fromStep !== null && fromStep !== stepNum) {
      runStepTransition(fromStep, stepNum, function () {
        state.currentStep = stepNum;
        updateProgress(stepNum);
        updateSupportingSectionsForStep(stepNum);
        if (window.rhTrack) window.rhTrack("step_view", { step_number: stepNum, page_id: pageContext.page_id || "" });
        var panel = form.querySelector('.flow-step-panel[data-step="' + stepNum + '"]');
        var first = panel && panel.querySelector("button, input, select, [tabindex='0']");
        if (first) requestAnimationFrame(function () { first.focus(); });
        if (flowStartOverWrap) flowStartOverWrap.setAttribute("aria-hidden", stepNum >= 2 ? "false" : "true");
        saveFlowState();
        if (stepNum > 2 && flowShell && typeof flowShell.scrollIntoView === "function") {
          flowShell.scrollIntoView({ behavior: "smooth", block: "start" });
        }
      });
      return;
    }
    panels.forEach(function (panel) {
      var panelStep = Number(panel.getAttribute("data-step"));
      panel.classList.toggle("hidden", panelStep !== stepNum);
    });
    state.currentStep = stepNum;
    updateProgress(stepNum);
    updateSupportingSectionsForStep(stepNum);
    if (window.rhTrack) window.rhTrack("step_view", { step_number: stepNum, page_id: pageContext.page_id || "" });
    var panel = form.querySelector('.flow-step-panel[data-step="' + stepNum + '"]');
    var first = panel && panel.querySelector("button, input, select, [tabindex='0']");
    if (first) requestAnimationFrame(function () { first.focus(); });
    if (flowStartOverWrap) flowStartOverWrap.setAttribute("aria-hidden", stepNum >= 2 ? "false" : "true");
    saveFlowState();
    if (stepNum > 2 && flowShell && typeof flowShell.scrollIntoView === "function") {
      flowShell.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }

  function getNextStep(stepNum) {
    var idx = state.visibleSteps.indexOf(stepNum);
    return idx >= 0 && idx < state.visibleSteps.length - 1 ? state.visibleSteps[idx + 1] : null;
  }

  function getPrevStep(stepNum) {
    var idx = state.visibleSteps.indexOf(stepNum);
    return idx > 0 ? state.visibleSteps[idx - 1] : null;
  }

  function serializeFormState() {
    var out = {};
    form.querySelectorAll("input, select, textarea").forEach(function (el) {
      var name = el.name;
      if (!name) return;
      if (el.type === "checkbox" || el.type === "radio") out[name] = el.checked ? (el.value || "yes") : "";
      else out[name] = el.value || "";
    });
    return out;
  }

  function saveFlowState() {
    try {
      var stepIndex = state.currentStep !== null ? state.visibleSteps.indexOf(state.currentStep) : 0;
      if (stepIndex < 0) stepIndex = 0;
      var hasSpouse = !!form.querySelector('[data-role="spouse"]');
      var childCount = form.querySelectorAll('[data-role="child"]').length;
      var payload = {
        page_id: pageContext.page_id || "home",
        stepIndex: stepIndex,
        formState: serializeFormState(),
        hasSpouse: hasSpouse,
        childCount: childCount,
        selectedSituation: state.selectedSituation || null,
        savedAt: Date.now()
      };
      sessionStorage.setItem(FLOW_STORAGE_KEY, JSON.stringify(payload));
    } catch (e) {}
  }

  function saveCompletedResult(report) {
    try {
      var v = report.values;
      var payload = {
        page_id: pageContext.page_id || "home",
        completed: true,
        resultType: report.resultType || "ballpark",
        premium: v.currentMonthlyPremium || 0,
        benchmark: v.directionalBenchmark || 0,
        noCurrentPremium: v.currentMonthlyPremium === null ? "yes" : "no",
        householdSize: v.householdSize || 1,
        reportInput: {
          monthlyPremium: v.currentMonthlyPremium,
          noCurrentPremium: v.currentMonthlyPremium === null,
          householdSize: v.householdSize,
          state: (pageContext.state || "").toUpperCase() || null,
          formulaBenchmark: v.directionalBenchmark
        },
        savedAt: Date.now()
      };
      sessionStorage.setItem(FLOW_STORAGE_KEY, JSON.stringify(payload));
    } catch (e) {}
  }

  function loadFlowState() {
    try {
      var raw = sessionStorage.getItem(FLOW_STORAGE_KEY);
      if (!raw) return null;
      var payload = JSON.parse(raw);
      if (payload.page_id !== (pageContext.page_id || "home")) return null;
      if (payload.completed) return payload;
      if (Date.now() - (payload.savedAt || 0) > FLOW_STORAGE_TTL_MS) {
        sessionStorage.removeItem(FLOW_STORAGE_KEY);
        return null;
      }
      return payload;
    } catch (e) {
      return null;
    }
  }

  function clearFlowState() {
    try {
      sessionStorage.removeItem(FLOW_STORAGE_KEY);
    } catch (e) {}
  }

  function restoreHouseholdFromSaved(hasSpouse, childCount) {
    state.spouseAdded = false;
    state.childCount = 0;
    if (hasSpouse) addSpouseRow();
    for (var i = 0; i < childCount; i++) addChildRow();
  }

  function applyFormState(formState) {
    for (var name in formState) {
      var el = form.querySelector('[name="' + name + '"]');
      if (!el) continue;
      var val = formState[name];
      if (el.type === "checkbox" || el.type === "radio") el.checked = !!val && (val === "yes" || val === el.value);
      else el.value = val;
    }
  }

  function restoreFlowState(saved) {
    if (!saved || saved.stepIndex == null) return false;
    var stepNum = state.visibleSteps[saved.stepIndex];
    if (stepNum == null) stepNum = state.visibleSteps[0];
    if (saved.selectedSituation) state.selectedSituation = saved.selectedSituation;
    restoreHouseholdFromSaved(!!saved.hasSpouse, Math.min(Number(saved.childCount) || 0, MAX_CHILDREN));
    if (stepNum >= 3 && document.getElementById("person-details-step-inner")) buildPersonDetailsStep();
    if (saved.formState && typeof saved.formState === "object") applyFormState(saved.formState);
    if (stepNum === 1 && state.selectedSituation) {
      form.querySelectorAll(".situation-option").forEach(function (btn) {
        var sel = btn.getAttribute("data-situation") === state.selectedSituation;
        btn.classList.toggle("btn-primary", sel);
        btn.classList.toggle("btn-outline", !sel);
      });
    }
    state.currentStep = stepNum;
    var panels = form.querySelectorAll(".flow-step-panel");
    panels.forEach(function (panel) {
      var panelStep = Number(panel.getAttribute("data-step"));
      panel.classList.toggle("hidden", panelStep !== stepNum);
    });
    updateProgress(stepNum);
    updateSupportingSectionsForStep(stepNum);
    if (flowStartOverWrap) flowStartOverWrap.setAttribute("aria-hidden", stepNum >= 2 ? "false" : "true");
    var panel = form.querySelector('.flow-step-panel[data-step="' + stepNum + '"]');
    var first = panel && panel.querySelector("button, input, select, [tabindex='0']");
    if (first) requestAnimationFrame(function () { first.focus(); });
    if (window.rhTrack) window.rhTrack("flow_restored", { page_id: pageContext.page_id || "", step: stepNum });
    return true;
  }

  function getContextRoute(situationId) {
    var routes = {
      self_employed: "/self-employed/",
      contractor: "/contractor/",
      small_business_owner: "/small-business-owner/",
      leaving_job: "/leaving-job/",
      cobra_expensive: "/cobra-too-expensive/",
      between_jobs: "/between-jobs/",
      open_enrollment: "/open-enrollment/",
      turning_26: "/turning-26/",
      new_state: "/new-state/",
      newly_married: "/newly-married/",
      new_baby: "/new-baby/",
      divorce: "/divorce/",
      early_retirement: "/early-retirement/",
      missed_open_enrollment: "/missed-open-enrollment/"
    };
    return routes[situationId] || "";
  }

  function setError(stepNum, message) {
    var el = document.getElementById("step" + stepNum + "-error");
    if (el) el.textContent = message || "";
  }

  function ageFromBirthday(birthdayStr) {
    if (!birthdayStr || !birthdayStr.trim()) return null;
    var d = new Date(birthdayStr.trim());
    if (isNaN(d.getTime())) return null;
    var today = new Date();
    var age = today.getFullYear() - d.getFullYear();
    var m = today.getMonth() - d.getMonth();
    if (m < 0 || (m === 0 && today.getDate() < d.getDate())) age--;
    return age >= 0 && age <= 120 ? age : null;
  }

  function removeTrustStrip() {
    document.querySelectorAll(".trust-strip").forEach(function (el) {
      el.remove();
    });
  }

  function ensureIntroCardHeading() {
    if (!flowShell) return;
    var introCard = flowShell.previousElementSibling;
    if (!introCard || !introCard.classList.contains("card")) return;
    if (introCard.querySelector(".card-title")) return;

    var labelEl = document.querySelector("header .label");
    var h1El = document.querySelector("header h1");
    var labelText = labelEl ? labelEl.textContent.trim() : "";
    var h1Text = h1El ? h1El.textContent.trim() : "";
    var headingText = "Coverage";

    if (labelText) {
      headingText = labelText + " coverage";
    } else if (h1Text) {
      headingText = h1Text;
    }

    var heading = document.createElement("h2");
    heading.className = "card-title";
    heading.textContent = headingText;
    introCard.insertBefore(heading, introCard.firstChild);
  }

  function updateSupportingSectionsForStep(stepNum) {
    var isFirstVisibleStep = state.visibleSteps.length ? state.visibleSteps[0] === stepNum : stepNum === 1;
    var show = isFirstVisibleStep;
    [".trust-strip", ".pillar-card"].forEach(function (selector) {
      document.querySelectorAll(selector).forEach(function (el) {
        el.style.display = show ? "" : "none";
      });
    });
  }

  function ensureMomentumMessageElement() {
    if (momentumMessageEl || !flowShell) return;
    var existing = document.getElementById("flow-momentum-message");
    if (existing) {
      momentumMessageEl = existing;
      return;
    }
    var progressEl = document.getElementById("flow-progress");
    var msg = document.createElement("p");
    msg.id = "flow-momentum-message";
    msg.className = "flow-momentum-message";
    msg.setAttribute("aria-live", "polite");
    msg.textContent = "";
    if (progressEl && progressEl.parentNode === flowShell) {
      flowShell.insertBefore(msg, progressEl.nextSibling);
    } else {
      flowShell.insertBefore(msg, flowShell.firstChild || null);
    }
    momentumMessageEl = msg;
  }

  var MOMENTUM_MESSAGES = {
    1: "Great \u2014 that helps refine your benchmark.",
    2: "Perfect \u2014 your household details are set.",
    3: "Thanks \u2014 this improves benchmark accuracy.",
    4: "You\u2019re almost done \u2014 benchmark is ready."
  };

  function showMomentumMessage(stepNum) {
    ensureMomentumMessageElement();
    if (!momentumMessageEl) return;
    var msg = MOMENTUM_MESSAGES[stepNum];
    if (!msg) {
      momentumMessageEl.textContent = "";
      momentumMessageEl.classList.remove("flow-momentum-message--visible");
      return;
    }
    momentumMessageEl.textContent = msg;
    momentumMessageEl.classList.remove("flow-momentum-message--visible");
    if (prefersReducedMotion()) {
      momentumMessageEl.classList.add("flow-momentum-message--visible");
      return;
    }
    requestAnimationFrame(function () {
      requestAnimationFrame(function () {
        momentumMessageEl.classList.add("flow-momentum-message--visible");
      });
    });
  }

  function personFieldsHtml(prefix, roleLabel, roleKey, nameOnly) {
    var id = function (s) { return prefix + s; };
    var req = '<span class="required" aria-hidden="true">*</span>';
    var card =
      '<div class="person-card" data-role="' + roleKey + '" data-prefix="' + prefix + '">' +
      '<div class="person-card-header">' +
      '<span class="person-role">' + roleLabel + "</span>" +
      '<button type="button" class="btn-remove-person" aria-label="Remove ' + roleLabel + '">Remove</button>' +
      "</div>" +
      '<div class="field">' +
      '<label for="' + id("name") + '">Full name ' + req + '</label>' +
      '<input type="text" id="' + id("name") + '" name="' + id("name") + '" placeholder="e.g. Jane Smith">' +
      "</div>";
    if (nameOnly) return card + "</div>";
    return card +
      '<div class="field">' +
      '<label for="' + id("birthday") + '">Birthday ' + req + '</label>' +
      '<input type="date" id="' + id("birthday") + '" name="' + id("birthday") + '">' +
      "</div>" +
      '<div class="row">' +
      '<div class="field">' +
      '<label for="' + id("height") + '">Height (optional)</label>' +
      '<input type="text" id="' + id("height") + '" name="' + id("height") + '" placeholder="e.g. 5 ft 10 in or 70 in">' +
      '<p class="helper">Feet and inches, or total inches</p>' +
      "</div>" +
      '<div class="field">' +
      '<label for="' + id("weight") + '">Weight (lbs) (optional)</label>' +
      '<input type="number" id="' + id("weight") + '" name="' + id("weight") + '" min="1" max="999" step="0.1" placeholder="e.g. 150">' +
      "</div>" +
      "</div>" +
      '<div class="field">' +
      '<span class="label" style="margin-bottom:0.5rem;display:block;">Health</span>' +
      '<div class="checkbox-group">' +
      '<label class="checkbox-label"><input type="checkbox" id="' + id("smoker") + '" name="' + id("smoker") + '" value="yes"> Smoker</label>' +
      '<label class="checkbox-label"><input type="checkbox" id="' + id("high_blood_pressure") + '" name="' + id("high_blood_pressure") + '" value="yes"> High blood pressure</label>' +
      '<label class="checkbox-label"><input type="checkbox" id="' + id("diabetes") + '" name="' + id("diabetes") + '" value="yes"> Diabetes</label>' +
      "</div>" +
      "</div>" +
      '<div class="field">' +
      '<label for="' + id("medications") + '">Current medications (optional)</label>' +
      '<textarea id="' + id("medications") + '" name="' + id("medications") + '" rows="3" placeholder="List any current medications"></textarea>' +
      "</div>" +
      "</div>";
  }

  function personDetailsFieldsHtml(prefix, displayName) {
    var id = function (s) { return prefix + s; };
    var req = '<span class="required" aria-hidden="true">*</span>';
    return (
      '<div class="person-details-section" data-prefix="' + prefix + '">' +
      '<p class="person-details-heading">' + escapeHtml(displayName) + '</p>' +
      '<div class="field">' +
      '<label for="' + id("birthday") + '">Birthday ' + req + '</label>' +
      '<input type="date" id="' + id("birthday") + '" name="' + id("birthday") + '">' +
      "</div>" +
      '<div class="field">' +
      '<label for="' + id("gender") + '">Gender ' + req + '</label>' +
      '<select id="' + id("gender") + '" name="' + id("gender") + '" required>' +
      '<option value="">Select</option>' +
      '<option value="male">Male</option>' +
      '<option value="female">Female</option>' +
      '<option value="non_binary">Non-binary</option>' +
      '<option value="prefer_not_to_say">Prefer not to say</option>' +
      "</select>" +
      "</div>" +
      '<div class="row">' +
      '<div class="field">' +
      '<label for="' + id("height") + '">Height (optional)</label>' +
      '<input type="text" id="' + id("height") + '" name="' + id("height") + '" placeholder="e.g. 5 ft 10 in or 70 in">' +
      '<p class="helper">Feet and inches, or total inches</p>' +
      "</div>" +
      '<div class="field">' +
      '<label for="' + id("weight") + '">Weight (lbs) (optional)</label>' +
      '<input type="number" id="' + id("weight") + '" name="' + id("weight") + '" min="1" max="999" step="0.1" placeholder="e.g. 150">' +
      "</div>" +
      "</div>" +
      '<div class="field">' +
      '<span class="label" style="margin-bottom:0.5rem;display:block;">Health</span>' +
      '<div class="checkbox-group">' +
      '<label class="checkbox-label"><input type="checkbox" id="' + id("smoker") + '" name="' + id("smoker") + '" value="yes"> Smoker</label>' +
      '<label class="checkbox-label"><input type="checkbox" id="' + id("high_blood_pressure") + '" name="' + id("high_blood_pressure") + '" value="yes"> High blood pressure</label>' +
      '<label class="checkbox-label"><input type="checkbox" id="' + id("diabetes") + '" name="' + id("diabetes") + '" value="yes"> Diabetes</label>' +
      "</div>" +
      "</div>" +
      '<div class="field">' +
      '<label for="' + id("medications") + '">Current medications (optional)</label>' +
      '<textarea id="' + id("medications") + '" name="' + id("medications") + '" rows="3" placeholder="List any current medications"></textarea>' +
      "</div>" +
      "</div>"
    );
  }

  function escapeHtml(text) {
    var div = document.createElement("div");
    div.textContent = text;
    return div.innerHTML;
  }

  function householdRowHtml(role, roleLabel, prefix) {
    var req = '<span class="required" aria-hidden="true">*</span>';
    var id = prefix + "name";
    return (
      '<div class="household-row" data-role="' + role + '" data-prefix="' + prefix + '">' +
      '<label for="' + id + '">' + escapeHtml(roleLabel) + ' ' + req + '</label>' +
      '<input type="text" id="' + id + '" name="' + prefix + 'name" placeholder="e.g. Jane Smith">' +
      '<button type="button" class="btn-remove-person" aria-label="Remove ' + escapeHtml(roleLabel) + '">Remove</button>' +
      "</div>"
    );
  }

  function buildHouseholdStep() {
    var container = document.getElementById("household-step-inner");
    if (!container) return;
    var req = '<span class="required" aria-hidden="true">*</span>';
    var primaryBlock =
      '<div class="household-block">' +
      '<div class="household-presets" id="household-presets">' +
      '<p class="household-presets-label">Quick setup</p>' +
      '<div class="household-presets-buttons">' +
      '<button type="button" class="btn btn-secondary household-preset" data-preset="just_me">Just me</button>' +
      '<button type="button" class="btn btn-secondary household-preset" data-preset="me_spouse">Me + spouse</button>' +
      '<button type="button" class="btn btn-secondary household-preset" data-preset="family">Family</button>' +
      "</div>" +
      "</div>" +
      '<div class="household-card-single person-card primary" data-role="primary" data-prefix="primary_">' +
      '<div class="person-card-header"><span class="person-role">Primary</span></div>' +
      '<div class="field">' +
      '<label for="primary_name">Full name ' + req + '</label>' +
      '<input type="text" id="primary_name" name="primary_name" placeholder="e.g. Jane Smith">' +
      "</div>" +
      '<p class="household-dependents-heading">Spouse & dependents</p>' +
      '<div id="spouse-slot"></div>' +
      '<div id="children-slot"></div>' +
      '<div class="household-add-buttons">' +
      '<button type="button" class="btn btn-secondary" id="add-spouse">+ Add spouse</button>' +
      '<button type="button" class="btn btn-secondary" id="add-child">+ Add child</button>' +
      "</div>" +
      "</div>" +
      "</div>";
    container.innerHTML = primaryBlock;
    updateAddSpouseButtonState();
    updateAddChildButtonState();
    var heading = container.querySelector(".household-dependents-heading");
    if (heading) heading.style.display = "none";
  }

  function animateRowIn(row) {
    if (!row || prefersReducedMotion()) return;
    row.classList.add("household-row--entering");
    requestAnimationFrame(function () {
      requestAnimationFrame(function () {
        row.classList.remove("household-row--entering");
      });
    });
  }

  function addSpouseRow() {
    var slot = document.getElementById("spouse-slot");
    if (!slot || slot.querySelector(".household-row")) return;
    state.spouseAdded = true;
    var wrap = document.createElement("div");
    wrap.innerHTML = householdRowHtml("spouse", "Spouse", "spouse_");
    var row = wrap.firstElementChild;
    slot.appendChild(row);
    updateAddSpouseButtonState();
    animateRowIn(row);
    var heading = document.querySelector(".household-dependents-heading");
    if (heading) heading.style.display = "";
    saveFlowState();
  }

  function updateAddChildButtonState() {
    var btn = document.getElementById("add-child");
    var slot = document.getElementById("children-slot");
    if (btn && slot) btn.disabled = slot.querySelectorAll(".household-row").length >= MAX_CHILDREN;
  }

  function updateAddSpouseButtonState() {
    var btn = document.getElementById("add-spouse");
    var slot = document.getElementById("spouse-slot");
    if (btn && slot) btn.disabled = !!slot.querySelector(".household-row");
  }

  function addChildRow() {
    var slot = document.getElementById("children-slot");
    if (!slot) return;
    var existing = slot.querySelectorAll(".household-row");
    if (existing.length >= MAX_CHILDREN) return;
    state.childCount = (state.childCount || 0) + 1;
    var idx = state.childCount;
    var prefix = "child_" + idx + "_";
    var wrap = document.createElement("div");
    wrap.innerHTML = householdRowHtml("child", "Child " + idx, prefix);
    var row = wrap.firstElementChild;
    row.classList.add("household-row--entering");
    slot.appendChild(row);
    updateAddChildButtonState();
    var heading = document.querySelector(".household-dependents-heading");
    if (heading) heading.style.display = "";
    saveFlowState();
    if (prefersReducedMotion()) row.classList.remove("household-row--entering");
    else {
      requestAnimationFrame(function () {
        requestAnimationFrame(function () {
          row.classList.remove("household-row--entering");
        });
      });
    }
  }

  function clearDependents() {
    var spouseSlot = document.getElementById("spouse-slot");
    var childrenSlot = document.getElementById("children-slot");
    if (spouseSlot) spouseSlot.innerHTML = "";
    if (childrenSlot) childrenSlot.innerHTML = "";
    state.spouseAdded = false;
    state.childCount = 0;
    updateAddSpouseButtonState();
    updateAddChildButtonState();
    var heading = document.querySelector(".household-dependents-heading");
    if (heading) heading.style.display = "none";
  }

  function applyHouseholdPreset(preset) {
    clearDependents();
    var primaryName = document.getElementById("primary_name");
    if (preset === "just_me") {
      if (primaryName && !primaryName.value) primaryName.focus();
      saveFlowState();
      return;
    }
    if (preset === "me_spouse" || preset === "family") {
      addSpouseRow();
    }
    if (preset === "family") {
      addChildRow();
      addChildRow();
    }
    saveFlowState();
  }

  function getPeopleFromStep2() {
    var people = [];
    var primaryNameEl = document.getElementById("primary_name");
    var primaryName = primaryNameEl ? (primaryNameEl.value || "").trim() : "";
    if (primaryName) people.push({ prefix: "primary_", roleLabel: "Primary", displayName: primaryName });
    var spouseCard = form.querySelector('[data-role="spouse"]');
    if (spouseCard) {
      var spouseNameEl = form.querySelector('[name="spouse_name"]');
      var spouseName = spouseNameEl ? (spouseNameEl.value || "").trim() : "";
      people.push({ prefix: "spouse_", roleLabel: "Spouse", displayName: spouseName || "Spouse" });
    }
    form.querySelectorAll('[data-role="child"]').forEach(function (card, i) {
      var prefix = card.getAttribute("data-prefix") || "child_" + (i + 1) + "_";
      var nameEl = form.querySelector('[name="' + prefix + 'name"]');
      var name = nameEl ? (nameEl.value || "").trim() : "";
      people.push({ prefix: prefix, roleLabel: "Child " + (i + 1), displayName: name || ("Child " + (i + 1)) });
    });
    return people;
  }

  function buildPersonDetailsStep() {
    var container = document.getElementById("person-details-step-inner");
    if (!container) return;
    var people = getPeopleFromStep2();
    var html = "";
    people.forEach(function (p) {
      var heading = p.roleLabel + ": " + p.displayName;
      html += personDetailsFieldsHtml(p.prefix, heading);
    });
    container.innerHTML = html;
    if (!people.some(function (p) { return p.roleLabel === "Spouse"; })) {
      container.querySelectorAll('.person-details-section[data-prefix^="spouse_"]').forEach(function (el) {
        el.parentNode && el.parentNode.removeChild(el);
      });
    }
  }

  function getPrimaryPayload() {
    var g = function (id) {
      var el = document.getElementById(id);
      return el ? (el.type === "checkbox" ? el.checked : (el.value || "").trim()) : "";
    };
    var fullName = g("full-name") || g("primary_name");
    var premiumRaw = g("premium");
    var unknownBtn = document.getElementById("premium-unknown");
    var isUnknown = !!(unknownBtn && unknownBtn.getAttribute("data-unknown") === "1");
    var hasPremium = premiumRaw !== "" && !isUnknown;
    /* Name from step 2; birthday, gender, height, weight, health from step 3 (person details); contact/coverage from steps 4–5 */
    return {
      name: fullName,
      phone: g("phone"),
      email: g("email"),
      zip: digitsOnly(g("zip")),
      birthday: g("primary_birthday"),
      gender: g("primary_gender") || "",
      height: g("primary_height") || "",
      weight: g("primary_weight") || "",
      smoker: !!(document.getElementById("primary_smoker") && document.getElementById("primary_smoker").checked),
      high_blood_pressure: !!(document.getElementById("primary_high_blood_pressure") && document.getElementById("primary_high_blood_pressure").checked),
      diabetes: !!(document.getElementById("primary_diabetes") && document.getElementById("primary_diabetes").checked),
      medications: g("primary_medications") || "",
      premium: hasPremium ? parseNum(premiumRaw) : null,
      no_current_premium: hasPremium ? "no" : "yes",
      coverage_status: g("coverage-status"),
      coverage_priority: g("coverage-priority"),
      current_plan_type: g("current-plan-type")
    };
  }

  function getPersonPayload(prefix) {
    var root = form.querySelector('[data-prefix="' + prefix + '"]');
    if (!root) return null;
    var get = function (n) {
      var el = form.querySelector('[name="' + prefix + n + '"]');
      if (!el) return "";
      return el.type === "checkbox" ? el.checked : (el.value || "").trim();
    };
    var smokerEl = form.querySelector('[name="' + prefix + 'smoker"]');
    var hbpEl = form.querySelector('[name="' + prefix + 'high_blood_pressure"]');
    var diabetesEl = form.querySelector('[name="' + prefix + 'diabetes"]');
    return {
      name: get("name"),
      birthday: get("birthday"),
      gender: get("gender"),
      height: get("height"),
      weight: get("weight"),
      medications: get("medications") || "",
      smoker: smokerEl ? smokerEl.checked : false,
      high_blood_pressure: hbpEl ? hbpEl.checked : false,
      diabetes: diabetesEl ? diabetesEl.checked : false
    };
  }

  function collectPeople() {
    var people = [{ role: "primary", payload: getPrimaryPayload(), intake_parent_id: null }];
    var spouseCard = form.querySelector('[data-role="spouse"]');
    if (spouseCard) {
      var p = getPersonPayload("spouse_");
      if (p && (p.name || p.birthday || p.height || p.weight)) {
        people.push({ role: "spouse", payload: p, intake_parent_id: null });
      }
    }
    form.querySelectorAll('[data-role="child"]').forEach(function (card) {
      var prefix = card.getAttribute("data-prefix") || "";
      var p = getPersonPayload(prefix);
      if (p && (p.name || p.birthday || p.height || p.weight)) {
        people.push({ role: "child", payload: p, intake_parent_id: null });
      }
    });
    return people;
  }

  function buildSituationOptions() {
    var wrap = document.getElementById("situation-options");
    if (!wrap) return;
    var options = window.SITUATION_OPTIONS || (function () {
      var stepDef = (window.FLOW_STEPS || []).find(function (s) { return s.id === "situation"; });
      return (stepDef && stepDef.options) || [];
    })();
    if (!state.selectedSituation && !pageContext.situation_preselect) {
      state.selectedSituation = "self_employed";
      state.situationSource = "default";
    }
    var html = options.map(function (opt) {
      var isSelected = opt.id === state.selectedSituation;
      var classes = "btn situation-option " + (isSelected ? "btn-primary situation-option--selected" : "btn-outline");
      return '<button type="button" class="' + classes + '" data-situation="' + opt.id + '">' + opt.label + "</button>";
    }).join("");
    wrap.innerHTML = html;
    syncSituationSelectionUI();
  }

  function syncSituationSelectionUI() {
    var wrap = document.getElementById("situation-options");
    if (!wrap) return;
    var selectedId = state.selectedSituation;
    var buttons = wrap.querySelectorAll(".situation-option");
    buttons.forEach(function (btn) {
      var isSelected = btn.getAttribute("data-situation") === selectedId;
      btn.classList.toggle("btn-primary", isSelected);
      btn.classList.toggle("btn-outline", !isSelected);
      btn.classList.toggle("situation-option--selected", isSelected);
    });
    var step1Panel = form.querySelector('.flow-step-panel[data-step="1"]');
    if (step1Panel) {
      var cta = step1Panel.querySelector(".flow-next");
      if (cta) {
        var enabled = !!selectedId;
        cta.disabled = !enabled;
        cta.classList.toggle("btn-disabled", !enabled);
      }
    }
  }

  function enhanceContactStep() {
    var label = form.querySelector('label[for="first-name"]');
    var input = document.getElementById("first-name");
    if (label) label.textContent = "Full name";
    if (input) input.placeholder = "e.g. Jane Smith";
  }

  function validateStep1() {
    if (!state.selectedSituation) {
      setError(1, "Please select your situation.");
      return false;
    }
    setError(1, "");
    return true;
  }

  function validateHousehold() {
    var name = (document.getElementById("primary_name") && document.getElementById("primary_name").value) || "";
    if (!name.trim() || name.trim().length < 2) {
      setError(2, "Please enter your name.");
      return false;
    }
    var spouseCard = form.querySelector('[data-role="spouse"]');
    if (spouseCard) {
      var spouseName = (form.querySelector('[name="spouse_name"]') && form.querySelector('[name="spouse_name"]').value) || "";
      if (!spouseName.trim() || spouseName.trim().length < 2) {
        setError(2, "Please enter full name for Spouse.");
        return false;
      }
    }
    form.querySelectorAll('[data-role="child"]').forEach(function (card, i) {
      var prefix = card.getAttribute("data-prefix") || "child_" + (i + 1) + "_";
      var nameEl = form.querySelector('[name="' + prefix + 'name"]');
      var childName = nameEl ? (nameEl.value || "").trim() : "";
      if (!childName || childName.length < 2) {
        setError(2, "Please enter full name for Child " + (i + 1) + ".");
        return false;
      }
    });
    setError(2, "");
    return true;
  }

  function validatePersonDetails() {
    var people = getPeopleFromStep2();
    for (var i = 0; i < people.length; i++) {
      var p = people[i];
      var birthdayEl = document.getElementById(p.prefix + "birthday");
      if (!birthdayEl) continue;
      var birthday = (birthdayEl.value || "").trim();
      if (!birthday) {
        setError(3, "Please enter birthday for " + p.displayName + ".");
        return false;
      }
      if (p.prefix === "primary_") {
        var age = ageFromBirthday(birthday);
        if (age === null || age < 18 || age > 120) {
          setError(3, "Please enter a valid birthday for " + p.displayName + " (must be 18+).");
          return false;
        }
      }
      var genderEl = document.getElementById(p.prefix + "gender");
      var gender = genderEl ? (genderEl.value || "").trim() : "";
      if (!gender) {
        setError(3, "Please select gender for " + p.displayName + ".");
        return false;
      }
    }
    setError(3, "");
    return true;
  }

  function validateLocationCoverage() {
    var zip = digitsOnly((document.getElementById("zip") && document.getElementById("zip").value) || "");
    if (!/^\d{5}$/.test(zip)) {
      setError(4, "Please enter a valid 5-digit ZIP code.");
      return false;
    }
    var coverageStatus = (document.getElementById("coverage-status") && document.getElementById("coverage-status").value) || "";
    if (!coverageStatus) {
      setError(4, "Select your current coverage status.");
      return false;
    }
    var coveragePriority = (document.getElementById("coverage-priority") && document.getElementById("coverage-priority").value) || "";
    if (!coveragePriority) {
      setError(4, "Select what matters most for your next step.");
      return false;
    }
    var premiumInput = document.getElementById("premium");
    var unknownBtn = document.getElementById("premium-unknown");
    var premiumRaw = premiumInput ? String(premiumInput.value || "").trim() : "";
    var isUnknown = !!(unknownBtn && unknownBtn.getAttribute("data-unknown") === "1");
    if (!isUnknown && premiumRaw !== "" && (!Number.isFinite(parseNum(premiumRaw)) || parseNum(premiumRaw) < 0)) {
      setError(4, "Enter a valid monthly premium, or leave blank / choose \"I don't know my premium\".");
      return false;
    }
    setError(4, "");
    return true;
  }

  function validateContact() {
    var email = (document.getElementById("email") && document.getElementById("email").value) || "";
    var phone = digitsOnly((document.getElementById("phone") && document.getElementById("phone").value) || "");
    var consent = document.getElementById("consent-checkbox");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setError(5, "Please enter a valid email.");
      return false;
    }
    if (phone.length < 10) {
      setError(5, "Please enter a valid phone number.");
      return false;
    }
    if (!consent || !consent.checked) {
      setError(5, "Please provide consent to continue.");
      return false;
    }
    setError(5, "");
    return true;
  }

  function validateStep(stepNum) {
    if (stepNum === 1) return validateStep1();
    if (stepNum === 2) return validateHousehold();
    if (stepNum === 3) return validatePersonDetails();
    if (stepNum === 4) return validateLocationCoverage();
    if (stepNum === 5) return validateContact();
    return true;
  }

  function householdSize() {
    return collectPeople().length;
  }

  function classifyResult(premium, benchmark, noCurrentPremium) {
    if (noCurrentPremium) return "ballpark";
    if (premium > benchmark * 1.15) return "over";
    if (premium < benchmark * 0.85) return "under";
    return "ballpark";
  }

  function classifyPlanType(coverageStatus, currentPlanType) {
    if (currentPlanType === "aca_marketplace") return "ACA_MARKETPLACE";
    if (currentPlanType === "short_term") return "SHORT_TERM";
    if (currentPlanType === "health_share") return "HEALTH_SHARE";
    if (currentPlanType === "group_employer" || coverageStatus === "employer_plan") {
      return "EMPLOYER_GROUP";
    }
    // Additional detection hooks for future refinement
    if (currentPlanType === "limited_benefit") return "LIMITED_BENEFIT";
    if (currentPlanType === "private_ppo") return "PRIVATE_PPO";
    if (currentPlanType === "hdhp_hsa") return "HDHP_HSA";
    if (coverageStatus === "cobra") return "COBRA";
    return "UNKNOWN";
  }

  function getPlanProfile(planType) {
    var profiles = window.PLAN_PROFILES || {};
    return profiles[planType] || profiles.UNKNOWN || {
      id: "UNKNOWN",
      label: "Current plan (unspecified)",
      suitability_notes: [],
      blind_spots: []
    };
  }

  function chartFallbackCard(container, message) {
    var card = document.createElement("div");
    card.className = "metric-card";
    card.style.textAlign = "center";
    card.style.padding = "1.5rem";
    card.innerHTML =
      "<p class=\"metric-label\">Chart unavailable</p>" +
      "<p class=\"metric-value\" style=\"font-size:0.95rem;font-weight:400\">" + message + "</p>";
    container.parentNode.replaceChild(card, container);
  }

  function initResultEnhancements(report) {
    if (!window.Chart) return;
    var v = report.values;
    var fmt = window.formatBenchmarkCurrency || function (n) { return "$" + Math.round(n); };

    // Chart A — coverage layers stacked exposure structure
    var coverageStructureCanvas = document.getElementById("coverage-structure-chart");
    if (coverageStructureCanvas) {
      if (!report.hasEnoughDataForExposureChart) {
        chartFallbackCard(coverageStructureCanvas,
          "We need more plan detail to estimate this chart precisely, but your current structure may still create meaningful exposure.");
      } else {
        var ctxCoverage = coverageStructureCanvas.getContext("2d");
        new window.Chart(ctxCoverage, {
          type: "bar",
          data: {
            labels: ["Annual premium", "Deductible", "Coinsurance exposure", "Max out-of-pocket"],
            datasets: [
              {
                label: "Amount",
                data: [v.annualPremium, v.deductible, v.coinsuranceExposure || 0, v.maxOutOfPocket],
                backgroundColor: [
                  "rgba(13, 148, 136, 0.85)",
                  "rgba(45, 212, 191, 0.9)",
                  "rgba(56, 189, 248, 0.9)",
                  "rgba(15, 23, 42, 0.75)"
                ]
              }
            ]
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
              legend: { display: false },
              tooltip: {
                callbacks: {
                  label: function (context) {
                    return fmt(context.parsed.y);
                  }
                }
              }
            },
            scales: {
              y: {
                beginAtZero: true,
                ticks: {
                  callback: function (value) { return "$" + Math.round(value).toLocaleString(); }
                }
              }
            }
          }
        });
      }
    }

    // Chart B — example major medical event cost breakdown (You pay vs Insurance pays)
    var eventCostCanvas = document.getElementById("event-cost-chart");
    if (eventCostCanvas) {
      if (!report.hasEnoughDataForMedicalEventChart) {
        chartFallbackCard(eventCostCanvas,
          "We need more plan detail to estimate this chart precisely, but your current structure may still create meaningful exposure.");
      } else {
        var ctxEvent = eventCostCanvas.getContext("2d");
        new window.Chart(ctxEvent, {
          type: "bar",
          data: {
            labels: ["You pay", "Insurance pays"],
            datasets: [
              {
                label: "Deductible",
                data: [v.exampleUserDeductible, 0],
                backgroundColor: "rgba(248, 113, 113, 0.9)"
              },
              {
                label: "Coinsurance",
                data: [v.exampleUserCoinsurance, 0],
                backgroundColor: "rgba(251, 146, 60, 0.9)"
              },
              {
                label: "Insurance coverage",
                data: [0, v.exampleInsurancePays],
                backgroundColor: "rgba(34, 197, 94, 0.9)"
              }
            ]
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
              legend: { display: true },
              tooltip: {
                callbacks: {
                  label: function (context) {
                    return fmt(context.parsed.y);
                  }
                }
              }
            },
            scales: {
              x: { stacked: true },
              y: {
                stacked: true,
                ticks: {
                  callback: function (value) { return "$" + Math.round(value).toLocaleString(); }
                }
              }
            }
          }
        });
      }
    }

    // Chart C — Premium vs Risk Efficiency (stacked bar comparison)
    var riskChartCanvas = document.getElementById("risk-efficiency-chart");
    if (riskChartCanvas) {
      if (!report.hasEnoughDataForRiskChart) {
        chartFallbackCard(riskChartCanvas,
          "Enter your current premium for a personalized premium vs risk efficiency comparison. Benchmark data is shown where available.");
      } else {
        var ctxRisk = riskChartCanvas.getContext("2d");
        new window.Chart(ctxRisk, {
          type: "bar",
          data: {
            labels: ["Your plan", "Typical plan"],
            datasets: [
              {
                label: "Annual premium",
                data: [v.annualPremium, v.benchmarkAnnualPremium],
                backgroundColor: ["rgba(13, 148, 136, 0.85)", "rgba(13, 148, 136, 0.45)"]
              },
              {
                label: "Expected exposure",
                data: [v.yourExpectedOopRisk, v.benchmarkExpectedOopRisk],
                backgroundColor: ["rgba(15, 23, 42, 0.7)", "rgba(15, 23, 42, 0.35)"]
              }
            ]
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
              legend: { display: true },
              tooltip: {
                callbacks: {
                  label: function (context) {
                    return context.dataset.label + ": " + fmt(context.parsed.y);
                  }
                }
              }
            },
            scales: {
              x: { stacked: true },
              y: {
                stacked: true,
                beginAtZero: true,
                ticks: {
                  callback: function (value) { return "$" + Math.round(value).toLocaleString(); }
                }
              }
            }
          }
        });
      }
    }

    var riskMeter = document.querySelector(".result-risk-meter");
    if (riskMeter) {
      var rt = report.resultType || "ballpark";
      var level = "moderate";
      if (rt === "over") level = "high";
      if (rt === "under") level = "moderate";
      riskMeter.setAttribute("data-risk-level", level);
    }
  }

  function renderResult(report) {
    var v = report.values;
    var resultType = report.resultType || "ballpark";
    var noCurrentPremium = v.currentMonthlyPremium === null;
    var fmt = window.formatBenchmarkCurrency || function (n) { return "$" + Math.round(n); };
    var benchmarkNote = ((window.RESULT_COPY || {}).benchmark_note) || "This is a directional benchmark based on your inputs.";
    var ctaUrl = window.CTA_URL || "https://richards.health";
    var ctaPrimary = window.CTA_PRIMARY || "Continue to Coverage Review";
    var ctaSub = window.CTA_SUB || "";
    var roundedPremium = v.currentMonthlyPremium !== null ? Math.round(v.currentMonthlyPremium) : 0;
    var roundedBenchmark = v.directionalBenchmark !== null ? Math.round(v.directionalBenchmark) : 0;
    var premiumRatio = (roundedBenchmark > 0 && !noCurrentPremium && roundedPremium > 0)
      ? roundedPremium / roundedBenchmark : null;

    var headline;
    var headlineSupportingText;
    var keyTakeawayText;

    var stateRangeLine = "";
    if (noCurrentPremium && roundedBenchmark > 0) {
      var rangeLow = Math.round(roundedBenchmark * 0.8);
      var rangeHigh = Math.round(roundedBenchmark * 1.2);
      stateRangeLine = '<p class="result-summary-microcopy">Estimated premium range for similar households in your area: <strong>' + fmt(rangeLow) + '\u2013' + fmt(rangeHigh) + '/mo</strong>. Estimates based on benchmark data.</p>';
    }

    if (noCurrentPremium || roundedPremium === 0 || premiumRatio === null) {
      headline = "Here is what typical coverage looks like for similar households in your area.";
      headlineSupportingText = "Without a current premium, we can still show directional benchmark ranges and plan structure estimates.";
      keyTakeawayText = "Your monthly premium is only one part of the cost of coverage. Your deductible, coinsurance, and maximum out-of-pocket limit often determine what you may actually pay if a major medical event occurs.";
    } else if (premiumRatio < 0.70) {
      headline = "Your premium is significantly below the typical benchmark for similar households.";
      headlineSupportingText = "Lower premiums can sometimes indicate higher deductibles or increased out-of-pocket exposure.";
      keyTakeawayText = "Lower premiums can sometimes come with higher deductibles or out-of-pocket exposure. Understanding your deductible and maximum out-of-pocket limits is important when evaluating coverage.";
    } else if (premiumRatio > 1.30) {
      headline = "Your premium appears higher than typical plans for similar households in your area.";
      headlineSupportingText = "Higher premiums may reflect richer coverage, broader networks, or plan structure differences.";
      keyTakeawayText = "Your premium is significantly higher than typical plans for similar households. However, premium alone does not determine protection. Deductibles, coinsurance, and maximum out-of-pocket limits determine your real financial exposure.";
    } else {
      headline = "Your premium is near the typical benchmark for similar households.";
      headlineSupportingText = "Premium is only one part of the cost of coverage. Deductibles, coinsurance, and maximum out-of-pocket limits often determine your real financial exposure.";
      keyTakeawayText = "Your premium appears close to typical benchmark ranges. However, plan structure still determines how much you may pay during major medical events.";
    }

    var premiumDifferenceLine = "";
    if (!noCurrentPremium && roundedPremium > 0 && roundedBenchmark > 0) {
      var diff = roundedPremium - roundedBenchmark;
      if (diff > 0) {
        premiumDifferenceLine = '<p class="result-summary-microcopy"><strong>Your premium is approximately ' + fmt(diff) + '/month higher than the benchmark.</strong></p>';
      } else if (diff < 0) {
        premiumDifferenceLine = '<p class="result-summary-microcopy"><strong>Your premium is approximately ' + fmt(Math.abs(diff)) + '/month lower than the benchmark.</strong></p>';
      }
    }

    var premiumVsBenchmarkLine = noCurrentPremium
      ? "You are not currently paying a monthly premium; this benchmark shows typical directional ranges for similar households."
      : "Your current premium is " + fmt(roundedPremium) + "/mo versus a directional benchmark of " + fmt(roundedBenchmark) + "/mo.";

    // Risk efficiency variables
    var riskInterpretation = "";
    if (noCurrentPremium || v.riskMultiplier === null) {
      riskInterpretation = "Enter your current premium for a personalized risk efficiency comparison.";
    } else if (v.riskMultiplier > 1.5) {
      riskInterpretation = "Your estimated annual cost exposure is materially above benchmark for similar households.";
    } else if (v.riskMultiplier > 1.1 && premiumRatio !== null && premiumRatio > 1.1) {
      riskInterpretation = "Your higher premium may be reducing some out-of-pocket risk, but total annual cost still appears above benchmark.";
    } else if (premiumRatio !== null && premiumRatio < 0.9 && v.yourExpectedOopRisk !== null && v.benchmarkExpectedOopRisk !== null && v.yourExpectedOopRisk > v.benchmarkExpectedOopRisk * 1.2) {
      riskInterpretation = "Your lower premium may come with meaningfully higher financial risk during a major medical year.";
    } else {
      riskInterpretation = "Your total annual cost exposure appears broadly in line with benchmark expectations.";
    }

    var riskMultiplierText = "";
    if (v.riskMultiplier !== null && !noCurrentPremium) {
      if (v.riskMultiplier > 1.05) {
        riskMultiplierText = "Your financial risk exposure is approximately <strong>" + v.riskMultiplier.toFixed(1) + "\u00d7 higher</strong> than typical plans.";
      } else if (v.riskMultiplier < 0.95) {
        riskMultiplierText = "Your financial risk exposure is approximately <strong>" + (1 / v.riskMultiplier).toFixed(1) + "\u00d7 lower</strong> than typical plans.";
      } else {
        riskMultiplierText = "Your financial risk exposure is <strong>roughly in line</strong> with typical plans.";
      }
    }

    var exposureBestText = v.exposureBestCase !== null ? fmt(v.exposureBestCase) + "/yr" : "\u2014";
    var exposureTypicalText = v.exposureTypicalCase !== null ? fmt(v.exposureTypicalCase) + "/yr" : "\u2014";
    var exposureWorstText = v.exposureWorstCase !== null ? fmt(v.exposureWorstCase) + "/yr" : "\u2014";

    var exposureRangeText = (v.estimatedExposureLow !== null && v.estimatedExposureHigh !== null)
      ? fmt(v.estimatedExposureLow) + "\u2013" + fmt(v.estimatedExposureHigh)
      : "Estimate unavailable";

    var deductibleDisplay = v.deductible !== null ? fmt(v.deductible) : "Estimate unavailable";
    var coinsuranceDisplay = v.coinsuranceExposure !== null ? fmt(v.coinsuranceExposure) : "Estimate unavailable";
    var maxOopDisplay = v.maxOutOfPocket !== null ? fmt(v.maxOutOfPocket) : "Estimate unavailable";
    var eventCostDisplay = v.exampleMedicalEventCost !== null ? fmt(v.exampleMedicalEventCost) : "$40,000";

    var deductibleExample = (v.deductible !== null && v.coinsuranceExposure !== null)
      ? "Example: " + deductibleDisplay + " deductible + " + coinsuranceDisplay + " coinsurance = " + fmt(v.deductible + v.coinsuranceExposure) + " potential exposure before full coverage begins."
      : "Based on benchmark assumptions. A licensed advisor can help determine your exact cost structure.";

    var assumptionsHtml = (report.assumptions && report.assumptions.length > 0)
      ? '<p class="result-note" style="font-style:italic">This estimate uses common plan structure assumptions where plan details were not provided.</p>'
      : "";

    var cardHtml =
      '<div class="result-summary-header">' +
      '<p class="result-summary-eyebrow">Your Benchmark Result</p>' +
      '<h3 class="result-summary-title">' + headline + "</h3>" +
      '<p class="result-summary-microcopy">' + headlineSupportingText + "</p>" +
      '<p class="result-summary-microcopy">' + premiumVsBenchmarkLine + "</p>" +
      premiumDifferenceLine +
      stateRangeLine +
      '<p class="result-summary-microcopy">Your estimated financial exposure in a major medical year may reach ' + exposureRangeText + ".</p>" +
      '<p class="result-summary-advisor">Many households review these trade-offs with a licensed advisor to better understand their real cost exposure.</p>' +
      assumptionsHtml +
      "</div>" +
      '<div class="result-key-metrics">' +
      '<div class="metric-card">' +
      '<p class="metric-label">Current premium</p>' +
      '<p class="metric-value">' + (noCurrentPremium ? "Not currently paying" : fmt(roundedPremium) + " / mo") + "</p>" +
      "</div>" +
      '<div class="metric-card">' +
      '<p class="metric-label">Directional benchmark</p>' +
      '<p class="metric-value">' + (roundedBenchmark > 0 ? fmt(roundedBenchmark) + " / mo" : "Unavailable") + "</p>" +
      "</div>" +
      '<div class="metric-card">' +
      '<p class="metric-label">Household size</p>' +
      '<p class="metric-value">' + (v.householdSize || 1) + "</p>" +
      "</div>" +
      "</div>" +
      '<section class="result-section result-key-takeaway">' +
      "<h4>Key takeaway</h4>" +
      "<p>" + keyTakeawayText + "</p>" +
      "</section>" +
      '<section class="result-section result-risk">' +
      "<h4>Major medical year exposure</h4>" +
      '<p class="result-risk-range">' + exposureRangeText + " in potential out-of-pocket exposure during a major medical year.</p>" +
      '<div class="exposure-scenarios">' +
      '<div class="exposure-scenario"><span class="exposure-scenario-label">Best case</span><span class="exposure-scenario-desc">Premium only</span><span class="exposure-scenario-value">' + exposureBestText + '</span></div>' +
      '<div class="exposure-scenario"><span class="exposure-scenario-label">Typical case</span><span class="exposure-scenario-desc">Premium + partial deductible</span><span class="exposure-scenario-value">' + exposureTypicalText + '</span></div>' +
      '<div class="exposure-scenario exposure-scenario--worst"><span class="exposure-scenario-label">Worst case</span><span class="exposure-scenario-desc">Premium + max out-of-pocket</span><span class="exposure-scenario-value">' + exposureWorstText + '</span></div>' +
      "</div>" +
      '<div class="result-risk-meter" data-risk-level="moderate">' +
      '<span class="risk-label">Low</span>' +
      '<span class="risk-label">Moderate</span>' +
      '<span class="risk-label">High</span>' +
      '<span class="risk-label">Severe</span>' +
      "</div>" +
      '<p class="result-note">Exposure depends on deductible, coinsurance, and maximum out-of-pocket limits \u2014 not just monthly premium.</p>' +
      "</section>" +
      '<section class="result-section result-risk-efficiency">' +
      "<h4>Premium vs risk efficiency</h4>" +
      "<p>Compare how your annual premium and estimated financial exposure stack up against typical plans for similar households.</p>" +
      '<div class="risk-comparison-table">' +
      '<div class="risk-comparison-row risk-comparison-header"><span></span><span>Your plan</span><span>Typical plan</span></div>' +
      '<div class="risk-comparison-row"><span>Annual premium</span><span>' + (v.annualPremium !== null && !noCurrentPremium ? fmt(v.annualPremium) : "\u2014") + '</span><span>' + (v.benchmarkAnnualPremium !== null ? fmt(v.benchmarkAnnualPremium) : "\u2014") + '</span></div>' +
      '<div class="risk-comparison-row"><span>Max exposure</span><span>' + (v.maxOutOfPocket !== null ? fmt(v.maxOutOfPocket) : "\u2014") + '</span><span>' + fmt(v.benchmarkMaxOop) + '</span></div>' +
      '<div class="risk-comparison-row risk-comparison-total"><span>Est. annual risk</span><span>' + (v.yourTotalRiskCost !== null && !noCurrentPremium ? fmt(v.yourTotalRiskCost) : "\u2014") + '</span><span>' + (v.benchmarkTotalRiskCost !== null ? fmt(v.benchmarkTotalRiskCost) : "\u2014") + '</span></div>' +
      "</div>" +
      (riskMultiplierText ? '<p class="result-risk-multiplier">' + riskMultiplierText + '</p>' : '') +
      '<div class="chart-shell"><canvas id="risk-efficiency-chart" aria-label="Premium vs risk efficiency comparison" role="img"></canvas></div>' +
      '<p class="result-note risk-interpretation">' + riskInterpretation + '</p>' +
      '<p class="result-note">Estimated risk uses an 8% probability of a major medical event applied to maximum out-of-pocket exposure. ' + (v.timestamp || "") + '</p>' +
      "</section>" +
      '<section class="result-section">' +
      "<h4>How healthcare cost exposure is structured</h4>" +
      "<p>Annual premium represents recurring cost, while deductible and out-of-pocket limits represent thresholds where larger expenses can occur.</p>" +
      '<div class="chart-shell"><canvas id="coverage-structure-chart" aria-label="Coverage cost structure" role="img"></canvas></div>' +
      '<p class="result-note">' + benchmarkNote + ' <span class="result-timestamp">' + (v.timestamp || "") + "</span></p>" +
      "</section>" +
      '<section class="result-section result-education">' +
      "<h4>How a major medical event is typically paid for</h4>" +
      "<p>In a " + eventCostDisplay + " hospital event, costs are shared between you and the insurance carrier based on deductible, coinsurance, and out-of-pocket limits.</p>" +
      '<div class="chart-shell"><canvas id="event-cost-chart" aria-label="Major medical event cost breakdown" role="img"></canvas></div>' +
      '<p class="result-note">Even with insurance, major medical events often involve thousands in out-of-pocket costs before coverage reaches the maximum protection limit.</p>' +
      "</section>" +
      '<section class="result-section result-education">' +
      "<h4>What your deductible and out-of-pocket limit mean</h4>" +
      '<div class="result-key-metrics">' +
      '<div class="metric-card">' +
      '<p class="metric-label">Deductible</p>' +
      '<p class="metric-value">The amount you pay before most insurance coverage begins.</p>' +
      '<p class="result-note">Your estimated deductible: ' + deductibleDisplay + "</p>" +
      '<p class="result-note">Typical range: $4,000\u2013$8,000 for many individual plans.</p>' +
      "</div>" +
      '<div class="metric-card">' +
      '<p class="metric-label">Maximum out-of-pocket</p>' +
      '<p class="metric-value">The maximum you may pay for covered services during a major medical year.</p>' +
      '<p class="result-note">Your estimated max out-of-pocket: ' + maxOopDisplay + "</p>" +
      '<p class="result-note">Typical range: $8,000\u2013$15,000 for many plans.</p>' +
      "</div>" +
      "</div>" +
      '<p class="result-note">' + deductibleExample + "</p>" +
      "</section>" +
      '<section class="result-section result-insights">' +
      "<h4>Insights from your benchmark</h4>" +
      "<ul>" +
      (function () {
        var items = [];
        if (!noCurrentPremium && premiumRatio !== null && premiumRatio > 1.3 && v.riskMultiplier !== null && v.riskMultiplier > 1.2) {
          items.push("Your premium is significantly higher than benchmark plans.");
          items.push("However, estimated maximum exposure remains similar to typical coverage structures.");
          items.push("This suggests your plan may prioritize network access or lower deductibles rather than reducing total financial risk.");
        } else if (!noCurrentPremium && premiumRatio !== null && premiumRatio < 0.7) {
          items.push("Your premium is below benchmark, which may indicate higher cost-sharing in the event of a claim.");
          items.push("Plans with lower premiums often carry higher deductibles that shift financial risk to you during major medical events.");
          items.push("Understanding your maximum out-of-pocket limit is especially important with lower-premium plans.");
        } else {
          items.push("Many plans with lower premiums shift cost risk into higher deductibles.");
          items.push("The combination of deductible and coinsurance determines your true financial exposure.");
          items.push("Two plans with similar premiums can produce very different financial outcomes.");
        }
        return items.map(function (i) { return "<li>" + i + "</li>"; }).join("");
      })() +
      "</ul>" +
      "</section>" +
      '<section class="result-section result-cta-section">' +
      "<h4>Review your coverage structure with a licensed advisor</h4>" +
      "<p>Most people use this benchmark to identify potential coverage gaps, then review their options with a licensed advisor.</p>" +
      "<p>The consultation can help with:</p>" +
      "<ul>" +
      "<li>Reviewing deductible and out-of-pocket structures</li>" +
      "<li>Checking doctor and prescription compatibility</li>" +
      "<li>Identifying plans with more predictable cost exposure</li>" +
      "<li>Evaluating network access and coverage options</li>" +
      "</ul>" +
      "<p class=\"result-note\">Many households review their coverage structure every 1–2 years as plan pricing and network options change.</p>" +
      '<div class="result-cta-wrap"><a class="btn btn-primary result-cta-btn" href="' + ctaUrl + '" target="_blank" rel="noopener noreferrer">' + ctaPrimary + "</a></div>" +
      (ctaSub ? '<p class="sub result-cta-sub">' + ctaSub + "</p>" : "") +
      "</section>" +
      '<p class="result-meta-note">When you reach the end of this report, you should understand your premium benchmark, your potential financial exposure, how deductibles and out-of-pocket limits affect real costs, and why a professional review can help clarify your options.</p>' +
      '<p class="result-restart-wrap"><button type="button" class="btn-link result-restart-btn" id="result-restart-btn">Start over</button></p>';
    resultEl.className = "result " + resultType;
    var cardWrap = resultEl.querySelector(".result-card-wrap");
    if (cardWrap) cardWrap.innerHTML = cardHtml;
    else resultEl.innerHTML = '<div class="result-and-calendly"><div class="result-card-wrap">' + cardHtml + '</div></div>';

    // Reuse existing Calendly widget from the layout and move it into the card
    var existingCalendlyWrap = document.querySelector(".result-calendly-wrap");
    var calendarSection = null;
    if (existingCalendlyWrap) {
      calendarSection = document.createElement("section");
      calendarSection.className = "result-section result-calendar-section";
      calendarSection.innerHTML =
        "<h4>Schedule a coverage strategy call</h4>" +
        "<p>Most consultations take about 10 minutes and help clarify how different plan structures affect your financial exposure.</p>" +
        "<ul>" +
        "<li>Licensed advisors</li>" +
        "<li>No obligation consultation</li>" +
        "<li>Private discussion</li>" +
        "</ul>";
      calendarSection.appendChild(existingCalendlyWrap);
    }

    var behaviorTarget = document.createElement("section");
    behaviorTarget.className = "result-section result-behavior-widget";
    behaviorTarget.innerHTML =
        '<h3 class="result-behavior-title">What people with similar benchmarks usually do</h3>' +
        '<p class="result-behavior-sub">When households see benchmark results like this, they typically take one of the following approaches.</p>' +
        '<div class="result-behavior-grid">' +
        '<div class="behavior-card">' +
        "<h4>Stay with current plan</h4>" +
        '<p class="behavior-outcome">Some households keep their existing coverage if it aligns with their expected healthcare needs.</p>' +
        "</div>" +
        '<div class="behavior-card">' +
        "<h4>Switch marketplace plan</h4>" +
        '<p class="behavior-outcome">Marketplace plans may offer different premium and deductible combinations depending on subsidy eligibility and plan selection.</p>' +
        "</div>" +
        '<div class="behavior-card">' +
        "<h4>Explore private coverage options</h4>" +
        '<p class="behavior-outcome">Some households review alternative plan structures that may provide broader networks or more predictable exposure.</p>' +
        "</div>" +
        "</div>" +
        '<p class="result-note behavior-note">Many self-employed households review their coverage structure every 1–2 years as pricing and network options change.</p>';
    if (cardWrap) {
      var ctaSection = cardWrap.querySelector(".result-cta-section");
      if (ctaSection) {
        if (calendarSection) {
          ctaSection.parentNode.insertBefore(calendarSection, ctaSection);
          ctaSection.parentNode.insertBefore(behaviorTarget, calendarSection);
        } else {
          ctaSection.parentNode.insertBefore(behaviorTarget, ctaSection);
        }
      } else {
        if (calendarSection) cardWrap.appendChild(calendarSection);
        cardWrap.appendChild(behaviorTarget);
      }
    }

    resultEl.classList.remove("hidden");
    if (resultMetaEl) {
      resultMetaEl.classList.remove("hidden");
      resultMetaEl.textContent = "Result based on submitted household, premium, and qualifying information.";
    }
    var ctaBtn = resultEl.querySelector(".result-cta-btn");
    if (ctaBtn && window.rhTrack) {
      ctaBtn.addEventListener("click", function () {
        window.rhTrack("outbound_click_richards_health", { page_id: pageContext.page_id || "", result_type: resultType, link_text: ctaPrimary });
      }, { once: true });
    }
    var restartBtn = resultEl.querySelector("#result-restart-btn");
    if (restartBtn) {
      restartBtn.addEventListener("click", function () {
        clearFlowState();
        window.location.href = "/";
      });
    }

    var disclosureToggle = resultEl.querySelector(".result-disclosure-toggle");
    var disclosureBody = document.getElementById("result-disclosure-body");
    if (disclosureToggle && disclosureBody) {
      disclosureToggle.addEventListener("click", function () {
        var isExpanded = disclosureToggle.getAttribute("aria-expanded") === "true";
        disclosureToggle.setAttribute("aria-expanded", isExpanded ? "false" : "true");
        disclosureBody.classList.toggle("hidden", isExpanded);
      });
    }

    ensureChartJs(function () {
      initResultEnhancements(report);
    });
  }

  function buildBenchmarkContext(resultType, benchmark, primaryPayload) {
    var tracker = window.__RH_TRACKER__ || {};
    var utm = tracker.utm || {};
    return {
      situation: state.selectedSituation || "",
      premium: primaryPayload.premium === null ? "" : primaryPayload.premium,
      no_current_premium: primaryPayload.no_current_premium || "yes",
      coverage_status: primaryPayload.coverage_status || "",
      coverage_priority: primaryPayload.coverage_priority || "",
      current_plan_type: primaryPayload.current_plan_type || "",
      consent_version_id: window.CONSENT_VERSION_ID || "v1",
      consented_at: new Date().toISOString(),
      page_id: pageContext.page_id || "",
      page_family: pageContext.page_family || "",
      state: pageContext.state || "",
      life_event: pageContext.life_event || "",
      source_url: window.location.href,
      result_type: resultType,
      benchmark: Math.round(benchmark),
      household_size: householdSize(),
      has_spouse: (form.querySelector('[data-role="spouse"]') ? "yes" : "no"),
      child_count: form.querySelectorAll('[data-role="child"]').length,
      steps_total: state.visibleSteps.length,
      steps_completed: state.visibleSteps.length,
      context_step_skipped: state.contextStepSkipped ? "yes" : "no",
      situation_source: state.situationSource,
      utm_source: utm.utm_source || "",
      utm_medium: utm.utm_medium || "",
      utm_campaign: utm.utm_campaign || "",
      utm_content: utm.utm_content || "",
      utm_term: utm.utm_term || "",
      client_id: tracker.clientId || "",
      submitted_at: new Date().toISOString()
    };
  }

  function buildPersonPayload(person, householdId, context) {
    var p = person.payload;
    var body = {
      role: person.role,
      household_id: householdId,
      intake_parent_id: person.intake_parent_id,
      name: p.name || "",
      birthday: p.birthday || "",
      gender: (p.gender || "").trim(),
      height: (p.height || "").trim(),
      weight: (p.weight || "").trim(),
      medications: (p.medications || "").trim(),
      smoker: p.smoker ? "yes" : "no",
      high_blood_pressure: p.high_blood_pressure ? "yes" : "no",
      diabetes: (p.diabetes !== undefined && p.diabetes) ? "yes" : "no",
      phone: person.role === "primary" ? (p.phone || "") : "",
      email: person.role === "primary" ? (p.email || "") : "",
      zip: person.role === "primary" ? (p.zip || "") : ""
    };
    for (var k in context) body[k] = context[k];
    return body;
  }

  function sendPayload(payload) {
    var url = window.FORM_ACTION_URL;
    if (!url) return Promise.resolve();
    return fetch(url, {
      method: "POST",
      mode: "no-cors",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    }).catch(function () {
      return null;
    });
  }

  function completeFlow() {
    var people = collectPeople();
    var primary = people[0] && people[0].payload;
    if (!primary) return;
    var age = ageFromBirthday(primary.birthday) || 30;
    var spouseCount = people.filter(function (p) { return p.role === "spouse"; }).length;
    var childCount = people.filter(function (p) { return p.role === "child"; }).length;
    var multiplier = Number(window.MULTIPLIER || 11.5);
    var formulaBenchmark = Math.max(100, (age * multiplier) + 120 + (childCount * 70) + (spouseCount ? 90 : 0));
    var noCurrentPremium = primary.no_current_premium === "yes";
    var premium = Number(primary.premium || 0);

    var coverageStatusEl = document.getElementById("coverage-status");
    var planTypeEl = document.getElementById("current-plan-type");
    var coverageStatusVal = coverageStatusEl ? (coverageStatusEl.value || "") : "";
    var currentPlanTypeVal = planTypeEl ? (planTypeEl.value || "") : "";
    var planType = classifyPlanType(coverageStatusVal, currentPlanTypeVal);

    var report = window.buildResolvedBenchmarkReport({
      monthlyPremium: noCurrentPremium ? null : premium,
      noCurrentPremium: noCurrentPremium,
      householdSize: people.length,
      state: (pageContext.state || "").toUpperCase() || null,
      planType: planType,
      formulaBenchmark: formulaBenchmark,
      deductible: null,
      coinsuranceRate: null,
      maxOutOfPocket: null
    });

    var effectiveBenchmark = report.values.directionalBenchmark || formulaBenchmark;
    var resultType = classifyResult(premium, effectiveBenchmark, noCurrentPremium);
    report.resultType = resultType;

    var householdId = "hh_" + Date.now() + "_" + Math.random().toString(36).slice(2, 11);
    var context = buildBenchmarkContext(resultType, effectiveBenchmark, primary);

    if (flowShell) {
      flowShell.classList.add("hidden");
      var introCard = flowShell.previousElementSibling;
      if (introCard && introCard.classList.contains("card")) {
        introCard.classList.add("hidden");
      }
    }
    renderResult(report);
    if (resultEl && typeof resultEl.scrollIntoView === "function") {
      resultEl.scrollIntoView({ behavior: "smooth", block: "start" });
    }
    if (window.rhTrack) window.rhTrack("result_view", { result_type: resultType, benchmark: Math.round(effectiveBenchmark), premium: premium, no_current_premium: noCurrentPremium ? "yes" : "no" });

    if (window.rhTrack) window.rhTrack("submission_sent", { page_id: pageContext.page_id || "", result_type: resultType, household_size: people.length });
    people.forEach(function (person) {
      sendPayload(buildPersonPayload(person, householdId, context));
    });
    if (window.rhTrack) window.rhTrack("submission_success", { page_id: pageContext.page_id || "" });
    saveCompletedResult(report);
  }

  function handleNext() {
    var step = state.currentStep;
    if (!validateStep(step)) return;
    if (window.rhTrack) window.rhTrack("step_complete", { step_number: step, page_id: pageContext.page_id || "" });
    showMomentumMessage(step);
    if (step === 1) {
      var route = getContextRoute(state.selectedSituation);
      if (route) {
        var currentPath = window.location.pathname || "/";
        if (currentPath !== route) {
          window.location.assign(route);
          return;
        }
      }
    }
    var next = getNextStep(step);
    if (next === 3) buildPersonDetailsStep();
    if (next) setStepVisible(next);
  }

  function handleBack() {
    var prev = getPrevStep(state.currentStep);
    if (prev) setStepVisible(prev);
  }

  var saveFlowStateDebounced = (function () {
    var timer;
    return function () {
      if (timer) clearTimeout(timer);
      timer = setTimeout(function () {
        timer = null;
        saveFlowState();
      }, 500);
    };
  })();

  function wireEvents() {
    form.addEventListener("input", function (event) {
      var target = event.target;
      if (target && target.id === "premium-slider") {
        var premiumInput = document.getElementById("premium");
        if (premiumInput) premiumInput.value = target.value;
      }
      if (target && target.id === "premium") {
        var slider = document.getElementById("premium-slider");
        if (slider) {
          var v = parseNum(target.value);
          if (Number.isFinite(v)) {
            var max = parseNum(slider.max) || 1500;
            var min = parseNum(slider.min) || 0;
            slider.value = String(Math.max(min, Math.min(v, max)));
          }
        }
      }
      saveFlowStateDebounced();
    });
    form.addEventListener("change", saveFlowStateDebounced);
    form.addEventListener("click", function (event) {
      var target = event.target;
      if (!(target instanceof Element)) return;

      if (target.matches(".flow-next")) {
        event.preventDefault();
        handleNext();
      }
      if (target.matches(".flow-back")) {
        event.preventDefault();
        handleBack();
      }
      if (target.matches("#add-spouse")) {
        event.preventDefault();
        addSpouseRow();
      }
      if (target.matches("#add-child")) {
        event.preventDefault();
        addChildRow();
      }
      if (target.matches(".btn-remove-person")) {
        event.preventDefault();
        var row = target.closest(".person-card, .household-row");
        if (!row || row.classList.contains("primary")) return;
        var role = row.getAttribute("data-role");
        var isSpouse = role === "spouse";
        var leaveClass = row.classList.contains("household-row") ? "household-row--leaving" : "person-card--leaving";
        function removeFromDom() {
          row.remove();
          if (isSpouse) {
            state.spouseAdded = false;
            updateAddSpouseButtonState();
          } else if (role === "child") updateAddChildButtonState();
          saveFlowState();
        }
        if (prefersReducedMotion()) {
          removeFromDom();
          return;
        }
        row.classList.add(leaveClass);
        var onEnd = function (e) {
          if (e.target !== row || e.propertyName !== "opacity") return;
          row.removeEventListener("transitionend", onEnd);
          removeFromDom();
        };
        row.addEventListener("transitionend", onEnd);
        setTimeout(function () {
          if (row.parentNode) removeFromDom();
        }, 250);
      }
      if (target.matches(".household-preset")) {
        event.preventDefault();
        var preset = target.getAttribute("data-preset");
        if (preset) applyHouseholdPreset(preset);
      }
      if (target.matches("#premium-unknown")) {
        event.preventDefault();
        var btn = target;
        var isActive = btn.getAttribute("data-unknown") === "1";
        var premiumInput = document.getElementById("premium");
        var slider = document.getElementById("premium-slider");
        if (!isActive) {
          btn.setAttribute("data-unknown", "1");
          if (premiumInput) premiumInput.value = "";
        } else {
          btn.removeAttribute("data-unknown");
        }
        if (slider && premiumInput && premiumInput.value) {
          slider.value = Math.max(0, Math.min(parseNum(premiumInput.value) || 0, parseNum(slider.max) || 1500));
        }
      }
      if (target.matches(".situation-option")) {
        event.preventDefault();
        state.selectedSituation = target.getAttribute("data-situation") || "";
        state.situationSource = "user_select";
        syncSituationSelectionUI();
      }
    });

    form.addEventListener("submit", function (event) {
      event.preventDefault();
      if (!validateStep(2) || !validateStep(3) || !validateStep(4) || !validateStep(5) || !validateStep(6)) return;
      completeFlow();
    });

    if (flowStartOverBtn) {
      flowStartOverBtn.addEventListener("click", function (event) {
        event.preventDefault();
        var stepAtReset = state.currentStep;
        if (!confirm("Start over? Your progress will be cleared.")) return;
        if (window.rhTrack) window.rhTrack("flow_start_over", { page_id: pageContext.page_id || "", step_at_reset: stepAtReset });
        clearFlowState();
        window.location.href = "/";
      });
    }
  }

  resolveVisibleSteps();
  ensureIntroCardHeading();
  buildSituationOptions();
  ensureMomentumMessageElement();
  if (document.getElementById("household-step-inner")) buildHouseholdStep();
  wireEvents();
  var saved = loadFlowState();
  if (saved && saved.completed) {
    if (flowShell) flowShell.classList.add("hidden");
    var restoredInput = saved.reportInput || {
      monthlyPremium: saved.noCurrentPremium === "yes" ? null : (saved.premium || 0),
      noCurrentPremium: saved.noCurrentPremium === "yes",
      householdSize: saved.householdSize || 1,
      state: (pageContext.state || "").toUpperCase() || null,
      formulaBenchmark: saved.benchmark || 0
    };
    var restoredReport = window.buildResolvedBenchmarkReport(restoredInput);
    restoredReport.resultType = saved.resultType || "ballpark";
    renderResult(restoredReport);
    if (resultMetaEl) {
      resultMetaEl.classList.remove("hidden");
      resultMetaEl.textContent = "Result based on submitted household, premium, and qualifying information.";
    }
    if (window.rhTrack) window.rhTrack("flow_start", { page_id: pageContext.page_id || "", restored: "result" });
  } else if (saved && restoreFlowState(saved)) {
    if (window.rhTrack) window.rhTrack("flow_start", { page_id: pageContext.page_id || "", context_step_skipped: state.contextStepSkipped ? "yes" : "no", restored: "yes" });
  } else {
    setStepVisible(state.visibleSteps[0]);
    saveFlowState();
    if (window.rhTrack) window.rhTrack("flow_start", { page_id: pageContext.page_id || "", context_step_skipped: state.contextStepSkipped ? "yes" : "no" });
  }
})();
