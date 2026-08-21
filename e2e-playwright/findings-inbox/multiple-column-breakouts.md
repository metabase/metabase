# multiple-column-breakouts

Source: `e2e/test/scenarios/question/multiple-column-breakouts.cy.spec.ts` (1360 lines, no gating tags)
Target: `tests/multiple-column-breakouts.spec.ts`
New helpers: `support/multiple-column-breakouts.ts`

15 tests across current-stage (notebook / summarize-sidebar / timeseries-chrome /
viz-settings / dashboards), previous-stage (notebook / viz-settings), and
data-source (viz-settings).

## Result

14 tests, all green on the jar (slot 2, COMMIT-ID 751c2a98); 28/28 under
`--repeat-each=2`. tsc clean. No fixmes, no product-bug claims — a clean
faithful port, so no Cypress cross-check was needed.

## Fixes made while stabilizing (all port-drift, no product/env findings)

- **startNewQuestion needs a loaded page.** The shared `notebook.startNewQuestion`
  clicks New in the app bar, but the current upstream `H.startNewQuestion` visits
  `/question/notebook#<hash>` directly — so test 1 opened on about:blank and the
  app bar never appeared. Fixed by `page.goto("/")` before the first
  `startNewQuestion`. Not a new gotcha (known: shared helper predates the
  upstream URL-visit rewrite); worth flagging that `notebook.startNewQuestion`'s
  doc/behavior lags the current `H.startNewQuestion` — a consolidation candidate.
- **"Change direction" strict-mode match.** `getByRole("button", { name:
  "Change direction" })` matched both the sortable wrapper div
  (`aria-label="Change direction close icon"`, substring) and the real button
  (`aria-label="Change direction"`). Added `exact: true`. Ordinary
  strict-mode-multi-match (rule 3); no dividend.

## Helper divergences (expected, not bugs)

- Reimplemented `createQuestion` (visualization_settings not in api.ts's type)
  and `createQuestionAndDashboard` (api.ts version drops enable_embedding /
  embedding_params — POST /api/dashboard ignores them, needs a follow-up PUT;
  known gotcha from PORTING.md). The dashboards test exercises the public and
  embedded hops, so those settings must survive.

## Dividend flag

- None. No Cypress-masked issue, no strengthened assertion beyond faithful
  translation.
