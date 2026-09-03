(function loadTool() {
  var thisTool = "widget-skin-custom-css-indicator";
  var ORIGINAL_TEXT_ATTR = "data-cp-original-text";
  var BULLET = "🔻"; // down-pointing red triangle — smallest genuinely-red glyph available

  var initialized = false;
  var scanTimer = null;
  var typingTimer = null;
  var nextRequestId = 1;
  var pendingCssMapRequests = {};

  function isThemesPage() {
    var path = String(window.location.pathname || "").toLowerCase();
    return path.indexOf("/designcenter/themes") !== -1;
  }

  // DesignCenter.themeJSON only exists in the page's own MAIN world; this
  // isolated-world script can never see it directly (that's the whole
  // point of world isolation). Load a small MAIN-world helper (same
  // pattern as widget-skin-advanced-style-helper.js) that reads it on
  // request and relays the answer back via a CustomEvent, which does
  // cross the isolated/main boundary.
  function injectPageHelper() {
    if (document.getElementById("cp-toolkit-skin-css-reader-script")) return;
    var s = document.createElement("script");
    s.id = "cp-toolkit-skin-css-reader-script";
    s.src = chrome.runtime.getURL("js/tools/on-load/helpers/widget-skin-custom-css-reader.js");
    (document.head || document.documentElement).appendChild(s);
  }

  document.addEventListener("cp-toolkit-skin-css-map-response", function(e) {
    var detail = e.detail || {};
    var resolve = pendingCssMapRequests[detail.requestId];
    if (resolve) {
      delete pendingCssMapRequests[detail.requestId];
      resolve(detail.hasCssByIndex || {});
    }
  });

  function requestSkinCssMap(skinId) {
    return new Promise(function(resolve) {
      var requestId = "req" + (nextRequestId++);
      pendingCssMapRequests[requestId] = resolve;
      document.dispatchEvent(new CustomEvent("cp-toolkit-request-skin-css-map", {
        detail: { skinId: skinId, requestId: requestId }
      }));
      // Safety timeout in case the MAIN-world helper hasn't loaded yet.
      setTimeout(function() {
        if (pendingCssMapRequests[requestId]) {
          delete pendingCssMapRequests[requestId];
          resolve({});
        }
      }, 500);
    });
  }

  // The "Edit Widget Skin" popover always carries a hidden #hdnSkinID input;
  // the component-select's own id/name are ASP.NET-generated and not stable,
  // so we find it by its option labels instead.
  function getSkinEditorPopovers() {
    var hidden = document.querySelectorAll("#hdnSkinID");
    var popovers = [];
    for (var i = 0; i < hidden.length; i++) {
      var pop = hidden[i].closest(".cpPopOver");
      if (pop && popovers.indexOf(pop) === -1) popovers.push(pop);
    }
    return popovers;
  }

  function getComponentSelect(popover) {
    var selects = popover.querySelectorAll("select");
    for (var i = 0; i < selects.length; i++) {
      var opts = selects[i].options;
      if (opts.length && normalizeText(opts[0].text) === "Wrapper") return selects[i];
    }
    return null;
  }

  function normalizeText(value) {
    return String(value || "").replace(/\s+/g, " ").trim();
  }

  function refreshBadges(popover) {
    var hdnSkinID = popover.querySelector("#hdnSkinID");
    var select = getComponentSelect(popover);
    if (!hdnSkinID || !select) return;

    requestSkinCssMap(hdnSkinID.value).then(function(hasCssByIndex) {
      for (var i = 0; i < select.options.length; i++) {
        var opt = select.options[i];
        if (!opt.hasAttribute(ORIGINAL_TEXT_ATTR)) {
          opt.setAttribute(ORIGINAL_TEXT_ATTR, opt.text);
        }
        var original = opt.getAttribute(ORIGINAL_TEXT_ATTR);
        var index = parseInt(opt.value, 10);
        opt.text = (hasCssByIndex[index] ? BULLET : "") + original;
      }
    });
  }

  function scheduleRefresh(popover) {
    clearTimeout(scanTimer);
    scanTimer = setTimeout(function() { refreshBadges(popover); }, 80);
  }

  // Watch only this one popover (not the whole document) for the
  // open/close style toggle and the tab-content swap that happens when
  // switching components. A document-wide observer was tried first, but
  // its extra mutation noise interfered with mini-ide.js's own textarea
  // upgrade detection elsewhere on the page - scoping to just this element
  // keeps the footprint minimal.
  function bindPopoverObserver(popover) {
    if (popover.hasAttribute("data-cp-observer-bound") || !window.MutationObserver) return;
    popover.setAttribute("data-cp-observer-bound", "true");

    var popoverObserver = new MutationObserver(function() {
      scheduleRefresh(popover);
    });

    popoverObserver.observe(popover, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["style", "class"]
    });
  }

  function enhancePopover(popover) {
    refreshBadges(popover);
    bindPopoverObserver(popover);

    var select = getComponentSelect(popover);
    if (select && !select.hasAttribute("data-cp-bound")) {
      select.setAttribute("data-cp-bound", "true");
      select.addEventListener("change", function() {
        // Let the Advanced tab swap to the newly selected component first.
        setTimeout(function() { refreshBadges(popover); }, 50);
      });
    }

    if (!popover.hasAttribute("data-cp-input-bound")) {
      popover.setAttribute("data-cp-input-bound", "true");
      // Keep badges live as the user types in the Advanced tab's CSS editor
      // for whichever component is currently selected, so switching away
      // from it shows an up-to-date badge without requiring a save first.
      popover.addEventListener("input", function(e) {
        if (e.target && e.target.tagName === "TEXTAREA") {
          clearTimeout(typingTimer);
          typingTimer = setTimeout(function() { refreshBadges(popover); }, 300);
        }
      });
    }
  }

  function scanAndEnhance() {
    var popovers = getSkinEditorPopovers();
    for (var i = 0; i < popovers.length; i++) enhancePopover(popovers[i]);
  }

  function init() {
    if (initialized) return;
    initialized = true;

    injectPageHelper();
    scanAndEnhance();

    // The popover may not exist in the DOM yet at this exact moment (the
    // CMS can insert it after this script's own init runs). A low-frequency
    // poll (same pattern as widget-skin-advanced-style-helper.js) catches
    // that without adding any MutationObserver traffic of its own.
    setInterval(scanAndEnhance, 1500);

    console.log("[CP Toolkit] Loaded " + thisTool);
  }

  chrome.storage.local.get([thisTool], function(settings) {
    if (chrome.runtime.lastError) {
      console.error("[CP Toolkit] Error loading settings for " + thisTool + ":", chrome.runtime.lastError);
      return;
    }

    detect_if_cp_site(function() {
      if (window.top !== window.self) return;
      if (settings[thisTool] === false || !isThemesPage()) return;

      if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", init);
      } else {
        init();
      }
    });
  });
})();
