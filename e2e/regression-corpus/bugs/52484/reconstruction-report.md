Reconstruction succeeded — this is a clean kill. Report below.

---

## 1. git diff (semantic revert)

Applied to `frontend/src/metabase/parameters/utils/parameter-parsing.ts` (the relocated descendant of the fix's product file), inside `parseParameterValueForNumber`:

```diff
-  return normalizeNumberParameterValue(type, value);
+  if (Array.isArray(value)) {
+    const numbers = value.map((number) => parseFloat(number as string));
+    return numbers.every((number) => !isNaN(number)) ? numbers : null;
+  }
+
+  const number = parseFloat(value as string);
+  return isNaN(number) ? null : number;
```

This reintroduces the pre-fix behavior semantically: the old code returned `null` for any single value that isn't a bare parseable float, and returned `null` for a whole array if *any* element failed to parse — instead of delegating to `normalizeNumberParameterValue`, which coerces/filters into a numeric array. This is the exact logic the fix commit `a82a386` deleted.

## 2. Oracle

- Spec (surviving relocated descendant): `frontend/src/metabase/parameters/utils/parameter-parsing.unit.spec.js`
  - Shipped path was `frontend/src/metabase-lib/v1/parameters/utils/parameter-parsing.unit.spec.js`; both product `.ts` and spec `.js` were module-relocated `metabase-lib/v1/parameters/…` → `metabase/parameters/…`. The `normalizeNumberParameterValue` helper also moved to `metabase/querying/parameters/utils/parsing.ts` and gained a `type` arg.
- Command (from worktree root): `bun run test-unit-keep-cljs frontend/src/metabase/parameters/utils/parameter-parsing.unit.spec.js`
- Baseline (clean HEAD): Tests: 47 passed, 47 total.
- Reconstructed (mutation applied): Tests: 2 failed, 45 passed, 47 total.

## 3. failure_shape

Both failures are clean value-equality mismatches in the `it.each` "should parse number parameter value" block:

- `should parse number parameter value abc` — `expect(received).toEqual(expected)`: Expected `[]`, Received `null`.
- `should parse number parameter value ["123", "abc"]` — Expected `[123]`, Received `null`.

These are precisely the two assertions the fix commit changed from `null` (the pre-fix expectation) to `[]` / `[123]`.

## 4. Confidence + adversarial

High confidence, tightly isolated. Only the 2 rows that depend on the no-connected-field numeric normalization flip; the other 45 tests stay green — including sibling number rows (`"123"→[123]`, `"123abc"→[123]`, `["123","234"]→[123,234]`, `"123,234"→["123,234"]`, `"123,abc"→null`) and the field-backed number-parsing tests. The comma-split HACK branch (still present above my edit) is untouched, so its cases pass, proving the failure isolates the final normalization path rather than a blunt break. Failures are assertion mismatches, not compile/import errors (the now-unused `normalizeNumberParameterValue` import is harmless under babel/jest — it's an ESLint concern only, not a runtime one).

## 5. Outcome

`kill` — a surviving jest unit spec (module-relocated from `metabase-lib/v1/...` to `metabase/parameters/...`) discriminates the bug with clean value assertions. No new test needed; the regression is already unit-covered. The Cypress spec shipped alongside (`dashboard-filters-reproductions.cy.spec.js`) is redundant protection for this logic. Diff left in the worktree.