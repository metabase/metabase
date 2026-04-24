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
- `stages: […]` — at least one stage. Multi-stage queries (post-aggregation filter/group-by/order-by) are supported — see the **Multi-stage queries** section below.

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

### Querying a saved question or model

Instead of `source-table:` you can use `source-card:` to query the result of an existing saved question or model. The value is the card's **portable entity id** — a short opaque 21-character string reported by `entity_details` under `portable_entity_id` (do **not** use the numeric id, the name, or `card__<id>`).

**Mandatory workflow — never skip:**

1. **Get the `portable_entity_id` from a tool response.** Both `search` (and its variants) and `read_resource` (for `metabase://question/<id>` / `metabase://model/<id>`) include it directly on the result, as an attribute on the `<question>` / `<metabase_question>` / `<model>` / `<metabase-model>` tag. If the card is already visible in the current `search` results you do **not** need an extra `entity_details` / `read_resource` call — just reuse the id from there.
2. Copy the `portable_entity_id` value **verbatim** into `source-card:`. It is a random-looking 21-character string — treat it as opaque.
3. Reference the card's columns by their exact output `name` (from the card's `fields` list). If you don't yet know the column names, call `read_resource` for `metabase://question/<numeric-id>/fields` or `metabase://model/<numeric-id>/fields`.

**Never guess, construct, or abbreviate an entity_id.** If you write an id that no tool gave you, the query is rejected with `:unknown-card`. There is no pattern or convention you can derive it from — only the tool responses know it.

```yaml
lib/type: mbql/query
database: Sample
stages:
  - lib/type: mbql.stage/mbql
    source-card: T4wA_GPFwGb6R4FxIDGTo   # portable_entity_id copied verbatim from entity_details
    filters:
      - ['>', {}, [field, {}, total], 100]   # reference card columns by their output name
    limit: 50
```

Further rules when a stage uses `source-card:`:

- Reference columns produced by the card the same way you reference columns from a previous stage in a multi-stage query — `[field, {}, "<column-name>"]` with the column's **output name** (the string reported by the card's `fields` in `entity_details`) in the third slot, **not** a portable FK path.
- A single stage has **either** `source-table:` **or** `source-card:`, never both.
- The card must live in the same database as this query (same `database:` name at the top level). Cross-database queries are not supported.
- Prefer `source-card:` over re-writing the card's query inline: it keeps the query small, reuses the card's definition, and lets the user click through to the source question. Falling back to native SQL like `SELECT * FROM {{#<id>-<slug>}}` is **not** acceptable — always use `source-card:` when the user refers to an existing question or model.

### Multi-stage queries

A query can have more than one stage. Every stage after the first consumes the previous stage's output as its source — so you can aggregate, then filter on the aggregate; or aggregate, then group the aggregate by something else; or rank results and then `limit` to the top N.

Only the **first** stage has a `source-table:` (or `source-card:`); later stages omit it — their source is implicitly the previous stage.

Within a later stage, a field reference that points to a column produced by the previous stage uses the column's **name as a string** in the third slot instead of a portable FK vector:

```yaml
- [field, {}, count]          # references the `count` output of the previous stage
- [field, {}, PRODUCT_ID]     # references the `PRODUCT_ID` output of the previous stage
```

The column's name is whatever the previous stage's aggregation / breakout / field produced — for aggregations, this is conventionally the operator name (`count`, `sum`, `avg`, …); for breakouts and field projections, it is the source field's name.

#### Example — count of orders per product, keeping only products with more than 10 orders

```yaml
lib/type: mbql/query
database: Sample
stages:
  - lib/type: mbql.stage/mbql
    source-table: [Sample, PUBLIC, ORDERS]
    aggregation:
      - [count, {}]
    breakout:
      - [field, {}, [Sample, PUBLIC, ORDERS, PRODUCT_ID]]
  - lib/type: mbql.stage/mbql
    filters:
      - ['>', {}, [field, {}, count], 10]
```

The stage-1 filter is a post-aggregation filter: the database groups orders by `PRODUCT_ID` and counts them in stage 0, then the outer query keeps only rows where `count > 10`.

#### Example — group aggregated results a second time

```yaml
lib/type: mbql/query
database: Sample
stages:
  - lib/type: mbql.stage/mbql
    source-table: [Sample, PUBLIC, ORDERS]
    aggregation:
      - [sum, {}, [field, {}, [Sample, PUBLIC, ORDERS, TOTAL]]]
    breakout:
      - [field, {temporal-unit: day}, [Sample, PUBLIC, ORDERS, CREATED_AT]]
  - lib/type: mbql.stage/mbql
    aggregation:
      - [avg, {}, [field, {}, sum]]
    breakout:
      - [field, {temporal-unit: month}, [field, {}, CREATED_AT]]
```

Note: cross-stage field refs inside aggregation/breakout arguments work the same way — `[field, {}, <column-name>]` where `<column-name>` is a string.

#### Rules for multi-stage queries

- The first stage must have a `source-table:` (or `source-card:`). Later stages must not.
- Cross-stage field references (a `field` clause whose third slot is a **string column name**) are resolved against the previous stage's output columns. The tool will auto-fill the required `base-type` option on those clauses for you — you don't need to write it.
- If you reference a column that the previous stage doesn't produce, you'll get a validation error. Pick an actual output column name (the result of an `aggregation`, `breakout`, or `fields` clause in the previous stage).
- Aggregation / breakout / filter / order-by / limit / expressions are all valid in later stages, just as in the first.
- Joins inside later stages: joining against the *previous stage's output* is allowed; use the same `joins:` shape as in the first stage, with field references on the joined side using portable FKs as usual.

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

### Expressions (custom columns)

Define a custom column inside a stage using `expressions:` and reference it by name with `[expression, {}, "<Name>"]` anywhere a field reference is allowed (`aggregation`, `breakout`, `filter`, `order-by`, `fields`).

The easiest form is a map keyed by the expression name:

```yaml
lib/type: mbql/query
database: Sample
stages:
  - lib/type: mbql.stage/mbql
    source-table: [Sample, PUBLIC, ORDERS]
    expressions:
      Subtotal:
        - '+'
        - {}
        - [field, {}, [Sample, PUBLIC, ORDERS, TOTAL]]
        - [field, {}, [Sample, PUBLIC, ORDERS, TAX]]
    aggregation:
      - [sum, {}, [expression, {}, Subtotal]]
```

String concatenation example:

```yaml
stages:
  - lib/type: mbql.stage/mbql
    source-table: [Sample, PUBLIC, PEOPLE]
    expressions:
      FullName:
        - concat
        - {}
        - [field, {}, [Sample, PUBLIC, PEOPLE, FIRST_NAME]]
        - ' '
        - [field, {}, [Sample, PUBLIC, PEOPLE, LAST_NAME]]
    breakout:
      - [expression, {}, FullName]
    aggregation:
      - [count, {}]
```

**Rules:**

- The expression name is a string. Keep it short and descriptive — it becomes the column's display name in the result.
- You don't need to write `lib/expression-name` yourself — the tool stamps it from the map key.
- Arithmetic operators must be quoted when they are YAML special characters: `'+'`, `'-'`, `'*'`, `'/'`. `concat`, `coalesce`, `case`, `substring`, etc. don't need quotes.
- Reference the expression with `[expression, {}, "<Name>"]` — the same three-element shape as a field reference, but with `expression` as the clause head and the name (not a FK path) as the last slot.

### Aggregation references

You can refer to an aggregation you already wrote in the same stage — for example, from `order-by` to sort by a computed `sum` — in either of two forms:

1. **Inline** — put the aggregation clause itself as the argument (simple, but duplicates the expression). `[desc, {}, [sum, {}, [field, {}, [..., TOTAL]]]]`
2. **By 0-based index** (preferred when reused) — reference the aggregation by its position in the same stage's `aggregation:` list: `[aggregation, {}, 0]` means "the first aggregation".

Both forms are rewritten to the same canonical MBQL 5 reference; the tool fills in `lib/uuid`, `base-type`, and `effective-type` for you.

```yaml
lib/type: mbql/query
database: Sample
stages:
  - lib/type: mbql.stage/mbql
    source-table: [Sample, PUBLIC, ORDERS]
    aggregation:
      - [sum, {}, [field, {}, [Sample, PUBLIC, ORDERS, TOTAL]]]  # index 0: sum(total)
      - [count, {}]                                               # index 1: count
    breakout:
      - [field, {}, [Sample, PUBLIC, ORDERS, PRODUCT_ID]]
    order-by:
      - [desc, {}, [aggregation, {}, 0]]   # sort by sum(total) desc
```

**Rules:**

- Index is 0-based and refers to the **same stage's** `aggregation:` list. Out-of-range indices produce a clear error listing each available aggregation with its index.
- This form is for referring to an aggregation from `order-by`, `breakout`, or `filter` within the **same stage**. To filter a *later* stage by a previous stage's aggregation, use a cross-stage field reference by the aggregation's column name instead (see **Multi-stage queries** above): `[field, {}, "sum"]` in stage 2 refers to the `sum` column produced by stage 1.

## Rules and common mistakes

- **Always include `{}` options in every clause**, even when empty. `[count]` is wrong — it must be `[count, {}]`.
- **Use the exact database name** reported by `entity_details` (e.g. `Sample Database`, not `Sample`). The lookup is strict; a near-miss returns an `Unknown database: \`X\`` error rather than silently picking a database. Cross-database queries are not supported — every portable FK in the query (the first slot of `[<db>, <schema>, <table>]`) must use the same name as the top-level `database:` field.
- **Use the portable FK form**, not numeric IDs. The `entity_details` and `field_stats` tools return both; the portable form is under `portable_id` / `portable_fk` in the result.
- **Schemaless databases** (MongoDB, etc.) use `null` in the schema slot: `[Mongo, null, orders]`.
- **JSON-unfolded fields** append extra path segments: `[DB, SCHEMA, TABLE, PARENT, CHILD]`.
- **Clause heads are lowercase strings** with hyphens (not underscores): `count`, `sum`, `count-where`, `time-interval`.
- **The query must be a YAML string**, not a parsed JSON object. Write it literally as shown.
- **Never invent a `source-card:` entity id.** It must be a 21-character string copied verbatim from an `entity_details` call on the same card — no abbreviations, no patterns, no numeric ids, no `card__<id>`. See "Querying a saved question or model" above.

## Phase 1 scope — what's not yet supported

All the features described above are implemented. If the user's request requires something that isn't covered here, explain the limitation and offer to construct a simpler version instead.
