# Reconstruction report — metabase#32121

_Verbatim final report from the worktree-isolated reconstruction agent (a7f31dbe572ce7a46)._

---

Reconstruction complete and verified. Here is the report.

## 1. `git diff`

```diff
diff --git a/src/metabase/query_processor/middleware/fetch_source_query.clj b/src/metabase/query_processor/middleware/fetch_source_query.clj
@@ -32,7 +32,7 @@
   hardcoding driver-specific behavior in generic QP middleware."
   [[first-stage & more]]
   (let [first-stage (cond-> first-stage
-                      (and (= driver/*driver* :mongo)
+                      (and (:collection first-stage)
                            (= (:lib/type first-stage) :mbql.stage/native))
```

File: `/Users/fraser/Documents/code/metabase/src/metabase/query_processor/middleware/fetch_source_query.clj` (function `fix-mongodb-first-stage`, line 35).

## 2. Oracle

- **Namespace / deftest:** `metabase.query-processor.middleware.fetch-source-query-test/card-id->source-query-and-metadata-test` (test file: `/Users/fraser/Documents/code/metabase/test/metabase/query_processor/middleware/fetch_source_query_test.clj`). The sibling `-test-2` (the `#30112` string-format case, split from the same original 2023 deftest) also acts as a corroborating oracle.
- **Baseline (worktree cwd):** PASS — 2 assertions, 0 failures, 0 errors.
- **Reconstructed:** FAIL — 2 assertions, **2 failures, 0 errors** (pure assertion failures, no exceptions/compile errors).

## 3. Failure shape

`=?` assertion mismatch on the native stage's `:native` value. Expected the raw Mongo pipeline preserved as-is (`:native [{:$project ...} {:$limit ...}]`); actual wraps it into a Mongo collection map:

```
:native {:collection "checkins", :projections ["_id" "user_id" "venue_id"],
         :query [{:$project {:_id "$_id"}} {:$limit 1048575}]}
```

This is precisely bug #32121: mongo-wrapping fires off the mere presence of `:collection` rather than the actual driver.

## 4. Confidence + adversarial reasoning

**High confidence.** This is a faithful semantic revert of fix commit 54109eeb. The 2023 fix changed the Mongo test from `:collection`-presence to a driver check (`database->driver … :mongo`). The code has since been rewritten for MBQL 5, but the same semantic lever survives as `(= driver/*driver* :mongo)` inside `fix-mongodb-first-stage`. Reverting it to `(:collection first-stage)` restores the exact pre-fix detection heuristic — a one-condition change, localized, no arity/schema churn.

Adversarial checks:
- **Assertion vs. error:** 2 failures / 0 errors — the namespace still loads and the deftest still runs; it fails on the value, not on a crash. Good oracle.
- **Passing-for-wrong-reason at baseline?** No. In this test the driver var is not bound to `:mongo`, so the fixed code's wrapping is a no-op and `:native` stays a vector (baseline PASS). The revert makes `:collection "checkins"` on the native stage trigger the wrap → shape breaks. Genuinely discriminating.
- **Faithful to the bug's meaning?** Yes — the `actual` output shows the wrongful Mongo `{:collection … :query …}` wrapping, the exact failure class the fix eliminated (SQL/native queries carrying `:collection` being mistaken for Mongo).

## 5. Ambiguity

None material. One note: the original 2023 deftest was a single `card-id->source-query-and-metadata-test`; it has since been split into `…-test` and `…-test-2`. Both fail under the revert, consistent with the two `testing` blocks that lived in the original single deftest. The named oracle (`card-id->source-query-and-metadata-test`) fails cleanly on its own. The `driver` namespace alias remains referenced elsewhere (require still valid); file loads fine.

No `reconstruction_failed` — a valid backend oracle exists and is reconstructed.
