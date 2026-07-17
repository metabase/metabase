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

## 4. `should("be.disabled")` on a multi-element set is an ANY assertion, not ALL

**Test-suite defect (weak assertion upstream). NOT a product bug — cross-checked.**

Upstream "read only access" ends with:

```js
H.popover().findAllByRole("menuitem").should("be.disabled");
```

That reads as "every menu item is disabled". It isn't. chai-jQuery implements
`be.disabled` as `$els.is(":disabled")`, and jQuery's `.is()` is true when **any**
element in the set matches. Measured state of that menu as `readonly` (probe
against slot 9):

```
0: "Add supporting text" disabled=true
1: "Edit Visualization"  disabled=true
2: "Edit Query"          disabled=true
3: "Replace"             disabled=true
4: "Download results"    disabled=false   <- enabled, assertion still passes
5: "Remove Chart"        disabled=true
```

The enabled item is **correct product behaviour**, deliberate in
`frontend/src/metabase/rich_text_editing/tiptap/extensions/CardEmbed/CardEmbedMenuDropdown.tsx`:
every editing action is `disabled={!canWrite}`, while Download is
`disabled={isDownloadingData}` — read-only users are meant to download results.

**Fidelity cross-check performed** (`MB_JETTY_PORT=4109 CYPRESS_grep="read only
access" bunx cypress run … --config baseUrl=http://localhost:4109`, port 4000
never touched): Cypress **passes** this test where my port failed it → *the port
drifted*. My first port asserted all items disabled; that was my bug, not the
app's. **No product-bug claim.**

Port now asserts the real intent per item (editing actions disabled, Download
enabled) — strictly stronger than upstream and correct.

**Flakiness observed while cross-checking**: two consecutive full Cypress runs of
this spec against the same backend each failed exactly one test in the "Document
with content" block, but *different* ones ("read only access" in run 1, "should
not clear undo history on save" in run 2), both passing in the other run. The
Cypress spec appears order/timing-flaky here. Not investigated further; the
Playwright port is stable across `--repeat-each=2` (see summary).

## 5. "should support resizing cards" asserts the OPPOSITE of what the app does, and passes by accident

**Test-suite defect — the strongest dividend in this spec. NOT a product bug: the
app's resize behaviour is correct.**

Upstream drags the card's resize handle **down** by 200px and asserts the card
gets **shorter**:

```js
H.documentDoDrag(H.getDragHandleForDocumentResizeNode(resizeNode), { y: 200 });
...
expect(newHeight).to.be.lessThan(ogHeight as number);
```

That is backwards, and it passes anyway. Root cause is in `H.documentDoDrag`
(`e2e/support/helpers/e2e-document-helpers.ts:211`):

```js
cy.wrap(handle).trigger("mousedown", { clientX: rect.x, clientY: rect.y, force: true });
cy.get("body")
  .trigger("mousemove", { clientX: rect.x + deltaX, clientY: rect.y + deltaY, force: true })
  .trigger("mouseup");                      // <-- NO coordinates
```

The final `.trigger("mouseup")` passes no `clientX/clientY`, so Cypress fires it
at the **body's centre** (y=400) instead of the drag destination (y=870). The
resize commits to that stray point — which happens to sit *above* the handle
(y=670) — so the card shrinks. The `{ y: 200 }` delta is effectively discarded.

### Evidence (measured, not inferred)

Instrumented the Cypress helper + spec temporarily (reverted; `e2e/` tree clean)
to print the real numbers, against the same slot-9 backend:

```
PROBEVALUES og=426 new=264
rect={"rectX":600,"rectY":670,"rectW":64,"rectH":4,"deltaX":0,"deltaY":200,
      "innerW":1280,"innerH":800,"scrollY":0}
cardText="Accounts by Created At (Month)" cardBox=264
```

The handle rect (600, 670) and delta (+200) are **identical** to the port's. The
port measured 426 -> **626** (grew by exactly the 200px dragged — correct). The
only difference is the mouseup coordinates. Replaying upstream's exact sequence
in Playwright — mousedown at the handle, mousemove to +200, **mouseup at the body
centre** — reproduces Cypress's number to the pixel:

```
PROBE ogHeight: 426
PROBE info: {"handleY":670,"bodyRect":{"y":0,"height":800},"bodyCenterY":400}
PROBE height after upstream-exact sequence: 264      <- matches Cypress exactly
```

Also ruled out: the card does **not** settle on its own (sampled every frame for
6s from the moment the embed attaches — constant 426, 707 samples), so the shrink
is not a loading transient.

### Why it matters

The test would pass for *any* `deltaY`, and its meaning flips with layout: if the
body's centre were ever *below* the handle (longer document, different scroll
position or viewport), the same code would grow the card and the test would fail
without the app changing. It asserts nothing about resizing.

The port asserts the real behaviour instead: dragging down 200px grows the card
by 200px (`toBeCloseTo(ogHeight + 200, -1)`).

**Scope caveat**: `documentDoDrag` is upstream's shared drag helper, so any other
spec using it inherits the same coordinate-less mouseup. Only this call site was
examined; the flex-resize test in this file passes with the port's real-mouse
drag and was not separately audited upstream.

<!-- further findings appended below as they are observed -->
