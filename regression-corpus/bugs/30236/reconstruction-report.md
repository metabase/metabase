# Reconstruction report — metabase#30236

_Verbatim final report from the worktree-isolated reconstruction agent (a47c810de5b2aa205)._

---

## Report: metabase#30236 — reconstruction FAILED

**(1) Semantic revert applied (`git diff` at time of testing, now reverted from worktree):**

```diff
diff --git a/src/metabase/collections_rest/api.clj b/src/metabase/collections_rest/api.clj
--- a/src/metabase/collections_rest/api.clj
+++ b/src/metabase/collections_rest/api.clj
@@ -1594,7 +1594,11 @@
     (when (and (contains? collection-updates :authority_level)
                (not= (keyword authority-level) (:authority_level collection-before-update)))
       (premium-features/assert-has-feature :official-collections (tru "Official Collections"))
-      (api/check-403 api/*is-superuser?*))
+      (api/check-403 (and api/*is-superuser?*
+                          ;; pre-update of model checks if the collection is a personal collection and rejects changes
+                          ;; to authority_level, but it doesn't check if it is a sub-collection of a personal one so we add that
+                          ;; here
+                          (not (collection/is-personal-collection-or-descendant-of-one? collection-before-update)))))
     ;; ok, go ahead and update it! Only update keys that were specified in the `body`. But not `parent_id` since
     ;; that's not actually a property of Collection, and since we handle moving a Collection separately below.
```

This is the file that was originally `src/metabase/api/collection.clj` at the time of the fix commit; it has since moved to `src/metabase/collections_rest/api.clj` during modularization. `collection/is-personal-collection-or-descendant-of-one?` still exists (`src/metabase/collections/models/collection.clj:626`) and the `collection` alias is already required, so the revert is a clean, minimal reapplication of the pre-fix logic.

**(2) Oracle test:** `metabase-enterprise.content-verification.api.collection-test/update-collection-authority-happy-path-test` (renamed from `metabase_enterprise.content_management...` during a later kondo-module-naming pass; no semantic changes in between, verified via `git log --follow`).

- Baseline (current product code + current test, run from worktree root): **PASS** — 10 assertions, 0 failures.
- Reconstructed (reverted product code + current test): **PASS** — still 10 assertions, 0 failures (identical result). Full-namespace run also unaffected: 35 assertions, 0 failures, 0 errors.

**(3) Failure shape:** None — no failure induced. The revert is semantically inert against the current oracle deftest.

**(4) Confidence: high** that this is a genuine `reconstruction_failed`, not a mistake in my revert.

Root cause: the fix commit's diff to this test file was **not an addition** of a new positive-path assertion — it was a **deletion**. Before the fix, the deftest contained a nested `testing "but cannot update for personal collection"` block asserting a 403 when an admin tried to set `authority_level` on their own personal collection. The fix commit deleted that block outright (commit message literally includes "* remove test") and never replaced it with a positive assertion verifying the new allowed behavior (official collections nested in personal collections). That positive-path coverage apparently lives only in the Cypress e2e spec (`e2e/.../official-collections.cy.spec.js`, also touched in this commit) — I confirmed via grep that no backend test anywhere in `test/` or `enterprise/backend/test/` exercises `is-personal-collection-or-descendant-of-one?` or asserts the allow-official-in-personal behavior.

Adversarial check performed: none of the remaining assertions in the deftest (admin update on a non-personal collection, non-admin name-only patch, non-admin 403, premium-feature-gating 402) ever construct a personal collection or a descendant of one, so restoring the stricter check cannot trip any of them. I also confirmed the unrelated sibling test `set-authority-level-after-move-out-of-personal-collection-test` (issue 30235, in `test/metabase/collections_rest/api_test.clj:2865`) is a different deftest for a different bug and moves the collection out of the personal subtree *before* setting `authority_level`, so it's structurally immune to this revert too.

**(5) Conclusion:** `reconstruction_failed` — **category: DELETION** (discriminating test change was a removed negative-assertion block with no replacement positive assertion in the surviving/current oracle deftest). Not reconstructable as a backend unit-test oracle from this deftest as it stands today; the only test that actually discriminates the fixed behavior is the Cypress e2e spec, which is out of scope for a BE regression-corpus oracle.

Worktree left clean (`git status` → nothing to commit) after reverting my probe edit.
