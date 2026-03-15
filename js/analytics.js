(function () {
  function generateClientId() {
    return "rh_" + Math.random().toString(36).slice(2) + "_" + Date.now().toString(36);
  }

  function getClientId() {
    var key = "__RH_CLIENT_ID__";
    var id = localStorage.getItem(key);
    if (!id) {
      id = generateClientId();
      localStorage.setItem(key, id);
    }
    return id;
  }

  function persistUtm() {
    var params = new URLSearchParams(window.location.search || "");
    var utm = {
      utm_source: params.get("utm_source") || "",
      utm_medium: params.get("utm_medium") || "",
      utm_campaign: params.get("utm_campaign") || "",
      utm_content: params.get("utm_content") || "",
      utm_term: params.get("utm_term") || ""
    };
    var hasUtm = Object.keys(utm).some(function (k) { return !!utm[k]; });
    var key = "__RH_UTM__";
    if (hasUtm) {
      sessionStorage.setItem(key, JSON.stringify(utm));
      return utm;
    }
    try {
      return JSON.parse(sessionStorage.getItem(key) || "{}");
    } catch (e) {
      return {};
    }
  }

  var trackerState = {
    clientId: getClientId(),
    utm: persistUtm()
  };

  window.__RH_TRACKER__ = trackerState;
  window.rhTrack = function (eventName, props) {
    if (typeof gtag !== "function") return;
    var merged = Object.assign({}, trackerState.utm, { client_id: trackerState.clientId }, props || {});
    gtag("event", eventName, merged);
  };
})();
