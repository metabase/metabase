# Reconstruction report — metabase#47951 (FE)

_Verbatim final report from the FE reconstruction agent (a5a4f605a227e3f25)._

---

Reconstruction complete and validated.

## Report

**(1) git diff** — minimal semantic revert of the `Field.remappedField` static method (not `git apply -R`), preserving the static signature/arity so the failure is behavioral, not a TypeError:

```diff
   static remappedField(fields: Field[]): Field | null {
-    const remappedFields = fields.map((field) => field.remappedField());
-    const remappedFieldIds = new Set(remappedFields.map((field) => field?.id));
-    if (remappedFields[0] != null && remappedFieldIds.size === 1) {
-      return remappedFields[0];
+    if (fields.length === 1) {
+      return fields[0].remappedField();
     }
     return null;
   }
```

File: `frontend/src/metabase-lib/v1/metadata/Field.ts`. This restores the pre-fix semantics (remapping only for a single field — the original `fields.length === 1` logic that lived inline in `formatting.ts` / `showRemapping` before the fix).

**(2) Oracle spec + results**
- Discriminating oracle: `frontend/src/metabase-lib/v1/metadata/Field.unit.spec.ts`
  - Baseline: `Tests: 32 passed, 32 total`
  - Reconstructed: `Tests: 1 failed, 31 passed, 32 total`
- Non-discriminating (verified): `frontend/src/metabase/parameters/utils/formatting.unit.spec.ts` stays `56 passed` under both fixed and buggy code. Traced why: its two relevant assertions are invariant to this revert — the 2-field case yields `remap=false` → "123,456,789" and the 1-field case yields `remap=true` → "A" either way. The spec's changed assertion was driven by the mock's `base_type` Text→Integer change, not the remap logic.

**(3) failure_shape** — genuine assertion failure at `Field.unit.spec.ts:394`:
`expect(FieldClass.remappedField([fkField1, fkField2])).toBe(pkField)` → Expected pkField, Received `null`. The other three assertions in the same test (single-field and the `[pkField, fkField1]` null case) still pass, isolating the failure to the multi-field-remapping behavior the fix introduced.

**(4) Confidence: high.** Adversarial reasoning: the failure is a clean `toBe` mismatch (pkField vs null), not a TypeError/compile/arity error — the method still exists with identical signature. The revert reproduces the actual bug behavior of #47951 (a parameter targeting multiple fields could not remap even when all fields share one identical remap target); the fix's whole point was to allow the multi-field-with-identical-target case, which my `fields.length === 1` guard rejects. Baseline passes, reconstructed fails on exactly the fix-added assertion.

**(5) Ambiguity:** none material. The static method was the correct localization; the formatting product change (`remap = Field.remappedField(fields) != null`) is a downstream consumer whose spec happens not to exercise the discriminating path, so `Field.unit.spec.ts` is the sole discriminating oracle.
