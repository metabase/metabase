Use this tool to construct a notebook query. The query is written in the **MBQL 5 representations YAML format** — Metabase's portable, canonical serialization of a query. You write a YAML string describing the query shape; Metabase validates, repairs, and resolves it.

Return a payload with:
- `query`: a YAML string in representations format (see below). The YAML's top-level `database:` field identifies which application database the query targets — use the **exact name** as reported by `entity_details` / metadata tools (e.g. `Sample Database`, not `Sample`).
- `visualization`: optional `{"chart_type":"bar"}`.

## The query YAML

A minimal example — count of orders by month:

```yaml
lib/type: mbql/query
database: Sample
stages:
  - lib/type: mbql.stage/mbql
    source-table: [Sample, PUBLIC, ORDERS]
    aggregation:
      - [count, {}]
    breakout:
      - [field, {temporal-unit: month}, [Sample, PUBLIC, ORDERS, CREATED_AT]]
```

### Top-level shape

- `lib/type: mbql/query` — required marker.
- `database: <name>` — the **exact** database name as reported by `entity_details` / metadata tools (e.g. `Sample Database`). This is the only signal Metabase uses to locate the application database — there is no separate `source_entity` parameter. If the name is wrong or ambiguous, the tool returns a clear error rather than guessing.
- `stages: […]` — at least one stage. Phase 1 MVP supports a **single stage**; multi-stage is coming.

### Stage shape

- `lib/type: mbql.stage/mbql` — required marker.
- `source-table: [<db-name>, <schema-or-null>, <table-name>]` — a **portable table FK** (3-element vector of strings; the middle slot is `null` for schemaless databases like MongoDB).
- Any of: `filters`, `aggregation`, `breakout`, `order-by`, `fields`, `limit`, `joins`.

### Clauses

Every operation is a vector `[operator, {options}, …args]`.

- **The options map at position 2 is always present**, even when empty (`{}`). This is the most common mistake — never skip it.
- Arguments follow the options map.

### Field references

```yaml
[field, {}, [<db-name>, <schema-or-null>, <table-name>, <field-name>]]
```

The third slot is the **portable field FK** — a 4+ element vector of strings. The last segment is the field name; additional segments describe JSON-unfolded nested paths.

Common field options (in the `{…}` map):

- `temporal-unit`: e.g. `month`, `day`, `week`, `quarter`, `year`, `hour`, `minute`.
- `join-alias`: used when referencing a field from a joined table — **required** for every field reference that lives in an explicit join (see Joins section).

### Examples for each MVP operation

**Filter (comparison):**
```yaml
filters:
  - ['>', {}, [field, {}, [Sample, PUBLIC, ORDERS, TOTAL]], 100]
```

**Filter (boolean combination):**
```yaml
filters:
  - [and, {},
     ['>', {}, [field, {}, [Sample, PUBLIC, ORDERS, TOTAL]], 100],
     ['=', {}, [field, {}, [Sample, PUBLIC, ORDERS, STATUS]], "paid"]]
```

**Aggregation on a field:**
```yaml
aggregation:
  - [sum, {}, [field, {}, [Sample, PUBLIC, ORDERS, TOTAL]]]
```

**Count (no argument):**
```yaml
aggregation:
  - [count, {}]
```

**Breakout with temporal bucket:**
```yaml
breakout:
  - [field, {temporal-unit: month}, [Sample, PUBLIC, ORDERS, CREATED_AT]]
```

**Order by (direction clause wraps a field ref):**
```yaml
order-by:
  - [desc, {}, [field, {}, [Sample, PUBLIC, ORDERS, CREATED_AT]]]
```

**Order by an aggregation** — use the literal aggregation expression in `order-by`; we will rewrite it to an aggregation reference for you. Always re-state the aggregation **identically** to how it appears in the `aggregation:` list (same operator, same args, options can be `{}`):
```yaml
aggregation:
  - [sum, {}, [field, {}, [Sample, PUBLIC, ORDERS, TOTAL]]]
order-by:
  - [desc, {}, [sum, {}, [field, {}, [Sample, PUBLIC, ORDERS, TOTAL]]]]
```
The inner `order-by` clause must match one of the entries in `aggregation:`. If it doesn't match anything (e.g. you ordered by `[avg, ...]` but only added `[sum, ...]`), you'll get a validation error — add the missing aggregation, or order by the matching one.

**Limit:**
```yaml
limit: 50
```

**Fields projection:**
```yaml
fields:
  - [field, {}, [Sample, PUBLIC, ORDERS, ID]]
  - [field, {}, [Sample, PUBLIC, ORDERS, TOTAL]]
```

### Joins (explicit)

For cross-table queries where the user wants columns from a specific related table:

```yaml
lib/type: mbql/query
database: Sample
stages:
  - lib/type: mbql.stage/mbql
    source-table: [Sample, PUBLIC, ORDERS]
    joins:
      - alias: Products
        strategy: left-join
        stages:
          - lib/type: mbql.stage/mbql
            source-table: [Sample, PUBLIC, PRODUCTS]
        conditions:
          - ['=', {},
             [field, {}, [Sample, PUBLIC, ORDERS, PRODUCT_ID]],
             [field, {join-alias: Products}, [Sample, PUBLIC, PRODUCTS, ID]]]
    aggregation:
      - [count, {}]
    breakout:
      - [field, {join-alias: Products}, [Sample, PUBLIC, PRODUCTS, CATEGORY]]
```

Rules for joins:
- The `alias` is a free-choice string; use it consistently in `conditions`, `breakout`, `aggregation`, etc.
- `strategy` must be one of `left-join`, `right-join`, `inner-join`, `full-join`. Use `left-join` unless the user asks for something else.
- **Every** field reference belonging to the joined table must carry `{join-alias: <same-alias>}` in its options map.

### Implicit joins

You can reference a field on another table **directly** — as long as there is exactly one foreign key from the `source-table` to that other table, Metabase will auto-fill the `source-field` option for you and perform an implicit join in the query processor.

```yaml
lib/type: mbql/query
database: Sample
stages:
  - lib/type: mbql.stage/mbql
    source-table: [Sample, PUBLIC, ORDERS]
    aggregation:
      - [count, {}]
    breakout:
      - [field, {}, [Sample, PUBLIC, PRODUCTS, CATEGORY]]
```

No explicit `joins:` entry needed. Internally, Metabase rewrites the breakout field to `[field, {source-field: [Sample, PUBLIC, ORDERS, PRODUCT_ID]}, [Sample, PUBLIC, PRODUCTS, CATEGORY]]`.

**Rules:**

- Only works when the source table has **exactly one** FK to the target table.
- If there is more than one FK (e.g. an `ORDERS.CREATED_BY` FK and an `ORDERS.UPDATED_BY` FK both pointing at `USERS`), you'll get an `:ambiguous-fk` error listing the candidate FK columns. Retry with an explicit `source-field` in the field's options map:
  ```yaml
  - [field, {source-field: [Sample, PUBLIC, ORDERS, CREATED_BY]}, [Sample, PUBLIC, USERS, NAME]]
  ```
- If there is **no** FK path from source to target, you'll get a `:no-fk-path` error. In that case, switch to an explicit `joins:` entry or use a field on the source table instead.
- Inside an explicit `joins:` block, field references continue to require `{join-alias: <alias>}`; the implicit-join pass does not rewrite those.

**Tip:** Use the `entity_details` tool to discover FK columns. FK columns return a `fk_target_portable_fk` pointing to the target field — that tells you which column to use as the `source-field` when disambiguating.

## Rules and common mistakes

- **Always include `{}` options in every clause**, even when empty. `[count]` is wrong — it must be `[count, {}]`.
- **Use the exact database name** reported by `entity_details` (e.g. `Sample Database`, not `Sample`). The lookup is strict; a near-miss returns an `Unknown database: \`X\`` error rather than silently picking a database. Cross-database queries are not supported — every portable FK in the query (the first slot of `[<db>, <schema>, <table>]`) must use the same name as the top-level `database:` field.
- **Use the portable FK form**, not numeric IDs. The `entity_details` and `field_stats` tools return both; the portable form is under `portable_id` / `portable_fk` in the result.
- **Schemaless databases** (MongoDB, etc.) use `null` in the schema slot: `[Mongo, null, orders]`.
- **JSON-unfolded fields** append extra path segments: `[DB, SCHEMA, TABLE, PARENT, CHILD]`.
- **Clause heads are lowercase strings** with hyphens (not underscores): `count`, `sum`, `count-where`, `time-interval`.
- **The query must be a YAML string**, not a parsed JSON object. Write it literally as shown.

## Phase 1 scope — what's not yet supported

These are not yet available in this tool version; ignore them for now:
- `source-card` (querying a saved question / model as a source)
- Multi-stage queries (post-aggregation filtering/grouping)
- Custom expressions (`expressions:` clause) and `expression-ref` references
- Aggregation references with UUIDs

If the user asks for something that requires one of these, explain the limitation and offer to construct a simpler version instead.
