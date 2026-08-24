---
name: transforms
description: Authoring transforms with transform_write — the query source (definition vs query_handle), the target table and what patching it renames, why the target database is never yours to choose, the two shapes the tool refuses (python, incremental), tags and folders. Read before your first transform_write. Triggers — "make a transform", "materialize this query into a table", "build a table other questions can query", "rename a transform's output table", "why won't it let me edit this transform".
---

# Transforms

A transform is a saved query Metabase **runs to materialize its results into a real table** in your warehouse. Questions, other transforms, and anything else that can reach the database then query that table like any other. That materialization is the whole point — a model is a saved query resolved at read time, a transform is a table that exists between runs.

```
transform_write {"method": "create", "name": "Daily revenue",
                 "query_handle": "qh_…",
                 "target": {"name": "daily_revenue", "schema": "analytics"}}
```

## Build the query first, then save the handle

The reliable loop: author with `execute_query` (or `execute_sql` for native), run it, then pass the `query_handle` it returned — the handle saves *exactly what ran*, so what you verified is what the transform stores. Native SQL is fine; save an `execute_sql` handle.

The alternative is inline `definition`, which is the transform's **source map**, not a bare query:

```
"definition": {"type": "query", "query": {"lib/type": "mbql/query", "stages": [...]}}
```

That is the shape `get_content`'s `"definition"` include returns for a transform, so a read-modify-write round-trips. The inner query is the same dialect `execute_query` takes (`learn("query-dialect")`) — numeric ids.

Pass **exactly one** of `definition` or `query_handle` — never both. Passing a bare query straight into `definition` is the common miss and a teaching error: older transforms stored it that way, so the shapes look alike.

## The target table

`target` is `{name, schema?}` — the table the transform writes, **recreated in full on every run**.

- `schema` is required on databases that have schemas; omit it only on those that don't.
- On update, `target` is **patched, not replaced** — so passing only `name` renames the output table and keeps the schema. That is the supported rename.
- Creating a transform whose target table **already exists is refused**. A transform creates its table; it does not adopt one. Pick another name or schema.
- Never set `target.database`. The target always follows the database the query reads — it is not an independent choice, and naming a different one is an error telling you so.
- `target.type` is always `"table"`. Incremental target types are configured in Metabase, not here.

## What this tool deliberately won't author

Two shapes are **refused rather than degraded**, because rewriting them would quietly destroy how the transform loads:

- **Python transforms** — authored in Metabase. An update that would rewrite one is rejected.
- **Incremental loading** — checkpoint (`definition.source-incremental-strategy`) and append/merge (`target.target-incremental-strategy`). Configure incrementality in Metabase; you can still edit the *query* here, as long as you leave those keys out.

There is also **no archive and no delete** — transforms have no trash, so removing one happens in Metabase. And **running is separate from writing**: `transform_write` saves the definition, it does not execute it. `get_content` on a transform reports its source type, target, and latest run.

## Folders and tags

- `collection_id` files the transform in a transform folder; omit for the top level of the transforms tree.
- `tag_ids` labels it — **jobs select transforms by tag**, so tags are how a transform gets scheduled. The list is replaced wholesale, so pass the full set you want, or `[]` to clear it.

## Requirements

Transforms permission on the source database, plus the transforms feature. Both are enforced by the same checks as the REST API, so a permission you lack fails the same way it would in the UI.

## Don't

- Don't pass both `definition` and `query_handle` — exactly one query source.
- Don't put a bare query in `definition` — it takes the source map `{"type": "query", "query": …}`.
- Don't set `target.database` — it follows the query's database.
- Don't point a new transform at a table that already exists — it creates its table rather than adopting one.
- Don't try to convert a python or incremental transform by rewriting it — the write is refused, not degraded; change those in Metabase.
- Don't expect `transform_write` to run, archive, or delete anything — it only authors.
