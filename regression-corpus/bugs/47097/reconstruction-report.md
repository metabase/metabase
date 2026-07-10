The file is restored to original. Tree is clean. Here is my report.

## Reconstruction result: honest-negative (no surviving discriminating jest spec)

### (1) The behavioral change
Fix commit `a283c947` (PR #63074) "Fix filtering on questions after dashboard drills when there are no perms to create queries" threads primitive `cardId`/`dashboardId`/`dashcardId` down through the parameter component tree instead of full `Question`/`Dashboard` objects. The load-bearing logic change is in the field-values endpoint selection at `.../ParameterFieldWidget/FieldValuesWidget/utils.ts`:

```
- canUseCardEndpoints(question?)      => question?.isSaved()
+ canUseCardEndpoints(cardId?)        => cardId != null
- canUseDashboardEndpoints(dashboard?) => !isTransientId(dashboard?.id) && dashboard?.id
+ canUseDashboardEndpoints(dashboardId?) => dashboardId != null && !isTransientId(dashboardId)
```
Plus `Question.getDashboardProps()` (new) and `services.js` using it, so a drilled ad-hoc question's `card.dashboardId` reaches the widget and the dashboard param-values endpoint is used even without query-creation perms.

### (2) The two jest specs the commit touched are both non-discriminating
- `DataModel.unit.spec.tsx`: only change is `getByText`→`findByText` (line ~883). Pure flake fix ("Fix flaky test" sub-commit) in a page whose product code the commit never touches. Reverting the product change cannot affect it.
- `ResponsiveParameterList.unit.spec.tsx` (now at `frontend/src/metabase/querying/components/`): only a prop rename `question`→`cardId` in `setup`. It asserts filter-button visibility based on `parameters` only — no endpoint/cardId/dashboardId assertion. Baseline: `Tests: 3 passed, 3 total`.

### (3) No other jest spec exercises the change either
The endpoint-selection helpers (`canUseCardEndpoints`/`canUseDashboardEndpoints`) have no direct unit test (`FieldValuesWidget/utils.unit.spec.tsx` covers only `isSearchable`/`getValuesMode`/`searchField`/placeholder). Component specs that render `ParameterFieldWidget`/`ParameterValueWidget` use the generic `setupParameterValuesEndpoints` mock and never pass `cardId`/`dashboardId`.

### (4) Empirical proof (adversarial over-revert)
I applied an aggressive semantic revert forcing **both** helpers to `return false` (fully disabling card+dashboard endpoint selection — a superset of the actual bug), then ran the entire `ParameterFieldWidget/` suite + `ParameterValueWidget` + `ResponsiveParameterList`:
```
Tests: 74 passed, 74 total (9 suites)
```
Zero failures. Even completely neutralizing the changed logic trips no jest spec. (Console stack traces in output are React `console.error` noise, not test failures.) File restored; `git status` clean.

### (5) failure_shape / confidence
- **failure_shape**: none — no jest oracle fails under revert.
- **reconstruction_failed**: yes. **category**: behavior covered only by E2E, not unit — the discriminating test is the Cypress spec `e2e/.../dashboard-filters-reproductions.cy.spec.js` (+86 lines in the commit), which reproduces the drill-then-filter-without-perms flow. No jest equivalent exists.
- **reconstructable?**: yes, in principle — one could author a new jest spec rendering `FieldValuesWidget`/`ParameterValueWidget` with `dashboardId` set and asserting the dashboard param-values endpoint (`fetchDashboardParameterValues`) is called rather than the generic parameter endpoint. But no such spec shipped or survives, so this is an honest-negative for the "find the surviving discriminating jest spec" task.
- **confidence**: high. The recorded `DataModel.unit.spec.tsx` candidate is a co-bundled flake fix, provably decoupled from the product change.