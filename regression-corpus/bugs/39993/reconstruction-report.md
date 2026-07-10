The diff is captured. Here is my final report.

---

## 1. git diff — the semantic revert

```diff
diff --git a/frontend/src/metabase/querying/viz-settings/utils/sync-viz-settings.ts
@@ -134,7 +134,7 @@ function syncColumns<T>({
     if (!oldKey) {
       settings.push(setting);
     } else if (newName) {
-      settings.push(setColumnName(setting, newName));
+      settings.push(setting);
     }
```

One-line semantic revert. The fix's second, load-bearing half was `syncTableColumnNames` — id/key-based rename tracking so a `table.columns` setting *follows* its column when the column is renamed (needed precisely because the fix stopped matching on field refs). In the current rewrite that lives in the shared `syncColumns` helper: a setting is matched to its old column by name, the old column's stable `key` is looked up, and the setting's name is rewritten to whatever name that key now carries. Dropping the `setColumnName(setting, newName)` application reintroduces the pre-fix behavior: settings keep their stale name and never track the renamed column.

## 2. Oracle

- Spec: `frontend/src/metabase/querying/viz-settings/utils/sync-viz-settings.unit.spec.tsx` (relocated + `.ts`→`.tsx` descendant of the shipped `frontend/src/metabase/visualizations/lib/sync-settings.unit.spec.ts`; product logic moved from `visualizations/lib/sync-settings.ts` + `metabase-lib/v1/queries/utils/dataset.ts` into `querying/viz-settings/utils/sync-viz-settings.ts`).
- Command (from worktree root): `bun run test-unit-keep-cljs frontend/src/metabase/querying/viz-settings/utils/sync-viz-settings.unit.spec.tsx`
- Baseline (clean HEAD): PASS — Tests: 20 passed / 20.
- Reconstructed (mutation applied): FAIL — Tests: 9 failed / 11 passed / 20.

## 3. failure_shape

Primary discriminating test: `syncVizSettings › table.columns › should handle adding new columns with column.name changes` (the direct descendant of the shipped "should handle name changes when a column with a duplicate name is added and ids are available").

```
expect(received).toEqual(expected) // deep equality
  Expected: [{name:"ID",enabled:true}, {name:"ID_3",enabled:false}, {name:"ID_2",enabled:true}]
  Received: [{name:"ID",enabled:true}, {name:"ID_2",enabled:false}]
```

The `ID_2` setting kept its stale name instead of following its column (key `PEOPLE__ID`) to the new name `ID_3`, and the new duplicate-named column was not added. This is exactly the #25885 / #39993 user-facing bug (self-join / custom-expression model columns losing their viz settings on rename/reorder). Clean value mismatch, not a compile/import error.

## 4. Confidence + adversarial

High confidence the failure isolates the reverted behavior. All 9 failures are rename-tracking tests ("…with column.name changes" across `table.columns`, `column_settings`, `graph.metrics`, `pivot_table`) plus the aggregation-rename variant — every case where a setting must follow a column whose name changed. The behavior-adjacent siblings stay green, proving it's not a blunt break:
- `should not update the setting if the order of columns has changed` (no-op) — green
- `should preserve settings for columns not present in both` (drop path, `!oldKey`) — green
- `should not create duplicate entries … (metabase#54547)` (pure addition, no rename) — green
- `should handle adding new columns without column.name changes` (series/native, name==key) — green
- error-guard and native-metric-ignore cases — green

The blast radius is intrinsic: `syncColumns` is the single shared helper for all five viz-setting types, so one edit correctly reintroduces the bug wherever rename-tracking applies. The mutation touches only the rename-apply branch and leaves the drop/keep/add branches untouched, which is why non-rename tests are unaffected.

## 5. Outcome

`kill`. The load-bearing behavioral fix (name-based matching + id/key rename tracking) survives in a relocated, refactored jest spec (`sync-settings.unit.spec.ts` → `querying/viz-settings/utils/sync-viz-settings.unit.spec.tsx`; product moved out of `metabase-lib/.../dataset.ts` + `visualizations/lib/sync-settings.ts` into `querying/viz-settings/utils/sync-viz-settings.ts`). The oracle passes clean and fails with a deterministic deep-equality mismatch under the semantic revert. No new unit test needed — existing coverage is discriminating. Diff left in the worktree.