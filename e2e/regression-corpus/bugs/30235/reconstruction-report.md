# Reconstruction report — metabase#30235

_Verbatim final report from the worktree-isolated reconstruction agent (aeb1873df0806e954)._

---

This is the exact inverse of the fix commit's product hunk (the file has since been relocated `src/metabase/api/collection.clj` → `src/metabase/collections_rest/api.clj`, and `Collection` → `:model/Collection`, but the semantic content is identical).

**(2) Oracle:** `metabase.collections-rest.api-test/update-collection-test` (relocated from `metabase.api.collection-test`) at `test/metabase/collections_rest/api_test.clj:2836`.
- Baseline (clean worktree, before revert): PASS — 4 assertions, 0 failures, 0 errors.
- Reconstructed (after revert): FAIL — 4 assertions, 3 pass, 1 failure, 0 errors.

**(3) Failure shape:** Assertion failure, not exception/error. `partial=` comparison fails because the actual PUT response is missing the fix-added keys `:effective_ancestors` and `:effective_location` (the response only has raw `t2/hydrate :parent_id` fields, not the fully-hydrated `collection-detail` output the FE depends on). This is exactly the assertion block added in the fix commit's test diff (lines `+:effective_ancestors [...] +:effective_location "/"`).

**(4) Confidence: high.** Adversarial checks performed:
- Ran the single oracle test in isolation on unmodified worktree first (avoiding the cwd gotcha) to establish a genuine baseline pass, then reapplied the revert and reran — clean pass→fail transition.
- Ran the full namespace (`metabase.collections-rest.api-test`, 168 tests / 781 assertions) with the revert applied: exactly 1 failure, 0 errors, 0 collateral failures elsewhere (e.g., `set-authority-level-after-move-out-of-personal-collection-test`, which is a separate later-added deftest for the same underlying bug #30235, still passes — it doesn't depend on the specific keys removed by this revert).
- Confirmed the code has been renamed/modularized (`api/collection.clj` → `collections_rest/api.clj`, `Collection` → `:model/Collection`) but the call site (`collection-detail` wrapping the PUT response, at line 1609) is a direct, unmodified descendant of the original fixed line — no drift that would invalidate the revert.
- The revert is a pure 1-for-1 semantic inverse of the original 3-line product diff; no other reconstruction was needed since the fix touched only this single return expression.

No ambiguity; reconstruction succeeded cleanly.
