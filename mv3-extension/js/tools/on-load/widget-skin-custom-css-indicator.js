(function loadTool() {
  var thisTool = "widget-skin-custom-css-indicator";
  var BULLET = "🔻"; // down-pointing red triangle — smallest genuinely-red glyph available

  var initialized = false;
  var scanTimer = null;
  var typingTimer = null;
  var nextRequestId = 1;
  var pendingCssMapRequests = {};
  var popoverObservers = new WeakMap();
  var POPOVER_OBSERVER_OPTIONS = {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ["style", "class"]
  };

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

  // Every widget-type view onto the Components array starts at a fixed
  // base index (per copied-skins-helper.js's COMPONENT_TYPES map):
  //   0  = items view    (Wrapper..Footer, 12 slots)
  //   12 = tabbed view    (Tab List, Tab, Tab Panel)
  //   15 = columns view   (Column Separator)
  //   16 = calendar view  (Calendar Header..Cal Wrapper, up to 8 slots)
  // Labels vary by widget type ("Wrapper" vs "Calendar Wrapper" vs "Tab
  // List" as the first option), so matching on label text means chasing
  // every widget type one at a time. The option VALUES don't vary: they're
  // always a consecutive run of integers anchored at one of these four
  // bases, regardless of what the labels say - so match on that instead.
  var VIEW_BASE_INDICES = [0, 12, 15, 16];

  function getComponentSelect(popover) {
    var selects = popover.querySelectorAll("select");
    var best = null;
    for (var i = 0; i < selects.length; i++) {
      var opts = selects[i].options;
      if (!opts.length) continue;

      var values = [];
      var allInts = true;
      for (var j = 0; j < opts.length; j++) {
        if (!/^\d+$/.test(opts[j].value)) { allInts = false; break; }
        values.push(parseInt(opts[j].value, 10));
      }
      if (!allInts) continue;

      // Some widget types display their options out of index order (a
      // calendar widget shows "Calendar Wrapper" first even though its
      // real index, 23, is the highest in the set) - sort before checking
      // consecutiveness so display order never matters, only the set of
      // values actually present.
      var sorted = values.slice().sort(function(a, b) { return a - b; });
      var consecutive = sorted.every(function(v, idx) { return idx === 0 || v === sorted[idx - 1] + 1; });
      if (!consecutive) continue;
      if (VIEW_BASE_INDICES.indexOf(sorted[0]) === -1) continue;

      // Prefer the candidate with the most options if more than one
      // matches (a small unrelated enum dropdown could coincidentally
      // start at 0 too, but the real component picker has more entries).
      if (!best || opts.length > best.options.length) best = selects[i];
    }
    return best;
  }

  function refreshBadges(popover) {
    var hdnSkinID = popover.querySelector("#hdnSkinID");
    var select = getComponentSelect(popover);
    if (!hdnSkinID || !select) return;

    requestSkinCssMap(hdnSkinID.value).then(function(hasCssByIndex) {
      // Writing opt.text below is itself a mutation inside the subtree the
      // popover's own MutationObserver watches - confirmed live that
      // without pausing it first, that write re-triggers the observer,
      // which calls back in here again, forever (an infinite add/remove
      // loop on the marker). Disconnect for the duration of the writes,
      // then resume watching once they're done.
      var observer = popoverObservers.get(popover);
      if (observer) observer.disconnect();

      for (var i = 0; i < select.options.length; i++) {
        var opt = select.options[i];
        // Confirmed live: selecting a different option in this dropdown
        // causes the CMS to rebuild these <option> elements, discarding
        // any attribute set on them (including a stored "original text"
        // tracking attribute). Deriving the clean label by stripping a
        // leading marker instead of relying on stored state makes this
        // idempotent and immune to that rebuild - no state to lose.
        var original = opt.text.charAt(0) === BULLET ? opt.text.slice(BULLET.length) : opt.text;
        var index = parseInt(opt.value, 10);
        var desired = (hasCssByIndex[index] ? BULLET : "") + original;
        // Only touch the DOM when the label actually needs to change - the
        // periodic safety poll (see init()) calls this every 1.5s, and a
        // no-op write here was still enough small DOM noise to disrupt
        // mini-ide.js's own timing-sensitive editor-upgrade detection
        // elsewhere in this same popover.
        if (opt.text !== desired) opt.text = desired;
      }

      if (observer) observer.observe(popover, POPOVER_OBSERVER_OPTIONS);
    });
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

    // Calls the full enhance cycle, not just refreshBadges - confirmed
    // live that selecting a different option rebuilds the <option>
    // elements, which also strips the "already bound" marker used to
    // avoid re-attaching the select's own "change" listener. Re-running
    // enhancePopover on every mutation re-attaches that listener whenever
    // it's found missing, instead of only ever binding it once.
    var popoverObserver = new MutationObserver(function() {
      clearTimeout(scanTimer);
      scanTimer = setTimeout(function() { enhancePopover(popover); }, 80);
    });

    popoverObservers.set(popover, popoverObserver);
    popoverObserver.observe(popover, POPOVER_OBSERVER_OPTIONS);
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
    for (var i = 0; i < popovers.length; i++) {
      // Once a popover is fully bound, its own MutationObserver and select
      // "change" listener handle every future refresh - the periodic poll
      // only exists to catch a popover that wasn't in the DOM yet the first
      // time init() ran. Skipping already-bound ones here means this timer
      // does nothing at all in the common case, instead of quietly writing
      // to the DOM every 1.5s for the rest of the page's life.
      if (popovers[i].hasAttribute("data-cp-observer-bound")) continue;
      enhancePopover(popovers[i]);
    }
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
