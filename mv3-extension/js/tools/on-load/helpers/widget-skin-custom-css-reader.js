// Widget Skin Custom CSS Indicator - Page Context Helper (MAIN world)
// DesignCenter.themeJSON only exists in the page's own MAIN world; an
// isolated-world content script can never see it directly. This helper
// runs in MAIN world, reads it on request, and relays the answer back via
// a CustomEvent on document, which does cross the isolated/main boundary.
(function() {
  if (window.__CPToolkit_skinCssReaderInjected) return;
  window.__CPToolkit_skinCssReaderInjected = true;

  document.addEventListener('cp-toolkit-request-skin-css-map', function(e) {
    var detail = e.detail || {};
    var skinId = detail.skinId;
    var requestId = detail.requestId;
    var hasCssByIndex = {};

    try {
      var themeJSON = window.DesignCenter && window.DesignCenter.themeJSON;
      var skin = themeJSON && themeJSON.WidgetSkins
        ? themeJSON.WidgetSkins.find(function(s) { return String(s.WidgetSkinID) === String(skinId); })
        : null;

      if (skin && skin.Components) {
        skin.Components.forEach(function(component, index) {
          var css = component && component.MiscellaneousStyles;
          hasCssByIndex[index] = typeof css === 'string' && css.trim().length > 0;
        });
      }
    } catch (err) {
      // leave hasCssByIndex empty on any error reading the page's own model
    }

    document.dispatchEvent(new CustomEvent('cp-toolkit-skin-css-map-response', {
      detail: { requestId: requestId, hasCssByIndex: hasCssByIndex }
    }));
  });
})();
