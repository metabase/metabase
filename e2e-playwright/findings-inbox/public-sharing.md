# public-sharing.spec.ts

Port of `e2e/test/scenarios/sharing/public-sharing.cy.spec.js`
("scenarios > admin > settings > public sharing"). 4 tests, all green on the
jar (slot 1), 8/8 under `--repeat-each=2`. tsc clean.

## Fixes / classifications

No product bugs, no fixmes, no cross-check needed. Every fix was a mechanical
known-gotcha the brief already covers:

- **Mantine Switch** (rule 4): the enable-public-sharing toggle is clicked on
  `getByRole("switch")` with `{ force: true }`, not the `Enabled` label.
- **Three `.as()` intercepts → one pre-registered wait** (rule 2): the settings
  page fires `GET /api/{action,dashboard,card}/public` on load;
  `waitForPublicListings(page)` registers all three before the goto, awaited
  after.
- **Retried `cy.url().should` → `expect.poll(() => page.url())`** (URL gotcha).
- **exact `findByText`** for the admin listing labels (rule 1).

## Dividend flagged (consolidation, not a bug)

`support/sharing.ts` already had `createPublicQuestionLink` (card-only). This
port needed dashboard + action public links too, so `public-sharing.ts` adds a
generic `createPublicLink(api, "card"|"dashboard"|"action", id)`. When sharing
helpers are next consolidated, `createPublicQuestionLink` should collapse into
this generic form.

## Notes on faithfulness

- Public-link cells are `ExternalLink`s pointed at the `site-url` origin;
  `getUrlTarget` returns `_self` for the same origin, so clicking one is a
  top-level navigation — the port asserts on the rendered public page (heading
  + "Tab 1"), matching the original. No sign-out: the Cypress original also
  clicks the link while still authenticated as admin.
- Relies on `restore()` re-pointing `site-url` at the worker origin — the
  displayed public URL uses `mb.baseUrl`, which is how the `getByRole("link",
  { name })` match resolves. (Named site-url gotcha; already fixed in the
  harness.)
- Default snapshot ships `enable-public-sharing: true` (test 1 toggles it
  Enabled → Disabled), so the API `public_link` POSTs succeed without an
  explicit enable step, exactly as upstream assumes.
