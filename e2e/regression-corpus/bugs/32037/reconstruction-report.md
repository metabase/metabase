# Reconstruction report — metabase#32037 (FE)

_Verbatim report (afb3485a1ae883cbc)._

---

Reconstruction complete and verified.

## Report

**1. `git diff`** (product file `frontend/src/metabase/query_builder/utils/index.ts`, function `isNavigationAllowed`):
```diff
@@ model branch, non-new question allowedPathnames
+          `/model/${slug}`,
           `/model/${slug}/query`,
           `/model/${slug}/columns`,
...
@@ metric branch, non-new question allowedPathnames
+          `/metric/${slug}`,
           `/metric/${slug}/query`,
           `/metric/${slug}/notebook`,
```

**2. Oracle + Tests lines**
- Oracle: `bun run test-unit-keep-cljs frontend/src/metabase/query_builder/utils/utils.unit.spec.ts` (from worktree root, symlinks in place)
- Baseline: `Tests: 431 passed, 431 total`
- Reconstructed: `Tests: 6 failed, 425 passed, 431 total`

**3. failure_shape**: Genuine assertion failures — `expect(received).toBe(expected) // Expected: false, Received: true` at the spec's "disallows all other navigation" blocks (lines 513/566/658). The 6 failing cases are exactly the view-page locations: `/model/3`, `/model/3-structured-model`, `/model/4`, `/model/4-native-model`, `/metric/5`, `/metric/5-structured-metric`. Not compile/import/arity errors.

**4. Confidence: high.** Adversarial reasoning:
- The bug (#32037): while editing a model/metric with unsaved changes, navigation to the entity's view page (`/model/${slug}`) was wrongly allowed, letting the browser go back / close and lose edits. The fix removed those view pathnames from `allowedPathnames` so `isNavigationAllowed` returns `false`.
- This is a **semantic revert**, not `git apply -R`: the file had drifted (a new `/columns` route was added; metric `/metadata` route is gone). I re-added only the two view pathnames the fix removed, preserving all drift.
- The fix commit's spec refactor split `getModelLocations` into `getViewModelLocations` (view pages, now expected `false` while editing) and `getEditModelLocations` (query/columns/notebook tabs, still `true`). The failures land precisely on the `getViewModelLocations`/`getViewMetricLocations` entries in the disallow blocks — i.e., the fix-added assertions — confirming the behavior, not incidental breakage.
- The 425 still-passing tests (including the "allows navigating between tabs" and "allows to run" cases) confirm the revert is minimal and targeted.

**5. Ambiguity**: None material. Note the product files named in the task brief (`use-confirm-route-leave-modal.ts`, `reducers.js`) are part of the fix commit but do not affect this unit oracle — the oracle tests `isNavigationAllowed` in `utils/index.ts`, which is where the behavioral revert belongs. Re-adding only `/model/${slug}` alone would fail the model cases; I also reverted the metric side to fully reintroduce the bug's behavior across both entity types the fix covered.
