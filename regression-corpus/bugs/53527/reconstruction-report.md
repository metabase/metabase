The reconstruction is complete. Diff left in the worktree, symlinks untracked.

---

## 1. git diff — the semantic revert

```diff
diff --git a/frontend/src/metabase/querying/expressions/string.ts b/frontend/src/metabase/querying/expressions/string.ts
@@ unquoteString()
-    if (ch === BACKSLASH && !escaping) {
+    if (false && ch === BACKSLASH && !escaping) {
       escaping = true;
       continue;
     }
```

This neutralizes the backslash-escape branch in `unquoteString`, so a `\` is appended as a literal character and escaped quotes are never unescaped — the exact behavior of the old `shrink(text)` path that the fix commit replaced with `token.value`.

## 2. Oracle

- Spec: `frontend/src/metabase/querying/expressions/string.unit.spec.ts`
- Command (from worktree root): `bun run test-unit-keep-cljs frontend/src/metabase/querying/expressions/string.unit.spec.ts`
- Baseline (clean HEAD): **PASS** — Tests: 16 passed, 16 total
- Reconstructed (mutation applied): **FAIL** — Tests: 6 failed, 10 passed, 16 total

## 3. failure_shape

- Failing test: `unquoteString › should handle double-quoted strings`, at **line 92** — `expect(unquoteString(`"\\""`)).toEqual(`"`)`.
- This assertion is the direct relocated descendant of the fix's shipped unit test (`recursive-parser.unit.spec.ts`: `expect(process('"\\""')).toEqual('"')`).
- Mismatch: **Expected `"` / Received `\`** (jest renders as `"\""` vs `"\\"`). Clean value mismatch, not a compile/import error.

## 4. Confidence + adversarial

High. The failures isolate escape-unescaping precisely:
- All 9 `quoteString` sibling tests stay **green** (encoding path untouched).
- `unquoteString › should be possible to specify the quote being unquoted` stays **green** — it uses no backslash escapes, only plain delimiter stripping, which the mutation preserves.
- Only tests whose inputs contain backslash escapes fail (the three `should handle *-quoted strings` and the three round-trip cases). This is the bug's blast radius, not a blunt break of the function.

## 5. Outcome

**kill.** The shipped spec class is `all_specs_gone` — both `recursive-parser.js` and `recursive-parser.unit.spec.ts` were deleted by the Pratt-parser refactor (#54415 "Clean up custom expression compiler"). The product logic (`shrink`→`token.value` string-literal unescaping) survives as `unquoteString` in `frontend/src/metabase/querying/expressions/string.ts`, and the discriminating assertion survives, relocated, in `string.unit.spec.ts:92`. A jest unit test catches this regression; already closed with a surviving unit test — no new test needed.