Task complete. Both the product mutation and the witness are left applied in the worktree.

## Report

### 1. git diff (product mutation)
File: `frontend/src/metabase/visualizations/visualizations/PivotTable/PivotTableInner.tsx` (the fix has drifted here from `PivotTable.tsx` where it originally landed).

```diff
-        return tc(getTitleForColumn(column, settings));
+        return getTitleForColumn(column, settings);
```

Semantic revert of fix commit df7ba12: the `getColumnTitle` callback no longer passes the column title through the content-translation function `tc` (from `useTranslateContent`). `tc` remains defined/imported and in the dep array, so this is a minimal behavioral revert, not a mechanical one.

### 2. Witness
New spec: `frontend/src/metabase/visualizations/visualizations/PivotTable/PivotTable.content-translation.unit.spec.tsx`

It `jest.mock`s `metabase/content-translation/hooks` so `useTranslateContent` returns a `tc` that maps the row-header column title `"field-123"` to `"le-champ-traduit"`, renders `PivotTableTestWrapper`, and asserts the translated string appears in the pivot row header (and the untranslated one does not). react-virtualized offsetHeight/offsetWidth are stubbed as in the existing spec.

Oracle: `bun run test-unit-keep-cljs frontend/src/metabase/visualizations/visualizations/PivotTable/PivotTable.content-translation.unit.spec.tsx`
- PASS on clean HEAD (`tc(...)` wrapping present): title renders as `le-champ-traduit`.
- FAIL on mutant: `Unable to find an element with the text: le-champ-traduit` — the header renders `field-123` instead.

### 3. Bug summary
Custom pivot-table column titles (row-header labels set via `column_title` / column display names) are rendered without applying the content-translation dictionary. On an embedded dashboard with a locale + translation dictionary, a renamed pivot column such as "Category" → "La catégorie" stays untranslated. This is exactly what the e2e (grep `metabase#63296`) checks: it expects `La catégorie` in the embedded dashboard card.

### 4. Outcome
`witness_authored` — the bug is unit-catchable. The translation seam (`tc(getTitleForColumn(...))`) is exercised by rendering the pivot table with a mocked translate hook and asserting on the header cell text in jsdom; no real browser, routing, layout geometry, or network is required.

### 5. Confidence
High. The mutation is the exact inverse of the shipped one-line fix, at the same logical site (drifted file). The witness discriminates cleanly (assertion failure, not a compile/runtime error): passes on clean, fails on mutant, and the failure message directly reflects the untranslated title. The witness is a faithful unit-level stand-in for the e2e's "translated custom pivot column title appears" assertion.