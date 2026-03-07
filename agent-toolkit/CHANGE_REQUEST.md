# Agent Toolkit CLI — Change Requests

## Round 2: Shopify Dashboard (MBQL-based)

### Context

An AI agent built a 10-card Shopify overview dashboard using MBQL queries via `construct-query`. Many issues from Round 1 have been fixed (single-arity `field`, `asc`/`desc` helpers, `--run` flag, skill docs, MBQL examples in `create-question`). Two new issues were encountered.

### Issue 1: `field` two-arg form doesn't accept numeric table IDs

**What happened**: After discovering tables with `list-databases --include tables` (which returns `{"id": 142, "name": "int_shopify_order_facts", ...}`), I tried using the table ID in `field`:

```clojure
(field 142 "is_cancelled")
;; Error: "Field not found: 142.is_cancelled"
```

Had to switch to string table names:
```clojure
(field "int_shopify_order_facts" "is_cancelled")  ;; works
```

**Why this matters**: The discovery phase returns numeric IDs. The `table` helper accepts both `(table 142)` and `(table "int_shopify_order_facts")`, but `field` only accepts `(field "table_name" "field_name")` in two-arg form. This is inconsistent — if `table` accepts IDs, `field` should too.

**Suggested fix**: Support `(field <table-id> "field_name")` when the first argument is a number:
```clojure
(field 142 "is_cancelled")  ;; resolve table by ID 142, then find "is_cancelled" in it
```

### Issue 2: `order-by` fails with multiple same-operator aggregations on different fields

**What happened**: A query with two `sum` aggregations on different fields fails when trying to sort by one of them:

```clojure
(-> (query (table "int_shopify_order_line_facts"))
    (aggregate (sum (field "int_shopify_order_line_facts" "line_net_amount")))
    (aggregate (sum (field "int_shopify_order_line_facts" "quantity")))
    (breakout (field "int_shopify_order_line_facts" "product_title"))
    (order-by (desc (sum (field "int_shopify_order_line_facts" "line_net_amount"))))
    (limit 10))
;; Error: "Ambiguous: multiple 'sum' aggregations found.
;;         Use orderable-columns to pick the specific column."
```

**Why this matters**: The `order-by` expression includes the full field reference `(sum (field ... "line_net_amount"))`, which should be enough to identify which `sum` to sort by. The two aggregations operate on different fields (`line_net_amount` vs `quantity`), so they're distinguishable.

The workaround was to drop the second aggregation entirely, losing useful data from the visualization. I wanted "Top 10 Products" showing both revenue and units sold, sorted by revenue — but had to show revenue only.

**Suggested fix**: When matching `order-by` expressions to aggregations, compare the inner field reference — not just the operator name. `["sum", ["field", 2649, ...]]` and `["sum", ["field", 2656, ...]]` are different aggregations and should be disambiguated by their field IDs. Only error when truly ambiguous (same operator on the same field).

### Priority

| Issue | Impact | Effort |
|-------|--------|--------|
| `field` two-arg with numeric table ID | **Medium** — inconsistent with `table`, forces name lookup | Low |
| `order-by` disambiguation for same-operator aggregations | **High** — forces dropping aggregations as workaround | Medium |

---

## Round 1: Stripe Dashboard (historical, most issues now resolved)

### Context

An AI agent attempted to build a full Stripe performance dashboard using MBQL queries via `construct-query`. While the task was completed, there were significant friction points that required reading source code, trial-and-error, and falling back to SQL for queries that should be expressible in MBQL.

### Issues (resolved)

The following issues from Round 1 have been addressed:

- ~~`asc`/`desc` helpers missing~~ — Added
- ~~No skill doc for `construct-query`~~ — MBQL construction reference now exists
- ~~Single-arity `field` not supported~~ — `(field "name")` now works (errors if ambiguous)
- ~~No `--run` flag for `construct-query`~~ — Added
- ~~`create-question` skill only showed SQL~~ — MBQL examples now documented
- ~~Aggregation column naming undocumented~~ — Naming convention now in docs

### Issues (still open from Round 1)

- **Accept numeric IDs in `table`/`field`**: `table` now accepts IDs, but `field` two-arg form does not (see Round 2 Issue 1 above)
