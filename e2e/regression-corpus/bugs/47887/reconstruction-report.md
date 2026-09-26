# Reconstruction report — metabase#47887

_Verbatim final report from the worktree-isolated reconstruction agent (af473888531c11521)._

---

Reconstruction complete and verified. Report follows.

## 1. `git diff`

```diff
diff --git a/src/metabase/lib/schema/expression/conditional.cljc b/src/metabase/lib/schema/expression/conditional.cljc
@@ -28,11 +28,6 @@
     (nil? x)
     y
 
-    ;; if the type of either x or y is unknown, then the overall type of this has to be unknown as well.
-    (or (= x ::expression/type.unknown)
-        (= y ::expression/type.unknown))
-    ::expression/type.unknown
-
     ;; if both types are keywords return their most-specific ancestor.
     (and (keyword? x)
          (keyword? y))
```

File: `/Users/fraser/Documents/code/metabase/.claude/worktrees/agent-af473888531c11521/src/metabase/lib/schema/expression/conditional.cljc`

## 2. Oracle + results

- **Oracle ns/name:** `metabase.lib.schema.expression.conditional-test/best-return-type-test` (`/Users/fraser/Documents/code/metabase/.claude/worktrees/agent-af473888531c11521/test/metabase/lib/schema/expression/conditional_test.cljc`, lines 15-17)
- **Baseline (unmodified):** PASS — `1 assertion, 0 failures, 0 errors`
- **Reconstructed (branch removed):** FAIL — `1 assertion, 1 failure, 0 errors`

## 3. failure_shape

Clean **assertion failure** (not a compile/runtime error):
```
FAIL in ...best-return-type-test (conditional_test.cljc:16)
expected: :metabase.lib.schema.expression/type.unknown
  actual: :type/*
```
With the unknown-propagation branch gone, `(best-return-type :type/Integer ::type.unknown)` falls through to the `(and (keyword? x) (keyword? y))` branch → `most-specific-common-ancestor`, which returns its `:type/*` fallback (the two keywords share no ancestor in the type hierarchy). The oracle asserts `::type.unknown`, so it mismatches cleanly.

## 4. Confidence + adversarial reasoning

**Confidence: high.**

- The oracle `best-return-type-test` calls the private `#'best-return-type` directly with `(:type/Integer, ::type.unknown)`. The *only* code path that can change that result is `best-return-type`'s handling of `::type.unknown`. So any faithful reconstruction targeting this oracle must modify exactly this branch — which I did, minimally (4 lines, one `cond` clause).
- **Code-drift caveat (surfaced honestly):** The fix commit `63a3b4b3` literally modified `type-of-method :case` (the `some`/`if-some` "first non-nil type, else `::type.unknown`" logic) and the `case-type-of-test` deftest — *not* `best-return-type`, which did not yet exist at that commit. The code was later refactored: the fix's `some`-based approach was replaced by `case-coalesce-return-type` doing a `reduce best-return-type`, and the fix's *semantic essence* — propagating `::expression/type.unknown` so a case/coalesce with an unresolvable arg doesn't collapse to a wrong concrete type — migrated into `best-return-type`'s unknown branch. The corpus's stated oracle (`best-return-type-test`) targets that surviving semantics, and my revert removes precisely it. So this is a semantic (not literal) revert of the fix, which is the intended mode for a refactored target.
- Verified it is an assertion failure, not a compile error (namespace loaded, ran, produced `0 errors`). Verified correct worktree cwd: baseline PASS + reconstructed FAIL on the same `./bin/test-agent` invocation rules out the "both pass / wrong cwd" trap.
- Blast radius is intentionally narrow: the removed clause only fires when `x` or `y` equals `::type.unknown`; all other `best-return-type` inputs are unaffected.

## 5. Ambiguity

One resolved ambiguity worth noting: the fix commit's product/test hunks (`type-of-method :case` + `case-type-of-test`) do not line up 1:1 with the current oracle (`best-return-type-test`) because of the intervening refactor described above. I reconciled by reverting the fix's *semantic invariant* (unknown-type propagation) at its current home in `best-return-type`, which is the sole path the oracle exercises. No `reconstruction_failed` — baseline→reconstructed flips exactly as required.
