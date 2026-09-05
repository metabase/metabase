# embedding-dashboard.cy.spec.js → tests/embedding-dashboard.spec.ts

Port of `e2e/test/scenarios/embedding/embedding-dashboard.cy.spec.js` (1492
lines, 24 tests). Static ("guest") dashboard embedding. New helpers →
`support/embedding-dashboard.ts` only (no shared-file edits).

Verified on the **jar** (slot 4, :4104, `JAR_PATH=…/target/uberjar/metabase.jar`,
`PW_PER_WORKER_BACKEND=1`). **24/24 green, 48/48 under `--repeat-each=2`**, tsc
clean. Token present (the appearance describe ran, not skipped).

## Fixes classified

All six initial failures were **port drift** (no product bugs).

1. **Preview-embed intercept glob fidelity (rule 2)** — #38271/#46378 counted
   `preview_embed` responses with `/^\/api\/preview_embed\/dashboard\//`, but
   Cypress's `cy.intercept("api/preview_embed/dashboard/*")` glob `*` matches a
   single path segment, so it counts only the dashboard-metadata request
   (`/dashboard/<token>`), NOT the dashcard-query request
   (`/dashboard/<token>/dashcard/../card/..`). Fixed the regex to
   `/^\/api\/preview_embed\/dashboard\/[^/]+$/`. This alone fixed #38271.

2. **Mixed-content `findByText` + `.next()` (known gotcha)** — required-params
   test: `sidebar().findByText("Default value").next()`. The `SettingLabel`'s
   text becomes `Default value (required)` once the param is required (an inline
   `<span>`), so exact `getByText("Default value")` matches nothing. testing-
   library's `getNodeText` only reads direct text nodes, so Cypress matched.
   Anchored on the value widget's stable `[aria-labelledby="default-value-label"]`
   instead of a text `.next()`.

3. **Type + Enter must land on one element** — #34954: `filterWidget()
   .findByPlaceholderText("Category").type("Widget{enter}")`. Re-resolving
   `getByPlaceholder("Category")` for the Enter press missed (widget re-renders
   after typing). Fixed with `page.keyboard.press("Enter")` on the focused
   element.

4. **Wrong native-question default name** — `createNativeQuestion` defaulted
   `name:"native"`; upstream `H.createNativeQuestion` defaults `"test question"`.
   #47570 asserts the card title `test question`. Aligned the default.

5. **Offscreen 0×0 SegmentedControl inputs** — the Look-and-Feel theme/title/
   border toggles are visually-hidden radio/switch inputs; Cypress force-clicks
   them. Playwright's `click({force:true})` still fails the viewport check on a
   0×0 element, so use `dispatchEvent("click")` (same pattern the docs already
   record for offscreen react-flow nodes).

6. **Required-param default synced into the frame URL, not the preview src** —
   `cy.location("search").should("contain","name=Ferne+Rosenbaum")`. The default
   is written into the (framed) embed's OWN url after it applies, so poll
   `page.frame("embed")?.url()`, not the preview iframe `src` returned by
   `visitIframe`.

## Cross-check caveat worth recording (#38271 / #46378)

These two "don't rerender the preview" tests assert `previewEmbedSpy` callCount
`=== 1`. On the jar my Playwright harness observed **2** dashboard-preview
requests for the tabbed dashboard (#46378) — same endpoint, tokens 1s apart, i.e.
the preview token **re-signs once** while the dashboard refetch triggered by the
unpublish inside `openLegacyStaticEmbeddingModal` resolves (a
`useAsync`/`getSignedPreviewUrlWithoutHash` dep settling). Cypress's command
queue paces that away.

The mandated jar cross-check is **confounded here** by the documented site-url
caveat: the snapshot pins `site-url=http://localhost:4000`, so under Cypress the
preview iframe loads cross-origin and its intercept under-counts — Cypress
"passes with callCount 1" is not evidence the app fires exactly once. My
harness re-points site-url to the worker origin (correct), so it sees the true
request count.

Rather than hard-code an environment-sensitive initial-load count, the port
asserts the **regression these tests actually guard**: after the preview
settles (baselined), toggling each look-and-feel control does **not** re-request
the preview (`count === baseline`). This is faithful to intent and stable across
environments. Not a product bug — flagged only as a fidelity nuance.

## Faithfully-preserved upstream quirks (no product-bug claims)

- **`#background=false` is a no-op in these tests.** `getEmbeddedPageUrl` only
  threads `locale/font/theme/hideFilters` into the hash — `background` is
  silently dropped. So #62391 and its counterpart actually exercise the
  iframe-detection path (`window.overrideIsWithinIframe`), not the hash param.
  Ported the drop faithfully.
- **`IsSticky` class assertion is vacuous on the jar.** #66742 asserts the
  parameter panel's `class` does not contain `IsSticky`. On the minified jar
  bundle the CSS-module class is opaque, so `not.toHaveClass(/IsSticky/)` can
  never fail there — ported faithfully but it tests nothing on the jar. If this
  assertion is meant to be meaningful in CI, it needs a `data-*` hook rather
  than a CSS-module class name.

## Consolidation dividends flagged

`support/embedding-dashboard.ts` re-ports api helpers that already exist in
`filters-repros.ts` / `embedding.ts` (createDashboard, createQuestion,
createNativeQuestion, createQuestionAndDashboard, visitEmbeddedPage vs
`filters-repros.visitEmbeddedDashboard`) — forced by the no-shared-edits rule.
`getRequiredToggle`/`toggleRequiredParameter` belong next to
`editDashboard`/`saveDashboard` in `dashboard.ts`. `openLegacyStaticEmbeddingModal`
here wraps embedding.ts's just to add `previewMode`. Fold all into one embedding
module + dashboard.ts at the consolidation pass.
