---
name: backend-worktree-rules
description: Rules for remote sync worktrees in the app DB. Covers which tables get `worktree_id`, the foreign keys, unique keys and worktree schema views that keep a worktree's rows together on PostgreSQL, and which worktree a Quartz job, a background thread, or a Table or Field write runs in. Use when adding or changing an app DB table, column, foreign key, unique key or upsert, a Quartz job, work handed to another thread, or a Table or Field write. Preloaded by every `*-backend-expert` agent.
---

# Remote sync worktrees

A worktree is a checkout of a remote sync branch whose content lives in the same tables as the main app. Rows tell
worktrees apart by `worktree_id`, which references `remote_sync_worktree`. Worktree 1 is the default worktree, the
main app. Its `remote_sync_worktree` row never changes, and the worktree API never lists it.

- Worktrees exist only on PostgreSQL, the only app DB with `worktree_id` and `core_user.current_worktree_id`. H2 and
  MySQL keep the schema they had: on MySQL 9, altering `core_user` makes later Database deletes exceed the foreign
  key cascade limit. Code that names either column checks `(mdb/worktrees-supported?)` first.
- While a worktree exists, the `worktree` schema has a view named like each table with `worktree_id`, which shows a connection only the rows of
  its worktree and refuses a write of another worktree's row (`WITH CASCADED CHECK OPTION`), and like each view of
  `public`, defined over those views. The app DB connections of the main app and the worktrees set `search_path` to
  `worktree, public`, so that other names, and every name while no worktree exists, resolve to `public`; a worktree's
  also names the worktree, which new rows default to. A connection in `{:type :all}`, as
  migrations use, keeps `search_path` at `public` and sees the tables.
- `metabase.app-db.worktree` keeps the schema: creating the first worktree creates it with its views, deleting the
  last drops it, and while it exists, startup recreates the views from the tables and views of `public` after the
  migrations. Before a migration run that changes the schema, the app drops the schema in the migration's transaction, so that a migration can drop or change a column the views read. Migrations need nothing for
  it, and DDL outside migrations runs in `{:type :all}`, since an unqualified `CREATE TABLE` on a worktree connection
  lands in the `worktree` schema.
- Toucan leaves `worktree_id` out of every model's rows (`metabase.models.interface`). Model code never reads or
  writes it, and no model or API schema lists it. Raw SQL names it in two cases: an upsert on a worktree table puts
  it last in its `ON CONFLICT` target, since every unique key ends with it on PostgreSQL, and the app DB copy drops
  the rows of other worktrees by it.
- Code that needs the set of worktree tables reads the tables of `public` with a `worktree_id` column. There is no
  marker on models.

## Which tables get `worktree_id`

A table gets the column when it can reach content remote sync syncs:

1. the table of a synced model;
2. a table with a foreign key to a table that has the column, transitively;
3. the table of a model with a column ending in `_id` that is not a foreign key (a loose reference such as `model` +
   `model_id` or `entity_type` + `entity_id`), other than the table's own `entity_id` NanoID.

The tables and columns that existed before `2026/20261123_remote_sync_worktrees.yaml` are approved as they are.
`worktree-rules-for-later-columns-test` in `metabase.app-db.schema-migrations-test` checks those added from that
migration on: an `_id` column that is a foreign key to a table with `worktree_id`, or a loose reference, needs
`worktree_id` on its table, or an entry in `worktree-unscoped-columns` when it only refers to users, tenants, sessions,
warehouse metadata or other such rows. Warehouse metadata (`metabase_database`, `metabase_table`,
`metabase_field`), users, groups and settings have no `worktree_id`.

## Adding the column

In a changeset with `dbms: postgresql`, copying the lines of
`resources/migrations/2026/20261123_remote_sync_worktrees.yaml`:

- `worktree_id INTEGER NOT NULL DEFAULT 1`, with a foreign key `fk_<table>_worktree_id` to `remote_sync_worktree (id)`
  `ON DELETE CASCADE`, but for a log of what people and jobs did (`audit_log`, `data_test_run`, `query_execution`,
  `source_replacement_run`, `task_history`, `task_run`, `test_suite_run`, `transform_dag_run`, `transform_job_run`,
  `transform_run`, `view_log`), whose rows outlive the worktree, hidden by the view;

- `ALTER COLUMN worktree_id SET DEFAULT GREATEST(metabase_worktree_id(), 1)`, set after adding the column with the
  constant default, so the table is not rewritten;
- `CREATE INDEX idx_<table>_worktree_id ON <table> (worktree_id)`, for the cascade; a full index, since the foreign
  key triggers may run a generic plan that a partial one would not serve;
- the keys below.

The worktree schema picks up the table and its new column when the app recreates it after the migration.

## Foreign keys between two worktree tables (PostgreSQL)

Keep the plain foreign key, and add a composite one over the reference and the worktree. The parent needs
`UNIQUE (id, worktree_id)`.

| Plain foreign key                       | Composite foreign key `(x_id, worktree_id) REFERENCES parent (id, worktree_id)` |
|-----------------------------------------|---------------------------------------------------------------------------------|
| `ON DELETE CASCADE`                     | `ON DELETE CASCADE`                                                             |
| `ON DELETE SET NULL` (nullable column)  | `DEFERRABLE INITIALLY DEFERRED`                                                 |
| no action                               | no action                                                                       |

```sql
-- transform_run.transform_id
FOREIGN KEY (transform_id) REFERENCES transform (id) ON DELETE SET NULL,
FOREIGN KEY (transform_id, worktree_id) REFERENCES transform (id, worktree_id) DEFERRABLE INITIALLY DEFERRED
```

`SET NULL` can't be the composite key's action, because it would null `worktree_id`. Two foreign keys over one
column are checked in no fixed order, so the composite key that can't share the action is checked at commit, after
the plain one has set the reference to null.

A foreign key to a table without `worktree_id` stays plain. Such a reference may point at a main-app row.

## Unique keys (PostgreSQL)

Every unique key of a worktree table except the primary key ends with `worktree_id`. A worktree's copy of a row
repeats its `entity_id`, name or path.

## Thread scope

`metabase.app-db.worktree/*scope*` (`{:type :main}` by default, `{:type :worktree :worktree-id n}`, or
`{:type :all}`) picks the rows a thread's app DB connections see, applied when a connection is checked out; a
connection an open transaction holds keeps its scope. Bind it with `mdb/with-worktree-scope`.

- Only superusers on PostgreSQL work in a worktree (`metabase.server.middleware.worktree`).
- Work handed to another thread (batch processing, the message queue, notification workers) carries the scope of the
  thread that queued it.
- `{:type :all}` is for reading, updating or deleting rows by id across worktrees, as run heartbeats do, and for
  setup and data migrations: a row inserted in it lands in the main app, whatever it refers to.
- A cache of worktree rows memoizes with `mdb/memoize-for-application-db`, which keys on the scope; a cache of what
  every worktree shares, such as settings, with `mdb/memoize-across-worktrees`.
- Table and Field rows belong to the main app. The worktree schema's `metabase_table` and `metabase_field` overlay
  them with the user settings of the connection's worktree (`v_worktree_table`, `v_worktree_field`), and an
  `INSTEAD OF` trigger writes the columns a statement changes onto the stored row, so their write functions write the
  main app's rows also inside a worktree's open transaction, as an import does. The overlay cannot be locked with
  `FOR UPDATE`.
- A periodic thread outside Quartz that writes worktree rows, such as the transform cancel poller or the change log
  numbering, first reads once in `{:type :all}` whether any worktree has work, and only then calls
  `mdb/do-in-each-worktree`: each check-out in a worktree runs a statement, which an idle tick should not pay for.
- The worktree schema has views of partitioned tables, not of their partitions: a query that names a partition sees
  the rows of every worktree. Only partition upkeep (`metabase.audit-app.task.partitions`), which runs in
  `{:type :all}`, names partitions; any other query names the partitioned table.

## Quartz jobs

A job runs in the main app unless its `defjob` options say otherwise.

- `:worktree-scope :each` runs the job body in the main app, then once in each other worktree. The ids come from
  `remote_sync_worktree`, which has no `worktree_id`. Use it for jobs that insert worktree rows (dependency analysis,
  result metadata) or repair the state of runs a worktree can start (transform cancelation and timeouts, replacement
  timeouts, the run tracking reaper).
- Retention jobs that only delete old rows stay in the main app: a worktree's rows go when the worktree is deleted.
- Scheduled user content (alerts, subscriptions, transform jobs) runs only in the main app. Manual runs and "send
  now" work in a worktree.
