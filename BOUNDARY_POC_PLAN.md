# Module Boundaries PoC

## Goal

Zero boundary violations between named modules. Basic tier + `admin/settings` as the feature.

## Module definitions

| Tier | Module | Path |
|------|--------|------|
| types | `types` | `metabase-types` |
| basic | `mlv2` | `metabase-lib` |
| basic | `ui` | `metabase/ui` |
| basic | `api` | `metabase/api` |
| basic | `lib` | `metabase/lib` |
| shared | `common` | `metabase/common` |
| shared | `redux` | `metabase/redux` |
| feature | `admin-settings` | `metabase/admin/settings` |
| — | `other` | everything else |

## Rules

- `basic/*` can import `types` and other `basic/*` (peers)
- `shared/*` can import `types`, `basic/*`, `shared/*`
- `feature/*` can import `types`, `basic/*`, `shared/*`
- `other` is unconstrained in both directions (not yet enforced)

## Step 1: Config cleanup

- [ ] Rename `.eslint.config.bounaries.mjs` (fix typo)
- [ ] Remove accidental `i` and `npm` deps from `package.json`
- [ ] Remove unused `require("underscore")` in `.boundaries.js`
- [ ] Remove bundle analyzer from this branch
- [ ] Add `other` allow-all rules
- [ ] Remove dead `shouldEnforce` toggle

## Step 2: Fix basic tier (~13 violations after peer rule)

- `basic/lib` -> `shared/common`: 5 violations in `lib/formatting/` and `lib/urls/`. Move deps down.
- `basic/ui` -> `shared/common`: 4 violations (BlurChange inputs, Menu, Popover importing common hooks). Move hooks into `ui` or `lib`.
- `types` -> `shared/visualizations`: 4 violations. Move type defs into `metabase-types`.

## Step 3: Verify admin/settings

Outbound deps are all basic/shared tier — should be 0 violations. Inbound importers are all `other` — invisible under allow-all rule.

## Step 4: Validate

- [ ] Clean lint pass for named modules
- [ ] Add as CI step
- [ ] Delete `errors.txt`
