Worktree restored to pristine (clean `git diff`). Here is my final report.

---

## Regression-corpus FE reconstruction — issue 49642

Fix commit `79858b9` ("Allow searching a single select list picker", PR #49739). Target class `all_specs_gone`.

### 1. git diff
**none.** The worktree is clean (the product file was restored after the verification over-revert described in §4). This is a negative outcome, so no semantic revert is retained.

### 2. Oracle
- **Spec (relocated descendant):** `frontend/src/metabase/parameters/components/widgets/ParameterFieldWidget/FieldValuesWidget/SingleSelectListField/SingleSelectListField.unit.spec.tsx`
  - Shipped as `frontend/src/metabase/components/SingleSelectListField/SingleSelectListField.unit.spec.js`; relocated `.js`→`.tsx` and moved under `parameters/.../ParameterFieldWidget/FieldValuesWidget/`.
- **Command:** `bun run test-unit-keep-cljs <spec-path>` (run from worktree root; note the runner's glob also sweeps stale sibling worktrees — I scoped results to my worktree's relative path).
- **Baseline (clean HEAD):** PASS — 1 suite, 5 tests passed.
- **Reconstructed (aggressive over-revert applied):** PASS — 1 suite, 5 tests passed. **The oracle did NOT flip.**

### 3. failure_shape
None. No test transitioned to a value/DOM assertion failure under the over-revert.

### 4. Confidence + adversarial
The commit's real regression protection for 49642 is the **Cypress e2e repro** in `e2e/test/scenarios/filters-reproductions/filters-reproductions.cy.spec.js` ("should allow searching for more values when the filter contains more than 1000 values"). That scenario needs a live dashboard, a >1000-value field (PEOPLE.NAME), and server-side value search — none of which the jest layer exercises.

The jest edits the commit shipped were all **non-discriminating**:
- SingleSelectListField spec: a `setup()` helper refactor + renamed test titles (no new behavioral assertion).
- ListField spec: `waitFor(...)` wrapping (flake-fix).
- FieldValuesWidget spec: `getByText`→`findByText` (async flake-fix).

I verified the negative with an **aggressive over-revert** of every client-side 49642 behavior in the current `SingleSelectListField.tsx`: removed the `isFilterInValues` early-return (the "pick another value after selecting" fix), stripped `setFilter(selectedOption)` from `onClickOption`, and reduced `handleFilterChange` to just `setFilter` (dropping `onChange([])` / `setSelectedValue(null)` / `onSearchChange`). This fully neutralizes the fix — yet all 5 tests still passed. The surviving tests (`displays search input`, `displays options`, and three non-string-duplicate tests) target `createOptionsFromValuesWithoutOptions` / basic filtering — logic from *other* commits, with `value: []` so `isFilterInValues` never fires. The spec passes `onSearchChange={jest.fn()}` but never asserts on it; a repo-wide grep found no jest spec asserting `onSearchChange`, `isFilterInValues`, or the pick-another-value behavior (the only other `onSearchChange` hits are in the unrelated MultiAutocomplete component).

### 5. Outcome
**reconstruction_failed — category: cypress_only.**

The bug's protection is exclusively a Cypress e2e test; the shipped jest edits carried zero discriminating behavioral assertions, and no surviving jest spec exercises the changed logic.

**Closable with a new unit test: yes.** The two core behaviors are pure client-side and jest-testable without a server: (a) after clicking an option the search box populates yet the full option list still renders (the `isFilterInValues` guard — assert siblings remain in the DOM), and (b) typing in the search calls `onSearchChange` and clears the current selection. Either would convert this hole into a kill.