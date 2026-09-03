(function loadTool() {
  var thisTool = "graphic-link-advanced-style-helper";
  
  chrome.storage.local.get(thisTool, function(settings) {
    if (chrome.runtime.lastError) {
      console.error("[CP Toolkit] Error loading settings for " + thisTool + ":", chrome.runtime.lastError);
      return;
    }
    
    detect_if_cp_site(function() {
      // This tool runs by default unless explicitly disabled
      if (settings[thisTool] !== false) {
        console.log("[CP Toolkit] Loaded " + thisTool);
        try {
          initGraphicLinkHelper();
        } catch (err) {
          console.warn("[CP Toolkit](" + thisTool + ") Error:", err);
        }
      } else {
        // console.log("[CP Toolkit] ○ Skipping " + thisTool + " (disabled in settings)");
      }
    });
  });
  
  function initGraphicLinkHelper() {
    'use strict';
    
    const TOOLKIT_NAME = '[CP Graphic Link Helper]';
    
    // Only run on Graphic Links page - check both path and URL
    const currentPath = window.location.pathname.toLowerCase();
    const currentHref = window.location.href.toLowerCase();
    const isGraphicLinksPage = currentPath.includes('/admin/graphiclinks.aspx') || 
                                currentHref.includes('/admin/graphiclinks.aspx') ||
                                currentPath.includes('graphiclinks.aspx');
    
    if (!isGraphicLinksPage) {
      // console.log(TOOLKIT_NAME + ' Not on Graphic Links page (path: ' + currentPath + '), skipping...');
      return;
    }
    
    // console.log(TOOLKIT_NAME + ' Initializing on Graphic Links page...');
    
    // Store current button selector
    let currentFancyButtonSelector = 'fancyButton1';
    
    // ==================== FANCY BUTTON DETECTION ====================
    function getFancyButtonId() {
      const fancyButtonContainer = document.querySelector('.fancyButtonContainer a.fancyButton');
      if (!fancyButtonContainer) return null;
      
      const classes = fancyButtonContainer.className;
      if (!classes) return null;
      
      const classList = classes.split(' ');
      for (const cls of classList) {
        const match = cls.match(/^fancyButton(\d+)$/);
        if (match && match[1]) {
          currentFancyButtonSelector = 'fancyButton' + match[1];
          return match[1];
        }
      }
      
      currentFancyButtonSelector = 'fancyButton1';
      return '1';
    }
    
    function getCurrentFancyButtonSelector() {
      getFancyButtonId();
      return currentFancyButtonSelector;
    }
    
    // ==================== NUMBER REPLACEMENT FUNCTIONS ====================
    function normalizeToFancyButton1(text) {
      return text.replace(/\.fancyButton\d+\b/g, '.fancyButton1');
    }
    
    function denormalizeFromFancyButton1(text, selector) {
      if (!selector || selector === 'fancyButton1') return text;
      return text.replace(/\.fancyButton1\b/g, '.' + selector);
    }
    
    // ==================== FIX RENDERED STYLES ====================
    function fixRenderedFancyButtonStyles() {
      const fancyButtons = document.querySelectorAll('a.fancyButton[class*="fancyButton"]');
      
      fancyButtons.forEach(button => {
        const classes = button.className.split(' ');
        const buttonClass = classes.find(c => c.match(/^fancyButton\d+$/));
        
        if (!buttonClass) return;
        
        const buttonNum = buttonClass.replace('fancyButton', '');
        if (buttonNum === '1') return;
        
        // Find associated style tag
        let styleTag = null;
        
        // Method 1: Check siblings
        let currentElement = button.nextElementSibling;
        while (currentElement && !styleTag) {
          if (currentElement.tagName === 'STYLE') {
            styleTag = currentElement;
            break;
          }
          currentElement = currentElement.nextElementSibling;
        }
        
        // Method 2: Check parent container
        if (!styleTag) {
          const container = button.closest('td') || button.closest('div') || button.closest('.fancyButtonContainer');
          if (container) {
            styleTag = container.querySelector('style[scoped]') || container.querySelector('style');
          }
        }
        
        // Method 3: Check parent's siblings
        if (!styleTag) {
          const parent = button.parentElement;
          if (parent) {
            let sibling = parent.nextElementSibling;
            while (sibling && !styleTag) {
              if (sibling.tagName === 'STYLE') {
                styleTag = sibling;
                break;
              }
              styleTag = sibling.querySelector('style');
              if (styleTag) break;
              sibling = sibling.nextElementSibling;
            }
          }
        }
        
        if (styleTag && styleTag.tagName === 'STYLE') {
          const originalCSS = styleTag.textContent;
          const updatedCSS = originalCSS.replace(/\.fancyButton1\b/g, `.fancyButton${buttonNum}`);
          
          if (originalCSS !== updatedCSS) {
            styleTag.textContent = updatedCSS;
            // console.log(TOOLKIT_NAME + ' Fixed styles: .fancyButton1 → .fancyButton' + buttonNum);
          }
        }
      });
    }
    
    // ==================== FIX HTML-ENCODED CSS ====================
    // The CMS sometimes HTML-encodes CSS inside <style> tags on the
    // graphic link edit page (e.g. content: &quot;&quot; instead of content: "").
    // HTML entities are not decoded inside <style> tags, so the CSS breaks.
    // Only decode &quot; and &amp; — skip &lt;/&gt; to avoid any risk.
    function fixHtmlEncodedStyles() {
      const allStyles = document.querySelectorAll('style');
      allStyles.forEach(styleTag => {
        const css = styleTag.textContent;
        if (css.indexOf('fancyButton') < 0) return;
        if (css.indexOf('&quot;') < 0 && css.indexOf('&amp;') < 0) return;
        const fixed = css.replace(/&quot;/g, '"').replace(/&amp;/g, '&');
        if (fixed !== css) {
          styleTag.textContent = fixed;
        }
      });
    }

    // The CMS can leave a previous Fancy Button Builder modal's DOM behind
    // (hidden) when it is reopened without a full page reload. Any lookup
    // that assumes there is only one #selectedTab or one #fancyButton*Misc
    // in the whole document can silently grab a stale, hidden instance
    // instead of the one actually on screen. Scoping to the visible modal
    // avoids that.
    function getVisibleFancyButtonModal() {
      const modals = document.querySelectorAll('.modalContainer.fancyButtonBuilder');
      for (const m of modals) {
        if (m.offsetParent !== null) return m;
      }
      return modals[0] || null;
    }

    // ==================== FANCY BUTTON ID BADGE ====================
    // Shows the real .fancyButtonN class next to the Fancy Button Builder
    // modal title so the number is visible without opening DevTools.
    function injectFancyButtonIdBadge() {
      const modal = getVisibleFancyButtonModal();
      if (!modal) return;

      const titleEl = modal.querySelector('h3.modalTitle');
      const titleLeft = titleEl && titleEl.parentElement;
      if (!titleLeft) return;

      let badge = titleLeft.querySelector('.cpFancyButtonIdBadge');
      if (!badge) {
        badge = document.createElement('span');
        badge.className = 'cpFancyButtonIdBadge';
        badge.style.cssText = 'display:inline-block;margin-left:8px;padding:2px 10px;' +
          'background:#0b5b8a;color:#fff;border-radius:999px;font-size:12px;' +
          'font-weight:600;font-family:Arial,sans-serif;vertical-align:middle;' +
          'letter-spacing:.02em;';
        titleLeft.appendChild(badge);
      }

      const buttonId = getFancyButtonId();
      badge.textContent = buttonId ? ('#' + buttonId) : 'unsaved';
      badge.title = buttonId
        ? ('This is Fancy Button #' + buttonId + '. Use .fancyButton' + buttonId + ' when referencing this button in a selector.')
        : 'This button has not been saved yet, so it does not have a permanent ID.';
    }

    // ==================== SELECTOR COPY BUTTONS ====================
    // Each Advanced Styles panel (Background outer/inner, Default Text
    // Style, and any number of added Text Styles) is identified by the
    // #selectedTab dropdown's option value, e.g. "#fancyButtonText2".
    // That id is a stable, CMS-controlled anchor — unlike the on-screen
    // selector label, which the native UI renders identically for
    // Background (inner), Default Text Style, and every Text Style N.
    // The real per-style class (.textStyleN) comes from cp-ImportFancyButton.js,
    // which already relies on that same rendered markup.
    function getSelectorBaseForContainerId(containerId) {
      if (containerId === 'fancyButtonOuterBackground') return '';
      if (containerId === 'fancyButtonInnerBackground') return ' .text';
      if (containerId === 'fancyButtonText') return ' .text';
      const styleMatch = containerId.match(/^fancyButtonText(\d+)$/);
      if (styleMatch) return ' .textStyle' + styleMatch[1];
      return null;
    }

    // The ADV STYLES content for a level lives in a separate "Misc" panel,
    // not the panel named by the #selectedTab option value itself (that one
    // only holds Background & Border / Spacing & Sizing fields). Confirmed
    // by direct measurement (getBoundingClientRect + computed display) of
    // each candidate container:
    //   - Background outer/inner each get their own permanent Misc panel.
    //   - Default Text Style's panel is #fancyButtonTextStyleMisc (no suffix).
    //   - Each added Text Style N gets its OWN panel, #fancyButtonTextStyleMiscN
    //     — NOT a shared panel. (An earlier version of this code assumed all
    //     Text Styles shared one #fancyButtonTextStyleMisc container; that
    //     was wrong — that id belongs only to Default Text Style, is real,
    //     and stays in the DOM with display:none once a numbered style is
    //     added, which is why buttons injected into it were never visible.)
    function getMiscContainerId(containerId) {
      if (containerId === 'fancyButtonOuterBackground') return 'fancyButtonOuterBackgroundMisc';
      if (containerId === 'fancyButtonInnerBackground') return 'fancyButtonInnerBackgroundMisc';
      if (containerId === 'fancyButtonText') return 'fancyButtonTextStyleMisc';
      const styleMatch = containerId.match(/^fancyButtonText(\d+)$/);
      if (styleMatch) return 'fancyButtonTextStyleMisc' + styleMatch[1];
      return null;
    }

    function buildSelectorCopySnippet(buttonId, base, isHover) {
      const state = isHover ? ':is(:hover, :focus, :active)' : '';
      let snippet = '.fancyButton1' + state + base;
      if (buttonId && buttonId !== '1') {
        snippet += ',\n.fancyButton' + buttonId + state + base;
      }
      return '}\n\n' + snippet + ' {';
    }

    function copySelectorSnippetToClipboard(text) {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).catch(() => fallbackCopySnippet(text));
      } else {
        fallbackCopySnippet(text);
      }
    }

    function fallbackCopySnippet(text) {
      const scratch = document.createElement('textarea');
      scratch.value = text;
      scratch.style.position = 'fixed';
      scratch.style.opacity = '0';
      document.body.appendChild(scratch);
      scratch.select();
      try { document.execCommand('copy'); } catch (err) { /* no-op */ }
      document.body.removeChild(scratch);
    }

    function makeSelectorCopyButton(base, isHover) {
      const wrapper = document.createElement('span');
      wrapper.className = 'cpSelectorCopyBtn';
      wrapper.style.cssText = 'position:relative !important;display:inline-flex !important;' +
        'align-items:center !important;margin:0 0 0 10px !important;';

      const btn = document.createElement('button');
      btn.type = 'button';
      btn.textContent = '⧉';
      btn.style.cssText = 'display:inline-flex !important;align-items:center !important;' +
        'justify-content:center !important;width:20px !important;height:20px !important;' +
        'min-width:20px !important;max-width:20px !important;min-height:20px !important;' +
        'max-height:20px !important;margin:0 !important;padding:0 !important;' +
        'font-size:12px !important;line-height:1 !important;cursor:pointer !important;' +
        'border:1px solid #b9c6cf !important;border-radius:4px !important;' +
        'background:#f5f8fa !important;color:#0b5b8a !important;box-shadow:none !important;' +
        'box-sizing:border-box !important;appearance:none !important;' +
        '-webkit-appearance:none !important;';

      const tooltip = document.createElement('span');
      tooltip.textContent = 'Copy a starting selector for a new rule at this level';
      tooltip.style.cssText = 'position:absolute !important;top:130% !important;' +
        'left:0 !important;' +
        'background:#1f2d3a !important;color:#fff !important;padding:5px 9px !important;' +
        'border-radius:4px !important;font-size:11px !important;line-height:1.3 !important;' +
        'white-space:nowrap !important;display:none !important;z-index:10000 !important;' +
        'pointer-events:none !important;box-shadow:0 2px 6px rgba(0,0,0,.25) !important;' +
        'font-family:Arial,sans-serif !important;';

      btn.addEventListener('mouseenter', function() { tooltip.style.setProperty('display', 'block', 'important'); });
      btn.addEventListener('mouseleave', function() { tooltip.style.setProperty('display', 'none', 'important'); });

      // No click listener here. Live testing showed a listener bound
      // directly to a button created in one injection cycle can stop
      // firing later — most likely the CMS replacing/duplicating this
      // subtree when the panel re-renders on tab switch, which would
      // silently drop any listener attached to the node it discards. A
      // single delegated listener on the modal (bound once, in
      // injectSelectorCopyButtons, and never destroyed for the modal's
      // lifetime) reads these two data attributes fresh on every click
      // instead, so it can't go stale the same way.
      wrapper.dataset.cpBase = base;
      wrapper.dataset.cpHover = isHover ? 'true' : 'false';

      wrapper.appendChild(btn);
      wrapper.appendChild(tooltip);
      return wrapper;
    }

    function handleSelectorCopyClick(e) {
      const wrapper = e.target.closest('.cpSelectorCopyBtn');
      if (!wrapper) return;
      const btn = e.target.closest('button');
      if (!btn) return;
      e.preventDefault();
      e.stopPropagation();

      const base = wrapper.dataset.cpBase || '';
      const isHover = wrapper.dataset.cpHover === 'true';
      const buttonId = getFancyButtonId();
      const snippet = buildSelectorCopySnippet(buttonId, base, isHover);
      copySelectorSnippetToClipboard(snippet);

      const tooltip = wrapper.querySelector('span');
      if (tooltip) {
        const original = tooltip.dataset.cpOriginalText || tooltip.textContent;
        tooltip.dataset.cpOriginalText = original;
        tooltip.textContent = 'Copied!';
        setTimeout(() => { tooltip.textContent = original; }, 1200);
      }
    }

    function injectSelectorCopyButtons() {
      const modal = getVisibleFancyButtonModal();
      if (!modal) return;

      // Bound once per modal instance, never rebound — this is what makes
      // the click handling immune to individual buttons being replaced.
      if (!modal.dataset.cpCopyDelegationBound) {
        modal.addEventListener('click', handleSelectorCopyClick);
        modal.dataset.cpCopyDelegationBound = 'true';
      }

      const tabSelect = modal.querySelector('select#selectedTab');
      if (!tabSelect) return;

      // Map, not Set: each Misc container now maps 1:1 to a specific level,
      // so the correct base class can be baked in once, from the DOM
      // structure itself, rather than re-read from the dropdown at click
      // time (which proved unreliable immediately after adding a new Text
      // Style, before the dropdown's own value settles).
      const miscToBase = new Map();
      tabSelect.querySelectorAll('option').forEach(opt => {
        const containerId = (opt.value || '').replace(/^#/, '');
        if (!containerId) return;
        const miscId = getMiscContainerId(containerId);
        const base = getSelectorBaseForContainerId(containerId);
        if (miscId && base !== null && !miscToBase.has(miscId)) {
          miscToBase.set(miscId, base);
        }
      });

      miscToBase.forEach((base, miscId) => {
        const container = modal.querySelector('#' + miscId);
        if (!container) return;

        const headers = container.querySelectorAll('p.cpExpandCollapseControl');
        headers.forEach((header, idx) => {
          const isHover = idx === 1;
          if (header.parentElement.querySelector('.cpSelectorCopyBtn')) return;

          const parent = header.parentElement;
          const box = header.nextElementSibling; // .cpExpandCollapseBox

          // Constraints confirmed by live testing:
          // 1. header.nextElementSibling is the .cpExpandCollapseBox that
          //    holds the textarea, and the native toggle depends on that
          //    direct adjacency — the button must never be inserted there.
          // 2. The header's own toggle listener fires before a descendant's
          //    handler could stop it (capture phase and/or mousedown), so
          //    the button must never be a descendant of the header either.
          // The button is therefore inserted as a DOM sibling *before* the
          // header (preserving both constraints), and flexbox `order` on
          // the shared parent visually moves it to after the header text —
          // `order` changes paint order only, never nextElementSibling, so
          // the toggle keeps working. (An earlier attempt used
          // `display:inline-block` on the header for same-line layout; that
          // introduced a large gap above the content box, a known
          // inline-block whitespace quirk. flex has no such issue —
          // measured zero gap live.)
          parent.style.setProperty('display', 'flex', 'important');
          parent.style.setProperty('flex-wrap', 'wrap', 'important');
          parent.style.setProperty('align-items', 'center', 'important');
          header.style.setProperty('order', '1', 'important');
          if (box) {
            box.style.setProperty('order', '3', 'important');
            box.style.setProperty('flex-basis', '100%', 'important');
          }

          const btn = makeSelectorCopyButton(base, isHover);
          btn.style.setProperty('order', '2', 'important');
          header.insertAdjacentElement('beforebegin', btn);
        });
      });
    }

    // ==================== PROCESS TEXTAREAS ====================
    function processTextareas() {
      const buttonId = getFancyButtonId();
      if (!buttonId) return;
      
      const textareas = document.querySelectorAll(
        'textarea#fancyButtonNormalMiscStyles, ' +
        'textarea#fancyButtonHoverMiscStyles, ' +
        'textarea[id^="fancyButton"][id$="MiscStyles"], ' +
        'textarea.autoUpdate'
      );
      
      textareas.forEach(textarea => {
        const currentValue = textarea.value;
        if (!currentValue) return;
        
        // Skip if already processed
        if (textarea.dataset.cpFancyProcessed === 'true') return;
        
        // Normalize to fancyButton1 for editing
        const normalizedText = normalizeToFancyButton1(currentValue);
        
        if (currentValue !== normalizedText) {
          textarea.value = normalizedText;
          textarea.dispatchEvent(new Event('change', { bubbles: true }));
          textarea.dispatchEvent(new Event('input', { bubbles: true }));
          // console.log(TOOLKIT_NAME + ' ✓ Normalized to .fancyButton1 in #' + (textarea.id || 'textarea'));
        }
        
        textarea.dataset.cpFancyProcessed = 'true';
      });
    }
    
    // ==================== INSERT BUTTON HANDLER ====================
    // Selector-list-aware rewrite via window.CPToolkit.portable.applyForSave
    // preserves dual selectors when the user has applied "Make Portable".
    // Falls back to flat regex if the portable helper isn't loaded yet.
    function portableApplyForSave(text, selector) {
      const portable = window.CPToolkit && window.CPToolkit.portable;
      if (portable && typeof portable.applyForSave === 'function') {
        return portable.applyForSave(text, selector);
      }
      return text.replace(/\.fancyButton\d+\b/g, '.' + selector);
    }

    function addInsertButtonFallback(insertBtn) {
      // Fallback for when jQuery isn't available or handlers aren't attached yet
      insertBtn.addEventListener('click', function(e) {
        const currentSelector = getCurrentFancyButtonSelector();
        // console.log(TOOLKIT_NAME + ' Insert clicked (fallback) - converting to .' + currentSelector);

        // Update all textareas
        document.querySelectorAll('textarea.autoUpdate, textarea[id^="fancyButton"][id$="MiscStyles"]').forEach(textarea => {
          if (textarea.value) {
            const newText = portableApplyForSave(textarea.value, currentSelector);
            if (newText !== textarea.value) {
              textarea.value = newText;
              textarea.dispatchEvent(new Event('change', { bubbles: true }));
              textarea.dispatchEvent(new Event('input', { bubbles: true }));
            }
          }
        });
        
        // Fix button class after a delay (let CivicPlus code run first)
        setTimeout(() => {
          if (typeof $ !== 'undefined') {
            const buttonEl = $('.fancyButtonContainer a.fancyButton');
            if (buttonEl.length) {
              const newClass = buttonEl.attr('class').replace(/fancyButton\d+/g, currentSelector);
              buttonEl.attr('class', newClass);
            }
          } else {
            const buttonEl = document.querySelector('.fancyButtonContainer a.fancyButton');
            if (buttonEl) {
              buttonEl.className = buttonEl.className.replace(/fancyButton\d+/g, currentSelector);
            }
          }
        }, 100);
      }, true); // Use capture phase to run before other handlers
    }
    
    function setupInsertButtonHandler() {
      const observer = new MutationObserver(() => {
        const insertBtn = document.querySelector('.insertFancy');
        if (insertBtn && !insertBtn.dataset.cpToolkitBound) {
          insertBtn.dataset.cpToolkitBound = 'true';
          // console.log(TOOLKIT_NAME + ' Found insert button, setting up handler...');
          
          let handlerAttached = false;
          
          // Try jQuery method first if available
          if (typeof $ !== 'undefined' && typeof $._data === 'function') {
            try {
              const events = $._data(insertBtn, 'events');
              if (events && events.click && events.click[0]) {
                const oldHandler = events.click[0].handler;
                
                function newHandler(e) {
                  const currentSelector = getCurrentFancyButtonSelector();
                  // console.log(TOOLKIT_NAME + ' Insert clicked (jQuery) - converting to .' + currentSelector);

                  // Update all textareas
                  $('textarea.autoUpdate').each(function() {
                    let text = $(this).val();
                    text = portableApplyForSave(text, currentSelector);
                    $(this).val(text);
                    $(this).change();
                  });

                  document.querySelectorAll('textarea[id^="fancyButton"][id$="MiscStyles"]').forEach(textarea => {
                    if (textarea.value) {
                      const newText = portableApplyForSave(textarea.value, currentSelector);
                      if (newText !== textarea.value) {
                        textarea.value = newText;
                        textarea.dispatchEvent(new Event('change', { bubbles: true }));
                      }
                    }
                  });
                  
                  // Call original handler
                  oldHandler(e);
                  
                  // Fix button class
                  setTimeout(() => {
                    const buttonEl = $('.fancyButtonContainer a.fancyButton');
                    if (buttonEl.length) {
                      const newClass = buttonEl.attr('class').replace(/fancyButton\d+/g, currentSelector);
                      buttonEl.attr('class', newClass);
                    }
                  }, 100);
                }
                
                $('.insertFancy').unbind('click').click(newHandler);
                // console.log(TOOLKIT_NAME + ' ✓ Insert button handler attached (jQuery method)');
                handlerAttached = true;
              } else {
                // console.log(TOOLKIT_NAME + ' No jQuery click handler found yet, using fallback');
              }
            } catch (err) {
              console.warn(TOOLKIT_NAME + ' jQuery handler error:', err);
            }
          } else {
            // console.log(TOOLKIT_NAME + ' jQuery not available, using fallback');
          }
          
          // Use fallback if jQuery method didn't work
          if (!handlerAttached) {
            addInsertButtonFallback(insertBtn);
            // console.log(TOOLKIT_NAME + ' ✓ Insert button handler attached (fallback method)');
          }
          
          observer.disconnect();
        }
      });
      
      if (document.body) {
        observer.observe(document.body, { childList: true, subtree: true });
      }
    }
    
    // ==================== MUTATION OBSERVER ====================
    function startObserving() {
      let debounceTimer = null;
      
      const observer = new MutationObserver(() => {
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => {
          processTextareas();
          fixHtmlEncodedStyles();
          fixRenderedFancyButtonStyles();
          injectFancyButtonIdBadge();
          injectSelectorCopyButtons();
        }, 300);
      });
      
      if (document.body) {
        observer.observe(document.body, { childList: true, subtree: true });
      }
    }
    
    // ==================== INITIALIZATION ====================
    // console.log(TOOLKIT_NAME + ' Starting initialization...');
    // console.log(TOOLKIT_NAME + ' - document.readyState:', document.readyState);
    // console.log(TOOLKIT_NAME + ' - document.body exists:', !!document.body);
    
    if (document.readyState === 'loading') {
      // console.log(TOOLKIT_NAME + ' Waiting for DOMContentLoaded...');
      document.addEventListener('DOMContentLoaded', () => {
        // console.log(TOOLKIT_NAME + ' DOMContentLoaded fired, initializing...');
        processTextareas();
        fixRenderedFancyButtonStyles();
        injectFancyButtonIdBadge();
        injectSelectorCopyButtons();
        setupInsertButtonHandler();
        startObserving();
      });
    } else {
      // console.log(TOOLKIT_NAME + ' Document already loaded, initializing immediately...');
      processTextareas();
      fixRenderedFancyButtonStyles();
      injectFancyButtonIdBadge();
      injectSelectorCopyButtons();
      setupInsertButtonHandler();
      startObserving();
    }

    // Expose API
    window.CPToolkit = window.CPToolkit || {};
    window.CPToolkit.graphicLinkHelper = {
      getFancyButtonId: getFancyButtonId,
      getCurrentFancyButtonSelector: getCurrentFancyButtonSelector,
      normalizeToFancyButton1: normalizeToFancyButton1,
      denormalizeFromFancyButton1: denormalizeFromFancyButton1,
      fixRenderedFancyButtonStyles: fixRenderedFancyButtonStyles,
      processTextareas: processTextareas,
      injectFancyButtonIdBadge: injectFancyButtonIdBadge,
      injectSelectorCopyButtons: injectSelectorCopyButtons
    };
    
    // console.log(TOOLKIT_NAME + ' ✓ Ready');
  }
})();
