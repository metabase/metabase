# mcp-analytics

Source: `e2e/test/scenarios/metabot/mcp-analytics.cy.spec.ts` (3 tests)
Target: `tests/mcp-analytics.spec.ts` + new `support/mcp-analytics.ts`

## Result

3/3 green on the jar (COMMIT-ID 751c2a98), slot 5. 6/6 under `--repeat-each=2`.
tsc clean. No fixmes, no product-bug claims — so no Cypress cross-check was
needed.

## Gate

EE, but NOT infra-gated: the whole flow seeds tool-call rows through the
testing API (`POST /api/testing/mcp/seed-tool-call`, `testing_api/api.clj:580`),
which routes through the production `metabase.mcp.usage` recorders — no external
MCP-server / DB / webhook infra. The audit DB (id 13371337) ships in the EE
build. File-level `test.skip(!resolveToken("pro-self-hosted"))` mirrors the
sibling metabot-usage-auditing spec; the jar activates the token via
cypress.env.json.

## Fixes / port notes (all mechanical, no new gotchas)

- **`ADMIN_USER_ID` reused, not re-implemented** — imported from
  `support/metabot-usage-auditing.ts` (the sibling metabot module already
  exports it). No shared file edited.
- **Never-awaited `@dataset` intercept** (rule 2): the Cypress
  `visitMcpAnalyticsPage` registered both `@auditMetadata` and `@dataset` but
  only waited on the former at visit time; `@dataset` was consumed by a later
  `cy.wait("@dataset")` after clicking the "Tool calls" tab. Split faithfully:
  `visitMcpAnalyticsPage` awaits only audit-metadata; the dataset wait moved
  into `openToolCallsTab`, registered *before* the tab click and awaited after.
- **Rule 1 exact matches** — all `findByRole`/`findByText`/`findByLabelText`
  string args ported as `{ exact: true }` (nav link, headings, tool-name /
  error-type / error-message cells, "No MCP activity", "error page").
- `should("not.exist")` → `toHaveCount(0)`; `.scrollIntoView().should("be.visible")`
  → `scrollIntoViewIfNeeded()` + `toBeVisible()`.
- Test 3 (no audit_app) does a plain `page.goto` — no audit-metadata request
  fires without the feature, so no wait is registered. `restore()` clears the
  premium token, so test 3 correctly starts feature-off even after tests 1/2
  activated it.

## Dividends

None. Faithful 1:1 port; behaviour matched the original on the jar.
