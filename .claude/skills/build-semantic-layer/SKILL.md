---
name: build-semantic-layer
description: Author a replayable Metabase semantic layer (transforms → published Library tables → measures/segments/field metadata → metrics → dashboards) for one warehouse schema with the `mb` CLI, load it into the dev/semantic_layer harness on :3000, and review it. Use when asked to "build the semantic layer for <schema>", "add a layer", "model <schema>", or to change layers/<schema>/.
---

# Build a semantic layer

A layer is `dev/semantic_layer/layers/<schema>/`: a `build.sh` of `mb` calls plus the SQL and JSON bodies it sends.
`make -C dev/semantic_layer layer-fresh SCHEMA=<schema>` resets the :3000 instance (app DB re-cloned from a template,
warehouse rebuilt, ~55s) and replays the script, so nothing is idempotent and nothing is diffed: fix the files, replay.
`layers/pagila/` is the reference implementation; copy it for a new schema and keep its structure.

Load the CLI skills first — the method and every body shape come from them, not from memory:

```bash
mb skills get core          # auth, list envelopes, --file/-, --full, --max-bytes
mb skills get data-workflow # then Read references/building-clean-tables.md and reusable-definitions.md from `mb skills path data-workflow`
mb skills get transform mbql visualization dashboard metadata
```

Profile is `semlayer` (`mb auth status --profile semlayer`). If it reports `network-error`, `make -C dev/semantic_layer up`.
Working files go in `layers/<schema>/.scratch/` (gitignored). Never curl the API and never paste credentials.

## 1. Investigate before writing SQL

```bash
mb db schema-tables 2 <schema> --profile semlayer --json | jq -r '.data[] | "\(.id)\t\(.name)"'   # list verbs return {data:[…]}
mb table get <id> --include fields --full --profile semlayer --json                                  # --full carries fk_target_field_id
psql -h localhost -d semantic_layer_test                                                             # row counts, distinct values, orphans
```

Decide the *things* (one wide table per real-world thing, per `building-clean-tables.md`): keep every linking id
next to its readable label, decode codes, split multi-valued columns into booleans, drop bookkeeping columns,
copy related context in. Write each table's SQL to `transforms/<name>.sql`, first line `-- <one-sentence description>`
(build.sh uses it as the transform description). Before creating anything, `EXPLAIN` each file and reconcile
totals across the tables in `psql` (rentals, films and payments in pagila all sum to the same revenue).
Target table names must not collide with raw tables in the schema (`rentals` beside `rental` is fine).

## 2. Files and the id-token convention

```
layers/<schema>/
  build.sh              generic driver — only TABLES=(…) changes between schemas
  transforms/<t>.sql    one per clean table
  metadata/tables.json  {"<t>": {display_name, description, fields: {"<col>": {semantic_type, display_name, description, has_field_values, fk: "<t>.<col>"}}}}
  measures/*.json       {name, table_id, description, definition: mbql/query with exactly one aggregation}
  segments/*.json       {name, table_id, description, definition: mbql/query with filters}
  metrics/*.json        card bodies, type "metric", monthly breakout, collection {{c:metrics}}
  questions/*.json      card bodies for the dashboard, collection {{c:pagila}} (rename per schema)
  dashboards/*.json     dashboard body with dashcards + parameters + parameter_mappings
  layer.json            the intent (tables, decisions, definitions); load.py pushes it to /api/dev/prototype/semantic-layer/
```

Ids do not exist until the instance hands them out, so bodies are templates. build.sh's `render` replaces
`{{db}}`, `{{t:<table>}}`, `{{f:<table>.<col>}}`, `{{c:metrics}}`, `{{c:<collection>}}`, `{{card:questions/<slug>}}`,
`{{card:metrics/<slug>}}` from `.scratch/ids.json`. A token that is the whole string becomes a number (field ids in
MBQL); a token inside a longer string is spliced as text. An unresolved token aborts the build with its name.
macOS bash is 3.2 (no associative arrays) — that is why ids live in a JSON file and go through `jq`.

## 3. Phase order (build.sh) and the rules that bit

1. **Transforms** — native stage body from `transform` skill; `mb transform run <id> --wait --json`, check `.final.status == "succeeded"` (the CLI exits 1 on failure but the reason is only in `.final.message`). Then `mb db sync-schema <db> --wait`.
2. **Resolve ids** — `mb table list --db-id <db> --limit 500 --fields id,name,schema --json`, then `mb table get <id> --include fields --json` per table.
3. **Metadata** — `mb table update` (display_name, description) and `mb field update` per column; `fk` shorthand becomes `{semantic_type: type/FK, fk_target_field_id}`. Set `type/PK` on each table's id first so FKs have a target. `has_field_values: list` on the columns you want as dashboard dropdowns.
4. **Library** — `mb library publish --table-ids a,b,c,d` (creates the Library if absent); the Metrics collection id is `mb library get --json | jq '.effective_children[] | select(.type=="library-metrics") | .id'`. Put questions/dashboards in a plain collection (`mb collection create`).
5. **Measures / segments** — `definition` is the flat `mbql/query` (`lib/type`, `database`, `stages`) with `source-table`; one aggregation, no filters, for a measure (`count-where` / `share` count as one aggregation).
6. **Metrics** — `mb card create` with `type: "metric"`, one aggregation and a `temporal-unit: month` breakout; the server computes the metric's dimensions for the metric overview page itself.
7. **Questions** — `visualization_settings` name *output columns* (`sum`, `count`, `share`, `distinct`, or the breakout column's name). Ordering by an aggregation needs a `lib/uuid` on it — mint with `mb uuid`, never type one. Percent formatting: `column_settings["[\"name\",\"share\"]"].number_style = "percent"`.
8. **Dashboards** — 24-column grid; mappings use the legacy target `["dimension", ["field", <id>, null]]`; `parameters[].id` is a slug. The compact `mb dashboard get` hides `parameter_mappings`; verify with `--full --max-bytes 0`.
9. **Smoke** — `mb card query <id> --json | jq '.data.rows | length'` for every card; the build fails on an error or an empty result.

## 4. Review

build.sh prints the URLs. Log in as admin@semlayer.local (password in `dev/semantic_layer/common.py`) and open:

- the dashboard (`/dashboard/<id>`) — filters must offer values and change the KPIs;
- `/metric/<id>/overview` for each metric — this is what the viz A/B harness judges;
- `/explore/table/<id>` (Metric Cube Viewer) for each published table — needs Measures on the table;
- `/data-studio/transforms/<id>/inspect` — input/output tables and column distributions;
- `/_internal/overview/table/<id>` and `/_internal/overview/metric/<id>` — the old/new harness against the layer.

Pass 2 of `building-clean-tables.md` still applies: `SELECT * FROM <schema>.<table> LIMIT 20` and read every
column as a business reader would. A readability smell is a bug — fix the SQL and replay.

## Gotchas

- The backend serves whatever the frontend watcher last wrote; `make -C dev/semantic_layer dev` (the `metabase-dev` launch config) runs backend + watcher, and a reset bounces only the backend.
- `mb card list` includes the instance's built-in analytics cards; filter by `collection_id`.
- `mb library get` errors until the Library exists; `library publish` creates it.
- `mb table get --full` can exceed the 24 KB output cap on wide tables — add `--max-bytes 0`.
- A reset invalidates every UI session on :3000 (log in again); the `semlayer` API key survives (it lives in the template), and the viz-ab / overview judgement tables are dumped and restored around the re-clone.
