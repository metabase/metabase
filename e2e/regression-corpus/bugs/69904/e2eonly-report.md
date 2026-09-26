Both the product mutation and the witness are in place. Task complete.

## Report

### 1. git diff (product mutation)
Semantic revert of the load-bearing change in `frontend/src/metabase/data-studio/data-model/components/TableSection/components/TableAttributesEditSingle.tsx`:

```diff
-        {table.data_source === "metabase-transform" && (
-          <TransformLink table={table} />
-        )}
+        <TransformLink table={table} />
       </div>
     </TableSectionGroup>
   );
 }
 function TransformLink({ table }: { table: Table }) {
   const { transform } = table;
+  const shouldShowTransform =
+    transform !== undefined && table.data_source === "metabase-transform";
 
-  if (!transform) {
-    return (
-      <Box c="feedback-negative" className={S.transformLink} fz="sm"
-      >{t`Transform does not exist anymore`}</Box>
-    );
+  if (!shouldShowTransform) {
+    return null;
   }
```

This is the fix commit's product change reverted. The fix touched two files (pf=2), but the type-only change (`transform?: Transform` → `Transform | null` in `metabase-types/api/table.ts`) is **not** load-bearing at runtime — I left it as-is. The load-bearing change is the `TransformLink` guard: the old `transform !== undefined` check treats `null` as "present" (since `null !== undefined`), so a deleted-transform table (backend returns `transform: null`) falls through to `Urls.transform(transform.id)` and dereferences null.

### 2. Witness
New file: `.../TableSection/components/TableAttributesEditSingle.unit.spec.tsx`. Renders `TableAttributesEditSingle` with a table where `data_source: "metabase-transform"` and `transform: null`, asserting the "Transform does not exist anymore" placeholder renders.

- Oracle: `bun run test-unit-keep-cljs .../TableAttributesEditSingle.unit.spec.tsx`
- **PASS on clean HEAD**: placeholder text found, no crash.
- **FAIL on mutant**: `TypeError: Cannot read properties of null (reading 'id')` at `to={Urls.transform(transform.id)}` — the exact bug site, thrown during render.

### 3. Bug summary
When a transform is deleted, its output table persists with `data_source === "metabase-transform"` but the API now returns `transform: null`. The reverted code's `transform !== undefined` guard passes for `null`, so it renders the transform link and reads `transform.id`/`transform.name` on a null object, crashing the Data Model / Data Studio table view. The fix replaced the guard with `if (!transform)` (catching both null and undefined) and shows a "Transform does not exist anymore" message instead.

### 4. Outcome
`witness_authored` — the bug is unit-catchable. The crash is a pure null-dereference in component render logic, fully reproducible in jsdom via React Testing Library. The e2e is replaceable by this component test.

### 5. Confidence
High. The mutation is the faithful inverse of the fix commit's runtime change, and the witness fails at the identical line (`Urls.transform(transform.id)`) that the crash occurs on in production. The discriminator is clean: a thrown render error on the mutant vs. a rendered placeholder on clean HEAD — no compile error, no flakiness. The e2e's oracle ("Transform does not exist anymore" is visible) maps one-to-one to the unit assertion.