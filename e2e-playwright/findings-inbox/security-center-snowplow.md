# security-center-snowplow

Source: `e2e/test/scenarios/admin/security-center-snowplow.cy.spec.ts` (42 lines, 1 test)
Target: `tests/security-center-snowplow.spec.ts` — **1 passed, 0 skipped** (2/2 under `--repeat-each=2`)
Jar `751c2a98`, slot 4105. `bunx tsc --noEmit` clean.

## `installSnowplowCapture` reused unmodified — 5th independent spec

No change to `support/search-snowplow.ts`. This one exercises a matcher shape
the earlier reusers didn't: a `trackSimpleEvent` payload, whose whole body is
`{ event: "security_center_page_viewed" }` — i.e. the matcher key is literally
`event`, which reads confusingly next to `H.expectSnowplowEvent`'s outer `event`
wrapper but is just the simple-event schema's own field. Worked first try.

## The tier gate here IS real (measured)

PORTING says tier gating doesn't generalise and must be probed per spec.
Probed: removing `mb.api.activateToken("pro-self-hosted")` and changing nothing
else **fails** the test — `/admin/security-center` never renders its
`Security Center` heading (10s timeout, element not found), so the snowplow
assertion is never reached. Keeping the `activateToken` call is load-bearing,
not ceremonial.

This doubles as the evidence PORTING asks for that `activateToken` actually took
effect — it PUTs with `failOnStatusCode: false`, so "it didn't throw" proves
nothing. Here the licensed arm renders and the unlicensed arm does not, which is
a behavioural difference only the token can explain.

## Mutation check: input inversion, mutant killed

Navigating to `/admin/settings/general` instead of `/admin/security-center`
(with the heading anchor changed to match) → the page renders fine and the
snowplow assertion fails at 0 events after 15s. So the assertion is tied to the
page under test, and — since the unmutated run passes — the locator/matcher can
match. Not vacuous in either direction.

## The one deviation, stated plainly

`H.expectNoBadSnowplowEvents()` asks snowplow-micro for **Iglu schema-validation
failures**. Without micro that cannot be reproduced; the port uses
`expectNoBadSnowplowEvents` from `support/search-snowplow.ts`, which is a
**structural** check only ("every captured payload decoded into a well-formed
self-describing event"). It does not catch "the FE emits a field the schema
rejects". Same known gap as every other capture-based snowplow port — recorded
again here because in this spec `expectNoBadSnowplowEvents` is 1 of only 2
assertions, so the degradation is proportionally larger than elsewhere.

## Port notes

- Upstream gates the describe on `Cypress.expose("IS_ENTERPRISE")` (a build
  flag). No Playwright equivalent, so the port probes the backend with
  `isOssBackend` — the standard substitution. The spike jar reports
  `version.tag = "vUNKNOWN"`, which `isOssBackend` treats as not-OSS, so the
  test **executes** rather than gate-skips. Confirmed by the run output
  (1 passed, 0 skipped), not assumed.
- The three `cy.intercept` stubs (`/api/ee/security-center`,
  `/api/user/recipients`, `/api/channel`) are exact-path globs — no `*` — so
  they port to exact `url.pathname ===` predicates.
- They are registered **after** `installSnowplowCapture`, which is safe only
  because none of them touches `/api/session/properties`. PORTING's
  "last-registered handler runs first" trap would otherwise silently drop the
  capture's settings override. Noted in the spec header so a future edit that
  adds a session-properties stub knows to re-apply the three overrides.
- The stubs turn out not to be required for the *event* —
  `trackSecurityCenterPageViewed` fires from an unconditional `useEffect` in
  `SecurityCenterPage` that sits above the `isError` early return — but they are
  ported as written (faithfulness), and the `Security Center` heading renders in
  both the error and success branches.
