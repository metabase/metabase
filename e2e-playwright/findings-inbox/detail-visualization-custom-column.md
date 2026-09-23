# detail-visualization-custom-column

Source: `e2e/test/scenarios/question/detail-visualization-custom-column.cy.spec.ts`
Target: `tests/detail-visualization-custom-column.spec.ts`
Slot 5, jar mode (COMMIT-ID 751c2a98).

## Result

1/1 passing on the jar; 2/2 under `--repeat-each=2`; tsc clean. Passed first
attempt with zero fixes. No `test.fixme`, no product-bug claims — no
cross-check needed.

## Port notes (no new gotchas)

- Trivial one-test spec. Every helper already existed — nothing added, no
  `support/detail-visualization-custom-column.ts` created, no helper-index
  regen needed.
- `H.createQuestion({ visitQuestion: true })` → `createQuestion` (factory
  creates only) + `visitQuestion`. `H.openNotebook` / `H.addCustomColumn`
  (cc-fields.ts) / `H.enterCustomColumnDetails` (notebook.ts) imported
  read-only. `cy.button` → `getByRole("button", { exact })`.
- The object-detail viz testid is `object-detail` (singular), NOT the
  detail-view page's `object-details` in support/detail-view.ts — easy to
  conflate.
- `cy.findByText(string)` ported exact (rule 1). Faithful `.should("exist")`
  rendered as `toBeVisible()` (single match, genuinely visible).

## Dividends

None.
