# public-sharing-embed-button-behavior

Source: `sharing/public-sharing-embed-button-behavior.cy.spec.js`
Port: `tests/public-sharing-embed-button-behavior.spec.ts`
New helpers: `support/public-sharing-embed-button-behavior.ts`

Verified on the JAR (slot 5, COMMIT-ID 751c2a98). 90 passed / 2 skipped under
`--repeat-each=2`; tsc clean. The 2 skips are the single `@OSS` Embed-JS test
(the jar is EE) × repeat-each. The `pro-self-hosted` token is active on the jar,
so every EE/Pro-gated describe RAN (not skipped).

## New gotcha (FINDINGS candidate)

**Static-embedding appearance controls are hidden inputs positioned OUTSIDE the
modal viewport — `click({ force: true })` fails, `dispatchEvent("click")` works.**
The theme SegmentedControl ("Dark") and the title/border/background/download
Switches in the legacy static-embedding "Look and Feel" tab render as visually
hidden `<input type=radio|checkbox>` that Mantine parks off the modal's viewport.
Cypress `.click({ force: true })` is synthetic and coordinate-free, so it never
cared; Playwright's force click still resolves a click POINT and errors with
`Element is outside of the viewport` (the log shows `scrolling into view … done
scrolling` then the failure — scrollIntoViewIfNeeded can't bring it in). The
faithful equivalent is a coordinate-free `locator.dispatchEvent("click")`
(`toggleAppearanceControl` in the spec). Distinct from the boolean-`disabled`
and `aria-disabled`-ancestor gotchas; this one is purely about the click point
being off-viewport for an otherwise-actionable hidden input.

## Classified fixes

- **Appearance-control force-click → dispatchEvent** — *new gotcha* (above).
  5 tests (the four `static_embed_code_copied` variants + the dashboard
  individual-download test).
- **`#39152` data-picker leaf auto-selects — no `entity-picker-select-button`** —
  *known gotcha / port error I made*. In the "New question" data picker,
  clicking the table leaf ("People") selects it directly; `pickEntity` must NOT
  be given `select: true` (there is no separate select button, unlike the
  save-to-collection entity picker). Faithful to the Cypress
  `H.pickEntity({ path: [...] })` with no select step.

## Notes on fidelity

- Snowplow (rule 6): `resetSnowplow` / `enableTracking` /
  `expectNoBadSnowplowEvents` / `expectUnstructuredSnowplowEvent` are no-op
  stubs. The whole `public {resource} sharing snowplow events` describe
  therefore asserts nothing snowplow-specific — the tests are effectively smoke
  coverage that the copy/publish/unpublish/appearance UI flows execute without
  error. No product-bug claims arise from them; nothing needed the fidelity
  cross-check.
- `cy.clock()` in the `static_embed_published` / `static_embed_unpublished`
  tests only existed to satisfy the (now stubbed) `time_since_*` assertions;
  `page.clock` doesn't freeze time anyway, so the clock was dropped and only the
  Publish/Unpublish UI actions ported.
- The OSS Embed-JS test's Cypress body declares a nested `it(...)` that never
  runs in Mocha (dead code) — not ported as a separate test; noted in a comment.
- No migration dividends (no bugs found, no Cypress-masked issues).

## Consolidation candidate

`support/public-sharing-embed-button-behavior.ts` carries `publishChanges` /
`unpublishChanges` that surface BOTH request and response bodies. The shared
`embedding-dashboard.ts publishChanges` surfaces only the request body; the
"set a proper embedding_type" test needs the response `embedding_type` too.
Candidate to fold the response-body variant back into `embedding-dashboard.ts`.
