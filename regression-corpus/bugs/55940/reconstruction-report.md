Reconstruction complete. The oracle flips cleanly and the diff is left in place in the worktree.

## Report

### 1. git diff — semantic revert
```diff
diff --git a/frontend/src/metabase/querying/expressions/help-text.ts b/frontend/src/metabase/querying/expressions/help-text.ts
@@ function getExample(
   return {
     operator: name as Lib.ExpressionOperator,
-    options: {},
+    options: name === "offset" ? (undefined as unknown as Lib.ExpressionOptions) : {},
     args: args.flatMap((arg) => arg.example).filter(isNotNull),
   };
```
Rationale: The original fix (`5f68e7a`) changed `getHelpExample` from `adjustCaseOrIf(...)` to `applyPasses(...)`. The only behavioral difference for the offset example is the `adjustOffset` pass, which rewrites `["offset", expr, n]` → `["offset", {}, expr, n]` — i.e. it injects offset's options map. After the `#57382` refactor the product logic moved to `frontend/src/metabase/querying/expressions/help-text.ts` and the array-MBQL representation became the object form `Lib.ExpressionParts` where that injected `{}` is the `options` field. Reverting offset's `options` back to "missing" reproduces the pre-fix bug (offset example lacks its options map) at the current representation.

### 2. Oracle
- Spec (surviving relocated descendant of `metabase-lib/v1/expressions/helper-text-strings.unit.spec.ts`): `frontend/src/metabase/querying/expressions/help-text.unit.spec.ts`, test `getHelpText › should return help text if a supported name is passed › offset` (the direct descendant of the fix's shipped `it("offset", async …)`).
- Command (from worktree root): `bun run test-unit-keep-cljs frontend/src/metabase/querying/expressions/help-text.unit.spec.ts`
- Baseline (clean HEAD): PASS — Tests: 11 passed, 11 total.
- Reconstructed (mutation applied): FAIL — Tests: 1 failed, 10 passed, 11 total.

### 3. failure_shape
Failing test: `offset`. Clean value mismatch at spec line 81 (`expect(helpText?.example).toEqual({...})`):
- Expected: `example.options` = `{}` (Object)
- Received: `example.options` = `undefined`

Pure `toEqual` deep-equality mismatch on the `options` field — no compile/import error, no throw. The test fails at the structure assertion before reaching the `formatExpressionParts` format assertion at line 102.

### 4. Confidence + adversarial
High confidence this is a genuine kill isolating the reverted behavior. The mutation is gated on `name === "offset"`, so every sibling stays green: `count` (line 30, `options: {}`), `percentile` (line 44, nested `options: {}`), `convertTimezone`, `datetimeDiff`, and all four per-engine `now` tests — 10 passing. Notably the loop test `all help texts can be formatted` (descendant of the fix's original `.not.toThrow()` assertion) also stays green: `formatExpressionParts` tolerates `undefined` options at runtime, so the failure is not a blunt crash — it is precisely the offset structure regression the fix's shipped assertion was written to catch. The single red test is the offset test, failing on the exact field (`options`) that `adjustOffset` was responsible for.

### 5. Outcome
`kill`. The bug is caught by a surviving jest unit test (oracle relocated: `frontend/src/metabase-lib/v1/expressions/helper-text-strings.unit.spec.ts` → `frontend/src/metabase/querying/expressions/help-text.unit.spec.ts`; product moved `metabase-lib/v1/expressions/helper-text-strings.ts` → `metabase/querying/expressions/help-text.ts`, array-MBQL `applyPasses` collapsed into a uniform `getExample` builder). Already closable by the existing unit test — no new test needed.