# Reconstruction report — metabase#47172

_Verbatim final report from the worktree-isolated reconstruction agent (ac09523d31ac83b3b)._

---

Reconstruction complete and verified. The bug behavior for metabase#47172 is reintroduced into current code, proven by the shipped oracle test.

## 1. Reconstruction (git diff)

Single file, `src/metabase/query_processor/parameters/dates.clj` (the fix's `dates.clj` hunk, semantically undone — the file moved from `src/metabase/driver/common/parameters/` since the fix, so `git apply -R` no longer applies):

```diff
-(defn- maybe-adjust-open-range
-  [{:keys [start end] :as range} unit-fn]
-  (assert (some some? [start end]))
-  (cond (and start end) range
-        start           (update range :start t/+ (unit-fn 1))
-        end             (update range :end   t/- (unit-fn 1))))
-
 (mu/defn date-str->datetime-range :- ::date-string-range
   ...
     (-> (update-vals range-raw date-str-conversion)
         (m/update-existing :end exclusive-datetime-range-end (or ({:second t/seconds, :hour t/hours} unit)
                                                                  (date-str->unit-fn (:end range-raw))))
-        (maybe-adjust-open-range (date-str->unit-fn ((some-fn :start :end) range-raw)))
         format-date-range)))
```

This removes the fix's open-range boundary adjustment (the `defn` plus its call in the threading pipeline of `date-str->datetime-range`). The fix's second hunk (the `->replacement-snippet-info [:sql ::date-time-range]` open-range guard in `substitution.clj`) was left intact — see ambiguity note below.

## 2. Oracle

- Namespace: `metabase.driver.sql.parameters.substitute-test` (`test/metabase/driver/sql/parameters/substitute_test.clj`)
- Tests: `expand-field-filters-for-date-field-test`, `expand-field-filters-for-datetime-field-test`
- **Baseline** (clean worktree): `43 assertions, 0 failures, 0 errors` — PASS
- **Reconstructed**: `43 assertions, 4 failures, 0 errors` — 39 pass, 4 assertion FAILs (all in the datetime test; namespace loads and runs fully — not a compile/load failure)

The 4 failing assertions (all identical SQL shape, param value off by exactly one unit):
- `substitute_test.clj:748` (`before` with time): expected param `2024-08-20T10:20Z`, got `…10:21Z`
- `substitute_test.clj:752` (`after` with time): expected `…10:21Z`, got `…10:20Z`
- `substitute_test.clj:780` (`before`): expected `2016-07-01T00:00Z`, got `2016-07-02T00:00Z`
- `substitute_test.clj:783` (`after`): expected `2016-07-02T00:00Z`, got `2016-07-01T00:00Z`

## 3. failure_shape

- **symptom**: One-sided datetime field filters (`~date` / `date~`, and their time-granular forms) on `:type/DateTime` fields emit the correct single-bound SQL (`col < ?` / `col >= ?`) but with a boundary value that is off by one temporal unit — the start-only range is not incremented, the end-only exclusive range is not decremented back. Query string is unchanged; only the bound parameter is wrong.
- **repro_failure**: `expected: {:params [… 2016-07-02T00:00Z …]} actual: {:params [… 2016-07-01T00:00Z …]}` — a clean `clojure.test` FAIL (expected/actual diff), 4 of them, 0 errors.

## 4. Confidence + adversarial reasoning

**Confidence: High.**
- The failures are genuine assertion mismatches (expected/actual differ by one unit), not exceptions — 0 errors, and the ns compiled/ran (39 assertions passed).
- Blast radius is precisely localized: only the 4 open-range datetime assertions changed; all closed-range, relative-date, no-value, and every `date-field-test` assertion still pass. This isolates the behavior to open-range boundary handling exactly as the fix intended.
- Error direction matches the fix's intent: the fix adds `+1 unit` to a start-only range and subtracts `1 unit` from an end-only exclusive range; removing it leaves the un-adjusted value. Both directions are visible in the diffs (after → too-early, before → too-late).
- **Methodology caveat caught during work**: my first several runs were false negatives because `./bin/test-agent` was invoked with cwd = the shared main checkout while edits were in the worktree copy — so pristine master was compiled every time (baseline and both reconstructions all showed 43/0/0). After switching cwd to the worktree root, the true baseline (0 failures) and the reconstruction (4 failures) both reproduced deterministically. This is now recorded in agent memory as a harness gotcha.

## 5. Ambiguity / honesty

The fix commit had **two** coordinated hunks. I reconstructed only the `dates.clj` hunk because it is the minimal, cleanly-localized change that the oracle discriminates as an **assertion failure**. Reverting the `substitution.clj` hunk instead would remove the `(when s …)` nil-guards and call `maybe-parse-temporal-literal` on a nil bound → a thrown exception (test **error**, not a clean assertion mismatch). The `dates.clj` hunk governs the boundary *values* (which the oracle's `:params` assertions pin down exactly), while the `substitution.clj` hunk governs the SQL *shape* (single vs. both bounds); reintroducing the value bug is the faithful, oracle-provable localization of #47172's open-range defect.

Final state: worktree has exactly one modified file (`src/metabase/query_processor/parameters/dates.clj`); `substitution.clj` and all scratch probes reverted/cleaned.
