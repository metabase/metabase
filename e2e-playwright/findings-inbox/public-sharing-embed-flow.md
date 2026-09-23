# public-sharing-embed-flow

Source: `e2e/test/scenarios/sharing/public-sharing-embed-flow.cy.spec.ts` (122 lines, 3 tests)
Target: `e2e-playwright/tests/public-sharing-embed-flow.spec.ts`

**Result: 3/3 passing on the jar (COMMIT-ID 751c2a98, verified `version.hash` =
`751c2a9` on :4104 and the PID is `java -jar target/uberjar/metabase.jar`),
6/6 under `--repeat-each=2`, `tsc --noEmit` clean. 0 skipped, 0 fixme.**

## No dividends

No product bug, no Cypress-masked issue, no assertion the port strengthened into
a real finding. Plain clean port.

## Zero new support code — the domain really is covered

Notable only as a data point on the consolidation question: this spec needed
**no new module**. Everything it uses already existed and was imported read-only:

- `getEmbedSidebar`, `embedModalEnableEmbedding` — `support/sdk-embed-setup.ts`.
  Upstream imports `getEmbedSidebar` from the
  `embedding/sdk-iframe-embedding-setup/helpers` barrel, i.e. this sharing spec
  is a *client* of the embed-setup wizard tier; the existing port covers it
  unchanged.
- `waitForSimpleEmbedIframesToLoad`, `getSimpleEmbedIframe` —
  `support/sdk-iframe.ts`.
- `openSharingMenu` (`sharing.ts`), `codeMirrorValue` (`snippets.ts`),
  `visitDashboard` / `visitQuestion` (`ui.ts`).
- `installSnowplowCapture` / `expectUnstructuredSnowplowEvent` /
  `expectNoBadSnowplowEvents` — `support/search-snowplow.ts`, **fifth
  independent spec, still zero modification** to the helper.

Only two spec-local functions were written, both direct ports of the Cypress
spec's own spec-local `optionCardsWrapper` and its `have.css` assertion.

## Port decisions worth recording

1. **`.closest()` → reverse-axis xpath.** `findByText("Behavior").closest("[style*='opacity']")`
   ports as `.locator("xpath=ancestor-or-self::*[contains(@style,'opacity')][1]")`.
   `ancestor-or-self` is a *reverse* axis, so `[1]` is the nearest match — the
   same element jQuery resolves. Worth reusing; `closest()` shows up regularly
   in Cypress specs and has no Playwright primitive.
2. **`should("have.css", …)` must poll.** Cypress retries it; a single
   `evaluate(getComputedStyle)` does not. Ported as `expect.poll`. This one is
   load-bearing here — the test's whole point is the `none` → `all` transition
   after accepting terms.
3. **`findByText("Back").should("not.exist")` kept one-shot.** Per the
   established rule, ported as a non-retrying
   `expect(await sidebar.getByText("Back", {exact:true}).count()).toBe(0)` at a
   defined instant (after the embed preview has rendered), with the anchor's
   implicit existence assertion restored as an explicit
   `await expect(sidebar).toBeVisible()` immediately before.
4. **`H.codeMirrorValue()` is page-wide upstream**; the shared port takes a
   scope, so `codeMirrorValue(page.locator("body"))` reproduces it exactly.
   Wrapped in `expect.poll` (the snippet recompiles asynchronously after
   "publish this dashboard").
5. **No EE gate**, per the don't-gate-by-reflex rule. `activateToken("pro-self-hosted")`
   succeeds on the spike EE jar and all 3 tests execute for real.
6. **`H.expectNoBadSnowplowEvents` degrades to the structural check** (no Iglu
   validation without micro) — the known, already-documented gap; restated in
   the spec header rather than left implicit.

## Mutation checks (all four killed the RIGHT test)

- `"Orders in a dashboard"` → `…ZZZ` in the embed iframe → test 1 fails at
  line 131 only. The dashboard preview iframe genuinely renders.
- `"Orders"` → `"OrdersZZZ"` in the question embed iframe → test 3 fails at
  line 204 only.
- `pointer-events` `"none"` → `"auto"` → test 2 fails with
  `Expected "auto" / Received "none"`, i.e. the dimmed-wrapper assertion is real
  and not vacuously matching a missing element.
- `with-downloads="true"` → `"ZZZ"` → test 2 fails on the generated snippet,
  whose received value starts
  `<script defer src="http://localhost:4104/app/embed.js">…` — proving the
  Get-code → publish-this-dashboard chain and the CodeMirror read both work.
- `event: "embed_wizard_opened"` → `…ZZZ` → test 1 fails `Expected: 1 / Received: 0`,
  so the browser-boundary snowplow capture is genuinely observing events, not
  passing on an empty list.

## Slot hygiene

The spec writes instance-wide settings (`enable-embedding-simple`,
`show-simple-embed-terms`, `show-static-embed-terms`, `enable-embedding-static`).
No `afterEach` restore is needed because every test's `beforeEach` opens with
`mb.restore()`, which wipes the app DB — a mid-test failure cannot poison the
slot for the next test or the next spec. Verified empirically by two consecutive
full runs plus the four mutation runs (each of which left settings dirty) on the
same kept backend; every subsequent run was green.

## Not verified

- No Cypress cross-check was run — nothing failed, so there was nothing to
  establish fidelity *for*.
- The snowplow assertions are structural (no Iglu schema validation), as above.
