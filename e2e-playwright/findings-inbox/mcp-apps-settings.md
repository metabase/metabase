# mcp-apps-settings

Source: `metabot/mcp-apps-settings.cy.spec.ts` → `tests/mcp-apps-settings.spec.ts`
New helper: `support/mcp-apps-settings.ts` (pointerReachesLink, clickLinkWithoutFollowing)

Standalone admin spec — 1 test, verified on the jar (slot 3, COMMIT-ID 751c2a98):
1 passed clean, 2/2 under `--repeat-each=2`. tsc clean. No fixmes, no
product-bug claims — no cross-check required.

## Fixes / port decisions (all known gotchas, no new ones)

- **EE token gate.** The Cypress original does NOT activate a token (CI's
  backend is already licensed). The MCP admin section is mounted only behind
  `hasPremiumFeature("metabot-v3")` (`enterprise/.../metabot/index.ts`), so on a
  per-worker slot backend the port must activate it. Added the standard
  `activateToken("pro-self-hosted")` in `beforeEach` + `test.skip(!resolveToken(...))`
  gate (PORTING rule 7), matching ai-controls. Not infra-gated — the page just
  generates a deeplink string; no external MCP server is contacted at runtime.

- **`mb.baseUrl`, not a static baseUrl (rule 8 / per-worker note).** The deeplink
  URL is derived from the `site-url` setting (`admin/ai/useMCPServerURL.ts`).
  Slot backends boot with `MB_SITE_URL = mb.baseUrl`, so the expected value is
  `${mb.baseUrl}/api/metabase-mcp`. The original used `Cypress.config("baseUrl")`.

- **Mantine Switch** clicked via `role="switch"` input with `{ force: true }`
  (rule 4).

- **`should("not.exist")` → `toHaveCount(0)`**; `findByRole(name)` string → exact.

- **realHover + mouseenter probe → `page.mouse.move` to the link's box centre**
  (support helper), deliberately NOT `link.hover()` — hover()'s
  pointer-interception actionability guard would throw its own error rather than
  faithfully reproducing the test's intent (does the pointer land on the link or
  on the switch track that may cover it?). `mouse.move` hovers the coordinate
  with no guard, matching cypress-real-events realHover semantics.

- **preventDefault click** ports as a `{ once: true }` click listener that
  `event.preventDefault()`s, then `link.click()` — stops the `cursor://` deeplink
  navigating during the test. (The link component itself `stopPropagation`s the
  click so the parent switch never toggles; the test asserts the switch stays
  checked afterward.)

No dividends flagged.
