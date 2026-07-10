Everything is in place. Here is my report.

## Outcome: `witness_authored`

The bug is unit-catchable. A jest witness passes on clean HEAD and fails on the mutant.

---

### 1. git diff (product mutation)

The fix commit `0e247c2` patched `ObjectDetailWrapper.tsx`, but that file no longer exists — the logic drifted into `frontend/src/metabase/visualizations/components/ObjectDetail/ObjectDetail.tsx`. Semantic revert (removed the reset `useEffect`):

```diff
-import { useEffect, useState } from "react";
+import { useState } from "react";
 ...
   const [currentObjectIndex, setCurrentObjectIndex] = useState(0);
 
-  useEffect(() => {
-    if (data.rows.length <= currentObjectIndex) {
-      setCurrentObjectIndex(0);
-    }
-  }, [data.rows, currentObjectIndex]);
-
   const hasPagination = data?.rows?.length > 1;
```

### 2. Witness

Added to `frontend/src/metabase/visualizations/components/ObjectDetail/ObjectDetail.unit.spec.tsx` (test `resets navigation state when the query result shrinks (metabase#54317)` plus a `setupRerenderable` helper). It renders `ObjectDetail` with the 10-row `testDataset`, clicks "Next page" 5 times to reach `Item 6 of 10` (index 5), then re-renders with a 3-row dataset and asserts the footer reads `Item 1 of 3` (and not `Item 6 of 3`).

Oracle command:
```
bun run test-unit-keep-cljs frontend/src/metabase/visualizations/components/ObjectDetail/ObjectDetail.unit.spec.tsx -t "metabase#54317"
```
- PASS on clean HEAD (with useEffect): `✓ resets navigation state when the query result shrinks (metabase#54317)`
- FAIL on mutant (useEffect removed): `Unable to find an element with the text: /Item 1 of 3/i` — the DOM instead renders `Item 6 of 3` (stale, out-of-range index; `data.rows[5]` is `undefined`).

### 3. Bug summary

`ObjectDetail` keeps the currently-viewed row in local component state (`currentObjectIndex`). When the underlying query result changes and returns fewer rows than the current index (e.g. applying a tighter filter), the index is never re-clamped. The pagination footer then shows a nonsensical position (`Item 6 of 3`) and the panel tries to render `data.rows[currentObjectIndex]` which is `undefined`. The fix's `useEffect` resets the index to 0 whenever `data.rows.length <= currentObjectIndex`. This is exactly what the e2e repro checks (`Item 14 of 14` → filter change → `Item 1 of 9`).

### 4. Confidence

High. The mutation is the exact inverse of the fix commit's product change, relocated to where the logic now lives. The witness discriminates cleanly on the observable pagination text (a value/DOM assertion, not a compile error), reproduces the e2e's precise scenario (navigate to a high index, then shrink the result set), and the failure message confirms the mutant renders the stale out-of-range index. The behavior is pure React local-state + rerender, fully reachable in jsdom — no browser/layout/routing/network dependence — so it is genuinely unit-catchable and the e2e is replaceable.

---

Note on process: the harness is running multiple agents in parallel that share one git stash stack. A `git stash push`/`pop` I used to test the clean tree collided with a concurrent agent's stash (`worktree-agent-a14ea8da`), which briefly pulled their `use-cell-selection.tsx` change into my worktree. I restored their stash (`git stash store` of the dropped commit `7ca6c16`, now `stash@{0}`), reverted `use-cell-selection.tsx` in my tree, and re-applied my mutation directly with Edit (no stash). Final working tree contains only the two intended files. Recommend future runs avoid `git stash` entirely given the shared stack.

Also linked `node_modules/eventsource-parser` (present in the bun store but missing its top-level symlink) so the jest suite could resolve `__support__/ui`; this was a pre-existing gap in the shared `node_modules`, unrelated to the task.