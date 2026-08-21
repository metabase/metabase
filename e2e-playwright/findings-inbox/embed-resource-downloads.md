# embed-resource-downloads

Port of `e2e/test/scenarios/embedding/embed-resource-downloads.cy.spec.ts`
(9 tests). Static ("guest") embed `downloads` flag for dashboards and questions.

Verified on the jar (slot 2, COMMIT-ID 751c2a98, TZ=US/Pacific): 9/9 green,
18/18 under `--repeat-each=2`. tsc clean.

## Fixes classified

- **`downloadEmbedQuestion` needed `main(page).hover()` before clicking
  "Download results"** — *known gotcha* (PORTING rule 4: controls revealed on
  hover; also the exact `main(page).hover()` the embedding-questions "without
  token" test uses). The embed footer's Download control is pointer-over-gated;
  Cypress's synthetic `.click()` found it without moving the cursor, Playwright's
  real cursor does not. The two parameterized tests already hovered the question
  heading first, so they passed before this fix; the bare PNG / CSV question
  tests (which upstream clicks with no hover) timed out until the helper hovered.
  No brief change needed — rule 4 already covers it.

## Notes (no dividends, no product bugs)

- Snowplow (`resetSnowplow` / `expectNoBadSnowplowEvents` /
  `expectUnstructuredSnowplowEvent`) → no-op stubs per rule 6; kept callable so
  the spec mirrors upstream structure.
- `cy.deleteDownloadsFolder` → no-op (Playwright downloads land in per-run temp
  dirs). `cy.verifyDownload(name)` → assert `download.suggestedFilename()`;
  `{ contains: true }` → `.toContain`.
- Real downloads land as files (`page.waitForEvent("download")`). The last two
  tests additionally assert the GET `/api/embed/card/*/query/csv` export is a
  200 with `text/csv` (`downloadAndAssertEmbedQuestion`) — strictly stronger
  than the Cypress intercept-and-redirect.
- Whole file is EE-token-gated (`resolveToken("pro-self-hosted")`); the jar
  activates it. The `downloads` flag is a paid feature.
- New helpers isolated to `support/embed-resource-downloads.ts`; embed-visit /
  api / download / table helpers imported read-only from the shared modules.
