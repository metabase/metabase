# Porting `mt/mbql-query` tests to Lib (MBQL 5)

This document is the rulebook for migrating backend test files off the deprecated
`mt/mbql-query` / `mt/run-mbql-query` / `mt/query` / `mt/native-query` macros
(`test/metabase/test/data.clj`, deprecated 0.61.0) onto the modern Lib builder API
(`metabase.lib.core`, aliased `lib`). It is written so that an agent can port a file
**without judgment calls**: every construct in the old grammar has a numbered rule,
and every hard case has a decided policy.

---

## 1. Goal & non-goals

**Goal: a behavior-preserving, mechanical port.**

- The ported test must run the *same query* through the *same pipeline* and make the
  *same assertions* as before. `qp/process-query` accepts MBQL-5 queries directly and
  the first preprocessing middleware normalizes everything to MBQL 5 anyway
  (`src/metabase/query_processor/schema.clj:12-30`,
  `src/metabase/query_processor/preprocess.clj:61`), so a correct port is
  observationally identical.
- Do **not** change what a test asserts. Never delete, weaken, loosen, or "fix"
  an assertion, an expected value, a test name, or a `testing` string.
- Do **not** "improve" tests while porting: no restructuring of `deftest`s, no
  merging/splitting tests, no adding `^:parallel`, no changing drivers under test,
  no renaming vars beyond the naming conventions in §8.
- Do **not** modernize things the rules say to keep legacy (parameter `:target`s,
  intentionally-invalid queries, legacy-shape expected values).
- Idiomatic cleanup (deduplication, helper extraction, prettier column lookup) is a
  **later, separate pass**. If a port would require it, leave a
  `;; TODO(mbql5-migration)` comment instead (§7).

**Non-goals:**

- Migrating `metabase.lib.test-util.macros` (`lib.tu.macros/mbql-query`,
  `lib.tu.macros/$ids`, `lib.tu.macros/mbql-5-query`) call sites. Those are the
  pure-unit, no-app-DB siblings and are **not** targets of this migration.
- Rewriting expected values that happen to be legacy MBQL maps (§5).
- Touching production code.

---

## 2. The two idioms, side by side

Both of these are real tests in
`test/metabase/query_processor/cumulative_aggregation_test.clj` on this branch.

**OLD** (`cumulative_aggregation_test.clj:33-37` area):

```clojure
(deftest ^:parallel cumulative-sum-test-2
  (mt/test-drivers (mt/normal-drivers-with-feature :window-functions/cumulative)
    (testing "Simple cumulative sum where breakout field is same as cum_sum field"
      (let [query (mt/mbql-query users
                    {:aggregation [[:cum-sum $id]]
                     :breakout    [$id]})]
        (mt/with-native-query-testing-context query
          (is (= [[1 1] [2 3] ...]
                 (mt/formatted-rows [int int] (qp/process-query query)))))))))
```

**NEW** (`cumulative_aggregation_test.clj:99-117` — the canonical example):

```clojure
(deftest ^:parallel cumulative-sum-with-bucketed-breakout-test
  (mt/test-drivers (mt/normal-drivers-with-feature :window-functions/cumulative)
    (testing "cumulative sum with a temporally bucketed breakout"
      (let [metadata-provider (mt/metadata-provider)
            orders            (lib.metadata/table metadata-provider (mt/id :orders))
            orders-created-at (lib.metadata/field metadata-provider (mt/id :orders :created_at))
            orders-total      (lib.metadata/field metadata-provider (mt/id :orders :total))
            query             (-> (lib/query metadata-provider orders)
                                  (lib/breakout (lib/with-temporal-bucket orders-created-at :month))
                                  (lib/aggregate (lib/cum-sum orders-total))
                                  (lib/limit 3)
                                  (assoc-in [:middleware :format-rows?] false))]
        (mt/with-native-query-testing-context query
          (is (= [[#t "2016-04-01" 52.76]
                  [#t "2016-05-01" 1318.49]
                  [#t "2016-06-01" 3391.41]]
                 (mt/formatted-rows [->local-date 2.0] (qp/process-query query)))))))))
```

(Note: newer conversions use `mp` instead of `metadata-provider` as the binding name;
`mp` is the convention going forward — see §8.)

The essence: `mt/mbql-query`'s sigils (`$id`, `!month.created_at`, …) expand to
runtime `(mt/id ...)` calls; the Lib port makes those same `(mt/id ...)` calls
explicitly, looks the metadata up through `(mt/metadata-provider)`, and composes the
query with `lib/*` builder functions instead of a literal map.

---

## 3. Translation rules

Notation: `mp` is `(mt/metadata-provider)`. `q` is the lib query built so far.
Examples assume the old form was `(mt/mbql-query venues {...})` unless stated.
All function names below are verified against `src/metabase/lib/core.cljc` (re-export
list), `src/metabase/lib/metadata.cljc`, and the test helpers cited.

### Setup / metadata provider

**R1 — One provider binding per test, named `mp`, first in the `let`.**

```clojure
;; NEW (always the first binding)
(let [mp (mt/metadata-provider)]
  ...)
```

`mt/metadata-provider` is defined at `test/metabase/test/data.clj:248` as
`(lib-be/application-database-metadata-provider (mt/id))` and resolves against
the *current* test dataset/driver, exactly like the sigils did.

**R2 — Table lookup.** The implicit table of `(mt/mbql-query venues ...)` becomes:

```clojure
;; NEW
(lib/query mp (lib.metadata/table mp (mt/id :venues)))
```

This reproduces the implicit `:source-table` that `maybe-add-source-table` added.
If the old inner query already had an explicit `:source-table $$other`, use *that*
table instead — the macro's table-name arg was then only a namespace for `$field`
sigils.

**R3 — Bare-table query.** `(mt/mbql-query venues)` (no inner map) is just:

```clojure
(lib/query mp (lib.metadata/table mp (mt/id :venues)))
```

**R4 — Build inside the same dynamic scope the macro ran in.** Sigils expanded to
runtime `(mt/id ...)` calls, so `mbql-query` inside `mt/dataset`, `mt/with-db`,
`mt/with-temp-copy-of-db`, or `mt/test-drivers` targeted the DB bound *there*. The
port must call `(mt/metadata-provider)` and `(mt/id ...)` **inside** the same
`mt/dataset` / `mt/test-drivers` / `mt/with-db` body. Never hoist `mp` outside a
`mt/dataset` or driver loop, and never build queries in top-level forms (`mt/id`
asserts tests are not initializing, `test/metabase/test/data.clj:239`).

**R5 — Build the provider AFTER app-DB mutations.** The app-DB provider caches
metadata (`src/metabase/lib_be/metadata/jvm.clj:567-576`). If the test does
`t2/update!` / `t2/insert!` / `mt/with-temp` on Field/Table/Card metadata, create
`mp` and build the query *after* those mutations. If mutations happen *between*
construction and execution, this file is a manual-review case — flag it (§4.7).

### Field & table refs (the sigil table)

**R6 — `$field` → field metadata by ID.**

```clojure
;; OLD                          ;; NEW
$price                          (lib.metadata/field mp (mt/id :venues :price))
$categories.name                (lib.metadata/field mp (mt/id :categories :name))
```

Column metadata is accepted directly by every filter/aggregation/breakout/order-by
builder — no explicit `:field` clause needed. Bind each field once at the top of the
`let`, named after the column (§8).

**R7 — `$$table` → table metadata (or raw `(mt/id :table)` in raw contexts).**

```clojure
;; OLD: {:source-table $$checkins}
;; NEW:
(lib/query mp (lib.metadata/table mp (mt/id :checkins)))
;; OLD: $$categories as a join target
;; NEW:
(lib/join-clause (lib.metadata/table mp (mt/id :categories)) ...)
```

Where the old test used `$$table` purely as an integer (comparisons, assertions),
write `(mt/id :checkins)`.

**R8 — `%field` (raw Field ID) → `(mt/id :table :field)`.** `%field` was only ever
the integer ID. In assertions and hand-built data keep it as `(mt/id ...)`. Where it
was used to hand-attach options to a ref — `[:field %price {:binning {...}}]` — use
the corresponding builder instead (`lib/with-binning`, R24; `lib/with-temporal-bucket`,
R23) applied to the column metadata from R6.

**R9 — `*field` (name-based ref, resolved from app DB) → column metadata found by
name.** Do NOT port this to `lib.metadata/field` by ID: the result-metadata code
preserves whether the original ref was by-ID or by-name
(`src/metabase/lib/metadata/result_metadata.cljc:309-325`), so an ID-based port
changes `:field_ref`/`:cols` expectations. Instead find the column by `:name` in the
appropriate column list:

```clojure
;; OLD: :breakout [*name]        (a name ref into the source)
;; NEW:
(as-> (lib/query mp ...) q
  (lib/breakout q (m/find-first #(= (:name %) "NAME")   ; H2 upper-cases names
                                (lib/breakoutable-columns q))))
```

Remember `*field`'s resolved name was **driver-cased** (H2 = upper case, via
`mt/format-name`). Any file using `*field` sigils must be run and its `:cols`
assertions re-verified — do not batch-port blindly (§4.5).

**R10 — `*name/Type` (literal name + base type, e.g. aggregation columns from a
source query/card) → column metadata found by name in the previous stage's output.**

```clojure
;; OLD: [:field "count" {:base-type :type/Integer}]  i.e. *count/Integer
;; NEW (after lib/append-stage or a source card):
(m/find-first #(= (:name %) "count") (lib/filterable-columns q))
;; or, in order-by/breakout position:
(lib.tu.notebook/find-col-with-spec q (lib/orderable-columns q) {} {:display-name "Count"})
```

`lib.tu.notebook/find-col-with-spec` is defined at
`test/metabase/lib/test_util/notebook_helpers.cljc:25`, required as
`[metabase.lib.test-util.notebook-helpers :as lib.tu.notebook]`.

**R11 — `$fk->dest` (implicit join / `:source-field`) → the implicitly-joinable
column from `lib/visible-columns` (or `filterable-columns` etc.).** Visible columns
include implicitly-joinable ones by default
(`src/metabase/lib/metadata/calculation.cljc:589-600`); such columns carry
`:fk-field-id` = the FK, and `:id` = the destination field, and passing one to a
builder produces the `{:source-field ...}` ref:

```clojure
;; OLD: $category_id->categories.name
;; NEW:
(m/find-first (fn [col]
                (and (= (:id col) (mt/id :categories :name))
                     (= (:fk-field-id col) (mt/id :venues :category_id))))
              (lib/visible-columns q))
```

(The `:fk-field-id` check matters when two FKs point at the same table — e.g.
`people` reachable via both `user_id` and another FK.)

**R12 — `&alias.field` (`:join-alias`) → column metadata carrying the alias.**
Preferred: after the join is attached, take the column from
`lib/filterable-columns` / `lib/breakoutable-columns` / `lib/returned-columns` —
they already carry the join alias. Manual fallback (used heavily in converted
tests, e.g. `test/metabase/query_processor/explicit_joins_test.clj:1586-1595`):

```clojure
;; OLD: &c.categories.name
;; NEW:
(-> (lib.metadata/field mp (mt/id :categories :name))
    (lib/with-join-alias "c"))
```

`lib/with-join-alias` is re-exported at `src/metabase/lib/core.cljc:1106` (docstring
flags it "Leak" — sanctioned for this test port).

### Filters

**R13 — `:filter` clause → `lib/filter` + constructor.**

```clojure
;; OLD: :filter [:= $id 1]
;; NEW:
(lib/filter q (lib/= venues-id 1))
```

Constructors (all verified in `src/metabase/lib/filter.cljc:374-398`, re-exported
from `lib`): `and or not = != in not-in < <= > >= between inside is-null not-null
is-empty not-empty starts-with ends-with contains does-not-contain
relative-time-interval time-interval during segment`.

**R14 — Legacy `[:and ...]` / `[:or ...]` →** either `(lib/and c1 c2 ...)` /
`(lib/or c1 c2 ...)`, or for top-level `:and` simply multiple `lib/filter` calls
(they AND together). Prefer `lib/and` when the old test had an explicit `[:and ...]`
so the compiled SQL shape stays closest.

**R15 — `{:case-sensitive false}` option on string filters → `lib/ignore-case`.**

```clojure
;; OLD: [:contains $name "foo" {:case-sensitive false}]
;; NEW:
(lib/ignore-case (lib/contains venues-name "foo"))
```

(`src/metabase/lib/core.cljc:1717-1722`, implemented as
`(lib.options/update-options expr assoc :case-sensitive false)`.)

**R16 — Segments.** `[:segment (:id segment)]` → `(lib/segment (:id segment))`.
Time intervals: `[:time-interval $created_at -30 :day]` →
`(lib/time-interval orders-created-at -30 :day)`.

### Aggregations

**R17 — `:aggregation` entries → `lib/aggregate` + constructor.**

```clojure
;; OLD: :aggregation [[:count]]           ;; NEW: (lib/aggregate q (lib/count))
;; OLD: :aggregation [[:sum $price]]      ;; NEW: (lib/aggregate q (lib/sum venues-price))
;; OLD: [[:count] [:sum $price]]          ;; NEW: chain two lib/aggregate calls, in order
```

Constructors (verified in `src/metabase/lib/aggregation.cljc:310-325`): `count
cum-count count-where distinct-where avg distinct max min median percentile share
stddev sum cum-sum sum-where var`. Order matters — `[:aggregation N]` refs are
positional.

**R18 — `[:aggregation-options agg {:display-name "..."}]` →
`lib/with-expression-name`.**

```clojure
;; OLD: [:aggregation-options [:sum $price] {:display-name "Total Price"}]
;; NEW:
(lib/aggregate q (lib/with-expression-name (lib/sum venues-price) "Total Price"))
```

**R19 — `:aggregation-options` with `:name` (SQL column alias) →
`lib/update-options`.** `with-expression-name` sets `:display-name` on aggregations;
when the old test set `:name` specifically (assertions on SQL aliases), do:

```clojure
(lib/update-options (lib/sum venues-price) assoc :name "sum_2" :display-name "sum_2")
```

**R20 — Custom aggregation expressions** compose from the arithmetic ops (R32):
`[:aggregation-options [:/ [:sum $a] [:sum $b]] ...]` →
`(lib// (lib/sum a) (lib/sum b))`.

**R21 — `[:aggregation N]` refs (in `:order-by` etc.) → `(lib/aggregation-ref q N)`**
(`src/metabase/lib/core.cljc:519`; needs the query-so-far, hence `as->` — §8), or
find the aggregation column via `lib/orderable-columns` +
`lib.tu.notebook/find-col-with-spec` (precedent:
`test/metabase/query_processor/order_by_test.clj:141-164`).

### Breakouts, temporal bucketing, binning

**R22 — `:breakout [$f ...]` → chained `lib/breakout` calls, in order.**

```clojure
;; OLD: :breakout [$price $category_id]
;; NEW:
(-> q (lib/breakout venues-price) (lib/breakout venues-category-id))
```

**R23 — `!unit.field` / `{:temporal-unit u}` → `lib/with-temporal-bucket`.**

```clojure
;; OLD: :breakout [!month.created_at]
;; NEW:
(lib/breakout q (lib/with-temporal-bucket orders-created-at :month))
```

Works on any column metadata or `:field` clause, including filter args and
join-condition columns. `!default.f` → `(lib/with-temporal-bucket f :default)`.

**R24 — `{:binning {...}}` field option → `lib/with-binning`.**

```clojure
;; OLD: [:field %price {:binning {:strategy :num-bins, :num-bins 10}}]
;; NEW:
(lib/with-binning venues-price {:strategy :num-bins, :num-bins 10})
;; also literal: {:strategy :default}, {:strategy :bin-width, :bin-width 20}
```

Precedent for both literal maps and `lib/available-binning-strategies` lookup:
`test/metabase/query_processor/binning_test.clj:19-26`,
`test/metabase/query_processor/expression_aggregations_test.clj:412`.

### Order-by

**R25 — `:order-by [[:asc $f]]` → `lib/order-by`.**

```clojure
;; OLD: :order-by [[:asc $id]]           ;; NEW: (lib/order-by q venues-id)   ; :asc is default
;; OLD: :order-by [[:desc $price]]       ;; NEW: (lib/order-by q venues-price :desc)
;; OLD: multiple entries                 ;; NEW: chained lib/order-by calls, in order
```

Write the explicit `:asc` only when it aids symmetry with a neighboring `:desc`;
both forms exist in converted files.

**R26 — Order-by on an aggregation:** `[[:asc [:aggregation 0]]]` →
`(lib/order-by q (lib/aggregation-ref q 0))` or the `orderable-columns` lookup (R21).

**R27 — Do not add order-bys the old test didn't have.** The implicit ascending
order-by per breakout is QP middleware
(`src/metabase/query_processor/middleware/add_implicit_clauses.clj:71-92`) applied
identically to both idioms; row order is preserved for free.

### Fields, limit, page

**R28 — `:fields [...]` → `lib/with-fields`.**

```clojure
;; OLD: :fields [$id $name]
;; NEW: (lib/with-fields q [venues-id venues-name])
```

Elements may be column metadata or refs. For single-column add/remove there are
`lib/add-field` / `lib/remove-field` (both take an explicit stage number, e.g.
`(lib/remove-field q -1 col)` — precedent `remapping_test.clj:497-498`).

**R29 — `:limit n` → `(lib/limit q n)`.**

**R30 — `:page {:page N, :items M}` → `(lib/with-page q {:page N, :items M})`**
(`src/metabase/lib/page.cljc:16`). Do **not** use `lib/offset` — that is the
window-function lag/lead expression, not pagination. `:page` and `:limit` are
mutually exclusive on a stage; `with-page` drops `:limit`.

### Expressions

**R31 — `:expressions {"name" expr}` → `lib/expression`, one call per entry.**

```clojure
;; OLD: :expressions {"double-price" [:* $price 2]}
;; NEW:
(lib/expression q "double-price" (lib/* venues-price 2))
```

**R32 — Expression constructors** (verified in
`src/metabase/lib/expression.cljc:341-397`, re-exported from `lib`): arithmetic
`+ - * / abs log exp sqrt ceil floor round power`; conditional `case coalesce`
(`lib/case` takes a seq of `[pred expr]` pairs, optional fallback); string `concat
substring replace regex-match-first length trim ltrim rtrim upper lower split-part
text integer float`; temporal `interval relative-datetime absolute-datetime datetime
now today date time convert-timezone get-year get-month get-day get-hour get-minute
get-second get-quarter get-week get-day-of-week datetime-add datetime-subtract`;
window `offset`. **Not re-exported** from `lib` (call via
`[metabase.lib.expression :as lib.expression]` if needed): `host domain subdomain
path month-name quarter-name day-name`. Literal values:
`(lib.expression/value "upper")` (precedent `expressions_test.clj:1299`).

**R33 — `[:expression "name"]` refs → `(lib/expression-ref q "name")`.** Needs the
query with the expression already attached — use `as->` (§8). `lib/expression-ref`
is marked Deprecated ("test helper that crept into the public API") but is the
standard idiom in converted tests (`expressions_test.clj:1237-1251`). Alternative:
find the expression column in `lib/expressionable-columns` / `lib/visible-columns`.

**R34 — Clause with no builder → `lib/expression-clause` escape hatch.**

```clojure
;; e.g. (lib/expression-clause :datetime-diff [orders-created joined-created :hour] nil)
```

Precedent: `explicit_joins_test.clj:1548-1551`.

### Joins

**R35 — `:joins [{...}]` entry → `lib/join` + `lib/join-clause` + `with-join-*`.**

```clojure
;; OLD:
;; :joins [{:source-table $$categories
;;          :alias        "c"
;;          :condition    [:= $category_id &c.categories.id]
;;          :fields       :all
;;          :strategy     :left-join}]
;; NEW:
(lib/join q (-> (lib/join-clause (lib.metadata/table mp (mt/id :categories)))
                (lib/with-join-alias "c")
                (lib/with-join-conditions
                 [(lib/= venues-category-id
                         (-> (lib.metadata/field mp (mt/id :categories :id))
                             (lib/with-join-alias "c")))])
                (lib/with-join-fields :all)))
```

Key detail (precedent `explicit_joins_test.clj:1586-1595`): **the RHS column of each
join condition gets `(lib/with-join-alias <alias>)`**, and every later reference to
a joined column carries the alias too (R12). `:strategy :left-join` is the default;
port other strategies with `(lib/with-join-strategy join :inner-join)` etc.

**R36 — Join `:fields`:** `:all` / `:none` pass to `lib/with-join-fields`
unchanged; a vector of refs becomes a vector of RHS column metadatas:
`(lib/with-join-fields [products-id products-created])`
(precedent `expressions_test.clj:1213`).

**R37 — Conditions may be passed inline:**
`(lib/join (lib/join-clause categories-table [(lib/= venues-category-id categories-id)]))`
(precedent `api_test.clj:938-940`). When the old join relied on FK inference, use
`(lib/join-clause products (lib/suggested-join-conditions q products))`
(precedent `explicit_joins_test.clj:1793`).

**R38 — Join whose `:source-table` is `"card__N"` or whose source is a query:**
`lib/join-clause` accepts card metadata and full lib queries as joinables. For a
card: `(lib/join-clause (lib.metadata/card mp card-id) ...)`. Finding condition RHS
columns for a card join: `lib/join-condition-rhs-columns` +
`lib.tu.notebook/find-col-with-spec` (precedent `explicit_joins_test.clj:1566-1577`).

**R39 — Alias-only refs downstream of the join** follow R12: prefer columns from
`lib/filterable-columns` etc. (they carry the alias); fall back to
`(lib/with-join-alias field "alias")`.

### Nested queries & source cards

**R40 — `:source-query {...}` → build the inner query first, then
`lib/append-stage`, then attach outer clauses.**

```clojure
;; OLD:
;; (mt/mbql-query nil
;;   {:source-query {:source-table $$venues, :aggregation [[:count]], :breakout [$venues.price]}
;;    :filter       [:> *count/Integer 1]})
;; NEW:
(let [mp (mt/metadata-provider)
      query (-> (lib/query mp (lib.metadata/table mp (mt/id :venues)))
                (lib/aggregate (lib/count))
                (lib/breakout (lib.metadata/field mp (mt/id :venues :price)))
                lib/append-stage
                (as-> q (let [count-col (m/find-first #(= (:name %) "count")
                                                      (lib/filterable-columns q))]
                          (lib/filter q (lib/> count-col 1)))))]
  ...)
```

Second-stage columns have **no field IDs** — always find them by `:name` /
`:display-name` (precedent `drill_thru_e2e_test.clj:105-110`,
`time_field_test.clj:200-215`).

**R41 — `:source-table "card__N"` → `(lib/query mp (lib.metadata/card mp N))`.**
`lib.metadata/card` is at `src/metabase/lib/metadata.cljc:157`. If N comes from a
`(str "card__" (:id card))` expression, use `(:id card)` directly.

**R42 — Source cards without touching the app DB → `lib.tu/mock-metadata-provider`
layered over `(mt/metadata-provider)`** (keeps tests `^:parallel`):

```clojure
(let [card-query (...)   ; a lib query or legacy map
      mp         (lib.tu/mock-metadata-provider
                  (mt/metadata-provider)
                  {:cards [{:id 1, :dataset-query card-query}]})
      query      (lib/query mp (lib.metadata/card mp 1))]
  ...)
```

Precedent `binning_test.clj:42-73`. When result metadata is needed, either compute
it (`(-> (qp/process-query card-query) :data :results_metadata :columns)` →
`:result-metadata` key) or use
`qp.test-util/metadata-provider-with-cards-with-metadata-for-queries`
(`test/metabase/query_processor/test_util.clj:550`). If a later `qp/process-query`
must resolve the mocked card, wrap execution in
`(qp.store/with-metadata-provider mp ...)` — and require
`^{:clj-kondo/ignore [:deprecated-namespace]} [metabase.query-processor.store :as qp.store]`.

**R43 — `mt/query` (outer-query variant):**
- `(mt/query venues {:query {...}})` → same as `mbql-query` rules; top-level sibling
  keys (`:parameters`, `:middleware`, `:info`, `:constraints`) are `assoc`ed onto
  the lib query (R52-R54).
- `(mt/query nil {:type :native, :native {...}})` → R44/R45.

### Native queries

**R44 — `mt/native-query` / `mt/query` with `:type :native` →
`(lib/native-query mp "SQL...")`** (`src/metabase/lib/native.cljc:194`; template
tags are auto-extracted from the SQL). Precedent for native cards:
`dashboard_test.clj:536-538`.

**R45 — Native map with explicit `:template-tags` (hybrid escape hatch):** wrapping
the legacy outer map in `lib/query` converts it, including moving `:template-tags`
onto the native stage:

```clojure
(lib/query mp {:database (mt/id) :type :native :native {:query sql :template-tags tt}})
```

Precedent `parameters_test.clj:116-122`. This hybrid form is sanctioned when the tag
map is built with helpers.

### Cards & `:dataset_query`

**R46 — `mt/with-temp :model/Card` accepts a lib query directly** (Toucan transform
normalizes; `src/metabase/queries/models/card.clj:116`,
`src/metabase/lib_be/models/transforms.clj:82-104`):

```clojure
(mt/with-temp [:model/Card {card-id :id}
               {:dataset_query (lib/query mp (lib.metadata/table mp (mt/id :venues)))}]
  ...)
```

Precedent `card_test.clj:277-282`.

**R47 — Assertions on a card's stored/read-back `:dataset_query` must expect
MBQL 5.** `transform-query-out` also normalizes to MBQL 5, so a test that
`t2/select`s a card and compares against a legacy literal is comparing MBQL 5
regardless of what was inserted. Use `=?` with `{}` opts maps, or convert the actual
with `lib/->legacy-MBQL` and keep the legacy expected literal.

**R48 — When a helper genuinely requires legacy MBQL, convert at the boundary:**
`(lib/->legacy-MBQL query)` (re-exported `src/metabase/lib/core.cljc:1422`).
Precedent: card create/update REST bodies, `queries_rest/api/card_test.clj:4636-4653`.
`mt/card-with-source-metadata-for-query` accepts a lib query
(`test/metabase/query_processor/test_util.clj:467`; precedent `api_test.clj:941`).

### API payloads

**R49 — `POST /api/dataset` (and `/api/dataset/native`) accept the lib query map
as-is:** `(mt/user-http-request :crowberto :post 202 "dataset" query)` — precedent
`api_test.clj:987-1007`. For cleanliness, `(dissoc query :lib/metadata)` before
posting (the attached provider JSON-encodes to `nil`, harmless but noisy).

**R50 — Card create/update REST bodies:** send `(lib/->legacy-MBQL query)` as
`:dataset_query` (precedent `card_test.clj:4652-4653`), OR send the MBQL-5 map —
`POST /api/card` strictly normalizes either. Follow whichever the surrounding file
already does; when in doubt use `lib/->legacy-MBQL` to match precedent.

### `run-mbql-query`

**R51 — `(mt/run-mbql-query t {...})` → let-bound lib query +
`(qp/process-query query)`.** There is no one-form replacement.

```clojure
;; OLD:
(mt/formatted-rows [int str]
  (mt/run-mbql-query venues {:fields [$id $name] :limit 2}))
;; NEW:
(let [mp    (mt/metadata-provider)
      query (-> (lib/query mp (lib.metadata/table mp (mt/id :venues)))
                (lib/with-fields [(lib.metadata/field mp (mt/id :venues :id))
                                  (lib.metadata/field mp (mt/id :venues :name))])
                (lib/limit 2))]
  (mt/formatted-rows [int str] (qp/process-query query)))
```

Notes:
- `mt/rows`, `mt/formatted-rows`, `mt/first-row`, `mt/rows+column-names`, `mt/cols`
  all operate on the results map and work unchanged.
- You lose `run-mbql-query*`'s rethrow-with-query ex-data
  (`test/metabase/test/data.clj:198-205`). Compensate by wrapping the run in
  `(mt/with-native-query-testing-context query ...)` (lib-compatible; precedent
  `cumulative_aggregation_test.clj:111`). If a test **asserts on** that
  `{:query ...}` ex-data, it is a manual case — do not port mechanically (§4).
- `qp` should be `[metabase.query-processor.test :as qp]` (the test facade;
  `process-query` re-exported at `test/metabase/query_processor/test.clj:24`); some
  files already alias `metabase.query-processor` — keep whichever the file has.

### Top-level keys, middleware, parameters

**R52 — `:middleware` options:** lib queries are plain maps —
`(assoc-in query [:middleware :format-rows?] false)` works directly (canonical
example line 110). Same for `:info`, `:constraints`, `:settings`, `:cache-strategy`
etc.: `assoc` onto the lib query.

**R53 — `:parameters`:** `(assoc lib-query :parameters [...])`, keeping the
parameter maps **byte-for-byte** — parameter `:target`s
(`[:dimension [:field ...]]`, `[:variable [:template-tag ...]]`) are still legacy
refs *by MBQL-5 schema* (`src/metabase/lib/schema/parameter.cljc:216-234`). Do NOT
modernize targets. `mt/$ids`-built refs inside targets stay, or become hand-written
`[:field (mt/id :t :f) nil]`.

**R54 — `mt/$ids` used to build refs for parameters/expected values** stays or
becomes hand-written literal clauses with `(mt/id ...)`. Never force `$ids` output
through lib builders.

### clj-kondo header handling

**R55 — Prune the `:deprecated-var` exclusion header to exactly the deprecated vars
still used; delete the whole attr-map entry when the file reaches zero usages.**

```clojure
;; both still used:
{:clj-kondo/config '{:linters {:deprecated-var {:exclude {metabase.test.data/mbql-query {:namespaces [<this-ns>]}
                                                          metabase.test.data/run-mbql-query {:namespaces [<this-ns>]}}}}}}
;; only mbql-query left: drop the run-mbql-query entry
;; fully converted: delete the header entirely
```

Precedent: `cumulative_aggregation_test.clj:2-3` (both),
`binning_test.clj:2` (one), `drill_thru_e2e_test.clj:1-13` (none).
`mt/query` and `mt/native-query` are the same deprecated family — convert their
call sites in the same pass so the header can go in one shot.

### Transitional escape hatch

**R56 — `lib/query` wrapping a legacy map is a sanctioned intermediate step.**
`(lib/query mp (mt/mbql-query venues {...}))` and
`(lib/query mp {:database (mt/id) :type :query :query {...}})` both convert legacy →
MBQL 5 with metadata attached (`src/metabase/lib/query.cljc:198-208`). Use it only
when a construct has no clean builder path and note it with
`;; TODO(mbql5-migration)`. `lib/query-from-legacy-inner-query`
(`query.cljc:321`) exists for inner maps but is not the preferred target.

---

## 4. Hard cases & decisions

Each case below has a **decided policy** — apply it without re-litigating.

**4.1 Tests asserting on literal legacy query maps** (middleware tests, preprocess
tests, compile-shape tests). `qp.preprocess/preprocess` returns MBQL 5; built lib
queries contain random `:lib/uuid`s so `=` between independently built queries
fails. **Policy:** these files are NOT mechanical ports — batch them separately for
a manual pass. Within that pass the three accepted techniques (all with in-repo
precedent) are: (a) `=?` against MBQL-5 shape with `{}` option maps
(`optimize_temporal_filters_test.clj:493-502`); (b) `lib.tu.macros/mbql-5-query`
for expected values (`test/metabase/lib/test_util/macros.clj:71-89`); (c) convert
the actual with `lib/->legacy-MBQL` and keep the legacy expected literal
(`nested_queries_test.clj`, `binning_test.clj`, `breakout_test.clj`). Never expect
stable uuids.

**4.2 Mock-provider tests (`qp.store/with-metadata-provider` around the run).**
The store WINS over the query's baked-in provider when both exist
(`src/metabase/query_processor/setup.clj:133-147`). **Policy:** the provider used to
*build* must be the provider used to *run*. Build the lib query with the mock
provider itself; keep the `with-metadata-provider` wrapper when the provider is a
mock/override; drop the wrapper only when it was a redundant plain
`(mt/metadata-provider)` around `process-query`.

**4.3 Files mixing `mt/mbql-query` with `meta/metadata-provider` mocks (pure-unit
middleware tests).** **Policy:** port to `lib.tu.macros/mbql-5-query` or
`(lib/query meta/metadata-provider ...)` — never `mt/metadata-provider` (no app DB
semantics wanted there). These files are part of the manual batch (4.1 usually
applies too).

**4.4 Intentionally-invalid queries (negative/error-path tests).** `lib/query` and
`lib.metadata/table` validate at construction (Malli enforcement is on in tests;
`lib.metadata/table` throws for missing tables), so a mechanical port changes
*where and what* fails. **Policy:** leave these as hand-rolled legacy/raw maps,
excluded from the mechanical batch. If the rest of the file converts, keep the kondo
exclusion only for the vars those tests still use, and mark them
`;; TODO(mbql5-migration): intentionally-invalid query, keep legacy`.

**4.5 `*field` name-ref sigils.** Result metadata preserves ID-vs-name ref style
(`result_metadata.cljc:309-325`), so porting `*field` to an ID lookup changes
`:field_ref`/`:name`/`:cols` expectations. **Policy:** port per R9/R10 (name-based
column lookup) and RUN the test — never batch-port `*`-sigil tests without executing
them.

**4.6 Tests asserting on `run-mbql-query*`'s `{:query ...}` ex-data.** **Policy:**
manual case; either keep `mt/run-mbql-query` for that test (with kondo exclusion +
TODO) or rewrite the assertion knowingly in the manual pass. Do not silently drop
the assertion.

**4.7 Metadata mutations between build and run** (`t2/update!` on Field/Table/Card
after the query is built). The cached provider serves stale metadata. **Policy:**
reorder so `mp` + query construction happen after all mutations; if the test
*depends* on build-then-mutate ordering, flag for manual review with a TODO and keep
the old macro.

**4.8 Parameters.** **Policy:** copy parameter maps verbatim, legacy `:target` refs
included (R53). No exceptions.

**4.9 Card `:dataset_query` readback assertions.** **Policy:** expect MBQL 5 on
read (or request `?legacy-mbql=true` on the API); compare via `lib/->legacy-MBQL` if
the expected literal should stay legacy (R47).

**4.10 Druid `timestamp` remapping.** The old parser remapped field `timestamp` →
`:__time` for `:druid-jdbc` via `*id-fn-symb*` (`mbql_query_impl.cljc:14-22`;
`timeseries-test` binds the dynamic directly). **Policy:** any file that runs under
`:druid-jdbc` and references a `timestamp` field is a manual case — replicate the
remap explicitly (e.g. conditional field name) and verify against that driver, or
leave on the old macro with a TODO.

**4.11 Ordering.** No divergence: implicit breakout order-by is middleware applied
after normalization for both idioms. **Policy:** no rewrites of row-order
expectations; just don't ADD `lib/order-by` where the legacy test had none (R27).

**Triage summary:** results-only tests (rows/cols assertions) = mechanical;
query-shape-assertion tests = manual batch (4.1/4.3); mock-provider tests = unify
build/run provider (4.2); metadata-mutating tests = reorder or flag (4.7);
`*`-sigil tests = port then execute-verify (4.5); negative/error tests = skip (4.4);
parameters = verbatim (4.8).

---

## 5. What NOT to port (out-of-scope markers)

- **`mt/$ids` used to construct expected values or assertion fixtures** (legacy
  refs the test *compares against*). The legacy map IS the expectation; porting it
  changes what the test verifies. Leave as-is (`$ids` itself is not marked
  deprecated).
- **Tests of legacy-MBQL machinery itself**: normalization tests, legacy-schema
  tests, `lib.convert` round-trip tests, anything under namespaces whose subject is
  legacy MBQL. There the legacy map is the fixture under test.
- **`metabase.lib.test-util.macros` call sites** (`lib.tu.macros/mbql-query`,
  `mbql-5-query`, `$ids`) — different metadata source (static `meta/`), no app DB,
  not deprecated for this purpose. Out of scope.
- **Intentionally-invalid queries** (§4.4).
- **Files that rebind `mbql-query-impl` dynamics directly** (e.g.
  `metabase.query-processor.timeseries-test` binding `*id-fn-symb*`) — manual batch.
- **Legacy maps passed to helpers that require legacy MBQL** where no converted
  precedent exists yet: keep, wrap with `lib/->legacy-MBQL` only at a boundary you
  can verify by running the test.
- Anything in `src/` (production code).

---

## 6. Per-file workflow checklist

1. **Baseline**: run `./bin/test-agent :only '[<ns>]'` on the untouched file. Record
   test count, assertion count, failures (there may be pre-existing failures — note
   them; they are not yours to fix or to regress).
2. **Read the whole file.** Classify each `deftest` against the triage summary
   (§4): mechanical / manual / skip. Note which deprecated vars the kondo header
   lists.
3. **Port test-by-test**, mechanical ones only, applying rules R1-R56. Within each
   test: one `let`, `mp` first, table binding, field bindings, then `query` (§8).
4. **Never delete or weaken an assertion.** Expected values are copied verbatim.
5. For each test you *cannot* port behavior-preserving, leave it on the old macro
   and add `;; TODO(mbql5-migration): <one-line reason>` directly above it.
6. **Prune the ns requires**: add `[metabase.lib.core :as lib]`,
   `[metabase.lib.metadata :as lib.metadata]` (and `lib.tu` / `lib.tu.notebook` /
   `medley.core :as m` only if used); keep requires sorted; remove requires that
   became unused.
7. **Prune the kondo header** per R55 — delete it only when the file has zero
   usages of ALL of `mbql-query`, `run-mbql-query`, `query`, `native-query`
   (from `metabase.test.data`).
8. **Run** `./bin/test-agent :only '[<ns>]'` again. Compare against the baseline:
   same tests run, same (or more) assertions, no new failures. For files under
   `mt/test-drivers`, also run with a second driver if the change touches
   name-based refs (R9/R10): `./bin/test-agent --drivers=postgres :only '[<ns>]'`
   when feasible.
9. If a ported test fails and the fix isn't obvious within the rules, **revert that
   test** to the old macro + TODO rather than bending the assertion.
10. Re-check step 7 (a reverted test may need the kondo header back).

---

## 7. Verification protocol

- **Before/after runs are mandatory** (`./bin/test-agent :only '[<ns>]'` — never
  `clj -X:dev:test` directly). The after-run must show:
  - test count ≥ before, assertion count ≥ before (they must not decrease);
  - zero new failures/errors relative to the baseline.
- **`*`-sigil ports (R9/R10) and any `:cols` / `:field_ref` assertions** must be
  executed, not just compiled — ref style affects result metadata (§4.5).
- A test that cannot be ported behavior-preserving gets
  `;; TODO(mbql5-migration): <reason>` and **stays on the old macro**. A wrong
  force-port is strictly worse than an unported test.
- Do not mark a file "done" while it still has a kondo `:deprecated-var` exclusion
  unless every remaining usage carries a TODO comment explaining why.
- Spot-check compiled SQL parity when in doubt: wrap both old and new queries in
  `mt/with-native-query-testing-context` locally, or compare
  `(lib/->legacy-MBQL new-query)` against the old macro's output in a REPL
  (`clojure-eval`), remembering `:lib/uuid`s are random.

---

## 8. Style rules

- **Naming**: `mp` for `(mt/metadata-provider)` (575 in-tree precedents vs 42 for
  the long name). Derived/wrapped providers: `mp0`, `mp2`, or descriptive. Field
  bindings named after the column: `orders-created-at`, `venues-price`,
  `products-id`. Table bindings named after the table: `orders`, `venues`. The
  built query is `query` (or `q1`/`q2` when there are several).
- **One `let` per deftest**, binding in order: `mp` → table metadata → field
  metadata → `query`. Bind `results` once when asserting on both `mt/cols` and
  `mt/formatted-rows` (precedent `order_by_test.clj:141-164`).
- **Threading**: `->` by default. Switch to `as->` (binding `q` or `$query`/`$q`)
  the moment a step needs the query-so-far — `lib/expression-ref`,
  `lib/aggregation-ref`, `lib/filterable-columns`, `lib/orderable-columns`,
  `lib/suggested-join-conditions`, `lib/available-binning-strategies`. Inline
  `(as-> $query ...)` inside a `->` is accepted precedent
  (`order_by_test.clj:147`).
- **Field lookups**: `lib.metadata/field` calls go in the `let` bindings at the top
  of the test, not inline mid-thread, unless used exactly once and the line stays
  short.
- **Requires to add** (sorted, only what's used):
  ```clojure
  [medley.core :as m]                                            ; find-first
  [metabase.lib.core :as lib]
  [metabase.lib.metadata :as lib.metadata]
  [metabase.lib.expression :as lib.expression]                   ; only for non-re-exported fns / value
  [metabase.lib.test-util :as lib.tu]                            ; mock/remap providers
  [metabase.lib.test-util.notebook-helpers :as lib.tu.notebook]  ; find-col-with-spec, add-breakout
  [metabase.query-processor.test :as qp]                         ; process-query (test facade)
  ^{:clj-kondo/ignore [:deprecated-namespace]}
  [metabase.query-processor.store :as qp.store]                  ; only if with-metadata-provider needed
  ```
- **Requires to remove** when the file goes fully clean: nothing forced — but drop
  any require that became unused (kondo will flag it).
- **Alias conventions are fixed**: `lib`, `lib.metadata`, `lib.tu`,
  `lib.tu.notebook`, `mt`, `qp`, `qp.store`, `m`. Do not invent alternates; do not
  alias `metabase.lib.test-util.macros` in app-DB test files at all.
- Keep `mt/with-native-query-testing-context` wherever the old test had it (and add
  it where R51 says to); it accepts lib queries unchanged.
- `assoc` / `assoc-in` directly on lib queries for `:middleware`, `:parameters`,
  `:info`, etc. — no special API.
