# Reconstruction report — metabase#36788 (FE)

_Verbatim final report (a35bcbc8c90d218ab)._

---

Reconstruction complete and verified. Here is the report.

## 1. git diff (product file only)

```diff
diff --git a/frontend/src/metabase/visualizations/components/ChartCaption.tsx
@@ -55,6 +55,10 @@ const ChartCaption = ({
     }
   }, [card, onChangeCardAndRun]);
 
+  if (!title) {
+    return null;
+  }
+
   return (
     <ChartCaptionRoot
       title={title}
```

This is the exact inverse of the fix commit b0a54aa1, which removed this early-return block. Semantic revert, not `git apply -R` (spec file left untouched; only the product behavior was reverted).

## 2. Oracle + Tests results

- Oracle spec: `frontend/src/metabase/visualizations/components/ChartCaption.unit.spec.tsx`
- Baseline (before edit): `Tests: 8 passed, 8 total`
- Reconstructed (after edit): `Tests: 2 failed, 6 passed, 8 total`

## 3. Failure shape

Assertion failure (not compile/runtime error). Both failures are `TestingLibraryElementError: Unable to find an element by: [data-testid="legend-caption"]` — the caption renders `null` when title is empty:
- Line 74 — `should render without a title (metabase#36788)` — the fix-added assertion (renamed from "shouldn't render without title", flipped `queryByTestId…not.toBeInTheDocument` → `getByTestId…toBeInTheDocument`). This is the canonical fix assertion.
- Line 169 — `should render empty title when no title sources available` — a drifted-in test covering the same behavior; also correctly fails.

## 4. Confidence + adversarial reasoning

Confidence: high.
- The fix is a single-hunk product change (`if (!title) return null;` removal); reintroducing it is unambiguous and placed in the identical spot (after `useCallback`, before `return`).
- The failing test explicitly carries the bug id `metabase#36788` and is the assertion the fix added/flipped — the failure lands on the intended target, not on collateral.
- Failure is a proper assertion failure, not a crash/typo. Baseline green → reconstructed red confirms the oracle discriminates.
- cwd/symlink sanity confirmed: run from worktree root, baseline passed (rules out the "both pass" symlink-misconfig trap).

## 5. Ambiguity

None. Clean, canonical single-line-block reconstruction. The only nuance is that two tests fail rather than one, because the drifted spec added `should render empty title when no title sources available`, which depends on the same fixed behavior — both failures are correct and consistent with the reintroduced bug.
