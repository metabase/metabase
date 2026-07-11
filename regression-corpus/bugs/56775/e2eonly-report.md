Done. Outcome: **witness_authored**.

## 1. git diff (product mutation)

Semantic revert in `frontend/src/metabase/query_builder/actions/url.ts` (the `updateUrl` thunk — where the fix's logic lives now; it moved out of `navigation.ts` since the fix commit):

```diff
-      const card = isAdHocModelOrMetric
-        ? getCard(getState())!
-        : question.card();
+      const card = question.card();
```

(Also dropped the now-unused `getCard` import so the e2e build's linter stays green.) This restores the pre-fix behavior: the old code carried `question._doNotCallSerializableCard()` unconditionally — the modern equivalent is `question.card()` — instead of unwrapping to the underlying model card for ad-hoc model/metric navigations.

## 2. Witness

Added to `frontend/src/metabase/query_builder/actions/url.unit.spec.ts` (new test `...(metabase#56775)`, reusing that file's existing `updateUrl` producer harness). It builds a structured model, composes it into the ad-hoc question the QB shows when you open a model (source becomes the model itself), sets `qb.card`/`originalCard` to the real model card, dispatches `updateUrl`, and asserts on the `setCurrentState(newState)` payload — the card the back-button restore reads back.

Assertion: `expect(newState.card.dataset_query).toEqual(modelCard.dataset_query)`.

Oracle: `bun run test-unit-keep-cljs frontend/src/metabase/query_builder/actions/url.unit.spec.ts -t "56775"`
- Clean HEAD: **PASS** (`card` = unwrapped model card, `query: {source-table: 2}`).
- Mutant: **FAIL** — clean deep-equality diff: got the composed wrapper `{lib/type mbql/query, stages:[{source-card: 1}]}` instead of the model's `{type: query, query: {source-table: 2}}`.

Note: I assert on the `setCurrentState` payload rather than the dispatched router `push` descriptor. The dispatched-navigation path throws `push is not a function` in this jest environment (a sibling agent worktree pollutes jest-haste-map), which the thunk swallows via `console.warn`. `setCurrentState` carries the identical `card` value and runs before the push, so it's the robust seam.

## 3. Bug summary

For a saved model (or metric), opening it makes the QB compose an ad-hoc question whose source-table is the model itself (`card__<id>`). When `updateUrl` records history state, the bug stores this *composed wrapper* card on `location.state.card` instead of the model's real underlying query. Pressing the browser back button then restores that wrapper, so the model's "Edit query definition" shows the model wrapped inside itself (data source = the model's own name) rather than its real source ("Products"). The fix unwraps to `getCard(getState())` — the true model card — for ad-hoc model/metric navigations. This is exactly what the e2e repro checks: after Visualize → back → edit definition, the data step shows "Products", not "Model 56775".

## 4. Outcome

`witness_authored` — the bug is unit-catchable, so the e2e is replaceable. The observable (which card object is placed on history state) is a pure product decision inside the `updateUrl` thunk, discriminable at the redux-thunk level without a real browser.

## 5. Confidence

High. The mutation is the exact semantic inverse of the fix at the line the fix changed, and the witness reproduces the real flow: it drives `isAdHocModelOrMetricQuestion` to `true` (verified — the fix branch is only taken when store metadata can compose the model, which required seeding entities into the store state) and observes the branch's output. Clean-vs-mutant produces distinct, meaningful `dataset_query` shapes (unwrapped `source-table` vs composed `source-card`), which is precisely the difference the browser back button surfaces to the user.

Both product mutation and witness are left applied in the worktree.