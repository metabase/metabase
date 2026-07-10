# Reconstruction report — metabase#30680 (FE)

_Verbatim report (a0dc461b8247bc515)._

---

Reconstruction succeeded.

## Report

**1) `git diff`** (single file, `DatasetQueryEditor.tsx`):
```diff
-export const DatasetQueryEditor = memo(DatasetQueryEditorInner);
+export const DatasetQueryEditor = memo(
+  DatasetQueryEditorInner,
+  // should prevent the editor from re-rendering in "metadata" mode
+  // when it's completely covered with the results table
+  (prevProps, nextProps) => prevProps.height === 0 && nextProps.height === 0,
+);
```

**2) Oracle results** (`bun run test-unit-keep-cljs .../DatasetQueryEditor.unit.spec.tsx`):
- Baseline: `Tests: 4 passed, 4 total`
- Reconstructed: `Tests: 1 failed, 3 passed, 4 total`
- Failing test: `re-renders DatasetQueryEditor when height is 0 and isActive prop changes`

**3) failure_shape:** Genuine assertion failure. At spec line 173, `screen.queryByTestId("native-query-editor-action-buttons")).not.toBeInTheDocument()` fails inside `waitFor` — the element is still present after re-render with `isActive: false`. This is the bug's behavior: the buggy `arePropsEqual` returns `true` when both prev/next `height === 0`, so React skips the re-render entirely and the stale `isActive: true` render (with the action buttons) persists. Not a compile/import error — the component rendered fine, the DOM just didn't update.

**4) Confidence: high.** Adversarial reasoning:
- The listed product files (`DatasetEditor.jsx`, `NewModelOptions.tsx`) are covered by the sibling *e2e* repro; the *unit* oracle targets the `DatasetQueryEditor` memo optimization, which is the fix hunk in `DatasetQueryEditor.jsx`. The fix drifted (`.jsx`→`.tsx`, component renamed to `DatasetQueryEditorInner`, sidebar testid changed from `native-query-editor-sidebar` to `native-query-editor-action-buttons`), so this is a semantic re-derivation of the original `arePropsEqual` comparator onto the drifted code, not `git apply -R`.
- Minimal and targeted: only the one fix-added test (the re-render assertion) fails; the other 3 assertions still pass, confirming the revert isolates exactly the behavior the fix restored.
- The buggy comparator is byte-identical in logic to the historical one (`prevProps.height === 0 && nextProps.height === 0`), and `height` is still a live prop on the current component, so the memo short-circuit genuinely fires.

**5) Ambiguity:** None material. The task's product-file list points at the e2e-covered files, but the unit oracle unambiguously exercises the `DatasetQueryEditor` memo hunk from the same fix commit — that is where the semantic revert belongs.
