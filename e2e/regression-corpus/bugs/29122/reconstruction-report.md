Reconstruction complete. The worktree is left with the semantic revert applied.

## 1. git diff (semantic revert)

`frontend/src/metabase/querying/parameters/utils/parsing.ts` — the `exclude-months` serializer:

```diff
-        const monthNames = value.values.map(
-          (dayNumber) => MONTHS[dayNumber - 1],
+        const monthNames = value.values.map((monthNumber) =>
+          dayjs().month(monthNumber - 1).format("MMM"),
         );
         return `exclude-months-${monthNames.join("-")}`;
```

This faithfully reintroduces bug #29122: the original bug was `date.format("MMM")` respecting the ambient moment locale. The modern rewrite replaced that with a hardcoded English `MONTHS` array (structurally locale-immune). Swapping back to `dayjs().format("MMM")` restores locale-dependence.

## 2. Oracle

- Spec: `frontend/src/metabase/querying/parameters/utils/parsing.unit.spec.ts` (surviving descendant that exercises `serializeDateParameterValue` for `exclude-months`, e.g. `[3] → "exclude-months-Mar"`).
- Command: `bun run test-unit-keep-cljs <spec>` from the worktree root.
- Baseline (clean HEAD): 167 passed, 0 failed.
- Reconstructed (mutation applied): 167 passed, 0 failed. Oracle does NOT flip.

## 3. failure_shape

No surviving jest spec fails. The bug is invisible to jest because the test environment runs under the English locale, where `dayjs().month(0).format("MMM") === "Jan"` — identical to the hardcoded array. I proved the reproduction is genuine with a throwaway locale-aware spec (removed before finalizing): forcing `dayjs.locale("fr")` before serializing produced `Expected "exclude-months-Jan"` / `Received "exclude-months-janv."` against the mutated code, and passed against clean code. So the mutation truly reproduces #29122 — it just can't be seen without a non-English locale.

## 4. Confidence + adversarial

- The oracle is non-vacuous: it directly asserts `serializeDateParameterValue({...month-of-year, values:[3]}) === "exclude-months-Mar"` and the full 12-month round-trip, so it exercises exactly the mutated line. A blunt output break in that path does fail it (the French-locale demo confirmed the value assertion, not a compile/import error).
- Over-revert verification: ran all three exclude-serialization specs together (`parsing.unit.spec.ts`, `DateAllOptionsWidget.unit.spec.tsx`, `ExcludeDatePicker.unit.spec.tsx`) under the mutation → 185 passed, 0 failed. Fully neutralizing the locale normalization trips ZERO jest specs.
- Original target state: issue #29122's regression protection in the fix commit was a Cypress e2e test (`dashboard-filters-date.cy.spec.js`) that sets the user locale to French and asserts the URL contains `exclude-months-Jan`. The jest spec shipped in the same commit (`DatePicker.unit.spec.tsx`) tested a *different* bundled bug (checkbox state for the falsy hour value `0`), not the locale bug — non-discriminating for #29122.

## 5. Outcome

`reconstruction_failed`, category **cypress_only**.

The locale bug is only catchable when serialization runs under a non-English locale, which is inherently a Cypress-e2e concern (the e2e test switches the app locale to `fr`). The surviving jest oracle runs in English and cannot observe it. All three touched product files for the jest side (`query-time.js`, `ExcludeDatePicker.tsx`, and the old `DatePicker.unit.spec.tsx`) were deleted in the date-filter rewrite; the serialization logic moved to `parsing.ts` where the locale hazard was structurally eliminated (hardcoded array).

**Closable: YES** — with a new locale-aware unit test. A jest spec that sets `dayjs.locale("fr")` (or moment locale) and asserts `serializeDateParameterValue` still emits English (`exclude-months-Jan`) would catch the regression. I verified such a test fails on the mutated code and passes on clean HEAD.