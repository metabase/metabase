All carriers and the spec are confirmed deleted. This is a clean `dead_target`. No semantic revert is possible, so there is no diff to leave in the worktree (only the two untracked harness symlinks).

## Report — issue 34414 / fix ad9742cd413494583b02b35a94fa6e5b49f0cb52 / class all_specs_gone

### 1. git diff
None. No semantic revert was applied — every product-code carrier of the fix has been deleted from current `master`, so there is nothing to mutate. (Working tree contains only the two untracked harness symlinks `target` and `node_modules`.)

### 2. Oracle
No runnable oracle exists. The shipped discriminating jest spec `frontend/src/metabase/components/FieldValuesWidget/FieldValuesWidget.unit.spec.tsx` (which asserted `expect(fetchFieldValues).toHaveBeenCalledWith(field)` and `expect.objectContaining({ id, table_id })`) was **deleted** — it moved to `.../parameters/components/widgets/ParameterFieldWidget/FieldValuesWidget/FieldValuesWidget.unit.spec.tsx` and was then removed in its entirety (303 lines) by commit `01eb3ac384b` "Remove dead code from FieldValuesWidget (#56739)". No baseline, no reconstructed run.

### 3. failure_shape
N/A — no surviving spec to fail.

### 4. Confidence + adversarial
The fix touched four product-code sites; I traced each to its current state:

- **`frontend/src/metabase/entities/fields.js`** — the fix's core lived here (`fetchFieldValues` re-keyed its cache via `getUniqueFieldId({ id, table_id })` instead of bare `id`, fixing virtual-table field-id collisions). The **entire Fields entity was deleted** in commit `26884d55f90` "Remove fields entity (#74338)". `grep` confirms no `objectActions.fetchFieldValues` / `Fields.actions.fetchFieldValues` reference remains anywhere in `frontend/src`.
- **`FieldValuesWidget.tsx`** — the fix's `dispatch(Fields.objectActions.fetchFieldValues(field))` + `field.getUniqueId()` lines were removed as dead code by `01eb3ac384b`. The widget now fetches through `fetchParameterValues` / `fetchCardParameterValues` / `fetchDashboardParameterValues`, a different subsystem entirely.
- **`FormCategoryInput/CategoryRadioPicker.tsx`** — directory no longer exists.
- **`core/components/AccordionList/AccordionList.jsx`** — relocated to `common/components/AccordionList/AccordionList.tsx`; virtualization was ripped out (`isVirtualized = () => false`, no `_list.scrollToRow`), so the fix's `&& this.isVirtualized()` guard has no surviving code to protect.

A final grep for `fetchFieldValues` across `frontend/src` and `enterprise/frontend/src` matched **zero** spec files. There is no relocated/renamed descendant spec and no other jest spec exercising the changed logic — the behavior the bug lived in (field-entity value fetching keyed by unique id) has been architecturally removed, not merely refactored.

### 5. Outcome
`reconstruction_failed`, category **dead_target**. Both the product code path (Fields entity `fetchFieldValues` uniqueFieldId keying + the widget call site + the AccordionList virtualization guard) and the shipped jest spec were deleted by later refactors (#56739, #74338). Nothing remains to semantically revert. **Not closable with a new unit test at the original site** — the site is gone; field-values fetching is now handled by the parameter-values endpoints, and the virtual-table-collision concern the fix addressed no longer has a corresponding code path.