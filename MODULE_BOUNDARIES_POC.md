# Module Boundaries PoC Plan

## Goal

Prove the `eslint-plugin-boundaries` approach works by getting a clean lint pass for **named modules only**, ignoring the `other` bucket.

## Approach

- Enforce boundary rules only between categorized modules
- Add an `other -> *` and `* -> other` allow rule so uncategorized code doesn't produce noise
- Fix the ~50 real violations between named modules
- Get CI green for the boundary rules

## Phase 1: Config cleanup

- [ ] Fix typo: `.eslint.config.bounaries.mjs` -> `.eslint.config.boundaries.mjs`
- [ ] Remove accidental deps from `package.json` (`i`, `npm`)
- [ ] Remove unused `require("underscore")` in `.boundaries.js`
- [ ] Move bundle analyzer change to a separate branch
- [ ] Add `other` allow-all rules in `.boundaries.js` so `other` is unconstrained
- [ ] Resolve the `shouldEnforce` toggle — use env var or remove the dead code

## Phase 2: Fix basic tier (~36 violations)

**`basic/lib` -> `basic/mlv2`** (15 violations, 9 files)
Mostly in `lib/formatting/` and `lib/urls/`. Options:
- Allow `basic/lib` <-> `basic/mlv2` as peers (they're both basic-tier)
- Or move the shared formatting logic into a common place

**`basic/lib` -> `shared/common`** (5 violations, 6 files)
Files in `lib/formatting/` and `lib/urls/` importing from `common`. Likely small — extract what's needed into `lib` or `basic`.

**`basic/ui` -> `shared/common`** (4 violations, 8 files)
UI components importing `common` hooks/components (BlurChange inputs, Menu, Popover). Move the shared bits down or allow this edge.

**`basic/ui` -> `basic/lib`** (3 violations)
Likely fine to allow — both basic tier.

**`basic/mlv2` -> `basic/lib`** (5 violations)
Same as above — allow peer imports within basic tier.

**`types` -> `shared/visualizations`** (4 violations)
Type files referencing visualization types. Move those type definitions into `metabase-types`.

**`types` -> `basic/mlv2`**, `types` -> `basic/lib`** (2 violations)
Same pattern — types importing runtime code. Move types down or re-export.

**Recommended rule change:** Allow peer imports within the basic tier (`basic/* <-> basic/*`). This eliminates ~23 violations immediately and makes sense — `lib`, `ui`, `api`, and `mlv2` are all foundational.

## Phase 3: Fix admin as a feature (~10 violations)

**Admin outbound (1 violation):**
- `admin/datamodel/hoc/FilteredToUrlTable.jsx` imports from `feature/query_builder`
- Fix: extract the shared bit or move the HOC

**Admin inbound (9 violations from named modules):**
- 6 from `shared/common` (ErrorPages, Schedule, Sidesheet, SaveQuestionForm, hooks)
- 2 from `types` (analytics/event types, store types referencing admin)
- 1 from `feature/dashboard`, 1 from `feature/query_builder`

Most of these are `shared/common` components importing admin settings/utils. Fix: move the shared dependency down into `shared/` or inject via props/context.

## Phase 4: Validate

- [ ] Run boundary lint on named modules only — should be 0 violations
- [ ] Add to CI as a separate lint step (fast, standalone config)
- [ ] Delete `errors.txt` — it's served its purpose

## Out of scope (future work)

- Categorizing modules currently in `other` (incremental, done over time)
- Enforcing boundaries on enterprise code
- Splitting `common` into more specific shared modules
