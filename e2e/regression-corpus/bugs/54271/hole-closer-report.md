Product file restored; only the spec changed. Hole closed.

## FE hole-closer report — issue 54271

### 1. Test added
`frontend/src/metabase/visualizations/lib/renderer_utils.unit.spec.ts` — augmented the existing discriminating test `"should exclude values that cannot be parsed according to the column type"` with two raw-array assertions inserted before the pre-existing Dayjs-filter step:

```diff
+    // The unparseable "abc" must be dropped entirely, not leaked as a null into
+    // xValues. Assert on the raw array so a leaked null flips the test.
+    expect(xValues).toHaveLength(2);
+    expect(xValues).not.toContain(null);
```

### 2. Level
Pure-function level. `getXValues` is a pure exported function in `renderer_utils.ts`; the spec calls it directly through the existing `getXValuesForRows` helper. The migration-drift `.filter((v): v is Dayjs => ...)` silently swallowed the leaked `null`, so I asserted on the raw `xValues` return value (before that filter) rather than removing the filter — a minimal, targeted addition matching sibling-test conventions.

### 3. Proof
- Clean HEAD: `Tests: 19 passed, 19 total`.
- Semantic revert applied (removed the `value != null` guard around `uniqueValues.add(value)` in `getXValues`): `Tests: 1 failed, 18 passed, 19 total`. Clean value assertion, not a compile error:
  ```
  expect(received).toHaveLength(expected)
  Expected length: 2
  Received length: 3
  Received array:  [null, "2019-01-02T00:00:00.000Z", "2019-01-03T00:00:00.000Z"]
  ```
  The leaked `null` (from `parseXValue("abc")` on the timeseries path) shows up at index 0.

### 4. Isolation
All 18 sibling tests stay green under the revert (including the null-exclusion tests for ordinal/histogram/timeseries, which never exercise this guard because actual-`null` rows are pre-filtered at line 120 via `canDisplayNull`). The failure is a pure value assertion (`toHaveLength`), no DOM, no compile error.

### 5. Outcome
`hole_closed`. Product file `renderer_utils.ts` restored to HEAD; `git diff --stat` lists only the spec file (4 insertions).