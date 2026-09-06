# reference-databases (onboarding/reference/databases.cy.spec.js)

**No product-bug dividends.** 7/7 executable tests pass on the CI uberjar
(`target/uberjar/metabase.jar`, COMMIT-ID `751c2a98`; confirmed via
`/api/session/properties` → `version.hash 751c2a9` and `ps` showing
`java -jar .../target/uberjar/metabase.jar` on :4101), stable 14/14 under
`--repeat-each=2`. No `test.fixme`, no Cypress cross-check needed — nothing
failed.

## Coverage note: 3 of 10 upstream tests never run

Carried over faithfully as `test.skip`:

- `should let the user navigate to details` — upstream `xit`.
- `should sort data reference database list (metabase#15598)` — `{ tags: "@skip" }`.
- `should sort databases in new native question data selection popover` —
  `{ tags: "@skip" }`.

So the executed count is **7 passed / 3 gate-skipped**, not 10.

## Minor test strengthening (the one dividend, and it is small)

`should let an admin start to edit and cancel without saving` asserted only
`cy.contains("Turns out").should("have.length", 0)`. That is a *real* retrying
absence assertion (unlike `should("not.exist")`, which is one-shot) — but it is
blind to the failure mode where Cancel doesn't exit edit mode at all: the typed
value lives in a `<textarea>`'s `value`, which is not a DOM text node, so
neither `cy.contains` nor `getByText` could ever see it. The port adds
`expect(Cancel button).toHaveCount(0)` first, so the test now actually pins
"editing ended" before checking "the description did not change". Passes 2/2.

## Latent upstream defect (in dead code)

The spec-local `checkQuestionSourceDatabasesOrder()` is declared with **no
parameters** but called as `checkQuestionSourceDatabasesOrder("Native query")` —
the argument is silently discarded. Same class as the `tooltipHeader(x)` /
`completions(x)` cases already in PORTING. It only affects the `@skip`-tagged
native-question test, so nothing is currently mis-asserting; noted so it isn't
re-discovered. The helper is ported with the same shape and the discard is
documented in a comment.

## Snowplow

The x-ray describe's snowplow events **are** the subject
(`H.expectUnstructuredSnowplowEvent` on `x-ray_clicked`), so rule 6's no-op stub
would have made both tests vacuous. Used `installSnowplowCapture`
(support/search-snowplow.ts) with **zero modification** — this is now a fourth
independent spec reusing it unchanged (after search-snowplow,
data-studio-metrics, visualizer-snowplow-tracking). Both events were captured on
the jar in <1s, so the assertions are genuinely executing.

Known, unchanged gap: `expectNoBadSnowplowEvents` degrades to a structural
"every payload decoded" check — it does **not** validate against the Iglu
schemas, so it cannot catch "the FE emits a field the schema rejects".

## Helpers added

`support/reference-databases.ts` (own module, no shared-file edits):

- `startEditingReferenceDetails` — the `cy.button(/Edit/).trigger("click")`
  synthetic-click treatment. The upstream TODO ("calling .click() causes the
  form to immediately reset") applies to all four detail-editing tests; the
  already-landed `5276-remove-field-type.spec.ts` inlines the same
  `dispatchEvent("click")`. **Consolidation candidate**: fold that inline copy
  into this helper.
- `referenceSidebarItem(page, text)` — the
  `findAllByRole("listitem").filter(":contains(...)")` sidebar pattern
  (case-sensitive substring, matching `:contains`).

Everything else reused existing shared helpers: `addSQLiteDatabase` /
`entityPickerModalItem` (question-new.ts), `miniPickerBrowseAll` (joins.ts),
`startNewQuestion` / `entityPickerModalLevel` (notebook.ts), `waitForXray`
(x-rays.ts), `popover` (ui.ts).
