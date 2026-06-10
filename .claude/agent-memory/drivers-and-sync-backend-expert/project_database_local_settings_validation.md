---
name: database-local-settings-validation
description: How PUT /api/database/:id validates the settings map against registered defsettings, and where database-local settings must be registered
metadata:
  type: project
---

`PUT /api/database/:id` (in `src/metabase/warehouses_rest/api.clj`) does NOT silently accept arbitrary `settings` keys. The Malli schema only checks `[:settings [:maybe ms/Map]]`, but a per-key validation loop calls `setting/validate-settable-for-db!` for every changed, non-nil, non-default setting. That calls `resolve-setting`, which throws "Unknown setting" for any key not in `@registered-settings` — re-thrown as HTTP 400.

**Why:** Adding a new database-local boolean (e.g. `database-enable-workspaces`) requires a real `defsetting` with `:database-local :only`; you cannot just send the key from the FE. Without registration the PUT 400s.

**How to apply:**
- The `Database.settings` column is a free-form encrypted JSON blob (`mi/transform-encrypted-json`) — no per-key schema at the model layer. All gatekeeping is in the API handler.
- Premium gating uses the `:feature <kw>` option (enforced in `validate-settable!`, `src/metabase/settings/models/setting.clj` ~line 995), NOT `:driver-feature` (which checks driver capability). `:feature`-gated settings are also omitted from `GET /api/database/:id/settings-available` when the token lacks the feature, and `setting/get` (~line 759) returns `:default` when the feature is absent.
- **Write-path asymmetry (important):** the per-key loop only validates values that are non-nil, changed from stored, AND not equal to the setting `:default` (the `:when` guard, `warehouses_rest/api.clj` ~lines 1187-1194). So for a `:feature`-gated `:default false` boolean, writing `false`/default is always allowed and bypasses the feature check; only *enabling* (non-default `true`) without the token yields a 400.
- All existing `:database-local :only` settings live in core `src/metabase/<area>/settings.clj` (actions, model_persistence, sync). The EE workspaces module has `metabase-enterprise.workspaces.settings`, the idiomatic place for an EE-gated workspaces database-local setting. Boot chain: `metabase-enterprise.core.init` → `metabase-enterprise.workspaces.init` (requires `.settings` at line 17) → defsettings register as load-time side effects; `keep-me` marker defends the require from pruning. The `:workspaces` premium feature (`enable-workspaces?`) is registered in `src/metabase/premium_features/settings.clj` ~line 370.
- Canonical pattern to copy: `database-enable-actions` / `database-enable-table-editing` in `src/metabase/actions/settings.clj`. `database-enable-table-editing` uses `:feature :table-data-editing` + `:export? true`; `instance-workspace` (in workspaces/settings.clj) uses `:export? false` — pick `:export?` based on whether the flag should travel through serdes.
