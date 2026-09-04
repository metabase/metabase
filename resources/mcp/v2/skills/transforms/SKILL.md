---
name: transforms
description: Authoring transforms with transform_write — the query source (definition vs query_handle), the target table and what patching it renames, why the target database is never yours to choose, the two shapes the tool refuses (python, incremental), tags and folders. Read before your first transform_write. Triggers — "make a transform", "materialize this query into a table", "build a table other questions can query", "rename a transform's output table", "why won't it let me edit this transform".
---

# Transforms

A transform is a saved query Metabase **runs to materialize its results into a real warehouse table**, which questions, other transforms, and anything reaching the database then query like any table. (A model is resolved at read time; a transform is a table that exists between runs.)

```
transform_write {"method": "create", "name": "Daily revenue",
                 "query_handle": "qh_…",
                 "target": {"name": "daily_revenue", "schema": "analytics"}}
```

## Query source — exactly one of `query_handle` | `definition`

Preferred: author and run with `execute_query` (or `execute_sql` for native — fine here), then pass the returned `query_handle`; it saves exactly what ran. The alternative, inline `definition`, is the transform's **source map**, not a bare query — the shape `get_content`'s `"definition"` include returns, so read-modify-write round-trips; the inner query is the `execute_query` dialect (`learn("query-dialect")`), numeric ids:

```
"definition": {"type": "query", "query": {"lib/type": "mbql/query", "stages": [...]}}
```

A bare query in `definition` is the common miss (older transforms stored it that way) and a teaching error.

## Target table

`target` is `{name, schema?}` — the table the transform writes, **recreated in full on every run**.

- `schema` is required on databases that have schemas.
- On update `target` is **patched, not replaced**: passing only `name` renames the output table and keeps the schema — the supported rename.
- A new transform whose target table **already exists is refused** — it creates its table, never adopts one. Pick another name or schema.
- Never set `target.database`: the target follows the database the query reads; naming another is an error.
- `target.type` is always `"table"`; incremental types are configured in Metabase.

## Refused, not degraded

Two shapes are rejected outright, because rewriting them would silently change how the transform loads: **Python transforms** (an update that would rewrite one is refused) and **incremental loading** — checkpoint (`definition.source-incremental-strategy`) and append/merge (`target.target-incremental-strategy`). Configure those in Metabase; the *query* of an incremental transform is still editable here as long as those keys stay out.

`transform_write` only authors: no run (saving doesn't execute), no archive, no delete (transforms have no trash — remove in Metabase). `get_content` on a transform reports source type, target, and latest run.

## Folders, tags, permissions

- `collection_id` files it in a transform folder; omit for the top of the transforms tree.
- `tag_ids` — **jobs select transforms by tag**, so tags are how a transform gets scheduled. Replaced wholesale: pass the full set, or `[]` to clear.
- Needs transforms permission on the source database plus the transforms feature, enforced exactly as the REST API and UI enforce them.

## Don't

- Don't expect saving to run the transform — nothing executes until a job does.
- Don't pass a partial `tag_ids` — the list is replaced wholesale and the rest are dropped.
- Don't pass a partial `target` expecting a replacement — it is patched, so the old schema stays.
- Don't rely on rows surviving between runs — the table is recreated in full each time.
