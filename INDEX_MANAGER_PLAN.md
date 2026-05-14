# Index Manager — Plan

A new admin feature: an "Indexes" tab on the table metadata admin page that
lists indexes on the table and, for transform-managed tables on Postgres,
lets superusers create / edit / drop indexes. Index requests are recorded
so they're re-applied when a transform drops + recreates its target table.

Branch: `hackaton-index-manager` (off `master`).

---

## Decisions (locked in)

- **Scope of "manage":** only Metabase-managed indexes (rows in
  `metabase_index_request`) can be edited or dropped from the UI. Indexes
  the user created directly in the warehouse are listed but read-only.
- **Drivers:** Postgres only in MVP. Non-Postgres returns
  `{driver_supported: false}` and the FE renders a placeholder.
- **Permissions:** superuser only on every endpoint (no data-permission
  gating in MVP).
- **Transform gating:** mutating endpoints return 403 unless
  `metabase_table.transform_id IS NOT NULL`.

---

## What we lift from `origin/hackathon-transform-optimizer`

The optimizer branch already implemented most of the load-bearing logic.
We rip these out of `transform_optimizer/` and move them into a new
`warehouse_index_manager` module (location TBD — likely OSS for the
read path, with EE gating once we attach a premium feature flag).

| File on optimizer branch | Reuse as | Changes |
|---|---|---|
| `ddl/parse.clj` | `index_manager/ddl_parse.clj` | Generalise `allowed-tables` from "optimizer context" to "this one table". Same strict allowlist: single `CREATE [UNIQUE] INDEX [CONCURRENTLY] [IF NOT EXISTS]`, forbidden-keyword scan, string/comment sanitiser. |
| `ddl/execute.clj` | `index_manager/ddl_execute.clj` | Already correct: opens fresh autocommit connection (required for `CONCURRENTLY`). Postgres-only. |
| `index_introspection.clj` | `index_manager/introspection.clj` | Postgres `pg_index` catalog query — returns `key_columns`, `include_columns`, `partial_predicate`, `definition`, `access_method`, `is_unique`, `is_primary`, `is_valid`. Keep as-is. |
| `indexes.clj` | split & rewrite | Listing reusable (drop the "target + sources" union, scope to one table). Drop logic reads "managed by us" from the new model instead of `transform.target.post_run_ddl`. |

**Dropped** from the optimizer branch:
- `transform.target.post_run_ddl` JSON tracking — replaced with a real
  model so we can store status, edits, and decouple from transforms.
- The "source tables" branch — out of scope.

---

## Data model

New migration adds `metabase_index_request`:

```
metabase_index_request
  id                  PK
  table_id            FK metabase_table  NOT NULL  (indexed)
  transform_id        FK transform       NULL       (denormalised from
                                                     metabase_table.transform_id
                                                     at creation; lets replay
                                                     work even if the FK on
                                                     metabase_table is later
                                                     cleared)
  index_name          TEXT NOT NULL
  statement           TEXT NOT NULL                  (validated CREATE INDEX,
                                                     source of truth)
  structured          JSONB NULL                     (the structured form when
                                                     created via /preview;
                                                     NULL if user pasted raw)
  status              ENUM('pending','running','succeeded','failed','dropped')
                                                     NOT NULL
  error_message       TEXT NULL
  created_by_id       FK core_user
  created_at          TIMESTAMP
  updated_at          TIMESTAMP
  last_executed_at    TIMESTAMP NULL
  UNIQUE (table_id, index_name)
```

Why the **raw statement** is the source of truth (not the structured
form): structured covers ~80% of cases; the rest the user types raw.
Both code paths converge on the same validated SQL, which is what we
replay.

Toucan 2 model: `:model/IndexRequest`.

---

## Structured index syntax

Input to `POST /preview`. Covers the common case; anything more advanced
(partial `WHERE`, expression indexes, operator classes, storage params)
falls back to the raw-SQL editor.

```ts
type IndexStructured = {
  index_name: string;            // mandatory; we don't auto-name
  columns: Array<{
    name: string;                // validated against the table's fields
    direction?: "asc" | "desc";  // default "asc"
    nulls?: "first" | "last";    // optional
  }>;
  include?: string[];            // postgres INCLUDE columns
  unique?: boolean;              // default false
  concurrent?: boolean;          // default true (recommended)
  if_not_exists?: boolean;       // default true
  method?: "btree" | "hash" | "gin" | "gist" | "brin" | "spgist";
                                 // default "btree"
};
```

---

## Endpoint contracts

All mounted on `metabase.warehouse-schema-rest.api.table`, scoped to a
table id. Auth: `(api/check-superuser)` + `api/write-check` on the table.

### `GET /api/table/:id/indexes`

Returns every index that exists on the table (Postgres catalog), each
joined with its `IndexRequest` row when one exists.

```ts
{
  table: {
    id: number,
    schema: string,
    name: string,
    transform_id: number | null,
    driver: "postgres" | string,
    driver_supported: boolean,    // false → indexes: [], UI shows placeholder
    can_manage: boolean,          // driver_supported && transform_id !== null
                                  //   && currentUser.is_superuser
  },
  indexes: Array<{
    name: string,
    definition: string,           // pg_get_indexdef(...)
    access_method: string,        // 'btree' | 'gin' | ...
    is_unique: boolean,
    is_primary: boolean,
    is_valid: boolean,
    key_columns: string[],
    include_columns: string[],
    partial_predicate: string | null,
    managed_by_metabase: boolean, // there's a matching IndexRequest row
    request: {                    // null when managed_by_metabase = false
      id: number,
      status: "pending" | "running" | "succeeded" | "failed" | "dropped",
      error_message: string | null,
      created_by_id: number,
      created_at: string,
      last_executed_at: string | null,
    } | null
  }>,
}
```

### `POST /api/table/:id/indexes/preview`

Pure function — never executes. Validates column names against the table
and returns the SQL that would be run.

```ts
// request
IndexStructured
// response
{ statement: string, warnings: string[] }
// errors: 400 { error: "unknown_column", detail: "..." }
//        400 { error: "driver_not_supported" }
```

### `POST /api/table/:id/indexes`

Validate, insert `IndexRequest` row, submit `quick-task/submit-task!` for
async execution. Returns immediately.

```ts
// request — exactly one of:
{ statement: string }
| { structured: IndexStructured }
// response: 202
{ request_id: number, status: "pending" }
// errors: 400 driver_not_supported
//        400 validation_failed { reason, detail }   // from ddl_parse
//        403 transform_id is null
```

### `GET /api/table/:id/indexes/requests/:request_id`

Polled by the FE while a create/edit/drop is in flight.

```ts
{
  id: number,
  index_name: string,
  status: "pending" | "running" | "succeeded" | "failed" | "dropped",
  error_message: string | null,
  statement: string,
  created_at: string,
  last_executed_at: string | null,
}
```

### `PUT /api/table/:id/indexes/requests/:request_id`

Edit = drop existing index + create a new one atomically (queued, both
steps in the same `quick-task`). Updates the existing row so it keeps
its history.

```ts
// request
{ statement: string } | { structured: IndexStructured }
// response: 202
{ request_id: number, status: "pending" }
```

### `DELETE /api/table/:id/indexes/requests/:request_id`

Keyed off the request row, **not** the index name. If the row is gone
you can't drop. (Avoids stale-name bugs when an index is renamed in the
warehouse.) Issues `DROP INDEX CONCURRENTLY IF EXISTS` and marks the
row `dropped`.

```ts
// response: 202
{ status: "dropping" }
```

---

## Async execution

Reuse `metabase.util.quick-task/submit-task!` (the same pattern as
`POST /api/table/:id/rescan_values`).

Task body:
1. `UPDATE index_request SET status = 'running'`
2. Call `ddl_execute/execute!` with the validated statement.
3. `UPDATE index_request SET status = 'succeeded' | 'failed'`,
   `error_message`, `last_executed_at`.

Polling: FE polls `GET …/requests/:id` every ~2s while status is
`pending` or `running`. No new infra needed.

---

## Replay on transform re-run

Subscribe to `:event/transform-run-complete` (fired at
`src/metabase/transforms_base/util.clj:502`, after sync and after
`transform.target_table_id` is set).

Handler — in a new `index_manager/events.clj`, wired via
`index_manager/init.clj`:

1. Find `IndexRequest` rows where
   `transform_id = event.transform-id AND status IN ('succeeded','failed','dropped')`
   (excluding `pending`/`running`, which are already queued).
2. For each: re-introspect against the warehouse — does the index
   exist on the new target table?
   - Yes (the transform used an atomic-rename strategy that preserved
     indexes) → leave as-is.
   - No (drop+create strategy wiped it) → set `status = 'pending'`,
     submit a `quick-task` to recreate it.
3. Failures are non-fatal: the transform run already succeeded; we log
   and surface in the table indexes view.

Skipping rows with `status = 'dropped'` means an explicit user drop
sticks across transform re-runs. (User wanted index, ran transform,
dropped index → next transform run should NOT resurrect it.)

---

## Frontend plan

Two surfaces:

### 1. Tabs in `TableSection`

`frontend/src/metabase/metadata/components/TableSection/TableSection.tsx`
is currently a single-view panel. Wrap the current content in a Mantine
`Tabs` with two tabs: **Columns** (existing) and **Indexes** (new).

When `driver_supported = false`, render an `Indexes` tab placeholder:
"Index management is only available for Postgres tables in this release."

### 2. `IndexesPanel` component

- **List view** — table of indexes from `GET /indexes`. Columns: name,
  columns (key + INCLUDE), method, unique, status pill, actions. Badge
  for `managed_by_metabase`. Rows where `managed_by_metabase = false`
  show no actions.
- **Create modal** — two inner tabs:
  - *Structured*: form binding `IndexStructured`. On every change, debounced
    call to `POST /preview` to render the SQL preview.
  - *Raw SQL*: textarea, pre-fillable from the structured form ("switch
    to raw" copies the preview output in).
- **Edit modal** — same as Create but pre-populated from the request's
  `statement` / `structured` JSON.
- **Drop confirm** — simple confirm dialog, `DELETE /requests/:id`.
- **Polling hook** — `useIndexRequestStatus(requestId)` runs a 2s
  `setInterval` while status is `pending` or `running`, calls
  `GET /requests/:id`, stops on terminal status.

The existing `TargetIndexesSection.tsx` (~270 lines) on the optimizer
branch is a useful layout reference but is wedded to the optimizer flow
— we won't import it directly.

---

## Parallelisation plan

| Track | First deliverable | Unblocks |
|---|---|---|
| **BE-1** | Lift the 4 optimizer files into `warehouse_index_manager`. Add migration + `IndexRequest` model. | BE-2, BE-3 |
| **BE-2** | `GET /indexes` + `POST /preview` (no async needed). | FE-1 against real endpoints |
| **BE-3** | `POST /indexes`, `GET /requests/:id`, `DELETE`, `PUT` + `quick-task` wiring. | FE-2 |
| **BE-4** | `:event/transform-run-complete` subscriber + replay. | independent; can ship last |
| **FE-1** | `IndexesPanel` skeleton + tabs in `TableSection` + read-only list view. **Stub endpoints with fixtures** so FE can start before BE-2 lands. | — |
| **FE-2** | Create/Edit/Drop UI; polling loop; structured form + live `/preview`. | depends on BE-3 for E2E |

FE-1 starts immediately against the contracts above; BE-1 + BE-2 ship in
parallel without blocking BE-3.

---

## Out of scope (MVP)

- Drivers other than Postgres.
- Partial / expression / operator-class indexes (use raw SQL fallback).
- Data-permission–based gating (superuser only for now).
- Dropping indexes that exist in the warehouse but have no
  `IndexRequest` row.
- A queue/throttling layer — `quick-task` is fire-and-forget; if the
  user kicks off 50 of them on the same table, we'll let them all run.
- Audit-log entries for create/edit/drop (likely cheap to add later).
