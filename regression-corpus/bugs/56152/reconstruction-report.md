Reconstruction complete. The oracle flipped cleanly. Here is the report.

---

## 1. git diff — semantic revert

```diff
diff --git a/frontend/src/metabase/querying/expressions/position.ts b/frontend/src/metabase/querying/expressions/position.ts
@@ -15,8 +15,7 @@ export function enclosingFunction(doc: string, pos: number) {
       cursor.to >= pos
     ) {
       const value = doc.slice(cursor.from, cursor.to);
-      const argsIndex = value.indexOf("(") ?? value.length;
-      const structure = value.slice(0, argsIndex).trim();
+      const structure = value.replace(/\(.*\)?$/, "");
 
       if (!value.includes("(")) {
         break;
```

This restores the exact pre-fix line from commit 4187e57. The old regex `/\(.*\)?$/` uses `.` which does not match newlines, so for a multiline `datetimeDiff(\n …\n)` call it fails to strip the argument list. `structure` retains the whole multiline blob, `getMBQLName(structure)` returns undefined, and `res` stays `null`. The `indexOf("(")` form the fix introduced is newline-agnostic and strips correctly. I left the later-added `if (!value.includes("(")) break;` guard untouched so the revert stays surgical.

## 2. Oracle

- Spec (relocated): `frontend/src/metabase/querying/expressions/position.unit.spec.ts`
  - Original shipped path was `frontend/src/metabase-lib/v1/expressions/position.unit.spec.ts`; the whole expressions module was moved `metabase-lib/v1/expressions` → `metabase/querying/expressions` in commit cd77efaf805 (#61120). The `.unit.spec.ts` extension and the "should handle multiline input" test survived intact.
- Product (relocated): `frontend/src/metabase/querying/expressions/position.ts`
- Command: `bun run test-unit-keep-cljs frontend/src/metabase/querying/expressions/position.unit.spec.ts` (run from worktree root)
- Baseline (clean HEAD): PASS — Tests: 10 passed, 10 total
- Reconstructed (mutation applied): FAIL — Tests: 1 failed, 9 passed, 10 total

## 3. failure_shape

- Failing test: `enclosingFunction › should handle multiline input`
- Assertion: `expect(received).toEqual(expected)` — Expected `{ name: "datetime-diff", from: 0, to: 56, arg: null }`, Received `null`. A clean value mismatch at `position.unit.spec.ts:124`, not a compile/import error.

## 4. Confidence + adversarial

High confidence the failure isolates the reverted behavior. All 9 sibling tests stay green — including single-line cases like "should get the correct enclosing function and argument", "should handle multiple arguments", and "should handle nested function calls" — because on single-line input the old regex and the new `indexOf` produce identical `structure` values. Only the multiline test regresses, which is precisely the behavior the fix (#56155, repro for #56152) added. The failure is a semantic `null` return, not a blunt break: the function still parses, iterates the tree, and returns cleanly — it just fails to recognize the multiline function name, exactly matching the historical bug.

## 5. Outcome

`kill` — the surviving relocated jest spec (`metabase-lib/v1/expressions` → `metabase/querying/expressions`, same `.unit.spec.ts` extension) discriminates the bug via a clean value assertion. No new unit test needed; the existing regression test already provides protection. Diff left in place in the worktree for capture.