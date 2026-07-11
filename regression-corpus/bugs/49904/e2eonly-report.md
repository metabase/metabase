Task complete. Here is my report.

## 1. git diff (product mutation)

`frontend/src/metabase/query_builder/components/view/View/NotebookContainer/NotebookContainer.tsx`

```diff
-import { canShowNativePreview } from "../../ViewHeader/utils";
-
 import { NotebookNativePreview } from "./NotebookNativePreview";
@@
-  const renderNativePreview =
-    isShowingNotebookNativePreview &&
-    canShowNativePreview({ question, queryBuilderMode: "notebook" });
+  const renderNativePreview = isShowingNotebookNativePreview;
```

This is a semantic revert of the fix commit's product change. The fix commit `43d10c8` added a `canShowNativePreview({ question, queryBuilderMode })` guard to `NotebookContainer` so the native SQL preview panel is gated on the question's database having `native_permissions === "write"`. Reverting `renderNativePreview` to the persisted UI-control flag alone reintroduces the bug. (The extracted `canShowNativePreview` util and the `ToggleNativeQueryPreview.shouldRender` rename are refactors that don't affect behavior on their own — the observable bug lives entirely in this gating expression, so I left the util in place.)

## 2. Witness

New spec: `frontend/src/metabase/query_builder/components/view/View/NotebookContainer/NotebookContainer.unit.spec.tsx` (jsdom component test; mocks the heavy `Notebook` editor and the `NotebookNativePreview` data-fetching panel with marker divs so it asserts only on the container's gating branches).

Oracle command:
```
bun run test-unit-keep-cljs frontend/src/metabase/query_builder/components/view/View/NotebookContainer/NotebookContainer.unit.spec.tsx
```

- PASS on clean HEAD: both tests pass (2 passed).
- FAIL on mutant: the metabase#49904 test fails with
  `expect(element).not.toBeInTheDocument() … found <div data-testid="native-query-preview-sidebar" /> instead`.
  The positive-control test (native write permission → sidebar renders) still passes on both, confirming the witness discriminates the gating logic, not just presence.

The witness is left applied alongside the mutation.

## 3. Bug summary

When a user has previously opened the SQL preview sidebar (the `isShowingNotebookNativePreview` UI control persists across navigation), then opens the notebook editor for a question whose database lacks native write permission — e.g. a Usage Analytics / instance-analytics question — the native SQL preview sidebar still renders. It should never render for such questions. The e2e repro opens the preview on an Orders question, navigates to a Usage Analytics question, opens the editor, and asserts both the "View SQL" button and `native-query-preview-sidebar` are absent.

## 4. Outcome

`witness_authored` — the bug is unit-catchable. Although the fix shipped only a Cypress repro, the observable (does the sidebar render for a no-native-write-permission question) is a pure function of `question` + UI-control state and reproduces fully in jsdom by rendering `NotebookContainer`. The e2e is replaceable at the unit level.

## 5. Confidence

High. The mutation is the exact inverse of the fix commit's behavioral change at the same site, and the witness fails on it for the same reason the e2e would (sidebar renders when it must not). The positive-control case rules out a trivially-always-absent witness. The unit seam is solid because the gating decision reads only `getUiControls` state and the `question` prop — no routing, network, or browser geometry is involved; child components are mocked to markers so the test targets the container's decision, not downstream rendering. Note the fix commit's e2e navigates through real Usage Analytics collection routing to obtain such a question, but that routing is only the fixture path — the discriminating predicate itself (`native_permissions !== "write"`) is fully synthesizable in a unit test.