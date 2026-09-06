# supporting-text.spec.ts

Port of `e2e/test/scenarios/documents/supporting-text.cy.spec.ts` (12 tests).
Verified on the jar (slot 3, COMMIT-ID 751c2a98): 12/12 green, 24/24 under
`--repeat-each=2`. tsc clean. No `test.fixme`, no product-bug claims.

## Result

- 12 tests, all passing. Same-domain reuse of the just-ported card-embed-node
  surface: `DOCUMENT_WITH_TWO_CARDS`, `DOCUMENT_WITH_THREE_CARDS_AND_COLUMNS`,
  `dragAndDropCardOnAnotherCard`, `flexContainer(s)` imported from
  `support/card-embed-node.ts`; document primitives from
  `support/documents-core.ts` (imported read-only). New helpers isolated to
  `support/supporting-text.ts`.

## Fixes classified (all known gotchas — brief was already tight)

1. **ProseMirror focus (known gotcha).** Supporting text is editable content
   inside the document's single contenteditable. Upstream `cy.realType` after
   "Add supporting text" relied on the command focusing the new node.
   `clickIntoSupportingText` clicks the `.node-paragraph` and asserts the editor
   root `toBeFocused()` before any keystroke. `cy.realType("# Hdg{enter}Lorem
   ipsum")` → `keyboard.type("# Hdg", {delay:25})` + `press("Enter")` +
   `keyboard.type("Lorem ipsum")` (25ms cadence per the wave-9 pacing gotcha).

2. **Self-inflicted locator bug (caught on first jar run, fixed).** First cut of
   `clickIntoSupportingText` resolved the block via the `getSupportingText`
   helper, which filters by `hasText: /Lorem ipsum/` — but tests 3/5/6/7 click
   into the block while it is still EMPTY (placeholder only), so the filter
   matched nothing and 4 tests timed out. Fixed to use the unfiltered
   `supportingText(page)` locator. Not a product/app issue.

3. **`should("have.attr", "data-disabled")` → presence check (known gotcha).**
   The Mantine `Menu.Item` renders a `<button>` with `data-disabled` when
   disabled (`CardEmbedMenuDropdown.tsx:99-105`, `disabled={!canWrite ||
   !handleAddSupportingText}`). One-arg → `toHaveAttribute("data-disabled")`
   (presence). Ancestor button reached with
   `locator("xpath=ancestor-or-self::button[1]")`.

4. **jQuery `.width()` → content-box width (known gotcha).** The resize/persist
   test compares `$el.width()` values; used `contentBoxWidth` from
   documents-core. Closenesses ported literally (±10 / ±3).

5. **Generic `H.documentsDragAndDrop` (helper gap).** card-embed-node.ts only
   ported the card-on-card specialization (`dragAndDropCardOnAnotherCard`). The
   "drag and drop" describe drags a **supporting-text block / its
   `[data-drag-handle]`** onto/from cards, so `support/supporting-text.ts` adds
   the generic `documentsDragAndDrop(page, {getSource, getTarget, side})` taking
   arbitrary Locators — same synthetic event sequence (shared DataTransfer,
   20%/80% clientX side offset) the ProseMirror drop plugin reads. The synthetic
   dispatch works on the hover-gated drag handle without a preceding real hover.

## No dividends

Nothing Cypress-masked; behaviour matches the original at every assertion. The
`.width() as number` "Unjustified type cast. FIXME" comments in the Cypress
original are a Cypress-typing artifact that simply doesn't exist in the
Playwright port (`contentBoxWidth` returns `Promise<number>`).
