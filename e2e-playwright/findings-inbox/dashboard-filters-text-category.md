# dashboard-filters-text-category

Port of `e2e/test/scenarios/dashboard-filters/dashboard-filters-text-category.cy.spec.js`
→ `tests/dashboard-filters-text-category.spec.ts`. 7 tests, all green on the
jar (slot 1), 14/14 under `--repeat-each=2`. New helpers isolated in
`support/dashboard-filters-text-category.ts`; everything else imported read-only.

## Fixes classified

- **Known gotcha (mixed-content text node).** `cy.findByText("Default value").next().click()`
  ported literally as `getByText("Default value", { exact: true }).locator("following-sibling::*[1]")`
  broke on the *required* test only. Once a parameter is marked required, the
  SettingLabel renders `Default value` **plus** a sibling `<span> (required)</span>`,
  so its full textContent is `"Default value (required)"` — exact getByText (full
  element text) misses it, while testing-library's findByText matched the label's
  *direct text node*. Non-required tests passed because the span is absent. Fixed
  by targeting the widget wrapper directly (`div[aria-labelledby="default-value-label"]`),
  which is exactly what Cypress's `.next()` resolves to and is build-agnostic.
  This is the documented mixed-content-text rule; the required-suffix span is a
  new concrete instance worth flagging.

- **Playwright-only: overlapping Mantine tooltips on sequential disabled-button
  hovers.** The required test hovers the disabled Save button (asserts its
  tooltip), then the disabled Done button (asserts a different tooltip). Under
  cypress-real-events the synthetic hover never overlapped, but Playwright's real
  cursor leaves the Save tooltip in the DOM for a beat after moving to Done, so a
  bare `getByRole("tooltip")` hit a strict-mode 2-element violation. Fixed by
  `.filter({ hasText: ... })` on each assertion (the two tooltip texts are not
  substrings of one another, so each resolves uniquely). Disabled buttons also
  needed `hover({ force: true })` — the disabled control doesn't itself receive
  pointer events.

- **Token-field value entry needs pressSequentially, not fill.** The
  "Contains"/"Starts with"/"Ends with" multi-value widgets are token fields that
  split the typed value on the comma. `addWidgetStringFilter` here uses
  `pressSequentially("oo,aa")` so the comma tokenises into two values (→ "2
  selections", representative row 148.23). The shared `addWidgetStringFilter`
  (actions-on-dashboards.ts) uses `fill()`, which would yield a single token —
  wrong for this spec. Kept a spec-local variant per PORTING rule 5.

## Migration dividend (Cypress-masked no-op assertions)

The shared data file `shared/dashboard-filters-text-category.js` has a typo:
7 of the 10 operator entries spell the negative-assertion key `negativeASsertion`
(capital S) instead of `negativeAssertion`. The spec destructures the correctly
spelled `negativeAssertion`, so on those 7 operators the
`.and("not.contain", negativeAssertion)` check runs as `not.contain(undefined)`
— a silent no-op in Cypress (the dashcard text never contains "undefined"). Only
3 operators (Contains ×2, Does-not-contain multi) actually exercise a negative
assertion. The port reproduces the data verbatim (typo preserved) and guards the
negative assertion on presence, so behaviour is identical — but the coverage gap
is real: for Starts-with, Ends-with, and the single-value Does-not-contain, the
test never verifies the excluded row is absent. Upstream one-char fix would
strengthen 7 assertions.

## Not verified

The 3 negative assertions that DO run were left as-is (guarded). I did not run
the original Cypress spec for a cross-check because every test passed on the jar
on the first/second attempt with no fixme or product-bug claim to substantiate —
the fidelity cross-check is only required before such a claim.
