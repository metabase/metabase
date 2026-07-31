# Operator catalog — portable MBQL 5

Every operator for `execute_query` / `question_write` queries; structure rules (options at position 1, name-based refs) are in the skill body. `<field>` abbreviates `["field", {}, ["<db>", "<schema-or-null>", "<table>", "<column>"]]` (or a string-name ref against a previous stage).

## Filters

Boolean:
- `["and", {}, <pred>, <pred>, ...]` / `["or", {}, <pred>, <pred>, ...]` — min 2 args.
- `["not", {}, <pred>]`

Equality / membership (variadic):
- `["=", {}, <a>, <b>, ...]` / `["!=", {}, <a>, <b>, ...]`
- `["in", {}, <expr>, <v1>, <v2>, ...]` / `["not-in", …]` — canonical for multi-value categorical filters.

Comparison:
- `["<", {}, <a>, <b>]` / `["<=", …]` / `[">", …]` / `[">=", …]`
- `["between", {}, <expr>, <min>, <max>]` — inclusive.
- `["inside", {}, <lat-expr>, <lon-expr>, <lat-max>, <lon-min>, <lat-min>, <lon-max>]` — geographic bounding box.

Null / empty:
- `["is-null", {}, <expr>]` / `["not-null", {}, <expr>]`
- `["is-empty", {}, <expr>]` / `["not-empty", {}, <expr>]` — NULL-or-`""` for strings.

String match (options may carry `{"case-sensitive": false}`):
- `["contains", {}, <str>, <substring>]` / `["does-not-contain", …]`
- `["starts-with", {}, <str>, <prefix>]` / `["ends-with", {}, <str>, <suffix>]`

Temporal:
- `["time-interval", {}, <temporal>, <n | "current" | "last" | "next">, "<unit>"]` — relative window; options may set `{"include-current": true}`.
- `["during", {}, <temporal>, "<iso-date-or-datetime>", "<unit>"]` — value within the bucket containing the literal.
- `["relative-time-interval", {}, <temporal>, <value>, "<bucket>", <offset-value>, "<offset-bucket>"]` — window offset from now.
- Absolute ranges: `["between", {}, <temporal>, "2024-01-01", "2024-12-31"]`.

Named reference:
- `["segment", {}, "<entity_id>"]` — a saved segment; its table must be the stage's source.

## Aggregations

- `["count", {}]` — all rows; optional 3rd slot `<expr>` counts non-NULL.
- `["sum", {}, <num>]` / `["avg", {}, <num>]` / `["min", {}, <orderable>]` / `["max", {}, <orderable>]`
- `["median", {}, <num>]` / `["percentile", {}, <num>, <0..1>]`
- `["distinct", {}, <expr>]` — count of distinct values.
- `["cum-count", {}]` / `["cum-sum", {}, <num>]` — running totals.
- `["stddev", {}, <num>]` / `["var", {}, <num>]`
- `["count-where", {}, <bool-pred>]` / `["sum-where", {}, <num>, <bool-pred>]` / `["distinct-where", {}, <expr>, <bool-pred>]`
- `["share", {}, <bool-pred>]` — fraction of rows where the predicate holds, 0–1.
- `["metric", {}, "<entity_id>"]` / `["measure", {}, "<entity_id>"]` — saved definitions; base table must be the stage's source.
- `["offset", {}, <expr>, <n>]` — window function: the value `<n>` rows back (negative) or ahead. Valid **only** inside `aggregation` or `order-by`, never in `expressions` or a filter.

Name the output in options — `["sum", {"name": "revenue", "display-name": "Revenue"}, <field>]`; later stages and visualization settings reference that `name`.

## Order-by

- `["asc", {}, <ref>]` / `["desc", {}, <ref>]` — wraps a field ref or `["aggregation", {}, <0-based index>]`.

## Expressions

Arithmetic / math:
- `["+", {}, <a>, <b>, ...]` / `["-", …]` / `["*", …]` / `["/", …]` (division always returns float)
- `["abs", {}, <num>]`, `["ceil", …]`, `["floor", …]`, `["round", …]`
- `["power", {}, <base>, <exp>]`, `["sqrt", {}, <num>]`, `["exp", …]`, `["log", …]`
- `["integer", {}, <num-or-str>]` / `["float", {}, <str>]` / `["text", {}, <expr>]`

String:
- `["concat", {}, <a>, <b>, ...]`
- `["substring", {}, <str>, <start (1-based)>, <length?>]`
- `["replace", {}, <str>, <find>, <replacement>]`
- `["regex-match-first", {}, <str>, <regex>]`
- `["split-part", {}, <str>, <delimiter>, <position>]`
- `["length", {}, <str>]`, `["trim", …]`, `["ltrim", …]`, `["rtrim", …]`, `["upper", …]`, `["lower", …]`
- `["host", {}, <url>]`, `["domain", …]`, `["subdomain", …]`, `["path", …]`
- `["month-name", {}, <int>]`, `["quarter-name", {}, <int>]`, `["day-name", {}, <int>]`

Conditional:
- `["case", {}, [[<pred1>, <val1>], [<pred2>, <val2>], ...], <default?>]` — alias `if`.
- `["coalesce", {}, <a>, <b>, ...]` — first non-null.

Temporal:
- `["datetime-add", {}, <temporal>, <n>, "<unit>"]` / `["datetime-subtract", …]`
- `["datetime-diff", {}, <left>, <right>, "<unit>"]` — unit ∈ `second minute hour day week month quarter year`; the only supported date subtraction.
- `["interval", {}, <n>, "<unit>"]`
- `["get-year", {}, <t>]`, `["get-quarter", …]`, `["get-month", …]`, `["get-day", …]`, `["get-hour", …]`, `["get-minute", …]`, `["get-second", …]`
- `["get-week", {}, <t>, "<mode?>"]` / `["get-day-of-week", {}, <t>, "<mode?>"]` — mode `"iso"` / `"us"` / `"instance"`.
- `["temporal-extract", {}, <t>, "<unit>"]`
- `["convert-timezone", {}, <t>, "<target-tz>", "<source-tz?>"]`
- `["relative-datetime", {}, <n>, "<unit>"]` (or `["relative-datetime", {}, "current"]`) / `["absolute-datetime", {}, "<iso>", "<unit?>"]`
- `["date", {}, <expr>]` / `["datetime", {}, <expr>]` / `["time", {}, <expr>]`
- `["now", {}]` / `["today", {}]`

Extracted quarter/month/week values are **numbers** (`1`–`4` for quarters), never strings like `"Q1"`.

## Field options

Temporal bucketing — `{"temporal-unit": "..."}` on a field ref:
- Truncation: `day`, `week`, `month`, `quarter`, `year`, plus `minute`, `hour`, `second`, `millisecond` for times.
- Extraction (integer-returning): `day-of-week`, `day-of-month`, `day-of-year`, `week-of-year`, `month-of-year`, `quarter-of-year`, `year-of-era`, `hour-of-day`, `minute-of-hour`, `second-of-minute`.
- `default` — let the system pick.

Binning — `{"binning": {...}}` on a numeric/coordinate field ref in a breakout:
- `{"strategy": "num-bins", "num-bins": 10}` — fixed count of equal-width bins.
- `{"strategy": "bin-width", "bin-width": 5}` — fixed width.
- `{"strategy": "default"}` — Metabase chooses.

## Canonical spellings

Near-misses are auto-corrected, but write the canonical name so later reads match: `count-where` (not `count-if`), `var` (not `variance`), `stddev` (not `stddev-pop`), `distinct` (not `count-distinct`), `get-day-of-week` (not `dayofweek`), `get-hour`/`get-month`/`get-quarter` (not `hour-of-day` etc. as operators), `datetime-diff` (not `temporal-diff`), `relative-datetime` (not `relative-date`). Clause heads are lowercase and hyphenated, never underscored or camelCase.
