# Reconstruction report — metabase#51925 (FE)

_Verbatim final report (a7e2b0b7c45ee8910)._

---

Reconstruction succeeded. Report follows.

## 1. git diff

```diff
 frontend/src/metabase/visualizations/components/settings/ChartSettingLinkUrlInput.tsx
-      value={isFocused ? focusedValue : valueOrDefault}
+      value={focusedValue}
```

Single-line semantic revert. The fix made the input display the prop-derived `valueOrDefault` whenever the field is *not* focused (re-syncing from props); the buggy behavior displays the internal `focusedValue` state unconditionally — which never re-syncs from props after mount. This faithfully reproduces the original pre-fix shape (`const [value] = useState(initialValue); … value={value}`) rather than a mechanical `git apply -R` (the surrounding code has drifted: `AutocompleteInput` moved to `metabase/common/components/AutocompleteInput`, and a drift-added `handleBlur` guard `focusedValue !== (value ?? "")` now exists).

## 2. Oracle Tests: line

- Oracle spec: `frontend/src/metabase/visualizations/components/settings/ChartSettingLinkUrlInput.unit.spec.tsx`
- Baseline: `Tests: 8 passed, 8 total`
- Reconstructed: `Tests: 1 failed, 7 passed, 8 total`

## 3. failure_shape

Real assertion failure (not crash/type/render error) on the exact fix-added test:
```
● should correctly reset the input value when re-rendered with the same empty value
  expect(element).toHaveValue()
  Expected: ""   Received: "abc"
  > 150 |     expect(input).toHaveValue("");
```
After typing "abc", blurring, and re-rendering with `value=""`, the input keeps stale internal state instead of resetting to the prop value.

## 4. Confidence + adversarial reasoning

High confidence.
- The failing test is precisely the assertion the fix commit added (verified identical to `git show b4a28c6…` — the `should correctly reset…` test). The other new drift-test (`should not call onChange when focusing and blurring without making changes`) still passes, confirming I reverted only the fix's core behavior, not unrelated drift.
- Exactly one test fails; the other 7 pass — no collateral breakage or over-broad revert.
- Failure is a genuine value-mismatch assertion, exactly the user-visible bug (per-column "Display as Link" values not resetting/persisting across column switches), not a compile/arity/moved-target artifact.
- I traced the `onChange`-count assertions before editing to ensure the failure lands on the display-value assertion (`toHaveValue`), the semantically meaningful one, rather than an incidental earlier throw — confirmed by the output pointing at line 150.

## 5. Ambiguity

None material. The fix touched two product files, but the `onFocus` plumbing added to `AutocompleteInput.tsx` is only load-bearing for the focus/blur split; the unit-oracle-observable regression is fully driven by the single display-value line in `ChartSettingLinkUrlInput.tsx`, so the minimal revert lives there.
