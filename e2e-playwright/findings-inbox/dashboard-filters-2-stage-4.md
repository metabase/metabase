# dashboard-filters-2-stage-4.cy.spec.ts → tests/dashboard-filters-2-stage-4.spec.ts

Source: `e2e/test/scenarios/dashboard-filters-2/dashboard-filters-2-stage-4.cy.spec.ts` (640 lines).
New helper module: `support/dashboard-filters-2.ts` (port of the subset of
`shared/dashboard-filters-query-stages.ts` this spec exercises — the Q8
two-stage query path).

## Result

- 11 tests ported, all green on the jar first try (slot 3, :4103). Stable:
  22/22 under `--repeat-each=2`. tsc clean.
- Issue numbers preserved verbatim: the six TODO
  `https://github.com/metabase/metabase/issues/46845` markers on the duplicated
  Reviews/Product mapping-option sections.
- No `test.fixme`, no product-bug claim → no Cypress cross-check required.

## Port decisions worth noting (no dividends, no new gotchas)

- **The `[data-element-id=list-section]` mapping list is scroll-, not
  unmount-, virtualized.** Upstream `verifyPopoverMappingOptions` snapshots the
  whole `$items` collection once and asserts `$items.length === expected`, which
  only holds if every row is in the DOM simultaneously. Confirmed here: the
  Playwright port re-resolves `items.nth(index)` each step (with
  `scrollIntoViewIfNeeded`) and the final `toHaveCount(expected + searchOffset)`
  passes, so nth-indexing is valid. Both section headers *and* column rows carry
  the `list-section` attribute (flat walk), matching the upstream loop.
- **`cy.wait(["@dashboardData","@dashboardData"])` → `waitForDashboardData(page, 2)`
  registered before the trigger** (rule 2). The setup fns that ended with that
  wait fold it in themselves; where the test did `apply*()` then waited, the
  wait wraps the `apply*()` call in the spec. Public/embedded use
  `waitForPublicDashboardData` / `waitForEmbeddedDashboardData` (GET
  `/api/{public,embed}/dashboard/…/dashcard/…/card/…`), registered before
  `visitPublicDashboard` / `visitEmbeddedPage` so the load-time dashcard queries
  are caught (Playwright waits see only future responses).
- **Faithful asymmetry carried over**: the "1st stage explicit join" public
  section asserts row counts *without* a post-apply data wait, while its
  embedded section waits for 2 — mirrors the original exactly (Playwright's
  auto-retrying assertions absorb the missing wait).
- Reused consolidated helpers: `createQuestion` / `createDashboardWithTabs`
  (factories.ts), `editDashboard` / `saveDashboard` / `filterWidget` /
  `getDashboardCard` / `sidebar` (dashboard.ts), `popover` / `icon` /
  `visitDashboard` (ui.ts), `tooltip` (charts.ts),
  `visitPublicDashboard` / `visitEmbeddedPage` (question-saved.ts). New
  helpers live only in `support/dashboard-filters-2.ts`.
- `getDashboardId()` (a Cypress alias) replaced by the dashboard id the matrix
  helper returns.

## Dividend flag

None. Clean faithful port; no bug surfaced, no Cypress-masked behaviour, no
assertion strengthened beyond the original.
