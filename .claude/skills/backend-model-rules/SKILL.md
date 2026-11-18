---
name: backend-model-rules
description: Where a rule about a Toucan 2 model lives and how to write it. Hooks hold invariants that do not depend on the user, `mi/can-*?` methods hold per-user rules, write paths call `api/*-check` and open a batch of writes. Use when adding or changing a model, a hook, a permission check, an endpoint or tool that writes a model, a cascade, or archiving. Preloaded by every `*-backend-expert` agent.
---

# Model rules

Every writer of a `:model/X` row goes through the model: REST endpoints, MCP and Metabot tools, the Agent API,
revision revert, and the sanctioned writers, which the product itself runs without a user (SerDes import, remote-sync
pull, sync, the audit and sample loaders, scheduled tasks). Hooks run for every writer; permission checks run only for
the user-facing ones. Put a rule every writer must obey in a hook and a rule only users must obey in a permission check.

## Pick the home for a rule

| The rule | Home |
|---|---|
| Depends on who is acting | `:can_read` / `:can_write` / `:can_query` hydration, `mi/can-create?`, `mi/can-update?` |
| Answered from the incoming row alone: type, length, range, enum, format, JSON shape, columns that must agree (`:multi` on a type column, `[:fn pred]`) | the entity schema in `<module>.schema`, which the API request schema and the SerDes spec `:schema` are built from; never a hook |
| Needs the database or the stored row (`t2/changes`, `t2/original`) | `before-insert` and `before-update` |
| Computes a column from other columns of the row | hooks; the caller does not supply it |
| Reads another entity's column that cannot change | hooks of the referring model |
| Reads another entity's column that can change | freeze it, cascade from it, or check at use (below) |
| Keeps other rows in step (cascade, cleanup) | the model whose change causes it: `mi/after-archived-change` for `archived`, else `before-update` / `before-delete` |
| Shapes a request (required key, friendly message, status order) | the write function or endpoint |

A rule is an invariant only if every stored row satisfies it and no sanctioned writer needs an exception. If stored
rows break it, a data migration fixes them first (rename duplicates, rewrite a legacy shape) or the rule is a request
check on the write path. If a sanctioned writer must be exempt (remote-sync pull on a read-only instance, the audit
loader), the rule is a permission check.

## Hooks

Stock Toucan hooks, one per model and operation (a second definition replaces the first): `t2/define-before-insert`,
`t2/define-before-update`, `t2/define-before-delete`, and `t2/define-after-insert` / `t2/define-after-update` for work
that needs the row as stored.

- Checks first, a flat list of `(when ...)` throwing `(ex-info (tru "...") {:status-code 400})`; then derivations;
  then cascades, which see the derived values; return the row. A key `assoc`ed onto the returned row is written. A
  hook never checks what the incoming row alone answers (length, enum, format, agreeing columns): the schema does.
- `before-update` receives the stored row with the changes merged in. `(t2/changes row)` holds only columns whose
  value differs from the stored one, and `(t2/original row)` the stored row as `after-select` returned it. Run a
  check only when a column it guards is in the changes; never validate a stored combination the write does not touch.
- Never read the current user (`api/*current-user-id*`, `mi/superuser?`, a permission call) or branch on which writer
  is calling (SerDes import, sync, an endpoint).
- Hold an invariant whatever the premium token says: a `defenterprise` function a hook calls is `:feature :none`.
- A hook may read another row through a `<module>.db` function. It sees stored rows, not those of its own statement,
  so a writer whose rows depend on each other writes them in separate statements, dependency first. A check that
  needs the row's id (cycle detection) runs in `before-update` only.
- Publish no event and record nothing in a model's own hook: consumers react to its lifecycle events (see Events).
- **Derived column.** Never trusted from the caller: compute and overwrite on insert; recompute when its source
  changes; a change to it alone is a 400; leave it out of the request schema. A column derived only in some states
  (a model's `display` is `:table`) is overwritten in those states and keeps the caller's value in the others.
- **Frozen column.** A column no update may change: `(when (contains? changes :table_id) (throw ...))`. It is the first
  choice for a rule on another entity: `table_id` on Field, `db_id` on Table, `namespace` on Collection.
- **Query column.** `lib-be/transform-query` in `t2/deftransforms`, as Card's `dataset_query`. Written values are full
  queries. A legacy stored shape is rewritten by a data migration, never by `after-select`.
- **Rule over several rows.** Uniqueness needs a unique index, added after a changeset that renames existing
  duplicates (" (2)", " (3)"); decide what a NULL parent means, since an index treats NULLs as distinct. A hook check
  may add the 400 message; the index is the enforcement.
- **Cascade.** The model whose change causes it writes the followers through their models, so their hooks run and may
  refuse: in `mi/after-archived-change` when it follows `archived` (see Archiving), else in `before-update` or
  `before-delete`, only when the causing column is in `(t2/changes row)`. `before-update` runs before Toucan opens its
  transaction, so a model whose update writes other rows declares `(mi/define-update-in-transaction :model/X)`.
- **Rule on another entity's mutable data.** In this order: freeze the column; cascade from the other entity (archived,
  deleted, moved, deactivated); check where the entity is used. Do not check the same rule in the hooks of both.

## Permissions

| Question | Asked with | Answered by |
|---|---|---|
| May the user see this row | `(mi/can-read? row)`, `api/read-check` | `t2/batched-hydrate [:model/X :can_read]`, stored in the row's metadata |
| May the user change this row | `(mi/can-write? row)`, `api/write-check` | `t2/batched-hydrate [:model/X :can_write]`, a key of the row |
| May the user run queries on it | `(mi/can-query? row)`, `api/query-check` | `:can_query` hydration (Table, Database) |
| May the user create this | `(api/create-check :model/X new-row)` | `(defmethod mi/can-create? :model/X [_model row])` |
| May the user apply these changes | `(api/update-check row changes)` | `(defmethod mi/can-update? :model/X [row changes])` |

- `mi/can-read?`, `can-write?` and `can-query?` read the hydrated answer and throw when it is missing. For a list,
  `(mi/readable rows)` and `(mi/writable rows)` hydrate once and filter.
- A hydration answers a whole list in a fixed number of queries: load the parents (tables, collections) once.
- `can-update?` answers the whole question: it calls `(mi/can-write? row)` itself and adds what depends on the change
  (write access to the collection or table the row moves to, a superuser-only column with `(mi/superuser?)`, a sandbox
  restriction). Only two changes need no write access, each a named predicate: the public link of a Dashboard or Card,
  for a settings manager, and unsynced columns on a read-only remote-sync instance. `changes` may repeat stored values,
  so test a column with `(api/column-will-change? (:col row) (get changes :col ::api/not-provided))`.
- A rule `can-create?` and `can-update?` both apply is one private predicate. Both return a boolean and never throw.
- A row no writer may change (a built-in permissions group) is refused by one hook predicate, which also makes
  `:can_write` false so the UI can show it.
- `api/read-check` and `api/write-check` take the row (or model and id), throw 404 for nil and 403 when refused, and
  return the row. `api/create-check` and `api/update-check` throw 403. All four publish a permission-failure event.

## Write paths

An endpoint or tool: parse the request, load the row with `api/check-404`, call `api/update-check` with the changes
(or `api/create-check` with the whole new row, not only its collection), write, return the hydrated row.

- A write through the model (`t2/insert!`, `t2/update!`, `t2/delete!` on `:model/X`, with or without a where clause) is
  complete wherever it is called, also from a plain function in `<module>/db.clj`: the hooks enforce the rules and
  `:hook/events` publishes the lifecycle events. A shared write function is a convenience, not a requirement.
- A statement that bypasses the model (`t2/query` with hand-written SQL, a write against a table-name keyword) runs
  no hooks and publishes nothing; do not write that way.
- The caller's job: the per-user check at every user-facing writer (REST, MCP and Metabot tools, Agent API, bulk,
  revert, copy; a bulk endpoint hydrates `:can_write` once); `events/with-batched-events` around a write of several rows
  of one aggregate, so its reactions happen once per owner (nothing on a throw; nested batches join); and
  `events/with-event-context` for what the write's records need.
- Nobody publishes a lifecycle event by hand. A model that publishes derives `:hook/events` and implements `events/spec`,
  `{operation topic}` with full keywords, which may omit an operation; every write then publishes in its transaction.
  The topic is named after the model (`:event/pulse-update`); the audit consumer chooses the topic it stores. A moment
  that is a column change (public link, publish) is derived by its consumer with `u.events/changed?`; only a moment that
  is no row write (login, read, sync begin, transform run, user invited) is published by hand.

## Events

- The payload is `{:object <after> :previous-object <before> :user-id <current user or nil> :context {...}}`
  (`::events.schema/lifecycle`): a create has `:object` only, a delete `:previous-object` only. Compare columns with
  `u.events/changed?`, `changed-any?` and `changed-keys` (`metabase.util.events`): a merged batch has no "changes".
- `events/with-event-context` keys: `:revision-message` (message of the revisions), `:reverting?` (a revert's writes),
  `:details` (a map the audit row of some models takes), `:archived-with` (`[model id]` of the archive that carried the row).
- A consumer lives in `<module>/events.clj` or `<module>/events/<topic>.clj`, required from `init.clj`, as a
  `methodical/defmethod events/publish-event!` on a topic it derives; `events/register-owned-consumer!` gives it one
  call per owner per batch (`{:last? true}` runs it after the others). A sink (`events/register-sink!`,
  `events/add-to-sink!`) collects items such as audit rows and flushes them once at the end of the batch.
- `events/register-capture!` (a DELETE's events, after its before-delete hooks) and `register-statement-capture!` (its
  rows, before them) run once per DELETE statement to read rows `ON DELETE CASCADE` removes, for the handler's `:captures`.
- Delivery runs in the write's transaction, so a consumer that throws fails the write. Work that needs committed rows
  goes in `mdb/do-after-commit`; effects that leave the transaction run after it (the explicit initial sync of the
  database API, `quick-task`s).
- Upkeep (subscription sync, persisted models, driver pools, personal collections, session revoke, dependency marks)
  runs for every writer; a writer calls what only it starts (`sync/start-initial-sync!`). Records (revision, audit
  row) need a non-nil `:user-id`, and archive-carried writes (`:archived-with`) record nothing.
- A user's update of an audited model always records an audit row; only a consumer's `ignored-columns` (`{:default #{..}
  :model/X #{..}}` in its `events.clj`, plus a comparator when membership is not enough) and archive-carried writes do
  not. A write the product makes in a user's request is no user action: list its columns there, or bind
  `api/*current-user-id*` to nil.
- The SerDes import validates every entity against its spec `:schema` (the strict write variant of the entity schema);
  `serialization-skip-schema-validation` only normalizes. An import started by a user records as that user's edits.
- The request schema is closed and lists only what a caller may set: no derived columns, no `archived_directly`.
- Entity schemas have a strict write variant (closed, what a caller may set) and a tolerant stored-row variant (what
  `after-select` returns, including legacy shapes); the request schema and the SerDes spec use the write variant.

## Archiving

`(t2/update! :model/X :id id {:archived true})` does everything, for every writer. No archive logic in endpoints.

- `archived` is the state; `archived_directly` is the cause: true when archived on its own, false when it follows a
  parent. In `before-update`, when `archived` changes:
  `(assoc row :archived_directly (mi/archived-directly row parent-archived?))`; `parent-archived?` is a function of no
  arguments returning whether the parent is archived (its Collection, `collection/archived?`; for a Card also its
  Dashboard or Document, for a Document also its Exploration). A cause given in the changes is kept; a restore is false.
- The parent is written first and the followers after it, in the same transaction and one event batch: a model with
  followers declares `(mi/define-update-in-transaction :model/X)` and a
  `(defmethod mi/after-archived-change :model/X [model rows changes])` that writes them through their models, one
  statement per kind. The followers find their parent archived and derive their cause from it.
- Collection archives its subtree in a fixed number of statements and does not cascade again when it inherits an
  archive. Dashboard carries its dashboard questions, Document its cards, Timeline its events (only on its own archive).
- A live row cannot be inserted or moved into an archived parent (`collection/check-collection-not-archived`).
- A user-facing writer asks `api/update-check` on the parent with `{:archived x}`: its `mi/can-update?` covers every row
  the cascade writes, each kind loaded and answered once (`mi/can-update-followers?`, by default `can-update-each?`).
  A sandbox restriction belongs to `can-update?`, never to hooks. An owned part no user writes (a Summary's Document
  and Cards) answers an archive-only change at its owner; a carried snippet asks only the sandbox guard.

## Lay out a model file

Banners `;;; ---- Hooks ----`, centred in a line of about 120 columns, in this order: `Model setup`, `Hooks`, `Permissions`,
`Hydration`, `Writes`, `Revisions`, `Serialization`, `Remote sync`, `Search`.

The `Serialization` section holds only `(defmethod serialization/spec :model/X ...)`, a literal map whose fns are
references (keys in the `metabase.serialization.spec` docstring). The model's own SerDes fns live in
`<module>.serialization`, which the model file requires and never the reverse; its app-DB queries stay in `<module>.db`.

## Tests

- One `with-temp` default per model in `with-temp-defaults-fns` that passes its hooks; a fixture overrides a column only
  when the test depends on it. Build queries with `metabase.lib`.
- Test a hook through `t2/insert!` / `t2/update!`; a permission rule through `api/create-check` / `api/update-check` as
  each kind of user; an event consumer by writing the row, not by publishing the event; a list endpoint with
  `t2/with-call-count` at two sizes. Run the enumeration tests (entity ids, SerDes specs, stats) for a new model.
Before handing off: `./bin/mage kondo <file>`, `./bin/mage fix-modules-config`, and the tests of each writer you touched.
