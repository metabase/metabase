# Minimal Jest Migration Notes

## `frontend/src/metabase/query_builder`

Measured on 2026-05-16 with `--runInBand`.

| Config | Result | Suite time |
| --- | --- | ---: |
| `jest.config.js` before infra fixes | 65 passed / 6 failed | 114.060s |
| `jest.config.js` after infra fixes | 71 passed / 0 failed | 109.436s |
| `jest.unit-lite.config.js` after CLJS utility mocks | 10 passed / 61 failed | 22.109s |
| `jest.unit-lite.config.js` after slim store reducers | 25 passed / 46 failed | 60.548s |
| `jest.unit-lite.config.js` after query/pivot UI mocks | 32 passed / 40 failed | 52.637s |

Slowest passing suites after the infra fixes:

| Suite | Time |
| --- | ---: |
| `containers/QueryBuilder.unsaved-changes-warning.unit.spec.tsx` | 19.394s |
| `components/view/sidebars/SummarizeSidebar/SummarizeSidebar.unit.spec.tsx` | 6.600s |
| `containers/QueryBuilder.beforeunload-events.unit.spec.tsx` | 6.068s |
| `containers/QueryBuilder.unit.spec.tsx` | 4.890s |
| `components/template_tags/TagEditorParam.unit.spec.tsx` | 4.261s |

Current lite-config blockers:

- `ui-with-store` no longer imports `makeMainReducers`; it now builds static reducers from the supplied mock state and keeps router/API reducers opt-in.
- Some migrated tests still import broad helpers such as `__support__/ui`, which pulls `reducers-main` and visualization/editor modules back into lite runs.
- Visualization/editor-heavy suites still need explicit classification. The lite config now has small `cljs/metabase.dashboards.constants` and `cljs/metabase.pivot.js` mocks, but tests that validate visualization behavior should move to the heavier bucket.
- Semantic action tests such as `actions/core/initializeQB.unit.spec.ts` and `actions/core/updateQuestion.unit.spec.ts` need to remain in a real-CLJS allowlist or be rewritten against narrower JS-level behavior.
- Several remaining UI failures are mock fidelity issues in query permissions, filters, joins, and metadata visibility. These should be fixed suite-by-suite rather than by adding broad global setup.
