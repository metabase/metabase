# Reconstruction report — metabase#24018

_Verbatim final report from the worktree-isolated reconstruction agent (a4b1c1e4cbd4068f3)._

---

This confirms the reconstruction, baseline, and regression. Here's the full report.

## Report

**1. Reconstruction diff** (`src/metabase/api/search.clj` from the fix commit has since moved to `src/metabase/search/impl.clj` under modularization — that's the drift that broke `git apply -R`):

```diff
--- a/src/metabase/search/impl.clj
+++ b/src/metabase/search/impl.clj
@@ -56,11 +56,9 @@
 (defmethod check-permissions-for-model :default
-  [search-ctx instance]
-  (if (:archived? search-ctx)
-    (can-write? search-ctx instance)
-    ;; We filter what we can (i.e., everything in a collection) out already when querying
-    true))
+  [_search-ctx _instance]
+  ;; We filter what we can (i.e., everything in a collection) out already when querying
+  true)

 (defmethod check-permissions-for-model :metric
   [search-ctx instance]
-  (if (:archived? search-ctx)
-    (can-write? search-ctx instance)
-    (can-read? search-ctx instance)))
+  (can-read? search-ctx instance))

 (defmethod check-permissions-for-model :segment
   [search-ctx instance]
-  (if (:archived? search-ctx)
-    (can-write? search-ctx instance)
-    (can-read? search-ctx instance)))
+  (can-read? search-ctx instance))

 (defmethod check-permissions-for-model :database
   [search-ctx instance]
-  (if (:archived? search-ctx)
-    (can-write? search-ctx instance)
-    (can-read? search-ctx instance)))
+  (can-read? search-ctx instance))
```

I intentionally left `:document` and `:measure` untouched — those model-specific methods (and the `:table`/`:indexed-entity` methods) didn't exist at the time of the original fix commit; they were added later by other devs following the same `archived?` → `can-write?` convention. Reverting them would be scope creep beyond what commit 70c8d96 actually changed, and the oracle test only exercises `:card`, which dispatches through `:default`.

**2. Oracle**
- Namespace/name: `metabase.search.api-test/archived-search-results-with-no-write-perms-test` (line 1659, in `test/metabase/search/api_test.clj` — the function had moved out of `metabase.api.search-test` during the same modularization, along with the product code)
- Baseline (before reconstruction): **PASS** — 3 assertions, 0 failures, 0 errors
- After reconstruction: **FAIL** — 3 assertions, 2 pass, 1 failure
  - Failing assertion: `expected: ["card test card is returned"]` vs `actual: ("card test card" "card test card is returned")`

**3. Failure shape**
- **Symptom**: With the bug reintroduced, a user with only read (not write) access to an archived collection sees cards from that collection in `search?archived=true` results — the exact behavior #24018/#33602 fixed ("Hide read-only items in the Archive").
- **Repro failure**: Assertion failure inside a normally-completing test run (2/3 assertions still pass, 0 errors) — not a compile/load failure. The namespace loaded and ran fine, confirming the change is a pure behavioral regression, not a syntax/reference break.

**4. Confidence: high.**
Adversarial check performed:
- Confirmed `can-write?`/`can-read?` are still referenced elsewhere in the file (`:document`, `:measure`, and the `:can_write` hydration at line 415) — no unused-var warnings, no accidental dead code.
- Confirmed the file still compiles/loads (test executed to completion — pass/fail/error counts computed, not an exception during namespace load).
- Confirmed the specific failing item (`"card test card"`) is the card that lives in the collection where the test setup explicitly revokes write access and grants only read access (`perms/revoke-collection-permissions!` + `perms/grant-collection-read-permissions!`), matching the bug's precise mechanism (read access leaking into archive listings that should require write access).
- Verified the other two assertions in the test (the sanity check that Lucky truly lacks write access, and the earlier setup assertions) still pass, isolating the failure to the exact behavior under test rather than an unrelated side effect.

**5. Ambiguity**: None blocking. The only judgment call was scope: whether to also revert `:document`/`:measure` (added post-fix, mirroring the same convention). I chose not to, since they're outside the original commit's diff and outside the oracle test's coverage — reverting them would be non-minimal and unverifiable by this oracle.

Files touched:
- `/Users/fraser/Documents/code/metabase/.claude/worktrees/agent-a4b1c1e4cbd4068f3/src/metabase/search/impl.clj`

Note: this worktree now has the bug intentionally reintroduced for this study — do not merge/commit this state.
