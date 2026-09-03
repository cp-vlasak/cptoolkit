# Widget Skin Custom CSS Indicator — implementation notes

`js/tools/on-load/widget-skin-custom-css-indicator.js` marks components with a
`🔻` in the widget skin editor's component dropdown when that component has
custom CSS. It went through many more iterations than most tools in this
codebase before it was stable, because of several non-obvious behaviors of
the CMS's own Widget Skin editor. If a future regression touches widget
skins, the Advanced tab's rich CSS editor, or anything in this modal,
**check here first** — several of the bugs below look like they could come
back from a completely unrelated change.

## Why this was harder than it looked

1. **`DesignCenter.themeJSON` is a MAIN-world object.** This tool runs as an
   ISOLATED-world content script (for `chrome.storage` access), and isolated
   world scripts can never see MAIN-world globals directly — no amount of
   waiting or retrying fixes that. The fix is the same pattern already used
   by `widget-skin-advanced-style-helper.js`/`copied-skins-helper.js`: inject
   a small MAIN-world helper file
   (`js/tools/on-load/helpers/widget-skin-custom-css-reader.js`) that reads
   the data and relays it back via a `CustomEvent` on `document`, which does
   cross the isolated/main boundary. If a future tool needs page-JS data,
   copy this pattern rather than trying to read it directly.

2. **The component-picker `<select>` must be found by its stable id,
   `widgetSkinComponentTypeID`** — not by its first option's label text
   ("Wrapper" vs "Calendar Wrapper" vs "Tab List" all vary by widget type)
   and not by a structural heuristic. A structural heuristic (matching a
   select whose option values are a consecutive integer run starting at a
   known Components-array base index) was tried and produced a real false
   positive: some widget types also render an unrelated small enum dropdown
   (e.g. a scroll-direction picker with values `0`-`3`) that has *more*
   options than the real 3-option Tab List/Tab/Tab Panel select, so a
   "prefer the select with more options" tiebreaker silently picked the
   wrong one. Use `popover.querySelector("#widgetSkinComponentTypeID")`.

3. **Selecting a different option rebuilds the `<option>` elements**,
   discarding any attribute set on them. Don't store state (like an
   "original label") on the option elements — derive the clean label
   statelessly each time by stripping a leading marker, so a rebuild can
   never leave you out of sync. Also note `🔻` is a surrogate-pair emoji (2
   UTF-16 code units): `str.charAt(0) === BULLET` is always false; use
   `str.indexOf(BULLET) === 0` instead, and strip in a loop in case several
   copies ever accumulate.

4. **A broad, page-wide `MutationObserver` (even one scoped correctly to a
   single popover) can interfere with `mini-ide.js`'s own textarea-upgrade
   detection**, causing the Advanced tab's rich CSS editor to fall back to a
   plain, unstyled `<textarea>` (no line numbers, no border color, no "Valid
   CSS" indicator). This happened twice: once from a `setInterval` safety
   poll that wrote to the DOM every 1.5s forever even when nothing changed,
   and once from an observer that reacted to its own writes and looped
   infinitely. `mini-ide.js` solves this same class of problem by ignoring
   mutations whose target belongs to its own editor UI — this tool now does
   the equivalent: the observer ignores any mutation batch whose target is
   entirely *inside* the component select (that can only be this tool's own
   write to `opt.text`), while still reacting to mutations whose target is
   the select itself or outside it (genuine external changes). If the rich
   CSS editor ever stops rendering again, suspect this tool's observer
   first before anything else.

5. **The popover element is a persistent DOM node present from page load**,
   not something created fresh each time it's opened — it toggles
   visibility via its own inline `style` attribute. A `MutationObserver`
   that only watches `childList` won't fire on that toggle; watch
   `attributes` (`style`/`class`) too, or add a low-frequency
   `setInterval` safety poll (same pattern as
   `widget-skin-advanced-style-helper.js`) to catch it if a scan runs before
   the popover exists yet.

## Quick sanity check if something looks wrong

In the browser console, with a widget skin's editor open:

```js
document.getElementById("widgetSkinComponentTypeID")
```

should return the real 3-to-24-option component picker. If it returns
`null` or the wrong select, the CMS's own markup changed and this tool's
`getComponentSelect()` needs to be updated to match.
