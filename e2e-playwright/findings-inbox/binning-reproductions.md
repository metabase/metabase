# binning-reproductions (binning/binning-reproductions.cy.spec.js)

Ported 6 tests → `tests/binning-reproductions.spec.ts`. New helper file
`support/binning-reproductions.ts` (createNativeQuestionWithMetadata,
pickSavedQuestion, clickBreakoutOptionLeft, openTemporalBucketFromGroupBy).
Everything else imported read-only from binning.ts / notebook.ts / models.ts /
ui.ts / factories.ts / charts / metrics. Verified on the jar (slot 5,
COMMIT-ID 751c2a98): 6/6 green, 12/12 under `--repeat-each=2` (TZ=US/Pacific),
tsc clean. No product bugs, no fixmes.

## Fixes classified (all known/mechanical gotchas — no new product findings)

- **Temporal-bucket button is opacity-gated on row hover** (known "appears on
  hover" gotcha, PORTING rule 4 family). Two tests (#17975, #10441/#11439) do
  `findByLabelText("Temporal bucket").realHover().click()` directly on the
  button. Ported literally, `hover()` fails: the button
  (`data-testid="dimension-list-item-binning"`, opacity 0 until the enclosing
  option/listitem is hovered) resolves but is "not visible". Fix: hover the
  parent row first, then `click({ force: true })` — the exact pattern already
  baked into `getBinningButtonForDimension` in binning.ts. Cypress's `realHover`
  on the descendant happened to trigger the ancestor `:hover` CSS; Playwright
  refuses to act on the invisible element.

- **`loadMetadata: true` / `visitQuestion: true` create options** → the shared
  `visitQuestion` port. Both are the same underlying effect (visit the saved
  card so `result_metadata` populates before it is used as a notebook/join
  source). Wrapped as `createNativeQuestionWithMetadata`; the structured
  `visitQuestion:true` case (#22382) is just `createQuestion` + `visitQuestion`.

- **`click({ position: "left" })` on a breakout option** (#18646) — clicks the
  column-name (left) rather than the temporal-bucket button (right) so the
  column is picked with its default bucket. Ported as a boundingBox-based
  `clickBreakoutOptionLeft` (position `{ x: 6, y: height/2 }`).

- **`cy.wait("@dataset")` → waitForDataset registered before the trigger**
  (rule 2). #16770 also asserts `xhr.response.body.error` absent — ported as
  `expect((await response.json()).error).toBeUndefined()`.

- **Implicit single-match assertions → Playwright strict mode.** #16327's bare
  `cy.findByText("Day")` and #22382's `Count` / `Created At: Month` /
  `June 2025` inside `query-visualization-root` are "fails if rendered twice"
  checks; `expect(getByText(..., {exact:true})).toBeVisible()` reproduces this
  (strict-mode violation on 2 matches).

## Port notes (faithful, no adjustment needed)

- Date-label assertions ("2027", "June 2025") pass on the jar both with and
  without TZ; confirmed under TZ=US/Pacific (CI's process TZ) to be safe.
- The #10441/#11439 test's "these exact steps matter" comment is preserved —
  kept the mini-picker drill (`pickSavedQuestion`), not an API `visitQuestion`.

## Consolidation candidates (later pass)

- `pickSavedQuestion` (mini-picker → "Our analytics" → name) is a very common
  new-question idiom; several binning/notebook ports open the mini-picker and
  drill the same way. Candidate for notebook.ts.
- `openTemporalBucketFromGroupBy` overlaps conceptually with
  `getBinningButtonForDimension` (binning.ts) but targets the notebook group-by
  popover (no `dimension-list-item` testid) rather than the summarize sidebar.
