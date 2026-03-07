# MBQL Query Construction

MBQL (Metabase Query Language) queries are constructed using Clojure code evaluated by the `construct-query` command. The code uses `metabase.lib` functions — the same library powering Metabase's visual query builder. Queries are correct by construction: if the code evaluates, the query is valid.

## Workflow

```bash
# 1. Discover schema (get table names and field names)
./metabase-agent get-table <table_id>

# 2. Construct and run MBQL query in one step
./metabase-agent construct-query --database-id <id> --run --clj '<clojure code>'

# OR: construct MBQL JSON, then use with other commands
./metabase-agent construct-query --database-id <id> --clj '<clojure code>'
# --> returns MBQL JSON to pass to create-question, execute-query, create-transform, or create-measure
```

## construct-query Command

```bash
# Return MBQL JSON
./metabase-agent construct-query --database-id <id> --clj '<code>'

# Construct AND execute in one step (returns query results)
./metabase-agent construct-query --database-id <id> --run --clj '<code>'
```

Without `--run`, returns legacy MBQL JSON that can be passed to:
- `create-question --json '{"query": <result>, ...}'`
- `execute-query --json '{"query": <result>, ...}'`
- `create-transform --json '{"query": <result>, ...}'`
- `create-measure --json '{"definition": <result>, ...}'`

With `--run`, executes the query and returns results directly (columns, rows, metadata).

## Helper Functions

### `table` — Look up table metadata

```clojure
(table "ORDERS")   ; by name (case-insensitive)
(table 42)         ; by numeric ID
```

Both string names and numeric IDs are accepted. Names are case-insensitive. On error, lists available tables with their IDs.

### `field` — Look up field metadata

```clojure
(field "ORDERS" "TOTAL")   ; by table name + field name (case-insensitive)
(field "total")            ; by field name only (searches all tables)
(field 123)                ; by numeric ID
```

**Two-arity** `(field "TABLE" "FIELD")` is the explicit form — always unambiguous.

**Single-arity** `(field "name")` searches across all tables. If the field name exists in exactly one table, it resolves automatically. If ambiguous (exists in multiple tables), it throws an error listing which tables have that field.

**Numeric ID** `(field 123)` looks up by field ID directly.

### `query` — Create a new query

```clojure
(query (table "ORDERS"))   ; pass table metadata from (table ...)
```

## Function Reference

All functions are available at the top level — no namespace prefix needed. The query is built using threading: `(-> (query ...) (filter ...) (aggregate ...) ...)`.

### Filtering (22 functions)

| Function | Signature | Description |
|----------|-----------|-------------|
| `filter` | `(filter query clause)` | Add a filter clause to a query |
| `=` | `(= field value)` | Equal to |
| `!=` | `(!= field value)` | Not equal to |
| `<` | `(< field value)` | Less than |
| `<=` | `(<= field value)` | Less than or equal |
| `>` | `(> field value)` | Greater than |
| `>=` | `(>= field value)` | Greater than or equal |
| `between` | `(between field low high)` | Between two values (inclusive) |
| `contains` | `(contains field string)` | String contains |
| `does-not-contain` | `(does-not-contain field string)` | String does not contain |
| `starts-with` | `(starts-with field string)` | String starts with |
| `ends-with` | `(ends-with field string)` | String ends with |
| `is-null` | `(is-null field)` | Value is null |
| `not-null` | `(not-null field)` | Value is not null |
| `is-empty` | `(is-empty field)` | Empty string |
| `not-empty` | `(not-empty field)` | Not empty string |
| `in` | `(in field [v1 v2 ...])` | Value in set |
| `not-in` | `(not-in field [v1 v2 ...])` | Value not in set |
| `time-interval` | `(time-interval field n unit)` | Within time interval (e.g., last 30 days) |
| `and` | `(and clause1 clause2 ...)` | Logical AND of filter clauses |
| `or` | `(or clause1 clause2 ...)` | Logical OR of filter clauses |
| `not` | `(not clause)` | Negate a filter clause |
| `inside` | `(inside lat-field lon-field n s e w)` | Geographic bounding box filter |

#### Filtering Examples

```clojure
;; Simple equality filter
(-> (query (table "ORDERS"))
    (filter (= (field "ORDERS" "STATUS") "completed")))

;; Compound filter with AND/OR
(-> (query (table "ORDERS"))
    (filter (and (>= (field "ORDERS" "TOTAL") 100)
                 (or (= (field "ORDERS" "STATUS") "completed")
                     (= (field "ORDERS" "STATUS") "shipped")))))

;; Time interval: orders from the last 30 days
(-> (query (table "ORDERS"))
    (filter (time-interval (field "ORDERS" "CREATED_AT") -30 :day)))

;; Null check
(-> (query (table "ORDERS"))
    (filter (not-null (field "ORDERS" "DISCOUNT"))))

;; String matching
(-> (query (table "PRODUCTS"))
    (filter (contains (field "PRODUCTS" "TITLE") "Widget")))
```

### Aggregation (17 functions)

| Function | Signature | Description |
|----------|-----------|-------------|
| `aggregate` | `(aggregate query clause)` | Add an aggregation to a query |
| `count` | `(count)` | Count rows |
| `sum` | `(sum field)` | Sum of values |
| `avg` | `(avg field)` | Average |
| `min` | `(min field)` | Minimum |
| `max` | `(max field)` | Maximum |
| `distinct` | `(distinct field)` | Count distinct values |
| `median` | `(median field)` | Median value |
| `stddev` | `(stddev field)` | Standard deviation |
| `var` | `(var field)` | Variance |
| `percentile` | `(percentile field p)` | Percentile (p between 0 and 1) |
| `share` | `(share clause)` | Proportion of rows matching a filter |
| `count-where` | `(count-where clause)` | Count rows matching a filter |
| `sum-where` | `(sum-where field clause)` | Sum where filter matches |
| `distinct-where` | `(distinct-where field clause)` | Distinct count where filter matches |
| `cum-count` | `(cum-count)` | Cumulative count |
| `cum-sum` | `(cum-sum field)` | Cumulative sum |

#### Aggregation Result Column Names

When a query has aggregations, the result columns are auto-named by operator:
- First of each type: `count`, `sum`, `avg`, `min`, `max`, etc.
- Duplicates get a suffix: `sum_2`, `sum_3`, `count_2`, etc.

Use these names in `visualization.y_axis` when creating questions:
```json
{"visualization": {"y_axis": ["sum", "count"]}}
```

#### Aggregation Examples

```clojure
;; Simple count
(-> (query (table "ORDERS"))
    (aggregate (count)))

;; Multiple aggregations (result columns: "sum", "count", "avg")
(-> (query (table "ORDERS"))
    (aggregate (sum (field "ORDERS" "TOTAL")))
    (aggregate (count))
    (aggregate (avg (field "ORDERS" "TOTAL"))))

;; Conditional aggregation: count of completed orders
(-> (query (table "ORDERS"))
    (aggregate (count-where (= (field "ORDERS" "STATUS") "completed"))))

;; Percentage of completed orders
(-> (query (table "ORDERS"))
    (aggregate (share (= (field "ORDERS" "STATUS") "completed"))))

;; 95th percentile of order totals
(-> (query (table "ORDERS"))
    (aggregate (percentile (field "ORDERS" "TOTAL") 0.95)))
```

### Breakout / Grouping (3 functions)

| Function | Signature | Description |
|----------|-----------|-------------|
| `breakout` | `(breakout query field-or-expr)` | Group results by a column |
| `with-temporal-bucket` | `(with-temporal-bucket field bucket)` | Apply time bucketing to a column |
| `with-binning` | `(with-binning field strategy)` | Apply numeric binning |

**Temporal bucket values**: `:minute`, `:hour`, `:day`, `:week`, `:month`, `:quarter`, `:year`, `:minute-of-hour`, `:hour-of-day`, `:day-of-week`, `:day-of-month`, `:day-of-year`, `:week-of-year`, `:month-of-year`, `:quarter-of-year`

#### Breakout Examples

```clojure
;; Group by month
(-> (query (table "ORDERS"))
    (aggregate (sum (field "ORDERS" "TOTAL")))
    (breakout (with-temporal-bucket (field "ORDERS" "CREATED_AT") :month)))

;; Group by multiple columns
(-> (query (table "ORDERS"))
    (aggregate (count))
    (breakout (field "ORDERS" "STATUS"))
    (breakout (with-temporal-bucket (field "ORDERS" "CREATED_AT") :quarter)))

;; Group by day of week (for pattern analysis)
(-> (query (table "ORDERS"))
    (aggregate (count))
    (breakout (with-temporal-bucket (field "ORDERS" "CREATED_AT") :day-of-week)))
```

### Ordering and Limiting (4 functions)

| Function | Signature | Description |
|----------|-----------|-------------|
| `order-by` | `(order-by query orderable)` | Sort ascending (default) |
| `order-by` | `(order-by query orderable :desc)` | Sort with explicit direction |
| `order-by` | `(order-by query :desc orderable)` | Direction-first syntax (also works) |
| `order-by` | `(order-by query (desc orderable))` | Using desc/asc wrappers |
| `asc` | `(asc orderable)` | Mark for ascending sort |
| `desc` | `(desc orderable)` | Mark for descending sort |
| `limit` | `(limit query n)` | Limit number of rows |

`order-by` accepts field metadata, aggregation clauses, and breakout columns. For aggregations (like `(sum ...)`), it automatically finds the matching orderable column.

#### Order/Limit Examples

```clojure
;; Top 10 orders by total, descending
(-> (query (table "ORDERS"))
    (order-by (field "ORDERS" "TOTAL") :desc)
    (limit 10))

;; Same thing using desc wrapper
(-> (query (table "ORDERS"))
    (order-by (desc (field "ORDERS" "TOTAL")))
    (limit 10))

;; Direction-first syntax (also valid)
(-> (query (table "ORDERS"))
    (order-by :desc (field "ORDERS" "TOTAL"))
    (limit 10))

;; Order by aggregation result — top categories by revenue
(-> (query (table "ORDERS"))
    (aggregate (sum (field "ORDERS" "TOTAL")))
    (breakout (field "ORDERS" "STATUS"))
    (order-by (desc (sum (field "ORDERS" "TOTAL")))))

;; Revenue by month, chronological order
(-> (query (table "ORDERS"))
    (aggregate (sum (field "ORDERS" "TOTAL")))
    (breakout (with-temporal-bucket (field "ORDERS" "CREATED_AT") :month))
    (order-by (with-temporal-bucket (field "ORDERS" "CREATED_AT") :month) :asc))
```

### Expressions (35+ functions)

Named expressions create computed columns. Wrap each in `(expression query "name" expr)`.

#### Arithmetic

| Function | Example |
|----------|---------|
| `+` | `(+ (field "T" "A") (field "T" "B"))` |
| `-` | `(- (field "T" "PRICE") (field "T" "COST"))` |
| `*` | `(* (field "T" "QTY") (field "T" "PRICE"))` |
| `/` | `(/ (field "T" "TOTAL") (field "T" "COUNT"))` |

#### Conditional

| Function | Signature | Description |
|----------|-----------|-------------|
| `case` | `(case [[cond1 val1] [cond2 val2] ...])` | Case expression with condition/value pairs |
| `coalesce` | `(coalesce field1 field2 ...)` | First non-null value |

#### String Functions

| Function | Signature | Description |
|----------|-----------|-------------|
| `concat` | `(concat str1 str2 ...)` | Concatenate strings |
| `substring` | `(substring field start length)` | Extract substring (1-indexed) |
| `replace` | `(replace field old new)` | Replace occurrences |
| `upper` | `(upper field)` | Uppercase |
| `lower` | `(lower field)` | Lowercase |
| `trim` | `(trim field)` | Trim whitespace |
| `ltrim` | `(ltrim field)` | Trim leading whitespace |
| `rtrim` | `(rtrim field)` | Trim trailing whitespace |
| `length` | `(length field)` | String length |
| `regex-match-first` | `(regex-match-first field pattern)` | First regex match |

#### Math Functions

| Function | Description |
|----------|-------------|
| `abs` | Absolute value |
| `ceil` | Ceiling |
| `floor` | Floor |
| `round` | Round |
| `power` | Power (`(power field exp)`) |
| `sqrt` | Square root |
| `log` | Natural logarithm |
| `exp` | e^x |

#### Temporal Functions

| Function | Signature | Description |
|----------|-----------|-------------|
| `now` | `(now)` | Current timestamp |
| `relative-datetime` | `(relative-datetime n unit)` | Relative time (e.g., -7 :day) |
| `absolute-datetime` | `(absolute-datetime str unit)` | Parse absolute datetime |
| `datetime-add` | `(datetime-add field n unit)` | Add time to datetime |
| `datetime-subtract` | `(datetime-subtract field n unit)` | Subtract time from datetime |
| `get-year` | `(get-year field)` | Extract year |
| `get-quarter` | `(get-quarter field)` | Extract quarter (1-4) |
| `get-month` | `(get-month field)` | Extract month (1-12) |
| `get-week` | `(get-week field)` | Extract week of year |
| `get-day` | `(get-day field)` | Extract day of month |
| `get-day-of-week` | `(get-day-of-week field)` | Extract day of week (1-7) |
| `get-hour` | `(get-hour field)` | Extract hour (0-23) |
| `get-minute` | `(get-minute field)` | Extract minute (0-59) |
| `get-second` | `(get-second field)` | Extract second (0-59) |
| `convert-timezone` | `(convert-timezone field target source)` | Convert timezone |
| `relative-time-interval` | `(relative-time-interval field n unit offset-n offset-unit)` | Relative time interval filter |

#### Advanced

| Function | Signature | Description |
|----------|-----------|-------------|
| `expression` | `(expression query "name" expr)` | Define a named expression (computed column) |
| `offset` | `(offset expr n)` | Access value from N rows before/after |
| `segment` | `(segment id)` | Reference a saved segment by ID |

#### Expression Examples

```clojure
;; Computed column: profit margin
(-> (query (table "PRODUCTS"))
    (expression "profit_margin"
      (/ (- (field "PRODUCTS" "PRICE") (field "PRODUCTS" "COST"))
         (field "PRODUCTS" "PRICE"))))

;; Case expression: order size category
(-> (query (table "ORDERS"))
    (expression "size_category"
      (case [[(< (field "ORDERS" "TOTAL") 50) "Small"]
             [(< (field "ORDERS" "TOTAL") 200) "Medium"]]
            {:default "Large"})))

;; Date math: days since order
(-> (query (table "ORDERS"))
    (expression "days_since_order"
      (datetime-subtract (now) (field "ORDERS" "CREATED_AT") :day)))

;; Previous month comparison using offset
(-> (query (table "ORDERS"))
    (aggregate (sum (field "ORDERS" "TOTAL")))
    (breakout (with-temporal-bucket (field "ORDERS" "CREATED_AT") :month))
    (expression "prev_month_revenue" (offset (sum (field "ORDERS" "TOTAL")) -1)))
```

### Joins (9 functions)

| Function | Signature | Description |
|----------|-----------|-------------|
| `join` | `(join query join-clause)` | Add a join to a query |
| `join-clause` | `(join-clause table-meta)` | Create a join clause for a table |
| `with-join-conditions` | `(with-join-conditions clause [cond ...])` | Set join conditions |
| `with-join-strategy` | `(with-join-strategy clause strategy)` | Set join type |
| `with-join-fields` | `(with-join-fields clause :all/:none)` | Include joined fields |
| `with-join-alias` | `(with-join-alias clause alias)` | Set join alias |
| `suggested-join-conditions` | `(suggested-join-conditions query table)` | Auto-detect join conditions |
| `joinable-columns` | `(joinable-columns query join-clause)` | Get columns available for join conditions |
| `joins` | `(joins query)` | Get existing joins on a query |

**Join strategies**: `:left-join` (default), `:right-join`, `:inner-join`

#### Join Examples

```clojure
;; Join orders with products
(let [q (query (table "ORDERS"))
      products (table "PRODUCTS")]
  (-> q
      (join (-> (join-clause products)
                (with-join-conditions
                  [(= (field "ORDERS" "PRODUCT_ID")
                      (field "PRODUCTS" "ID"))])
                (with-join-fields :all)))
      (aggregate (sum (field "ORDERS" "TOTAL")))
      (breakout (field "PRODUCTS" "CATEGORY"))))

;; Inner join with alias
(let [q (query (table "ORDERS"))
      users (table "PEOPLE")]
  (-> q
      (join (-> (join-clause users)
                (with-join-conditions
                  [(= (field "ORDERS" "USER_ID")
                      (field "PEOPLE" "ID"))])
                (with-join-strategy :inner-join)
                (with-join-fields :all)))
      (filter (= (field "PEOPLE" "STATE") "CA"))
      (aggregate (count))))
```

### Column Introspection (6 functions)

These functions return available columns at a given query stage. Useful for dynamic resolution.

| Function | Description |
|----------|-------------|
| `visible-columns` | All visible columns in the current stage |
| `filterable-columns` | Columns that can be used in filters |
| `breakoutable-columns` | Columns that can be used for grouping |
| `aggregable-columns` | Columns that can be aggregated |
| `orderable-columns` | Columns that can be used for sorting |
| `expressionable-columns` | Columns available for use in expressions |

### Query Lifecycle

| Function | Description |
|----------|-------------|
| `->legacy-MBQL` | Convert a pMBQL query to legacy MBQL format (done automatically by construct-query) |

## Complete Examples

### Revenue by Month (Line Chart)

```clojure
(-> (query (table "ORDERS"))
    (filter (= (field "ORDERS" "STATUS") "completed"))
    (aggregate (sum (field "ORDERS" "TOTAL")))
    (breakout (with-temporal-bucket (field "ORDERS" "CREATED_AT") :month)))
```

### Top Categories by Revenue (Bar Chart)

```clojure
(let [q (query (table "ORDERS"))
      products (table "PRODUCTS")]
  (-> q
      (join (-> (join-clause products)
                (with-join-conditions
                  [(= (field "ORDERS" "PRODUCT_ID")
                      (field "PRODUCTS" "ID"))])
                (with-join-fields :all)))
      (aggregate (sum (field "ORDERS" "TOTAL")))
      (breakout (field "PRODUCTS" "CATEGORY"))
      (order-by (desc (sum (field "ORDERS" "TOTAL"))))
      (limit 10)))
```

### Conversion Rate (Scalar)

```clojure
(-> (query (table "ORDERS"))
    (aggregate (share (= (field "ORDERS" "STATUS") "completed"))))
```

### Orders with Computed Columns

```clojure
(-> (query (table "ORDERS"))
    (expression "discount_pct"
      (/ (field "ORDERS" "DISCOUNT") (field "ORDERS" "SUBTOTAL")))
    (expression "is_large_order"
      (case [[(>= (field "ORDERS" "TOTAL") 200) "Yes"]]
            {:default "No"}))
    (filter (not-null (field "ORDERS" "DISCOUNT")))
    (order-by (desc (field "ORDERS" "TOTAL")))
    (limit 50))
```

### Using let for Readable Multi-Table Queries

```clojure
(let [orders   (table "ORDERS")
      products (table "PRODUCTS")
      people   (table "PEOPLE")
      q        (query orders)]
  (-> q
      (join (-> (join-clause products)
                (with-join-conditions
                  [(= (field "ORDERS" "PRODUCT_ID")
                      (field "PRODUCTS" "ID"))])
                (with-join-fields :all)))
      (join (-> (join-clause people)
                (with-join-conditions
                  [(= (field "ORDERS" "USER_ID")
                      (field "PEOPLE" "ID"))])
                (with-join-fields :all)))
      (filter (and (= (field "PEOPLE" "STATE") "CA")
                   (time-interval (field "ORDERS" "CREATED_AT") -90 :day)))
      (aggregate (sum (field "ORDERS" "TOTAL")))
      (aggregate (count))
      (breakout (field "PRODUCTS" "CATEGORY"))))
```

### Top 10 Customers by Lifetime Value

```clojure
(let [q (query (table "ORDERS"))
      people (table "PEOPLE")]
  (-> q
      (join (-> (join-clause people)
                (with-join-conditions
                  [(= (field "ORDERS" "USER_ID")
                      (field "PEOPLE" "ID"))])
                (with-join-fields :all)))
      (aggregate (sum (field "ORDERS" "TOTAL")))
      (aggregate (count))
      (breakout (field "PEOPLE" "NAME"))
      (order-by (desc (sum (field "ORDERS" "TOTAL"))))
      (limit 10)))
```

## Gotchas

- **`field` with two args**: `(field "TABLE" "FIELD")` — always works, even with joins.
- **`field` with one arg**: `(field "FIELD")` — searches all tables. Throws if ambiguous (field exists in multiple tables). Use the two-arg form to disambiguate.
- **`table` and `field` accept IDs**: `(table 42)` and `(field 123)` work with numeric IDs from discovery APIs.
- **Table/field names are case-insensitive**: `(field "orders" "total")` and `(field "ORDERS" "TOTAL")` are equivalent.
- **Multiple `aggregate` calls chain**: Each `(aggregate ...)` adds one aggregation. Don't pass multiple aggregations in a single call.
- **Aggregation result column names**: `sum`, `count`, `avg`, etc. Duplicates get `_2`, `_3` suffixes. Use these names in `visualization.y_axis`.
- **Ordering by aggregations**: Use `(order-by query (desc (sum (field ...))))` — the aggregation clause is auto-matched to the query's orderable columns.
- **`--run` flag**: Use `construct-query --run` to construct and execute in one step, avoiding two-step shell piping.
- **Direction in `order-by`**: All three syntaxes work: `(order-by q field :desc)`, `(order-by q :desc field)`, `(order-by q (desc field))`.

## Clojure Syntax Quick Reference

The SCI evaluator supports standard Clojure syntax:

| Form | Example | Description |
|------|---------|-------------|
| `->` | `(-> x (f) (g))` | Thread-first macro: `(g (f x))` |
| `let` | `(let [x 1] x)` | Local bindings |
| `fn` | `(fn [x] (* x 2))` | Anonymous function |
| `if` | `(if test then else)` | Conditional |
| Keywords | `:month`, `:desc` | Used for options/enums |
| Vectors | `[1 2 3]` | Used for lists of values |
| Maps | `{:key "value"}` | Key-value pairs |
| Strings | `"text"` | Double-quoted strings |
