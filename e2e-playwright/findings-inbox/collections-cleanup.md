# collections/cleanup.cy.spec.js → collections-cleanup.spec.ts

Ported 5 tests (1 OSS-gated skip, 4 EE). Verified on the jar (slot 1,
COMMIT-ID 751c2a98): 4 passed / 1 skipped, and 8/8 EE under `--repeat-each=2`.
tsc clean. New helpers in `support/collections-cleanup.ts` only.

## Fixes classified

- **Known gotcha (mixed-content text nodes).** The pagination footer renders
  `{start} - {end}` as bare text nodes ("1", " - ", "10") *followed by* nested
  `<Text>` spans for " of " and the total ("19"), so the element's full text is
  "1 - 10 of 19". testing-library's `findByText("1 - 10")` matched on the
  element's DIRECT text nodes and passed; Playwright's exact `getByText` compares
  the full element text and found nothing. Ported as a substring regex
  (`getByText(/1 - 10/)`), exactly the PORTING mixed-content rule. Caught only on
  the jar run — the port would otherwise have looked like a real failure.

- **Known gotcha (Mantine Switch).** The recursive "Include items in
  sub-collections" filter is a Mantine `Switch` (role="switch", visually-hidden
  input). `getByLabel(...).click()` needs `{ force: true }` (PORTING rule 4).

- **Harness, not a fix (multi-worker slot collision).** The default run spun up
  multiple workers, each booting a per-worker backend; with `PW_SLOT_OFFSET=1`
  fixed they collided and a sibling backend crashed (surfacing as the OSS test
  "failing" in a crashed worker). `--workers=1` keeps everything on slot 1 and
  is the correct single-slot invocation. Not a spec issue.

## Faithful-port notes (no dividend)

- Whole `ee` describe gated on `resolveToken("pro-self-hosted")`; the jar
  activates it. The `oss` test asserts the feature is ABSENT on an OSS build, so
  it is gated with `isOssBackend` and SKIPS on the EE jar (faithful — runtime
  coverage is the 4 EE tests).
- Snowplow hooks/assertions (`resetSnowplow`, `enableTracking`,
  `expectNoBadSnowplowEvents`, `expectUnstructuredSnowplowEvent`) → no-op stubs
  (PORTING rule 6); the clean-up UI flow is exercised for real.
- Two Cypress `cy.intercept` response mutations → `page.route`: the `is_sample`
  flag (fetch real response, set `is_sample: true`, re-fulfill) and the
  stale-items 500 error. The stale-items `cy.wait` aliases → `page.waitForResponse`
  registered before the trigger (rule 2).
- `POST /api/testing/mark-stale` and `GET /api/ee/stale/:id` both exist in the
  jar and are exercised end-to-end — no infra gating needed.

## No product bugs claimed.
