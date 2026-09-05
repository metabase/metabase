# segments-data-studio

Port of `data-studio/data-model/segments-data-studio.cy.spec.ts` →
`tests/segments-data-studio.spec.ts` (~773 lines, 20 tests).

Verified on the jar (COMMIT-ID 751c2a98), slot 1, PW_PER_WORKER_BACKEND:
**19 passed, 1 skipped** (the upstream `it.skip` cycles test); **38 passed /
2 skipped under `--repeat-each=2`**. tsc clean.

## Result

Clean port — no fixmes, no product-bug claims, so the Cypress cross-check was
not required (nothing to establish fidelity *of*). Fully jar-runnable: no
external DB, email, or webhook. Whole describe is `@EE` + gated on the
pro-self-hosted token (`test.skip(!hasToken)`), which the EE jar activates.

## Fixes / decisions (all known gotchas, none new)

- **New helper module** `support/segments-data-studio.ts` for the data-studio
  SegmentList / SegmentEditor / SegmentRevisionHistory locator surface
  (testids `table-segments-page`, `new-segment-page`, `segment-detail-page`).
  Deliberately separate from the pre-existing `support/datamodel-segments.ts`,
  which targets the *admin* segment UI (`segment-list-app`) — a different
  surface. Imports `SAMPLE_DB_SCHEMA_ID` read-only from `data-model.ts`; shared
  files untouched (rule 9).
- **Snowplow** → no-op stubs (rule 6); events still fire, assertions stubbed.
- **Token gate** (rule 7): `mb.api.activateToken("pro-self-hosted")` in
  beforeEach, describe skipped without the token.
- **`findByDisplayValue`** for the segment name input (getByDisplayValue absent
  from this Playwright install's types) — reused `filters-repros.ts`.
- **Toast assertions** use `.first()` (transient-UI duplicate gotcha).
- **Email search combobox** is a debounced typeahead → `pressSequentially`,
  not `fill` (rule 5).
- **`cy.wait("@createSegment"/"@updateSegment"/"@metadata")`** → `waitForResponse`
  predicates registered before the trigger (rule 2).
- Name-edit `.click().type(" Updated{enter}")` → click + `press("End")` +
  `pressSequentially` + `press("Enter")` to append at caret end reliably.
- `it.skip` cycles test ported as `test.skip` with the full body preserved.

## Reuse dividends (consumed, not added)

Everything needed already existed in shared modules and was imported read-only:
`createSegment` (filter-bulk), `selectFilterOperator` (joins), `openTable`
(ad-hoc-question), `getNotebookStep`/`visualize` (notebook), `tableInteractive`
(models), `undoToast` (metrics), `popover`/`modal` (ui), `DependencyGraph`
(dependency-graph), `findByDisplayValue` (filters-repros). No re-implementation.

## Consolidation candidate (flag only)

`support/segments-data-studio.ts` and `support/datamodel-segments.ts` cover the
same *feature* (segments) across two UI surfaces (data-studio vs admin) with the
same snowplow-stub block duplicated. A future consolidation pass could merge the
snowplow stubs (they are copy-pasted across homepage.ts, datamodel-segments.ts,
and now segments-data-studio.ts) into one shared no-op module.
