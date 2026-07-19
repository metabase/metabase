# dashcard-replace-question

Source: `dashboard-cards/dashcard-replace-question.cy.spec.js` (snowplow-tagged)
Target: `tests/dashcard-replace-question.spec.ts`
New helpers: `support/dashcard-replace-question.ts`

## Result

3/3 tests green on the jar (slot 4, COMMIT-ID 751c2a98) first try; 6/6 under
`--repeat-each=2`. tsc clean. No `test.fixme`, no product-bug claims — no
cross-check required.

## Fixes / porting decisions (all Known gotchas — nothing new)

- **Snowplow → no-op stubs** (rule 6). `resetSnowplow`/`enableTracking`/
  `expectNoBadSnowplowEvents`/`expectUnstructuredSnowplowEvent` stubbed; the
  Replace UI flow they decorate is ported for real.
- **Reused consolidated mocks** instead of re-implementing: `mockParameter`,
  `mockHeadingDashboardCard`, `mockQuestionDashboardCard` from
  `dashboard-parameters.ts` cover `createMockParameter` /
  `createMockHeadingDashboardCard` / `createMockDashboardCard` faithfully.
- **`cy.wait("@cardQuery")` (`POST /api/card/*/query`)** registered as a
  `waitForResponse` BEFORE the entity-picker question click, awaited after
  (rule 2). The replace action fires the card query on the swapped dashcard.
- **`findByLabelText` → exact** (`getByLabel(..., { exact: true })`) for
  "Replace" / "Show visualization options" / "Title" (rule 1).
- **`findAllByTestId("dashcard").eq(n)`** ported as `getByTestId("dashcard").nth(n)`
  — the raw `dashcard` testid, not `dashcard-container`. DOM order: heading
  (row0) = 0, mapped question = 1, target = 2.
- **undo-toast animation wait dropped.** Cypress waited on
  `$el.position().left === 0` (slide-in settling) before clicking Undo;
  Playwright's actionability already waits for a stable box, so the plain
  `.first().getByRole("button", {name:"Undo"}).click()` covers it. Scoped to
  the first toast (two coexist: "Undo replace" + "Auto-connect").
- **`updateCollectionGraph`** reimplemented locally (10-line GET/merge/PUT) —
  it's a spec-support helper duplicated in click-behavior.ts /
  interactive-embedding.ts, not a shared consolidated one; kept out of shared
  files to avoid coupling.
- **viz-options Title field** is a plain Mantine `TextInput` (not EditableText),
  so `fill()` + `blur()` marks it dirty faithfully — no `pressSequentially`
  dance needed here.

## Migration dividends

None. Clean faithful port.
