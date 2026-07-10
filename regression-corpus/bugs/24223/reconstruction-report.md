# Reconstruction report — metabase#24223

_Verbatim final report from the worktree-isolated reconstruction agent (ac095cae0a1753a4e)._

---

## Report

**1. Reconstruction diff**

```diff
diff --git a/src/metabase/parameters/shared.cljc b/src/metabase/parameters/shared.cljc
index 2d435e00a9d..5ec417f0b2f 100644
--- a/src/metabase/parameters/shared.cljc
+++ b/src/metabase/parameters/shared.cljc
@@ -209,7 +209,7 @@
     * nil value => nil
     * missing value key => default"
   [parameter]
-  (get parameter :value (:default parameter)))
+  (or (:value parameter) (:default parameter)))
 
 (defn value-string
   "Returns the value(s) of a dashboard filter, formatted appropriately."
```

Note on drift: the target file `src/metabase/pulse/parameters.clj` no longer exists — it was moved during modularization. Its logic now lives in `src/metabase/parameters/shared.cljc` (shared BE/FE `param-val-or-default`, consumed by `src/metabase/notification/payload/impl/dashboard.clj:25` for filtering subscription parameters, and by `src/metabase/channel/urls.clj:46` for URL param serialization). Since all three call sites funnel through this single function, one-line revert of the function body reintroduces the original bug's behavior everywhere it mattered — no need to touch three separate call sites as the original pre-fix commit did.

**2. Oracle**
- Namespace/test: `metabase.parameters.shared-test/param-val-or-default-test` (test/metabase/parameters/shared_test.cljc:417)
- Baseline (before edit): PASS — 2 assertions, 0 failures, 0 errors.
- Reconstructed (after edit): FAIL — 2 assertions, 1 failure, 0 errors. Full namespace run: 13 tests / 103 assertions, only this 1 assertion fails.

**3. Failure shape**
- Symptom: `param-val-or-default` falls back to `:default` even when `:value` is explicitly `nil` (a "no-op"/cleared filter on a dashboard subscription), because `(or (:value p) (:default p))` treats `nil` and "absent" identically — same defect class as the original bug (subscription users couldn't remove/blank out a filter default; it always reverted to default).
- Repro failure:
  ```
  FAIL in metabase.parameters.shared-test/param-val-or-default-test (shared_test.cljc:423)
  When the parameter's :value is explicitly nil (i.e. for no-op filters), do not fallback to the :default key
  expected: (nil? (param-val-or-default {:default "my default value", :value nil}))
  actual: (not (nil? "my default value"))
  ```
  This is a genuine assertion failure (compiles/loads fine — the first `testing` block in the same deftest still passes).

**4. Confidence: high.** Adversarial check: verified the fix commit's three `(or (:value x) (:default x))` sites were consolidated into one function in current code (`grep` confirmed no other inline occurrences of that pattern remain for parameters); reverting only the extracted function restores byte-identical semantics to pre-fix behavior at all three consumers without needing multi-site edits. Ran both the single test and the full namespace to rule out collateral breakage — clean, isolated regression matching the original bug's symptom exactly (nil vs. missing key conflation).

**5. Ambiguity:** none of consequence. The one judgment call was reconstructing in `metabase.parameters.shared` rather than the (now-deleted) `metabase.pulse.parameters`, since that's where the fixed logic now lives; this is a straightforward file-move, not a re-architecture, so the semantic revert maps cleanly.
