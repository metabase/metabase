# visualizer-reproductions

Port of `dashboard/visualizer/reproductions.cy.spec.ts` (2 tests, both green on
the jar; 4/4 under `--repeat-each=2`, slot 5).

## Result
- 61521 (preserve column settings when using visualizer) — pass
- 65908 / UXW-2293 (hide_empty cards excluded from dashboard height) — pass

No `test.fixme`, no product-bug claims. No new shared-helper file was needed —
everything composed from existing modules (factories, filters-repros,
dashboard-card-repros, visualizer-basics, dashboard, ui). The spec-local
`createDashcard` builder and `dateParameters` fixture stayed spec-local, as
upstream.

## Fixes / classifications (all Known gotchas, no new ones)
- **ECharts axis-text whitespace (rule / wave-11).** Upstream asserts
  `findByText("0.06").should("not.exist")` (and 0.05/0.04) to prove no
  unformatted second axis. testing-library trims before matching, so it catches
  a `" 0.06 "` axis label. Playwright's *exact* `getByText` does NOT trim — an
  exact match would find nothing and the absence assertion would pass
  **vacuously** even if the unformatted axis were present. Ported as NON-exact
  `getByText("0.06")` (substring), which is whitespace-tolerant and keeps the
  absence check meaningful. This is the same axis-whitespace hazard as
  embedding-reproductions, but on the *negative* side where it's a silent-pass
  trap rather than a silent-fail.
- **`cy.intercept("@cardQuery") + cy.wait` → `waitForCardQueries`** (register
  before the swap-dataset click, await after). Reused read-only from
  visualizer-basics.
- **`.realHover(...).findByLabelText("Visualize another way").click()`** →
  `showDashcardVisualizerModal(page, 0, { isVisualizerCard: false })` (native
  hover + force-click + modal-open/loader gating). Reused read-only.
- **EditableText title is a `<textarea>`** → `findByDisplayValue`
  (filters-repros, which scans textarea/select) for the dashboard-title
  visibility check in 65908; an input-only scan would miss it.
- **`should("not.have.attr","aria-pressed","true")`** → `.not.toHaveAttribute(
  "aria-pressed","true")` (passes when absent or ≠ "true" — matches Cypress).

## Dividends
None. Both behaviours reproduce correctly on the jar; nothing Cypress was
masking, nothing strengthened beyond the axis-whitespace substring note above.

## Not verified
- No `--browser chrome` Cypress cross-check was run: nothing diverged on the
  jar, so the fidelity cross-check (which only fires before a fixme/product-bug
  claim) wasn't triggered.
