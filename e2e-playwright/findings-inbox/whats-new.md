# whats-new.cy.spec.js → whats-new.spec.ts

Clean port. 2/2 tests green on the jar (slot 3), 4/4 under `--repeat-each=2`.
No fixmes, no product-bug claims.

## Fixes classified

None needed beyond mechanical translation — no gotcha triggered.

- Both endpoints stubbed as in the original: `/api/setting/version-info`
  fulfilled with the `createMockVersionInfo` shape, and `version` on
  `/api/session/properties` overwritten via the existing
  `admin-extras.mockSessionProperty` helper (rule: import read-only). The two
  never-awaited Cypress aliases (`@versionInfo`, `@sessionProperties`) became
  `waitForResponse` predicates registered before `page.goto("/")` (rule 2).
- `findByText` string args → `getByText(..., { exact: true })` (rule 1):
  "See what's new", "Home", "loading".
- `should("not.exist")` → `toHaveCount(0)`.
- Navbar close icon via shared `ui.icon(navigationSidebar(page), "close")`.

## New helper file

`support/whats-new.ts` (per the brief — new file only, imports shared
`mockSessionProperty`, `icon`, `navigationSidebar`):
`mockVersions`, `loadHomepage`, `seeWhatsNew`, `dismissWhatsNew`.

## Dividends

None. The port is faithful; behaviour matches Cypress and the jar.
