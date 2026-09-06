# recently-viewed (search/recently-viewed.cy.spec.js → tests/recently-viewed.spec.ts)

6 tests, all green on the jar (slot 1), 12/12 under `--repeat-each=2`, tsc clean.
No product bugs, no fixmes, no infra gating. New helper file
`support/recently-viewed.ts` (advanceServerClockBy + assertRecentlyViewedItem);
everything else imported read-only.

## Fixes classified

- **RTK-cache re-fetch is a known gotcha, hit here (known gotcha).** The #36868
  test re-opens the search bar and upstream `cy.wait("@recent")`s. The recents
  list is an RTK-Query cached endpoint, so re-opening reuses the warm cache and
  fires NO new `/api/activity/recents` — Cypress's `cy.wait` was satisfied
  retroactively by the beforeEach's past response; Playwright's
  `waitForResponse` only sees future ones and timed out at 30s. Dropped that
  never-fired wait and let the retrying `toHaveText` assertions gate the list.
  The *second* recents refetch in the same test (after clicking the People row
  logs a new view, invalidating the cache) does fire, but it's likewise gated
  by the retrying `assertRecentlyViewedItem(..., 0, "People", "Table")` rather
  than an explicit wait — robust either way. This is exactly the
  "register-before-trigger but NOT on RTK cache" caveat in the brief.

## Notes (no dividend, recorded for the next porter)

- Full-app-embedding keyboard nav: `cy.get("body").trigger("keydown", {key})`
  ported as a synthetic `embed.locator("body").dispatchEvent("keydown", {key})`
  on the iframe body. Real `page.keyboard.press` was not needed — the recents
  keyboard handler is a global listener, so the synthetic dispatch (faithful to
  cy.trigger) reaches it. ArrowDown×2 + Enter selects the Orders question; URL
  asserted against `embedFrame(page).url()` pathname.
- `/api/testing/set-time` with `add-ms` is available on the jar and advances the
  MOCK clock *cumulatively* (each call is fixed-clock-now + add-ms). `restore()`
  resets it (`alter-var-root java-time.clock/*clock* nil` in the restore
  handler), so the beforeEach's three 100ms advances are per-test-clean even
  under PW_KEEP_SLOT_BACKENDS.
- Entity-picker + EE (verified badge) describes are plain top-level pages (no
  embedding). EE gated on `resolveToken("pro-self-hosted")`; the jar activates
  it, so it ran and passed.
