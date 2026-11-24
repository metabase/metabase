---
name: backend-worktree-rules
description: Rules for remote sync worktrees in the app DB. Covers which tables get `worktree_id`, its foreign and unique keys, the `:hook/worktree-id` model trait, upserts, and the coverage test. Use when adding or changing an app DB table, column, foreign key, unique key or upsert, or a model of a table with `worktree_id`. Preloaded by every `*-backend-expert` agent.
---

# Remote sync worktrees

A worktree is a checkout of a remote sync branch whose content lives in the same tables as the main app, told apart
by `worktree_id` → `remote_sync_worktree (id)`. Worktree 1, `mdb/default-worktree-id`, is the main app. The schema is
the same on H2, PostgreSQL and MySQL/MariaDB.

## Which tables get `worktree_id`

`metabase.app-db.worktree-test` decides every app DB table, each test with its own list:

1. the tables of synced models (`remote-sync/synced-models`) have `worktree_id` and their models derive
   `:hook/worktree-id`;
2. every other table that reaches one of them through a chain of foreign keys does too, but for its allowlist
   (`metabot_prompt`: Metabot tables stay unscoped);
3. every remaining table has an explicit decision: `:scoped` (column and hook, e.g. logs and polymorphic references
   to content such as `revision` or `view_log`), `:unscoped` (neither, e.g. warehouse metadata, users, groups,
   settings, Metabot, tenants, transform jobs), or `:worktree-reference` (the column without the hook,
   `remote_sync_worktree_user`, where it is the user's checkout).

A new table fails the test until it lands in one of these, so decide in the same change.

## Adding the column

Follow `resources/migrations/2026/20261126_remote_sync_worktrees.yaml`, which works on every app DB:

- `worktree_id INTEGER DEFAULT 1 NOT NULL`;
- `idx_<table>_worktree_id`, created before the foreign key so that MySQL makes no index of its own;
- `fk_<table>_worktree_id` → `remote_sync_worktree (id)` `ON DELETE CASCADE`; logs whose rows outlive the worktree
  (`audit_log`, `data_test_run`, `query_execution`, `source_replacement_run`, `task_history`, `task_run`,
  `test_suite_run`, `transform_dag_run`, `transform_run`, `view_log`) get no foreign key;
- every constraint and index named explicitly (`uq_`, `fk_`, `idx_`), at most 63 characters.

## Keys

A `NOT NULL` reference between two worktree tables keeps its plain foreign key and adds a composite one, with the same
delete action, `worktree_id` first (InnoDB drops a foreign key's own index when another index starts with its column):

```sql
ALTER TABLE report_dashboard ADD CONSTRAINT uq_report_dashboard_worktree_id_id UNIQUE (worktree_id, id);
CREATE INDEX idx_dashboard_tab_dashboard_wt ON dashboard_tab (worktree_id, dashboard_id);
ALTER TABLE dashboard_tab ADD CONSTRAINT fk_dashboard_tab_dashboard_wt
  FOREIGN KEY (worktree_id, dashboard_id) REFERENCES report_dashboard (worktree_id, id) ON DELETE CASCADE;
```

A nullable reference, or one to a table without `worktree_id`, keeps only its plain foreign key.

Every unique key but the primary key ends with `worktree_id`, since a worktree's copy repeats `entity_id`, names and
paths. On H2 a key made with its table has a generated name: drop it with `EXECUTE IMMEDIATE` over
`INFORMATION_SCHEMA`.

## Models and upserts

A model of a table with `worktree_id` derives `:hook/worktree-id` (`metabase.models.interface`): an insert sets
`worktree_id` (callers never pass it), an update that changes it throws, and rows read through the model leave it out,
so no model or API schema lists it. A table with `worktree_id` and no model gets one in `<module>/models/<table>.clj`.

A raw upsert runs no hook: it lists `worktree_id` among its key columns (`ON CONFLICT` names the whole unique key) and
sets it in the row.

## Scope and sandbox

`metabase.app-db.worktree/*scope*` is the worktree a thread works in: `{:type :main}` by default,
`{:type :worktree :worktree-id n}`, or `{:type :all}`. Bind it with `mdb/with-worktree-scope`; requests bind it from
`remote_sync_worktree_user` or the `X-Metabase-Worktree-Id` header, and `{:type :all}` while no worktree but the
default one exists. Setup, migrations and the app DB copy run in `{:type :all}`.

Every Honey SQL query a model compiles goes through `sandbox-worktree-query` (`metabase.app-db.query`), which never
queries: it gives `funnysql/sandbox-query` a `worktree_id` row filter for each hooked table, plus, in a worktree other
than the default one, `v_worktree_table`/`v_worktree_field` in place of `metabase_table`/`metabase_field`. The sandbox
filters reads (FROM, joins, subqueries, CTEs, unions), UPDATE and DELETE, and MERGE ON/KEY, and writes the value into
inserted rows. It throws for `[:param ...]` values, a CTE named like a filtered table, an INSERT without a column list
or selecting `*`, and an upsert with RETURNING. The hooked-table list is built once by `init-worktree-tables!` in
`mdb/setup-db!`; until then queries are not filtered.
