# dashboard-filters-sql-number

Port of `dashboard-filters/dashboard-filters-sql-number.cy.spec.js` → `tests/dashboard-filters-sql-number.spec.ts`.
1 test (metabase#31975). Verified on the jar (slot 3), green, 2/2 under `--repeat-each=2`, tsc clean.

## Fixes classified

- **Known gotcha (widget re-render / focus-dependent attribute).** The inline
  dashboard number widget (`number/=` mapped to a SQL variable) renders a
  `<textbox>` whose `placeholder` equals the filter name — but **only while
  unfocused**. On focus it drops the placeholder and swaps in a `"Price:"` label
  sibling. Cypress's `findByPlaceholderText("Price").type(...)` resolves the
  subject once and reuses that element through the chain, so the vanishing
  placeholder never bites it. Ported literally as a re-resolving
  `getByPlaceholder("Price")` + `pressSequentially`, the first click focuses the
  input, the placeholder disappears, and every subsequent keystroke times out
  waiting for the (now-gone) placeholder. Fix: scope to the parameter widget
  (`filterWidget(page).nth(index)`, order = `filterDetails` = Rating 0 / Price 1)
  and target `getByRole("textbox")`, which is stable across focus. This is a
  concrete instance of the general "a widget re-renders under a resolved locator"
  class — here the element is stable but one of its *attributes* (the one the
  locator matched on) is transient.

No product bugs, no test.fixme, no dividend. Behaviour matches upstream.

## Notes

- beforeEach create-and-connect flow (native question with two number
  template-tags + dashboard with two `number/=` params + dashcard
  `parameter_mappings`) lives in `support/dashboard-filters-sql-number.ts`
  (`setupSqlNumberDashboard`), built on the shared
  `createNativeQuestionAndDashboard` factory + a follow-up mapping PUT.
- No `cy.wait` in the original; the auto-retrying `expect` on the table-body row
  count / cell text carries the load wait.
