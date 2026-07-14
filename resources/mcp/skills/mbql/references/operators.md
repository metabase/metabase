# MBQL operator catalog

Every clause is `["op", {options}, ...args]`. This catalog is the operators in common use, not a closed
set — if something you need is missing, try it and read the error, which names the rule it broke.

## Aggregations

- `["count", {}]` — count rows. An optional third slot counts non-NULL values of an expression.
- `["cum-count", {}]` — cumulative count.
- `["sum", {}, <num>]` · `["cum-sum", {}, <num>]` · `["avg", {}, <num>]`
- `["min", {}, <orderable>]` · `["max", {}, <orderable>]` · `["median", {}, <num>]`
- `["percentile", {}, <num>, <0..1>]`
- `["distinct", {}, <expr>]` — count of distinct non-NULL values.
- `["distinct-where", {}, <expr>, <pred>]` · `["count-where", {}, <pred>]` · `["sum-where", {}, <num>, <pred>]`
- `["share", {}, <pred>]` — fraction of rows where the predicate holds.
- `["stddev", {}, <num>]` · `["var", {}, <num>]`
- `["metric", {}, "<entity_id>"]` · `["measure", {}, "<entity_id>"]` — the metric's or measure's base
  table must be the stage's `source-table`.

## Order-by

`["asc", {}, <ref>]` · `["desc", {}, <ref>]`, wrapping a field ref or `["aggregation", {}, <index>]`.

## Filters

Boolean: `["and", {}, <pred>, <pred>, ...]` · `["or", {}, ...]` (both take ≥ 2) · `["not", {}, <pred>]`

Equality (variadic): `["=", {}, <a>, <b>]` · `["!=", {}, <a>, <b>]` ·
`["in", {}, <expr>, <v1>, <v2>, ...]` · `["not-in", {}, <expr>, <v1>, ...]`

Comparison: `["<", {}, <a>, <b>]` · `["<=", ...]` · `[">", ...]` · `[">=", ...]` ·
`["between", {}, <expr>, <min>, <max>]` ·
`["inside", {}, <lat>, <lon>, <lat-max>, <lon-min>, <lat-min>, <lon-max>]`

Nullness: `["is-null", {}, <expr>]` · `["not-null", {}, <expr>]` · `["is-empty", {}, <expr>]` ·
`["not-empty", {}, <expr>]`

String (options take `{"case-sensitive": false}`): `["starts-with", {}, <str>, <prefix>]` ·
`["ends-with", {}, <str>, <suffix>]` · `["contains", {}, <str>, <substring>]` ·
`["does-not-contain", {}, <str>, <substring>]`

Temporal:
- `["time-interval", {}, <temporal>, <n | "current" | "last" | "next">, "<unit>"]` — a relative window;
  options take `{"include-current": true}`.
- `["during", {}, <temporal>, "<iso-date>", "<unit>"]` — the value falls in the bucket containing the
  literal.
- `["relative-time-interval", {}, <temporal>, <value>, "<bucket>", <offset>, "<offset-bucket>"]`.

Named: `["segment", {}, "<entity_id>"]`.

## Expressions

Arithmetic: `["+", {}, <a>, <b>, ...]` · `["-", ...]` · `["*", ...]` · `["/", ...]` ·
`["abs", {}, <num>]` · `["power", {}, <num>, <exp>]` · `["sqrt", {}, <num>]` · `["exp", {}, <num>]` ·
`["log", {}, <num>]` · `["ceil", {}, <num>]` · `["floor", {}, <num>]` · `["round", {}, <num>]` ·
`["integer", {}, <x>]` · `["float", {}, <x>]`

String: `["concat", {}, <a>, <b>, ...]` · `["substring", {}, <str>, <start>, <length?>]` (1-based) ·
`["replace", {}, <str>, <old>, <new>]` · `["regex-match-first", {}, <str>, <regex>]` ·
`["split-part", {}, <str>, <sep>, <n>]` · `["length", {}, <str>]` · `["trim", {}, <str>]` ·
`["ltrim", ...]` · `["rtrim", ...]` · `["upper", {}, <str>]` · `["lower", {}, <str>]` ·
`["host", {}, <url>]` · `["domain", {}, <url>]` · `["subdomain", {}, <url>]` · `["path", {}, <url>]` ·
`["month-name", {}, <int>]` · `["quarter-name", {}, <int>]` · `["day-name", {}, <int>]` ·
`["text", {}, <expr>]`

Conditional: `["case", {}, [[<pred>, <expr>], ...], <default?>]` · `["coalesce", {}, <a>, <b>, ...]`

Temporal: `["datetime-add", {}, <temporal>, <n>, "<unit>"]` · `["datetime-subtract", ...]` ·
`["datetime-diff", {}, <left>, <right>, "<unit>"]` (`second` … `year`) · `["interval", {}, <n>, "<unit>"]` ·
`["get-year", {}, <temporal>]` · `["get-month", ...]` · `["get-day", ...]` · `["get-quarter", ...]` ·
`["get-hour", ...]` · `["get-minute", ...]` · `["get-second", ...]` · `["get-week", ...]` ·
`["get-day-of-week", ...]` (both take an optional `"iso" | "us" | "instance"` mode) ·
`["temporal-extract", {}, <temporal>, "<unit>"]` · `["convert-timezone", {}, <temporal>, "<tz>"]` ·
`["relative-datetime", {}, <n>, "<unit>"]` · `["absolute-datetime", {}, "<iso>", "<unit?>"]` ·
`["now", {}]` · `["today", {}]`

Window: `["offset", {}, <expr>, <n>]` — the value `n` rows back (negative) or ahead (positive). Valid
only inside `aggregation` or `order-by`, never in `expressions` or a filter.

## Temporal units

- Truncation: `millisecond`, `second`, `minute`, `hour`, `day`, `week`, `month`, `quarter`, `year`
- Extraction (returns an integer): `second-of-minute`, `minute-of-hour`, `hour-of-day`, `day-of-week`,
  `day-of-month`, `day-of-year`, `week-of-year`, `month-of-year`, `quarter-of-year`, `year-of-era`
- `default` — let the field's base type decide.

Extracted quarters are the numbers `1`–`4`, never `"Q1"`.

## Canonical names

These are auto-corrected but write them correctly, so the query you save matches the query you read
back: `count-where` (not `count-if`), `var` (not `variance`), `stddev` (not `stddev-pop`), `distinct`
(not `count-distinct`), `get-day-of-week` (not `dayofweek`), `get-hour` (not `hour-of-day` as an
operator), `get-month`, `get-quarter`, `datetime-diff` (not `temporal-diff`), `relative-datetime` (not
`relative-date`).
