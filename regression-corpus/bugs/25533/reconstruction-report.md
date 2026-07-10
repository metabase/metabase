Confirmed: the shipped jest edit was purely an import rename (default→named), zero behavioral assertion. Here is my report.

---

## 1. git diff — the semantic revert

**none** (honest-negative). Worktree is clean (`git diff --stat` empty). The over-revert below was applied only to verify discrimination, then restored.

The bug lives at `frontend/src/metabase/dashboard/actions/parameters.tsx:825-837` (`setParameterValue` thunk). The fix's original `normalizeValue` (empty array → `null`) survives at HEAD, refactored into:
```ts
const isValueEmpty = isParameterValueEmpty(value);   // [] , "" , null → true
return { id: parameterId, value: isValueEmpty ? PULSE_PARAM_EMPTY : value, isDraft: ... };
```
The over-revert I tested was replacing that with a bare `value` pass-through (removing the empty→null normalization) — the semantic reintroduction of #25533 (an emptied multi-select filter keeps `[]` instead of clearing to `null`, so the widget still shows an active-filter "close" icon).

## 2. Oracle

- **Spec:** `frontend/src/metabase/dashboard/actions/parameters.unit.spec.ts` (descendant of the JS action file; `parameters.js` → `parameters.tsx`).
- **Command:** `bun run test-unit-keep-cljs frontend/src/metabase/dashboard/actions/parameters.unit.spec.ts` (run from worktree root, symlinks in place).
- **Baseline (clean HEAD):** PASS — Tests: 15 passed / 15.
- **Reconstructed (over-revert, normalization fully removed):** PASS — Tests: 15 passed / 15. **Oracle did NOT flip.**

## 3. failure_shape

None. No jest assertion changed state. The only spec that reaches `setParameterValue` is the `setOrUnsetParameterValues` block, whose two tests dispatch a *toggle-unset* path that yields `null` (`valueToSet = ... : null`, line 1060) — already `null` before normalization — so `expect(...).toBe(null)`/`toBe("default-value")` hold with or without the empty→null logic. No jest test ever passes an empty array `[]` into `setParameterValue`.

## 4. Confidence + adversarial

High confidence this is a hole, not a missed relocation:
- The fix shipped its regression protection as a **Cypress e2e** test — `e2e/test/scenarios/dashboard-filters/dashboard-filters-text-category.cy.spec.js`, `"should reset filter state when all values are unselected (metabase#25533)"` — which still exists at HEAD (line 103) and asserts `filterWidget().within(() => cy.icon("close").should("not.exist"))`. That DOM assertion is exactly the empty-array→null behavior; it has no jest equivalent.
- The fix's **only** jest edit was `FilterPopover.unit.spec.tsx`: a single `import FilterPopover from` → `import { FilterPopover } from` default→named rename (part of "Rework default exports to named"). Zero behavioral assertion — non-discriminating.
- Adversarial over-revert (aggressively neutralizing the changed logic, not a surgical revert) tripped **ZERO** jest specs across the action's own spec. No spec anywhere references `isParameterValueEmpty`/`PULSE_PARAM_EMPTY`, and no dashboard reducer/component spec asserts a `[]`-cleared parameter value normalizes to `null`.

## 5. Outcome

`reconstruction_failed` — category **cypress_only**.

Product code (`setParameterValue` empty→null normalization) and the #25533 Cypress test both live at HEAD, so this is not `dead_target`. But the regression is guarded solely by Cypress; no surviving jest spec discriminates it.

**Closable with a new unit test:** Yes, cheaply. `parameters.unit.spec.ts` already has the harness (`setup`, mock store, dispatch). A new test dispatching `setParameterValue("123", [])` and asserting `store.getState().dashboard.parameterValues["123"] === null` (equivalently `PULSE_PARAM_EMPTY`) would fail under the over-revert and pass at HEAD — turning this hole into a kill at the action layer.