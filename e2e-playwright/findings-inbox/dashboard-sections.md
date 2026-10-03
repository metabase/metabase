# dashboard-sections

Port of `dashboard-cards/dashboard-sections.cy.spec.js` → `tests/dashboard-sections.spec.ts`.
New helpers in `support/dashboard-sections.ts`. Verified on the jar (COMMIT-ID
751c2a98), slot 4: 2/2 green, 4/4 under `--repeat-each=2`. tsc clean.

## Fixes classified

- **JSDoc `*/` trap (mechanical, no gotcha).** A doc comment containing the
  literal endpoint `/api/card/*/query` closed the JSDoc block early and produced
  a cascade of TS parse errors far from the cause. Rephrased the prose. Worth a
  one-line reminder in a brief but not PORTING-worthy on its own.

- **Shared `filters-repros.findByDisplayValue` has a `.first()` visible guard
  that is wrong for modal Title fields.** The spec's `overwriteDashCardTitle`
  ports `cy.findByDisplayValue(originalTitle).clear().type(newTitle).blur()`.
  cy.findByDisplayValue matches by value regardless of visibility. The shared
  helper opens with `await expect(controls.first()).toBeVisible()` — but the
  visualizer settings modal's FIRST form control is a hidden "Search for
  something" input, so the guard fails before it ever scans for the value:

  ```
  locator resolved to <input ... placeholder="Search for something" .../>
     - unexpected value "hidden"
  ```

  Ported `overwriteDashCardTitle` with an inline value-scan (no visible-first
  guard) instead. This is a **consolidation candidate**: `findByDisplayValue`
  should either drop the `.first()` visibility assertion or scope it to visible
  controls, so it works against modals whose leading control is hidden. Any port
  that reaches for a display value inside a modal with a hidden search input will
  hit this.

## Notes on the port (not findings, just fidelity choices)

- Snowplow is stubbed to no-ops (PORTING rule 6) — the two
  `dashboard_section_added` events assert nothing here.
- `@cardQuery` (`POST /api/card/:id/query`) registered before the entity-picker
  leaf click that triggers it (rule 2). The read-only test likewise registers
  the two `GET /api/collection/:id/items` waits before opening the picker.
- `assertPlaceholderCardCanBeDragged` (metabase#UXW-3387): dashcards live in a
  react-grid-layout (react-draggable) grid that responds to real DOM mouse
  events, so a real-mouse drag drives it. Cypress dragged from x:10,y:50
  (element-relative) to clientX rect.left+900 / rect.top+200; mirrored. Final
  positions read in an `expect.poll` so the grid reflow settles. Not vacuous —
  the poll fails if no card's left edge moves.
- `overwriteDashCardTitle(index=1)` / `getDashboardCard(1)` target dashcard
  index 1 while `selectQuestion` fills the first "Select question" placeholder
  by DOM text order — the app arranges the KPI-grid layout so these coincide
  (the Cypress original relies on the same). Ported the indices verbatim.
