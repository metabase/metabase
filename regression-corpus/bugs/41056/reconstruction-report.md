# Reconstruction report — metabase#41056

_Verbatim final report from the worktree-isolated reconstruction agent (ac5d1b60799e6c2c1)._

---

Reconstruction complete and proven. Here is the report.

## 1. Reconstruction `git diff`

```diff
--- a/src/metabase/lib/filter/update.cljc
+++ b/src/metabase/lib/filter/update.cljc
@@ -235,13 +235,8 @@
     {:keys [north east south west], :as _bounds} :- [:ref ::lat-lon.bounds]]
    (-> query
-       (remove-existing-filters-against-column-checking-subclauses stage-number latitude-column)
-       (remove-existing-filters-against-column-checking-subclauses stage-number longitude-column)
-       (lib.filter/filter stage-number
-                          (if (<= west east)
-                            (lib.filter/inside latitude-column longitude-column north west south east)
-                            (lib.filter/or
-                             (lib.filter/inside latitude-column longitude-column north west south 180)
-                             (lib.filter/inside latitude-column longitude-column north -180 south east)))))))
+       (remove-existing-filters-against-column stage-number latitude-column)
+       (remove-existing-filters-against-column stage-number longitude-column)
+       (lib.filter/filter stage-number (let [[lat-min lat-max] (sort [north south])
+                                             [lon-min lon-max] (sort [east west])]
+                                         (lib.filter/inside latitude-column longitude-column lat-max lon-min lat-min lon-max))))))
```

File: `/Users/fraser/Documents/code/metabase/.claude/worktrees/agent-ac5d1b60799e6c2c1/src/metabase/lib/filter/update.cljc`

This semantically undoes both halves of the fix, restoring the pre-fix body verbatim: (a) always emits a single `:inside` filter using `(sort [east west])` — no antimeridian split into an `:or` of two `:inside`s; and (b) reverts the existing-filter removal from the subclause-checking variant back to `remove-existing-filters-against-column` (direct first-arg match only). The now-unused private helpers `remove-existing-filters-against-column-checking-subclauses` and `contains-ref-for-column?` are left in place — harmless, and the ns still loads/compiles.

## 2. Oracle ns/tests + results

- Oracle ns: `metabase.lib.filter.update-test` (`test/metabase/lib/filter/update_test.cljc`)
- Tests: `update-lat-lon-filter-antimerdian-test`, `update-lat-lon-filter-remove-existing-test`, `update-lat-lon-filter-remove-existing-antimerdian-test`

| Run | test | pass | fail | error | assertions |
|-----|------|------|------|-------|-----------|
| Baseline (fixed) | 3 | 3 | 0 | 0 | 5 pass / 0 fail |
| Reconstructed (buggy) | 3 | 2 | 3 | **0** | 2 pass / **3 fail** |

Failing assertions (all pure `=?` assertion failures, no load/compile errors):
- `update-lat-lon-filter-antimerdian-test` (update_test.cljc:56)
- `update-lat-lon-filter-remove-existing-antimerdian-test` — first application (update_test.cljc:136)
- `update-lat-lon-filter-remove-existing-antimerdian-test` — second application (update_test.cljc:157)

The non-antimeridian control `update-lat-lon-filter-remove-existing-test` still PASSES in both runs — correct, since it never crosses the meridian.

## 3. Failure shape

- **symptom**: A map-brush zoom whose longitude bounds cross the 180° antimeridian (`west > east`, e.g. `{:west 179 :east -179}`) produces a single `:inside` filter spanning `[-179, 179]` (via `(sort [east west])`) — i.e. it selects the entire *wrong* side of the globe (the whole normal range) instead of the thin sliver around ±180. Re-brushing compounds the problem: the pre-existing crossing filter (which the fix wraps in `:or`) can no longer be matched/removed by the direct-first-arg check, so stale filters leak across applications.
- **repro_failure**: `update-lat-lon-filter-antimerdian-test` — expected `[:or [:inside … 10 179 -10 180] [:inside … 10 -180 -10 -179]]` but got a single `[:inside … 10 -179 -10 179]`. `expected: {:stages [{:filters [[:or …`, `actual: … [:inside … 10 -179 -10 179]`.

## 4. Confidence + adversarial reasoning

**Confidence: very high.** The fix commit touched exactly one product hunk in this file, and the pre-fix source is recoverable verbatim from the commit's `-` lines, so this is a faithful semantic restore rather than an approximation.

Adversarial self-checks performed:
- **Failure is behavioral, not structural**: 0 errors, 2 assertions still pass → the ns loads and dispatches; failures are `=?` mismatches, not `CompilerException`/`Unable to resolve`. Confirmed the leftover unused private helpers don't break load.
- **Baseline genuinely passed first** (5/5) from the worktree root (`pwd` verified = `.claude/worktrees/agent-...`, not the main checkout) — ruling out the "both pass" wrong-cwd trap.
- **Control test discriminates**: the non-crossing `remove-existing-test` passes in both states, proving the failures are specific to the antimeridian behavior I reverted, not collateral breakage.
- **Both fix concerns exercised**: the split (`antimerdian-test`) and the subclause-aware removal (`remove-existing-antimerdian-test`, 2nd application) both fail, so the reconstruction reintroduces the whole bug, not just one facet.

## 5. Ambiguity / honesty

No meaningful ambiguity. Minor note: reverting only the `update-lat-lon-filter` body (single `:inside`) alone would already fail both antimeridian tests, so the removal-helper revert is not strictly required to flip the oracle. I included it anyway because it is the second, genuinely-separate half of the original fix (needed so a re-brush can remove a pre-existing `:or` filter whose first arg is a nested clause, not a field ref) — restoring both yields the most faithful semantic reproduction of metabase#41056 rather than the minimal test-flipping edit.
