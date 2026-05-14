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
  - [x] structured → SQL builder via HoneySQL
        (`:create-index` + a custom `::include` clause)
  - [x] `metabase.warehouse-index-manager.core/list-indexes` & `/preview`
  - [x] endpoint shims in `metabase.warehouse-schema-rest.api.table`
        (`GET /:id/indexes`, `POST /:id/indexes/preview`)
- [ ] **BE-3** — `POST`, `PUT`, `DELETE`, `GET /requests/:id` + quick-task
- [ ] **BE-4** — `:event/transform-run-complete` replay subscriber

## Notes / decisions made while implementing

- **Module location**: `src/metabase/warehouse_index_manager/` (OSS, not EE).
- **`ddl_parse.parse` signature**: still takes `allowed-tables` as a set of
  `[schema table]` pairs; BE-2/BE-3 pass `#{[schema name]}` for the
  single-table case.
- **Status enum**: stored as `varchar(20)` (`pending|running|succeeded|failed|dropped`),
  kept as a keyword in Clojure via `mi/transform-keyword`. Allowed values
  in `index-request/statuses`.
- **`metabase_table.transform_id` denormalised** into `metabase_index_request.transform_id`
  at creation time so the transform-rerun event subscriber can find rows
  by transform-id without joining through `metabase_table`.
- **HoneySQL `:create-index`**: covers UNIQUE / CONCURRENTLY / IF NOT EXISTS
  / index name / table / USING `<method>` / ASC/DESC. Postgres' `INCLUDE`
  isn't supported natively, so the builder registers a custom `::include`
  clause via `sql/register-clause!` that the formatter emits after
  `:create-index`.
- **NULLS FIRST/LAST dropped from MVP structured form**: HoneySQL's
  order-by inside `:create-index` doesn't expose a clean slot for it,
  and it's a rarely-used Postgres feature. Users who need it can fall
  back to the raw-SQL editor.
- **Driver feature flag**: `:index/create-concurrently` lives in
  `metabase.driver/features` and is overridden true in
  `metabase.driver.postgres`. The GET response surfaces it as
  `:supports_concurrent` so the FE can hide the toggle for drivers that
  don't support it.
- **Error handling**: `core/preview` throws `ex-info` with a `:reason`
  keyword. The endpoint shim catches `ExceptionInfo` and re-throws with
  `:status-code 400`, which Metabase's exception middleware converts to
  a JSON 400 response carrying the `:reason` and `:detail`.

## Open questions surfaced during implementation

- HoneySQL's `:create-index` form was inferred from the source; I have
  high confidence in the index-spec / on-clause shape but should
  smoke-test the rendered output once the user wires up the REPL.
- The endpoint shims live in `warehouse_schema_rest/api/table.clj` rather
  than a separate namespace — simpler than composing `ns-handler`s. If
  this grows, refactor into route composition then.
