# Index Manager — BE progress

Tracks backend work on the `hackaton-index-manager` branch. Plan lives in
`INDEX_MANAGER_PLAN.md`.

## Status

- [x] **BE-1** — module scaffold, migration, `IndexRequest` model
  - [x] Liquibase migration: `resources/migrations/062/20260514_metabase_index_request.yaml`
  - [x] Toucan 2 model `:model/IndexRequest`
  - [x] lifted `ddl_parse.clj` (allowed-tables generalised)
  - [x] lifted `ddl_execute.clj`
  - [x] lifted `introspection.clj`
  - [x] `init.clj`, wired into `metabase.core.init`
  - [x] kondo module config entry (`warehouse-index-manager`, team Gadget)
- [x] **BE-2** — `GET /indexes` + `POST /preview`
  - [x] driver feature flag `:index/create-concurrently` (Postgres true)
  - [x] structured → SQL builder via HoneySQL (`:create-index` +
        custom `::include` clause registered with `sql/register-clause!`)
  - [x] `metabase.warehouse-index-manager.core/list-indexes` & `/preview`
  - [x] endpoint shims in `metabase.warehouse-schema-rest.api.table`
- [x] **BE-3** — `POST`, `PUT`, `DELETE`, `GET /requests/:id` + quick-task
  - [x] `submit-create!` / `submit-edit!` / `submit-drop!` + `get-request`
  - [x] async execution via `metabase.util.quick-task/submit-task!`
  - [x] in-flight requests reject mutations with 409 (`:in-flight`)
  - [x] DELETE issues `DROP INDEX CONCURRENTLY IF EXISTS` then deletes the
        row so the (table, name) UNIQUE slot is freed for re-create
- [x] **BE-4** — `:event/transform-run-complete` replay subscriber
  - [x] `metabase.warehouse-index-manager.events` namespace
  - [x] only `:succeeded` rows are replayed; rows missing from the
        warehouse after the transform run get re-queued
  - [x] failures during replay are logged, not propagated
  - [x] wired into module `init.clj`

## Notes / decisions made while implementing

- **Module location**: `src/metabase/warehouse_index_manager/` (OSS, not EE).
- **`ddl_parse.parse` signature**: takes `allowed-tables` as a set of
  `[schema table]` pairs; BE-2/BE-3 pass `#{[schema name]}` for the
  single-table case.
- **Status enum** stored as `varchar(20)` (`pending|running|succeeded|failed|dropped`),
  kept as a keyword in Clojure via `mi/transform-keyword`. The
  `:dropped` value isn't actually written today — DELETE deletes the row —
  but kept in the allowed set in case we want soft-delete later.
- **`metabase_table.transform_id` denormalised** into `metabase_index_request.transform_id`
  at creation time so the replay event subscriber can find rows by
  transform-id without joining through `metabase_table`.
- **HoneySQL `:create-index`** covers UNIQUE / CONCURRENTLY / IF NOT EXISTS
  / index name / table / USING `<method>` / ASC/DESC. Postgres' `INCLUDE`
  isn't supported natively, so the builder registers a custom `::include`
  clause via `sql/register-clause!` that the formatter emits after
  `:create-index`.
- **NULLS FIRST/LAST dropped from MVP structured form**: HoneySQL's
  order-by inside `:create-index` doesn't expose a clean slot for it.
  Users who need it fall back to the raw-SQL editor.
- **Driver feature flag**: `:index/create-concurrently` lives in
  `metabase.driver/features` and is overridden true in
  `metabase.driver.postgres`. Surfaced in GET as `:supports_concurrent`.
- **Error handling**: `core/*` functions throw `ex-info` carrying
  `:status-code`; the endpoint shims either re-throw directly (in BE-3)
  or wrap to set `:status-code 400` (preview's builder errors). The
  exception middleware converts to JSON.
- **In-flight protection**: PUT/DELETE reject with 409 when the request
  is currently `:pending` or `:running` (avoid double-submit).
- **Replay race avoidance**: replay only considers `:succeeded` rows;
  rows being edited/dropped (`:pending`/`:running`) are skipped, so the
  user's in-flight op wins.

## Open questions / known gaps

- HoneySQL's `:create-index` form was inferred from the source — high
  confidence but the rendered output hasn't been smoke-tested yet.
  First REPL test should `sql/format` a representative form.
- `database-routing` not considered: the table → database lookup uses
  `(:db_id table)` without `:router_database_id nil`. If a customer
  has routing, this may need adjustment.
- No tests yet. Suggest unit tests for `ddl-parse` (lifted from
  optimizer branch, has existing tests we should port), `builder`
  (round-trip + sad-path), and an integration test for the full
  POST → quick-task → status loop against a test Postgres.
- No audit-log emission for create/edit/drop — easy to add later.
