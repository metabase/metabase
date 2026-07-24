# metabot/usage-auditing.cy.spec.ts

Ported to `tests/metabot-usage-auditing.spec.ts` with new helper module
`support/metabot-usage-auditing.ts`. 19 tests, all green on the jar
(EE uberjar, slot 3): 19/19 first pass, 38/38 under `--repeat-each=2`. tsc clean.
No fixmes, no product-bug claims — so no Cypress cross-check was required.

## Infra check (this is an EE audit/tenant/analytics spec — the gate risk)

NOT infra-gated. Everything the spec needs is present on the EE jar:

- Seed endpoint `POST /api/testing/metabot/seed-usage-auditing`
  (`src/metabase/testing_api/api.clj:566`) writes MetabotConversation /
  MetabotMessage / AiUsageLog / PermissionsGroup rows straight into the **app
  DB** — no external DB, email, webhook, or audit-app dump infra. Confirmed by
  reading `seed-usage-auditing-data!`.
- The charts query the EE **audit database (id 13371337)** via `/api/dataset`;
  an EE build loads it at startup and the `pro-self-hosted` token activates it.
  Present on the jar — all six charts per metric render.
- Multi-tenancy (`use-tenants` setting, `POST /api/ee/tenant`) works on the jar;
  the four tenant tests pass.

Gated behind `resolveToken("pro-self-hosted")` (PORTING rule 7) as a defensive
skip, but the jar harness supplies it via cypress.env.json so it runs.

## Notable port decisions (no new gotchas — all covered by existing rules)

- **Cypress once-registered aliases → per-action `waitForResponse`** (rule 2).
  The Cypress spec set `@auditMetadata`/`@dataset`/`@conversations`/
  `@conversationDetail` intercepts once and re-`cy.wait`ed them throughout. The
  port registers a fresh `page.waitForResponse(predicate)` before each
  triggering click. The filter helpers (`selectDateFilter`/`selectUserFilter`/
  `selectTenantFilter`) take a `waitFor: "dataset" | "conversations"` param
  because the same filter fires `/api/dataset` on the usage-stats page but
  `/api/ee/metabot-analytics/conversations` on the conversations list — the
  Cypress `waitAlias` argument, modelled as a predicate switch.
- **Chart-drill: register the conversations wait in the test body, before
  calling the drill helper** (the click lives inside the helper). The
  `clickRowChartBarForLabel` bar-matching runs in a `toPass` loop (row charts
  measure size asynchronously and first render zero-width bars), but the click
  itself fires exactly once after the loop resolves, so the caller's
  pre-registered `waitForConversationsResponse` catches a single request.
- **`role="graphics-symbol"`** (ECharts row-chart bars) is an SVG ARIA graphics
  role absent from Playwright's `getByRole` type union — matched with
  `locator('[role="graphics-symbol"]')`.
- **Mantine searchable `Select` + `have.value`**: the filter selects put their
  `data-testid` on the inner input, so `getByTestId(...).toHaveValue(label)`
  ports `findByDisplayValue`/`should("have.value", …)` directly (cleaner than
  the missing `getByDisplayValue`).
- **Mantine option click**: `selectDropdown(page).getByRole("option", {name,
  exact})` rather than `getByText` (wave-10 rule: the option text div isn't the
  click target).
- **`cy.contains(label).should("not.exist")`** ported as a case-sensitive
  substring regex (`getByText(new RegExp(escapeRegExp(label)))` → `toHaveCount(0)`),
  since `cy.contains` is case-sensitive substring, not exact (rule 1 caveat).
- URL assertions Cypress retried (`cy.url().should`, `cy.location`) → `expect.poll`.
- `seed.date` (the seed response's "today" date, JVM-zone anchored) is captured
  in `beforeEach` and reused for the by-day / hour / single-day tests instead of
  a Cypress alias (`@usageAuditingSeed`).
