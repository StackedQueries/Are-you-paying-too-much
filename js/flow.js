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

  function parseNum(val) {
    var n = Number(val);
    return Number.isFinite(n) ? n : NaN;
  }

  function digitsOnly(val) {
    return String(val || "").replace(/\D+/g, "");
  }

  function resolveVisibleSteps() {
    var known = !!pageContext.situation_preselect;
    state.contextStepSkipped = known;
    state.selectedSituation = known ? pageContext.situation_preselect : null;
    state.situationSource = known ? "route_preselect" : "user_select";
    state.visibleSteps = known ? [2, 3, 4, 5, 6] : [1, 2, 3, 4, 5, 6];
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
    if (progressCount) {
      progressCount.textContent = "Step " + current + " of " + total;
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
        if (window.rhTrack) window.rhTrack("step_view", { step_number: stepNum, page_id: pageContext.page_id || "" });
        var panel = form.querySelector('.flow-step-panel[data-step="' + stepNum + '"]');
        var first = panel && panel.querySelector("button, input, select, [tabindex='0']");
        if (first) requestAnimationFrame(function () { first.focus(); });
        if (flowStartOverWrap) flowStartOverWrap.setAttribute("aria-hidden", stepNum >= 2 ? "false" : "true");
        saveFlowState();
      });
      return;
    }
    panels.forEach(function (panel) {
      var panelStep = Number(panel.getAttribute("data-step"));
      panel.classList.toggle("hidden", panelStep !== stepNum);
    });
    state.currentStep = stepNum;
    updateProgress(stepNum);
    if (window.rhTrack) window.rhTrack("step_view", { step_number: stepNum, page_id: pageContext.page_id || "" });
    var panel = form.querySelector('.flow-step-panel[data-step="' + stepNum + '"]');
    var first = panel && panel.querySelector("button, input, select, [tabindex='0']");
    if (first) requestAnimationFrame(function () { first.focus(); });
    if (flowStartOverWrap) flowStartOverWrap.setAttribute("aria-hidden", stepNum >= 2 ? "false" : "true");
    saveFlowState();
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

  function saveCompletedResult(resultType, premium, benchmark, noCurrentPremium) {
    try {
      var payload = {
        page_id: pageContext.page_id || "home",
        completed: true,
        resultType: resultType || "ballpark",
        premium: premium,
        benchmark: benchmark,
        noCurrentPremium: noCurrentPremium ? "yes" : "no",
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
  }

  function getPrimaryPayload() {
    var g = function (id) {
      var el = document.getElementById(id);
      return el ? (el.type === "checkbox" ? el.checked : (el.value || "").trim()) : "";
    };
    var fullName = g("full-name") || g("primary_name");
    var premiumRaw = g("premium");
    var hasPremium = premiumRaw !== "";
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
    var html = options.map(function (opt) {
      return (
        '<button type="button" class="btn btn-outline situation-option" data-situation="' + opt.id + '">' +
        opt.label +
        "</button>"
      );
    }).join("");
    wrap.innerHTML = html;
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
    var premiumRaw = premiumInput ? String(premiumInput.value || "").trim() : "";
    if (premiumRaw !== "" && (!Number.isFinite(parseNum(premiumRaw)) || parseNum(premiumRaw) < 0)) {
      setError(4, "Enter a valid monthly premium or leave blank.");
      return false;
    }
    setError(4, "");
    return true;
  }

  function validateContact() {
    var email = (document.getElementById("email") && document.getElementById("email").value) || "";
    var phone = digitsOnly((document.getElementById("phone") && document.getElementById("phone").value) || "");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setError(5, "Please enter a valid email.");
      return false;
    }
    if (phone.length < 10) {
      setError(5, "Please enter a valid phone number.");
      return false;
    }
    setError(5, "");
    return true;
  }

  function validateConsent() {
    var consent = document.getElementById("consent-checkbox");
    if (!consent || !consent.checked) {
      setError(6, "Please provide consent to continue.");
      return false;
    }
    setError(6, "");
    return true;
  }

  function validateStep(stepNum) {
    if (stepNum === 1) return validateStep1();
    if (stepNum === 2) return validateHousehold();
    if (stepNum === 3) return validatePersonDetails();
    if (stepNum === 4) return validateLocationCoverage();
    if (stepNum === 5) return validateContact();
    if (stepNum === 6) return validateConsent();
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

  function renderResult(resultType, premium, benchmark, noCurrentPremium) {
    var copy = (window.RESULT_COPY || {})[resultType] || {};
    var benchmarkNote = (window.RESULT_COPY || {}).benchmark_note || "This is a directional benchmark based on your inputs.";
    var followUp = (window.RESULT_COPY || {}).follow_up || "";
    var ctaUrl = window.CTA_URL || "https://richards.health";
    var ctaPrimary = window.CTA_PRIMARY || "Continue to Coverage Review";
    var ctaSub = window.CTA_SUB || "";
    var premiumLine = noCurrentPremium
      ? "<p><strong>Current premium:</strong> Not currently paying a monthly premium</p>"
      : "<p><strong>Your premium:</strong> $" + Math.round(premium || 0) + " / mo</p>";
    var noPremiumNote = noCurrentPremium
      ? "<p>You can still use this directional benchmark to evaluate likely plan cost ranges for your household.</p>"
      : "";

    var cardHtml =
      "<h3>" + (copy.verdict || "Your benchmark result is ready.") + "</h3>" +
      "<p>" + (copy.detail || "") + "</p>" +
      premiumLine +
      "<p><strong>Directional benchmark:</strong> $" + Math.round(benchmark) + " / mo</p>" +
      noPremiumNote +
      "<p>" + benchmarkNote + "</p>" +
      (followUp ? "<p>" + followUp + "</p>" : "") +
      '<div class="result-cta-wrap"><a class="btn btn-primary result-cta-btn" href="' + ctaUrl + '" target="_blank" rel="noopener noreferrer">' + ctaPrimary + "</a></div>" +
      (ctaSub ? '<p class="sub result-cta-sub">' + ctaSub + "</p>" : "") +
      '<p class="result-restart-wrap"><button type="button" class="btn-link result-restart-btn" id="result-restart-btn">Start over</button></p>';
    resultEl.className = "result " + resultType;
    var cardWrap = resultEl.querySelector(".result-card-wrap");
    if (cardWrap) cardWrap.innerHTML = cardHtml;
    else resultEl.innerHTML = '<div class="result-and-calendly"><div class="result-card-wrap">' + cardHtml + '</div><div class="result-calendly-wrap"><div class="calendly-inline-widget" data-url="https://calendly.com/richards-health/30min?hide_gdpr_banner=1" style="min-width:320px;height:700px;"></div></div></div>';
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
    var benchmark = Math.max(100, (age * multiplier) + 120 + (childCount * 70) + (spouseCount ? 90 : 0));
    var noCurrentPremium = primary.no_current_premium === "yes";
    var premium = Number(primary.premium || 0);
    var resultType = classifyResult(premium, benchmark, noCurrentPremium);

    var householdId = "hh_" + Date.now() + "_" + Math.random().toString(36).slice(2, 11);
    var context = buildBenchmarkContext(resultType, benchmark, primary);

    if (flowShell) flowShell.classList.add("hidden");
    renderResult(resultType, premium, benchmark, noCurrentPremium);
    if (window.rhTrack) window.rhTrack("result_view", { result_type: resultType, benchmark: Math.round(benchmark), premium: premium, no_current_premium: noCurrentPremium ? "yes" : "no" });

    if (window.rhTrack) window.rhTrack("submission_sent", { page_id: pageContext.page_id || "", result_type: resultType, household_size: people.length });
    people.forEach(function (person) {
      sendPayload(buildPersonPayload(person, householdId, context));
    });
    if (window.rhTrack) window.rhTrack("submission_success", { page_id: pageContext.page_id || "" });
    saveCompletedResult(resultType, premium, benchmark, noCurrentPremium);
  }

  function handleNext() {
    var step = state.currentStep;
    if (!validateStep(step)) return;
    if (window.rhTrack) window.rhTrack("step_complete", { step_number: step, page_id: pageContext.page_id || "" });
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
    form.addEventListener("input", saveFlowStateDebounced);
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
      if (target.matches(".situation-option")) {
        event.preventDefault();
        state.selectedSituation = target.getAttribute("data-situation") || "";
        state.situationSource = "user_select";
        form.querySelectorAll(".situation-option").forEach(function (btn) {
          btn.classList.remove("btn-primary");
          btn.classList.add("btn-outline");
        });
        target.classList.remove("btn-outline");
        target.classList.add("btn-primary");
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
  if (document.getElementById("household-step-inner")) buildHouseholdStep();
  wireEvents();
  var saved = loadFlowState();
  if (saved && saved.completed) {
    if (flowShell) flowShell.classList.add("hidden");
    renderResult(saved.resultType || "ballpark", saved.premium || 0, saved.benchmark || 0, saved.noCurrentPremium === "yes");
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
