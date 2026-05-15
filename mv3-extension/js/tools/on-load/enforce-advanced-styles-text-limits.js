(function loadTool() {
  var thisTool = "enforce-advanced-styles-text-limits";
  chrome.storage.local.get(thisTool, function(settings) {
    if (chrome.runtime.lastError) {
      console.error("[CP Toolkit] Error loading settings for " + thisTool + ":", chrome.runtime.lastError);
      return;
    }
    if (settings[thisTool] === false) return;

    var pathname = window.location.pathname.toLowerCase();
    var isThemeManager = pathname.startsWith("/designcenter/themes/");
    var isGraphicLinks = pathname === "/admin/graphiclinks.aspx";
    if (!isThemeManager && !isGraphicLinks) return;

    detect_if_cp_site(function() {
      console.log("[CP Toolkit] Loaded " + thisTool);

      // Idempotent setter: writes only when current attribute differs from target.
      // Required because the CMS pre-sets maxlength="1000" on skin textareas (wrong cap)
      // and because reused nodes across popovers need to be reclassified on rerun.
      function setMaxlengthIfNeeded($el, target) {
        var current = parseInt($el.attr("maxlength"), 10);
        if (current !== target) $el.attr("maxlength", target);
      }

      // Class-based classification verified via live DOM 2026-05-14:
      //   widgetSkin     → skin advanced styles (4000)
      //   containerStyle → container & featureColumn (1000)
      //   menu           → main nav (1000)
      //   (unrecognized) → conservative 1000
      function applyTheme() {
        $(".cpPopOver textarea.css-editor-textarea").each(function() {
          var target = $(this).hasClass('widgetSkin') ? 4000 : 1000;
          setMaxlengthIfNeeded($(this), target);
        });
      }

      function applyGraphicLinks() {
        $('textarea[id^="fancyButton"][id$="MiscStyles"]').each(function() {
          setMaxlengthIfNeeded($(this), 1200);
        });
      }

      function initWhenReady() {
        if (!document.body) { setTimeout(initWhenReady, 50); return; }
        try {
          var apply = isThemeManager ? applyTheme : applyGraphicLinks;
          apply();
          // Coalesce mutation bursts to one apply per animation frame. mini-ide
          // rewrites backdrop.innerHTML on every keystroke; without rAF batching
          // the body-level subtree observer would re-run the jQuery selector on
          // every input event.
          var rafId = null;
          var observer = new MutationObserver(function() {
            if (rafId !== null) return;
            rafId = requestAnimationFrame(function() {
              rafId = null;
              apply();
            });
          });
          observer.observe(document.body, { childList: true, subtree: true });
        } catch (err) {
          console.warn("[CP Toolkit](" + thisTool + ") Error:", err);
        }
      }

      initWhenReady();
    });
  });
})();
