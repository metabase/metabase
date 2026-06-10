---
id: construct-notebook-query-operators
title: Construct notebook query — operator catalogs
description: The full catalog of aggregation, filter, expression, and temporal-unit operators for construct_notebook_query — load when you need the exact name/arity of a specific operator or the list of temporal units.
tools: [construct_notebook_query]
priority: 40
---
# Construct Query Reference — Operator catalogs

> Source of truth: `src/metabase/lib/schema/{aggregation,filter,temporal_bucketing}.cljc` and `src/metabase/lib/schema/expression/*.cljc`. If something seems missing here, attempt it — the schema may have grown.

These catalogs accompany `construct_notebook_query`. The clause shape and field references are in the **construct-notebook-query-core** skill.

## Aggregations

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

## Order-by direction

- `["asc", {}, <ref>]` / `["desc", {}, <ref>]` — wrap any field ref or aggregation ref.

## Filters

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

## Expressions

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

## Temporal units (for `{"temporal-unit": ...}` on field refs and as `<unit>` args)

- Date truncation: `day`, `week`, `month`, `quarter`, `year`
- Date extraction (integer-returning): `day-of-week`, `day-of-month`, `day-of-year`, `week-of-year`, `month-of-year`, `quarter-of-year`, `year`, `year-of-era`
- Time truncation: `millisecond`, `second`, `minute`, `hour`
- Time extraction (integer-returning): `second-of-minute`, `minute-of-hour`, `hour-of-day`
- Plus `default` — let the system pick based on the field's base type.
