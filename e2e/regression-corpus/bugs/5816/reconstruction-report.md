# Reconstruction report — metabase#5816

_Verbatim final report from the worktree-isolated reconstruction agent (a4504cbd0e7ad4dba)._

---

Reconstruction complete and verified.

## Report

### (1) git diff
`src/metabase/lib/fe_util.cljc` — removed the bigint value-clause recognition case from the private `expression-arg->number` helper:

```clojure
     (value :guard number?)
     value

-    [:value (x :guard (= (:base-type x) :type/BigInteger)) (value :guard string?)]
-    (u.number/parse-bigint value)
-
     _ nil))
```

### (2) Oracle
- **Namespace:** `metabase.lib.fe-util-test`
- **Discriminating deftests:** `number-filter-parts-test` (test/metabase/lib/fe_util_test.cljc:446) and `coordinate-filter-parts-test` (:482). Both are pre-existing deftests that the fix commit *modified* by adding `bigint-string`/`bigint-value` roundtrip assertions.
- **Note:** the third named test, `string-filter-parts-test`, was NOT touched by fix commit `ac982ba` (it's string-only) — not an oracle here.
- **Baseline (worktree cwd):** 2 tests, 73 assertions, 0 failures, 0 errors — PASS.
- **Reconstructed:** 2 tests, 73 assertions, **14 failures, 0 errors** — FAIL. The 14 failures are exactly the fix-added bigint assertions (3 bigint clauses × 2 asserts in number test + 4 bigint clauses × 2 asserts in coordinate test); all 59 pre-existing numeric assertions still pass.

### (3) failure_shape
**Assertion failure** (`=?` expected a filter-parts map, `actual: nil`). Zero errors/exceptions. With the parse-side bigint recognition removed, `number-arg?`/`expression-arg->number` no longer matches the `[:value {:base-type :type/BigInteger} "…"]` clause, so `match-one` falls through and the parse functions return `nil` for any bigint value — breaking the roundtrip.

### (4) Confidence + adversarial reasoning
**High confidence.**
- **Note on drift:** master has evolved well past the fix commit. The Feb-2025 fix represented bigints as raw strings (`number-arg? #(or (number? %) (string? %))`); current master represents them as real `u.number/bigint` values wrapped in `[:value …]` clauses. I reconstructed against the *current* oracle test (which uses `bigint-value`/`bigint-clause`), not the historical fix-commit test — the discriminating semantic is the same (parse must accept bigints), just via a different representation.
- **Why the parse side, not the schema or clause-builder side:** the first assertion in each roundtrip feeds a directly-built `[:value …]` bigint clause into `*-filter-parts`, independent of `number->expression-arg`. Only reverting the parse recognition (`expression-arg->number`) discriminates. I deliberately left the `NumberFilterValue` schema and `number->expression-arg` builder intact so `number-filter-clause`/`coordinate-filter-clause` still accept bigint values without a schema throw — that's why the second assertion also fails as a clean `nil` mismatch rather than an error (confirmed: 0 errors).
- **Localized:** single 3-line deletion; the surviving `u.number/bigint?` usages keep the require live (no unused-import breakage).

### (5) Ambiguity
None material. The reconstruction is a minimal, precise semantic revert of the fix's parse-side behavior with the expected assertion-failure shape.
