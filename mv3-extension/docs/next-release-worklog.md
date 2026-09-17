# CP Toolkit — Next Release Worklog

Status: in progress. Release owner is still fixing things before this goes out; version number not yet assigned (current shipped `manifest.json` version is `1.1.6`). Rename this file to `docs/release-X.X.X-worklog.md` once a version is picked, matching the convention in `docs/release-1.1.6-worklog.md`.

This is the running rundown of everything on `pr/widget-skin-custom-css-indicator` that hasn't shipped yet (i.e. everything ahead of `main`). Append new dated entries below as more work lands — do not rewrite prior entries.

## Fix/Feature Ledger

### 2026-09-16 — Full pre-release rundown

**Fancy Buttons (Graphic Links)**
- Fancy Button ID badge next to the Fancy Button Builder modal title, showing the button's real numeric ID.
- Advanced Styles selector copy buttons on every panel (Background, Text Styles), copying a ready-to-paste selector including both the placeholder and real button ID.
- Fixed a destructive bug where reopening Advanced Styles silently collapsed `.fancyButtonN` selectors back to the placeholder `.fancyButton1` on every load, destroying the portable dual-selector text.
- Post-import ID fix-up: importing a Template Library button as a new Graphic Link now reliably learns its real CMS-assigned ID (real page reload + reading the listing's last row, replacing an earlier background-fetch approach confirmed live to never find the new row) and rewrites its `.fancyButtonN` selectors to match. Also fixed a malformed-selector-duplication bug and a field-collision bug that was corrupting the Template Library preview's icon positioning.

**Widget Skins / Theme Manager**
- Widget Skin Custom CSS Indicator: red marker on components with custom CSS in a widget skin's Advanced tab dropdown.
- Theme Manager Font Filter: type-to-filter search box in the Manage Fonts modal, matching Layout Manager's filter; shrinks/relabels the native sort controls so they fit alongside it.
- New "Powered By" base skin so the "Government Websites by CivicPlus" byline's icon sizing/color can be controlled through Theme Manager instead of hardcoded widget CSS; fixed a pre-existing wrong-container bug in its default assignment.
- Feature skin: Widget Header and Item Title now pick up the same shared theme text styles (Subhead 1/2) the Default skin already uses.

**Saved Skins Library**
- 7 Calendar widget skins shipped as built-in defaults (Grid Default/Boxes/Colored/Rounded Weekdays, Strip Item Default/Horizontal/Date Overlap), with a CSS layout bug fixed on Strip Item Horizontal (cards no longer sliced across the 2-column layout).
- New "New Skin" action next to "Apply Skin" — creates a brand-new widget skin from saved data instead of requiring an overwrite of an existing one.
- Default skins can't be accidentally deleted or silently promoted into personal saved-skins storage.
- New default categories: Mega Menu, Calendar, News Flash, Quick Links, Social, Footer, Utilities.

**Reliability**
- Guarded the CSS editor tool's pseudo-mode read/write against "Extension context invalidated" errors from reloading the extension while a Theme Manager tab is still open.

**Chrome Web Store / Manifest V3 review**
- Full pass over the branch diff vs. `main`: no remote code execution, no permission/host_permission changes (only two filenames added to the existing `web_accessible_resources` list), background service worker declaration unchanged, no PII in the new bundled `data/saved-skins.json`. No concerns found.

### 2026-09-16 — Powered By byline icon: restored fallback sizing

- Confirmed the `<style>` block hardcoding `.cpBylineIconTS` sizing (`fill: currentColor; width: 39px; height: 26px; display: inline; vertical-align: middle;`) had been intentionally removed from `insertPoweredByHTML.js` when the "Powered By" skin feature moved those same values into `setupPoweredBySkin()` (`setupDefaultsV2.js`), scoped to `.widget.skin{ID} .cpBylineIconTS`.
- Re-added the identical `<style>` block back into the injected widget HTML as a fallback for sites/widgets that insert this byline without ever running the skin setup tool. Safe to combine with the skin-scoped rule: the skin's id-scoped selector is more specific and wins whenever it's present, so this only matters when it isn't.
