/**
 * Copied Skins Helper - Runs in MAIN world to access DesignCenter API
 *
 * This script is injected via <script> tag from the css-snippets content script.
 * It bridges the isolated content script world with the page's DesignCenter object.
 *
 * Communication is via CustomEvents on document:
 *   Content script -> Helper: 'cp-toolkit-copied-skins-request'
 *   Helper -> Content script: 'cp-toolkit-copied-skins-response'
 */
(function() {
    'use strict';

    var TOOLKIT_NAME = '[CP Copied Skins Helper]';

    // Listen for requests from the content script
    document.addEventListener('cp-toolkit-copied-skins-request', function(e) {
        var request = e.detail;
        if (!request || !request.action) return;

        var response = { action: request.action, requestId: request.requestId };

        try {
            switch (request.action) {
                case 'check':
                    // Check if DesignCenter is available
                    response.available = !!(window.DesignCenter &&
                        DesignCenter.themeJSON &&
                        DesignCenter.themeJSON.WidgetSkins);
                    break;

                case 'getSkins':
                    // Get list of valid skins (lightweight - just name and ID)
                    response.skins = [];
                    if (window.DesignCenter && DesignCenter.themeJSON && DesignCenter.themeJSON.WidgetSkins) {
                        DesignCenter.themeJSON.WidgetSkins.forEach(function(s) {
                            if (s.Name && s.WidgetSkinID && s.Components) {
                                response.skins.push({
                                    Name: s.Name,
                                    WidgetSkinID: s.WidgetSkinID,
                                    componentCount: s.Components.length
                                });
                            }
                        });
                    }
                    break;

                case 'readSkin':
                    // Read full skin component data for saving
                    var skinId = request.skinId;
                    response.skinData = null;

                    if (window.DesignCenter && DesignCenter.themeJSON && DesignCenter.themeJSON.WidgetSkins) {
                        var skin = null;
                        DesignCenter.themeJSON.WidgetSkins.forEach(function(s) {
                            if (s.WidgetSkinID == skinId && s.Components) {
                                skin = s;
                            }
                        });

                        if (skin) {
                            var components = [];
                            var COMPONENT_TYPES = [
                                { index: 0, name: 'Wrapper', view: 'items' },
                                { index: 1, name: 'Header', view: 'items' },
                                { index: 2, name: 'Item List', view: 'items' },
                                { index: 3, name: 'Item', view: 'items' },
                                { index: 4, name: 'Item Title', view: 'items' },
                                { index: 5, name: 'Item Secondary Text', view: 'items' },
                                { index: 6, name: 'Item Bullets', view: 'items' },
                                { index: 7, name: 'Item Link', view: 'items' },
                                { index: 8, name: 'Read On', view: 'items' },
                                { index: 9, name: 'View All', view: 'items' },
                                { index: 10, name: 'RSS', view: 'items' },
                                { index: 11, name: 'Footer', view: 'items' },
                                { index: 12, name: 'Tab List', view: 'tabbed' },
                                { index: 13, name: 'Tab', view: 'tabbed' },
                                { index: 14, name: 'Tab Panel', view: 'tabbed' },
                                { index: 15, name: 'Column Seperator', view: 'columns' },
                                { index: 16, name: 'Calendar Header', view: 'calendar' },
                                { index: 17, name: 'Cal Grid', view: 'calendar' },
                                { index: 18, name: 'Cal Day Headers', view: 'calendar' },
                                { index: 19, name: 'Cal Day', view: 'calendar' },
                                { index: 20, name: 'Cal Event Link', view: 'calendar' },
                                { index: 21, name: 'Cal Today', view: 'calendar' },
                                { index: 22, name: 'Cal Day Not In Month', view: 'calendar' },
                                { index: 23, name: 'Cal Wrapper', view: 'calendar' }
                            ];

                            for (var i = 0; i < 24; i++) {
                                if (skin.Components[i]) {
                                    var compInfo = COMPONENT_TYPES[i];
                                    components.push({
                                        idx: i,
                                        type: compInfo ? compInfo.name : 'Component ' + i,
                                        view: compInfo ? compInfo.view : 'items',
                                        data: JSON.parse(JSON.stringify(skin.Components[i]))
                                    });
                                }
                            }

                            response.skinData = {
                                sourceSkinName: skin.Name,
                                sourceSkinID: skin.WidgetSkinID,
                                componentIndexes: Array.from({length: 24}, function(_, i) { return i; }),
                                components: components
                            };
                        }
                    }
                    break;

                case 'applySkin':
                    // Apply saved skin data to a target skin
                    var targetSkinId = request.targetSkinId;
                    var savedComponents = request.components;
                    var sourceSkinId = request.sourceSkinId;
                    response.success = false;
                    response.copiedCount = 0;

                    if (!window.DesignCenter || !DesignCenter.themeJSON || !DesignCenter.themeJSON.WidgetSkins) {
                        response.error = 'DesignCenter not available';
                        break;
                    }

                    var targetSkin = null;
                    DesignCenter.themeJSON.WidgetSkins.forEach(function(s) {
                        if (s.WidgetSkinID == targetSkinId && s.Components) {
                            targetSkin = s;
                        }
                    });

                    if (!targetSkin) {
                        response.error = 'Target skin not found';
                        break;
                    }

                    var copiedIndexes = [];

                    savedComponents.forEach(function(componentData) {
                        var idx = componentData.idx;
                        if (typeof idx !== 'number' || idx < 0 || idx >= 24 || !componentData.data) {
                            return;
                        }

                        targetSkin.RecordStatus = DesignCenter.recordStatus.Modified;
                        targetSkin.Components[idx] = JSON.parse(JSON.stringify(componentData.data));
                        targetSkin.Components[idx].WidgetSkinID = parseInt(targetSkinId, 10);
                        targetSkin.Components[idx].RecordStatus = DesignCenter.recordStatus.Modified;

                        // Fix skin ID references in CSS fields
                        if (sourceSkinId) {
                            var fromId = String(sourceSkinId);
                            var toId = String(targetSkinId);
                            var pattern = 'skin' + fromId;

                            Object.keys(targetSkin.Components[idx]).forEach(function(field) {
                                var value = targetSkin.Components[idx][field];
                                if (value && typeof value === 'string' && value.indexOf(pattern) !== -1) {
                                    var updated = value.replace(
                                        new RegExp('\\.widget\\.skin' + fromId + '(?![0-9])', 'g'),
                                        '.widget.skin' + toId
                                    );
                                    updated = updated.replace(
                                        new RegExp('([^a-zA-Z])skin' + fromId + '(?![0-9])', 'g'),
                                        '$1skin' + toId
                                    );
                                    if (updated !== value) {
                                        targetSkin.Components[idx][field] = updated;
                                    }
                                }
                            });
                        }

                        copiedIndexes.push(idx);
                    });

                    // Touch API if available
                    if (typeof window.CPToolkitTouchSkinAdvancedFor === 'function') {
                        try {
                            window.CPToolkitTouchSkinAdvancedFor(targetSkinId, copiedIndexes);
                        } catch (err) {
                            console.warn(TOOLKIT_NAME + ' Touch API error:', err);
                        }
                    }

                    response.success = true;
                    response.copiedCount = copiedIndexes.length;
                    response.targetSkinName = targetSkin.Name;
                    break;

                case 'saveTheme':
                    if (typeof window.saveTheme === 'function') {
                        window.saveTheme();
                        response.success = true;
                    } else {
                        response.success = false;
                        response.error = 'saveTheme not available';
                    }
                    break;

                case 'createSkinFromSaved':
                    // Create a brand new widget skin in the current theme. NOTE: this
                    // only creates + saves the (empty) skin and resolves its real,
                    // post-save identity — it does NOT apply any saved component
                    // styles. WidgetSkinAdd/Index only stages the skin client-side;
                    // it isn't actually committed to the database until saveTheme()
                    // runs and completes, and its WidgetSkinID can change once it is
                    // really saved. So the caller must saveTheme()+wait and re-locate
                    // the skin by NAME (not by the ID this call returns) before doing
                    // anything else with it — the caller should follow up with the
                    // existing 'applySkin' action against the resolved newSkinId to
                    // actually copy component styles onto it, reusing that already-
                    // proven path instead of duplicating it here. This mirrors the
                    // create -> save -> wait -> re-find-by-name -> apply sequence used
                    // by the on-demand "Copy Multiple Skins" tool, which exists
                    // precisely because skipping the save/re-find step causes
                    // "widget skin does not exist" errors on the very next write.
                    //
                    // This is asynchronous (AJAX + saveTheme), so it dispatches its
                    // own response event and returns early to skip the normal
                    // synchronous dispatch below.
                    var newSkinName = (request.name || '').trim();

                    if (!window.DesignCenter || !DesignCenter.themeJSON || !DesignCenter.widgetSkinManager) {
                        response.success = false;
                        response.error = 'DesignCenter not available';
                        break;
                    }
                    if (typeof $ === 'undefined' || !$.ajax) {
                        response.success = false;
                        response.error = 'jQuery not available on this page';
                        break;
                    }
                    if (!newSkinName) {
                        response.success = false;
                        response.error = 'A skin name is required';
                        break;
                    }
                    if (typeof window.saveTheme !== 'function') {
                        response.success = false;
                        response.error = 'saveTheme not available';
                        break;
                    }

                    (function() {
                        var themeID = DesignCenter.themeJSON.ThemeID;
                        var newSkinID = DesignCenter.widgetSkinManager.newSkinID;
                        var originalProcessNewSkin = DesignCenter.widgetSkinManager.processNewSkin;

                        function respondAsync(detail) {
                            document.dispatchEvent(new CustomEvent('cp-toolkit-copied-skins-response', {
                                detail: Object.assign({ action: request.action, requestId: request.requestId }, detail)
                            }));
                        }

                        function waitForSaveComplete() {
                            return new Promise(function(resolve) {
                                if (typeof $ !== 'undefined' && $ && $.fn) {
                                    $(document).one('ajaxStop', function() {
                                        setTimeout(resolve, 1000);
                                    });
                                } else {
                                    setTimeout(resolve, 5000);
                                }
                            });
                        }

                        function findSkinByName(name) {
                            var lowerName = name.toLowerCase();
                            var skins = DesignCenter.themeJSON.WidgetSkins || [];
                            for (var i = 0; i < skins.length; i++) {
                                if (skins[i].Name && skins[i].Name.toLowerCase() === lowerName && skins[i].Components) {
                                    return skins[i];
                                }
                            }
                            return null;
                        }

                        // Intercept processNewSkin to register the skin without
                        // opening the CMS "Manage Widget Skins" modal or triggering a
                        // full UI refresh (same approach as the proven on-demand tools).
                        DesignCenter.widgetSkinManager.processNewSkin = function(resp) {
                            DesignCenter.themeJSON.WidgetSkins.push(resp);
                            DesignCenter.widgetSkinManager.newSkinID--;
                        };

                        $.ajax({
                            url: '/DesignCenter/WidgetSkinAdd/Index',
                            type: 'POST',
                            data: JSON.stringify({ themeID: themeID, widgetSkinID: newSkinID, name: newSkinName }),
                            contentType: 'application/json',
                            cache: false,
                            success: function(createResponse) {
                                try {
                                    DesignCenter.widgetSkinManager.processNewSkin(createResponse);
                                } catch (err) {
                                    DesignCenter.widgetSkinManager.processNewSkin = originalProcessNewSkin;
                                    respondAsync({ success: false, error: 'Failed to register new skin: ' + (err.message || String(err)) });
                                    return;
                                }
                                DesignCenter.widgetSkinManager.processNewSkin = originalProcessNewSkin;

                                window.saveTheme();
                                waitForSaveComplete().then(function() {
                                    var savedSkin = findSkinByName(newSkinName);
                                    if (!savedSkin) {
                                        respondAsync({ success: false, error: 'Skin was created but could not be found after saving' });
                                        return;
                                    }
                                    respondAsync({
                                        success: true,
                                        newSkinId: savedSkin.WidgetSkinID,
                                        newSkinName: savedSkin.Name
                                    });
                                });
                            },
                            error: function(xhr) {
                                DesignCenter.widgetSkinManager.processNewSkin = originalProcessNewSkin;
                                respondAsync({ success: false, error: xhr.statusText || 'Request failed' });
                            }
                        });
                    })();

                    return;
            }
        } catch (err) {
            response.error = err.message || String(err);
            console.error(TOOLKIT_NAME + ' Error handling ' + request.action + ':', err);
        }

        document.dispatchEvent(new CustomEvent('cp-toolkit-copied-skins-response', {
            detail: response
        }));
    });

    // Signal that the helper is ready
    document.dispatchEvent(new CustomEvent('cp-toolkit-copied-skins-response', {
        detail: { action: 'ready' }
    }));
})();
