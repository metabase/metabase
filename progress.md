# Index Manager — BE progress

Tracks backend work on the `hackaton-index-manager` branch. Plan lives in
`INDEX_MANAGER_PLAN.md`.

## Status

- [x] **BE-1** — module scaffold, migration, `IndexRequest` model
  - [x] module location: `src/metabase/warehouse_index_manager/` (OSS)
  - [x] Liquibase migration: `resources/migrations/062/20260514_metabase_index_request.yaml`
  - [x] Toucan 2 model `:model/IndexRequest`
  - [x] lifted `ddl_parse.clj` (allowed-tables generalised)
  - [x] lifted `ddl_execute.clj`
  - [x] lifted `introspection.clj`
  - [x] `init.clj`, wired into `metabase.core.init`
  - [x] kondo module config entry (`warehouse-index-manager`, team Gadget)
- [ ] **BE-2** — `GET /indexes` + `POST /preview`
  - [ ] structured → SQL builder
  - [ ] `GET` joins introspection rows with `IndexRequest` rows
  - [ ] mount routes under `/api/table/:id/indexes/...`
- [ ] **BE-3** — `POST`, `PUT`, `DELETE`, `GET /requests/:id` + quick-task
- [ ] **BE-4** — `:event/transform-run-complete` replay subscriber

## Notes / decisions made while implementing

- **Module location**: `src/metabase/warehouse_index_manager/` (OSS, not EE).
  Listing always works for superusers; transform-gating happens at the
  endpoint level. Can be moved to EE later if we attach a premium feature
  flag.
- **`ddl_parse.parse` signature unchanged**: still takes
  `allowed-tables` as a set of `[schema table]` pairs. BE-2/BE-3 will pass
  `#{[schema table]}` for the single table the endpoint is scoped to.
- **Internal namespaces**: `ddl_parse`, `ddl_execute`, `introspection` are
  *not* listed in the kondo module `:api` set — they're consumed by the
  forthcoming API namespace and events handler inside the module, so they
  stay internal.
- **Status enum** stored as `varchar(20)` (`pending|running|succeeded|failed|dropped`),
  kept as a keyword in Clojure via `mi/transform-keyword`. Allowed values
  in `index-request/statuses`.
- **`metabase_table.transform_id` denormalised** into `metabase_index_request.transform_id`
  at creation time. This is so the transform-rerun event subscriber can
  find rows by transform-id without joining through `metabase_table`
  (which may have been re-synced / re-created during the transform run).

## Open questions surfaced during implementation

- Should the module expose a `.core` namespace as the canonical public
  API for callers, or is it fine to have the endpoint namespace (BE-2)
  require `ddl-parse`, `introspection`, etc. directly? Going with the
  latter for now — easier to refactor later.
- The model has no `:hook/entity-id` (we don't expose these via serdes).
  Worth adding? Probably not for MVP.
