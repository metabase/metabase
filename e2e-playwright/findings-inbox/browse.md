# browse.spec.ts (onboarding/home/browse.cy.spec.ts)

16 tests, 16/16 green on the jar first try, 32/32 under `--repeat-each=2`, tsc
clean. Clean port — no `test.fixme`, no product-bug claims, no cross-check
needed (nothing failed).

## Classification of fixes needed

None. Every test ported mechanically and passed. Notable rule applications:

- Snowplow describes (`scenarios > browse`, EE) → `resetSnowplow` /
  `enableTracking` / `expectNoBadSnowplowEvents` / `expectUnstructuredSnowplowEvent`
  no-op stubs from homepage.ts (rule 6).
- Window.open spy (`cy.stub(win, "open")`) → `spyOnWindowOpen` /
  `getWindowOpenCalls` from metrics-browse.ts. The models meta-click test's
  `calledOnceWithExactly` → `expect.poll(getWindowOpenCalls).toHaveLength(1)` +
  `expect(call).toEqual([...])`.
- `cy.icon("model").should("be.visible")` inside a model row → `icon(row, name)`
  is a per-class selector; `.Icon-model` does NOT match `.Icon-model_with_badge`,
  so the unverified/verified icon assertions stay distinct with no `.filter`
  gymnastics.
- The "browsing to a database only triggers a request for schemas" test's
  `cy.spy().as("schemasForOtherDatabases")` → a `page.on("response")` counter
  over `/api/database/(?!1\b)\d+/schemas`, asserted `=== 0` after awaiting the
  sample-DB schemas response (rule 2).
- #37907 field-description edit: Cypress `eq(5).focus().type(" Updated.")`
  appends to a pre-filled description. Ported as `focus()` + `press("End")` +
  `pressSequentially(" Updated.")` (the wave-12 ".type() caret at position 0"
  gotcha applies — a bare `pressSequentially` would have prepended). `eq(0)` was
  a full replace so plain `fill()`. Both `realClick()`s on Edit/Save (the
  Cypress "click() does not work" workaround) ported to plain `click()` — works
  fine in Playwright.
- #74433 tooltip overflow: `tooltip().should("be.visible").and($t => scrollWidth
  <= clientWidth)` → `tooltip(page).first()` + `evaluate` returning
  `[scrollWidth, clientWidth]`, asserted `toBeLessThanOrEqual`.

## Token / EE

The EE describe (`/browse/models allows models to be filtered`) is gated on
`resolveToken("pro-self-hosted")` and calls `mb.api.activateToken`. The jar
activates it — the test ran (not skipped) and passed (4.8s), exercising the
verified-models filter end to end.

## Migration dividends

None found — the app behaved correctly throughout.

## Consolidation candidates (later pass)

- `browseDatabases` currently lives in `support/question-settings.ts` (a
  spec-support file). Three+ browse-family specs want it; promote to a shared
  `support/browse.ts` / `ui.ts`.
- `spyOnWindowOpen` / `getWindowOpenCalls` live in `metrics-browse.ts`;
  `openDataSourceInSameTab` / `metaClick` in `notebook-link-to-data-source.ts`.
  The window.open-spy surface is re-used across browse/metrics/notebook — a
  shared `support/window-open.ts` would collapse them.
