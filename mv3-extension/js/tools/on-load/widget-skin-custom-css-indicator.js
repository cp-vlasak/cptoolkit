(function loadTool() {
  var thisTool = "widget-skin-custom-css-indicator";
  var ENHANCED_ATTR = "data-cp-toolkit-skin-css-indicator";
  var ORIGINAL_TEXT_ATTR = "data-cp-original-text";
  var BULLET = "🔻"; // down-pointing red triangle — smallest genuinely-red glyph available

  var initialized = false;
  var observer = null;
  var scanTimer = null;
  var typingTimer = null;

  function isThemesPage() {
    var path = String(window.location.pathname || "").toLowerCase();
    return path.indexOf("/designcenter/themes") !== -1;
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

  function hasCustomStyles(skin, index) {
    var component = skin.Components && skin.Components[index];
    if (!component) return false;
    var css = component.MiscellaneousStyles;
    return typeof css === "string" && css.trim().length > 0;
  }

  function refreshBadges(popover) {
    if (typeof DesignCenter === "undefined" || !DesignCenter.themeJSON) {
      console.log("[CP Toolkit](widget-skin-custom-css-indicator) refreshBadges: DesignCenter.themeJSON not ready yet");
      return;
    }

    var hdnSkinID = popover.querySelector("#hdnSkinID");
    var select = getComponentSelect(popover);
    if (!hdnSkinID || !select) {
      console.log("[CP Toolkit](widget-skin-custom-css-indicator) refreshBadges: hdnSkinID=" + !!hdnSkinID + " select=" + !!select);
      return;
    }

    var skin = DesignCenter.themeJSON.WidgetSkins.find(function(s) {
      return String(s.WidgetSkinID) === String(hdnSkinID.value);
    });
    if (!skin) {
      console.log("[CP Toolkit](widget-skin-custom-css-indicator) refreshBadges: no skin found for WidgetSkinID=" + hdnSkinID.value);
      return;
    }

    console.log("[CP Toolkit](widget-skin-custom-css-indicator) refreshBadges: applying badges for skin '" + skin.Name + "' (" + select.options.length + " options)");
    for (var i = 0; i < select.options.length; i++) {
      var opt = select.options[i];
      if (!opt.hasAttribute(ORIGINAL_TEXT_ATTR)) {
        opt.setAttribute(ORIGINAL_TEXT_ATTR, opt.text);
      }
      var original = opt.getAttribute(ORIGINAL_TEXT_ATTR);
      var index = parseInt(opt.value, 10);
      opt.text = (hasCustomStyles(skin, index) ? BULLET : "") + original;
    }
  }

  function enhancePopover(popover) {
    refreshBadges(popover);
    if (popover.hasAttribute(ENHANCED_ATTR)) return;
    popover.setAttribute(ENHANCED_ATTR, "true");

    var select = getComponentSelect(popover);
    if (select && !select.hasAttribute("data-cp-bound")) {
      select.setAttribute("data-cp-bound", "true");
      select.addEventListener("change", function() {
        // Let the Advanced tab swap to the newly selected component first.
        setTimeout(function() { refreshBadges(popover); }, 50);
      });
    }

    // Keep badges live as the user types in the Advanced tab's CSS editor
    // for whichever component is currently selected, so switching away from
    // it shows an up-to-date badge without requiring a save first.
    popover.addEventListener("input", function(e) {
      if (e.target && e.target.tagName === "TEXTAREA") {
        clearTimeout(typingTimer);
        typingTimer = setTimeout(function() { refreshBadges(popover); }, 300);
      }
    });
  }

  function scanAndEnhance() {
    var popovers = getSkinEditorPopovers();
    console.log("[CP Toolkit](widget-skin-custom-css-indicator) scanAndEnhance: found " + popovers.length + " popover(s)");
    for (var i = 0; i < popovers.length; i++) enhancePopover(popovers[i]);
  }

  function scheduleScanAndEnhance() {
    clearTimeout(scanTimer);
    scanTimer = setTimeout(scanAndEnhance, 80);
  }

  function bindObservers() {
    if (observer || !window.MutationObserver || !document.body) {
      console.log("[CP Toolkit](widget-skin-custom-css-indicator) bindObservers: skipped (observer=" + !!observer + " MutationObserver=" + !!window.MutationObserver + " body=" + !!document.body + ")");
      return;
    }

    // The skin editor popover is a persistent DOM node that toggles
    // visibility via its own inline "style" (display: none/block) rather
    // than being added/removed from the DOM, so added-node mutations alone
    // never fire when it's opened. Watching style/class attribute changes
    // too catches that open/close toggle.
    observer = new MutationObserver(function(mutations) {
      for (var i = 0; i < mutations.length; i++) {
        var m = mutations[i];
        if (!m) continue;
        if ((m.addedNodes && m.addedNodes.length) || m.type === "attributes") {
          scheduleScanAndEnhance();
          break;
        }
      }
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["style", "class"]
    });
    console.log("[CP Toolkit](widget-skin-custom-css-indicator) bindObservers: observer attached");
  }

  function init() {
    if (initialized) return;
    initialized = true;

    scanAndEnhance();
    bindObservers();
    console.log("[CP Toolkit] Loaded " + thisTool);
  }

  chrome.storage.local.get([thisTool], function(settings) {
    if (chrome.runtime.lastError) {
      console.error("[CP Toolkit] Error loading settings for " + thisTool + ":", chrome.runtime.lastError);
      return;
    }

    detect_if_cp_site(function() {
      if (window.top !== window.self) return;
      if (settings[thisTool] === false || !isThemesPage()) {
        console.log("[CP Toolkit](widget-skin-custom-css-indicator) init skipped: settingOff=" + (settings[thisTool] === false) + " isThemesPage=" + isThemesPage() + " path=" + window.location.pathname);
        return;
      }

      if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", init);
      } else {
        init();
      }
    });
  });
})();
