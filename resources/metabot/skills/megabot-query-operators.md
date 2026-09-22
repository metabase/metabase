---
id: megabot-query-operators
title: Structured query operators
description: Every filter, aggregation, expression, and temporal-unit operator run_warehouse_query accepts, with its arguments. Load it when you need an operator the structured-query section leaves out, or after an unknown-operator rejection.
profiles: [megabot]
---
## Structured query operators

The clause shape (options map at position 1, numeric-id references) is in "Structured warehouse queries". Below,
`<field>` stands for `["field", {}, <field id>]`, or a name reference on a model or in a later stage.

### Filters

Boolean:
- `["and", {}, <filter>, <filter>, ...]` / `["or", …]`: at least 2 arguments.
- `["not", {}, <filter>]`

Equality and membership:
- `["=", {}, <a>, <b>]` / `["!=", …]`
- `["in", {}, <expr>, <v1>, <v2>, ...]` / `["not-in", …]`: for several values, rather than `=` with a list.

Comparison:
- `["<", {}, <a>, <b>]` / `["<=", …]` / `[">", …]` / `[">=", …]`
- `["between", {}, <expr>, <min>, <max>]`: inclusive.
- `["inside", {}, <lat-expr>, <lon-expr>, <lat-max>, <lon-min>, <lat-min>, <lon-max>]`: a latitude/longitude box.

Missing values:
- `["is-null", {}, <expr>]` / `["not-null", {}, <expr>]`
- `["is-empty", {}, <expr>]` / `["not-empty", {}, <expr>]`: null or `""` for text.

Text (options may set `{"case-sensitive": false}`):
- `["contains", {}, <text>, <substring>]` / `["does-not-contain", …]`
- `["starts-with", {}, <text>, <prefix>]` / `["ends-with", {}, <text>, <suffix>]`

Dates:
- `["time-interval", {}, <date>, <n | "current" | "last" | "next">, "<unit>"]`: relative to today; a negative `n`
  is the past. Options may set `{"include-current": true}`.
- `["during", {}, <date>, "<iso date>", "<unit>"]`: within the period containing that date.
- `["relative-time-interval", {}, <date>, <n>, "<unit>", <offset n>, "<offset unit>"]`: a relative period, shifted.
- `["between", {}, <date>, "2024-01-01", "2024-12-31"]`: an absolute range.

Saved filter:
- `["segment", {}, <segment id>]`: its table must be the stage's `source-table`.

### Aggregations

- `["count", {}]`: rows. With a 3rd argument `<expr>`, counts non-null values.
- `["sum", {}, <number>]` / `["avg", …]` / `["median", …]` / `["min", {}, <orderable>]` / `["max", …]`
- `["percentile", {}, <number>, <0..1>]`
- `["distinct", {}, <expr>]`: count of distinct values.
- `["count-where", {}, <filter>]` / `["sum-where", {}, <number>, <filter>]` / `["distinct-where", {}, <expr>, <filter>]`
- `["share", {}, <filter>]`: the fraction of rows matching, from 0 to 1.
- `["cum-count", {}]` / `["cum-sum", {}, <number>]`: running totals over the breakout.
- `["stddev", {}, <number>]` / `["var", {}, <number>]`
- `["metric", {}, <metric id>]` / `["measure", {}, <measure id>]`: saved definitions, on their own source.
- `["offset", {}, <aggregation>, <n>]`: the value `n` rows back (negative) or ahead. Only in `aggregation` or
  `order-by`, never in `expressions` or a filter.
- Arithmetic over aggregations is an aggregation too: `["/", {}, ["sum", {}, <a>], ["count", {}]]`.

Name an output in its options: `["sum", {"name": "revenue", "display-name": "Revenue"}, <field>]`.

### Sorting

- `["asc", {}, <ref>]` / `["desc", {}, <ref>]`, around a column or `["aggregation", {}, <0-based index>]`.

### Expressions

Math:
- `["+", {}, <a>, <b>, ...]` / `["-", …]` / `["*", …]` / `["/", …]`: division always returns a decimal.
- `["abs", {}, <n>]`, `["ceil", …]`, `["floor", …]`, `["round", …]`, `["sqrt", …]`, `["exp", …]`, `["log", …]`,
  `["power", {}, <base>, <exponent>]`
- `["integer", {}, <number or text>]` / `["float", {}, <text>]` / `["text", {}, <expr>]`

Text:
- `["concat", {}, <a>, <b>, ...]`
- `["substring", {}, <text>, <start>, <length>]`: `start` counts from 1; `length` is optional.
- `["replace", {}, <text>, <find>, <replacement>]`, `["regex-match-first", {}, <text>, <regex>]`,
  `["split-part", {}, <text>, <delimiter>, <position>]`
- `["length", {}, <text>]`, `["trim", …]`, `["ltrim", …]`, `["rtrim", …]`, `["upper", …]`, `["lower", …]`
- `["host", {}, <url>]`, `["domain", …]`, `["subdomain", …]`, `["path", …]`
- `["month-name", {}, <n>]`, `["quarter-name", {}, <n>]`, `["day-name", {}, <n>]`

Conditions:
- `["case", {}, [[<filter 1>, <value 1>], [<filter 2>, <value 2>]], <default>]`: the default is optional.
- `["coalesce", {}, <a>, <b>, ...]`: the first non-null value.

Dates:
- `["datetime-add", {}, <date>, <n>, "<unit>"]` / `["datetime-subtract", …]`
- `["datetime-diff", {}, <start>, <end>, "<unit>"]`: the only way to subtract dates. Unit is `second`, `minute`,
  `hour`, `day`, `week`, `month`, `quarter`, or `year`.
- `["get-year", {}, <date>]`, `["get-quarter", …]`, `["get-month", …]`, `["get-day", …]`, `["get-hour", …]`,
  `["get-minute", …]`, `["get-second", …]`
- `["get-week", {}, <date>, "<mode>"]` / `["get-day-of-week", {}, <date>, "<mode>"]`: mode is `iso`, `us`, or
  `instance`, and optional.
- `["convert-timezone", {}, <date>, "<target zone>", "<source zone>"]`: the source zone is optional.
- `["now", {}]`, `["today", {}]`, `["relative-datetime", {}, <n>, "<unit>"]`,
  `["absolute-datetime", {}, "<iso date>", "<unit>"]`
- `["date", {}, <expr>]` / `["datetime", {}, <expr>]`

Extracted quarters, months, and weeks are numbers (`1` to `4` for quarters), never text like `"Q1"`.

### Column options

Grouping by time, `{"temporal-unit": "<unit>"}` on a date column:
- Truncate: `minute`, `hour`, `day`, `week`, `month`, `quarter`, `year`.
- Extract a number: `hour-of-day`, `day-of-week`, `day-of-month`, `day-of-year`, `week-of-year`, `month-of-year`,
  `quarter-of-year`.

Binning, `{"binning": {...}}` on a number column in `breakout`:
- `{"strategy": "num-bins", "num-bins": 10}`, `{"strategy": "bin-width", "bin-width": 5}`, or
  `{"strategy": "default"}`.

### Spelling

Near-misses are corrected for you, but write the canonical name: `count-where` (not `count-if`), `distinct` (not
`count-distinct`), `var` (not `variance`), `stddev`, `get-day-of-week` (not `dayofweek`), `datetime-diff` (not
`temporal-diff`), `relative-datetime` (not `relative-date`). Operator names are lowercase and hyphenated.
