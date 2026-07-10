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

**OLD** (`cumulative_aggregation_test.clj:33-37` as of commit `05bf1d32`; this test
was itself ported in wave 1b — see `cumulative-sum-test-2` in the current file for
its Lib form):

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

**NEW** (`cumulative_aggregation_test.clj:113-132` — the canonical example):

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

Dotted **table** symbols (schema-qualified / odd table names, e.g.
`(mt/run-mbql-query objects.stuff)` in `postgres_test.clj:205`): in table position
the whole symbol is the table name — the port is `(mt/id :objects.stuff)`. Verify by
running; if `mt/id` resolution fails, flag the test as a manual case.

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

Why per-call `(mt/metadata-provider)` after a mutation is safe (do not re-derive
per file): `application-database-metadata-provider` returns a brand-new, uncached
provider on every call outside a `*metadata-provider-cache*` binding
(`src/metabase/lib_be/metadata/jvm.clj:610-621`), so a helper invoked once before
and once after a `tu/with-temp-vals-in-db` mutation sees fresh metadata each time.

### Field & table refs (the sigil table)

**R6 — `$field` → field metadata by ID.**

```clojure
;; OLD                          ;; NEW
$price                          (lib.metadata/field mp (mt/id :venues :price))
$categories.name                (lib.metadata/field mp (mt/id :categories :name))
;; nested (3+ segments, Mongo/BigQuery nested columns):
$tips.source.username           (lib.metadata/field mp (mt/id :tips :source :username))
```

Column metadata is accepted directly by every filter/aggregation/breakout/order-by
builder — no explicit `:field` clause needed. Bind each field once at the top of the
`let`, named after the column (§8). Nested field sigils like `$tips.source.username`
work because `mt/id` takes nested field names variadically
(`test/metabase/test/data.clj:245-246`) and nested fields are real Field rows, so
the ID lookup resolves.

Redundantly-wrapped sigils like `[:field $category_id nil]` (a `:field` clause
whose "id" is itself a `:field` clause) are equivalent to the bare sigil: legacy
normalization flattens `[:field [:field id opts] opts2]` into one clause with the
options merged (`src/metabase/legacy_mbql/schema.cljc:393-401`). Port them as a
plain R6 field lookup (plus R23/R24 builders for any merged options).

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

**R9 — `*field` (name-based ref, resolved from app DB): split by stage.** The
result-metadata code preserves whether the original ref was by-ID or by-name
(`src/metabase/lib/metadata/result_metadata.cljc:309-325`), so the goal is to keep
emitting a *name* ref. How you get one depends on where the column comes from:

- **Column from a previous stage or a source card (inherited column)** — this is
  R10's case: find the column by `:name` in `lib/breakoutable-columns` /
  `lib/filterable-columns` etc. and pass the metadata to the builder. `lib/ref` on
  an inherited column produces a name ref, so ref style is preserved.
- **Stage-0 column of a plain `:source-table` query** — the name lookup does NOT
  preserve ref style: the column metadata carries an `:id`, and
  `column-metadata->field-ref` prefers `:id` for non-inherited columns
  (`src/metabase/lib/field.cljc:461-475` — `((some-fn :id ...) metadata)`), so
  `lib/ref` emits `[:field {} 123]` and the port causes exactly the
  `:field_ref`/`:cols` change this rule exists to avoid. **Policy:** hand-write the
  MBQL-5 name-ref clause (options-first, driver-cased name — the old macro emitted
  `[:field "NAME" {:base-type ...}]` via `mbql_query_impl.cljc:126-136`):

  ```clojure
  ;; OLD: :breakout [*name]      (stage-0 name ref into the source table)
  ;; NEW (raw MBQL-5 clause; builders accept it):
  (lib/breakout q (lib/expression-clause :field ["NAME"] {:base-type :type/Text}))
  ;; equivalently: [:field {:lib/uuid (str (random-uuid)), :base-type :type/Text} "NAME"]
  ```

  If the surrounding test makes this awkward, treat the test as a §4.5 manual case
  rather than silently switching to an ID ref.

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

**Composed sigils.** The sigils wrap recursively
(`test/metabase/test/data.clj:120-123`; impl
`mbql_query_impl.cljc:166-184` re-parses the inner token), and real files use the
composed forms (`explicit_joins_test.clj:331,354,498-499`; mongo
`query_processor_test.clj` `&Tips.$tips.source.categories`):

- `&alias.$table.field` — the `$` is just explicit; port as R12 as-is.
- `&alias.*table.field` (join alias over a NAME ref) — do NOT use the
  `lib.metadata/field` + `with-join-alias` fallback (that emits an ID ref). Build
  the name-based ref per R9 — preferably find the joined column by `:name`
  (driver-cased) among `lib/visible-columns` / the join's RHS columns, which for
  columns inherited from a joined source query preserves the name ref — then apply
  `(lib/with-join-alias col "alias")` if the alias is not already on the column.
- `&alias.*name/Type` — same, via the R10 previous-stage/name lookup.
- `!unit.*field` — R9 name-based ref, then `lib/with-temporal-bucket`.
- `!unit.&alias.field` / `&alias.!unit.field` — compose R12 + R23.

Files using composed sigils go on the §4.5 run-to-verify list.

### Filters

**R13 — `:filter` clause → `lib/filter` + constructor.**

```clojure
;; OLD: :filter [:= $id 1]
;; NEW:
(lib/filter q (lib/= venues-id 1))
```

Constructors (all verified in `src/metabase/lib/filter.cljc:374-398`, re-exported
from `lib` per `src/metabase/lib/core.cljc:713-730`): `and or not = != in not-in
< <= > >= between inside is-null not-null is-empty not-empty starts-with ends-with
contains does-not-contain relative-time-interval time-interval segment`.
`during` is NOT re-exported — call it as `lib.filter/during` (requires
`[metabase.lib.filter :as lib.filter]`); `lib/during` is a compile error.

Multi-value comparison filters are ported **arg-for-arg** — `=`, `!=`, `in`,
`not-in`, `starts-with`, `ends-with`, `contains`, `does-not-contain` are variadic
(`filter.cljc:377-394`): `[:= $x "a" "b"]` → `(lib/= x "a" "b")`. Do NOT rewrite as
`(lib/or (lib/= x "a") (lib/= x "b"))` — that compiles to different SQL than the
old `IN`-style clause.

**R14 — Legacy `[:and ...]` / `[:or ...]`.** A **top-level** `:filter [:and a b]`
ports as multiple `lib/filter` calls (they AND together). This matches what the old
pipeline actually saw: legacy→MBQL-5 conversion drops a leading `:and` and splices
its args into the stage's `:filters` list
(`src/metabase/lib/util.cljc:206-214,269`), whereas `(lib/filter q (lib/and a b))`
produces the different shape `:filters [[:and a b]]` that the old query never had.
Use `lib/and` / `lib/or` only for **nested** boolean subexpressions (an `:or` at
top level, or `:and`/`:or` inside another clause).

**R15 — `{:case-sensitive false}` option on string filters → `lib/ignore-case`.**

```clojure
;; OLD: [:contains $name "foo" {:case-sensitive false}]
;; NEW:
(lib/ignore-case (lib/contains venues-name "foo"))
```

(`src/metabase/lib/core.cljc:1717-1722`, implemented as
`(lib.options/update-options expr assoc :case-sensitive false)`.)

**R16 — Segments & time intervals.** `[:segment (:id segment)]` →
`(lib/segment (:id segment))` (`lib.common/defop segment [segment-id]`,
`src/metabase/lib/filter.cljc:398`).

A segment ref is valid **anywhere a boolean expression is required**, including as
the condition argument of conditional aggregations (`count-where`, `sum-where`,
`distinct-where`, `share`): `:segment` is schema-typed `:type/Boolean`
(`src/metabase/lib/schema/filter.cljc:185`, `src/metabase/lib/schema/ref.cljc:273`),
matching those constructors' `::expression/boolean` arg
(`src/metabase/lib/schema/aggregation.cljc:33-38`). Do not re-derive this per file:

```clojure
;; OLD: :aggregation [[:count-where [:segment 1]]]
;; NEW:
(lib/aggregate q (lib/count-where (lib/segment 1)))
;; OLD: :aggregation [[:sum-where $price [:segment 1]]]
;; NEW:
(lib/aggregate q (lib/sum-where venues-price (lib/segment 1)))
```

Precedent: pilot `count_where_test.clj` / `sum_where_test.clj` /
`distinct_where_test.clj` `segment-test`s. Segment ports are on the §7 mandatory
compiled-shape parity list.

Time intervals: `[:time-interval $created_at -30 :day]` →
`(lib/time-interval orders-created-at -30 :day)`.

- Keyword amounts pass straight through: `[:time-interval $f :last :month]` →
  `(lib/time-interval col :last :month)` (same for `:current` / `:next`).
- A trailing **options map** has no builder arg — `lib/time-interval` is a fixed
  3-arity op (`lib.common/defop time-interval [x amount unit]`,
  `src/metabase/lib/filter.cljc:396`). Port options via
  `lib.options/update-options` (requires `[metabase.lib.options :as lib.options]`):

  ```clojure
  ;; OLD: [:time-interval $last_login -15 :day {:include-current true}]
  (lib.options/update-options (lib/time-interval col -15 :day) assoc :include-current true)
  ```

  Precedent: `test/metabase/query_processor/expressions_test.clj:1379-1381`. A
  literal empty options map (`[:time-interval $f 2 :year {}]`) is a no-op — drop it.

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

Legacy normalization also accepted a single **un-nested** clause —
`:aggregation [:count]` ≡ `:aggregation [[:count]]` and
`:aggregation [:sum [:case ...]]` ≡ `[[:sum [:case ...]]]` (real examples:
`nested_queries_test.clj:117-135`, `case_test.clj:74-77`). Treat it as exactly one
aggregation, not as multiple entries.

**R17b — `[:metric N]` aggregation refs: two distinct cases. Metric ports are on
the §7 mandatory compiled-shape parity list.**

*Case 1 — adding a metric aggregation to a NON-metric-sourced query* (the stage's
source is a plain table/card with no pre-existing `[:metric]` entry):
`(lib/aggregate q (lib.metadata/metric mp N))`. `lib.metadata/metric`
(`src/metabase/lib/metadata.cljc:189-195`) returns the metric card's metadata —
it only requires the card metadata to carry `:type :metric` — and `lib/aggregate`
accepts it directly. Precedent: `test/metabase/measures/models/measure_test.clj:106`,
`test/metabase/query_processor/middleware/metrics_test.clj:1128-1141`.

- Arithmetic over metrics: `[:+ [:metric 1] [:metric 2]]` →
  `(lib/+ (lib.metadata/metric mp 1) (lib.metadata/metric mp 2))` (precedent
  `measure_test.clj:124` — metric metadata nests inside arithmetic ops).
- Fallback when metadata lookup is awkward (forward references): a raw MBQL-5
  clause works — `(lib/aggregate q [:metric {:lib/uuid (str (random-uuid))} N])`
  (precedent `test/metabase/usage_metadata/extract_test.clj:218`).

*Case 2 — the metric used as its own source*: the old query pairs
`:source-table "card__N"` with `:aggregation [[:metric N]]` where card N IS the
metric (e.g. `case_test.clj:86-87`, the pilot `metric-test`s). There is **no clean
builder path**. Do NOT use `(lib/query mp (lib.metadata/card mp N))` +
`lib/aggregate`: `lib/query` special-cases `:type :metric` cards through
`metric-query` (`src/metabase/lib/query.cljc:257-284`), which already injects the
`[:metric {} N]` aggregation AND re-sources the stage onto the metric's own
first-stage `:source-table`/`:source-card` — adding `lib/aggregate` on top
double-adds the aggregation, and no variant of that recipe reproduces the legacy
`{:source-card N}` stage shape (see `test/metabase/lib/metric_test.cljc:210-220`).
**Policy: use the R56 raw-map hybrid, with a TODO comment:**

```clojure
;; TODO(mbql5-migration): no builder path reproduces :source-card + [:metric] — lib/query on a
;; :type :metric card re-sources the stage and pre-adds the aggregation (metric-query).
(lib/query mp {:database (mt/id)
               :type     :query
               :query    {:source-table "card__N"
                          :aggregation  [[:metric N]]}})
```

(`case_test.clj:86-87` is this same hybrid spelled
`(lib/query mp (mt/mbql-query venues {:aggregation [[:metric 1]], :source-table "card__1"}))` —
prefer the raw map above so the file sheds the deprecated macro.)

*Mock metric cards*: a `lib.tu/mock-metadata-provider` `:cards` entry with
`:type :metric` MAY carry an MBQL-5 lib query as its `:dataset-query` — both
`metric-query` (`query.cljc:260`) and the QP metrics middleware
(`src/metabase/query_processor/middleware/metrics.clj:183-192`) re-wrap the stored
`:dataset-query` with `lib/query`, which accepts MBQL 5. Precedent:
`metrics_test.clj:1128-1141,1165-1171`. See R42 for provider layering, naming
(`mp` + `mock-mp`), and the keep-extra-card-keys rule.

The metrics test module (`metrics/api_dataset_test.clj`, `metrics/api_test.clj`,
`metrics/api_arithmetic_test.clj`) is dominated by this pattern.

**R18 — `[:aggregation-options agg {:display-name "..."}]` →
`lib/update-options` setting `:display-name` ONLY.**

```clojure
;; OLD: [:aggregation-options [:sum $price] {:display-name "Total Price"}]
;; NEW:
(lib/aggregate q (lib/update-options (lib/sum venues-price) assoc :display-name "Total Price"))
```

Do **NOT** use `lib/with-expression-name` here: for aggregations it sets **both**
`:name` and `:display-name` (`src/metabase/lib/expression.cljc:546-567` —
`(assoc opts :name new-name :display-name new-name)` for any clause without
`:lib/expression-name`), while the legacy clause converts to MBQL 5 with only
`:display-name` (`src/metabase/lib/convert.cljc` merges the legacy options map
verbatim). `:name` drives the result column name and the compiled SQL alias, so
`with-expression-name` silently changes `mt/cols` / `rows+column-names` /
native-SQL output (old column `"sum"` would become `"Total Price"`) — including in
row-only tests where no assertion catches it. If you do use `with-expression-name`
anywhere, the §7 compiled-SQL parity check is mandatory for that test.

**R19 — `:aggregation-options` with `:name` (SQL column alias) →
`lib/update-options` with both keys.** When the old test set `:name` specifically
(assertions on SQL aliases), or both `:name` and `:display-name`, set exactly the
keys the old clause set:

```clojure
;; OLD: [:aggregation-options [:sum $price] {:name "sum_2", :display-name "sum_2"}]
(lib/update-options (lib/sum venues-price) assoc :name "sum_2" :display-name "sum_2")
;; OLD: {:name "sum_2"} only
(lib/update-options (lib/sum venues-price) assoc :name "sum_2")
```

Note: not every legacy options map arrives via an `:aggregation-options` wrapper.
The legacy `[:offset opts expr n]` clause carries an MBQL-5-style options map
inline as its second element (legacy→5 conversion keeps it verbatim,
`src/metabase/lib/convert.cljc:436-440`). The same `lib/update-options` recipe
applies directly to the constructed `(lib/offset ...)` clause — there is no
wrapper to look for. A hard-coded `:lib/uuid` inside such a legacy opts map is
non-semantic and may become a fresh random uuid in the port.

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

**Duplicate-breakout trap:** `lib/breakout` silently DROPS a duplicate breakout
(`src/metabase/lib/breakout.cljc:48-58`, via `lib.schema.util/opts-distinct-key`).
Differing `:temporal-unit`s count as distinct (only namespaced keys,
`:base-type`/`:effective-type`, and `:temporal-unit :default` are stripped from
the distinct key), so month/year/day breakouts of one field are safe — but an old
test with a genuinely duplicate breakout entry, or a `!default.f` breakout
alongside a bare `f` breakout of the same field, would silently lose a breakout in
a "mechanical" port with no builder error. Such tests are §4.13 material — keep
legacy + TODO.

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
`test/metabase/query_processor/binning_test.clj` (ported in wave 1a, commit
`3823ec6e` — line numbers shift as the file evolves; look for the `lib/with-binning`
calls), `test/metabase/query_processor/expression_aggregations_test.clj:412`.

### Order-by

**R25 — `:order-by [[:asc $f]]` → `lib/order-by`.**

```clojure
;; OLD: :order-by [[:asc $id]]           ;; NEW: (lib/order-by q venues-id)   ; :asc is default
;; OLD: :order-by [[:desc $price]]       ;; NEW: (lib/order-by q venues-price :desc)
;; OLD: multiple entries                 ;; NEW: chained lib/order-by calls, in order
```

Write the explicit `:asc` only when it aids symmetry with a neighboring `:desc`;
both forms exist in converted files.

**Duplicate-order-by trap:** `lib/order-by` silently drops a duplicate order-by
(direction-insensitive; `src/metabase/lib/order_by.cljc:104-113`, QUE-1604) and
the MBQL-5 `::order-by/order-bys` schema requires distinct clauses
(`src/metabase/lib/schema/order_by.cljc:25-28`). A test whose legacy query
deliberately contains duplicate order-bys (to exercise the normalization
middleware's dedup) would compile and PASS after a mechanical port while no longer
testing anything — §4.13 material, keep legacy + TODO.

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

**Expressions interaction (R28×R33):** `lib/with-fields` auto-appends refs for any
stage expressions NOT matched among the refs you pass
(`src/metabase/lib/field.cljc:536-545`). When the old `:fields` list already
included every expression ref (the common case), the port is a no-op — but if the
legacy `:fields` deliberately EXCLUDED an expression column, `lib/with-fields`
silently adds it back: a result-shape change no assertion may catch. On a stage
with `:expressions`, diff the ported stage's `:fields` against the legacy list
before declaring the test ported; if the old list excluded an expression, treat as
a manual case.

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

Keyword keys (`:expressions {:CATEGORY [:concat $category "2"]}` — real examples
`test/metabase/driver/sql/query_processor_test.clj:836,945,959`) were stringified by
legacy normalization; port them as their `name` string:
`(lib/expression q "CATEGORY" ...)`, and downstream `[:expression "CATEGORY"]` refs
use that same string.

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

**R34 — Clause with no (suitable) builder → `lib/expression-clause` escape hatch.**

```clojure
;; e.g. (lib/expression-clause :datetime-diff [orders-created joined-created :hour] nil)
```

Precedent: `explicit_joins_test.clj:1548-1551`. "No suitable builder" includes
**builder-exists-but-wrong-arity**: several `defop`s have FIXED arities stricter
than their MBQL-5 schemas — e.g. `lib/substring` is `defop [s start end]`
(`src/metabase/lib/expression.cljc:376`) while the schema's `length` arg is
optional (`src/metabase/lib/schema/expression/string.cljc:35-38`), so a two-arg
legacy `[:substring s start]` needs the escape hatch, not the builder.

**R34a — the `:if` clause.** There is NO `lib/if` builder — `:if` is an alias tag
of `:case` (`src/metabase/lib/schema/expression/conditional.cljc:79,267`). The
decided port is `lib/expression-clause` with **FLAT** args:

```clojure
;; OLD: [:if pred1 e1 pred2 e2 fallback]   (also {:default fallback} spelling)
;; NEW:
(lib/expression-clause :if [pred1 e1 pred2 e2 fallback] nil)
```

This works because `expression-clause` routes through `group-case-or-if-args`
(`src/metabase/lib/fe_util.cljc:205-223`), which regroups an odd-count flat arg
list into `[[pred expr] ...]` pairs plus a trailing fallback — exactly matching
the legacy `{:default}` conversion (`src/metabase/lib/convert.cljc:381-387,
516-523`). Do NOT hand-nest the pairs yourself: `group-case-or-if-args` treats a
passed pairs-vector as ONE even-count arg list and skips regrouping, so
hand-nested args come out double-nested. The flat spelling is the only correct one.

**R34b — runtime-dynamic operator** (a helper parameterized on the op keyword,
e.g. `(time-query :between ...)` — R13 assumes a static constructor). Decided port:

```clojure
(lib/expression-clause op-keyword (into [col] args) nil)
```

Verified chain: `lib/expression-clause` is re-exported from `lib.fe-util`
(`src/metabase/lib/core.cljc:1451`); its `:mbql/expression-parts` method
(`fe_util.cljc:243-248`) builds `[op {} & args]`, mapping args through
`lib.common/->op-arg` (column metadata → `lib.ref/ref`, i.e. an ID ref matching
the old `$` sigil; literals pass through), then `ensure-uuid` + normalize;
`fix-expression-clause` only rewrites `:case`/`:if`. Caveats:
- `lib/expression-clause` does NOT auto-convert `:=` with >2 args to `:in` — that
  is the separate, un-exported `expression-clause-with-in` (`fe_util.cljc:268-278`)
  — so R13's arg-for-arg parity is preserved.
- `lib.filter/filter-clause` (`src/metabase/lib/filter.cljc:548-558`) builds the
  identical clause from a runtime operator, but is NOT re-exported from
  `metabase.lib.core`; `lib/expression-clause` remains the correct lib-aliased
  choice.

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

**R40b — NATIVE `:source-query` under an MBQL outer query** (native first stage +
MBQL second stage; common in QP tests, e.g. `nested_queries_test.clj:243-246`
`{:source-query {:native sql} :aggregation [:count] :breakout [*price]}`):

```clojure
(-> (lib/native-query mp sql)
    lib/append-stage
    (lib/aggregate (lib/count))
    (lib/breakout <second-stage column>))
```

All second-stage columns are found by `:name` per R10 — they have no field IDs, and
the names are **driver-cased** (they come from the native results). When the native
map came from `qp.compile/compile` (a map with `:query` and `:params`, e.g.
`explicit_joins_test.clj:606-607` wraps one in `mt/native-query`): if `:params` is
empty, extract the SQL string with `(:query compiled)` and use `lib/native-query`;
otherwise use the R45 hybrid —
`(lib/query mp {:database (mt/id), :type :native, :native compiled-map})`.

**R41 — `:source-table "card__N"` → `(lib/query mp (lib.metadata/card mp N))`.**
`lib.metadata/card` is at `src/metabase/lib/metadata.cljc:157`. If N comes from a
`(str "card__" (:id card))` expression, use `(:id card)` directly. **Exception:**
if card N is a `:type :metric` card (typically paired with a `[:metric N]`
aggregation), `lib/query` does NOT produce a `:source-card` stage — see R17b
Case 2 for the decided port.

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

Precedent `binning_test.clj` (the mock source-card test; ported in wave 1a commit
`3823ec6e`, where it now also demonstrates the `mp` + `mock-mp` layered naming).

- **When the BASE provider is still needed too** (e.g. to build a segment
  `:definition` or a mock metric card's `:dataset-query` before the mock exists),
  bind the base as `mp` and the wrapper as `mock-mp` (§8), and build AND run the
  query with `mock-mp` — never with the base (§4.2). Fixture definitions inside the
  mock (`:definition`, `:dataset-query`) are built with `mp`.
- **Extra keys on old mock card/segment definitions (`:database-id`, `:name`, …)
  are kept verbatim** — behavior preservation applies to fixtures too; do not prune
  keys just because the provider tolerates their absence.
- **snake_case keys on mock fixtures are kept verbatim too** (e.g. an old mock
  metric card's `:dataset_query`), even when its value becomes an MBQL-5 lib
  query: `mock-metadata-provider` coerces + normalizes every fixture map via
  `lib.normalize`
  (`test/metabase/lib/test_util/metadata_providers/mock.cljc:111-115`), and
  `normalize-card` kebab-cases keys (`src/metabase/lib/schema/metadata.cljc:637-643`,
  `schema/common.cljc:65-69`); its `:database-id` backfill reads
  `[:dataset-query :database]`, which a lib query also carries. Do NOT rename the
  key to `:dataset-query` just because this rule's examples spell it kebab-case —
  that would violate keep-verbatim.
- This rule covers `:type :metric` cards as well: their `:dataset-query` may be a
  lib query (R17b, precedent `metrics_test.clj:1128-1141`).

When result metadata is needed, either compute
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

**R44 — `mt/native-query` / `mt/query` with `:type :native` and a plain SQL string →
`(lib/native-query mp "SQL...")`** (`src/metabase/lib/native.cljc:194`; template
tags are auto-extracted from the SQL). Precedent for native cards:
`dashboard_test.clj:536-538`.

**Scope: string-SQL natives only.** `mt/native-query` accepts an arbitrary inner
native MAP (`test/metabase/test/data.clj:187-196` normalizes it), which can carry
`:collection` (Mongo), a non-string `:query`, `:params`, or other native-extras
keys — but `lib/native-query`'s 2-arity requires a non-blank *string*
(`native.cljc:198-199`). For native maps with extras, use either:

- the R45 hybrid: `(lib/query mp {:database (mt/id), :type :native, :native native-map})`, or
- the 4-arity `(lib/native-query mp sql nil {:collection "..."})` /
  `lib/with-native-extras` (`native.cljc:202-212`).

Do not mechanically apply the 2-arity to Mongo-style natives — it throws.

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

Precedent: `test/metabase/queries/models/card_test.clj:965-979` (`t2/update!` with
`(lib/query metadata-provider orders)` + MBQL-5 readback) and
`test/metabase/queries_rest/api/card_test.clj:5055` (`mt/with-temp` with a lib
`:dataset_query`).

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
  (mt/with-native-query-testing-context query
    (mt/formatted-rows [int str] (qp/process-query query))))
```

Notes:
- The bare no-map form `(mt/run-mbql-query venues)` (common, e.g.
  `postgres_test.clj:205`) is R3 + run:
  `(qp/process-query (lib/query mp (lib.metadata/table mp (mt/id :venues))))`.
  For dotted table symbols see the R3 note.
- `mt/rows`, `mt/formatted-rows`, `mt/first-row`, `mt/rows+column-names`, `mt/cols`
  all operate on the results map and work unchanged.
- You lose `run-mbql-query*`'s rethrow-with-query ex-data
  (`test/metabase/test/data.clj:198-205`). **MANDATORY: wrap every converted
  `run-mbql-query` site in `(mt/with-native-query-testing-context query ...)`** —
  no exceptions, so batch files stay uniform (the example above shows the wrapper;
  lib-compatible, precedent `cumulative_aggregation_test.clj:111` and all pilot
  files). For converted `mt/mbql-query` sites that already called
  `qp/process-query` themselves, keep exactly what the old test had — do not add
  the wrapper there (§8). If a test **asserts on** that
  `{:query ...}` ex-data, it is a manual case — do not port mechanically (§4).
  If a test asserts on the exception **class or message** (`thrown?` /
  `thrown-with-msg?` around the run), see the §4.6 extension — the old macro
  rewrapped everything as `ExceptionInfo`, so the port needs per-driver
  verification before it is mechanical.
- **Wrapper scope**: wrap the smallest form containing the `process-query` call,
  and put dependent assertions INSIDE the wrapper so failures carry the context.
  For the bind-result shape — old
  `(let [result (mt/run-mbql-query ...)] (is ...) (is ...))` — the canonical port
  nests the `let` inside the wrapper (precedent
  `cumulative_aggregation_test.clj:19-33`, `cumulative-sum-test`):

  ```clojure
  (mt/with-native-query-testing-context query
    (let [result (qp/process-query query)]
      (is (=? [...] (-> result :data :cols)))
      (is (= [...] (mt/formatted-rows [int] result)))))
  ```
- **Value-returning position is safe**: `do-with-native-query-testing-context`
  returns `(thunk)` through `clojure.test/testing`, which returns its body value
  (`test/metabase/driver/sql/query_processor_test_util.clj:145-154`) — so a
  converted helper may return `ffirst`/rows through the wrapper. The context
  string itself is built in an exception-guarded delay realized only on failure,
  so the wrapper is lazy and behavior-neutral on the success path.
- **Shared execution helpers** (a `defn-`/`letfn` helper running the query for
  many call sites): the wrapper goes INSIDE the helper, around the
  `process-query` call — see R57. This holds even when the helper ALSO serves
  callers that were converted `mbql-query`+`process-query` sites (where the rule
  above says "do not add the wrapper"): **the mandatory rule wins for shared
  helpers** — one body cannot satisfy both, and the wrapper only enriches failure
  output (precedent: `case_test.clj` `test-case`, wave 1a). Corollary: assertions
  evaluated OUTSIDE the helper (e.g. `(is (= [] (mt/rows (run-query))))`) do not
  carry the context — the testing scope pops when the helper returns. That
  matches old behavior (`run-mbql-query` never provided this context), so it is
  acceptable; precedent `share_test.clj` `empty-results-test` (wave 1a).
- `qp` should be `[metabase.query-processor.test :as qp]` (the test facade;
  `process-query` re-exported at `test/metabase/query_processor/test.clj:24`); some
  files already alias `metabase.query-processor` — keep whichever the file has.
  **`mt/process-query` is also a sanctioned facade**: `metabase.test` requires
  `metabase.query-processor.test` (`test/metabase/test.clj:24`) and re-exports
  `process-query` (line 193) — the same fn `run-mbql-query*` called. A file
  already using `mt/process-query` keeps it for converted sites; do not add a new
  `qp` require just for this.

### Top-level keys, middleware, parameters

**R52 — `:middleware` options:** lib queries are plain maps —
`(assoc-in query [:middleware :format-rows?] false)` works directly (canonical
example line 110). Same for `:info`, `:constraints`, `:settings`, `:cache-strategy`
etc.: `assoc` onto the lib query.

**R52a — Pivot keys.** `:pivot-rows` / `:pivot-cols` (and their snake_case twins in
REST payloads) are plain top-level keys per R52: the old
`(merge (mt/mbql-query orders {...}) {:pivot-rows [0 1 2], :pivot-cols []})`
(`pivot_test.clj:119-130`, fed to `qp.pivot/run-pivot-query`) becomes
`(assoc query :pivot-rows [0 1 2], :pivot-cols [])` on the lib query. **Pilot
requirement:** the first pivot file ported must verify by running that
`qp.pivot/run-pivot-query` accepts MBQL-5 input; if it does not, fence ALL pivot
files (`pivot_test.clj`, dashboard/embed pivot endpoints) into the manual batch and
record that here.

**R52b — Post-construction surgery on the macro output via `[:query ...]` paths.**
Lib queries have `:stages`, not `:query` — a kept-as-is
`(assoc-in query [:query :limit] 0)` silently creates a dead `:query` key and
changes nothing. Top-level assoc/merge keys survive unchanged (R52), but every
`[:query ...]` path must be re-expressed:

```clojure
;; OLD: (assoc-in (mt/mbql-query venues) [:query :limit] 0)     ; dashboard_subscription_test.clj:285-286
;; NEW: (lib/limit query 0)
;; OLD: (update-in q [:query :fields] conj ...)                 ; → lib/with-fields (R28)
;; OLD: (assoc-in q [:query :breakout] ...)                     ; → lib/breakout (R22)
```

For inner-query keys with no builder, use the stage path directly —
`(assoc-in query [:stages 0 <key>] ...)` (stage 0 IS the legacy `:query` level for a
single-stage query; use `[:stages -1 ...]` semantics via `lib.util/update-query-stage`
or index the last stage explicitly for multi-stage queries). Grep each file for
`[:query` before declaring it ported.

When the surgery target is a **helper-built** query (e.g.
`(assoc-in (helper-query) [:query :limit] 0)`), the lib rewrite
(`(lib/limit (helper-query) 0)`) goes at the CALL SITE, not inside the helper —
other callers may not want the modification (R57).

**R53 — `:parameters`:** `(assoc lib-query :parameters [...])`, keeping the
parameter maps **byte-for-byte** — parameter `:target`s
(`[:dimension [:field ...]]`, `[:variable [:template-tag ...]]`) are still legacy
refs *by MBQL-5 schema* (`src/metabase/lib/schema/parameter.cljc:216-234`). Do NOT
modernize targets. `mt/$ids`-built refs inside targets stay, or become hand-written
`[:field (mt/id :t :f) nil]`.

**R54 — `mt/$ids` used to build refs for parameters/expected values** stays or
becomes hand-written literal clauses with `(mt/id ...)`. Never force `$ids` output
through lib builders.

**R54a — Sandbox (GTAP) definitions** (`met/with-gtaps!` et al.;
`sandboxing_test.clj:71-81` is the canonical shape
`{:query (mt/mbql-query venues), :remappings {:cat ["variable" [:field (mt/id :venues :category_id) nil]]}}`):

- The `:query` value becomes a card's `dataset_query`, so R46 applies — a lib query
  is acceptable. **Pilot requirement:** verify with one run before batch-applying;
  if the GTAP fixture path rejects MBQL 5, keep the legacy map + TODO.
- `:remappings` values are parameter-target-like: keep them **byte-for-byte**, same
  policy as R53/R54. Do not modernize the `["variable" [:field ...]]` /
  `["dimension" ...]` targets.
- Middleware-**output** assertions in the same files (e.g. `=?` against
  `apply-row-level-permissions` results) fall under §4.1 / §5 — manual batch.

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

Precedent: `count_where_test.clj:2` (one entry — `run-mbql-query` kept for the
TODO-fenced normalization site), `drill_thru_e2e_test.clj:1-13` (none);
`binning_test.clj` had one entry pre-wave but is now fully header-free (wave 1a,
commit `3823ec6e`).

**Expect stale entries — grep, don't trust the header as an inventory of sites.**
Files in the wild list vars with ZERO body usages (e.g. a header naming
`mbql-query` when only `run-mbql-query` call sites exist). The zero-usages rule
applies: prune stale entries without hesitation, after grepping the body.
`mt/query` and `mt/native-query` are the same deprecated family — convert their
call sites in the same pass **where they are query-construction sites**. Exception:
call sites that build an EXPECTED value (§5) are NOT converted in this pass — for
those, keep the macro, keep its kondo entry, and add a `TODO(mbql5-migration)`
comment. **The header entry for a var may be removed ONLY when the file has zero
remaining usages of that var.** Usages kept behind a `TODO(mbql5-migration)`
comment still require the entry — deleting it would reintroduce `:deprecated-var`
lint warnings. (§7 bullet 4's "every remaining usage carries a TODO" condition is
about marking the FILE done, not about pruning the header.)

### Transitional escape hatch

**R56 — `lib/query` wrapping a legacy map is a sanctioned intermediate step.**
`(lib/query mp (mt/mbql-query venues {...}))` and
`(lib/query mp {:database (mt/id) :type :query :query {...}})` both convert legacy →
MBQL 5 with metadata attached (`src/metabase/lib/query.cljc:198-208`). Use it only
when a construct has no clean builder path and note it with
`;; TODO(mbql5-migration)`. `lib/query-from-legacy-inner-query`
(`query.cljc:321`) exists for inner maps but is not the preferred target.

### Shared helper functions

**R57 — Shared helpers (`defn-` / `letfn`) follow the same rules as deftest
bodies, with these decided extensions:**

- **Style/scope**: a helper that builds (and possibly runs) a query gets the same
  `let` shape as a deftest body — `mp` first, table, fields, `query` (§8). Keep
  the helper (§1's no-restructuring rule); do not inline it into its callers. The
  helper must construct `mp` **inside its own body at call time** — never at load
  time, and never accept a pre-built `mp` from an outer scope that could straddle
  an `mt/dataset` boundary or an R5 mutation. R4/R5 then hold via each CALLER's
  dynamic scope — reviewers must check every caller (the helper body alone cannot
  show compliance).
- **Two `mp`s across deftest + helper are fine**: a deftest may bind its own `mp`
  to build a clause argument while the helper binds another `mp` to build the
  query. Column metadata is a plain map; the ref built from it is identical. §8's
  one-`let`-per-deftest wording does not forbid this.
- **R51 wrapper**: for helpers that run converted `run-mbql-query` sites, the
  `mt/with-native-query-testing-context` wrapper goes inside the helper around
  the `process-query` call, even when other callers were
  `mbql-query`+`process-query` sites (mandatory rule wins — see R51).
- **Helpers whose PARAMETERS are legacy clause fragments** (e.g.
  `(test-math-expression [:round 0.7])`, a helper splicing the vector into its
  query): port the helper's contract to accept **lib clauses**, and convert
  **every call site atomically in the same edit** — a missed caller would pass a
  legacy vector into lib builders. This is behavior-preserving because the old
  macro passed plain vectors through as runtime values that normalized to the
  same MBQL-5 shapes the lib constructors now build. Audit ALL callers before
  starting (broader than the per-deftest workflow of §6).
- **One caller must stay legacy after the helper converts**: inline that call as
  an explicit `mt/run-mbql-query` (or `mt/mbql-query`) map reproducing the
  helper's query shape, with the usual kondo entry + TODO. `nil`-valued optional
  keys the helper passed (e.g. `:filter nil`) may be dropped — legacy
  normalization strips them, so argue equivalence from normalization, not byte
  identity. Precedent: `string_extracts_test.clj` (wave 1b).
- **Post-construction surgery on a helper-built query** is rewritten at the call
  site, not inside the helper (R52b).

---

## 4. Hard cases & decisions

Each case below has a **decided policy** — apply it without re-litigating.

**4.1 Tests asserting on literal legacy query maps** (middleware tests, preprocess
tests, compile-shape tests). `qp.preprocess/preprocess` returns MBQL 5; built lib
queries contain random `:lib/uuid`s so `=` between independently built queries
fails. **Policy:** these files are NOT mechanical ports — batch them separately for
a manual pass. Within that pass the three accepted techniques (all with in-repo
precedent) are: (a) `=?` against a hand-written MBQL-5 shape using `(mt/id ...)`
IDs and `{}` option maps (`optimize_temporal_filters_test.clj:493-502`); (b)
`lib.tu.macros/mbql-5-query` for expected values
(`test/metabase/lib/test_util/macros.clj:71-89`); (c) convert the actual with
`lib/->legacy-MBQL` and keep the legacy expected literal
(`nested_queries_test.clj`, `breakout_test.clj`; do NOT cite `binning_test.clj`
for this — its only `->legacy-MBQL` use converts a query at a helper boundary,
R48-style, not an assertion actual). Never expect stable uuids.

**Technique (b) is ONLY for the pure-unit files of §4.3** (those already on
`meta/metadata-provider`). The macro is hard-wired to the STATIC test metadata: it
expands to `(lib.query/query meta/metadata-provider ...)` and resolves sigils via
`metabase.lib.test-metadata/id` (`macros.clj:71-89`) — there is no way to point it
at `(mt/metadata-provider)` / `(mt/id)`. In an app-DB test the expected query would
carry static `meta/` IDs and the wrong database ID, so the comparison can never
pass. For app-DB shape assertions (sandboxing, permissions, preprocess tests over
`mt/` data), the sanctioned techniques are (a) and (c) only.

**4.2 Mock-provider tests (`qp.store/with-metadata-provider` around the run).**
The store WINS over the query's baked-in provider when both exist
(`src/metabase/query_processor/setup.clj:133-147`). **Policy:** the provider used to
*build* must be the provider used to *run*. Build the lib query with the mock
provider itself; keep the `with-metadata-provider` wrapper when the provider is a
mock/override; drop the wrapper only when it was a redundant plain
`(mt/metadata-provider)` around `process-query`.

When the mock is layered over a still-needed base provider (R42), the query is
built with the **wrapper** (`mock-mp`), and `qp.store/with-metadata-provider` also
gets `mock-mp`. Unmocked lookups delegate to the base, so table/field metadata
looked up through `mp` and `mock-mp` is identical for unmocked entities — reuse the
`mp`-sourced field/table bindings inside the query rather than re-looking them up
through `mock-mp`.

(Both spellings are behavior-identical precisely because unmocked lookups
delegate: the wave-0 pilot files inline the table lookup through `mock-mp` while
this rule says to reuse the `mp`-sourced binding. The `mp`-sourced-binding form is
the preferred style for NEW ports; do not flag the pilot's inline-through-`mock-mp`
shape as a defect, and do not rewrite already-ported files either way.)

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
`:field_ref`/`:name`/`:cols` expectations — and for **stage-0 source-table columns**
even a name lookup in `breakoutable-columns` yields an ID ref (R9). **Policy:**
inherited columns (previous stage / card) port per R10 (name-based column lookup);
stage-0 `*field` ports as a hand-written MBQL-5 name-ref clause per R9 or goes to
the manual batch. Either way, RUN the test — never batch-port `*`-sigil tests
without executing them. Files with composed sigils (`&alias.*table.field`,
`!unit.*field` — R12) are on the same run-to-verify list.

**4.6 Tests asserting on `run-mbql-query*`'s `{:query ...}` ex-data.** **Policy:**
manual case; either keep `mt/run-mbql-query` for that test (with kondo exclusion +
TODO) or rewrite the assertion knowingly in the manual pass. Do not silently drop
the assertion.

**4.6b Exception-CLASS/message assertions around a converted run site.**
`run-mbql-query*` rewrapped ANY `Throwable` as `clojure.lang.ExceptionInfo`
carrying `(ex-message e)` (`test/metabase/test/data.clj:198-205`), so an old
`(is (thrown-with-msg? ExceptionInfo re (mt/run-mbql-query ...)))` passed no
matter what the QP threw. A converted site newly depends on `qp/process-query`
ITSELF throwing an `ExceptionInfo` whose message matches. **Policy:** such a port
is mechanical only after verifying, for **every driver that reaches the throwing
branch** in that test, that the QP path throws `ExceptionInfo` with a matching
outer message; otherwise keep legacy + TODO. Verified once (do not re-derive for
sql-jdbc drivers): the execute path wraps driver exceptions as
`ex-info "Error executing query: {0}"` embedding the original driver message
(`src/metabase/driver/sql_jdbc/execute.clj:848-857`), and the reduce path wraps as
`"Error reducing result rows: {0}"`
(`src/metabase/query_processor/pipeline.clj:92`) — so a `re-find`-style message
regex still matches for sql-jdbc. Non-sql-jdbc drivers (Mongo, Druid, …) must be
checked per file. Precedent: `share_test.clj` (wave 1a, `:vertica`-only branch).

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

**4.12 Queries handed straight to driver-internal compilation fns** —
`mongo.qp/mbql->native`, `sql.qp/->honeysql`, `sql.qp/mbql->honeysql`,
`driver/mbql->native` (e.g.
`modules/drivers/mongo/test/metabase/driver/mongo/query_processor_test.clj:255,681`
`(mongo.qp/mbql->native query)`; `sandboxing_test.clj:55-69` `sql.qp/->honeysql`
under `qp.store/with-metadata-provider`). These fns receive the driver-facing
(preprocessed, legacy-converted) query, NOT an MBQL-5 lib query — a mechanically
ported lib query passed to them does not behave like the macro output did.
**Policy — NOT mechanical ports:**
(i) if the assertion is on the final compiled output, switch the call to
`qp.compile/compile` on the lib query — it runs the full preprocess pipeline and
accepts MBQL 5; (ii) if the test intentionally exercises the driver fn in
isolation, keep the legacy map (kondo exclusion + `TODO(mbql5-migration)`).
Driver test directories (`modules/drivers/*/test`) are in scope for the migration —
run them with the relevant `--drivers=` per §6 step 8.

**4.13 Intentionally-REDUNDANT clauses that lib builders normalize away at
construction.** Distinct from 4.4 (intentionally-invalid): the legacy query is
valid, but the MBQL-5 builder silently drops/merges the redundancy — duplicate
order-bys (`lib/order-by` dedups, R25 note), duplicate breakouts (`lib/breakout`
drops them, R22 note), and any similar no-op clause the test exists to prove the
legacy normalization middleware handles. A mechanical port compiles AND passes
while no longer testing anything — invisible to the parse gate and to
before/after test runs alike. **Policy:** keep legacy +
`;; TODO(mbql5-migration): intentionally-redundant clause, normalized away by lib
builders`. Precedent: `order_by_test.clj:39` (wave 1b).

**4.14 Legacy-only `:decode/normalize` VALUE coercions.** The legacy schema
coerces some literal values that the MBQL-5 schema passes through unchanged —
e.g. `:substring`'s start arg: non-positive coerced to 1 via
`::IntGreaterThanZeroOrNumericExpression`
(`src/metabase/legacy_mbql/schema.cljc:589-613`), while the MBQL-5 schema has no
coercion (`src/metabase/lib/schema/expression/string.cljc:35-38`). The value is
schema-VALID in MBQL 5, so nothing fails — behavior silently changes (neither 4.4
nor §5 applies). **Policy:** an assertion exercising a legacy-schema value
coercion absent from MBQL 5 stays on the old macro + TODO. Precedent:
`string_extracts_test.clj:62-66` (wave 1b, the `substring` 0-start site).

**Triage summary:** results-only tests (rows/cols assertions) = mechanical;
query-shape-assertion tests = manual batch (4.1/4.3); mock-provider tests = unify
build/run provider (4.2); metadata-mutating tests = reorder or flag (4.7);
`*`-sigil tests = port then execute-verify (4.5); negative/error tests = skip (4.4);
parameters = verbatim (4.8); driver-internal compile fns = qp.compile or keep legacy
(4.12); exception-class assertions = per-driver verify or keep legacy (4.6b);
intentionally-redundant clauses = keep legacy (4.13); legacy-only value coercions =
keep legacy (4.14); GTAP fixtures = R54a; serialized-form fixtures = manual (§5).

---

## 5. What NOT to port (out-of-scope markers)

- **`mt/$ids` used to construct expected values or assertion fixtures** (legacy
  refs the test *compares against*). The legacy map IS the expectation; porting it
  changes what the test verifies. Leave as-is (`$ids` itself is not marked
  deprecated).
- **`mt/mbql-query` / `mt/query` used to construct an EXPECTED value** — the
  right-hand side of an `=?`/`=` the test compares against, common in middleware
  tests (e.g. `sandboxing_test.clj:241,270`:
  `(is (=? (mt/query nil {...}) (apply-row-level-permissions (mt/mbql-query venues {...}))))`
  — the `mt/query` call IS the expected value). Same policy as `mt/$ids` expected
  values: this is §4.1 manual-batch material. Keep the macro + kondo exclusion +
  `TODO(mbql5-migration)` until the manual pass decides between an `=?` MBQL-5
  shape and `lib/->legacy-MBQL` on the actual. R55's "convert the whole family in
  one pass" does NOT apply to these call sites.
- **Serialization / content-hash / revision-history fixtures** — files whose
  subject is the stored or serialized FORM of a query: serdes v2 tests
  (`enterprise/.../serialization/v2/e2e_test.clj`, `load_test.clj` — export YAML
  shape and load-path ingestion fixtures), remote-sync content-hash tests
  (`enterprise/.../remote_sync/content_hash_test.clj` — asserts hash stability of
  the entity's serialized YAML), and revision tests
  (`test/metabase/revisions/impl/card_test.clj`, `revisions/api_test.clj` —
  Revision rows emulate historical snapshots inserted around the Card model's
  normalizing transforms). Changing how the `dataset_query` is authored risks
  changing what is stored/serialized/hashed rather than just how the query is
  built. **Manual batch:** porting is allowed only after confirming the model's
  write-path normalization makes the stored form identical for both idioms,
  verified by running the file. Do not port these mechanically just because they
  carry the kondo header.
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
- **Hand-rolled legacy-shaped maps that never used a deprecated macro** — e.g. a
  literal outer native map
  `{:database (mt/id), :type :native, :native (qp.compile/compile lib-query),
  :constraints {...}}` fed to `qp/process-query`, or a raw legacy map passed to
  `qp/userland-query-with-default-constraints`. Only `metabase.test.data` macro
  call sites are migration targets; leave these byte-for-byte verbatim — do not
  "helpfully" convert them to `lib/native-query`/`lib/query`. Precedent:
  `constraints_test.clj` (wave 1a).
- Anything in `src/` (production code).

---

## 6. Per-file workflow checklist

0. **Check the file isn't already ported.** Wave manifests have double-counted
   files across waves (e.g. `binning_test.clj` was assigned to wave 1 after being
   ported in wave 1a). Run `git log --oneline -- <file>` and diff against the
   pre-wave commit before starting; orchestrators should deduplicate work queues
   against `git log <pre-wave-sha>..HEAD --name-only` before spawning implementers,
   and reviewers should diff against the pre-wave commit, not HEAD.
1. **Baseline**: run `./bin/test-agent :only '[<ns>]'` on the untouched file. Record
   test count, assertion count, failures (there may be pre-existing failures — note
   them; they are not yours to fix or to regress).
2. **Read the whole file.** Classify each `deftest` against the triage summary
   (§4): mechanical / manual / skip. Note which deprecated vars the kondo header
   lists.
3. **Port test-by-test**, mechanical ones only, applying rules R1-R56. Within each
   test: one `let`, `mp` first, table binding, field bindings, then `query` (§8).
   Every converted `run-mbql-query` site gets
   `mt/with-native-query-testing-context` (R51 — mandatory, not optional).
4. **Never delete or weaken an assertion.** Expected values are copied verbatim.
5. For each test you *cannot* port behavior-preserving, leave it on the old macro
   and add `;; TODO(mbql5-migration): <one-line reason>` directly above it. When
   the unportable site is a **single form inside an otherwise-ported `deftest`**
   (e.g. a "normalization" `testing` block feeding string-keyed clauses — pilot
   `basic-test`s), port the rest of the test and place the TODO directly above the
   kept form, inside its `testing` block; the same one-line-reason format applies.
6. **Prune the ns requires**: add `[metabase.lib.core :as lib]`,
   `[metabase.lib.metadata :as lib.metadata]` (and `lib.tu` / `lib.tu.notebook` /
   `medley.core :as m` only if used); keep requires sorted; remove requires that
   became unused.
7. **Prune the kondo header** per R55 — delete it only when the file has zero
   usages of ALL of `mbql-query`, `run-mbql-query`, `query`, `native-query`
   (from `metabase.test.data`). When grepping for remaining sites, note that
   `mt/with-native-query-testing-context` — the very wrapper R51 mandates —
   matches a naive `native-query` grep; exclude it (e.g.
   `grep -nE 'mbql-query|mt/query|mt/native-query|data/native-query'`) so R51
   wrappers aren't mistaken for un-ported macro sites.
8. **Run** `./bin/test-agent :only '[<ns>]'` again. Compare against the baseline:
   same tests run, same (or more) assertions, no new failures. Local runs are
   **H2-only** by default — for files under `mt/test-drivers`, also run with a
   second driver (`./bin/test-agent --drivers=postgres :only '[<ns>]'`) whenever
   the port touches name-based refs (R9/R10), join aliases (R12/R35/R39, including
   composed sigils), or driver-cased names; driver-module tests
   (`modules/drivers/*/test`) run with their own driver via `--drivers=`.
   Driver-conditional divergence otherwise surfaces only in CI.
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
- **Compiled-SQL/query-shape parity check is MANDATORY, not discretionary, for:**
  - any test touched by R18/R19 (aggregation `:name`/`:display-name` — a wrong port
    changes the SQL alias without failing any row-only assertion);
  - any join-alias rewrite (R12/R35/R39, composed sigils included);
  - any `[:metric N]` port (R17b) and any `[:segment N]` port (R16). A structurally
    different query can run down a different middleware path yet satisfy loose
    assertions — the pilot's `metric-test` would pass `ffirst = 94` whether the
    result was `[[94]]` or `[[94 94]]`. Diff `(lib/->legacy-MBQL new-query)` against
    the old macro's output, or compare `qp.compile` output.

  Compare in a REPL (`clojure-eval`), remembering `:lib/uuid`s are random. These
  are exactly the changes that can pass an unchanged assertion suite while
  compiling different SQL.
- For everything else, spot-check compiled SQL parity when in doubt: wrap both old
  and new queries in `mt/with-native-query-testing-context` locally, or diff
  `lib/->legacy-MBQL` output as above.
- **Silent-normalization check**: whenever the OLD query contains repeated or
  no-op clauses (duplicate order-bys/breakouts, redundant `:field` nesting),
  check whether the lib builder silently alters the clause list at construction
  (§4.13, R22/R25 notes). This class is invisible to the parse gate AND to
  before/after test runs — the force-ported test still passes while testing
  nothing.
- **Static fallback when JVM tests cannot run** (network-restricted environments):
  verification = a parse gate (load the file with bare `clojure.main`), plus
  hand-tracing each builder expansion against the lib source and its unit tests
  (e.g. `test/metabase/lib/metric_test.cljc` for R17b, `lib/filter.cljc` defops for
  R16), plus the `lib/->legacy-MBQL` shape reasoning above — and the full suite
  runs later in CI. This static tracing is exactly what caught the original R17b
  defect; do not skip it just because tests can't execute locally.

  Parse-gate caveat: a bare `clojure.main` reader CANNOT read auto-resolved
  aliased keywords (`::driver/driver`, common in
  `defmethod driver/database-supports?` scaffolding in QP test files) — the
  UNEDITED file fails the gate too, which is easy to misread as port-introduced
  breakage. Fix: bind a permissive `clojure.lang.LispReader$Resolver` as
  `*reader-resolver*` in the gate script (scratchpad-only tooling, not a repo
  file), and always confirm the pre-edit file passes the same gate with the same
  top-level form count before blaming the port.

---

## 8. Style rules

- **Naming**: `mp` for `(mt/metadata-provider)` (575 in-tree precedents vs 42 for
  the long name). When a test needs ONLY a mock provider, the mock is `mp` (R42's
  simple case). When a test needs BOTH the base app-DB provider and a mock layered
  over it (R42/§4.2 — segment `:definition`s, mock metric cards), the base is `mp`
  and the wrapper is `mock-mp`; do not shadow `mp` with the mock in these tests.
  Other derived/wrapped providers: `mp0`, `mp2`, or descriptive. Field
  bindings named after the column: `orders-created-at`, `venues-price`,
  `products-id`. Table bindings named after the table: `orders`, `venues`. The
  built query is `query` (or `q1`/`q2` when there are several).
  Table-prefixed vs bare field-binding names (`orders-total` vs `total`): when the
  file already contains ported tests, **match the file's dominant existing style**
  — that wins over the prefixed examples above; prefixed is the default for files
  with no precedent (and mandatory when two tables have same-named columns).
- **One `let` per deftest**, binding in order: `mp` → table metadata → field
  metadata → `query`. When a `mock-mp` exists, it slots in after the table/field
  bindings it consumes and directly before `query`:
  `mp` → table → fields (looked up via `mp`) → `mock-mp` → `query` (built with
  `mock-mp`, reusing the `mp`-sourced bindings — see §4.2). Bind `results` once
  when asserting on both `mt/cols` and
  `mt/formatted-rows` (precedent `order_by_test.clj:141-164`).
  For multi-table tests, grouping bindings by table (orders table + orders
  fields, then products table + products field) is acceptable — the order rule
  does not require all tables before all fields.
  The same `let` shape applies to shared helper `defn-`s that build queries
  outside any deftest — see R57.
- **Builder-call order mirrors the old map's literal key order** (e.g. the old
  map wrote `:aggregation` before `:breakout` → thread `lib/aggregate` before
  `lib/breakout`). Stage keys are an unordered map so this is purely cosmetic,
  but it keeps wave files uniform, makes diffs reviewable, and stops reviewers
  flagging it inconsistently.
- **Partially-pre-ported files keep their existing conventions**: pre-existing
  Lib-ported tests using the long `metadata-provider` binding name or a
  non-standard alias (e.g. `notebook-helpers` instead of `lib.tu.notebook`) are
  left AS-IS — renaming them is scope creep under §1. Only NEW port code follows
  the conventions in this section; do not copy a file's non-standard legacy style
  into new code either, and reviewers must not flag the resulting mix as a
  violation.
- **Table lookups**: binding the table in the `let` (as in the §2 canonical
  example and the pilot files) is the default. Inline
  `(lib/query mp (lib.metadata/table mp (mt/id :venues)))` — the form R2/R3/R51's
  examples show — is fine when the table metadata is used exactly once and no
  binding would be referenced again (same used-exactly-once rule as fields below).
  Either way, do not mix styles within one file.
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
  [metabase.lib.filter :as lib.filter]                           ; only for during (not re-exported)
  [metabase.lib.options :as lib.options]                         ; update-options (R16/R18/R19)
  [metabase.lib.test-util :as lib.tu]                            ; mock/remap providers
  [metabase.lib.test-util.notebook-helpers :as lib.tu.notebook]  ; find-col-with-spec, add-breakout
  [metabase.query-processor.test :as qp]                         ; process-query (test facade)
  ^{:clj-kondo/ignore [:deprecated-namespace]}
  [metabase.query-processor.store :as qp.store]                  ; only if with-metadata-provider needed
  ```
- **Requires to remove** when the file goes fully clean: nothing forced — but drop
  any require that became unused (kondo will flag it).
- **Alias conventions are fixed**: `lib`, `lib.metadata`, `lib.expression`,
  `lib.filter`, `lib.options`, `lib.tu`, `lib.tu.notebook`, `mt`, `qp`, `qp.store`,
  `m`. Do not invent alternates; do not alias `metabase.lib.test-util.macros` in
  app-DB test files at all.
- Keep `mt/with-native-query-testing-context` wherever the old test had it (and add
  it where R51 says to — mandatory on every converted `run-mbql-query` site); it
  accepts lib queries unchanged.
- `assoc` / `assoc-in` directly on lib queries for `:middleware`, `:parameters`,
  `:info`, etc. — no special API.

---

## Pilot findings (wave 0)

**Date:** 2026-07-09. **Files ported** (branch `claude/mbql-query-tests-migration-rqy1be`):

- `test/metabase/query_processor/count_where_test.clj`
- `test/metabase/query_processor/sum_where_test.clj`
- `test/metabase/query_processor/distinct_where_test.clj`

All three fully converted except one `run-mbql-query` site per file (the
"normalization" `testing` block feeding string-keyed legacy clauses — kept per §5
with a TODO inside the otherwise-ported `deftest`); each kondo header therefore
retains its `run-mbql-query` entry per R55.

**Lessons folded back into the rules above:**

1. **R17b was defective and has been rewritten.** Its original metric-as-own-source
   recipe (`lib/query` on the metric card + `lib/aggregate` of the metric)
   double-adds the aggregation and loses the `{:source-card N}` shape, because
   `lib/query` routes `:type :metric` cards through `metric-query`
   (`src/metabase/lib/query.cljc:257-284`). The decided port is the R56 raw-map
   hybrid; `case_test.clj:86-87` (the rule's own cited precedent) already used the
   hybrid, not the broken recipe. Caught by static tracing, not by test runs — the
   loose `ffirst` assertions would have passed either way, hence the §7 parity-list
   extension to R17b/R16 ports.
2. **Mock `:type :metric` cards accept MBQL-5 lib `:dataset-query` values**
   (verified in `lib/query.cljc:260` and
   `query_processor/middleware/metrics.clj:183-192`; in-tree precedent
   `metrics_test.clj:1128-1141`). Recorded in R17b/R42.
3. **`(lib/segment N)` is valid as the boolean condition of conditional
   aggregations** (`count-where`/`sum-where`/`distinct-where`/`share`) — schema-fit
   verified, examples added to R16 so it isn't re-derived per file.
4. **Naming for layered providers codified** (§8, R42, §4.2): base `mp` +
   wrapper `mock-mp`; query built and run with the wrapper; `mp`-sourced field
   bindings reused inside the query; `mock-mp` binds directly before `query`.
5. **TODO placement for partially-ported deftests codified** (§6 step 5): TODO
   directly above the kept form, inside its `testing` block.
6. **`mt/with-native-query-testing-context` is mandatory on every converted
   `run-mbql-query` site** (R51, §6 step 3). The pilot initially diverged between
   files; all sites now wrapped.
7. **Extra mock-card keys (`:database-id`, `:name`) are kept verbatim** (R42). The
   originals themselves diverge (`count_where_test.clj`'s old mock card had
   neither; `sum_where_test.clj` / `distinct_where_test.clj` had both) — preserve
   whatever each file had; do not normalize across files.
8. **R55's header-pruning sentence was tightened**: an exclusion entry is removable
   only at zero remaining usages of that var; TODO-carrying usages keep it.
9. **No-JVM verification fallback documented** (§7): parse gate + static expansion
   tracing + `lib/->legacy-MBQL` shape diffing when tests cannot run locally.

**Open item for wave 1:** the mock-metric `:dataset-query`-as-lib-query path
(lesson 2) and the R56 metric hybrid (lesson 1) are verified by static tracing and
in-tree precedent but the pilot files themselves have not yet run in CI — confirm
green CI on these three files before batch-applying R17b Case 2.

---

## Wave log

### Wave 1 — 2026-07-10

**Files ported** (12; branch `claude/mbql-query-tests-migration-rqy1be`):

- Wave 1a (commit `3823ec6e`): `test/metabase/query_processor/`
  `advanced_math_test.clj`, `binning_test.clj`, `case_test.clj`,
  `constraints_test.clj`, `page_test.clj`, `share_test.clj`
- Wave 1b (commit `e3abd8e8`): `test/metabase/query_processor/`
  `cumulative_aggregation_test.clj`, `field_visibility_test.clj`,
  `offset_test.clj`, `order_by_test.clj`, `string_extracts_test.clj`,
  `time_field_test.clj`

Verification was the no-JVM static fallback (§7): parse gate + expansion tracing +
adversarial review; the full suite runs in CI on the PR. deftest and assertion
counts unchanged in every file; remaining legacy sites are
`TODO(mbql5-migration)`-fenced.

**Lessons folded back into the rules above:**

1. **`:if` recipe added (R34a)** — no `lib/if` exists; `lib/expression-clause :if`
   with FLAT args, regrouped by `group-case-or-if-args`; hand-nesting pairs
   double-nests. From `case_test.clj`.
2. **Runtime-dynamic operator recipe added (R34b)** —
   `(lib/expression-clause op-kw (into [col] args) nil)`; no auto `:=`→`:in`.
   From `time_field_test.clj`'s `time-query` helper. R34 also now covers
   builder-exists-but-wrong-arity (`lib/substring`).
3. **R57 added: shared helper functions** — same `let` shape as deftests, `mp`
   built inside the helper at call time, atomic contract change when parameters
   are legacy clause fragments (all callers in one edit), inline-as-legacy for a
   caller that must stay legacy, surgery at call sites. From
   `advanced_math_test.clj` (`test-math-expression`/`aggregation=`),
   `string_extracts_test.clj` (`test-string-extract`, 14 callers),
   `field_visibility_test.clj` (`venues-cols-from-query`), `page_test.clj`
   (`page-is`).
4. **R51 expanded** — shared-helper wrapper conflict decided (mandatory rule
   wins; wrapper is lazy/behavior-neutral — `case_test.clj` `test-case`,
   `share_test.clj` `empty-results-test`); wrapper scope + bind-result canonical
   example (`cumulative_aggregation_test.clj:19-33`); value-returning position is
   safe; `mt/process-query` blessed as a facade.
5. **§4.6b added** — exception-class assertions around converted run sites need
   per-driver verification that the QP throws `ExceptionInfo` with a matching
   message (sql-jdbc verified once; from `share_test.clj`).
6. **§4.13 added (intentionally-redundant clauses)** — `lib/order-by` and
   `lib/breakout` silently drop duplicates; force-ports pass while testing
   nothing (from `order_by_test.clj`); §7 gained the silent-normalization check.
7. **§4.14 added (legacy-only value coercions)** — e.g. `:substring` 0→1 start
   coercion exists only in the legacy schema (from `string_extracts_test.clj`).
8. **R19 note added** — legacy `[:offset opts expr n]` carries its options map
   inline; no `:aggregation-options` wrapper to hunt for (from `offset_test.clj`).
9. **R42 note added** — snake_case fixture keys (`:dataset_query`) stay verbatim
   even with lib-query values; `mock-metadata-provider` normalizes.
10. **R28×R33 warning added** — `lib/with-fields` auto-appends unmatched
    expression refs; a legacy `:fields` list that excluded an expression column
    is not a mechanical port.
11. **R6 note added** — legacy normalization flattens nested `:field`-in-`:field`
    clauses with options merge, so `[:field $sigil nil]` ports as a plain lookup.
12. **§5 extended** — hand-rolled legacy-shaped maps that never used a deprecated
    macro (raw outer native maps, `qp/userland-query-with-default-constraints`
    args) are out of scope, left verbatim (from `constraints_test.clj`).
13. **§8 extended** — builder-call order mirrors the old map's key order;
    field-binding naming follows the file's dominant style; multi-table `let`s
    may group by table; partially-pre-ported files keep their old conventions.
14. **Process fixes** — §6 step 0: dedupe wave manifests against `git log`
    (`binning_test.clj` was double-assigned); §6 step 7: the completeness grep
    must not match `mt/with-native-query-testing-context`; §7: bare-`clojure.main`
    parse gates need a permissive `*reader-resolver*` for `::alias/kw` forms
    (unedited files fail otherwise); R55: expect stale header entries — grep the
    body, don't trust the header. Stale precedent citations into
    `binning_test.clj` / `cumulative_aggregation_test.clj` were repointed or
    pinned to commits.

**Open items for wave 2:**

- CI has still not run on any ported file (wave 0's open item stands, now for all
  15 files). Confirm green CI before treating the R17b Case 2 hybrid, the R34a/b
  recipes, and the 4.6b sql-jdbc verification as fully validated.
- An uncommitted style tweak to `case_test.clj` (hoisting a `venues` table
  binding per §8) is sitting in the working tree — commit or drop it with the
  next wave.
