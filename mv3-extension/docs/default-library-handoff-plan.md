# Default Library Handoff Plan

Last updated: 2026-07-20

Purpose: define a repeatable handoff for promoting curated CSS snippets, Graphic Links/Fancy Buttons, and Widget Option Sets into toolkit defaults without accidentally bundling unrelated personal data or site-specific identifiers.

## Decision

Use toolkit-generated JSON exports as the durable handoff. Use an open, signed-in browser tab to identify the intended live items and operate the existing Save/Export controls. Do not use screenshots, button descriptions, or browser inspection alone as the source of truth.

A completely new source site is not required when an existing item is already correct. A clean browser/extension profile or deliberately emptied candidate library is recommended so the export contains only items intended to become defaults.

## Current State

- Bundled CSS defaults: `data/snippets.json` currently contains an empty object.
- Personal CSS snippets: stored in `chrome.storage.local` under `cp-toolkit-user-snippets`.
- The CSS Snippets sidebar can export a versioned JSON payload containing `snippets` and saved `skins`.
- Bundled Graphic Link/Fancy Button defaults: `data/fancy-button-library.json`, currently populated.
- Personal Graphic Link/Fancy Button library: stored under `cp-customButtonLibrary`; the full library page can export `fancy-button-library.json`, and an individual live Graphic Link can be exported as JSON and saved into the personal library.
- Widget Option Sets have no bundled default data file today. The local library is stored under `cp-toolkit-option-set-library` and exports as `cp-toolkit-option-set-library.json`.
- Option Set records can contain source-site metadata, category IDs, image references, widget IDs, and serialized CMS field values. Portability must be reviewed before promotion to defaults.

## Recommended Capture Workflow

1. Create a clean “default candidates” collection. Prefer a clean Chrome profile/extension data set; alternatively export current personal libraries as a backup, then remove unrelated entries from the candidate libraries.
2. In the signed-in source site, point Codex to each intended live Graphic Link/Fancy Button or Option Set. Codex may drive the existing toolkit Save/Export controls in the open browser tab.
3. For CSS snippets, create or retain only the intended default snippets, then use the sidebar's Export action. Saved skins should be excluded unless they are explicitly intended as shipped defaults.
4. For Graphic Links/Fancy Buttons, export each intended live item and save it to the candidate personal library. When the set is complete, export the whole library once.
5. For Option Sets, select each intended option set in Widget Manager and use Save Current. When the candidate set is complete, use Import / Export > Export JSON.
6. Preserve the raw exports unchanged as review inputs. Convert normalized copies into the repository's bundled-default format.
7. Remove or rewrite source-only metadata and non-portable references. In particular, review source URLs/sites, CMS record IDs, category IDs, Document Center/image IDs, default option-set IDs, and tenant-specific content.
8. Validate schemas, duplicate keys/names, asset references, and payload sizes before packaging.
9. Test the candidate defaults in a clean extension profile and an approved test site. Confirm that a new user sees only shipped defaults, imports succeed, and no personal library data is present.

## Per-Library Deliverables

### CSS snippets

- Raw toolkit export.
- Curated `snippets` collection only, unless saved skins are explicitly requested.
- Final bundled `data/snippets.json` with stable keys, names, categories, selector behavior, and component mappings.

### Graphic Links/Fancy Buttons

- Raw individual exports when useful for review.
- One candidate personal-library export containing only intended defaults.
- Final merge into `data/fancy-button-library.json`.
- Every referenced image converted to a portable packaged asset or intentionally omitted; no live customer Document Center dependency should be treated as a default asset.

### Widget Option Sets

- One `cp-toolkit-option-set-library.json` containing only intended candidates.
- Portability review for every serialized field and referenced ID.
- A product decision and implementation change for bundled Option Set defaults, because the current iteration loads Option Sets only from browser-local storage.

## Acceptance Criteria

- A clean installation shows the approved defaults and no personal entries.
- Raw exports remain available for comparison with the normalized bundled files.
- Defaults do not depend on a particular customer's hostname, tenant, record ID, category ID, or image repository record unless explicitly documented and proven portable.
- Importing a default does not overwrite an existing exact-name item without an explicit user decision.
- Graphic assets load from packaged extension files or another approved stable source.
- Each default can be traced back to the named live source item or authored snippet used during capture.

## Next Actions

1. Back up the three current personal libraries before curating candidates.
2. Choose the source/test site and decide whether to use a clean Chrome profile or temporarily curate the existing libraries.
3. Capture CSS snippets, Graphic Links/Fancy Buttons, and Option Sets in separate export sessions.
4. Review the raw exports with Codex and promote approved entries into bundled defaults.
