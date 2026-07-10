The diff is left in the worktree. Here is my final report.

---

## 1. git diff (the semantic revert)

```diff
diff --git a/frontend/src/metabase/dashboard/components/QuestionPicker/QuestionList.tsx b/frontend/src/metabase/dashboard/components/QuestionPicker/QuestionList.tsx
@@ -89,7 +89,7 @@ export function QuestionList({
           models: isEmbeddingSdk() // FIXME(sdk): remove this logic when v51 is released
             ? ["card", "dataset"] // ignore "metric" as SDK is used with v50 (or below) now, where we don't have this entity type
-            : ["card", "dataset", "metric"],
+            : ["card", "dataset"],
```

File: `/Users/fraser/Documents/code/metabase/.claude/worktrees/agent-a7a8c362b23d21b9e/frontend/src/metabase/dashboard/components/QuestionPicker/QuestionList.tsx`

This reintroduces the pre-Metrics-V2 bug behavior: the dashboard "add card" question picker no longer requests the `metric` model type, so metric cards are invisible/unsearchable when adding a card to a dashboard. The commit's exact change was `["card","dataset"]` → `["card","dataset","metric"]` at this call site (product logic drifted: originally one models list, now two RTK-query call sites gated by an `isEmbeddingSdk()` conditional — I reverted the non-SDK search branch that the oracle exercises).

## 2. Oracle

- Spec: `frontend/src/metabase/dashboard/components/AddCardSidebar/AddCardSidebar.unit.spec.tsx` (original path — no relocation)
- Command (from worktree root): `bun run test-unit-keep-cljs frontend/src/metabase/dashboard/components/AddCardSidebar/AddCardSidebar.unit.spec.tsx`
- Baseline (clean HEAD): **PASS — Tests: 12 passed, 12 total**
- Reconstructed (mutation applied): **FAIL — Tests: 3 failed, 9 passed, 12 total**

## 3. failure_shape

Failing tests (the 3 search-path tests):
- `AddCardSideBar › dashboards in the root collection (public collection) › should search questions only in public collections`
- `AddCardSideBar › dashboards in public collections › should search questions only in public collections`
- `AddCardSideBar › dashboards in personal collections › should search all questions`

Assertion mismatch: each sets up a fetch-mock for `/api/search` keyed on `models: ["card","dataset","metric"]`, then asserts `await screen.findByText(questionInPublicCollection.name)` is in the document. With the revert, the component issues `GET /api/search?q=dashboard&models=card&models=dataset&…` (no `metric`), which no longer matches the mock. The searched-for question never renders, and `findByText` fails to locate it — a genuine DOM/value assertion failure driven by the changed request payload, not a compile/import error.

## 4. Confidence + adversarial

High. Isolation is clean: only the 3 tests that type into the search box and hit the search endpoint fail. The 9 that stay green include list-mode "should show all questions" (uses `useListCollectionItemsQuery`, a different call site I deliberately left untouched), "should render no items", collection-tree tests, and the New Question/SQL button tests — none of which assert on the search models list. The failure therefore pinpoints exactly the reverted line, not a blunt module break.

## 5. Outcome

**kill.** Surviving discriminating jest oracle is `AddCardSidebar.unit.spec.tsx` (same path; the product logic it guards drifted from one models array into two SDK-gated call sites). Closable and already closed by an existing unit test — no new test needed.

Note on the broader target: this is class `partial` — all 5 issues (42656, 42575, 42470, 42360, 42130) funnel to the same giant "Metrics V2" introducer commit (237 product files), and its FE behavior is overwhelmingly Cypress-guarded (it added `metrics-editing.cy.spec.js` +791, `metrics-collection`, `metrics-dashboard`, `metrics-question`, `metrics-search`). I surveyed all 10 surviving `live_specs`: most of the commit's jest edits were pure deletions of legacy-metric coverage (initializeQB metric-param tests, selectors/metadata metrics-count, Metadata `metricsList`, AggregationPicker's entire metrics section) or non-behavioral mock/label renames (TypeFilter/SearchApp `metric: "Metric"`). Grep confirmed no surviving jest spec references `availableMetrics`/`isMetricBased`/`getMetricListItem`/`aggregationPosition`. The AddCardSidebar `models: [...,"metric"]` assertion is the one genuinely-behavioral, still-present, jest-discriminating survivor — so I reconstructed against it and got a clean kill.