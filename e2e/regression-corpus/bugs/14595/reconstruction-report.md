The reconstruction succeeded. Here is the final report.

## 1. git diff (semantic revert)

Left in the worktree at `frontend/src/metabase/dashboard/components/ParameterLinkedFilters/utils.ts`:

```diff
@@ -65,7 +65,7 @@ function getParametersInfoForMapping(
       parameter,
       filteredIds: Array.from(new Set(filteredIds)),
       filteringIds,
-      isCompatible: filteredIds.length > 0 && filteringIds.length > 0,
+      isCompatible: true,
     };
```

The fix (#59084, "Show only valid linked filters in dashboards") introduced compatibility gating so a dashboard filter only offers *other* filters it can actually be linked to. The `isCompatible` flag is that gate. Forcing it to `true` reintroduces the bug's behavior: incompatible parameters (no shared filterable fields) get surfaced as valid linked filters.

## 2. Oracle

- **Spec (relocated):** `frontend/src/metabase/dashboard/components/ParameterLinkedFilters/utils.unit.spec.ts`
  Relocated from the shipped path `frontend/src/metabase/parameters/components/ParameterLinkedFilters/utils.unit.spec.ts` (moved `parameters/` → `dashboard/`; only the `checkNotNull` import path changed, `metabase/lib/types` → `metabase/utils/types`). `utils.ts` itself is byte-identical to the shipped fix.
- **Command:** `bun run test-unit-keep-cljs <spec>` (the wrapper's `jest --maxWorkers=4`; had to run jest directly with `--max-old-space-size=8192` because the deep-equality diff over large `Field` objects blows the default node heap — an environmental OOM, not a test failure).
- **Baseline (clean HEAD):** PASS — Tests: 4 passed, 4 total.
- **Reconstructed (mutation applied):** FAIL — Tests: 1 failed, 3 passed, 4 total.

## 3. failure_shape

Failing test: `getLinkedParametersInfo › should return linked parameters with fields info`.

```
expect(received).toEqual(expected) // deep equality
    -     "isCompatible": false,
    +     "isCompatible": true,
```

Parameter `p5` (fields: `PEOPLE.ID`, absent from the filtering map) is expected to be `{ filteredIds: [], filteringIds: [], isCompatible: false }` but the mutated code reports `isCompatible: true`.

## 4. Confidence + adversarial

High confidence this isolates the reverted behavior. The three `getFilterFieldsRequest` sub-cases stay green (that function is untouched by the mutation), and four of the five parameter objects in the `getParametersInfo` case still deep-equal — only `p5`, the genuinely-incompatible parameter, flips. The failure is a single-field value mismatch (`false` → `true`), not a compile/import error or a blunt whole-object break, so it pinpoints exactly the compatibility gate the fix added.

## 5. Outcome

**kill** — with oracle relocation noted (`metabase/parameters/components/…` → `metabase/dashboard/components/…`, and `checkNotNull` import repath). The historical bug is caught by a surviving discriminating jest spec that exercises the changed product logic directly with pure value assertions. No new test needed; the regression is already unit-covered.