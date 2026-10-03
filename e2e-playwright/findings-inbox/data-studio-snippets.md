# data-studio-snippets (e2e/test/scenarios/data-studio/snippets.cy.spec.ts)

Result: **14/14 passing on the CI uberjar** (COMMIT-ID 751c2a98, verified
`/api/session/properties` `version.hash` = `751c2a9` against a `java -jar` process
on :4101), stable at 28/28 under `--repeat-each=2`. `bunx tsc --noEmit` clean.
No skips, no fixmes, no cross-check needed — the port was green on its first run.

## Dividends

**None worth the name.** This is an unusually well-written upstream spec: every
`it` ends on a real assertion, no vacuous `should`s, no discarded helper
arguments, no dead intercepts. Saying so plainly rather than padding.

One micro-strengthening, recorded for honesty rather than as a finding: in
"should be able to archive a snippet" the upstream absence check runs
immediately after the archive modal dismisses, while the app is `push()`-ing
back to the library — so `libraryPage().findByText("Test snippet")
.should("not.exist")` can be satisfied by the library page not having mounted
yet. The port anchors on `expect(libraryPage(page)).toBeVisible()` first. Same
intent, non-vacuous.

## Snowplow: incidental, so stubbed away entirely

The upstream `beforeEach` calls `H.resetSnowplow()` and **not one test asserts an
event** — no `expectUnstructuredSnowplowEvent`, no `expectNoBadSnowplowEvents`
afterEach. So this is the case PORTING rule 6 is actually written for, not the
`search-snowplow` case: the reset is simply dropped, and nothing is degraded
because there was nothing to degrade. The browser-boundary capture technique was
not needed and would have bought zero coverage here. (The consequence still worth
stating: these 14 tests carry **no** analytics coverage, upstream included.)

## Porting gotchas hit (all already documented — the brief's pre-reading paid off)

- `findByDisplayValue("New SQL snippet")` targets an `EditableText`, i.e. a
  **textarea**. The shared `filters-repros.findByDisplayValue` (input/textarea/
  select) is the right tool; an input-only scan finds nothing.
- Blur via `page.locator("textarea:focus").blur()`, never Tab — EditableText's
  root `onKeyDown` re-focuses on every non-Enter key.
- `.type()` caret is at position 0 after a Playwright click → `press("End")`
  before appending "1" to the snippet name, else the value comes out "1Test
  snippet".
- CodeMirror focus assertion before typing (rule 5): `focusSnippetEditor` clicks
  the right edge (mirroring the Cypress helper's `click("right", {force:true})`,
  which exists to park the caret at the end) and then asserts `cm-focused`.
- Toast text assertions use `.filter({hasText}).first()` and wait for the toast
  to be *gone* after closing it, so the name/description toasts in
  "preserve unsaved content changes" can never collide in strict mode.

## New gotcha worth adding to PORTING.md

**`PaneHeaderActions` renders NOTHING while the form is pristine.** On the snippet
*edit* page the Save/Cancel buttons do not exist at all until `isDirty` — they are
not merely disabled (`if (!isDirty && !isSaving && !alwaysVisible) return null`).
On the *new* page `isDirty` is hardcoded `true`, so there Save exists and is
`disabled` until valid. A port that asserts `toBeDisabled()` on the edit page's
Save before typing would burn its whole timeout on a locator that resolves to
zero elements — a failure that reads as "the page didn't load". Generalises to
every data-studio pane header (transforms, tables, measures).

Second, smaller: **`EditableText` with `isMarkdown` unmounts its textarea once a
value is committed** (`shouldShowMarkdown = isMarkdown && !isInFocus && inputValue`
→ renders `<Markdown>` instead). So a `findByPlaceholderText("No description")`
helper resolves only while the description is empty *or* focused, and the
post-save assertion has to be `getByText("desc")`, not `toHaveValue`. This is the
concrete mechanism behind the existing "title vs description are different
widgets" note.

## Consolidation debt

- `support/data-studio-snippets.ts` duplicates nothing from `support/snippets.ts`
  (the native-editor sidebar port) — the two specs share a name and almost no
  surface. `snippets.ts` has a `codeMirrorValue(scope)`; mine has
  `snippetEditorValue(page)` scoped to `[data-testid=snippet-editor]`. Both are
  ports of the same `H.codeMirrorValue`/`codeMirrorHelpers().value()` pair, which
  differ upstream only in the placeholder special-case. A scope-parameterised
  `codeMirrorValue(scope)` in a shared module would absorb both **and** the
  `snippetEditor`/`focusSnippetEditor`/`typeInSnippetEditor` trio, which is a
  testid-parameterised copy of `native-editor.ts`'s
  `nativeEditor`/`focusNativeEditor`/`typeInNativeEditor`. Cypress has exactly one
  copy (`codeMirrorHelpers(testId)`), so consolidating toward a
  `codeMirrorHelpers(page, testId)` factory stays faithful. **This is the
  strongest consolidation candidate I saw — three port modules now re-implement
  the same CodeMirror factory with a different testid baked in.**
- The four `waitFor*` response helpers here (create/update snippet,
  create/update collection) are one-line `waitForResponse` predicates that several
  ports keep re-deriving. A generic
  `waitForApi(page, method, pathnameOrRegExp)` in a shared module would retire
  dozens of these.
- `blurEditableText` is a third copy of the "blur via `textarea:focus`" idiom —
  belongs in `ui.ts` next to `modal`/`popover`.
