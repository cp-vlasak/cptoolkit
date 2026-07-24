# CP Toolkit 1.1.6 Release Worklog

Last updated: 2026-07-24

Status: release candidate packaged and ready for local unpacked acceptance testing; do not upload until the manual release gate passes.

## Release Source of Truth

The release source and local unpacked extension are the same directory:

`~/OneDrive - CivicPlus/CPGV2026/Internal Projects/CP Toolkit/George/Extension with MCP/cp-toolkit-source-of-truth/mv3-extension`

All local testing must load this directory through Chrome's **Load unpacked** workflow. The eventual Store ZIP must be created from this exact tree after validation. Do not maintain a second edited extension copy, and do not copy changes manually into an older unpacked folder.

Current manifest version: `1.1.6`.

Versioning decision: small fixes increment the third numeric component (`X.X.X`). Because the published version is `1.1.5`, this fix release is `1.1.6`. The next larger feature release may increment the first or second component as appropriate.

## Fix Ledger

### 2026-07-22 -- Activation reliability foundation

- **Fixed stale detector completion:** the detector now evaluates the current DOM at its deadline rather than returning the initial `document_start` snapshot.
- **Removed rendering-frame dependency:** mutation checks now use coalesced lifecycle timers rather than `requestAnimationFrame()`, which can be throttled or delayed independently of DOM readiness.
- **Added fallback detection checks:** eligible documents receive a bounded 500 ms fallback evaluation while the detector is active, covering readiness changes missed by the mutation filter.
- **Added acknowledged activation delivery:** content-to-worker activation messages now retry with bounded backoff until they receive a complete, duplicate, or definitive terminal response.
- **Stopped swallowing activation failures:** delivery state and the last reason are exposed in `__cpToolkitActivationDeliveryState`, and exhausted delivery emits a console warning.
- **Added transactional injection state:** injection is now claimed as `pending` and marked `complete` only after the ordered file call succeeds.
- **Added recovery after injection failure:** retryable file-injection failures clear the matching pending claim so the same document can recover.
- **Added zero-dependency regression tests:** coverage now exercises fresh deadline evaluation, rejected-message retry, stable activation IDs, pending-claim rollback, and successful same-document recovery.
- **Reduced unrelated-page injection:** tools with existing explicit page guards are now filtered by the same paths in the worker inventory before Chrome downloads and parses them.
- **Kept uncertain tools broad:** the CSS Snippets and Mini IDE bundle remains available across signed-in admin pages until its complete supported-page surface is proven; this avoids trading the load bug for missing editor features.
- **Reduced the Dashboard payload:** the measured automatic bundle for `/Admin/Dashboard` changed from 32 files / 1,121,240 bytes to 13 files / 640,064 bytes, saving 481,176 bytes (42.9%).
- **Preserved route dependencies:** tests verify that Graphic Links still receives both the Fancy Button library and importer, while Info Center receives its import/export and multi-item tools.

### 2026-07-24 -- Immediate activation after trusting a vanity domain

- **Removed the second-icon-click dependency:** the service worker now listens for Chrome's `permissions.onAdded` event instead of relying only on the extension popup to survive the permission dialog.
- **Bootstrapped the already-open tab:** after an exact HTTPS vanity origin is granted, the worker persists the origin, registers the detector/bootstrap for future navigations, finds currently open tabs on that exact origin, and injects the bootstrap immediately.
- **Kept exact-origin permission scope:** the new handler processes only exact `https://hostname/*` origin grants; it does not broaden host access.
- **Made registration race-safe:** if the popup and permission event both attempt dynamic content-script registration, the worker converges by updating the existing registration.
- **Added popup-independent regression coverage:** the automated test grants a simulated vanity origin without invoking the popup continuation and verifies persistence, registration, and immediate bootstrap injection into the open tab.
- **Handled Chrome refresh error documents:** `Frame with ID 0 is showing error page` is now classified as a temporary unavailable target rather than a hard toolkit failure. Persistent registration or the normal detector retry can activate the next valid document.
- **Added refresh-race regression coverage:** a simulated Chrome error page must return `target-unavailable` without producing an activation error response.

### 2026-07-24 -- Post-change regression and security review

Overall result: no new high-severity security issue, no manifest permission expansion, no remote-code path, and no cross-origin request capability introduced by the 1.1.6 changes. All six repository security guardrails pass.

#### Resolved reliability finding

- **Extended the pending injection lease:** `PENDING_INJECTION_TIMEOUT_MS` is now 15 seconds, longer than the bounded activation retry window.
- **Added deterministic overlap coverage:** a simulated two-second file injection plus a second activation after two seconds now returns `pending` and performs exactly one file-bundle injection.
- **Result:** a slow first injection retains ownership instead of allowing duplicate UI, observers, listeners, timers, or on-load initialization.

#### Resolved trust-flow hardening

- **Bound grants to user intent:** before `permissions.request()`, the popup asks the service worker to store a two-minute pending record containing the exact origin, initiating tab ID, detected lanes, and timestamp.
- **Scoped the permission event:** `permissions.onAdded` consumes only a matching, unexpired record and immediately bootstraps only the initiating tab. An unrelated exact HTTPS origin grant is ignored by the toolkit trust workflow.
- **Kept popup-close recovery:** the record uses `chrome.storage.session` when available, with a TTL-limited local fallback, so it survives service-worker suspension without becoming permanent trust state.
- **Preserved future activation:** after a matched grant, the exact origin is persisted and the detector/bootstrap is registered for future navigations.

#### Checks with no finding

- Manifest permissions and host patterns are unchanged; only the version changed.
- Route-scoped entries match the explicit page guards already present in their corresponding tools, and order-critical Fancy Button dependencies remain paired.
- Detector fallback work is bounded to the detection window and cleans up its timers/observer on settlement.
- Error-page classification changes only a known Chrome refresh/navigation rejection from hard failure to recoverable `target-unavailable`.
- No API probe, credential handling, remote script loading, `eval()`, or `Function()` constructor was added.

## Validation Record

- Automated Node tests: passed `node tests/activation-reliability.test.js` on 2026-07-24, including overlapping activation and pending-trust binding.
- JavaScript syntax checks: passed for every changed JavaScript file on 2026-07-24.
- Manifest JSON validation: passed on 2026-07-24.
- `git diff --check`: passed on 2026-07-24 (line-ending warnings only).
- Security guardrails: all six passed on 2026-07-24.
- Local unpacked Chrome testing on `32.civic.place`: pending.
- Chrome Web Store candidate package: created and byte-compared against the source tree on 2026-07-24.
- Candidate artifact: `dist/civicplus-internal-toolkit-1.1.6.zip`
- Candidate contents: 184 runtime files, 2,121,095 bytes, with `manifest.json` at the ZIP root and packaged manifest version `1.1.6`.
- Candidate SHA-256: `4064E36F8235B42CA7AE4C4A14C1934C2ED93749F5FFAB2C28364A3BA824C399`

## Remaining 1.1.6 Work

1. Reload this exact directory as the unpacked extension and run the `32.civic.place` reliability matrix.
2. On an approved non-client vanity test origin, revoke its existing optional host permission, grant it once through the toolkit prompt, and verify the current page activates without reopening the extension or refreshing.
3. Capture `__cpToolkitActivationDeliveryState` and the extension console if any attempt fails.
4. Add a tool-independent operational-ready signal if local testing reveals a gap between successful injection and visible initialization.
5. If acceptance testing changes any runtime file, rebuild the candidate ZIP and repeat the byte-for-byte comparison before upload.

## Release Gate

Do not upload 1.1.6 until:

- the local unpacked folder above passes the automated checks;
- `32.civic.place` passes the documented navigation/refresh matrix;
- the fix ledger and user-facing changelog match the shipped files;
- the Store ZIP contents are compared against this directory; and
- the user explicitly approves publishing.
