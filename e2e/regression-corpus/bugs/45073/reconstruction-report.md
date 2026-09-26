# Reconstruction report — metabase#45073

_Verbatim final report from the worktree-isolated reconstruction agent (a7ca858aca6efa885)._

---

Reconstruction complete and verified. Here is my report.

## Report: Bug metabase#45073 — semantic reconstruction

### Finding: designated oracle is misidentified (`reconstruction_failed` for it), but the bug IS reconstructable via the correct oracle

**Category:** oracle misidentification — the fix's discriminating test change was the **addition of two brand-new deftests**, not the addition of assertions to `delete-group-membership-test`. The designated oracle contains **zero** fix-added assertions and no product revert of this fix can make it fail.

The `@@ -378,3 +379,38 @@` hunk header in the original diff is what caused the mislabel: the two new deftests were appended immediately *after* `delete-group-membership-test`, so its tail (`"Delete membership successfully"`) appears as leading context. The commit never touched that test.

### (1) `git diff` (minimal semantic revert)

Applied to `src/metabase/permissions/settings.clj` (product code moved here from the commit's `src/metabase/api/permissions.clj`). Both getters had their "new-admin?" guard removed so they return the raw setting value:

```
-  (if (t/after? (instance-create-time) (v-fifty-migration-time))
-    false
-    (setting/get-value-of-type :boolean :show-updated-permission-modal)))
+  (setting/get-value-of-type :boolean :show-updated-permission-modal))
```
(identical change to `-show-updated-permission-banner`). Functions `instance-create-time`/`v-fifty-migration-time` and the `t` import are left intact, so the test's `with-dynamic-fn-redefs` targets still resolve and it fails as an assertion, not a compile/error.

### (2) Oracle ns/name + results

- **Designated oracle:** `metabase.permissions-rest.api-test/delete-group-membership-test` (`test/metabase/permissions_rest/api_test.clj:571`) — baseline PASS, reverted **PASS** (unaffected; unrelated to the fix).
- **Correct oracle (fix-added):** `metabase.permissions.settings-test/{show-updated-permission-modal-test, show-updated-permission-banner-test}` (`test/metabase/permissions/settings_test.clj`) — baseline **PASS**, reverted **FAIL**.
  - Combined baseline run (all 3 tests): 19 assertions, 0 failures.
  - Combined reverted run: 19 assertions, **2 failures, 0 errors**.

### (3) Failure shape

Clean assertion failure in both fix-added deftests:
```
FAIL in show-updated-permission-modal-test (settings_test.clj:28)   expected: false  actual: true
FAIL in show-updated-permission-banner-test (settings_test.clj:44)  expected: false  actual: true
```
These are the `{:new-admin? true, :setting-value true}` cases: the fix returns `false` for admins who joined after the v50 migration; the revert returns the raw setting value (`true`).

### (4) Confidence + adversarial reasoning

**High confidence** on both conclusions.
- The designated oracle empirically passed under the reverted product (not just by argument) — it is orthogonal (tests `DELETE /api/permissions/membership/:id` superuser gating), and the commit's only test change was appending new deftests.
- The reconstruction against the correct oracle is a genuine semantic revert (not `git apply -R`): I collapsed only the behavioral guard, kept all vars/imports, and got a discriminating assertion failure that flipped exactly the `new-admin?=true` rows of the truth table. No unused-import breakage: `instance-create-time` still uses `t/local-date-time`.

### (5) Determination

- For the **task-designated oracle** `delete-group-membership-test`: **`reconstruction_failed`** — category *oracle misidentification / fix-added coverage was new deftests, not a modified existing deftest*.
- The **bug itself remains fully reconstructable** with a valid BE oracle by pointing at the two fix-added deftests in `metabase.permissions.settings-test` (demonstrated, baseline PASS → reverted FAIL). Recommend the orchestrator re-target the oracle to `metabase.permissions.settings-test/show-updated-permission-modal-test` (and/or the banner variant).

Note: the worktree working tree is left with the revert applied (it is the `git diff` deliverable); no commit was made.
