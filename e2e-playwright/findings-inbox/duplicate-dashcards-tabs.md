# duplicate-dashcards-tabs

Port of `dashboard-cards/duplicate-dashcards-tabs.cy.spec.js` → `tests/duplicate-dashcards-tabs.spec.ts`.

- 2 tests, both green on the jar (slot 4), stable under `--repeat-each=2` (4/4).
- Snowplow-tagged → helpers stubbed to no-ops (port rule 6). Both tests keep
  their real UI actions; only the event assertions are neutered.
- No product bugs, no fidelity concerns, no `test.fixme`. Nothing FINDINGS-worthy.

## Fixes classified
- **Known gotcha (import location)**: `dashboardCards` lives in
  `support/dashboard-tabs.ts`, not `dashboard-core.ts` (where `duplicateTab`
  and `getDashboardCards` live). First run failed with
  `dashboardCards is not a function` — the tab-duplication itself had already
  succeeded, so the misleading symptom was a late TypeError, not an app issue.
  Mechanical, no dividend.

## Notes
- The "duplicate a tab" case runs against a dashboard created with NO explicit
  tabs — `duplicateTab(page, "Tab 1")` still resolves in edit mode (the implicit
  default tab is named "Tab 1"). Confirmed working on the jar.
- New helpers isolated in `support/duplicate-dashcards-tabs.ts` (spec-local
  constants + mapped-dashcard builder + snowplow stubs); imports `mockParameter`
  and `mockQuestionDashboardCard` read-only from `dashboard-parameters.ts`.
