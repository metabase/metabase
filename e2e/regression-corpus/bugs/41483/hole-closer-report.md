Product file restored to HEAD; `git diff --stat` lists only the spec file. Hole closed.

## Report

### 1. Test added
File: `/Users/fraser/Documents/code/metabase/.claude/worktrees/agent-a94b813cf457d5390/frontend/src/metabase/utils/browser.unit.spec.ts`

```diff
@@ describe("browser", () => {  parseHashOptions it.each
       { input: "#foo=-123", expected: { foo: -123 }, name: "negative numbers" },
+      {
+        input: "#foo=01",
+        expected: { foo: null },
+        name: "leading-zero numeric strings without throwing (metabase#41483)",
+      },
       { input: "#foo", expected: { foo: true }, name: "bare key as true" },
```

### 2. Level
Pure-function unit test. Added a case to the existing colocated `parseHashOptions` `it.each` table in `browser.unit.spec.ts`, matching the file's established convention exactly. `parseHashOptions` delegates to the private `parseQueryStringOptions`, which is the exact function carrying the `safeJsonParse` fix. The input `"#foo=01"` matches the numeric regex `/^(true|false|-?\d+(\.\d+)?)$/` and routes into the parse branch. No new imports, no lint deltas.

### 3. Proof
- Clean HEAD: `Tests: 21 passed, 21 total` — the new case (`should parse leading-zero numeric strings without throwing (metabase#41483)`) PASSES; `safeJsonParse("01")` catches the `JSON.parse` throw and returns `null`, yielding `{ foo: null }`.
- Reverted fix (`safeJsonParse(value)` → `JSON.parse(value)`): `Tests: 1 failed, 20 passed, 21 total`. The new case FAILS with a clean runtime value assertion:
  `SyntaxError: Unexpected number in JSON at position 1 (line 1 column 2)` thrown at `browser.ts:16 JSON.parse(value)` — the exact reintroduced #41483 crash, not a compile error.

### 4. Isolation
All other sibling tests stayed green in both runs — the other 4 `parseHashOptions` numeric/boolean cases, all 7 `isTouchDevice` cases, and all 5 `stringifyHashOptions` cases. Only the newly added leading-zero case flipped. The failure is a genuine runtime throw on the discriminating input, exactly reproducing the bug.

### 5. Outcome
`hole_closed`. Product file `browser.ts` restored to HEAD; `git diff --stat` shows only `frontend/src/metabase/utils/browser.unit.spec.ts | 5 +++++`.