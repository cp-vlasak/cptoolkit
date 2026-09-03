// Widget Skin Custom CSS Indicator - Page Context Helper (MAIN world)
// DesignCenter.themeJSON only exists in the page's own MAIN world; an
// isolated-world content script can never see it directly. This helper
// runs in MAIN world, reads it on request, and relays the answer back via
// a CustomEvent on document, which does cross the isolated/main boundary.
(function() {
  if (window.__CPToolkit_skinCssReaderInjected) return;
  window.__CPToolkit_skinCssReaderInjected = true;

  // A component's Advanced tab can combine several raw-CSS fields into one
  // view - e.g. a Link-type component (Item Link, "Read on"/"View all"/
  // "RSS" Link) shows its :link, :hover and :visited blocks stacked
  // together, each backed by a separate field. Checking only
  // MiscellaneousStyles missed all of those entirely.
  var CSS_FIELDS = [
    'MiscellaneousStyles',
    'HeaderMiscellaneousStyles1',
    'HeaderMiscellaneousStyles2',
    'HeaderMiscellaneousStyles3',
    'LinkNormalMiscellaneousStyles',
    'LinkHoverMiscellaneousStyles',
    'LinkVisitedMiscellaneousStyles'
  ];

  function componentHasCustomCss(component) {
    if (!component) return false;
    for (var i = 0; i < CSS_FIELDS.length; i++) {
      var css = component[CSS_FIELDS[i]];
      if (typeof css === 'string' && css.trim().length > 0) return true;
    }
    return false;
  }

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
          hasCssByIndex[index] = componentHasCustomCss(component);
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
