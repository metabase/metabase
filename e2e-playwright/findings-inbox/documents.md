# documents.cy.spec.ts — port findings

Source: `e2e/test/scenarios/documents/documents.cy.spec.ts` (1942 lines, 37 tests)
Port: `e2e-playwright/tests/documents.spec.ts` (2241 lines, 37 tests)

## 1. Dead test upstream: "should support formatting via floating menu" never runs in Cypress

**Test-suite defect. Confirmed by brace-matching, not inference.**

In the Cypress source, `it("should support typing with a markdown syntax")` spans
lines 619–756. `it("should support formatting via floating menu")` is declared at
line 682 — **inside the markdown test's callback body**, not as a sibling.

Mocha registers `it()` at suite-definition time. An `it()` evaluated while a test
is already executing is never attached to the running suite's schedule, so the
floating-menu test's body never executes. It is dead code that reads as coverage:
the file appears to test the rich-text floating format menu (bold/italic/strike/
code/H1/H2/list/ordered-list/quote), and none of it has ever run.

Indentation is the tell — the markdown `it(` is at 4 spaces, the floating-menu
`it(` at 6.

The port declares it as a real sibling `test()`, so this assertion set executes
for the first time.

**Status: see §2 for what happened when it actually ran.**

## 2. NEW GOTCHA: Mantine Modal roots are zero-box — `should("be.visible")` and `toBeVisible()` disagree

**Infra discovery. Reusable across every remaining port.** Not a product bug.

`ConfirmModal` spreads its extra props onto Mantine's `<Modal>`, and Mantine puts
them on the modal **root**. Measured live (DOM probe against slot 9):

| element | box | position |
|---|---|---|
| root (`data-testid="save-confirmation"`) | **1280 x 0** | `static` |
| `.mb-mantine-Modal-overlay` | 1280 x 720 | `fixed` |
| `.mb-mantine-Modal-inner` | 1280 x 720 | `fixed` |
| `[role="dialog"]` (content) | 620 x 190 | — |

The root is `position: static` and *both* its children are `position: fixed`, so
it has no in-flow content and collapses to **height 0**. The modal is genuinely
open — root `visibility: visible`, `opacity: 1`, `innerText` = "Save your changes
first / You need to save before you can duplicate this document. / Cancel / Save
changes".

- **Cypress** `should("be.visible")` **passes**: Cypress treats a zero-box
  element as visible if it has a visible child (`elHasVisibleChild`).
- **Playwright** `toBeVisible()` **fails**: it requires a non-empty bounding box,
  reporting `hidden` for an obviously-open modal.

So `cy.findByTestId(<modal>).should("be.visible")` does **not** port to
`expect(page.getByTestId(<modal>)).toBeVisible()`. Scope to the dialog content:

```ts
page.getByTestId(testId).getByRole("dialog")   // modalContentByTestId()
```

`should("not.exist")` → `toHaveCount(0)` on the **root** is still correct: the
root only renders while the modal is open.

Helper added: `modalContentByTestId` in `support/documents-core.ts` (fold into a
shared ui module at consolidation — this applies to any modal whose testid is
spread onto Mantine's `Modal`, not just documents).

**Scope caveat**: verified for `ConfirmModal` via the props-spread path. Modals
that put their testid on inner content (e.g. `leave-confirmation`, asserted here
only via child locators) are unaffected. Not audited across other specs.

## 3. NEW GOTCHA: stubbing Snowplow to a no-op silently removes an implicit wait

**Port bug (mine), but the trap is general — PORTING.md rule 6 needs a caveat.**

Rule 6 says "Snowplow helpers → no-op stubs with a TODO block". That is right for
*assertions*, but `H.expectUnstructuredSnowplowEvent` **polls snowplow-micro
until the event arrives**. Upstream specs therefore get an accidental
synchronization point wherever they assert an event right after a UI action.
Replacing it with `async () => {}` deletes that wait.

Concretely, in "should allow you to create a new document from the new button and
save": upstream clicks Bookmark, asserts the `bookmark_added` event (poll), then
`cy.request("DELETE", "/api/bookmark/document/1")`. With a no-op stub the DELETE
races the UI's POST. Measured:

```
calls right after DELETE:  ["GET /api/bookmark -> 200"]     <- POST hadn't fired
bookmarks after DELETE:    [{"item_id":1,"type":"document",...}]  <- still there
menu items:  ["Pin this","Remove from bookmarks","Duplicate","Move","Move to trash"]
```

The DELETE ran *before* the bookmark existed, removed nothing, and the POST then
created it — so the doc stayed bookmarked and the "Bookmark" menu item (which the
test clicks next) never appeared. The symptom is a 30s timeout on a locator, ~90
lines from the actual cause.

**Rule of thumb**: wherever the upstream spec asserts a snowplow event between a
UI action and a subsequent API call or assertion, replace the dropped poll with a
`waitForResponse` on the request the action actually fires. Fixed here with
`waitForBookmarkCreate` (POST `/api/bookmark/document/:id`).

**Scope caveat**: this spec's other snowplow assertions are terminal (nothing
depends on them ordering-wise), so this was the only site needing a wait.

<!-- further findings appended below as they are observed -->
