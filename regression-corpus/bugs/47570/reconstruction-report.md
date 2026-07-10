All confirmed. Here is the final report.

---

## 1. git diff (semantic revert)

```diff
diff --git a/frontend/src/metabase/embedding/components/EmbedModal/StaticEmbedSetupPane/lib/get-preview-params-by-slug.ts b/.../lib/get-preview-params-by-slug.ts
@@ -27,9 +27,7 @@ export function getPreviewParamsBySlug({
         values: parameterValues,
         defaultRequired: true,
       });
-      // metabase#47570
-      const valueWithDefaultLockedParameterValue = value === null ? [] : value;
-      return [parameter.slug, valueWithDefaultLockedParameterValue];
+      return [parameter.slug, value];
     }),
   );
 }
```

Reintroduces the exact 47570 bug: a locked parameter with no value serializes as `null` instead of defaulting to `[]`.

## 2. Oracle

- Spec: `/Users/fraser/Documents/code/metabase/frontend/src/metabase/embedding/components/EmbedModal/StaticEmbedSetupPane/tests/common.unit.spec.tsx`
- Command (from worktree root): `bun run test-unit-keep-cljs frontend/src/metabase/embedding/components/EmbedModal/StaticEmbedSetupPane/tests/common.unit.spec.tsx`
- Baseline (clean HEAD): Tests: 39 passed, 39 total
- Reconstructed (bug applied): Tests: 2 failed, 37 passed, 39 total

Oracle relocation: the shipped product code moved from `frontend/src/metabase/public/components/EmbedModal/StaticEmbedSetupPane/StaticEmbedSetupPane.tsx` (inline `getPreviewParamsBySlug`) into a module-extracted lib at `frontend/src/metabase/embedding/components/EmbedModal/.../lib/get-preview-params-by-slug.ts` (public/ → embedding/ move plus function extraction). The shipped spec survived as the same-named `tests/common.unit.spec.tsx` under the new `embedding/` path, with the `null`→`[]` assertions intact.

## 3. failure_shape

Two failing tests, both clean `toHaveTextContent` value mismatches (not compile/import errors):
- `should highlight changed code on parameters change` — Expected `params: { "month_and_year": [] }`, Received `params: { "month_and_year": null }`
- `should preserve highlighted code on tabs navigation` — same `[]` vs `null` mismatch

## 4. Confidence + adversarial

High confidence this isolates the reverted behavior. The revert touches only the locked-parameter default-value mapping; the 37 other tests in the same suite (rendering, iframe preview, font selector, banner, tab navigation, non-locked parameter code) stayed green. The two failures are precisely the tests that render a locked date parameter with no supplied value and assert the serialized `params` payload — the single behavior the fix changed. The mismatch is a DOM text-content value diff (`[]` vs `null`), confirming a semantic kill rather than a blunt break.

## 5. Outcome

`kill` — a surviving discriminating jest spec catches the regression (oracle relocation noted above: `public/` inline → `embedding/.../lib/` extracted module; spec followed to the new path). No new test needed; the existing unit coverage already closes the hole. Diff left in the worktree.