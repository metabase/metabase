# Index Manager — BE progress

Tracks backend work on the `hackaton-index-manager` branch. Plan lives in
`INDEX_MANAGER_PLAN.md`.

## Status

- [ ] **BE-1** — module scaffold, migration, `IndexRequest` model
  - [ ] decide module location (OSS `src/metabase/warehouse_index_manager` vs EE)
  - [ ] Liquibase migration: `metabase_index_request`
  - [ ] Toucan 2 model `:model/IndexRequest`
  - [ ] lift `ddl_parse.clj` (generalised allowed-tables)
  - [ ] lift `ddl_execute.clj`
  - [ ] lift `introspection.clj`
  - [ ] module `init.clj`, wire into core init
- [ ] **BE-2** — `GET /indexes` + `POST /preview`
  - [ ] structured → SQL builder
  - [ ] `GET` joins introspection rows with `IndexRequest` rows
  - [ ] mount routes under `/api/table/:id/indexes/...`
- [ ] **BE-3** — `POST`, `PUT`, `DELETE`, `GET /requests/:id` + quick-task
- [ ] **BE-4** — `:event/transform-run-complete` replay subscriber

## Notes / decisions made while implementing

(empty)

## Open questions surfaced during implementation

(empty)
