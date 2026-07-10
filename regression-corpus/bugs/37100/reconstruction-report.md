Reconstruction succeeded. Here is the report.

## 1. `git diff` (semantic revert)

Single-file change at the surviving locus of the fix's de-duplication semantic — `frontend/src/metabase/ui/components/inputs/MultiAutocomplete/use-multi-autocomplete/use-multi-autocomplete.ts`:

```diff
 function getFieldValuesWithoutDuplicates(
   values: string[],
   fieldValues: string[],
   fieldSelection: FieldSelection,
 ) {
-  const usedValues = new Set(getValuesNotInSelection(values, fieldSelection));
-  return fieldValues.reduce((fieldValues: string[], value) => {
-    if (!usedValues.has(value)) {
-      fieldValues.push(value);
-      usedValues.add(value);
-    }
-    return fieldValues;
-  }, []);
+  return fieldValues;
 }
```

## 2. Oracle + baseline vs reconstructed

- Oracle: `bun run test-unit-keep-cljs frontend/src/metabase/querying/filters/components/FilterPicker/FilterValuePicker/FilterValuePicker.unit.spec.tsx` (run from worktree root, symlinks in place)
- Baseline (`-t` on the discriminating tests): `Tests: 32 skipped, 7 passed, 39 total` — PASS
- Reconstructed (same `-t`): `Tests: 1 failed, 32 skipped, 6 passed, 39 total` — the failing test is `StringFilterValuePicker › search values › should not be able to create duplicates with free-form input`

## 3. failure_shape

`toHaveBeenLastCalledWith` mismatch: with the guard removed, typing an already-selected value and committing it appends a duplicate — `onChange` last called with `["a@b.com", "a@b.com"]` instead of the expected `["a@b.com"]`. This is exactly the pre-fix behavior the commit removed.

## 4. Confidence + adversarial

Confidence: high.
- The fix commit (#37072) changed `StringFilterValuePicker`'s `shouldCreate` from `query => query.length > 0` to `query => query.trim().length > 0 && !values.includes(query)` — the `!values.includes(query)` clause is the "no duplicate" semantic. Over 2+ years that logic migrated out of `FilterValuePicker` into the shared `MultiAutocomplete` hook (`getFieldValuesWithoutDuplicates`), but the behavior and its test survived.
- Adversarial checks: (a) Only the duplicate test fails; the sibling whitespace/empty tests still PASS, confirming the revert isolates the de-duplication semantic rather than breaking input handling broadly. (b) The failure is a value-level assertion (duplicate appended), not a render/crash artifact, so it genuinely discriminates the behavior. (c) The revert is the literal inverse of the fix's added guard, not an incidental side effect.

Note on the originally-suggested spec: `frontend/src/metabase/components/FieldValuesWidget/FieldValuesWidget.unit.spec.tsx` is **gone** at HEAD (the widget moved to `parameters/components/widgets/ParameterFieldWidget/FieldValuesWidget/` and the main `.unit.spec.tsx` was deleted in commit f74bf7fac26, "Use MultiAutocomplete in FieldValuesWidget"). The FieldValuesWidget spec edits in the fix were only mock/preset field swaps (VENDOR→EMAIL, driven by the `mocks/field.ts` `has_field_values` default change) — not a product-behavior assertion. The real behavioral change lived in `FilterValuePicker`, so the surviving discriminating spec is `FilterValuePicker.unit.spec.tsx`.

## 5. Ambiguity

The fix bundled two `shouldCreate` semantics: trim/whitespace rejection and duplicate rejection. I reconstructed the **duplicate-rejection** half (the `!values.includes(query)` clause), which has the single most specifically-named surviving test. The whitespace half also survives (`should not allow to add whitespace`) but is now enforced via `parseCsv({ trim, skip_empty_lines })` rather than a `shouldCreate` predicate, so it is a less faithful single-point revert. No `reconstruction_failed` — a discriminating shipped spec exists and behaves as required.