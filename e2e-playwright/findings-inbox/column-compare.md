# column-compare.spec.ts

Port of `e2e/test/scenarios/question/column-compare.cy.spec.ts` (1994 lines,
29 tests). New helpers → `support/column-compare.ts`.

## Whole suite is `@skip` upstream — ported as `test.describe.skip`

The upstream describe carries `{ tags: "@skip" }` with the comment
"reenable test when we reenable the 'Compare to the past' components." The
feature the suite exercises is disabled in the product, so the whole suite is a
`test.describe.skip` (preserves the upstream skip per the brief). All 29 tests
skip; tsc clean; `--repeat-each=2` → 58 skipped.

## Verification done (within the skip constraint)

The runtime behaviour of the *presence* tests is unverifiable because the
feature is off — but I validated the port mechanically on the jar (slot 2, CI
EE uberjar `751c2a98`) by temporarily un-skipping:

- **3 absence tests pass on the jar** ("no aggregations", "no temporal columns
  > no breakout / one breakout"). These assert the compare shortcut is *absent*
  and pass regardless of feature state, so they exercise the real helper chain:
  `createAndVisitQuestion`/`visitQuestion`, Summarize button, `rightSidebar`
  Count close-icon, Add aggregation, `verifyNoColumnCompareShortcut`,
  `tableHeaderClick`, Add column, `openNotebook`, and the `PUT /api/field/:id`
  base_type change in the nested `beforeEach`. All green (38.5s incl. boot).
- **1 presence test fails exactly at the disabled feature.** Un-skipped,
  `offset › single aggregation › no breakout` drives all the way to opening the
  aggregation popover and then times out waiting for
  `getByText("Compare to the past")` — element not found. The harness reached
  the exact point where the disabled feature would appear. This confirms the
  documented reason for the upstream `@skip` (feature off), not port drift.

No product-bug claim is made, so no Cypress cross-check was required. Re-skipped
after the checks.

## Not verified

- The *presence* tests' assertions past the "Compare to the past" menu item
  (preset/custom-offset flows, aggregation expressions, breakout ordering,
  result columns). These need the feature enabled; when the upstream skip is
  lifted, run them on the jar before trusting them.
- `verifyAggregations` reads the aggregation expression editor via
  `customExpressionEditor` (`.cm-content`) with `toHaveText`. Upstream read the
  removed Ace editor (`.ace_content`); adapted to the current CodeMirror editor
  per the "stale DOM" guidance, but **unrun** (feature off).

## Fixes / adaptations (all known gotchas, no new ones)

- **Ace → CodeMirror**: `.ace_content` in `verifyAggregations` → the current
  expression editor content node (reused `customExpressionEditor` from
  `custom-column.ts`). Known "stale DOM" pattern.
- **Snowplow → no-op stubs** (rule 6): `resetSnowplow`,
  `expectNoBadSnowplowEvents`, `expectUnstructuredSnowplowEvent` with a TODO.
  The `cy.get("@questionId")` alias + `wrapId`/`idAlias` collapse to capturing
  the id from `api.createQuestion`.
- **`_.omit(info, "step1Title")`** dropped: `verifyColumnDrillText` never reads
  `step1Title`, so passing the full `info` (typed to `Omit<…>`) is identical —
  removes the `underscore` dependency.
- **`should("match", ":first-child")`** → `evaluate(node => node.matches(...))`
  two parents up (`verifyBreakoutExistsAndIsFirst`).
- **`.contains()`** (case-sensitive substring, first match) →
  `filter({ hasText: <escaped regex> }).first()` in `toggleColumnPickerItems`
  and `verifyColumns`.
- **`should("exist")` / `should("not.exist")`** → `toBeAttached()` /
  `toHaveCount(0)`; `verifyNotebookText`'s step2/offset checks use
  `toBeAttached()` (upstream asserts "exist", not "be.visible").

## Consolidation candidate (duplication flagged)

`support/column-compare.ts` has a local `caseSensitiveSubstring` matcher —
duplicates the same helper in `click-behavior.ts` (`caseSensitive`),
`filters-repros.ts` (`caseSensitiveSubstring`), `filters.ts` (`containsText`),
and `wave7-filters-admin.ts`. Candidate for a shared `support/text.ts`.
