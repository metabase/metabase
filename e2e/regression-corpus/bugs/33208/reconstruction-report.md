Worktree is clean and restored. I have everything needed for the report.

---

## FE Reconstruction Report — issue 33208 / fix f40805b12c / class all_specs_gone

### 1. git diff
**none** (honest-negative). A verification over-revert was applied and then restored; the worktree is clean at HEAD.

The over-revert used for verification (in `frontend/src/metabase/query_builder/actions/querying.ts`, `queryCompleted`, exactly the pre-fix line):
```
- const originalQuestion = getOriginalQuestionWithParameterValues(getState());
+ const originalQuestion = getOriginalQuestion(getState());
```

### 2. Oracle
- Descendant of shipped spec: `frontend/src/metabase/parameters/utils/parameter-parsing.unit.spec.js` (the shipped `frontend/src/metabase/parameters/utils/parameter-values.unit.spec.js` split — parsing functions moved to `metabase/parameters/utils/parameter-parsing.ts`; the residual `parameter-values.js` relocated to `metabase-lib/v1/parameters/utils/`).
- Command (from worktree root): `bun run test-unit-keep-cljs frontend/src/metabase/parameters/utils/parameter-parsing.unit.spec.js frontend/src/metabase/query_builder/selectors.unit.spec.ts frontend/src/metabase-lib/v1/Question.unit.spec.js` and separately `.../query_builder/actions`.
- **Baseline (clean HEAD):** PASS.
- **Reconstructed (bug reintroduced via over-revert):** PASS — Tests: 0 failed, 381 passed (137 across parameter-parsing + selectors + Question; 244 across query_builder/actions). Oracle does **not** flip.

### 3. failure_shape
No jest failure exists. The oracle stays green with the bug present.

### 4. Confidence + adversarial
Two-part fix. Part one (the only jest edits it shipped) merely removed a **dead** `metadata` parameter from `getParameterValueFromQueryParams`/`getParameterValuesByIdFromQueryParams` — I confirmed from the pre-fix source that `metadata` was never read, so the spec edits were pure arity cleanup with zero behavioral assertion. Part two is the real fix: the new selector `getOriginalQuestionWithParameterValues` (now `selectors.ts:174`) wired into `queryCompleted` (`querying.ts:206`), so `isDirtyComparedTo` compares against an original `Question` constructed **with** parameter values — preventing the native default-valued parameter from making the question look dirty and auto-resetting the chart type (scalar → table).

That logic has **no jest coverage**: nothing in the repo references `queryCompleted` or `getOriginalQuestionWithParameterValues` from a spec. The verification over-revert fully neutralized the fix and tripped **zero** of 381 jest tests across every plausibly-affected suite (parameter parsing, QB selectors, Question dirtiness, all QB action thunks). The sole surviving regression guard is Cypress: `e2e/test/scenarios/visualizations-charts/visualizations-charts-reproductions.cy.spec.js:1021-1062` ("issue 33208" — asserts `scalar-value` stays visible on open and after save), relocated from the deleted `33208-auto-chart-type-after-save.cy.spec.js` (the `saveSavedQuestion` helper it added also survives).

### 5. Outcome
**reconstruction_failed — category: cypress_only.** The behavioral fix lives in a redux thunk + selector guarded only by an e2e test; the shipped jest spec's edits were non-discriminating (dead-param removal) and its surviving descendant tests parameter parsing, not the dirty-comparison bug.

**Closable with a new unit test:** yes, in principle. A `queryCompleted` redux-thunk unit test could dispatch it for a saved native question whose parameter default yields multi-row results and assert `display` is not reset from `scalar`. It is moderately involved (needs a mocked QB store with metadata, original card, and parameter values), but feasible — it would convert this cypress-only hole into a jest kill.