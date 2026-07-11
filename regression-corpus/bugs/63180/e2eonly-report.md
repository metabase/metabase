Done. Outcome: **witness_authored** — the bug is unit-catchable.

## 1. git diff (product mutation)

Semantic revert of the load-bearing change from fix commit `2365a169` (the multi-file `pf=2` was the `Editor.tsx` logic change + the `ExpressionWidget.tsx` prop-plumbing that feeds it; the `Editor.tsx` `useMount` line is the load-bearing one). File moved from `query_builder/components/...` to `querying/components/...` since the fix.

`frontend/src/metabase/querying/components/expressions/Editor/Editor.tsx`, in `useExpression`'s `useMount`:
```
-      initial: clause === initialClause,
+      initial: true,
```
(The `initialClause` prop plumbing from the fix is left intact; the mutation just ignores it, which is the behavior before the fix.)

## 2. Witness

New spec: `frontend/src/metabase/querying/components/expressions/Editor/Editor.witness.unit.spec.tsx`. It renders `Editor` directly with `clause = Lib.expressionClause("+", [1,1])` and `initialClause={null}` (the shortcut-creates-new-expression shape), plus an external `<button>`. After the on-mount format populates the source (`1 + 1`), it clicks the outside button and asserts the "Keep editing your custom expression?" confirmation appears.

Oracle: `bun run test-unit-keep-cljs .../Editor/Editor.witness.unit.spec.tsx`
- **PASS on clean HEAD** — 1 passed.
- **FAIL on mutant** — clean assertion failure at `findByText("Keep editing your custom expression?")` (the modal never renders); not a compile error.

## 3. Bug summary

When a custom expression is created fresh via the Combine/Extract shortcut, the Editor remounts with a populated `clause` but a null `initialClause`. The mount-time format seeds `source`. With `initial: true`, it also seeds `initialSource = source`, so `hasSourceChanged` (`source !== initialSource`) is `false`. That makes `allowPopoverExit = source === "" || !hasSourceChanged` true, so `useCloseModal` never installs its capture-phase guard — clicking outside silently closes the editor and discards the shortcut-generated expression. The e2e checks exactly this (click outside → editor stays visible, no modal; only after clearing does outside-click close it).

## 4. Outcome

`witness_authored` — the bug is unit-catchable. The seam (`hasSourceChanged` → `allowPopoverExit` → CloseModal) is fully reproducible in jsdom by rendering the exported `Editor` with `clause !== initialClause`. The e2e is replaceable by this unit test.

## 5. Confidence

High. The mutation is the exact pre-fix expression at the exact site, and the observable it flips (`hasSourceChanged` → whether the "keep editing" confirmation guards an outside click) is the same causal chain the e2e exercises. The witness pins the discriminating condition (`clause` differs from `initialClause`) directly rather than driving the full shortcut UI, and it fails on the mutant with a genuine "modal absent" assertion, not a render/compile error.