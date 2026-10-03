# question-reproductions-2 (question-reproductions/reproductions-2.cy.spec.js)

12 tests across 9 issue repros + a 3-test "Custom columns visualization
settings" describe. **All 12 pass on the CI uberjar (24/24 under
--repeat-each=2).** No product bugs, no `test.fixme`, no dividends — every
fix was port mechanics. Because no test diverged on the jar, no Cypress
cross-check was needed.

## Fixes classified

1. **`saved-question-header-title` data-testid is on the EditableText
   `<textarea>` ITSELF, not a wrapper** (issue 28221). The shared
   `findByDisplayValue(scope, value)` looks for a form control *descendant* of
   `scope`, so scoping it to the title testid matched nothing and burned the
   timeout on `expect(controls.first()).toBeVisible()`. `cy.findByDisplayValue`
   maps cleanly here to `expect(getByTestId("saved-question-header-title"))
   .toHaveValue(name)`. (Known-gotcha-adjacent: PORTING already warns
   `findByDisplayValue` must include textarea; the twist is that the title
   element *is* the textarea, so the descendant scan is the wrong tool.)

2. **The save-question modal defaults its target to a DASHBOARD, not a
   collection** (issue 30165). Porting `H.saveQuestionToCollection("Q1")` as a
   bare `saveQuestion(page, "Q1")` (no path) let the modal save the new native
   question into "Orders in a dashboard" and navigate to the dashboard in edit
   mode — the next `NativeEditor` action then timed out with a completely
   unrelated-looking page. `H.saveQuestionToCollection` explicitly picks
   "Our analytics"; the faithful port must pass `{ path: ["Our analytics"] }`.
   Worth flagging generally: **a `saveQuestionToCollection` in Cypress is not
   interchangeable with a plain `saveQuestion` — the collection pick is
   load-bearing now that the modal can default to a dashboard.**

3. **Save-question modal is a portal that overlays the native editor while it
   animates closed** (issue 30165). Between an in-place save and the next
   `NativeEditor.type`, the modal's portal (`mb-mantine-Textarea-root`)
   intercepts the editor click and the `.cm-content` detaches mid-click.
   Cypress's inter-command latency covered this; the port waits
   `expect(saveModal).toHaveCount(0)` after each save.

## Notes on faithful ports (no fix needed, but non-obvious)

- `cy.button("Summarize")` in issue 27462 is the **notebook action button** in
  the post-aggregation stage (double-aggregation), not a header button —
  `getByRole("button", {name:"Summarize"})` resolves it uniquely.
- issue 30165's `@dataset.all`/`@cardQuery.all` length-0 assertions ("must not
  autorun") → `countResponses(page, predicate)` attached at test start; the
  reproduction is genuinely about requests that must NOT fire.
- issue 43216's four sequential `@queryMetadata` waits and glob search aliases
  (`/api/search*source*`) → per-trigger `waitForResponse` promises
  (`waitForCardQueryMetadata`, `waitForSearchContaining`).

New helpers live in `support/question-reproductions-2.ts` (EXPRESSION_NAME,
goToExpressionSidebarVisualizationSettings, saveModifiedQuestion,
countResponses + isDatasetResponse/isCardQueryResponse,
waitForCardQueryMetadata, waitForSearchContaining). Everything else imported
read-only from shared modules.
