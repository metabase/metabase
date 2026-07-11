Both the product mutation and the witness spec are in place. Task complete.

## Report

### 1. git diff (product mutation)
The fix commit (`515c93f`) drifted: the file was converted `.jsx`→`.tsx` and moved to `frontend/src/metabase/querying/components/NativeQueryEditor/DataSourceSelectors/DataSourceSelectors.tsx`. Semantic revert applied at the mutation site:

```diff
-      isInitiallyOpen={database == null && databases.length > 1}
+      isInitiallyOpen={database == null}
```

This is the exact inverse of the fix — dropping the `databases.length > 1` guard so the database picker auto-opens whenever no database is selected, regardless of how many databases exist.

### 2. Witness — `witness_authored`
New spec: `frontend/src/metabase/querying/components/NativeQueryEditor/DataSourceSelectors/DataSourceSelectors.unit.spec.tsx`

It renders `DataSourceSelectors` with a fresh native query (`database: null`), builds `Question`/`NativeQuery` from mock metadata, and mocks the databases + search endpoints. Two cases:
- single database → asserts the picker does **not** auto-open (`queryByText("Sample Database")` absent; only the "Select a database" trigger shows)
- multiple databases → asserts it **does** auto-open (lists "Sample Database" + "QA Postgres12")

Oracle command: `bun run test-unit-keep-cljs frontend/.../DataSourceSelectors.unit.spec.tsx`

- **Clean HEAD:** both tests PASS.
- **Mutant:** single-database test FAILS —
  `expect(element).not.toBeInTheDocument() ... found <div ...>Sample Database</div>` (picker auto-opened). Multi-database test still PASSES, confirming the assertion is a precise discriminator, not a blanket break.

### 3. Bug summary
When opening the native query editor with no database preselected and only one database exists, the database picker popover pops open automatically (unwanted UX). The e2e repro checks that with one DB no `dialog` popover appears, and with multiple DBs the popover does appear.

### 4. Outcome
`witness_authored` — the bug is unit-catchable, so the e2e is replaceable at the unit level. The auto-open behavior is driven entirely by the `isInitiallyOpen` prop computed at the mutation site and is observable in jsdom via the popover's rendered database list; no real-browser layout/geometry, routing, or network was required.

### 5. Confidence
High. The mutation is the literal semantic inverse of the shipped fix at the same expression that controls popover auto-open. The witness renders through the real connected `DataSourceSelectors` → `DatabaseDataSelector` → `DataSelector` chain (the same components the e2e exercises), and its two assertions mirror the two e2e cases exactly (single-DB: no popover; multi-DB: popover with both DB names). The clean-pass / mutant-fail split with the multi-DB case unaffected proves the assertion isolates the reintroduced behavior.