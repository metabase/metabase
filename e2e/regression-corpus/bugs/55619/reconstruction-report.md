Reconstruction complete. The mutation is left in place in the worktree for capture.

---

## 1. git diff (semantic revert)

`frontend/src/metabase/metadata/utils/field.ts` — neutralize the field-level currency branch in `getFieldCurrency`, so a field's own currency setting is ignored and resolution falls through to global settings / USD:

```diff
 export function getFieldCurrency(
   fieldSettings?: FieldFormattingSettings,
 ): string {
-  if (fieldSettings?.currency) {
-    return fieldSettings.currency;
-  }
-
   const globalSettings: FieldFormattingSettings = getGlobalSettingsForColumn();
   if (globalSettings.currency) {
     return globalSettings.currency;
```

This is a semantic revert, not `git apply -R`: the fix commit refactored the signature (`field` → `fieldSettings` param) as plumbing for the new CurrencyPicker draft-settings flow, so a literal reverse wouldn't apply. The mutation reintroduces the underlying bug behavior — the field's chosen currency is not respected.

## 2. Oracle

- Spec: `frontend/src/metabase/metadata/utils/field.unit.spec.ts` (surviving descendant; the shipped spec at this same path had its `getFieldCurrency(field)` calls updated to `getFieldCurrency(field.settings)` in the fix — no relocation, `.ts` in place).
- Command (from worktree root): `bun run test-unit-keep-cljs frontend/src/metabase/metadata/utils/field.unit.spec.ts`
- Baseline (clean HEAD): PASS — Tests: 33 passed, 33 total.
- Reconstructed (mutation applied): FAIL — Tests: 2 failed, 31 passed, 33 total.

## 3. failure_shape

- `getFieldCurrency › returns currency from field settings when available` — Expected `"EUR"`, Received `"USD"`.
- `getFieldCurrency › prioritizes field settings over global settings` — Expected `"JPY"`, Received `"GBP"`.

Both are clean value-equality (`toBe`) mismatches, not compile/import errors. (The now-unused `fieldSettings` param does not trip the swc/babel jest transform.)

## 4. Confidence + adversarial

High confidence the failure isolates the reverted branch. The `getFieldCurrency` describe block has 4 tests; exactly the 2 that exercise the field-settings branch fail:
- "returns currency from field settings" (field currency, no global) → now yields USD.
- "prioritizes field settings over global settings" (field JPY vs global GBP) → now yields global GBP.

The two sibling tests stay green, proving the mutation is surgical, not a blunt break: "returns currency from global settings when field settings are not available" (GBP) and "returns USD as default" (USD) both still pass because those paths are untouched. All 29 other tests in the file (areFieldsComparable, canCoerceFieldType, getRawTableFieldId, getFieldDisplayName, canFieldUnfoldJson, isFieldJsonUnfolded) also remain green.

## 5. Outcome

`kill` — a surviving jest unit test discriminates this bug. Oracle is co-located at the same path as the shipped spec (no relocation; the fix adjusted the existing call sites rather than moving the file). The field-level currency-resolution logic is fully covered by unit tests, so this portion of the "partial"-class fix is closable/protected by jest without any new test.

Note on the "partial" class: the fix's other product change — `isTypeCurrency` in `metabase-lib/v1/types/utils/isa.js`, which gates whether the CurrencyPicker is shown — has no jest spec (its only regression protection is the Cypress reproductions spec). So the commit is genuinely partial: `getFieldCurrency` is jest-killable (demonstrated here), while the picker-visibility predicate is cypress-only.