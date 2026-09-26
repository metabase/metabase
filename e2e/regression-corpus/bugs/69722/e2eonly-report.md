Task complete. Outcome: **witness_authored**.

## 1. git diff (product mutation)

The load-bearing product change in fix `f3f72f8` was the prop rename in `DatasetEditorInner.tsx` (the other file, `DatasetQueryEditor.jsx`, only added a PropTypes entry and no longer exists — it's now `.tsx`). Semantic revert reintroducing the bug:

```diff
frontend/src/metabase/query_builder/components/DatasetEditor/DatasetEditorInner.tsx
@@ line 730
                 isActive={isEditingQuery}
                 height={editorHeight}
-                availableHeight={height}
+                viewHeight={height}
                 onResizeStop={handleResize}
```

`DatasetQueryEditor` spreads unknown props into `NativeQueryEditor`, so passing `viewHeight` (an unrecognized name) leaves `availableHeight` undefined → `NativeQueryEditorRoot` defaults it to `Infinity`.

## 2. Witness

New spec: `frontend/src/metabase/query_builder/components/DatasetEditor/DatasetEditorAvailableHeight.unit.spec.tsx`

It renders the full `DatasetEditor` (unmocking the real `NativeQueryEditor`) with `height={600}` and a 40-line native query, then reads the resizable editor area's inline height (`.react-resizable`, emitted as `calc(<rem>rem * var(--mantine-scale))`) and asserts it is capped below the uncapped 41rem that all 40 query lines would produce.

Oracle command: `bun run test-unit-keep-cljs frontend/src/metabase/query_builder/components/DatasetEditor/DatasetEditorAvailableHeight.unit.spec.tsx`

- PASS on clean HEAD: editor caps to 16rem (`getMaxAutoSizeLines(600)` → 15 lines).
- FAIL on mutant: `expect(received).toBeLessThan(expected) — Expected: < 41, Received: 41` (editor auto-sizes to the full 40-line query = 41rem).

The witness must render at the `DatasetEditor` level, not `DatasetQueryEditor`, because the mutated prop pass-through lives in the parent (`DatasetEditorInner`), and it needs a concrete `height` prop — with `height=undefined` both clean and mutant collapse to `Infinity` and are indistinguishable.

## 3. Bug summary

Without `availableHeight`, the model's native SQL editor loses its auto-size cap (`NativeQueryEditorRoot` uses `availableHeight = Infinity`, so `getMaxAutoSizeLines` → Infinity and `ResizableArea` maxHeight → Infinity). The editor grows to fit the entire query instead of ~40% of the container, overflowing its pane and pushing the Run button out of view. The e2e repro types 20 newlines and asserts the run button stays visible.

## 4. Outcome

`witness_authored` — the bug is unit-catchable in jsdom via the computed initial editor height (a pure function of `availableHeight` + query line count), so the e2e is replaceable at the unit level. Note the unit witness discriminates the same root cause via the *initial* height of a multi-line query rather than the e2e's type-to-grow path, but both stem from the identical `availableHeight`-missing mutation.

## 5. Confidence

High. The mutation is the exact inverse of the shipped fix's load-bearing change, and it flows through the real code path (`DatasetEditorInner` → `DatasetQueryEditor` spread → `NativeQueryEditor` → `getInitialEditorHeight`/`ResizableArea`). Verified FAIL-on-mutant (41rem) and PASS-on-clean (16rem) by reverting in place and re-applying (no stash). The 41rem value is deterministic (`getEditorLineHeight(40) = 40*16+16 = 656px = 41rem`), and the assertion has ~25rem of margin so it is not brittle.