# eajs-internal-navigation (Group A, slot 5 / :4105, jar)

Source: `e2e/test/scenarios/embedding/sdk-iframe-embedding/eajs-internal-navigation.cy.spec.ts` (485 lines)
Target: `tests/sdk-iframe-eajs-internal-navigation.spec.ts`
New helper module: `support/sdk-iframe-eajs-internal-navigation.ts`

## Result

- **6/6 passed, all EXECUTED.** No `test.skip`, no `test.fixme`, no gate-skips.
  The whole file needs only a bleeding-edge token, which the spike backend has.
- Stable under `--repeat-each=2`: **12/12**, 14.8s.
- `bunx tsc --noEmit`: clean.
- Jar confirmed: `/api/session/properties` `version.hash` = `751c2a9` vs
  `target/uberjar/COMMIT-ID` = `751c2a98`.

**No dividends. No product-bug claims. No shared-module edits.**

## The run came back in 7.8s for 6 tests — I probed it rather than assuming

7.8s for six tests each doing a snapshot restore plus four API-created entities
plus an embed-iframe load looked like the "suspiciously fast green" shape.

Two independent checks:

1. **The restore really is that cheap here.** `POST :4105/api/testing/restore/default`
   measured directly: **65ms**. So the arithmetic works out; nothing was skipped.
2. **Mutation check on every test.** I flipped, in one pass: the post-navigation
   heading assertion ("Target Dashboard" → a bogus string), the parameter-value
   assertion (`toContainText("1")` → `"999999"`), all nine one-shot absence
   checks (`toBe(0)` → `toBe(1)`), and the breadcrumb-visible assertions
   (`toBeVisible()` → `toHaveCount(0)`). Result: **5 failed, 1 passed** — the one
   that passed was the only test the mutation pass didn't touch. A second,
   targeted mutation of that test (its `query-visualization-root` testid and its
   back-button text) failed it too. So **all 6 are non-vacuous**, and in
   particular the absence checks are being taken against a rendered frame rather
   than a blank one.

## Port notes

- **`@getDashCardQuery` imported, not re-declared.** `support/sdk-iframe-embedding.ts`
  already exports `waitForDashCardQuery`/`waitForCardQuery`, and
  `sdk-iframe-embed-options.spec.ts` carries a spec-local second copy. I imported
  the support-module one rather than adding a third. **Flagging for the queued
  consolidation into `support/sdk-iframe.ts`: there are currently 2 copies for
  this tier (plus 4 unrelated `waitForCardQuery`s in other domain modules).**
- **`@getDashboard` ported as `waitForDashboardGet`** (`GET /api/dashboard/:id`,
  single path segment, matching upstream's `"/api/dashboard/*"` glob — so
  `/query_metadata` and the dashcard-query POST are both excluded).
  This is **stronger than upstream in both places it's used**: the embed's
  *initial* dashboard load has already fired one such GET by the time upstream's
  `cy.wait("@getDashboard")` runs, and `cy.wait` consumes past responses while
  `waitForResponse` does not (FINDINGS #16). Registered immediately before the
  click, the Playwright version really does wait for the navigation's own fetch.
  Green either way; noting it because it means these two waits are load-bearing
  here and were arguably retroactive no-ops upstream.
- **`createMockActionParameter` inlined.** `metabase-types/api/mocks` isn't
  importable from this package. The mock is a pure literal, so it's expanded
  exactly as `createMockActionParameter` → `createMockParameter` compose it
  (every `createMockParameter` default is overridden by the spec's opts; the only
  thing the factory contributes beyond the spread is
  `target: ["variable", ["template-tag", id]]`). Documented in the helper.
- **`getSignedJwtForResource` ported with node `crypto`** (same reason
  `support/sdk-iframe.ts getSignedJwtForUser` does). `iat` is set explicitly —
  the batch-12 rule. Claim-for-claim identical to upstream's `jose` payload.
- Upstream's `prepareGuestEmbedSdkIframeEmbedTest` was **not** needed: the guest
  test in this spec does its own inline `enable-embedding-static` +
  `embedding-secret-key` setup, which I ported directly.
- All `should("not.exist")` → non-retrying `expect(await loc.count()).toBe(0)`
  at the same instant upstream took them, each preceded by the render anchor that
  `H.getSimpleEmbedIframeContent()` gave Cypress for free
  (`waitForSimpleEmbedIframesToLoad` + a positive visibility assertion).

## Two deliberate deviations, both stated

1. **One assertion reordered in "should hide breadcrumbs during internal
   navigation…".** Upstream takes `findByTestId("sdk-breadcrumbs").should("not.exist")`
   *before* asserting the back button is visible. As a one-shot absence check
   taken mid-navigation, that is satisfied by any instant in which the
   breadcrumbs happen not to be mounted — including "the new view hasn't
   rendered yet". I assert the back button first (it only exists once the
   internal navigation has landed), then take the absence check. Same two
   assertions, same test; the absence check now asserts the post-navigation
   state it is about. This is a strengthening, and it passes.
2. **The breadcrumb click in "should clean up navigation stack…" is gated on the
   settled trail.** Per the brief and the batch-12 gotcha, a locator resolved
   against a half-restored Mantine `Breadcrumbs` can point at a reused anchor
   node that becomes a different crumb by click time. I gate on the trail
   carrying *both* "Our analytics" and "First Dashboard" before resolving the
   "Our analytics" crumb. **I did not observe the failure here** — this is
   prophylactic, not a diagnosis. Reported as such.

## Things I checked and did NOT need

- **`.first()` on `getByLabel("ID Filter")`** — I added one defensively (the
  "parameter widgets duplicate their accessible name" gotcha), then **removed it
  after verifying it resolves to exactly one element**. Upstream's
  `findByLabelText` throws on multiple matches, so the un-suffixed form is the
  faithful one. Verified green without it.
- **Frame re-acquisition after navigation.** The brief warns that a navigation
  replaces the FrameLocator's document. It does not here: the internal navigation
  is client-side React routing *inside* the embed iframe, so the iframe document
  is never replaced. `FrameLocator` re-resolves per action in any case, which is
  exactly what upstream relies on by re-calling `H.getSimpleEmbedIframeContent()`
  at each step. One `frame` handle per test is correct and stays valid.
- **Snowplow**: not touched by this spec at all — neither stub nor capture needed.
- No new environmental blockers. The credentialed-CORS and Private-Network-Access
  fixes already in `support/sdk-iframe.ts` covered everything; nothing in this
  spec uses a non-loopback `origin:`.

## Summary (3 lines)

Straight 1:1 port; 6/6 executed and green on the jar, 12/12 under `--repeat-each=2`,
tsc clean. Two assertions are deliberately stronger than upstream (a reordered
one-shot absence check, and a settled-trail gate before the breadcrumb click);
everything else is literal. The only cross-port note worth acting on is that
`waitForDashCardQuery` now has two copies in this tier and should land in
`support/sdk-iframe.ts` at consolidation.
