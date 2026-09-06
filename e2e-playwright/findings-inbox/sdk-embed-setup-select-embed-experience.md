# select-embed-experience — Group B port (slot 5, :4105, jar mode)

Source: `e2e/test/scenarios/embedding/sdk-iframe-embedding-setup/select-embed-experience.cy.spec.ts` (316 lines)
Target: `tests/sdk-embed-setup-select-embed-experience.spec.ts`
New module: `support/sdk-embed-setup-select-embed-experience.ts` (3 intercept ports)

Backend verified: `version.hash` = `751c2a9`, `target/uberjar/COMMIT-ID` = `751c2a98`,
`ps` on :4105 = `java -jar …/target/uberjar/metabase.jar`.

## Numbers

- **8 executed / 2 skipped / 0 fixme.** Both skips are upstream `{ tags: "@skip" }`
  ("shows exploration template when selected", "shows question of id=1 …"),
  ported as `test.skip(true, "Upstream @skip tag")`. **Zero gate-skipped** — no
  tier gate, no token gate, no container gate.
- Single run 19.2s. **`--repeat-each=2`: 16/16 passed, 4 skipped, 35.8s.**
- `bunx tsc --noEmit` clean. Prettier-formatted.
- **Mutation-checked: 8 assertions corrupted, one per executed test; all 8 tests
  failed and nothing else changed.** Mutations were: the `isDefaultExperience`
  flag in a snowplow `event_detail`; the expected `assertRecentItemName` card
  name; the `sdk-breadcrumbs` text; the `assertDashboard` name; the
  loading-indicator absence target; the slow-loading absence target; the
  `No results` alt text; and the metabot placeholder text. Non-vacuous.

## Zero changes to shared support (7th Group B spec in a row)

`support/sdk-embed-setup.ts` needed **no** modification, again. Everything this
spec drives — `visitNewEmbedPage` (both `waitForResource` branches),
`embedModalEnableEmbedding`, `getEmbedSidebar`, `assertRecentItemName`,
`assertDashboard`, `loadedPreviewIframe` — worked as landed. `embedPreview` (the
loaded-iframe-gating port of `H.getSimpleEmbedIframeContent`) was imported from
the landed `support/sdk-embed-setup-select-embed-options.ts` rather than
duplicated.

The **`llm-anthropic-api-key` hazard from the helper findings reproduced exactly
as described**: the `metabot` experience card needs
`updateSetting("llm-anthropic-api-key", "sk-ant-test-key")`, which upstream's
`beforeEach` carries and which the port carries. That prediction was correct.

## The one genuine port judgement: the recents alias is NARROWER than the shared helper

Upstream aliases `GET /api/activity/recents?context=selections*`. The shared
`waitForRecentActivity` in `sdk-embed-setup.ts` matches the pathname regardless
of query string, which is **broader** than the alias — the wizard issues other
recents calls, and matching one of those would satisfy the wait before the body
`assertRecentItemName` reads has arrived. So this spec uses its own
`waitForRecentSelections`, a literal glob port (`?` literal, trailing `*`
wildcard). Not a defect in the shared helper — it is used there only as a gate,
never as a body source — but worth knowing before reaching for it to feed an
assertion.

## Two deviations, both forced

**(a) `res.setThrottle(0.3)` has no Playwright equivalent.** Ported as a fixed
3s delay in a `page.route` before `route.continue()`. **Probed by inversion**:
raising the delay to 15s also passes — the wizard never renders the fallback
"Person overview" no matter how long recents takes. So the assertion is
behaviourally sound, and the mutation (swapping the absence target to the
dashboard that *is* present → `24 × locator resolved to 1 element`, test failed)
proves the locator resolves inside the preview frame. Kept at 3s for runtime.

**(b) The archived-dashboard test's `/api/session/properties` patch collides with
`installSnowplowCapture`,** which routes the same path in `beforeEach`.
Playwright runs the last-registered handler first, so the test's handler wins and
the capture's settings patch would be silently dropped. `patchExampleDashboardId`
therefore re-applies the three snowplow overrides verbatim alongside
`example-dashboard-id`. **Generalisable**: any port that `page.route`s
`/api/session/properties` after `installSnowplowCapture` has this problem, and
the damage is invisible (snowplow assertions just stop matching).

## Recorded, not claimed: an upstream weakness this port inherits

"should respect slow loading of recent dashboars" asserts `findByText("Person
overview").should("not.exist")` *before* asserting the expected dashboard is
visible. A retrying absence check passes at its first absent observation, so
neither the original nor the faithful `toHaveCount(0)` port can prove "Person
overview never flashed" — only that it is absent at some point after the preview
iframe loaded. `embedPreview` supplies the strongest anchor available (the
iframe's own `data-iframe-loaded`). I did not strengthen it, because doing so
(asserting the expected dashboard first) would delete the only part of the test
that is about the fallback at all. Flagged rather than fixed.

## No product-bug claims

Nothing was fixme'd, nothing cross-checked against Cypress — no test failed on
the port beyond mutation. Every assertion that failed during development was my
own drift, and there were none that survived the first run.

## Summary

Ported 10 tests (8 executed, 2 upstream-`@skip`), green on the jar and stable
under `--repeat-each=2`, tsc clean, all 8 executed tests killed by targeted
mutation. Shared `support/sdk-embed-setup.ts` needed zero changes for the 7th
consecutive Group B spec, and the helper findings' `llm-anthropic-api-key`
prediction held. Two forced deviations — a fixed delay standing in for Cypress's
bandwidth throttle (inversion-probed to 15s), and a `/api/session/properties`
route that must re-apply `installSnowplowCapture`'s overrides because it
registers later and therefore wins.
