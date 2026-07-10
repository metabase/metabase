Reconstruction succeeded. Report below.

## Report: metabase#45670 semantic reconstruction

**(1) `git diff`**
```diff
diff --git a/frontend/src/metabase/parameters/utils/parameter-parsing.ts
@@ function parseParameterValueForFields
   // unix dates fields are numeric but query params shouldn't be parsed as numbers
   if (fields.every((f) => f.isNumeric() && !f.isDate())) {
-    return normalizeNumberParameterValue(type, value);
+    return parseFloat(value as string);
   }
```

**Relocation map** (both product + spec moved from `metabase-lib/v1/parameters/utils/` → `metabase/parameters/utils/`):
- Product: `frontend/src/metabase/parameters/utils/parameter-parsing.ts` (`parseParameterValueForFields`, numeric branch)
- Oracle spec (direct descendant of shipped spec): `frontend/src/metabase/parameters/utils/parameter-parsing.unit.spec.js` — the exact assertion the fix changed survives at line 310 (`toEqual([])`, formerly `[NaN]`), in test "should not try to parse default values".

Note: the fix's runtime logic (`isNaN ? [] : number`) was later refactored/deepened into `deserializeNumberParameterValue` in `frontend/src/metabase/querying/parameters/utils/parsing.ts` (parseNumber→null + `.filter(isNotNull)`), which `normalizeNumberParameterValue` wraps. Rather than revert that lower layer, I restored the pre-fix expression at the exact product location the fix originally touched — `return parseFloat(value)` — the literal buggy line from before commit c6ac90b4.

**(2) Oracle + baseline vs reconstructed**
- Oracle: `bun run test-unit-keep-cljs frontend/src/metabase/parameters/utils/parameter-parsing.unit.spec.js` (run from worktree root)
- Baseline (unmodified): `Tests: 47 passed, 47 total`
- Reconstructed (reverted): `Tests: 1 failed, 46 passed, 47 total`

**(3) failure_shape**
Single discriminating test fails with the exact original-bug signature:
```
● getParameterValueFromQueryParams › should not try to parse default values
  expect(received).toEqual(expected)
  - Array []
  + Array [ NaN ]
  at parameter-parsing.unit.spec.js:310
```
`Received [NaN]` vs `Expected []` — identical in meaning to the shipped spec change (`[NaN]` → `[]`).

**(4) confidence + adversarial**
Confidence: **high**. Adversarial checks: (a) only 1 test fails and it is precisely the fix's descendant assertion — no incidental/collateral failures, confirming the revert isolates the invalid-numeric path; (b) the failure is a genuine value mismatch (`[NaN]`), not a TS/compile artifact (the `as string` cast is erased by babel in jest); (c) the 46 passing tests include valid-number and boolean/string paths, showing the change is scoped to invalid numeric coercion, matching the bug's real blast radius.

**(5) ambiguity**
Minor: the fix's semantic now lives one layer down in `querying/.../parsing.ts` (`deserializeNumberParameterValue` + `filter(isNotNull)`); an alternative reconstruction could remove that filter. I chose the higher-fidelity option — restoring the literal pre-fix `parseFloat(value)` at the exact product file/line the fix modified — which also fails the same descendant oracle assertion. No reconstruction failure.