# embedding-reproductions.cy.spec.js → embedding-reproductions.spec.ts

Source: `e2e/test/scenarios/embedding/embedding-reproductions.cy.spec.js` (1682 lines).
Verified on the CI EE uberjar (`target/uberjar/metabase.jar`, COMMIT-ID 751c2a98),
slot 3, per-worker backend. 14 runnable tests green; 5 correctly skipped
(2× @skip, 2× @external QA-Postgres, 1× token+QA-DB full-app).

## Gating summary

- 15860, 49142 → `test.describe.skip` (upstream `@skip`; 49142 reason: "does not
  make sense when CSP is disabled").
- 27643 → `@external`, `test.skip(!PW_QA_DB_ENABLED)`.
- 51934 (EMB-189) → `test.skip` on `!PW_QA_DB_ENABLED || !token` (postgres-12
  snapshot + QA-Postgres models + full-app embedding token).
- 30535, 8490 → `test.skip(!resolveToken("pro-self-hosted"))` (+ activateToken).
  These run in the spike (token is in `cypress.env.json`, auto-loaded by env.ts).

## New gotcha (feedback-loop candidate): ECharts SVG axis labels carry leading/
## trailing whitespace, defeating a `^…\b`-anchored getByText

issue 8490 (`#locale`) asserts the line chart's Korean X-axis label with
`cy.findByText(/^1월 20\d\d\b/)`. On the jar the ECharts axis label is a real SVG
`<text>` whose `textContent` is `" 1월 2027 "` — with a **leading and trailing
space** (verified: charcodes `[32,49,50900,32,50,48,50,55,32]`). Cypress's
testing-library normalizes/trims text before matching, so `^1월 20\d\d\b` matched.
Playwright's `getByText` does **not** trim leading whitespace before applying the
regex, so the `^` anchor never matches (`getByText(/^1월 20\d\d\b/).count() === 0`,
while `getByText(/1월\s*20\d\d/).count() === 1`). Fix: drop the `^`/`\b` anchors and
match the label as a substring (`/1월\s+20\d\d/`). Applies to any ported axis/label
assertion that anchors on `^`/`\b` around testing-library-trimmed text. Not a
product bug — same DOM, different matcher-normalization between the harnesses.

## Cypress artifact ported as a load-wait (issue 41635)

Upstream's 41635 does, back-to-back:
```
H.getIframeBody().within(() => cy.button(filter.name).should("not.exist"));
H.getIframeBody().within(() => cy.button(filter.name).click());
```
i.e. it asserts the "Text" filter button does NOT exist and then immediately
clicks it. This only "works" because `H.getIframeBody()` re-runs
`cy.frameLoaded`+`cy.iframe` and the first `.within` resolves against the
still-loading/stale iframe body (empty → not.exist passes vacuously). It is a
Cypress iframe-caching load-race, not a real assertion. Ported the first block as
a positive load-wait (`expect(button("Text")).toBeVisible()`), then the real
assertion (its dropdown is narrowed to Doohickey by the locked linked parent).

## Pacing waits dropped

The `cy.wait("@getEmbed")` (20438) and `@previewDashboard`/`@previewValues`
(37914/41635) pacing waits are dropped — they gate re-fetches that Playwright's
web-first assertions already wait for. Noted at each call site.

## `defer()` / `res.setDelay(MINUTE)` → holdEmbedRoute

8490's two locale tests hold `/api/embed/{dashboard,card}/*` responses to observe
the translated loading message before the data lands. Ported as
`holdEmbedRoute(page, predicate)` (support/embedding-repros.ts): a `page.route`
gated on a promise, released after the loading assertion.

## `.CardVisualization` class selectors re-anchored

20634 and 25031 assert on `.CardVisualization` (a legacy class name). Per the
"never select on class names" rule, re-anchored on the embed-frame result text /
`getByTestId("dashcard-container")` instead.

## Duplication flagged for consolidation

- `support/embedding-repros.ts#createDashboardWithQuestions` duplicates
  `filters-repros.ts#createDashboardWithQuestions`, but the latter has no `cards`
  positional-override parameter (8490 needs `cards: [{}, { col: 11 }]`). Fold the
  `cards` option into one shared helper.
- `createModelFromTableName` here returns the created model's id;
  `interactive-embedding.ts`'s copy does not. Unify.
- `getFieldIdByName` is a single-field reduction of Cypress's `H.withDatabase`
  metadata map — a general `withDatabase`/field-id helper would serve several
  QA-DB specs.
- `getIframeBody` / `tableInteractiveHeader` are one-liners with no prior home.

## Not verified

- 27643, 51934 need the QA Postgres containers (not available in the spike) —
  ported faithfully, typecheck-only, gated off. 51934 in particular is a complex
  full-app notebook data-source/join picker flow; the picker-popover targeting
  (`[data-element-id=mantine-popover][aria-label=…]`) and brand-color assertions
  are ported from the Cypress original but unrun.
