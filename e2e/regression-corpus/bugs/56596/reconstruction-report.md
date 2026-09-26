The reconstruction is complete and verified. Report below.

---

## 1. git diff — semantic revert

```diff
diff --git a/frontend/src/metabase/querying/expressions/string.ts b/frontend/src/metabase/querying/expressions/string.ts
@@ -104,7 +104,7 @@ export function unquoteString(
       } else if (ch === OPEN || ch === CLOSE) {
         str += ch;
       } else {
-        str += BACKSLASH + ch;
+        str += ch;
       }
```

In `unquoteString`, when a backslash precedes an *unknown* escape char (not in `STRING_UNESCAPE`, not the open/close delimiter), the fixed code re-emits the backslash (`BACKSLASH + ch`). The revert drops it — reintroducing the "disappearing string escapes" behavior of #56596. This is the exact inverse of the fix's "Allow escaping backslash" change. (Product moved from `metabase-lib/v1/expressions/string.ts` → `metabase/querying/expressions/string.ts`; the buggy `escapeString`/`unescapeString` helpers were replaced by this unified `escaping` state machine, so a literal `git apply -R` was impossible — this is a semantic revert of the surviving logic.)

## 2. Oracle
- Spec (relocated from `metabase-lib/v1/expressions/string.unit.spec.ts`): `frontend/src/metabase/querying/expressions/string.unit.spec.ts`
- Command (from worktree root): `bun run test-unit-keep-cljs frontend/src/metabase/querying/expressions/string.unit.spec.ts`
- Baseline (clean HEAD): **16 passed, 0 failed**
- Reconstructed (mutation applied): **6 failed, 10 passed**

## 3. failure_shape
Representative failing test: `unquoteString › should handle double-quoted strings`, at line 94:
```
expect(unquoteString(`"\\[\\]"`)).toEqual(`\\[\\]`)
  Expected: "\\[\\]"
  Received: "[]"
```
The escaped `\[` and `\]` lose their backslashes on unquote. The round-trip tests fail identically, e.g. `Expected: "Backslash: \\\\"` / `Received: "Backslash: \\"`. All are clean value-equality mismatches, no compile/import error.

## 4. Confidence + adversarial
High confidence, tightly isolated. The 6 failures are exactly the backslash-preservation assertions: the three `unquoteString` cases (double/single/bracket) and the three `it.each` round-trips. Every `quoteString` test stays green (mutation is in `unquoteString` only), the plain-string / special-char (`\t\n\r\f\b`) / quote-escaping assertions stay green (those chars ARE in `STRING_UNESCAPE`, so they never hit the mutated `else`), and `"should be possible to specify the quote being unquoted"` stays green (no backslash escapes). The failure therefore isolates the reverted backslash-escaping behavior rather than a blunt break — a mutation touching an unrelated branch would not spare those 10 tests.

## 5. Outcome
**kill.** The relocated jest spec `frontend/src/metabase/querying/expressions/string.unit.spec.ts` (descendant of the fix's shipped `string.unit.spec.ts`) discriminates the bug directly with value assertions; the formatter repro `it("should format escaped regex characters (metabase#56596)")` at `formatter/formatter.unit.spec.ts:694` provides a second, higher-level surviving guard. No new unit test is needed — existing jest coverage already catches this regression; the shipped Cypress repro is redundant for this class. Diff left in place in the worktree for capture.