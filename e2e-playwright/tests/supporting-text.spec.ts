/**
 * Playwright port of
 * e2e/test/scenarios/documents/supporting-text.cy.spec.ts
 *
 * Notes:
 * - Supporting text lives inside the document's single ProseMirror
 *   contenteditable. Before any keystrokes we click into its `.node-paragraph`
 *   and assert the editor took focus (page.keyboard types at
 *   document.activeElement with no retry — the ProseMirror focus gotcha).
 *   Upstream's `cy.realType` after "Add supporting text" relied on the command
 *   focusing the new node; the explicit click is the faithful, robust
 *   equivalent (same caret target).
 * - `cy.realType("# Hdg{enter}Lorem ipsum")` → type "# Hdg", press Enter, type
 *   "Lorem ipsum" (the "# " markdown input rule makes the h1).
 * - The card / supporting-text drags are native HTML5 drags handled by a
 *   ProseMirror plugin that reads the drop event's clientX to pick the side;
 *   the port replays the Cypress helper's synthetic event sequence
 *   (documentsDragAndDrop / dragAndDropCardOnAnotherCard).
 * - `should("have.attr", "data-disabled")` (one-arg) is a presence check; the
 *   Mantine Menu.Item's enclosing button carries `data-disabled` when disabled
 *   → toHaveAttribute("data-disabled").
 * - `should("not.be.visible")`/width work uses jQuery content-box widths →
 *   contentBoxWidth.
 * - No snowplow/gating tags in this spec.
 */
import {
  DOCUMENT_WITH_THREE_CARDS_AND_COLUMNS,
  DOCUMENT_WITH_TWO_CARDS,
  dragAndDropCardOnAnotherCard,
  flexContainer,
  flexContainers,
} from "../support/card-embed-node";
import {
  addToDocument,
  contentBoxWidth,
  createDocument,
  documentContent,
  documentDoDrag,
  documentSaveButton,
  getDocumentCard,
  getResizeHandlesForFlexContainer,
  openDocumentCardMenu,
  visitDocument,
} from "../support/documents-core";
import { expect, test } from "../support/fixtures";
import {
  DOCUMENT_WITH_SUPPORTING_TEXT,
  addSupportingText,
  addSupportingTextMenuItem,
  assertHorizontalLayout,
  assertVerticalLayout,
  clickIntoSupportingText,
  documentsDragAndDrop,
  getSupportingText,
  supportingText,
} from "../support/supporting-text";

test.describe("documents supporting text", () => {
  test.beforeEach(async ({ mb }) => {
    await mb.restore();
    await mb.signInAsAdmin();
  });

  test("should add supporting text to a standalone cardEmbed", async ({
    page,
    mb,
  }) => {
    const doc = await createDocument(mb.api, {
      name: "Supporting Text Test Document",
      document: DOCUMENT_WITH_TWO_CARDS,
      collection_id: null,
    });

    await visitDocument(page, doc.id);

    // Wait for cards to load
    await expect(getDocumentCard(page, "Orders")).toBeVisible();
    await expect(
      getDocumentCard(page, "Orders").getByTestId("table-root"),
    ).toBeAttached();

    // Verify no supporting text or flexContainer exists initially
    await expect(supportingText(page)).toHaveCount(0);
    await expect(flexContainers(page)).toHaveCount(0);

    // Open the card menu and click "Add supporting text"
    await openDocumentCardMenu(page, "Orders");
    await addSupportingTextMenuItem(page).click();

    // Verify a flexContainer was created
    await expect(flexContainer(page)).toBeAttached();

    // Verify supporting text was added
    await expect(supportingText(page)).toBeAttached();

    // Verify the supporting text has the placeholder text
    await expect(supportingText(page)).toContainText("Write whatever you'd like to");

    // Verify the flexContainer contains both supporting text and the card
    await expect(
      flexContainer(page).getByTestId("document-card-supporting-text"),
    ).toBeAttached();
    await expect(
      flexContainer(page).getByTestId("document-card-embed"),
    ).toBeAttached();

    // Verify the card is still there
    await expect(getDocumentCard(page, "Orders")).toBeAttached();
  });

  test("should add supporting text to a cardEmbed in a flexContainer", async ({
    page,
    mb,
  }) => {
    const doc = await createDocument(mb.api, {
      name: "Supporting Text Flex Test Document",
      document: DOCUMENT_WITH_TWO_CARDS,
      collection_id: null,
    });

    await visitDocument(page, doc.id);

    // Wait for cards to load
    await expect(getDocumentCard(page, "Orders")).toBeVisible();
    await expect(
      getDocumentCard(page, "Orders").getByTestId("table-root"),
    ).toBeAttached();
    await expect(getDocumentCard(page, "Orders, Count")).toBeVisible();
    await expect(
      getDocumentCard(page, "Orders, Count").getByTestId("table-root"),
    ).toBeAttached();

    // Create a flexContainer by dropping one card onto another
    await dragAndDropCardOnAnotherCard(page, "Orders", "Orders, Count");

    // Verify flexContainer was created
    await expect(flexContainer(page)).toBeAttached();

    // Verify no supporting text exists yet
    await expect(supportingText(page)).toHaveCount(0);

    // Open the card menu and click "Add supporting text"
    await openDocumentCardMenu(page, "Orders");
    await addSupportingTextMenuItem(page).click();

    // Verify supporting text was added at the beginning of the flexContainer
    await expect(supportingText(page)).toBeAttached();

    // Verify the supporting text has the placeholder text
    await expect(supportingText(page)).toContainText("Write whatever you'd like to");

    // Verify the flexContainer now contains supporting text and both cards
    await expect(
      flexContainer(page).getByTestId("document-card-supporting-text"),
    ).toBeAttached();
    await expect(
      flexContainer(page).getByTestId("document-card-embed"),
    ).toHaveCount(2);
  });

  test("should allow editing supporting text content", async ({ page, mb }) => {
    const doc = await createDocument(mb.api, {
      name: "Edit Supporting Text Test Document",
      document: DOCUMENT_WITH_TWO_CARDS,
      collection_id: null,
    });

    await visitDocument(page, doc.id);

    // Wait for cards to load
    await expect(getDocumentCard(page, "Orders")).toBeVisible();
    await expect(
      getDocumentCard(page, "Orders").getByTestId("table-root"),
    ).toBeAttached();

    // Add supporting text
    await addSupportingText(page, "Orders");

    // Type some content (# Hdg{enter}Lorem ipsum)
    await clickIntoSupportingText(page);
    await page.keyboard.type("# Hdg", { delay: 25 });
    await page.keyboard.press("Enter");
    await page.keyboard.type("Lorem ipsum", { delay: 25 });

    // Verify the text was added
    await expect(
      supportingText(page).locator("h1").filter({ hasText: "Hdg" }),
    ).toBeAttached();
    await expect(
      supportingText(page).locator("p").filter({ hasText: "Lorem ipsum" }),
    ).toBeAttached();
  });

  test("should disable 'Add supporting text' when supporting text already exists in flexContainer", async ({
    page,
    mb,
  }) => {
    const doc = await createDocument(mb.api, {
      name: "Disable Supporting Text Test Document",
      document: DOCUMENT_WITH_TWO_CARDS,
      collection_id: null,
    });

    await visitDocument(page, doc.id);

    // Wait for cards to load
    await expect(getDocumentCard(page, "Orders")).toBeVisible();
    await expect(
      getDocumentCard(page, "Orders").getByTestId("table-root"),
    ).toBeAttached();

    // Add supporting text to the first card
    await addSupportingText(page, "Orders");

    // Try to add another supporting text to the same flexContainer
    await openDocumentCardMenu(page, "Orders");

    // Verify the "Add supporting text" option is disabled
    await expect(
      addSupportingTextMenuItem(page).locator(
        "xpath=ancestor-or-self::button[1]",
      ),
    ).toHaveAttribute("data-disabled");
  });

  test("should disable 'Add supporting text' when flexContainer has 3 cards", async ({
    page,
    mb,
  }) => {
    const doc = await createDocument(mb.api, {
      name: "Max Cards Supporting Text Test Document",
      document: DOCUMENT_WITH_THREE_CARDS_AND_COLUMNS,
      collection_id: null,
    });

    await visitDocument(page, doc.id);

    // Wait for all cards to load
    await expect(getDocumentCard(page, "Orders")).toBeVisible();
    await expect(
      getDocumentCard(page, "Orders").getByTestId("table-root"),
    ).toBeAttached();
    await expect(getDocumentCard(page, "Orders, Count")).toBeVisible();
    await expect(
      getDocumentCard(page, "Orders, Count").getByTestId("table-root"),
    ).toBeAttached();

    // Add the third card to reach MAX_GROUP_SIZE
    await dragAndDropCardOnAnotherCard(
      page,
      "Orders, Count, Grouped by Created At (year)",
      "Orders",
      { side: "right" },
    );

    // Verify flexContainer has 3 cards
    await expect(
      flexContainer(page).getByTestId("document-card-embed"),
    ).toHaveCount(3);

    // Open the card menu
    await openDocumentCardMenu(page, "Orders");

    // Verify the "Add supporting text" option is disabled
    await expect(
      addSupportingTextMenuItem(page).locator(
        "xpath=ancestor-or-self::button[1]",
      ),
    ).toHaveAttribute("data-disabled");
  });

  test("should remove supporting text when it becomes empty and Backspace is pressed", async ({
    page,
    mb,
  }) => {
    const doc = await createDocument(mb.api, {
      name: "Remove Empty Supporting Text Test Document",
      document: DOCUMENT_WITH_TWO_CARDS,
      collection_id: null,
    });

    await visitDocument(page, doc.id);

    // Wait for cards to load
    await expect(getDocumentCard(page, "Orders")).toBeVisible();
    await expect(
      getDocumentCard(page, "Orders").getByTestId("table-root"),
    ).toBeAttached();

    // Add supporting text
    await addSupportingText(page, "Orders");

    // Click into the supporting text
    await clickIntoSupportingText(page);

    // Press Backspace to delete the empty supporting text
    await page.keyboard.press("Backspace");

    // Verify supporting text was removed
    await expect(supportingText(page)).toHaveCount(0);

    // Verify the flexContainer was also removed (unwrapped)
    await expect(flexContainers(page)).toHaveCount(0);

    // Verify the card is still there as a standalone card
    await expect(getDocumentCard(page, "Orders")).toBeAttached();
  });

  test("should allow resizing supporting text and persist width after save", async ({
    page,
    mb,
  }) => {
    const doc = await createDocument(mb.api, {
      name: "Resize Supporting Text Test Document",
      document: DOCUMENT_WITH_TWO_CARDS,
      collection_id: null,
    });

    await visitDocument(page, doc.id);

    // Wait for cards to load
    await expect(getDocumentCard(page, "Orders")).toBeVisible();
    await expect(
      getDocumentCard(page, "Orders").getByTestId("table-root"),
    ).toBeAttached();

    // Add supporting text to create a flexContainer
    await addSupportingText(page, "Orders");

    // Verify flexContainer and supporting text were created
    await expect(flexContainer(page)).toBeAttached();
    await expect(supportingText(page)).toBeAttached();

    // Get initial widths of supporting text and card
    const initialSupportingTextWidth = await contentBoxWidth(
      supportingText(page),
    );
    const initialCardWidth = await contentBoxWidth(
      getDocumentCard(page, "Orders"),
    );

    // Drag the handle to resize (increase supporting text width, decrease card width)
    const handles = getResizeHandlesForFlexContainer(flexContainer(page));
    await documentDoDrag(page, handles.nth(0), { x: 150 });

    // Verify the widths changed
    const newSupportingTextWidth = await contentBoxWidth(supportingText(page));
    const newCardWidth = await contentBoxWidth(getDocumentCard(page, "Orders"));

    // Supporting text should be wider, close to the drag distance
    expect(newSupportingTextWidth).toBeGreaterThan(initialSupportingTextWidth);
    expect(
      Math.abs(newSupportingTextWidth - (initialSupportingTextWidth + 150)),
    ).toBeLessThanOrEqual(10);

    // Card should be narrower, close to the drag distance
    expect(newCardWidth).toBeLessThan(initialCardWidth);
    expect(
      Math.abs(newCardWidth - (initialCardWidth - 150)),
    ).toBeLessThanOrEqual(10);

    // Click into the supporting text to edit it
    await clickIntoSupportingText(page);

    // Type some content
    const testText = "Supporting text for Orders chart";
    await page.keyboard.type(testText, { delay: 25 });
    await page.keyboard.press("Tab");

    // Verify the text was added
    await expect(supportingText(page)).toContainText(testText);

    // Save the document
    await expect(documentSaveButton(page)).toBeEnabled();
    await documentSaveButton(page).click();

    // Wait for save confirmation
    const toast = page.getByTestId("toast-undo");
    await expect(toast).toBeVisible();
    await expect(toast).toContainText("Document saved");

    // Reload the page to verify persistence
    const documentGet = page.waitForResponse(
      (response) =>
        response.request().method() === "GET" &&
        new URL(response.url()).pathname === `/api/document/${doc.id}`,
    );
    await page.reload();
    await documentGet;

    // Wait for the document to load
    await expect(getDocumentCard(page, "Orders")).toBeVisible();
    await expect(
      getDocumentCard(page, "Orders").getByTestId("table-root"),
    ).toBeAttached();

    // Verify the widths are still the same after reload
    const reloadedSupportingTextWidth = await contentBoxWidth(
      supportingText(page),
    );
    const reloadedCardWidth = await contentBoxWidth(
      getDocumentCard(page, "Orders"),
    );

    expect(
      Math.abs(reloadedSupportingTextWidth - newSupportingTextWidth),
    ).toBeLessThanOrEqual(10);
    expect(Math.abs(reloadedCardWidth - newCardWidth)).toBeLessThanOrEqual(10);
  });

  test("should remove supporting text when the last chart in its group is removed", async ({
    page,
    mb,
  }) => {
    const doc = await createDocument(mb.api, {
      name: "Supporting Text auto-cleanup",
      document: DOCUMENT_WITH_THREE_CARDS_AND_COLUMNS,
      collection_id: null,
    });
    await visitDocument(page, doc.id);

    await addSupportingText(page, "Orders");
    await clickIntoSupportingText(page);
    await page.keyboard.type("Lorem ipsum", { delay: 25 });

    const targetCardTitle = "Orders, Count, Grouped by Created At (year)";

    // One card remaining in group, supportingText should exist
    await dragAndDropCardOnAnotherCard(page, "Orders", targetCardTitle);
    await expect(
      documentContent(page).getByText("Lorem ipsum", { exact: true }),
    ).toBeAttached();

    // No cards remaining in group, supportingText should not exist
    await dragAndDropCardOnAnotherCard(page, "Orders, Count", targetCardTitle);
    await expect(
      documentContent(page).getByText("Lorem ipsum", { exact: true }),
    ).toHaveCount(0);
  });

  test.describe("drag and drop", () => {
    let doc: { id: number };

    test.beforeEach(async ({ page, mb }) => {
      doc = await createDocument(mb.api, {
        name: "DnD Test Document",
        document: DOCUMENT_WITH_SUPPORTING_TEXT,
        collection_id: null,
      });
      await visitDocument(page, doc.id);
    });

    test("should reorder when dropping a supporting text block onto a card", async ({
      page,
    }) => {
      await expect(getDocumentCard(page, "Orders")).toBeAttached();
      await documentsDragAndDrop(page, {
        getSource: () => getSupportingText(page).locator("[data-drag-handle]"),
        getTarget: () => getDocumentCard(page, "Orders"),
        side: "right",
      });

      await assertHorizontalLayout(
        getDocumentCard(page, "Orders"),
        getSupportingText(page),
      );
      await assertVerticalLayout(
        getDocumentCard(page, "Orders"),
        getDocumentCard(page, "Orders, Count"),
      );
    });

    test("should reorder when dropping a card onto a supporting text block", async ({
      page,
    }) => {
      await expect(getDocumentCard(page, "Orders")).toBeAttached();
      await documentsDragAndDrop(page, {
        getSource: () => getDocumentCard(page, "Orders"),
        getTarget: () => getSupportingText(page),
        side: "left",
      });

      await assertHorizontalLayout(
        getDocumentCard(page, "Orders"),
        getSupportingText(page),
      );
      await assertVerticalLayout(
        getDocumentCard(page, "Orders"),
        getDocumentCard(page, "Orders, Count"),
      );
    });

    test("should insert a card when dropped onto a supporting text block", async ({
      page,
    }) => {
      await expect(getDocumentCard(page, "Orders")).toBeAttached();
      await documentsDragAndDrop(page, {
        getSource: () => getDocumentCard(page, "Orders, Count"),
        getTarget: () => getSupportingText(page),
        side: "left",
      });

      await assertHorizontalLayout(
        getDocumentCard(page, "Orders, Count"),
        getSupportingText(page),
      );
      await assertHorizontalLayout(
        getSupportingText(page),
        getDocumentCard(page, "Orders"),
      );
    });

    test("should do nothing if dragging a supporting text block outside of a group", async ({
      page,
    }) => {
      await expect(getDocumentCard(page, "Orders")).toBeAttached();
      await documentsDragAndDrop(page, {
        getSource: () => getSupportingText(page).locator("[data-drag-handle]"),
        getTarget: () => getDocumentCard(page, "Orders, Count"),
      });

      await assertHorizontalLayout(
        getSupportingText(page),
        getDocumentCard(page, "Orders"),
      );
      await assertVerticalLayout(
        getSupportingText(page),
        getDocumentCard(page, "Orders, Count"),
      );
    });
  });
});
