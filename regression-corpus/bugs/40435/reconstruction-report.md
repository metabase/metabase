# Reconstruction report — metabase#40435 (FE)

_Verbatim report (aa9ad14819b557a9c)._

---

Tree restored to clean state. Here is my report.

## reconstruction_failed — category: dead-target

### Summary
Bug metabase#40435 ("new query columns should be visible by default"). The fix (f41cd82) changed `getColumnItems` in `utils.ts` from *iterating over `columns`* (synthesizing disabled settings for unmatched columns, then sorting by setting index) to *iterating over `columnSettings`*, and moved the "surface missing columns as enabled" logic up into `column.js`/`column.ts` `getValue`. In the named oracle spec, the fix's edit was a **pure deletion** of one test, not an added/modified assertion — which breaks the task's premise.

### 1. What the fix did to the oracle spec
`git show` on `TableColumnPanel.unit.spec.tsx` shows the fix **removed** this test (and added nothing):
```
-  it("should display columns without matching setting", () => {
-    setup({ columnSettings: [] });
-    ... expect(items).toHaveLength(4); // ID, Total, Tax, Subtotal
```
This test asserted the **buggy** behavior (empty settings → all 4 columns still shown). Its polarity is *passes-under-bug / fails-under-fix* — the inverse of what a reintroduction needs. It was deleted precisely because the fixed code returns 0 items for empty settings.

### 2. Oracle results
- Baseline (clean/fixed tree): `Tests: 6 passed, 6 total` ✅
- Reconstructed (faithful bug reintroduction in `getColumnItems`: iterate over `columns`, push synthetic `{enabled:false}` for unmatched, sort by setting index, details-only filter retained): `Tests: 6 passed, 6 total` — **still all pass**. No assertion fails.

### 3. failure_shape
None. The reintroduced bug produces byte-identical output for every current test because all 6 tests use fully-matching `columns`/`columnSettings` (4 columns, 4 matching settings). The buggy and fixed algorithms diverge only when columns and settings differ (columns without settings, or settings without columns) — the exact case the deleted test covered. No remaining assertion exercises that divergence.

### 4. Confidence + adversarial reasoning
High confidence this is a dead target. Adversarial checks performed:
- Tried the faithful historical algorithm (not `git apply -R`) adapted to the current API/details-only feature → all pass empirically, not just by reasoning.
- Verified the "order of setting" test cannot discriminate: for matching columns, sort-by-setting-index yields the same order (Total, ID, Tax, Subtotal) as mapping over settings.
- Checked the sibling spec `column.unit.spec.ts` `table.columns` block — its only getValue test targets a *different, later* issue (#76136 stale-setting filtering), not #40435's "surface new column as enabled." So the fix's real behavior isn't asserted there either.
- Confirmed `findColumnSettingIndexesForColumns` still exists in `metabase-lib`, so the revert was mechanically possible — the failure is oracle-coverage, not a moved/deleted target.

### 5. reconstructable?
Not within the given oracle. The one discriminating assertion was deleted by the fix itself and has inverted polarity (asserts buggy behavior). Reintroducing the bug and making an assertion FAIL would require **writing a new assertion** (e.g. `setup({columnSettings: []})` → `expect(items).toHaveLength(0)`), which fabricates an oracle rather than using the fix's assertions. The named product file `column.js` is now `column.ts` and its `getValue` has drifted onto a different issue (#76136); reverting it would fail the #76136 test, not a #40435 one.

Relevant files:
- `/Users/fraser/Documents/code/metabase/.claude/worktrees/agent-aa9ad14819b557a9c/frontend/src/metabase/visualizations/components/settings/ChartSettingTableColumns/TableColumnPanel/TableColumnPanel.unit.spec.tsx` (oracle — bug-sensitive test deleted by fix)
- `/Users/fraser/Documents/code/metabase/.claude/worktrees/agent-aa9ad14819b557a9c/frontend/src/metabase/visualizations/components/settings/ChartSettingTableColumns/TableColumnPanel/utils.ts` (restored clean)
- `/Users/fraser/Documents/code/metabase/.claude/worktrees/agent-aa9ad14819b557a9c/frontend/src/metabase/visualizations/lib/settings/column.ts` (getValue drifted to issue #76136)

Tree is clean (`git diff --stat` empty).
