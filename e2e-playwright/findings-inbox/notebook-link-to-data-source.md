# notebook-link-to-data-source

Source: `question/notebook-link-to-data-source.cy.spec.ts`
Port: `tests/notebook-link-to-data-source.spec.ts` (16 tests, jar slot 3, 16/16
green; 32/32 under `--repeat-each=2`). tsc clean (the two errors tsc reports are
in a sibling agent's `snippets.spec.ts`, not this port).

No product bugs, no fixmes — every test is a faithful pass, so no Cypress
cross-check was needed.

## New gotcha (feedback loop)

**`H.createQuestion(details, { visitQuestion: true })` on a MODEL visits
`/model/:id`, not `/question/:id` — port it as `visitModel`, not
`visitQuestion`.** `createQuestion.ts` branches on `type`: model → `visitModel`,
metric → `visitMetric`, else `visitQuestion`. The `factories.ts` port only
creates the card; the spec then navigates itself, and I naively used
`visitQuestion(page, nestedModel.id)` for the two "nested model as the data
source" tests. Visiting a model at `/question/:id` fires `/api/dataset` (the
model-query path), **not** `/api/card/:id/query`, so `ui.ts visitQuestion`'s
card-query `waitForResponse` burned the full 30s. Fix: `visitModel` (waits
`/api/dataset`). Fingerprint: only the model-typed nested cases hung; the
question-typed ones passed — a clean tell that the endpoint, not the page,
differed. Worth a brief in the brief: **when porting a `createQuestion(...,
{ visitQuestion: true })` whose `type` is model/metric, use the matching
`visitModel`/`visitMetric`.**

## Migration dividend / reusable pattern

**"Meta-click opens in a new tab" ports via a `window.open` override, not a
popup handler.** The app opens the data source with `window.open(url,
"_blank")` (`Urls.openInNewTab`); Cypress stubs `win.open` to
`win.location.assign(url)` so the same page can be asserted. Playwright would
otherwise spawn a popup `Page`. `openDataSourceInSameTab` (new helper) does the
same via `page.addInitScript` — register it in `beforeEach` before the first
`goto`, since init scripts run on every navigation. `H.holdMetaKey`
(`{metaKey}`/`{ctrlKey}` per platform) ports cleanly to
`click({ modifiers: ["ControlOrMeta"] })`, and `METAKEY` ("⌘"/"Ctrl") to
`process.platform === "darwin" ? … : …` (Chromium reports the host platform to
`navigator.platform`, matching the FE's `isMac()` on both mac dev and Linux CI).

New helpers all live in `support/notebook-link-to-data-source.ts`
(`METAKEY`, `SANDBOXED_ATTR_UID`, `metaClick`, `openDataSourceInSameTab`,
`assertDatasetReqIsSandboxed`). `assertDatasetReqIsSandboxed` is a candidate to
fold into a shared permissions helper later (dashboard-reproductions inlines the
same is_sandboxed/column-value check).
