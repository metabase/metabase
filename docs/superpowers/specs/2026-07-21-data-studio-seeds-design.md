# Data Studio Seeds — Design (POC)

Issue: https://linear.app/metabase/issue/GDGT-2869/add-a-place-for-official-csv-uploads-to-the-data-studio

## Goal

A place in Data Studio to manage **seeds**: admin-curated CSV datasets (time spines,
lookup tables, exclusion lists) that materialize as plain, stably-named warehouse
tables. Like dbt seeds: the CSV is the source of truth, the table is a derived
materialization, and (eventually) the CSV is versioned in the remote-sync git repo.

**This iteration is a POC. The goal is the look and feel of the feature**, backed by
a real-but-minimal implementation. Remote sync integration is designed for but not
built.

## Concept

A **Seed** is a first-class app-DB entity that owns the CSV and its metadata. The
warehouse table is derived state, always re-derivable from the entity. This is what
lets seeds later ride the remote-sync machinery like any other synced model (dirty
tracking, push, 3-way merge key off app-DB state).

- One seed = one CSV = one warehouse table named exactly `seed.name`.
- Plain table, no wrapping Model card. Stamped `data_source :seed`,
  `data_authority :authoritative`, `is_writable false`.
- Consumed like any other table: transforms/questions reference it by
  `(schema, name)`. No `ref()` mechanism.
- Published into the Library so it shows up as official/curated content.

## Data model

App-DB table `seed` (migration `v64.seed1`, already drafted on the branch):
`id`, `name` (unique slug, `^[a-z][a-z0-9_]*$`, is the physical table name),
`csv` (raw payload, source of truth, ≤50 MB), `csv_hash`, `table_id` (nullable FK,
the materialization on this instance), `collection_id` (Library collection),
`entity_id` (serdes identity), `last_synced_sha` + `sync_error` (sync bookkeeping),
timestamps.

## Target location

All seeds on an instance materialize into one instance-level target. POC shortcut:
the configured uploads database and uploads schema (avoids schema-creation and
permission plumbing). A dedicated `seeds` schema and a proper Data Studio setting
for db/schema come later; the repo format never encodes the database, so the same
repo can materialize on dev and prod.

## Lifecycle

- **Create** (name + CSV): validate slug + uniqueness + no physical-table collision;
  insert entity; materialize via the existing upload engine (type inference,
  `create-table!`/`insert-into!`, sync); publish into the Library.
- **Replace** (new CSV, same seed): full-refresh semantics — drop and recreate the
  table from the new CSV (POC uses drop+recreate; swap strategy later). Schema
  changes of any kind just work; the `:model/Table` row survives (same name) so
  downstream references hold.
- **Delete**: drop the warehouse table, delete the entity.
- **Download**: return the stored CSV.
- Materialization is idempotent, keyed on `csv_hash`; failures land in `sync_error`
  and surface in the UI as retryable.

## UI (the point of the POC)

Seeds section in the Library (Data Studio → Library → Seeds):

- **List page**: name, materialization status, updated at; actions per row
  (replace CSV, download, delete).
- **New seed modal**: stable-name slug input (with "dependents reference this name"
  warning) + CSV file input. Already scaffolded on the branch.
- **"Seed" entry** in the Library + New menu. Already scaffolded.
- Replace flow: modal to upload a new CSV for an existing seed.

## Permissions

CRUD gated by `check-data-analyst` (Data Studio standard). Querying the table is
ordinary data permissions on the seeds schema.

## Remote sync (designed, not built)

Register `:model/Seed` in the remote-sync spec with `:library-synced` eligibility.
Repo format: `seeds/<name>.yaml` (metadata) + `seeds/<name>.csv` sidecar (real,
diffable CSV — requires teaching the sync source layer about content sidecars).
On pull, a materialization hook re-materializes seeds whose `csv_hash` differs from
the materialized state. Git history is the version history; no in-app version
records.

## Out of scope for the POC

Remote sync integration, target-location settings UI, swap-based zero-downtime
replace, dependency-aware delete confirmation, append semantics (seeds are always
full-refresh).
