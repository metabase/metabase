# Construct Query Reference

Construct a Metabase MBQL 5 query as a JSON object describing the query shape. Metabase validates, repairs, and resolves it.

Return:
- `query`: a JSON **object** (never a quoted string). The target database is inferred from the first stage's `source-table` (or `source-card`) — use the **exact** database name reported by `entity_details` / metadata tools.
- `title`: required short, human-friendly title for the resulting chart, shown above it (e.g. `"Orders by month"`).
- `visualization`: optional `{"chart_type": "bar"}` (sibling of `query`, never embedded inside it).

## Minimal example — count of orders by month

```json
{"lib/type": "mbql/query",
 "stages": [{"lib/type": "mbql.stage/mbql",
             "source-table": ["Sample Database", "PUBLIC", "ORDERS"],
             "aggregation": [["count", {}]],
             "breakout": [["field", {"temporal-unit": "month"},
                           ["Sample Database", "PUBLIC", "ORDERS", "CREATED_AT"]]]}]}
```

Every clause is `["op", {}, ...args]` with a mandatory `{}` options map at position 1; every field reference uses a 4-segment portable FK in the last slot. These are the two most-violated rules.

## Universal clause shape

Every operation is `["<operator>", {options}, ...args]`. The options map is **always present**, even when empty.

- Good: `["count", {}]`, `["field", {}, ["DB", "SCH", "TBL", "COL"]]`, `["sum", {}, <expr>]`
- Bad: `["count"]`, `["field", ["DB", "SCH", "TBL", "COL"]]`

The pipeline repairs missing `{}` slots, but write them — your output should match what later inspection will show.

## Top-level query and stage shape

Top level:
- `"lib/type": "mbql/query"` — required marker.
- `"stages": [...]` — at least one stage.

Stage (`"lib/type": "mbql.stage/mbql"` — required marker):
- `source-table` **or** `source-card` — exactly one, **first stage only**. Later stages take the previous stage's output implicitly.
- Optional: `filters`, `aggregation`, `breakout`, `expressions`, `fields`, `joins`, `order-by`, `limit`, `page`.

There is no top-level `database:` field in the LLM contract — the database is derived from the source.

## Field references

```json
["field", {}, ["<db-name>", "<schema-or-null>", "<table-name>", "<field-name>"]]
```

The third slot is the **portable field FK** — a 4+ element string array. Schemaless databases (MongoDB, etc.) use `null` in the schema slot: `["Mongo", null, "orders", "created_at"]`. JSON-unfolded fields append extra segments: `["DB", "SCH", "TBL", "PARENT", "CHILD"]`.

Inside later stages, refer to a column produced by the previous stage by **string name** instead of a portable FK: `["field", {}, "count"]`, `["field", {}, "PRODUCT_ID"]`.

Field options (all optional):
- `temporal-unit` — bucket a date/time field, e.g. `"month"`, `"day"`, `"hour"`. Full list in §Operator catalogs.
- `join-alias` — required on every field reference that lives inside an explicit join.
- `source-field` — portable FK of the FK column on the source table; only needed when the implicit-join auto-fill is ambiguous.
- `source-field-name` — name of the FK column when it comes from a previous stage's output (rare; not auto-filled).
- `source-field-join-alias` — explicit-join alias the FK column belongs to (usually auto-filled).
- `binning` — bucket a numeric field.

`base-type` is auto-filled on cross-stage refs — don't write it.

## Per-clause examples

Filter (comparison + boolean combination):

```json
"filters": [["and", {},
  [">", {}, ["field", {}, ["Sample Database", "PUBLIC", "ORDERS", "TOTAL"]], 100],
  ["=", {}, ["field", {}, ["Sample Database", "PUBLIC", "ORDERS", "STATUS"]], "paid"]]]
```

Aggregation (on a field, plus `count`):

```json
"aggregation": [["sum", {}, ["field", {}, ["Sample Database", "PUBLIC", "ORDERS", "TOTAL"]]],
                ["count", {}]]
```

Breakout with temporal bucket:

```json
"breakout": [["field", {"temporal-unit": "month"},
              ["Sample Database", "PUBLIC", "ORDERS", "CREATED_AT"]]]
```

Order by — direction wraps a ref; works on field refs or aggregation refs:

```json
"order-by": [["desc", {}, ["field", {}, ["Sample Database", "PUBLIC", "ORDERS", "CREATED_AT"]]],
             ["desc", {}, ["aggregation", {}, 0]]]
```

`"limit": 50` and `"fields": [<field-ref>, ...]` are the obvious scalar / list forms.

### Aggregation references

To refer to an aggregation already in the same stage's `aggregation` list — e.g. from `order-by`:
1. **Inline** — repeat the clause itself. The inline form must match an entry in `aggregation` **exactly** (same op, same args). The tool rewrites it to a reference.
2. **By 0-based index** (preferred when reused) — `["aggregation", {}, 0]` means "the first aggregation".

Out-of-range indices surface a clear error listing every available aggregation with its index.

## Expressions

Define custom columns inside a stage using `expressions` and reference by name with `["expression", {}, "<Name>"]`. Object form (preferred); the name becomes the column's display name.

```json
"expressions": {
  "Subtotal": ["+", {},
               ["field", {}, ["Sample Database", "PUBLIC", "ORDERS", "TOTAL"]],
               ["field", {}, ["Sample Database", "PUBLIC", "ORDERS", "TAX"]]]
},
"aggregation": [["sum", {}, ["expression", {}, "Subtotal"]]]
```

The sequential form `[["expression", {}, "Name", expr], ...]` is also accepted and auto-converted.

## Joins (explicit)

```json
"joins": [{
  "alias": "Products",
  "strategy": "left-join",
  "stages": [{"lib/type": "mbql.stage/mbql",
              "source-table": ["Sample Database", "PUBLIC", "PRODUCTS"]}],
  "conditions": [["=", {},
    ["field", {}, ["Sample Database", "PUBLIC", "ORDERS", "PRODUCT_ID"]],
    ["field", {"join-alias": "Products"},
     ["Sample Database", "PUBLIC", "PRODUCTS", "ID"]]]]
}],
"breakout": [["field", {"join-alias": "Products"},
              ["Sample Database", "PUBLIC", "PRODUCTS", "CATEGORY"]]]
```

- `alias` is a free-choice string; use it consistently in conditions, breakout, aggregation, order-by.
- `strategy` is one of `"left-join"`, `"right-join"`, `"inner-join"`, `"full-join"`. Default `"left-join"`.
- **Every** field reference on the joined side must carry `{"join-alias": "<same-alias>"}`.
- Join `conditions` accept only `=`, `!=`, `<`, `<=`, `>`, `>=` — no `between`, `in`, `and`/`or` wrappers.

## Implicit joins

Reference a field on a related table directly — when the source has exactly one FK to that target, the tool auto-fills `source-field` and performs the implicit join:

```json
"source-table": ["Sample Database", "PUBLIC", "ORDERS"],
"aggregation": [["count", {}]],
"breakout": [["field", {}, ["Sample Database", "PUBLIC", "PRODUCTS", "CATEGORY"]]]
```

- **Multiple FKs** to the target → `:ambiguous-fk` lists them. Retry with explicit `{"source-field": ["DB", "SCH", "SRC", "FK_COL"]}` on the field.
- **No FK path** → `:no-fk-path`. Switch to an explicit `joins` entry, or pick a field on the source table.
- Inside an explicit `joins` block, joined-side field refs still need `{"join-alias": ...}` — implicit-join repair does not rewrite those.
- If the FK column lives on a previous stage's output, write `{"source-field-name": "<col>"}` (not auto-filled).
- If multiple explicit joins all expose the target FK, `:ambiguous-fk-via-join` lists them — set `{"source-field-join-alias": "<alias>"}` to pick one.

**Tip:** discover FKs with `entity_details` / `read_resource metabase://table/<id>/fields`. FK columns are tagged `fk_target_fully_qualified_name="schema.table.field"` — always look for one before assuming a column lives on the current table.

## Multi-stage queries

Every stage after the first consumes the previous stage's output. Only the first stage has a `source-table`/`source-card`; later stages omit it.

Post-aggregation filter — count orders per product, keep only those with > 10:

```json
"stages": [
  {"lib/type": "mbql.stage/mbql",
   "source-table": ["Sample Database", "PUBLIC", "ORDERS"],
   "aggregation": [["count", {}]],
   "breakout": [["field", {}, ["Sample Database", "PUBLIC", "ORDERS", "PRODUCT_ID"]]]},
  {"lib/type": "mbql.stage/mbql",
   "filters": [[">", {}, ["field", {}, "count"], 10]]}
]
```

Re-aggregate — average daily total by month:

```json
"stages": [
  {"lib/type": "mbql.stage/mbql",
   "source-table": ["Sample Database", "PUBLIC", "ORDERS"],
   "aggregation": [["sum", {}, ["field", {}, ["Sample Database", "PUBLIC", "ORDERS", "TOTAL"]]]],
   "breakout": [["field", {"temporal-unit": "day"},
                 ["Sample Database", "PUBLIC", "ORDERS", "CREATED_AT"]]]},
  {"lib/type": "mbql.stage/mbql",
   "aggregation": [["avg", {}, ["field", {}, "sum"]]],
   "breakout": [["field", {"temporal-unit": "month"}, ["field", {}, "CREATED_AT"]]]}
]
```

- Cross-stage refs use a **string name** in slot 3 (e.g. `["field", {}, "count"]`). The name is whatever the previous stage's aggregation/breakout/field produced (`count`, `sum`, or the source field's name).
- Within the **same stage**, refer to your own aggregation with `["aggregation", {}, <idx>]` (see §Aggregation references). In a **later** stage, use the cross-stage string-name form against the previous stage's output.
- Joins, expressions, filters, aggregation, breakout, order-by, limit are all valid in later stages.

## Saved questions and models (`source-card`)

Instead of `source-table`, use `source-card` to query an existing question or model. The value is the card's **portable entity id** — a 21-char opaque string reported by `entity_details` and search tools as `portable_entity_id`.

1. Get the `portable_entity_id` from a tool response. `search` and `read_resource` (`metabase://question/<id>`, `metabase://model/<id>`) include it on the result tag — reuse what's already in context, no extra call needed.
2. Copy it **verbatim** into `source-card`. The id is opaque — never guess, construct, or abbreviate.
3. Reference the card's columns by output **name** (string in slot 3), not portable FK. If you don't know the names, call `read_resource metabase://question/<numeric-id>/fields` (or `.../model/...`).

```json
{"lib/type": "mbql.stage/mbql",
 "source-card": "T4wA_GPFwGb6R4FxIDGTo",
 "filters": [[">", {}, ["field", {}, "total"], 100]],
 "limit": 50}
```

A stage has either `source-table` **or** `source-card`, never both. The card must live in the same database as the rest of the query (no cross-database queries). Falling back to native SQL like `SELECT * FROM {{#<id>-<slug>}}` is **not** acceptable — always use `source-card`.

## Metrics

A metric is a pre-defined aggregation attached to a base table. To use one:

1. Put the metric's **base table** in `source-table`. Read it from the `base_table_fully_qualified_name` attribute on the `<metric>` tag (combine with `database_name` to form the portable FK). Never invent schema/table names.
2. Reference the metric as `["metric", {}, "<portable_entity_id>"]` in `aggregation`.
3. Filters/breakouts on the same stage use portable FKs on the metric's base table.

```json
{"lib/type": "mbql.stage/mbql",
 "source-table": ["Analytics", "brex_enriched", "fct_cards"],
 "filters": [["!=", {}, ["field", {},
                         ["Analytics", "brex_enriched", "fct_cards", "card_status"]], "inactive"]],
 "aggregation": [["metric", {}, "aB3cD4eF5gH6iJ7kL8mN9"]]}
```

Metrics are aggregations, **not sources** — never put a metric in `source-table` or `source-card`. The `metabase://metric/<id>` URIs are for reading metadata via `read_resource`, not for embedding in queries.

## Using measures and segments

A measure or segment can be referenced two ways. **Prefer the opaque-id clause** — it preserves the measure/segment's identity in the rendered notebook (chip with the official name, click-through to the definition, lineage tooling sees the dependency, definition updates propagate).

### Preferred — opaque-id clause

Each `<measure>` and `<segment>` block on a `<table>` carries a `portable_entity_id="…"` attribute (a 21-char NanoID). Copy it verbatim:

```json
"aggregation": [["measure", {}, "<portable_entity_id>"]]
"filters": [["segment", {}, "<portable_entity_id>"]]
```

The stage's `source-table` must be the table the measure/segment belongs to (the same `<table>` block where you saw the `<measure>` / `<segment>` element).

### Fallback — inline the `<definition>` body

When you need to **compose on top of** a measure or segment (add an extra filter the segment doesn't include, breakout an aggregation the measure doesn't have, …), copy the JSON array inside `<definition>` directly into your stage's `aggregation: [...]` (measure) or `filters: [...]` (segment) and add your own clauses alongside. The definition is in the same portable form the tool expects.

### Don't

- Never invent a `portable_entity_id` — only use the value reported in a tool response.
- The matching aggregation-only opaque-id clause is `["metric", {}, "<portable_entity_id>"]` (for metrics, which live independently of a table — see §Metrics above).

## Rules and common mistakes

Shape rules:
- **Always include `{}` options in every clause**, even when empty. `["count"]` is wrong — it must be `["count", {}]`.
- **The query is a JSON object**, not a string. Send it directly as the `"query"` field of the call.
- **Use the exact database name** reported by `entity_details` (e.g. `"Sample Database"`, not `"Sample"`) as the first element of every portable FK. Near-misses surface `Unknown database` instead of silently picking one. Cross-database queries are not supported.
- **Use portable FKs**, not numeric IDs. Schemaless databases use `null` in the schema slot. JSON-unfolded fields append path segments.
- **Clause heads are lowercase, hyphenated**: `"count"`, `"sum-where"`, `"time-interval"`, `"get-day-of-week"`. Not underscores, not camelCase.
- **Never invent a `source-card` entity_id.** It must be a 21-char string copied verbatim from `entity_details` / search — no patterns, no numeric ids, no `card__<id>`.
- **`source-card` columns are referenced by output name** (string in slot 3), not portable FK.

Anti-hallucination:
- **Don't subtract dates** with `-`. Use `["datetime-diff", {}, <left>, <right>, "<unit>"]` for the integer count of units between two temporal values.
- **For multi-value categorical filters, use `in` / `not-in`**, not `=` with a list literal. The tool rewrites the list form, but write canonical: `["in", {}, <field>, "a", "b"]`.
- **Extracted quarter values are numbers `1, 2, 3, 4`**, never strings like `"Q1"`.
- **Don't breakout on the same underlying field twice** in one stage. If you breakout by `{"temporal-unit": "month"}`, do not also breakout by the raw field.
- **`visualization` is a sibling of `query`**, never embedded inside it.
- **Ordering by an inline aggregation must match an `aggregation:` entry exactly** (same op, same args). If unsure, use `["aggregation", {}, <0-based-idx>]`.
- **Never write `metabase://...` URIs as `source-table` or `source-card` values.** Those URIs are for `read_resource`, not for query sources.
- **Never write `[aggregate, ...]`, `[filter, ...]`, `[order-by, ...]`, `[breakout, ...]`, `[limit, ...]` as clause heads** — those are stage *container keys*, not clauses. Place inner clauses directly inside the stage's `aggregation:` / `filters:` / etc. arrays.
- Common typos (`count-if`, `variance`, `stddev-pop`, `count-distinct`, `dayofweek`, `hour-of-day`, `month-of-year`, `quarter-of-year`, `temporal-diff`, `relative-date`) are auto-corrected, but write the canonical name (`count-where`, `var`, `stddev`, `distinct`, `get-day-of-week`, `get-hour`, `get-month`, `get-quarter`, `datetime-diff`, `relative-datetime`) so the tool output matches what later inspection will show.

## Operator catalogs

> Source of truth: `src/metabase/lib/schema/{aggregation,filter,temporal_bucketing}.cljc` and `src/metabase/lib/schema/expression/*.cljc`. If something seems missing here, attempt it — the schema may have grown.

### Aggregations

- `["count", {}]` — count all rows. Optional 3rd slot `<expr>` counts non-NULL.
- `["cum-count", {}]` — cumulative count. Optional 3rd slot `<expr>`.
- `["sum", {}, <num-expr>]`
- `["cum-sum", {}, <num-expr>]`
- `["avg", {}, <num-expr>]`
- `["min", {}, <orderable>]`
- `["max", {}, <orderable>]`
- `["median", {}, <num-expr>]`
- `["percentile", {}, <num-expr>, <0..1>]`
- `["distinct", {}, <expr>]` — count of distinct non-NULL values.
- `["distinct-where", {}, <expr>, <bool-pred>]`
- `["count-where", {}, <bool-pred>]`
- `["sum-where", {}, <num-expr>, <bool-pred>]`
- `["share", {}, <bool-pred>]` — fraction of rows where pred is true.
- `["stddev", {}, <num-expr>]`
- `["var", {}, <num-expr>]`
- `["metric", {}, "<portable_entity_id>"]` — reference a defined metric. The metric's base table must be the stage's `source-table`.
- `["measure", {}, "<portable_entity_id>"]` — reference a defined measure (preferred over inlining its definition). The measure's table must be the stage's `source-table`.

### Order-by direction

- `["asc", {}, <ref>]` / `["desc", {}, <ref>]` — wrap any field ref or aggregation ref.

### Filters

Boolean:
- `["and", {}, <pred>, <pred>, ...]` — min 2 args.
- `["or", {}, <pred>, <pred>, ...]` — min 2 args.
- `["not", {}, <pred>]`

Equality (variadic, ≥2 args):
- `["=", {}, <a>, <b>, ...]`
- `["!=", {}, <a>, <b>, ...]`
- `["in", {}, <expr>, <v1>, <v2>, ...]`
- `["not-in", {}, <expr>, <v1>, <v2>, ...]`

Comparison:
- `["<", {}, <a>, <b>]` / `["<=", {}, <a>, <b>]` / `[">", {}, <a>, <b>]` / `[">=", {}, <a>, <b>]`
- `["between", {}, <expr>, <min>, <max>]`
- `["inside", {}, <lat-expr>, <lon-expr>, <lat-max>, <lon-min>, <lat-min>, <lon-max>]` — lat/lon bounding box.

Nullness / emptiness:
- `["is-null", {}, <expr>]` / `["not-null", {}, <expr>]`
- `["is-empty", {}, <expr>]` / `["not-empty", {}, <expr>]` — equivalent to is-null OR `= ""` for strings.

String (accept `{"case-sensitive": false}` in opts):
- `["starts-with", {}, <str>, <prefix>]`
- `["ends-with", {}, <str>, <suffix>]`
- `["contains", {}, <str>, <substring>]`
- `["does-not-contain", {}, <str>, <substring>]`

Temporal:
- `["time-interval", {}, <temporal>, <n-or-:current/:last/:next>, "<unit>"]` — relative window. Opts may set `{"include-current": true}`.
- `["during", {}, <temporal>, "<iso-date-or-datetime>", "<unit>"]` — value falls within the bucket containing the literal.
- `["relative-time-interval", {}, <temporal>, <value>, "<bucket>", <offset-value>, "<offset-bucket>"]` — window offset from now.

Named reference:
- `["segment", {}, "<portable_entity_id>"]` — reference a defined segment (preferred over inlining its definition). The segment's table must be the stage's `source-table`.

### Expressions

Arithmetic:
- `["+", {}, <a>, <b>, ...]` / `["-", {}, <a>, <b>, ...]` / `["*", {}, <a>, <b>, ...]` / `["/", {}, <a>, <b>, ...]`
- `["abs", {}, <num>]` / `["power", {}, <num>, <exp>]` / `["sqrt", {}, <num>]`
- `["exp", {}, <num>]` / `["log", {}, <num>]`
- `["ceil", {}, <num>]` / `["floor", {}, <num>]` / `["round", {}, <num>]`
- `["integer", {}, <num-or-str>]` / `["float", {}, <num-or-str>]`

String:
- `["concat", {}, <a>, <b>, ...]`
- `["substring", {}, <str>, <start>, <length>]` — 1-based start; length is optional.
- `["replace", {}, <str>, <old>, <new>]`
- `["regex-match-first", {}, <str>, <regex>]`
- `["split-part", {}, <str>, <sep>, <n>]`
- `["length", {}, <str>]`
- `["trim", {}, <str>]` / `["ltrim", {}, <str>]` / `["rtrim", {}, <str>]`
- `["upper", {}, <str>]` / `["lower", {}, <str>]`
- `["host", {}, <url>]` / `["domain", {}, <url>]` / `["subdomain", {}, <url>]` / `["path", {}, <url>]`
- `["month-name", {}, <int>]` / `["quarter-name", {}, <int>]` / `["day-name", {}, <int>]`
- `["text", {}, <expr>]` / `["collate", {}, <str>, <collation>]`

Conditional:
- `["case", {}, [[<pred1>, <expr1>], [<pred2>, <expr2>], ...], <default?>]` — alias: `if`.
- `["coalesce", {}, <a>, <b>, ...]`

Temporal:
- `["datetime-add", {}, <temporal>, <n>, "<unit>"]`
- `["datetime-subtract", {}, <temporal>, <n>, "<unit>"]`
- `["datetime-diff", {}, <left>, <right>, "<unit>"]` — `<unit>` is one of `second, minute, hour, day, week, month, quarter, year`.
- `["interval", {}, <n>, "<unit>"]`
- `["get-year", {}, <temporal>]` / `["get-month", {}, <temporal>]` / `["get-day", {}, <temporal>]` / `["get-quarter", {}, <temporal>]`
- `["get-hour", {}, <temporal>]` / `["get-minute", {}, <temporal>]` / `["get-second", {}, <temporal>]`
- `["get-week", {}, <temporal>]` / `["get-day-of-week", {}, <temporal>]` — both accept optional 4th-slot mode `"iso"`, `"us"`, `"instance"`.
- `["temporal-extract", {}, <temporal>, "<unit>"]` — extract one of the date/time extraction units listed below.
- `["convert-timezone", {}, <temporal>, "<target-tz>"]` — optional 4th slot is source tz.
- `["relative-datetime", {}, <n>, "<unit>"]` (or `["relative-datetime", {}, "current"]`)
- `["absolute-datetime", {}, "<iso-string>", "<unit?>"]`
- `["date", {}, <expr>]` / `["datetime", {}, <expr>]` / `["time", {}, <expr>]`
- `["now", {}]` / `["today", {}]`

### Temporal units (for `{"temporal-unit": ...}` on field refs and as `<unit>` args)

- Date truncation: `day`, `week`, `month`, `quarter`, `year`
- Date extraction (integer-returning): `day-of-week`, `day-of-month`, `day-of-year`, `week-of-year`, `month-of-year`, `quarter-of-year`, `year`, `year-of-era`
- Time truncation: `millisecond`, `second`, `minute`, `hour`
- Time extraction (integer-returning): `second-of-minute`, `minute-of-hour`, `hour-of-day`
- Plus `default` — let the system pick based on the field's base type.
