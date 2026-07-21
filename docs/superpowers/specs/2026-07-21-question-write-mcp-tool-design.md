# `question_write` MCP v2 tool — design

- **Ticket:** GHY-4145
- **Proposal:** MCP v2 Proposal §9 `question_write`
- **Base branch:** `mcp-v2-query-handles` (PR #77865)
- **Date:** 2026-07-21

## Summary

Add a single MCP v2 write tool, `question_write`, that lets an agent create, update,
and archive/restore saved cards of type `question` and `model`. It merges v1's
`create_question` / `update_question` and adds native SQL and model support (both
CLI-only in v1), sitting on the v2 registry (`deftool`), the query-handle store, and the
shared `_write` dispatch helpers.

## Placement

- New namespace `metabase.mcp.v2.tools.question` at
  `src/metabase/mcp/v2/tools/question.clj`.
- Registered by adding it to the `:require` list of `metabase.mcp.v2.api`, the same way
  read tools are pulled in for their `deftool` load-time registration side effect.
- Follows the per-tool file convention established by
  `src/metabase/mcp/v2/tools/search.clj`.

## Registry entry

```clojure
(registry/deftool question-write-tool
  "<tool description>"
  {:name         "question_write"
   :scope        metabot.scope/agent-question-create   ; required to list/call
   :update-scope metabot.scope/agent-question-update    ; re-checked at runtime on method:"update"
   :annotations  {:readOnlyHint false :destructiveHint false}
   :args         question-write-args-schema}
  [args {:keys [token-scopes session-id]}]
  ...)
```

- Both scopes already exist in `metabase.metabot.scope`; **no scope changes**.
- `common/dispatch-write` handles `method` / `id` / `create-required` and the
  `update-scope` recheck; it returns `[:create args]` or `[:update id args]`.
- The tool reports via `common/success-content`; because this is a write tool with a
  concrete programmatic consumer, `structuredContent` mirrors the text payload.
- Every optional schema field must be wrapped `[:maybe …]`
  (`assert-optional-fields-nullable!` throws at load time otherwise).

## Argument schema (§9)

- `method: "create" | "update"` — the only schema-required field.
- `id` — required at runtime for `update` (numeric id or 21-char entity_id).
- `card_type?: "question" | "model"` (default `"question"`; maps to REST card `type`).
- Query source (create: exactly one; update: at most one):
  - `query_handle` — a UUID from an execute tool.
  - `query` — inline plain MBQL 5.
  - `native: {database_id, sql, template_tags?}`.
- `name` (create-required), `description?`.
- `collection_id?` **or** `dashboard_id?`; `collection_position?`.
- `display?` (default `"table"`), `visualization_settings?` (default `{}`).
- `cache_ttl?: int`, `archived?` (update only).
- `column_metadata?: [{name, display_name?, description?, semantic_type?,
  visibility_type?}]` — models only; persisted through card `result_metadata`.

`display` uses the same closed enum agent-api validates against (17 values: table, bar,
line, pie, scatter, area, row, combo, pivot, scalar, smartscalar, gauge, progress,
funnel, map, waterfall, sankey).

## Query-source resolution (shared by create + update)

Exactly one source on create, at most one on update — enforced with a teaching error
that names the fix. Each resolves to a `dataset_query`:

1. **`query_handle`** → new helper `common/resolve-query-handle-for-save!`. Identical to
   the existing `resolve-query-handle!` except it **skips `reject-native-query!`**; it
   still runs `validate-serialized-query!` and `check-token-query-permissions!`. This is
   the fix for the contradiction that `execute_sql` mints handles "so you can save the
   SQL" while the MBQL resolver rejects native handles. Both MBQL and native handles
   resolve here.
2. **`query`** (inline MBQL 5) → `lib-be/normalize-query`.
3. **`native: {database_id, sql, template_tags?}`** → `lib/native-query`
   (auto-extracts `{{tag}}` occurrences), then `lib/with-template-tags` to apply
   caller-supplied typed tags. Tags are typed `text | number | date | dimension`
   (dimension carries a field ref + widget type) and validated against the `{{tag}}`
   occurrences actually present in the SQL, with teaching errors for mismatches.

After a source resolves to a `dataset_query`, **the same permission stack runs
regardless of source.** Native therefore passes through
`query-perms/check-run-permissions-for-query`, which enforces native-query data
permission on the target database. **No extra scope gates the native path** — this
matches v1, where `create_question` saved native SQL under `agent:question:create`
alone.

## Create path

1. `dispatch-write` → `[:create args]`; `create-required [:name]`, plus a custom
   exactly-one-source check.
2. `card_type` defaults to `"question"`.
3. Resolve the `dataset_query` (above).
4. Resolve the target collection:
   - key absent → caller's personal collection;
   - explicit `null` / `"root"` → root collection;
   - otherwise `common/resolve-id-or-404 :model/Collection`.
   - If `dashboard_id` is set, the collection is inferred from the dashboard and must
     not conflict with an explicit `collection_id` (dashboard questions). The model
     layer forces the card into the dashboard's collection and rejects a mismatched
     `collection_id`.
5. Mirror REST `POST /api/card` create pre-checks, in order:
   - `query-perms/check-run-permissions-for-query dataset-query`
   - `api/create-check :model/Card {:collection_id <resolved>}` (checked against the
     dashboard's collection when `dashboard_id` is set).
6. Models: persist `column_metadata` → `result_metadata`
   (`analyze/ResultsMetadata` shape — required per column: `name`, `display_name`;
   optional: `description`, `semantic_type`, `visibility_type`). Dashboard-internal
   cards reject model `card_type` and `collection_position` at the model layer.
7. `queries/create-card!` with `display` default `"table"`,
   `visualization_settings` default `{}`, plus `cache_ttl`, `collection_position`,
   `dashboard_id` as supplied.
8. Return the create response (id, name, url, display, collection_id,
   collection_path, description).

## Update path

1. `dispatch-write` → `[:update id args]` (rechecks `agent:question:update`).
2. `common/resolve-and-read :model/Card id
   (fn [id] (api/write-check :model/Card id))` — entity_id-aware; 403 and 404 collapse
   to the same not-found. Yields `card-before-update`.
3. Build `card-updates` from an explicit allowlist (only keys the caller supplied):
   `name`, `description`, `collection_id`, `display`, `visualization_settings`,
   `cache_ttl`, `collection_position`, `type`, `archived`, `dashboard_id`,
   `result_metadata`, and a resolved replacement query (normalized to canonical MBQL).
4. `api/updates-with-archived-directly` so `archived: true` trashes and
   `archived: false` restores, matching UI behavior.
5. Mirror REST update pre-checks:
   - `collection/check-allowed-to-change-collection` (move requires write on both
     source and target collection);
   - on a query swap (`api/column-will-change? :dataset_query`):
     `query-perms/check-run-permissions-for-query` on the new query, then
     `lib/check-card-overwrite` (cycle guard), wrapped to surface as HTTP 400;
   - dashboard move-rules (a dashboard question can't be moved into another dashboard)
     enforced by the model layer.
6. `queries/update-card!`.
7. Return the update response (create fields plus `archived`).

## Permission-duplication decision

The tool **mirrors the REST pre-check stack inline**, matching how every existing v2
read tool inherits permissions — by calling the check functions directly
(`api/read-check`, `api/write-check`, `mi/can-read?`, …) rather than invoking REST
handler functions. We are **not** acting on Bryan's standing TODO to extract a shared
`metabase.queries.*` pre-check helper in this PR: that would touch v1 agent-api and REST
and is a larger, separate change. Within this tool a small internal create/update helper
keeps the `question` and `model` card types from drifting from each other.

## Testing

Follow the v2 test idiom (`registry_test`, `common_test`): invoke via
`registry/call-tool [token-scopes session-id "question_write" args]`, assert on
`:isError`, `(-> result :content first :text)`, and `:structuredContent`. Use
`mt/with-temp`, `mt/with-current-user`, `mt/with-model-cleanup`, scope sets
(`#{"agent:question:create"}`, `#{::scope/unrestricted}`, denied sets), and
`mt/with-premium-features` where relevant.

Coverage targets:

- `common/resolve-query-handle-for-save!`: native handle resolves (no reject),
  malformed payload teaching error, permission-loss 403, ownership scoping.
- Query-source validation: zero sources, two sources, each single source.
- Native template tags: typed tags applied, `{{tag}}`-mismatch teaching errors.
- Create: MBQL handle, native handle, inline MBQL, native-from-scratch; personal vs
  `null`/`root` vs explicit collection; create-check denial; run-perms denial; display
  default; model + column_metadata persistence; dashboard question; collection_position.
- Update: field patch, archive/restore, collection move (both-side write), query swap
  run-perms + cycle guard, dashboard move rejection, not-found collapse for missing /
  unreadable card, update-scope denial.

## Out of scope

- The MCP "skill" documentation shipped with the server (proposal's skills-over-MCP
  bullet) — a separate deliverable.
- `metric_write` (GHY-4146) — separate ticket; reuses whatever internal patterns this
  PR establishes.
- Extracting the shared REST/agent-api pre-check helper (Bryan's TODO).

## Task breakdown (one thing at a time)

1. `common/resolve-query-handle-for-save!` + tests.
2. Query-source resolution + exactly-one validation (handle / inline MBQL /
   native-from-scratch, no tags yet) + tests.
3. Native `template_tags` typing + `{{}}` validation + tests.
4. Create path (question) — perms stack, collection resolution, defaults, response +
   tests.
5. Model `card_type` — `column_metadata` → `result_metadata`, model validation + tests.
6. Dashboard questions — `dashboard_id` create + move rules + tests.
7. Update path — allowlist patch, archive/restore, move + query-swap checks, response +
   tests.
8. Registry wiring — `deftool`, `api.clj` require, kondo, `fix-modules-config`.
