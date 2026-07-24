# sharing-download-reproductions

Port of `sharing/downloads/sharing-download-reproductions.cy.spec.js`
(21 tests: 20 executed, 1 skipped). Verified on the jar (slot 2), green under
`--repeat-each=2` (40 passed / 2 skipped). No product bugs; no fixmes.

## Migration dividends

- **Real downloads land as files.** Every reproduction reuses the shared
  `downloadAndAssert` (support/downloads.ts), which waits for the real browser
  download and parses the sheet — so each test now asserts a 200 + correct
  content-type + non-empty rows, where the Cypress original intercepted the
  export request and redirected it away without ever reading the file. Strictly
  stronger, for free, on all 20 executed cases.

## Fixes classified (all known gotchas — no new ones)

- **Sortable table-column reorder → `moveDnDKitPointer`, not the synthetic
  MouseEvent helper.** Issue 19889's `beforeEach` reorders "column a" past
  "column b" by dragging the header. The data-grid header wires dnd-kit's
  PointerSensor AND MouseSensor (activation distance 10; `restrictToHorizontalAxis`),
  with the activator listeners spread onto the inner `S.headerContent` div
  (SortableHeader.tsx). `moveDnDKitElementSynthetic` (MouseEvents dispatched once
  from the original box) did NOT activate the reorder — header text was unchanged
  and the question never went dirty. Switching to `moveDnDKitPointer` (dnd.ts —
  its doc-comment already names "sortable column header" as the canonical case;
  re-reads the box before every PointerEvent as the drag ghost slides) reorders
  correctly. Reinforces the dnd.ts split: pointer helper for sliding sortable
  headers, synthetic-mouse helper only for scroll-clipped targets.

- **Replaced a "give the DOM time to update" click with a real settle.** The
  Cypress reorder ended with `cy.findByText("Started from").click()` purely to
  pace the DOM. The lineage label only renders once the question is dirty, and
  it never appeared because the drag hadn't landed — an unreliable settle even
  once the drag was fixed. Port polls the header order until it reads
  "column b column a", which both settles and verifies the drag took effect.

- **Duplicate `it` titles → suffixed (Playwright hard-load-error rule).** Issue
  19889's three inner `it`s have static titles run once per file type
  (csv/xlsx), so each appears twice. Playwright fails to parse duplicate titles;
  each is suffixed with `(${fileType})`.

- **`cy.skipOn(fileType === "csv")` → `test.skip`** for issue 18382's csv case
  (still broken upstream, xlsx only).

- **`{selectall}` isn't parsed by `typeInNativeEditor`** — ported issue 19889's
  editor rewrite as `focusNativeEditor` + `ControlOrMeta+a` + plain
  `keyboard.type`, matching `H.NativeEditor.focus().type("{selectall}...")`.

- **`cy.wrap(id).as("questionId")`** has no Playwright equivalent; the created
  card id is stashed on the page object between `beforeEach` and the test body.

## New helpers (support/sharing-download-reproductions.ts)

`remapProductIdToProductTitle`, `saveAndOverwrite`, `openNativeEditor`,
`reorderColumnAPastColumnB`. Imports the shared `moveDnDKitPointer` (dnd.ts),
`downloadAndAssert` (downloads.ts), factories, native-editor, permissions'
`visitQuestionAdhoc`, models' `runNativeQuery` — no shared files edited.
