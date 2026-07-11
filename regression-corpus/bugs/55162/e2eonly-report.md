The mutation is in place and the witness discriminates cleanly. Task complete.

## Report

**Outcome: `witness_authored`** — the bug is unit-catchable; the e2e is replaceable at the unit level for this behavior.

### 1. git diff (product mutation)
Semantic revert of the fix commit's `navigation.ts` change, in the current `popState` thunk:

```diff
       if (!_.isEqual(card, location.state.card)) {
+        const shouldUpdateUrl = location.state.card.type === "model";
         const isEmptyQuery = !location.state.card.dataset_query.database;
         ...
           await dispatch(
-            setCardAndRun(location.state.card, { shouldUpdateUrl: false }),
+            setCardAndRun(location.state.card, { shouldUpdateUrl }),
           );
```

File: `/Users/fraser/Documents/code/metabase/.claude/worktrees/agent-ad96c83cd31418c66/frontend/src/metabase/query_builder/actions/navigation.ts`

Note: the fix commit also touched `defaults.ts` (`queryBuilderMode: false → "view"`). That is a separate default-value/type-hygiene tweak, already at `"view"` on current HEAD, and not the load-bearing part of issue #55162 (which is literally titled "Setting shouldUpdateUrl to false when calling popState"). I left it as-is and mutated only the behavior the e2e's back/forward URL assertions exercise.

### 2. Witness
Added a `popState — shouldUpdateUrl` describe block to the existing `navigation.unit.spec.ts` (file: `.../actions/navigation.unit.spec.ts`). It dispatches the real `popState` thunk with a spied `dispatch`/`getState`, neutralizes every other selector/action `popState` touches, and asserts the options passed to `setCardAndRun`:

```ts
expect(setCardAndRunSpy).toHaveBeenCalledWith(expect.anything(), {
  shouldUpdateUrl: false,
});
```

Two cases: a `type: "model"` card (the discriminating one) and a `type: "question"` card (control — false under both clean and mutant).

Oracle command: `bun run test-unit-keep-cljs frontend/src/metabase/query_builder/actions/navigation.unit.spec.ts`

- PASS on clean HEAD: 10/10 pass (both model + question cases → `shouldUpdateUrl:false`).
- FAIL on mutant: the model-card test fails with `Received shouldUpdateUrl: true` vs `Expected false` at the assertion; question-card test still passes.

### 3. Bug summary
On browser back/forward (`POP`) into a QB history entry, `popState` re-runs the card stored in `location.state`. The reintroduced bug computes `shouldUpdateUrl = location.state.card.type === "model"`, so for a **model** card `setCardAndRun` runs with `shouldUpdateUrl: true`. Running the card then pushes a fresh URL/history entry during what should be a pure history restore, corrupting the back/forward stack — exactly the pathname mismatches the e2e repro (`metabase#55162`) checks as it steps a model through query/metadata/view and presses back/forward. Questions were unaffected (type !== "model" → already false), which is why the fix simply hard-codes `false` for all card types.

### 4. Confidence
High. The mutation is the exact inverse of the fix commit's product change, reintroducing the same conditional the fix removed. The witness asserts on the precise value the fix flipped, at the same call site, and discriminates cleanly (clean=false, mutant=true for models) with a value assertion, not a compile error. The seam is genuinely unit-testable: `popState` is a plain thunk and the observable (the `shouldUpdateUrl` option handed to `setCardAndRun`) is a pure value at the mutation site — no real browser history, layout, or network needed. The e2e's cross-page routing wrapper is not required to catch this specific regression.