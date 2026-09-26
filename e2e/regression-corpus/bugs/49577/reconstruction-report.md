Worktree is clean. Here is my report.

## Reconstruction report — issue 49577, class `all_specs_gone`

### 1. git diff
**none** (negative outcome — see below). No semantic revert is possible: the fix's product logic and its discriminating spec were both deleted from HEAD by a later deliberate rollback.

### 2. Oracle
- Shipped spec: `frontend/src/metabase/components/SingleSelectListField/SingleSelectListField.unit.spec.js` (test `does not display options`, added by the fix).
- Surviving relocated descendant: `frontend/src/metabase/parameters/components/widgets/ParameterFieldWidget/FieldValuesWidget/SingleSelectListField/SingleSelectListField.unit.spec.tsx` (`.js`→`.tsx`, moved `metabase/components/…` → `metabase/parameters/components/widgets/ParameterFieldWidget/…`).
- Command (from worktree root): `bun run test-unit-keep-cljs <spec-path>`
- **Baseline (clean HEAD):** PASS — Tests: 5 passed, 5 total.
- **Reconstruction:** not achievable — nothing to reintroduce; see outcome.

### 3. failure_shape
No discriminating oracle exists. The fix's regression test (`does not display options when alwaysShowOptions is false`) was **deleted**, so there is no test that fails when the bug is present. Conversely, when I probe by re-applying the fix's gate (`debouncedFilter.length > 0 && filteredOptions.map(...)`) to current product code, the surviving spec fails 4/5 — e.g. `displays options` expects `getByText("AK")` present with an empty filter. That proves the surviving tests **lock in the rolled-back (buggy) behavior**, the opposite of protecting the fix.

### 4. Confidence + adversarial
High confidence this is a dead target.
- `git log -S alwaysShowOptions` on the type file shows exactly two commits: the fix `9bd17d2` (#49577) and `b7950cd10e4` "**Partial rollback of FieldValuesWidget to v50**" (#51183, same author, ~1 month later).
- #51183 explicitly removed the `alwaysShowOptions = false` param, removed the `(alwaysShowOptions || debouncedFilter.length > 0) &&` render gate (reverting to unconditional `filteredOptions.map`), and **deleted the `does not display options when alwaysShowOptions is false` test**. HEAD's `SingleSelectListField` now unconditionally renders all options when the filter is empty — i.e. the pre-fix behavior is the intended current behavior at this level.
- The `alwaysShowOptions` name still exists at HEAD but only in `FieldValuesWidget.tsx` as a semantically different, focus-based gate (`if (alwaysShowOptions || isFocused)`, default `true`) — unrelated to #49577's "hide until the search filter has a value" semantics.
- Over-revert verification: applying the fix's gate trips only tests that assert the visible-by-default behavior (the very behavior the rollback restored); no test asserts the fix's hidden-until-filtered behavior. There is nothing to reintroduce and no spec to flip.

### 5. Outcome
**reconstruction_failed — category: dead_target.** The fix (#49577) was intentionally reverted by #51183; both the changed product logic (the `debouncedFilter.length > 0` render gate in `SingleSelectListField`) and the discriminating jest test were deleted by that rollback, and the current product behavior deliberately matches the pre-fix state.

Not closable with a new unit test against current code — a test encoding #49577's expectation (`does not display options` when filter empty) would directly contradict the maintainer's intended v50 behavior and would fail on HEAD. The behavior is a resolved product decision, not an open regression hole.

Worktree left clean (`git diff` empty).