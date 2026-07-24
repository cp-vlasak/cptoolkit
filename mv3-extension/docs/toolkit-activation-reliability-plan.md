# Toolkit Activation Reliability Plan

Last updated: 2026-07-21

Status: code-level failure modes confirmed; implementation and isolated `32.civic.place` reliability verification are pending.

## Objective

Make detector-triggered toolkit activation recover automatically from slow DOM readiness, a cold MV3 service worker, navigation races, and transient script-injection failures. A supported CivicPlus admin page must not require a user refresh to load the toolkit.

This plan supplements `docs/chrome-web-store-readiness-plan.md`. It does not change the least-privilege host-permission or fixed local-script-selection architecture.

## Reported Incident

On 2026-07-20, the published toolkit intermittently failed to appear at:

- `https://32.civic.place/Admin/DesignCenter`

Observed sequence:

1. First navigation: toolkit absent.
2. First refresh: toolkit still absent.
3. Second refresh: toolkit appeared.

The page appeared to finish loading in less than seven seconds. This makes the detector's seven-second observation window an insufficient explanation by itself. Visual page readiness does not prove that the exact DOM markers were available before the detector stopped, but activation messaging and programmatic injection must be investigated at equal or higher priority.

Follow-up report on 2026-07-21:

- Estimated failure frequency increased to approximately 40%.
- Once a document fails, the toolkit commonly does not appear until roughly the third refresh.
- Browser testing is restricted to `https://32.civic.place/Admin/` and related paths on that test site. Do not inspect, reload, or exercise activation against live client sites during this diagnosis.

## Current Activation Path

1. `manifest.json` injects `cp-dom-detector.js` and `toolkit-activation-bootstrap.js` at `document_start` on approved CivicPlus hosts.
2. The detector evaluates URL and DOM evidence, then observes mutations for up to seven seconds.
3. The bootstrap sends a lane-only `cp-toolkit-activation-detected` message to the MV3 service worker.
4. The service worker validates the sender and maps the lane to fixed extension files.
5. The service worker writes a per-frame injection marker, then calls `chrome.scripting.executeScript()` for the selected files.

The architecture is security-appropriate, but three handoffs are currently single-shot: detection completion, content-to-worker messaging, and injection claiming.

## Confirmed Code-Level Defects

### 1. Detector timeout can return a stale initial result

`cp-dom-detector.js` performs an immediate `document_start` evaluation and stores it in `lastResult`. Later DOM mutations schedule another evaluation through `requestAnimationFrame()`. At timeout, the code resolves `lastResult || evaluatePage(...)`.

Because `lastResult` always contains the initial evaluation, the timeout never performs a fresh final evaluation. If the admin shell has arrived but the scheduled animation-frame callback is delayed, throttled, or loses the race with the timeout callback, the detector returns the old no-admin result and disconnects permanently.

A deterministic Node simulation confirmed the defect:

- Initial state: `/Admin/` path and known host, but no shell yet -> only `all-pages-cp-host-css`, admin score 3.
- The `.cp-Toolbar` shell marker is then added and the MutationObserver fires.
- When the queued animation-frame callback is withheld until after timeout, the result incorrectly remains CSS-only with admin score 3.
- When that same queued callback is allowed to run, the result correctly includes `admin` with admin score 6.

This is a direct explanation for a visually complete admin page receiving no full-toolkit activation.

### 2. Activation messaging permanently records an unacknowledged attempt

`toolkit-activation-bootstrap.js` sets `sentKeys[key] = true` before calling `chrome.runtime.sendMessage()`. It discards both synchronous errors and Promise rejection. It also does not inspect a resolved service-worker response for `error`, `target-unavailable`, `missing-host-permission`, or incomplete injection.

The detector normally calls `sendLaneActivations()` twice: once for the immediate result and once for the completed detection result. However, the first failed attempt permanently blocks the second because the key is already marked sent.

A deterministic Node simulation confirmed that an eligible admin result followed by a rejected first message produces exactly one `full-toolkit` send attempt. The later detector completion does not retry.

This is a direct explanation for a cold-worker or transient message failure stranding the current document until refresh.

### 3. Injection is marked complete before files are injected

`toolkit-activation.js` runs one `executeScript()` call that sets `__cpToolkitInjectedKeys[injectionKey] = true`, then runs a second `executeScript()` call for the actual files. If the file injection rejects or becomes unavailable, the document retains a truthy marker. Any retry added only at the messaging layer would therefore be classified as a duplicate and skipped.

The marker currently represents “claim acquired,” not “bundle completed.” This must be changed before retries can work safely.

### 4. The full loader is unnecessarily heavy on every admin page

The repository contains 30 on-load tool files totaling approximately 1,024,837 bytes, three shared library files totaling 35,734 bytes, and an 86,973-byte jQuery bundle—approximately 1.15 MB of uncompressed JavaScript in the broad on-load inventory. The admin lane injects nearly the entire applicable bundle on every admin page even when most tools cannot operate on that route.

The largest files include `mini-ide.js` (~276 KB), `css-snippets.js` (~221 KB), `cp-ImportFancyButton.js` (~164 KB), and `cp-InfoAdvancedImportExport.js` (~82 KB). Thirty on-load files also register through the `detect_if_cp_site()` compatibility path.

This is genuine loader inefficiency and increases parsing, initialization work, and exposure to tool-specific timing failures. It does not by itself explain a total absence of the toolkit; the stale detector result and one-shot message handling are the decisive no-load defects.

## Ranked Failure Causes

### 1. Stale detector result or failed activation message strands the document

These are confirmed terminal-state bugs. Either is sufficient to produce a fully rendered eligible page with no full toolkit and no recovery until navigation/refresh.

### 2. Injection is claimed before the bundle succeeds

`toolkit-activation.js` writes `__cpToolkitInjectedKeys[injectionKey] = true` in one scripting call and injects the files in a second call. Navigation or frame replacement between those calls can leave an incorrect claim or produce a target-unavailable result without retrying activation for the surviving document.

### 3. Monolithic full-bundle injection amplifies timing and initialization risk

Loading nearly every admin tool on every admin route adds avoidable work and makes success depend on a large number of unrelated initializers. Route-specific loading should follow reliability recovery, while preserving required shared dependencies.

### 4. Required DOM evidence genuinely arrives after the supported window

This remains possible, but the timeout's stale-result bug must be fixed before changing the observation duration. The current timeout can fail even when evidence arrives within seven seconds.

These are hypotheses, not confirmed root causes. Timing changes should not ship without evidence showing which stage failed.

## Phase 1: Add Activation Diagnostics

Add a small, bounded diagnostic record for each top-frame document. Correlate records using tab, frame, URL, and a document/navigation identifier when the supported Chrome APIs provide one.

Record timestamps and outcomes for:

- bootstrap loaded;
- initial detector evaluation and lane scores;
- each detector update and final result;
- activation message attempt number;
- service-worker acknowledgement, rejection, or timeout;
- sender validation result;
- injection claim state (`unclaimed`, `pending`, or `complete`);
- `executeScript()` start, completion, or normalized error;
- final activation state visible to the popup or extension service-worker console.

Diagnostics must:

- avoid recording page content, form values, or authentication data;
- retain only a small recent ring buffer, preferably in `chrome.storage.session` or equivalent ephemeral state;
- be easy to copy from a failed tab before refreshing;
- have negligible work on unrelated public pages;
- remain useful after the MV3 worker suspends and wakes.

Add a popup status such as `Toolkit active`, `Detection pending`, `Detection timed out`, `Activation retrying`, or `Injection failed`. This gives the reporter useful evidence without requiring the correct DevTools execution context.

## Phase 2: Make Activation Recoverable

### Acknowledged activation messaging

- Do not permanently set `sentKeys[key]` until the service worker returns a successful or definitive duplicate acknowledgement.
- Retry retryable message failures with short bounded backoff, for example approximately 100 ms, 300 ms, and 1 second.
- Preserve one logical activation per document and lane; retries must reuse the same activation identifier.
- Stop retries on navigation teardown, invalid sender/host, missing permission, or a confirmed unsupported lane.
- Surface the exhausted result in diagnostics instead of swallowing it.

### Transactional injection claim

- Replace the boolean marker with `pending` and `complete` states tied to an activation identifier.
- Claim `pending` before injection to prevent simultaneous duplicates.
- Change to `complete` only after the full ordered bundle call resolves successfully.
- Clear or expire `pending` after a retryable failure so the same document can recover.
- Treat a recent `pending` result as `in progress`, not as successful injection; let the bootstrap poll or retry for a final acknowledgement.
- Verify that service-worker suspension cannot leave a permanent pending state.

### Detector resilience

- Keep the fast initial evaluation at `document_start`.
- Evaluate a credential-free, non-mutating `/api` or Swagger metadata probe as an additional positive signal on origins where Chrome access already exists. Validate CivicPlus-specific content/specification fields; never treat status `200` alone as proof.
- Keep the API signal additive. A missing, blocked, slow, or legacy API route must fall back to DOM/path detection, and API success alone must not grant an unknown origin permission or activate admin-only tooling without the appropriate page context.
- Treat product identity and power-user authentication as separate gates. Groveport testing confirmed that its API catalog is public, while anonymous `/Admin/Dashboard` navigation redirects to CivicPlus Authentication and a signed-in session remains on the vanity origin with `body.cp-AdminWrap`, `.cp-Toolbar`, and `.cp-ModuleList` evidence.
- Do not probe protected Dashboard activity/message endpoints or read hidden user/token values for activation. Use the already-rendered admin shell or strong Live Edit controls as the authenticated-context signal.
- Represent a signed-in public-page shell separately from the `live-edit` lane. Groveport retains the Dashboard/Modules toolbar and `cp-*` admin-shell markers when Live Edit is `OFF`; this can authorize an exact-origin trust prompt without loading the full toolkit on that public page.
- Extend observation on approved admin/DesignCenter pages to a measured duration, initially 30 seconds, or until navigation teardown.
- Preserve the requirement for independent DOM/platform evidence; do not activate the full toolkit from `/Admin` path text alone.
- Continue coalescing mutation checks so the longer window does not repeatedly scan on every mutation.
- Consider a low-frequency fallback evaluation while the page remains eligible in case the relevant readiness transition is not represented by the current mutation filter.
- Record when detection occurs after seven seconds so the final timeout can be chosen from data rather than visual load time.

### Operational readiness signal

- Add a lightweight final bootstrap/loader signal after the ordered on-load bundle finishes.
- Separate `bundle injected` from `toolkit operational` in diagnostics.
- Identify the smallest stable readiness check for DesignCenter without depending on one optional tool being enabled.
- Ensure initialization failures are logged with the responsible local file or phase when Chrome exposes that information.

## Phase 3: Verification

### Automated coverage

Add zero-dependency or minimal Node-based tests with mocked Chrome APIs for:

- message rejection followed by successful retry;
- acknowledgement timeout followed by a duplicate-safe retry;
- service worker returning `target-unavailable`;
- injection failure clearing a pending claim;
- two overlapping activation messages injecting the bundle only once;
- a stale pending claim becoming retryable;
- detector evidence arriving after seven seconds but before the extended deadline;
- navigation teardown cancelling retries;
- non-CP and insufficient-evidence pages never activating the full toolkit.

Run `node --check` on every changed JavaScript file and retain the existing security/manifest guardrails.

### Manual reliability matrix

Use the unpacked candidate build and record every attempt, including failures:

| Scenario | Minimum run | Required result |
| --- | ---: | --- |
| `https://32.civic.place/Admin/DesignCenter`, normal navigation | 30 consecutive navigations | 30/30 operational without manual refresh |
| Same URL after allowing the worker to become idle | 10 cold-worker navigations | 10/10 operational |
| Same URL with delayed network/CPU | 10 navigations | Activates when markers arrive within the supported window |
| Rapid reload during activation | 10 sequences | Final document activates once; no duplicate UI/listeners |
| Admin-to-DesignCenter internal navigation | 10 sequences | Correct lane remains operational |
| Known CP public non-editor page | 10 navigations | No full toolkit activation |
| Known CP Live Edit page | 10 navigations | Activates once without refresh |
| Trusted vanity Admin/DesignCenter page | 10 navigations | Activates once without broad permission changes |
| Identity and image-picker lanes | Existing smoke tests | No timing regression |

For the reported `32.civic.place` case, capture the diagnostic timeline for at least the first five successful runs and every failed run.

## Acceptance Criteria

The reliability fix is ready for the next update only when:

1. The reported DesignCenter URL passes 30 consecutive normal navigations with no refresh required.
2. Cold-worker, delayed-readiness, and rapid-navigation cases recover automatically.
3. One document receives at most one completed full-toolkit bundle.
4. Failed or timed-out activation produces a visible diagnostic outcome.
5. Public non-editor pages do not gain full-toolkit activation.
6. Required and optional host permissions remain unchanged unless separately reviewed and documented.
7. Existing ADFS, Live Edit, custom CSS, trusted vanity, and image-picker activation behavior passes regression QA.

## Release Strategy

- Target the next patch after published version `1.1.5`. The selected candidate is `1.1.6`, following the requested `X.X.X` small-fix versioning scheme.
- Implement diagnostics and recovery together; diagnostics alone do not resolve the user-facing failure.
- Test as an unpacked build before producing the Web Store archive.
- Keep diagnostics enabled but bounded in the release build so field failures can be classified.
- Update this plan with the confirmed root cause, chosen timeout/retry values, test results, and release commit before packaging.

## Current Decisions

- Preserve detector-first, least-privilege activation.
- Do not solve the issue by restoring broad static injection.
- Do not assume that increasing seven seconds alone will fix the incident.
- Require acknowledgement-based retry and transactional injection state.
- Use the reported `32.civic.place` DesignCenter route as the primary reproduction and acceptance target.

## 1.1.6 Implementation Status (2026-07-22)

- Implemented fresh deadline evaluation, timer-based coalescing, and 500 ms bounded fallback detector checks.
- Implemented acknowledged activation delivery with bounded retries and a stable per-document activation ID.
- Implemented transactional `pending`/`complete` injection state with rollback after file-injection failure.
- Added regression tests for the confirmed failure modes and route-scoped inventory behavior; all currently pass.
- Scoped only tools that already had explicit internal page guards. On `/Admin/Dashboard`, this reduces the automatic bundle by 481,176 bytes (42.9%) while retaining the broadly supported Mini IDE/CSS Snippets bundle.
- Bumped the candidate manifest to `1.1.6` in the same directory used for local unpacked testing and eventual Store packaging.
- Manual validation remains restricted to `32.civic.place`; no client site is authorized for testing.

### Vanity permission follow-up (2026-07-24)

- Confirmed that API/Swagger evidence can corroborate CivicPlus product identity, but it cannot activate an origin before Chrome grants host permission and it does not prove an authenticated power-user session.
- Confirmed a separate lifecycle defect: post-grant activation depended on the popup continuing after `chrome.permissions.request()`, while the service worker listened only for permission removal.
- Added a service-worker `permissions.onAdded` path that persists and registers an exact granted vanity origin and immediately bootstraps already-open tabs on that origin.
- Added race handling for simultaneous popup/event registration and automated coverage that does not depend on the popup continuation.
- Classified Chrome's transient `Frame with ID 0 is showing error page` scripting rejection as `target-unavailable`, preventing a refresh-time browser error document from being reported as a permanent activation failure.
- Extended the same-document pending injection lease to 15 seconds and added a regression proving a slow in-progress injection cannot be reclaimed and duplicated.
- Bound the vanity `permissions.onAdded` handoff to a two-minute pending record containing the exact origin, initiating tab, and detected lanes. Unrelated grants are ignored, and only the initiating tab is bootstrapped immediately.
- Manual verification requires an approved non-client vanity test origin. A built-in `.civic.place` host cannot exercise the optional-permission event.

## Open Questions

- On a failed attempt, did the detector produce the `admin` lane?
- Did the service worker receive and acknowledge `full-toolkit` activation?
- Did `executeScript()` reject, report a removed frame/document, or resolve successfully?
- Can Chrome's document identifier be used consistently across messaging and scripting targets for this extension's supported Chrome versions?
- What stable, tool-independent condition should define `toolkit operational`?
- Do DesignCenter navigations replace the top-frame document, use history-state navigation, or perform late shell replacement in the observed failure?

## Next Actions

1. Fix the detector timeout to always perform a fresh final evaluation and cancel/ignore any queued animation-frame callback after settlement.
2. Replace `sentKeys` with acknowledged per-lane state and bounded retries; never swallow the activation outcome.
3. Replace the boolean injection marker with transactional `pending`/`complete` state that clears on retryable failure.
4. Add the two deterministic simulations above as automated regression tests, plus message acknowledgement and injection-rollback cases.
5. Add bounded diagnostics and a popup activation status so field failures identify the first missing stage.
6. After recovery is correct, split the admin bundle by route/context to reduce unconditional parsing and initialization.
7. Run the full reliability matrix only on `32.civic.place`, beginning with 30 consecutive `/Admin/` and `/Admin/DesignCenter` refreshes.
