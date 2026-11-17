---
name: model-rules
description: Where a rule about a Toucan 2 model lives and how to write it. Hooks hold invariants that do not depend on the user, `mi/can-*?` methods hold per-user rules, write paths call `api/*-check` and publish events. Use when adding or changing a model, a hook, a permission check, an endpoint or tool that writes a model, a cascade, or archiving. Preloaded by every `*-backend-expert` agent.
---

# Model rules

Every writer of a `:model/X` row goes through the model: REST endpoints, MCP and Metabot tools, the Agent API,
revision revert, SerDes import, remote-sync pull, sync, tasks. Hooks run for all of them; only some ask a permission
question. So a rule lives where every writer that must obey it meets it.

Copy `metabase.segments.models.segment` (hooks, derived column, permissions) and
`metabase.collections.models.collection` (cascade, archiving). `src/metabase/segments/rest/api.clj` is the endpoint
shape.

## Pick the home for a rule

| The rule | Home |
|---|---|
| Depends on who is acting | `:can_read` / `:can_write` / `:can_query` hydration, `mi/can-create?`, `mi/can-update?` |
| Depends only on the row | `before-insert` and `before-update` |
| Computes a column from other columns of the row | hooks; the caller does not supply it |
| Reads another entity's column that cannot change | hooks of the referring model |
| Reads another entity's column that can change | freeze it, cascade from it, or check at use (below) |
| Keeps other rows in step (cascade, cleanup) | `before-update` / `before-delete` of the model whose change causes it |
| Shapes a request (required key, friendly message, status order) | the write function or endpoint |
| Can only be known when the entity is used | the code that uses it |

A rule is an invariant only if every stored row and every sanctioned writer satisfies it. Either a data migration
makes stored rows satisfy it (rename duplicates, rewrite a legacy shape), or it is a request check on the write path
and not a hook: stored rows, e2e fixtures and SerDes import of old content must keep working. If a sanctioned writer
must write through it (remote-sync pull on a read-only instance, the audit loader), it is a permission check.

## Hooks

Stock Toucan hooks, one per model and operation (a second definition replaces the first):
`t2/define-before-insert`, `t2/define-before-update`, `t2/define-before-delete`.

```clojure
(t2/define-before-update :model/Segment
  [{:keys [id definition] :as segment}]
  (let [changes (t2/changes segment)]
    (when (contains? changes :creator_id)
      (throw (ex-info (tru "You cannot update the creator_id of a Segment.") {:status-code 400})))
    (when (contains? changes :definition)
      (check-definition definition))
    (cond-> segment
      (contains? changes :definition) (assoc :table_id (definition-table-id definition)))))
```

- Checks first, as a flat list of `(when ...)` that throw `(ex-info (tru "...") {:status-code 400})`; then
  derivations; then cascades, which see the derived values; return the row. A key `assoc`ed onto the returned row
  is written.
- The hook is where an allowed value set (an enum column) is enforced; the request schema repeats it for the message.
- `before-update` receives the stored row with the changes merged in. `(t2/changes row)` holds only columns whose
  value differs from the stored one, and `(t2/original row)` the stored row as `after-select` returned it. Run a
  check only when a column it guards is in the changes; never validate a stored combination the write does not touch.
- Never read the current user: no `api/*current-user-id*`, `api/*is-superuser?*`, `mi/superuser?`, or permission
  call. Never ask who the writer is: there is no deserializing flag.
- Hold an invariant whatever the premium token says. A `defenterprise` an invariant calls is `:feature :none`.
- A hook may read another row through a `<module>.db` function. It sees stored rows, not the other rows of its own
  statement, so a writer whose rows depend on each other writes them in separate statements, dependency first.
- A check that needs the row's id (cycle detection) runs in `before-update` only.
- Name helpers for what they return and `assoc` the result in the hook. `with-` is for macros only.
- Publish no event and record no revision in a hook.

**Derived column.** Never trusted from the caller: compute and overwrite on insert; recompute when its source
changes; a change to it alone is a 400; leave it out of the request schema. A column derived only in some states
(a model's `display` is `:table`) is overwritten in that state and the caller's otherwise.

**Frozen column.** `(when (contains? changes :table_id) (throw ...))`. Freezing the column on the referred entity is
the first choice for a rule on another entity: `table_id` on Field, `db_id` on Table, `namespace` on Collection.

**Query column.** `lib-be/transform-query` in `t2/deftransforms`, as Card's `dataset_query`. Written values are full
queries. A legacy stored shape is rewritten by a data migration, never by `after-select`.

**Rule over several rows.** Uniqueness needs a unique index, added after a changeset that renames existing
duplicates (" (2)", " (3)"); decide what a NULL parent means, since an index treats NULLs as distinct. A hook check
may add the 400 message; the index is the enforcement. A test that provokes the index inside `mt/with-temp`
wraps the write in `t2/with-transaction`, or Postgres aborts the test's transaction.

**Cascade.** The hook of the model whose change causes it writes the followers through their models, so their hooks
run and may refuse. `before-update` runs before Toucan opens its transaction: a model whose update hook writes other
rows declares `(mi/define-update-in-transaction :model/X)`. Trigger on the column that causes the change.

**Rule on another entity's mutable data.** In this order: freeze the column; cascade from the other entity's hook
(archived, deleted, moved, deactivated); check where the entity is used. Do not check every direction at write time.

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
- `can-update?` starts with `(mi/can-write? row)` and adds what depends on the change: write access to the collection
  or table the row moves to, a superuser-only column (`(mi/superuser?)`), a sandbox restriction. `changes` may repeat
  stored values, so test a column with `(api/column-will-change? (:col row) (get changes :col ::api/not-provided))`.
  `can-create?` and `can-update?` share a private predicate; neither calls the other. Both return a boolean and
  never throw to refuse.
- A row no writer may change (an audit collection, a built-in group) is refused by one predicate in the hook, and
  the same predicate makes `:can_write` false so the UI can show it.
- `api/read-check` and `api/write-check` take the row (or model and id), throw 404 for nil and 403 when refused, and
  return the row. `api/create-check` and `api/update-check` throw 403. All four publish a permission-failure event.

## Write paths

An endpoint or tool: parse the request, load the row with `api/check-404`, call `api/update-check` with the changes
(or `api/create-check` with the whole new row, not only its collection), call the write function, return the
hydrated row. The write function is the one function per operation that every user-facing writer of the model shares
(`dashboards.write/update-dashboard!`, `transforms.crud/update-transform!`); with a single REST writer it is the
endpoint's own helper.

- Every user-facing writer of a model calls the check: REST, MCP and Metabot tools, Agent API, bulk endpoints,
  revision revert, copy. Grep for the model's `update-...!` and `t2/update! :model/X` callers when adding a rule.
- A bulk endpoint hydrates `:can_write` on all rows once, then checks each.
- The write function publishes the events (`events/publish-event!`) and so the audit and revision rows. SerDes and
  remote sync call no write function and publish nothing.
- The caller sets provenance (`creator_id`); a hook may forbid changing it.
- The request schema is closed and lists only what a caller may set: no derived columns, no `archived_directly`.
- App-DB queries live in `<module>.db`, with caller-supplied values bound: `(t2/select-one :model/X :id [:auto/param id])`.
- A changeset follows the `app-db-migrations` skill.

## Archiving

`(t2/update! :model/X :id id {:archived true})` does everything, for every writer. No archive logic in endpoints.

- `archived` is the state; `archived_directly` is the cause: true when archived on its own, false when it follows a
  parent. In `before-update`, when `archived` changes: `(assoc row :archived_directly (mi/archived-directly row))`,
  which keeps a cause the write gives and otherwise takes the new `archived`.
- A cascade writes followers with `:archived_directly false` inside `(mi/with-archived-cause-given ...)`: on archive
  the rows not yet archived, on restore the rows not archived directly.
- Collection archives its subtree in a fixed number of statements; a collection that inherits an archive does not
  cascade again. Dashboard carries its dashboard questions, Document its cards, Timeline its events (a follower
  without `archived_directly` always follows).
- A live row cannot be inserted into or moved into an archived parent
  (`collection/check-collection-not-archived`), checked only when the parent changes.
- The subtree write permission is `mi/can-update?` on the Collection.

## Lay out a model file

Headers in this order: model setup (`t2/table-name`, `t2/deftransforms`, `derive`), `Hooks`, `Permissions`,
`Hydration`, `Serialization` (spec, import dependencies, storage paths), `Remote sync`, `Search`.

## Tests

- One `with-temp` default per model in `with-temp-defaults-fns` (`test/metabase/test/util.clj`) that passes its
  hooks. A fixture overrides a column only when the test depends on it. Build queries with `metabase.lib`.
- Test a hook through `t2/insert!` / `t2/update!`: the rejection, the derivation, the cascade. Test a permission
  rule through `api/create-check` / `api/update-check` as each kind of user, and once through the endpoint.
- Before moving a per-user rule, pin today's answers in a user-by-change table test on the unmodified code.
- Assert a list endpoint stays batched with `t2/with-call-count` at two sizes.
- A new model or column breaks the enumeration tests (entity ids, serdes specs, stats): run them.

## Before handing off

`./bin/mage kondo <file>` per changed file, `./bin/mage fix-modules-config`, `./bin/mage lint-migrations` for a
changeset, and the test namespaces of the model and of each writer you touched.
