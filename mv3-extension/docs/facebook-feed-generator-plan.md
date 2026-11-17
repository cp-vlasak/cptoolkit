# Facebook Feed Generator: Plan and Guardrails

Branch: `feature/facebook-feed-generator` (from `main` at `dd6f4a0`, no upstream on purpose)
Planned release: `1.3.0` (new feature, so a minor bump). Previous shipped: `1.2.2`.
Status: building. Reference output supplied by the release owner (a finished, working feed for Town of Duck).

## Goal

A right-click tool that builds the whole Facebook feed embed for a Custom HTML widget and copies it to the clipboard, so nobody has to hand-edit an iframe and a resize script any more.

Flow: right-click, choose the tool, a modal opens, paste the Facebook Page link, set width and height, tick or untick options, press the button. The finished code is copied to the clipboard and also shown in the modal in case the copy is blocked. The user pastes it into a Custom HTML widget.

## What the generated code looks like (matches the working reference)

In this order, separated by blank lines:

1. `<div class="facebook-container">` wrapping one single-line `<iframe>`.
2. A `<style>` that centres `[class^="facebook-container"]`.
3. The resize script. Source: `CPGV2026/code/js/facebook_resize_enhanced.html` (not modified). Constants in the output: `minWidth` 220, `maxWidth` = chosen width, `minHeight` 350, `maxHeight` = chosen height, `aspectRatio` 1.4. (The old file has minHeight 450; the working reference uses 350, so 350 is used.)

Iframe `src`: `https://www.facebook.com/plugins/page.php?href=<encoded page link>` then, in this order: `tabs=timeline` (only if ticked), `show_posts=true` (default), `width`, `height`, `small_header=false`, `adapt_container_width=true`, `hide_cover=false`, `show_facepile=true`, and a bare `appId` (no value), exactly as the reference.
Iframe attributes, in this order: `src`, `title`, `width`, `height`, `style="border:none;overflow:hidden"`, `scrolling="no"`, `frameborder="0"`, `allowfullscreen="true"`, `allow="autoplay; clipboard-write; encrypted-media; picture-in-picture; web-share"`.

The resize script finds `.facebook-container`, so that class name must stay exactly as is.

## Why show_posts

Facebook's `tabs=timeline` parameter is currently broken; the only known fix (found by a Reddit user, confirmed working in the reference) is `show_posts=true`. So `show_posts=true` is the default and the timeline tab is an optional checkbox, off by default. This is an outside workaround and could change again: the parameters live in one place in the tool so they are easy to adjust.

## Modal fields

- Facebook Page link (required). Also accepts a pasted existing plugin `src`, using its `href`.
- Width and height. Default 500 by 520. They become the iframe's starting size and the resize script's maximums.
- Feed title (optional), read by screen readers; blank gives "Facebook feed". The reference uses "Town of Duck Facebook feed".
- Show posts (`show_posts=true`): ticked by default.
- Add timeline tab (`tabs=timeline`): unticked by default.
- Primary button "Copy code"; Cancel/Close; Esc and click-outside close it.
- A read-only box with the generated code after the copy, as a fallback.
- A gentle note if Live Edit looks off (`body.liveEditOn` missing). It does not block the tool.

## Where the menu item shows

Same limit as "Copy containers to another layout" and "Insert Government Websites by CivicPlus": `urlPatterns: ["*://*/*Layout-Page"]`, help pages "Layout Pages".

## Guardrails

### Process
- Work only on `feature/facebook-feed-generator`. Never commit to or push `main`.
- No push until the user says go. When pushing, always `git push origin feature/facebook-feed-generator`, never a bare push (the branch has no upstream, so a bare push fails instead of reaching `main`).
- One commit per step; commit messages from a file (`git commit -F`).
- The release prep (version 1.3.0, changelog entry with class `v1.3.0`, worklog, packet, zip) is the last commit. The extension opens the changelog on update and highlights entries by version class, so the entry is required.
- Before any push, check the diff scope against the allowlist below.

### Blast radius (diff allowlist)
The feature is additive. Expected changes only:
- new `js/tools/on-demand/facebook-feed-generator.js`
- one new entry in `data/on-demand-tools.json`
- a new test file under `tests/`
- this note
- release-prep files (manifest version, changelog, worklog, packet, service-worker header)

Anything else in the diff (existing tools, helpers, skins data, manifest permissions) is a stop-and-explain.

### Chrome Web Store safety
- No new manifest permissions or host permissions. The tool runs through the existing context-menu injection, like the other on-demand tools.
- No network calls from the tool. No remote scripts. The generated code references only `facebook.com`.
- Manifest diff against `main` must be the version line only.

### Code safety
- The code builder is a pure function (inputs in, string out), separate from the modal, so it can be tested without a browser page.
- The link is parsed with `new URL`. Only `facebook.com` (with `www.`, `m.`, `web.` prefixes) is accepted, over `http`/`https` (always output as `https`). Anything else shows an inline message in the modal, not an alert.
- The link goes into the iframe `src` through `URLSearchParams` (so it is percent-encoded), never by string concatenation. The title is HTML-escaped.
- Width and height must be whole numbers inside the allowed range (width 220 to 500, height 350 to 1000); out-of-range values are rejected with a message, not silently changed.
- Running the tool twice never stacks two modals. Errors show a message instead of failing silently.
- Clipboard: `navigator.clipboard.writeText` from the button click, with a textarea fallback; the code box stays visible either way.
- Modal styling matches the Setup Mega Menu dialog: spacing by flex `gap` (the CMS page styles reset margins), `font-family: inherit` on inputs and buttons, highest z-index, Esc and click-outside to close.
- If the resize script source changes, the template in the tool must be updated to match (the test compares them).

### Testing before saying it works
- Node is not installed. Tests are written Node-style (like the other files in `tests/`) and run in headless Chrome through a small shim.
- Checks: valid and invalid links, injection attempts (quotes in the link or title), options on and off, size limits, the output's hosts (only facebook.com), the script block compiles, and the output matches the working reference line for line at the same settings.
- The generated output is also loaded in a headless page to confirm the resize script finds the container and sets the iframe size.
- The repo guardrail script runs as before (its Node-based manifest check is verified by diff instead).
- The real check is the user pasting the output into a Custom HTML widget on a live site. Nothing is called working until that has been seen.

### Documentation
- Release notes and the changelog are written for toolkit users: what the tool does, no process talk.
- This note is kept current in the same branch as decisions change.

## Possible later extra (not in scope)
"Insert Government Websites by CivicPlus" writes directly into an open Custom HTML widget and saves it. The generator could offer the same as an option; the clipboard is the requested behaviour.

## Next actions
1. Build the builder function and its tests.
2. Build the modal and register the tool.
3. Headless verification, then the user's live test in a Custom HTML widget.
4. Release prep as the final commit.
