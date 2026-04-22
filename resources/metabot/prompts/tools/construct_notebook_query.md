Use this tool to construct a notebook query. The query is written in the **MBQL 5 representations YAML format** — Metabase's portable, canonical serialization of a query. You write a YAML string describing the query shape; Metabase validates, repairs, and resolves it.

Return a payload with:
- `source_entity`: `{"type":"table"|"model"|"question"|"metric","id":123}` — used only to locate the right database; the query itself references tables and fields by portable foreign-key path (see below), not by numeric id.
- `referenced_entities`: optional additional context entities in the same shape (same-database only; not required, but helpful context for us when scanning for FK paths).
- `query`: a YAML string in representations format (see below).
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
- `database: <name>` — the database name (a string, e.g. `Sample`). Must match the database of the `source_entity`.
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

Not yet supported in this tool version. Every field you reference must either live on the `source-table` or be reached via an explicit entry in the stage's `joins:` list. If you reference a field on another table without joining it, you'll get an error.

## Rules and common mistakes

- **Always include `{}` options in every clause**, even when empty. `[count]` is wrong — it must be `[count, {}]`.
- **Database name must match** the database of the `source_entity`. You can't mix tables from different databases in one query.
- **Use the portable FK form**, not numeric IDs. The `entity_details` and `field_stats` tools return both; the portable form is under `portable_id` / `portable_fk` in the result.
- **Schemaless databases** (MongoDB, etc.) use `null` in the schema slot: `[Mongo, null, orders]`.
- **JSON-unfolded fields** append extra path segments: `[DB, SCHEMA, TABLE, PARENT, CHILD]`.
- **Clause heads are lowercase strings** with hyphens (not underscores): `count`, `sum`, `count-where`, `time-interval`.
- **The query must be a YAML string**, not a parsed JSON object. Write it literally as shown.

## Phase 1 scope — what's not yet supported

These are not yet available in this tool version; ignore them for now:
- `source-card` (querying a saved question / model as a source)
- Multi-stage queries (post-aggregation filtering/grouping)
- Implicit joins (fields referenced via FK without an explicit `joins:` entry)
- Custom expressions (`expressions:` clause) and `expression-ref` references
- Aggregation references with UUIDs

If the user asks for something that requires one of these, explain the limitation and offer to construct a simpler version instead.
