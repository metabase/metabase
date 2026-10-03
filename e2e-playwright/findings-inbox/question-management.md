# question-management.spec.ts (from question/question-management.cy.spec.js)

Ported faithfully. 29 tests (multi-persona: curate = admin/normal/nodata,
view = readonly, plus "question moving" admin describe and a snowplow describe).
Verified on the CI uberjar (`target/uberjar/metabase.jar`, COMMIT-ID 751c2a98),
slot 4, `PW_PER_WORKER_BACKEND=1`. 28 passed / 1 skipped in isolation; 56 passed
/ 2 skipped under `--repeat-each=2` (the skip is the nodata "move models" test —
nodata users can't turn a question into a model, `cy.skipOn` upstream). tsc clean.

No product bugs found. No test.fixme. No cross-check needed (nothing was
claimed broken).

## Gotcha worth recording (known-gotcha class, EditableText)

**The question DESCRIPTION EditableText collapses to a Markdown text node on
blur — it does NOT stay a placeholder textarea (unlike the TITLE).** The port
first mirrored the title assertion (`toHaveValue` on `getByPlaceholder("Add
description")`) and failed on all 3 curate users: after blur the field
re-renders as `<Markdown>{value}</Markdown>` (EditableText's `shouldShowMarkdown`
branch), so the placeholder textarea is gone entirely — `getByPlaceholder`
matches nothing. This is the inverse of the wave-5/wave-13 EditableText notes,
which say titles render a textarea and to use `findByDisplayValue`/`toHaveValue`:
that holds for the TITLE (isMarkdown=false → always a textarea, placeholder
persists, `toHaveValue("Orders1")` works), but NOT for the DESCRIPTION
(markdown-capable → collapses to text). The faithful port of the upstream
`cy.findByText("foo")` was correct after all: assert the shown text
(`getByText("foo", { exact: true })`), not the input value. Rule of thumb:
markdown-capable EditableText fields (descriptions) → assert rendered text on
blur; plain EditableText (titles) → assert textarea value.

## Port notes (mechanical, no new gotchas)

- `cy.intercept("PUT","/api/card/:id").as("updateQuestion")` (beforeEach) →
  per-action `waitForCardUpdate(page, id)` registered before the triggering
  save; `assertRequestNot403` awaits it and checks `status() !== 403`.
- The 400-on-move test stubs with `page.route` fulfilling a 400 for PUT only
  (continue otherwise) — no redirect involved, so no `mockRedirectResponse`
  concern.
- Title rename: click title → `getByRole("textbox",{name:"Add title"})` (name
  from placeholder) → `press("End")` (caret lands at 0 otherwise) →
  pressSequentially → anchor blur on the PUT — the wave-5 EditableText pattern.
- `findByText(name).parents("a")` picker rows → `xpath=ancestor::a[1]`;
  data-active / data-disabled assertions preserved. `entityPickerModalItem`
  (question-new.ts) reused for the level-1 disabled check.
- Snowplow (`resetSnowplow`/`enableTracking`/`expectNoBadSnowplowEvents`/
  `expectUnstructuredSnowplowEvent`) → no-op stubs (rule 6); the "Turn into a
  model" click is exercised for real.
- `getPersonalCollectionName` had no shared port; added to the new
  support/question-management.ts with a small first/last-name map (the
  Playwright USERS map carries only email/password).
