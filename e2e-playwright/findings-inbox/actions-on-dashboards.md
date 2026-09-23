# actions-on-dashboards.cy.spec.js → tests/actions-on-dashboards.spec.ts

Source: `e2e/test/scenarios/actions/actions-on-dashboards.cy.spec.js` (1412 lines).
New helper module: `support/actions-on-dashboards.ts`.

## Result

- 33 tests ported (2 dialects × 15 in the dialect loop, + 1 error-handling,
  + 2 parameter-mapping). Issue numbers kept exact: WRK-67, metabase#34395
  (×2), metabase#33084.
- **Whole spec is `@external` + `@actions`** — every describe restores a
  `${dialect}-writable` snapshot and drives the writable QA postgres/mysql DB.
  Gated on `PW_QA_DB_ENABLED` (rule 6). With the gate off — the jar/slot-4
  verification default — **all 33 skip** (66 skipped under `--repeat-each=2`).
- tsc clean for both new files (the one remaining repo tsc error is a sibling
  agent's untracked `support/embedding-repros.ts`, not from this port).

## Gated for lack of a writable DB (could NOT execute or cross-check)

Neither QA container is reachable locally (postgres :5404 and mysql :3304 both
down), and the slot jar backend has no `postgres-writable`/`mysql-writable`
snapshot (those are Cypress-created), so `mb.restore("${dialect}-writable")`
would fail regardless. **The entire spec is gated; no test was executed and no
Cypress cross-check was run.** The port is faithful-by-construction but
unverified at runtime — flagging clearly per the fidelity rule (a green run
here means "correctly skipped", nothing more).

Consequence: the DB-shape assertions (mysql-vs-postgres boolean 0/false,
bigint number-vs-string, decimal-as-string, timezone `.include` checks) and the
dnd-kit / native-editor UI interactions in this spec have NOT been exercised on
the jar. First real signal will come from a CI leg (or local session) that sets
`PW_QA_DB_ENABLED` with the QA containers + writable snapshots present.

## Port decisions worth noting

- **Dialect-aware writable-DB helpers** (`support/actions-on-dashboards.ts`):
  `queryWritableDB(query, dialect)` and `resetTestTable({type, table})` use a
  lazy `require("knex")` against `WRITABLE_DB_CONFIG` (pg / mysql2 from the
  repo-root node_modules), mirroring the Cypress `connectAndQueryDB` /
  `resetTable` tasks the Playwright harness has no cy.task equivalent for.
  mysql results are normalised to `{ rows: result[0] }` exactly like
  `db_tasks.js`. The two tables (`scoreboard_actions`, `many_data_types`) are
  rebuilt with the same knex schema-builder calls as `test_tables.js` so the
  DDL is dialect-correct for both engines (the schema-viewer/native-filters
  ports only replayed postgres DDL; this one needs mysql too).
- `createModelFromTableName` is re-implemented here (not reused from
  interactive-embedding.ts) because the shared copy doesn't RETURN the model
  id, which this spec reads back throughout (upstream `@modelId`).
- `getActionCardDetails` re-implemented locally: the click-behavior.ts copy
  takes no args, but this spec passes `action_id`/`label`.
- `H.moveDnDKitListElement`'s synthetic pointer sequence → real-mouse drag
  computing the offset between the start/drop indices (dnd-kit sensors accept
  real input; consistent with dashboard-cards.ts `moveDnDKitElement`).
- The "hide actions in static embed" dashboard sets `enable_embedding` via a
  follow-up PUT (POST /api/dashboard ignores it — the "create* helpers are not
  thin wrappers" gotcha). `openLegacyStaticEmbeddingModal` sets it again anyway.
- `clickHelper`'s upstream `cy.wait(100)` (pre-Cypress-v12 detached-element
  workaround) dropped — Playwright re-resolves + waits for actionability.
- Snowplow helpers → no-op stubs (rule 6). No `@modelId`-style aliasing; the
  model id flows through a `let modelId` captured in `beforeEach`.
- `cy.wait("@getModel")` calls that follow a non-triggering click (data-types
  update tests) are registered but awaited with `.catch(() => undefined)` so a
  retroactively-satisfied Cypress wait doesn't become a hang here.

## No dividends / no product-bug claims

Nothing observed — the spec never ran. No `test.fixme`.
