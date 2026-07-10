# Reconstruction report — metabase#54799 (FE, partial/all_specs_gone bucket)

_Verbatim report (a390e08751f7f3d55)._

---

Reconstruction complete and verified. Here is the report.

## Bug metabase#54799 — Semantic Reconstruction: SUCCESS

**(1) git diff** (the reconstructed bug — a one-line revert of the product-side fix):
```diff
diff --git a/frontend/src/metabase/query_builder/selectors.ts b/frontend/src/metabase/query_builder/selectors.ts
@@ export const getNativeEditorSelectedRange = createSelector(
   [getUiControls],
-  (uiControls) => uiControls?.nativeEditorSelectedRange?.[0],
+  (uiControls) => uiControls?.nativeEditorSelectedRange,
 );
```

**Background.** The fix (PR #56420) changed native-editor selection storage from a single `{start, end}` object to an **array** of ranges (to allow selecting/running multiple ranges). It adapted the selectors: `getNativeEditorSelectedRange` (singular) now returns the first element `[0]`, a new `getNativeEditorSelectedRanges` (plural) returns the whole array, a new `getAllNativeEditorSelectedText` joins all ranges, and `querying.ts` switched `runQuestionOrSelectedQuery` to use `getAllNativeEditorSelectedText`. Reverting the `[0]` on the singular selector reintroduces the pre-array-shape assumption: the selector hands the raw array to `getNativeEditorSelectedText`/`getNativeEditorCursorOffset`, whose `.start`/`.end` access yields `undefined`.

**(2) Oracle used.** `bun run test-unit-keep-cljs frontend/src/metabase/query_builder/selectors.unit.spec.ts -t "native editor selection"` (run from worktree root; symlinks set up).
- The shipped spec `selectors.unit.spec.js` is GONE, but it was renamed/migrated to `frontend/src/metabase/query_builder/selectors.unit.spec.ts`. The discriminating test survives verbatim: `"should correctly get selected text when there are multiple selected ranges"` (expects `getNativeEditorSelectedText(state)` → `"33"`), plus the array-shape single-range and cursor-offset cases.
- Baseline (fixed): `Tests: 28 skipped, 7 passed, 35 total`
- Reconstructed (buggy): `Tests: 7 failed, 28 skipped, 35 total`

**(3) failure_shape.** `TypeError: Cannot destructure property 'row' of 'undefined'` thrown from `getOffsetForQueryAndPosition` (selectors.ts:934), because `selectedRange` is now the whole array and `selectedRange.start`/`.end` is `undefined`. The discriminating multi-range test fails here (spec line 352), as do the 3 single-range and 3 cursor-offset cases.

**(4) Confidence + adversarial.** High confidence. The reverted line is exactly the product-side change from the fix commit; baseline→reconstructed flips cleanly (7 passed → 7 failed) on the same oracle. Adversarial note: the revert trips 7 tests, not only the one multi-range test the commit added — because the fix also flipped the state shape object→array and the current spec feeds arrays everywhere, so the shape mismatch cascades. This is faithful (it is precisely the pre-fix product behavior against post-fix test fixtures), just broader than a single assertion. A narrower reconstruction isn't cleanly possible without also editing the spec, which would compromise the oracle. The failure is a thrown TypeError rather than a wrong-value `.toBe` mismatch, but it still fails the discriminating assertion unambiguously.

**(5) Ambiguity.** None material. The only judgment call was choosing the minimal faithful product revert (`getNativeEditorSelectedRange` dropping `[0]`) versus reverting the full selector suite (`getAllNativeEditorSelectedText`, `querying.ts`); the chosen single-line revert is the tightest change that both represents the actual bug and makes the discriminating spec fail.
