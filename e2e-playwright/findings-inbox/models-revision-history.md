# models-revision-history

Ported `e2e/test/scenarios/models/models-revision-history.cy.spec.js` →
`tests/models-revision-history.spec.ts` (1 test).

## Result
- 1/1 green on the jar (slot 5, COMMIT-ID 751c2a98); 2/2 under `--repeat-each=2`.
- No fixmes, no product-bug claims — clean faithful port.

## Fixes / classification
All mechanical, no dividends:
- **Snowplow (rule 6)** — `resetSnowplow` / `enableTracking` /
  `expectNoBadSnowplowEvents` / `expectUnstructuredSnowplowEvent` stubbed to
  no-ops inline (matches the established per-spec pattern).
- **Retried location assertions** — `cy.location("pathname").should("match", …)`
  ported as `expect.poll(() => new URL(page.url()).pathname).toMatch(…)`.
- **Revert anchoring** — the Cypress original doesn't await the revert; the port
  registers `waitForRevert` (support/revisions.ts) before the click and awaits
  it in `revertTo`, so the follow-up navigation + pathname poll are
  deterministic. Confirmed the revert response is 200 with no `cause`.

## New helpers
New file `support/models-revision-history.ts`:
- `ORDERS_BY_YEAR_QUESTION_ID` (mirrors cypress_sample_instance_data, as several
  other support modules already do locally).
- `openRevisionHistory(page)` — the QUESTION/MODEL variant (question-info button
  → History tab → `saved-question-history-list`), distinct from the
  dashboard-flavoured `openRevisionHistory` already in support/revisions.ts.
- `revertTo(page, history)` — filter `revision-history-event` by
  `new RegExp(history)`, click `question-revert-button`, anchor the revert POST.

Imported read-only: `sidesheet` / `questionInfoButton` / `waitForRevert` /
`expectRevertSuccess` (support/revisions.ts), `visitModel` (support/models.ts),
`echartsContainer` (support/charts.ts).

## Consolidation note
`ORDERS_BY_YEAR_QUESTION_ID` is now re-derived in ~5 support modules
(command-palette, dashboard-card-fetching, question-saved, card-embed-node, and
here). Candidate for promotion into support/sample-data.ts alongside
`ORDERS_QUESTION_ID`.
