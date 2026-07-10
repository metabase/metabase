Reconstruction succeeded — a clean jest kill. The diff is left in the worktree. Report follows.

---

## 1. git diff (semantic revert)

`frontend/src/metabase/databases/utils/engine.ts`:

```diff
 export function formatNativeQuery(query: string | JSONQuery): string {
-  return typeof query === "string" ? query : formatJsonQuery(query);
+  if (typeof query === "object") {
+    return formatJsonQuery(query);
+  }
+  try {
+    return formatJsonQuery(JSON.parse(query));
+  } catch {
+    return query;
+  }
 }
```

This reintroduces the bug's semantic: a JSON-looking string (a Mongo native query) is no longer returned verbatim — it gets parsed and re-serialized. The original 2024 bug was that `formatNativeQuery(<string>, "mongo")` returned `undefined` (the `typeof query === "object"` gate excluded strings); the fix made string queries pass through untouched. The function has since drifted (dropped the `engine` param, moved `frontend/src/metabase/lib/engine.ts` → `frontend/src/metabase/databases/utils/engine.ts`), but the invariant "a JSON string comes back as-is, not reformatted" is exactly what the fix's added assertion pins.

## 2. Oracle

- Spec (relocated descendant): `frontend/src/metabase/databases/utils/engine.unit.spec.ts`
- Command (from worktree root): `bun run test-unit-keep-cljs frontend/src/metabase/databases/utils/engine.unit.spec.ts`
- Baseline (clean HEAD): PASS — Tests: 15 passed, 15 total.
- Reconstructed (mutated): FAIL — Tests: 1 failed, 14 passed, 15 total.

## 3. failure_shape

Failing test: `formatNativeQuery › should return formatted JSON`, at the descendant of the fix's added assertion (line 71):
```
expect(formatNativeQuery('["foo"]')).toEqual('["foo"]');
```
- Expected: `["foo"]`
- Received: `[\n  "foo"\n]`

A clean value assertion mismatch, not a compile/import error.

## 4. Confidence + adversarial

High confidence the failure isolates the reverted behavior. The mutation only affects string inputs that successfully `JSON.parse`. The sole such assertion is line 71 (`'["foo"]'`). All siblings stay green:
- The SQL-string tests (`"select 1"`, `"foo"`, `"-- foo"`, the comment-line test) throw on `JSON.parse` → hit the `catch` → returned verbatim, unchanged.
- The object/array JSON assertions in the same it-block (lines 67-70) take the `typeof query === "object"` branch → unchanged.

So exactly one of 15 tests flips, and it's the assertion the fix added. This is a surgical isolation, not a blunt break.

## 5. Outcome

`kill`. The fix's jest regression protection survives at HEAD as a relocated descendant (`frontend/src/metabase/lib/engine.unit.spec.ts` → `frontend/src/metabase/databases/utils/engine.unit.spec.ts`, and the product moved likewise). The discriminating assertion `formatNativeQuery('["foo"]') === '["foo"]'` still catches the reintroduced bug with a value mismatch. No new test needed — the existing unit spec closes the hole.