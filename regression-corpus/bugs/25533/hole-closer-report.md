Only the spec file changed (27 insertions), format passes, product file restored to HEAD. Task complete.

## Report

### 1. Test added
`frontend/src/metabase/dashboard/actions/parameters.unit.spec.ts`

```diff
   setParameterMapping,
   setParameterType,
+  setParameterValue,
 } from "./parameters";
```
```diff
+describe("setParameterValue", () => {
+  it("should normalize an emptied value to null (metabase#25533)", async () => {
+    const store = setup(
+      createMockState({
+        dashboard: createMockDashboardState({
+          dashboardId: 1,
+          dashboards: {
+            "1": createMockStoreDashboard({
+              id: 1,
+              parameters: [createMockParameter({ id: "123" })],
+            }),
+          },
+          parameterValues: {
+            "123": ["A", "B"],
+          },
+        }),
+      }),
+    );
+
+    await store.dispatch(setParameterValue("123", []));
+
+    const state = store.getState();
+    expect(state.dashboard.parameterValues["123"]).toBe(null);
+  });
+});
```

### 2. Level
Thunk level. The test dispatches the real `setParameterValue` thunk through the mock store (`getMainStore`) and asserts the resulting reducer state — matching the sibling `setOrUnsetParameterValues` block's conventions exactly (`setup`, `createMockState`, dispatch, read `store.getState().dashboard.parameterValues`). `PULSE_PARAM_EMPTY === null`, so the report's "null equivalently the empty sentinel" collapses to a single `toBe(null)` assertion. Seeded an existing `["A","B"]` value so the clearing is observable.

### 3. Proof
- Clean HEAD: PASS — `Tests: 16 passed, 16 total`.
- Reverted fix (removed empty→null normalization; bare `value` pass-through at `parameters.tsx:825-837`): FAIL — `Tests: 1 failed, 15 passed, 16 total`, with the clean value assertion:
  ```
  expect(received).toBe(expected)
  Expected: null
  Received: []
  ```

### 4. Isolation
All 15 sibling tests (`setParameterType`, `setParameterIsMultiSelect`, `removeParameter`, `setParameterMapping`, `setOrUnsetParameterValues`) stayed green under the revert. The only failure is my new test, and it is a value assertion (`Expected: null / Received: []`), not a compile/DOM error.

### 5. Outcome
`hole_closed`. Product file `parameters.tsx` restored to HEAD; `git diff --stat` lists only the spec file (1 file, 27 insertions); `lint-format-pure` passes.