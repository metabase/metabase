Task complete. Outcome: **witness_authored**.

## 1. git diff (product mutation)

The fix commit `a97d2d1c0d` lives now in `frontend/src/metabase/querying/components/NativeQueryEditor/PreviewQueryButton/PreviewQueryButton.tsx` (moved from the old `query_builder/components/view/...` path). Semantic revert of `PreviewQueryButton.shouldRender` — dropped the `hasSnippets` term:

```diff
   const hasVariableTemplateTags = nativeQuestion.hasVariableTemplateTags();
-  const hasSnippets = nativeQuestion.hasSnippets();
 
-  return question.canRun() && (hasVariableTemplateTags || hasSnippets);
+  return question.canRun() && hasVariableTemplateTags;
```

This is left applied in the worktree.

## 2. Witness

New spec: `frontend/src/metabase/querying/components/NativeQueryEditor/PreviewQueryButton/PreviewQueryButton.unit.spec.tsx` (left applied). It builds a native `Question` (sample DB + a registered snippet) and asserts `PreviewQueryButton.shouldRender` directly — a pure-ish function, no render needed.

Oracle command: `bun run test-unit-keep-cljs .../PreviewQueryButton.unit.spec.tsx`

- **PASS on clean HEAD**: 3/3 pass.
- **FAIL on mutant**: the snippet-only case fails — `expect(PreviewQueryButton.shouldRender({ question })).toBe(true)` → `Expected: true, Received: false`. The two control cases (variable-tag → true, no-tags → false) still pass on both sides, confirming the witness isolates exactly the reintroduced regression.

## 3. Bug summary

The Preview button in the native query editor decides whether to show via `shouldRender`. With the mutation, it only renders when the query has *variable* template tags (`hasVariableTemplateTags`). A query whose only dynamic content is a snippet (e.g. `select {{snippet: Foo}}`) reports no variable tags, so the Preview button disappears and the user cannot preview the compiled query. The fix restored rendering when the query has snippets too. This is precisely what the e2e repro (`snippets.cy.spec.js`, `metabase#60534`) checks: type a snippet-only query, click "Preview the query", expect the modal to show `select 'foo'`.

## 4. Outcome

`witness_authored` — the bug is unit-catchable, so the e2e is replaceable at the unit level. The observable is a pure boolean returned by `shouldRender({ question })`, requiring no browser, routing, layout, or network.

## 5. Confidence

High. The mutation is the exact inverse of the fix commit's product change, applied at the same seam that drifted only in file location. The witness exercises the real `Question`/`NativeQuery` objects (not a mock of `shouldRender`), and the snippet template tag is parsed the same way the product code reads it via `hasSnippets()` (`templateTags().some(t => t.type === "snippet")`). The control tests prove the harness faithfully models both the passing (variable-tag) and negative (no-tag) paths, so the single failing assertion attributes cleanly to the snippet regression.