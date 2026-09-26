# Reconstruction report — metabase#57381 (FE, partial/all_specs_gone bucket)

_Verbatim report (a1b7641e3a22b6ee0)._

---

Reconstruction succeeded. Report below.

## Report: metabase#57381 (fix #57873) semantic reconstruction

**(1) git diff**
```diff
diff --git a/frontend/src/metabase/data-grid/utils/maybe-expand-column-widths.ts
@@ -49,7 +49,7 @@ export const maybeExpandColumnWidths = (
     .forEach((key) => {
       newColumnSizingMap[key] = Math.max(
         newColumnSizingMap[key],
-        newColumnSizingMap[key] * factor,
+        newColumnSizingMap[key],
       );
     });
```
Single-token semantic revert: drop the `* factor` proportional-expansion multiplier so narrow columns are no longer widened to `minGridWidth` — exactly the pre-fix "narrow columns in dashcards" bug. This is a behavioral change, not `git apply -R`.

**(2) Oracle used** — `frontend/src/metabase/data-grid/utils/maybe-expand-column-widths.unit.spec.ts` (the discriminating surviving pure-util spec; it directly asserts the fix's core expansion semantics, no jsdom layout needed).
- Baseline: `Tests: 4 passed, 4 total`
- Reconstructed: `Tests: 1 failed, 3 passed, 4 total`

**(3) failure_shape** — The fix-added assertion "proportionally expands non-fixed columns while keeping fixed columns intact" fails with a clean `toEqual` deep-equality diff: received `{colA:100, colB:100, colC:100}` vs expected `{colA:100, colB:150, colC:150}`. The three edge-case assertions (undefined/0/negative minGridWidth, already-meets-minGridWidth, all-columns-fixed) all still pass because they return the original map unchanged — confirming the failure is targeted at the expansion behavior specifically, not a blanket break.

**(4) confidence + adversarial** — High confidence. Adversarial checks: (a) the revert is discriminating — only the one assertion measuring proportional expansion fails, the return-original edge cases stay green, so it isn't a trivial "break everything" edit; (b) it faithfully reproduces the actual bug (columns measured to content width stay narrow, leaving whitespace, instead of expanding to fill the grid); (c) it's a pure computation assertion, so the failure is deterministic and not a jsdom-layout artifact. Note: `factor` becomes an unused local after the edit — harmless for jest (babel doesn't error), would trip eslint only, does not affect the oracle.

**(5) ambiguity** — None material. This is the PARTIAL bucket done right: I chose the surviving pure-util spec that needs no real layout (avoiding the Cypress/jsdom width-measurement hole flagged in the task). The sibling spec `column-sizing.unit.spec.ts` (`getTruncatedColumnSizing`/`pickRowsToMeasure`) also survives but is refactor/truncation utility, less tied to this bug's core semantics, so it was not chosen. Localization: `frontend/src/metabase/data-grid/utils/maybe-expand-column-widths.ts`.
