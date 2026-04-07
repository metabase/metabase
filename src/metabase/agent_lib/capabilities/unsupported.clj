(ns metabase.agent-lib.capabilities.unsupported
  "Guidance for unsupported or rewritten helper names in structured programs.

  This catalog feeds the LLM system prompt with `do-not-use` guidance and
  retry-shape/example fragments. It is *prompt-time* help, distinct from the
  *runtime* repair layer in `metabase.agent-lib.repair.normalize.forms`:

  - Many entries listed here (e.g. `dayofweek`, `month-of-year`, `temporal-diff`,
    `count-if`, `variance`, `stddev-pop`, `count-distinct`, `is-not-null`) also
    have a deterministic alias rewrite in the repair layer. For those, the
    agent never actually sees a validation error — repair silently rewrites the
    operator before validation. The entries here exist so the model learns the
    canonical name from the prompt and emits it directly the next time.
  - Other entries (e.g. `avg-where`) have no safe automatic rewrite — the agent
    must restructure the program (e.g. introduce a conditional expression).
    Those entries are the only ones that surface as actual retry guidance when
    the model gets it wrong.

  When adding a new entry, decide whether the rewrite is mechanical (also add
  it to the repair layer) or structural (prompt-only).")

(set! *warn-on-reflection* true)

(def ^{:doc "Unsupported helper rewrite guidance keyed by unsupported operator name."}
  unsupported-rewrite-catalog
  {"avg-where"
   {:summary       "`avg-where` is not supported."
    :prompt-notes  ["Do not invent lookalike helpers. `avg-where` does not exist."
                    "Supported conditional aggregation helpers are `sum-where`, `count-where`, `distinct-where`, and `share` when it matches the question exactly."
                    "For a conditional average, define a conditional numeric expression with `case`, then aggregate `avg` over `expression-ref`."]
    :retry-notes   ["Supported conditional aggregation helpers are `sum-where`, `count-where`, and `distinct-where`."
                    "For a conditional average, first define a conditional numeric expression with `case`, then aggregate `avg` over `expression-ref`."]
    :retry-shape   "Use a conditional numeric expression and then aggregate `avg` over `expression-ref`."
    :retry-example (str "[\n"
                        "  [\"expression\", \"Won Amount\", [\"case\", [[[\"=\", [\"field\", 101], true], [\"field\", 201]]]]],\n"
                        "  [\"aggregate\", [\"avg\", [\"expression-ref\", \"Won Amount\"]]]\n"
                        "]")}
   "count-if"
   {:summary       "`count-if` is not supported."
    :prompt-notes  ["Use `count-where` for conditional counts."
                    "Do not invent `count-if`; the canonical helper is `count-where`."]
    :retry-shape   "Use `count-where` with a boolean filter clause."
    :retry-example "[\"aggregate\", [\"count-where\", [\"=\", [\"field\", 101], \"completed\"]]]"}
   "variance"
   {:summary       "`variance` is not supported."
    :prompt-notes  ["Use `var` for variance aggregations."]
    :retry-shape   "Use `var` with a numeric field or expression."
    :retry-example "[\"aggregate\", [\"var\", [\"field\", 201]]]"}
   "stddev-pop"
   {:summary       "`stddev-pop` is not supported."
    :prompt-notes  ["Use `stddev` for standard deviation aggregations."]
    :retry-shape   "Use `stddev` with a numeric field or expression."
    :retry-example "[\"aggregate\", [\"stddev\", [\"field\", 201]]]"}
   "count-distinct"
   {:summary       "`count-distinct` is not supported."
    :prompt-notes  ["Use `distinct` for distinct-count aggregations."]
    :retry-shape   "Use `distinct` with a field or expression."
    :retry-example "[\"aggregate\", [\"distinct\", [\"field\", 201]]]"}
   "distinct-count"
   {:summary       "`distinct-count` is not supported."
    :prompt-notes  ["Use `distinct` for distinct-count aggregations."]
    :retry-shape   "Use `distinct` with a field or expression."
    :retry-example "[\"aggregate\", [\"distinct\", [\"field\", 201]]]"}
   "is"
   {:summary       "`is` is not supported."
    :prompt-notes  ["Use `=` for ordinary equality filters."
                    "Use `is-null` when comparing to null."]
    :retry-shape   "Use `=` for value equality or `is-null` for null checks."
    :retry-example "[\"filter\", [\"=\", [\"field\", 101], \"active\"]]"}
   "is-not"
   {:summary       "`is-not` is not supported."
    :prompt-notes  ["Use `!=` for ordinary inequality filters."
                    "Use `not-null` when excluding nulls."]
    :retry-shape   "Use `!=` for value inequality or `not-null` for null checks."
    :retry-example "[\"filter\", [\"!=\", [\"field\", 101], \"archived\"]]"}
   "is-not-null"
   {:summary       "`is-not-null` is not supported."
    :prompt-notes  ["Use `not-null` for null exclusion filters."]
    :retry-shape   "Use `not-null` with a field or expression."
    :retry-example "[\"filter\", [\"not-null\", [\"field\", 101]]]"}
   "dayofweek"
   {:summary       "`dayofweek` is not supported."
    :prompt-notes  ["Use `get-day-of-week` to extract weekday values from a date or datetime."]
    :retry-shape   "Use `get-day-of-week` with a date or datetime expression."
    :retry-example "[\"expression\", \"Weekday\", [\"get-day-of-week\", [\"field\", 302]]]"}
   "day-of-week"
   {:summary       "`day-of-week` is not supported as a helper or bucket name."
    :prompt-notes  ["Use `get-day-of-week` for weekday extraction instead of inventing `day-of-week` buckets."]
    :retry-shape   "Use `get-day-of-week` when you need weekday breakout or filtering."
    :retry-example "[\"breakout\", [\"get-day-of-week\", [\"field\", 302]]]"}
   "month-of-year"
   {:summary       "`month-of-year` is not supported as a helper or bucket name."
    :prompt-notes  ["Use `get-month` for month-number extraction instead of inventing `month-of-year`."]
    :retry-shape   "Use `get-month` when you need month-number breakout or filtering."
    :retry-example "[\"breakout\", [\"get-month\", [\"field\", 302]]]"}
   "hour-of-day"
   {:summary       "`hour-of-day` is not supported as a helper or bucket name."
    :prompt-notes  ["Use `get-hour` for hour extraction instead of inventing `hour-of-day` buckets."]
    :retry-shape   "Use `get-hour` when you need hour-of-day breakout or filtering."
    :retry-example "[\"breakout\", [\"get-hour\", [\"field\", 302]]]"}
   "quarter-of-year"
   {:summary       "`quarter-of-year` is not supported as a helper or bucket name."
    :prompt-notes  ["Use `get-quarter` for quarter-number extraction instead of inventing `quarter-of-year` buckets."]
    :retry-shape   "Use `get-quarter` when you need quarter breakout or filtering."
    :retry-example "[\"breakout\", [\"get-quarter\", [\"field\", 302]]]"}
   "temporal-diff"
   {:summary       "`temporal-diff` is not supported."
    :prompt-notes  ["Use `datetime-diff` to calculate the number of units between two temporal values."
                    "Do not subtract dates with `-` when you need a date or datetime difference."]
    :retry-shape   "Use `datetime-diff` with two temporal expressions and a unit."
    :retry-example "[\"expression\", \"Days Between\", [\"datetime-diff\", [\"field\", 302], [\"field\", 303], \"day\"]]"}})
