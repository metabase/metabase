# content-translation-dashboards.spec.ts

From `admin/i18n/content-translation/dashboards.cy.spec.ts` (EE content
translation of dashboards rendered as static "guest" embeds). 16 tests across 8
describes. Green on the jar (slot 3), 32/32 under `--repeat-each=2`. tsc clean.

EE-gated on the pro-self-hosted token (`test.skip(!resolveToken(...))`). The
translation dictionary is uploaded via a LOCAL in-process CSV (multipart POST
`/api/ee/content-translation/upload-dictionary`) — no external infra.

New file: `support/content-translation-dashboards.ts` (upload helper +
dictionary fixtures + embed-response waits + card/tab builders). No shared files
edited; everything else imported from existing modules
(embedding-dashboard.ts's full static-embed surface, factories, dashboard.ts,
visualizer-basics/cartesian, ui.ts, charts.ts).

## Fixes / classification

- **Gotcha (Playwright actionability, not app): a Mantine Combobox's floating
  dropdown covers the widget's submit button.** In the MultiAutocomplete filter
  test, after picking a `role="option"` the Combobox dropdown (a floating
  `mb-mantine-Popover-dropdown`, `z-index:300`) stays open and floats over the
  "Ajouter un filtre"/"Mettre à jour le filtre" button at the bottom of the same
  `parameter-value-dropdown`. A real click → "ScrollArea viewport intercepts
  pointer events"; `click({force:true})` "succeeds" but lands on the overlay
  (force skips actionability, not coordinate hit-testing), so the filter applies
  empty (row count stayed at the unfiltered value). Fix: `page.keyboard.press
  ("Escape")` to close the Combobox (the picked pill survives), which is exactly
  why upstream's *second* interaction presses Escape before clicking the update
  button — the first relied on Cypress's synthetic click ignoring the overlay.
  Park the mouse (`page.mouse.move(0,0)`) before the Escape (the parked-cursor
  tooltip-eats-Escape class). Selected options are `div[role="option"]` whose
  `value` is the UNtranslated string and whose text is the translated label —
  target them with `getByRole("option", { name: <translated>, exact: true })`.

- **Gotcha (rule 2 corollary): cached typeahead search fires no second request.**
  Upstream waits for `@searchQuery` only after the *first* "Fran" type; the
  second reopen+type reuses cached results and fires no `/api/embed/dashboard/
  .../search/...` GET. A `waitForResponse` on the second type hangs 30s. Port
  only the waits upstream actually has.

## Notes (faithful-port decisions)

- `H.visitEmbeddedPage` → embedding-dashboard.ts `visitEmbeddedPage` (signs a
  JWT and navigates top-level to `/embed/dashboard/<token>#locale=…`). Static
  embeds render at the top level — no iframe harness needed (unlike full-app
  embedding, rule 8).
- The "card titles"/"values translation" describes intercept the app-mode card
  query POST, but that endpoint does NOT fire inside a static embed (embeds use
  a GET under `/api/embed/dashboard`). Their `cy.wait("@cardQuery")` is satisfied
  retroactively by the pre-embed app-mode render (cy.wait consumes past
  responses), so those waits are dropped; the retrying translated-text
  assertions carry the timing. The ee describe's `@cardQuery` intercepts the
  embed GET (`.../card/…`), which does fire — kept, registered before the visit.
- `before()`+`H.snapshot`+`beforeEach(H.restore(snapshot))` (measure names,
  filters/ee, tab names) → the per-worker `snapshotReady`-flag pattern
  (metrics-explorer precedent); `mb` is test-scoped so there's no `beforeAll`.
  The token is captured into the snapshot (activateToken before snapshot), so
  restore keeps it active.
- Empty `describe("Boolean content", () => {})` upstream — not ported (no tests).
- `uploadTranslationDictionaryViaAPI`: MetabaseApi only speaks JSON `data`, so
  the multipart upload drives `api.requestContext.fetch(..., { multipart })`
  directly with the cached admin session header (`LOGIN_CACHE.admin.sessionId`),
  mirroring the Cypress helper's `cy.signInAsAdmin()` + `cy.request` form-data.

No test.fixme / product-bug claims — all 16 tests pass on the jar.
