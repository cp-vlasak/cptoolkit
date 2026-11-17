# Facebook Feed Generator: Plan and Guardrails

Branch: `feature/facebook-feed-generator` (from `main` at `dd6f4a0`, no upstream on purpose)
Planned release: `1.3.0` (new feature, so a minor bump). Previous shipped: `1.2.2`.
Status: planning. Nothing is built yet.

## Goal

A right-click tool that builds the whole Facebook feed embed for a Custom HTML widget and copies it to the clipboard, so nobody has to hand-edit an iframe and a resize script any more.

Flow: right-click, choose the tool, a modal opens, paste the Facebook Page link, set width and height, tick or untick options, press the button. The finished code is copied to the clipboard and also shown in the modal in case the copy is blocked. The user pastes it into a Custom HTML widget.

The generated code is the iframe plus the existing resize script, taken from `CPGV2026/code/js/facebook_resize_enhanced.html`. That file is the source of truth for the resize logic and is not modified.

## What the generated code contains

1. A `<style>` that centres `[class^="facebook-container"]` (as in the source file).
2. `<div class="facebook-container">` wrapping one `<iframe>`.
3. The resize script, with the clamp values (min/max width and height, aspect ratio) filled in from the modal.

The resize script finds `.facebook-container`, so that class name must stay exactly as is.

## Modal fields

- Facebook Page link (required).
- Width and height (numbers).
- Show posts: on by default.
- Timeline checkbox (off by default).
- Primary button: "Copy code". Secondary: Cancel. Esc and click-outside close it.
- A read-only box with the generated code, shown after the copy, as a fallback.

## Guardrails

### Process
- Work only on `feature/facebook-feed-generator`. Never commit to or push `main`.
- No push until the user says go. When pushing, always `git push origin feature/facebook-feed-generator`, never a bare push. The branch has no upstream, so a bare push fails instead of reaching `main`.
- One commit per step; commit messages from a file (`git commit -F`).
- The release prep (version 1.3.0, changelog entry with class `v1.3.0`, worklog, packet, zip) is the last commit, not mixed into feature commits. The extension opens the changelog on update and highlights entries by version class, so the entry is required.
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
- No new manifest permissions or host permissions. The tool runs through the existing context-menu injection into the page, like the other on-demand tools.
- No network calls from the tool. No remote scripts. The generated code references only `facebook.com`.
- Manifest diff against `main` must be the version line only.

### Code safety
- The code builder is a pure function (inputs in, string out), separate from the modal, so it can be tested without a browser page.
- The link is parsed with `new URL`. Only `https` and the hosts `facebook.com` (with `www.`, `m.`, `web.` prefixes) are accepted. Anything else shows an inline error in the modal, not an alert.
- Values go into the iframe `src` through `URL`/`searchParams` (so the link is encoded), never by string concatenation. Attribute values are HTML-escaped as well.
- Width and height are whole numbers, clamped to a documented range; the resize script minimums can never exceed the chosen maximums.
- The iframe gets a `title` attribute (accessibility) and `loading="lazy"`.
- Running the tool twice never stacks two modals.
- Clipboard: `navigator.clipboard.writeText` from the button click, with a textarea fallback, and the code box stays visible either way.
- Modal styling matches the Setup Mega Menu dialog: spacing by flex `gap` (the CMS page styles reset margins), `font-family: inherit` on inputs and buttons, highest z-index, Esc and click-outside to close.

### Testing before saying it works
- Node is not installed. Tests run in headless Chrome: builder unit checks (valid links, bad links, quotes in input, clamping, option toggles), a syntax check of the tool file, and a modal screenshot.
- The generated output is also loaded in a headless page to confirm the resize script finds the container and sets the iframe size.
- The repo guardrail script runs as before (its Node-based manifest check is verified by diff instead).
- The real check is the user pasting the output into a Custom HTML widget on a live site. Nothing is called fixed until that has been seen.

### Documentation
- Release notes and the changelog are written for toolkit users: what the tool does, no process talk.
- This note is kept current in the same branch as decisions change.

## Open questions

1. **Show posts / timeline parameters.** Facebook's Page plugin documents `tabs=timeline` for the posts feed. The `show_posts=true` and "timeline" parameters mentioned in the request may be older ones. Need one iframe `src` from a feed that works today, to match exactly.
2. **Where the menu item appears.** Options: everywhere (like Setup Mega Menu), only on Layout Pages (`*://*/*Layout-Page`), or everywhere with a friendly message unless `body.liveEditOn` is present. Default if not answered: everywhere, with the Live Edit message.
3. **What width and height mean.** Default if not answered: they become the iframe's starting size and the resize script's maximum width and height; minimums stay at 220 and 450 (lowered if the maximum is smaller).
4. **Allowed size range.** Default: width 220 to 500, height 450 to 580 (the ranges in the existing script).

## Next actions

1. Answers to the open questions.
2. Build the builder function and its tests.
3. Build the modal and register the tool.
4. Headless verification, then the user's live test.
5. Release prep as the final commit.
