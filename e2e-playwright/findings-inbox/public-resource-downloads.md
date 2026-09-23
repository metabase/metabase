# public-resource-downloads

Port of `e2e/test/scenarios/sharing/public-resource-downloads.cy.spec.ts`
(13 tests). The public-link mirror of `embed-resource-downloads` (static
embeds). Verified on the jar (slot 2), 26/26 under `--repeat-each=2`, tsc clean.

## Result

All 13 faithful, no `test.fixme`, no product-bug claims. New helpers isolated to
`support/public-resource-downloads.ts` (downloadPublicDashcardCsv,
downloadPublicQuestionCsv); everything else imported read-only
(createPublicLink, the snowplow stubs / waitLoading / getEmbeddedDashboardCardMenu
/ downloadEmbedQuestion from embed-resource-downloads.ts, main/popover, dashboard
IDs).

## Fixes classified (all known gotchas, no new ones)

- **Public link via API, not the sharing menu.** Upstream drives
  `H.openSharingMenu("Create a public link")` and reads the input value; the port
  mints the uuid with `createPublicLink(api, ...)` and builds the URL from
  `mb.baseUrl` (restore() re-points site-url to the worker origin). Same pattern
  as public-sharing.spec.ts. Known gotcha (rule 8 / site-url).

- **The public *question* export GET redirects (302).** `GET
  /public/question/<uuid>.<type>?parameters=…` is answered with a 302 to the real
  results endpoint — `e2e-downloads-helpers.getEndpoint` marks this path GET and
  the Cypress original asserted no status on the GET branch (only POST dashcard
  gets the 200 + content-type check). First cut asserted 200 on it and failed
  3 CSV tests with `Received: 302`. Fix: capture the initial GET via
  `waitForRequest` (it carries the `parameters` query string the params test
  inspects) and let the browser follow the redirect; the `download` event
  confirms completion. Instance of the download.url()-is-a-blob / assert-the-
  request family of gotchas.

- **Public *dashcard* export card id comes from the dashcard, not the caller.**
  Upstream matched `…/card/*/<type>` with a wildcard; questionId passed to
  `downloadAndAssert` is decorative. Porting it into the pathname literally
  wouldn't match the real card. Fix: match prefix
  `/api/public/dashboard/<uuid>/dashcard/<dashcardId>/card/` + `endsWith("/<type>")`.
  The dashcard POST really is a 200 (kept that assertion).

## Dividends

- Stronger than the Cypress original on the POST path: the port asserts the real
  export **response** is a 200 with the right content-type and lands the file,
  where Cypress intercepted-and-redirected to avoid wedging the runner.
- No genuinely new gotcha — every fix maps to an already-documented rule; the
  brief was accurate. No FINDINGS.md-worthy product issue surfaced.
