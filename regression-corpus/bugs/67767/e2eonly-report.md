Both are in place and verified. Final report below.

## 1. git diff (product mutation)

Semantic revert of fix `ba0ddc9` in `frontend/src/metabase/query_builder/components/view/View/NotebookContainer/NotebookContainer.tsx`. The fix replaced a too-aggressive 1280px breakpoint (`useNotebookScreenSize`, since deleted) with `useIsSmallScreen()` (640px). I reintroduce the too-aggressive threshold by swapping `useIsSmallScreen()` for `useMedia("(max-width: 80em)")` (80em = 1280px):

```diff
-import { useWindowSize } from "react-use";
+import { useMedia, useWindowSize } from "react-use";
-import { useIsSmallScreen } from "metabase/common/hooks/use-is-small-screen";
...
-  const shouldShowFullWidthNativePreview = useIsSmallScreen();
+  const shouldShowFullWidthNativePreview = useMedia("(max-width: 80em)");
```

I did not touch the shared `use-is-small-screen.ts` hook (used by 7 other components) — the mutation is localized to the buggy component, matching the original fix's blast radius.

## 2. Witness

Added `frontend/src/metabase/query_builder/components/view/View/NotebookContainer/NotebookContainer.unit.spec.tsx`. It renders `NotebookContainer` with a `matchMedia` mock resolving `max-width` queries against a fixed 900px viewport (below the buggy 1280px breakpoint, above the correct 640px one), mocks the heavy children (`Notebook`, `NotebookNativePreview`) and `canShowNativePreview`, and asserts the resizable layout is used by checking for the resize-handle testid:

```tsx
setup({ viewportWidth: 900 });
expect(screen.getByTestId("notebook-native-preview-resize-handle")).toBeInTheDocument();
```

Oracle command (from worktree root):
`bun run test-unit-keep-cljs .../NotebookContainer/NotebookContainer.unit.spec.tsx`

- PASS on clean HEAD: resize handle present at 900px (`✓ ... (30 ms)`).
- FAIL on mutant: full-width branch renders (`<div style="position: absolute; inset: 0rem;">` wrapping the preview, no handle); `getByTestId` throws — "Unable to find an element by: [data-testid="notebook-native-preview-resize-handle"]".

## 3. Bug summary

The "SQL for this question" native-query side panel jumps to 100% width far too early. On medium viewports (640px–1280px, e.g. a 900px or 1000px window) the panel takes over the whole width and hides the notebook, instead of remaining a resizable sidebar. Full-width should only kick in below 640px. This is exactly issue #67767 ("the breakpoint … is too aggressive").

## 4. Outcome

`witness_authored` — the bug is unit-catchable. The behavior is a pure breakpoint decision (`shouldShowFullWidthNativePreview`) that selects between a full-width `Box` and a `ResizableBox` in the same component's render, discriminable in jsdom by mocking `matchMedia`. No real browser layout/geometry is required.

Note: the shipped Cypress repro at viewport 630px does NOT actually discriminate this mutation — at 630px both the buggy (1280) and fixed (640) thresholds yield full-width, so the e2e passes on the mutant. My witness deliberately tests a medium viewport (900px), which is where the bug is actually observable. The unit witness is therefore a strictly better regression guard than the shipped e2e for this bug.

## 5. Confidence

High. The mutation reproduces the reported behavior faithfully: 80em/1280px is the exact original breakpoint named in the issue and present in the fix commit's parent (`use-notebook-screen-size.ts`, `BREAKPOINT = 1280`). The witness cleanly separates clean (PASS) from mutant (FAIL) via an assertion on rendered DOM structure, not a compile error — confirmed by running both states (stash out / stash pop). The e2e-discrimination gap is a property of the shipped test's viewport choice, not of the mutation.