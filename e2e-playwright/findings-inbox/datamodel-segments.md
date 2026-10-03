# datamodel-segments

Port of `e2e/test/scenarios/admin/datamodel/segments.cy.spec.ts` →
`tests/datamodel-segments.spec.ts`. 12 tests, all faithful, no `test.fixme`.

Verified on the jar (slot 5, COMMIT-ID 751c2a98): 12/12 first try, 24/24 under
`--repeat-each=2`. tsc clean. New helpers isolated in
`support/datamodel-segments.ts` (no shared-file edits).

## Result

Clean port — no product bugs, no dividends, no drift. Everything the original
covers ports 1:1 against the shared helper surface.

## Fixes / classifications (all *known gotchas*, avoided at write time)

- **Snowplow → stub** (rule 6). The whole spec is snowplow-tagged
  (`resetSnowplow`/`enableTracking`/`expectUnstructuredSnowplowEvent`/
  `expectNoBadSnowplowEvents`). Stubbed as no-ops in the new module; the
  `segment_created` and x-ray *flows* still run for real coverage, only the
  event assertions are stubbed.
- **Boolean `readonly` attr** (wave-9 gotcha). `should("have.attr","readonly")`
  is a presence assertion → one-arg `toHaveAttribute("readonly")`; the "not"
  branch → `not.toHaveAttribute("readonly")`.
- **Triple `@metadata` wait** (rule 2). `cy.wait(["@metadata"×3])` for GET
  `/api/table/:id/query_metadata` → a fresh response-counter per navigation
  (`trackMetadataRequests`) polled to `>= 3`. Three simultaneous
  `waitForResponse`s on one predicate would all resolve on the first hit.
- **Hash/URL assertions** → `expect.poll` (Cypress `cy.url()/cy.location()`
  retried). Used for `/segment/1$`, `/datamodel/segments$`, and the exact
  pathname + `?table=<ORDERS_ID>` search checks.
- **EE token + local git repo, NOT infra-gated.** The "read-only remote sync"
  describe activates `pro-self-hosted` (the jar honours it) and drives a LOCAL
  `file://` repo via the existing `support/remote-sync.ts` (`setupGitSync` /
  `configureGit` / `teardownGitSync`) plus `api.createLibrary` /
  `api.publishTables`. Runs green on the jar; skipped only if the token env var
  is absent. No external DB/email/webhook — nothing to infra-gate.
- **Segment name/description inputs are plain form fields, not EditableText** —
  `fill()` is correct here (contrast the wave-5 EditableText gotcha). Targeted
  via `getByRole("textbox", { name })` for the readonly-attr checks so the
  assertion lands on the input, not a wrapper.

## Reused shared helpers (per brief — no re-implementation)

`createSegment` (filter-bulk), `pickEntity` (dashboard), `selectFilterOperator`
(joins), `summarize` (nested-questions), `saveQuestion` (sharing),
`setupGitSync`/`configureGit`/`teardownGitSync` (remote-sync),
`main`/`modal`/`popover`/`icon` (ui), `activateToken`/`createLibrary`/
`publishTables`/`resolveToken` (api).

## Notes on data-derived values (watch on a fresher jar)

Two assertions pin sample-DB-derived counts faithfully to the original:
`"18758 rows"` (Orders Total > 10 preview) and scalar `"13,005"` (Orders < 100
count). Both stable on the local jar; if a future jar carries different sample
data they'd need loosening (cf. the smartscalar `maxPeriodsAgo` drift lesson).
