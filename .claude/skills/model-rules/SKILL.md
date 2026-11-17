---
name: model-rules
description: Where a rule about a Toucan 2 model lives. Hooks hold invariants that do not depend on the user, `mi/can-*?` methods hold per-user rules, and runtime checks hold what cannot be kept true at write time. Use when adding or changing a model, a hook, a permission check, or a check in an endpoint that guards a write. Preloaded by every `*-backend-expert` agent.
---

# Model rules

This skill decides where a rule about a `:model/X` row lives. The test for any placement is a writer that calls no
endpoint, such as SerDes import: it writes through the model, so hooks run, but it asks no permission question. A
rule that does not depend on the user and that such a writer can break is in the wrong place.

`metabase.segments.models.segment` is the reference implementation.

## Pick the home for a rule

| The rule | Home |
|---|---|
| Depends on who is acting: an admin may, another user may not | `:can_read` / `:can_write` / `:can_query` hydrations, `mi/can-create?`, `mi/can-update?` |
| Depends only on the row | `before-insert` and `before-update` |
| Computes a column from other columns of the row | hooks; the caller does not supply it |
| Reads another entity's column that cannot change | hooks of the referring model |
| Reads another entity's column that can change | see "Rules on another entity's mutable data" |
| Keeps other rows up to date (cascade, cleanup, index) | hooks of the model whose change causes it |
| Can only be known when the entity is used | the code that uses it |

An endpoint parses the request, calls the permission check, and calls the write. It holds no rule of its own.

## Hooks

- Write `before-update` as a flat list of `(when ...)` checks over `(t2/changes row)`, then return the row.
- Throw `(ex-info (tru "...") {:status-code 400})`. `api/check-400` and friends are fine too.
- Never read the current user in a hook: no `api/*current-user-id*`, `api/*is-superuser?*`, or permission call.
- Never ask who the writer is. SerDes and remote sync are writers like any other: events, audit rows and revisions
  are published by the write function a user action calls, not by a hook.
- Hold an invariant whatever the premium token says. A `defenterprise` an invariant calls is `:feature :none`.
- Run a check that reads other rows only when the column it guards changes, and only in `before-update` when the
  row needs its id for the check (cycle detection).
- Name helpers for what they return and `assoc` the result in the hook. Keep the `with-` prefix for macros.

### Hooks that read other rows

Hooks are stock `t2/define-before-insert`, `t2/define-before-update` and `t2/define-before-delete`, one per model
and operation: a second definition replaces the first. A hook may read another row, such as a Field's Table. Keep
such reads to rows that actually change the relevant column. A hook sees the stored rows, not the other rows of its
own statement, so a writer whose rows depend on each other writes them in separate statements. `before-update` runs
before Toucan opens its transaction: a write function whose update hook writes other rows wraps the update in
`t2/with-transaction`.

### Derived columns

A column computed from other columns of the row is never trusted from the caller.

- On insert, compute it and overwrite any incoming value.
- On update, recompute it when its source changes. Refuse a change to it alone with a 400.
- Leave it out of the request schema, so the API strips it.

### Query columns

A column that stores a query uses `lib-be/transform-query`, as `:model/Card` does for `dataset_query`. Every written
value is a full query. A legacy stored shape is rewritten by a data migration, never by `after-select`.

### Rules over several rows

Uniqueness and "exactly one" rules need a unique index. A hook or endpoint check may stay for the error message,
but the index is the enforcement.

## Permission checks

- Answer `:can_read` and `:can_write` in a batched hydration that costs a fixed number of queries for a list.
- Implement `mi/can-create?`. Implement `mi/can-update?` when the answer depends on the change, such as write
  access to the table or collection the row moves to. Endpoints call `api/create-check` and `api/update-check`.
- Share a predicate between `can-create?` and `can-update?`. Do not call one from the other with a changes map.
- Return a boolean. A permission method does not throw to refuse.
- A rule that a sanctioned writer must write through, such as remote-sync pull on a read-only instance, is a
  permission check, not an invariant. A hard invariant has no escape: put one predicate in the hook, and call the
  same predicate from `:can_write` so the UI can show it.
- Set provenance columns such as `creator_id` in the caller. A hook may forbid changing them.

## Rules on another entity's mutable data

A write-time check on the referring row alone does not hold such a rule: the other entity can change later. Pick, in
this order:

1. **Freeze** the column on the other entity, so the rule becomes an ordinary hook check. `table_id` on a Field and
   `namespace` on a Collection are frozen this way.
2. **Cascade** from the other entity's hook when the dependent state follows from it (archived, deleted, renamed,
   deactivated). Every writer then triggers it.
3. **Check at runtime**, where the entity is used.

Do not try to check every direction at write time.

## Lay out a model file

Group the namespace under these headers, in this order: model setup (`t2/table-name`, `t2/deftransforms`,
`derive`), `Hooks`, `Permissions`, `Hydration`, `Serialization` (spec, import dependencies, storage paths),
`Remote sync`, `Search`.

## Tests

- Give the model one `with-temp` default in `with-temp-defaults-fns` (`test/metabase/test/util.clj`) that passes
  its hooks. A fixture overrides a column only when the test depends on it.
- Build query fixtures with `metabase.lib`.
- Test a hook through `t2/insert!` or `t2/update!`, and a permission rule through `api/update-check` or the
  endpoint.
