/**
 * Playwright port of
 * e2e/test/scenarios/documents/card-embed-node.cy.spec.ts
 *
 * Notes:
 * - The card drop is a native HTML5 drag handled by a ProseMirror plugin that
 *   reads the drop event's clientX to pick the side; the port replays the
 *   Cypress helper's exact synthetic event sequence (see
 *   support/card-embed-node.ts dragAndDropCardOnAnotherCard).
 * - The two open-in-new-tab tests assert the captured anchor OUTSIDE the
 *   HTMLAnchorElement.prototype.click hook, so a never-fired anchor fails
 *   loudly (upstream's callback-scoped `expect(...).to.have.attr` would be
 *   silently green). The `cy.on("uncaught:exception")` guards were only needed
 *   because upstream asserted inside the hook — dropped here.
 * - Card-embed delete: realClick({ position: "top" }) → click at top-center;
 *   cy.realPress("Backspace") → page.keyboard.press("Backspace").
 * - No snowplow/gating tags in this spec.
 */
import {
  DOCUMENT_WITH_THREE_CARDS_AND_COLUMNS,
  DOCUMENT_WITH_TWO_CARDS,
  addNewStandaloneCard,
  assertFlexContainerCardsOrder,
  captureNextAnchorClick,
  createReviewsTextWrapModel,
  documentUndo,
  dragAndDropCardOnAnotherCard,
  expectCapturedAnchor,
  expectCloseTo,
  flexContainer,
  flexContainers,
  getCardWidths,
  selectCardEmbedFromTop,
} from "../support/card-embed-node";
import {
  addToDocument,
  commandSuggestionItem,
  createDocument,
  documentContent,
  documentDoDrag,
  getDocumentCard,
  getFlexContainerForCard,
  getResizeHandlesForFlexContainer,
  openDocumentCardMenu,
  visitDocument,
} from "../support/documents-core";
import { test, expect } from "../support/fixtures";
import { popover } from "../support/ui";

test.describe("documents card embed node custom logic", () => {
  test.beforeEach(async ({ mb }) => {
    await mb.restore();
    await mb.signInAsAdmin();
  });

  test.describe("cardEmbed drag and drop", () => {
    let doc: { id: number };

    test.beforeEach(async ({ page, mb }) => {
      doc = await createDocument(mb.api, {
        name: "DnD Test Document",
        document: DOCUMENT_WITH_TWO_CARDS,
        collection_id: null,
      });
      await visitDocument(page, doc.id);
    });

    test("should create a flexContainer when dropping one cardEmbed onto another standalone cardEmbed", async ({
      page,
    }) => {
      // Wait for cards to load
      await expect(getDocumentCard(page, "Orders")).toBeVisible();
      await expect(
        getDocumentCard(page, "Orders").getByTestId("table-root"),
      ).toBeAttached();
      await expect(getDocumentCard(page, "Orders, Count")).toBeVisible();
      await expect(
        getDocumentCard(page, "Orders, Count").getByTestId("table-root"),
      ).toBeAttached();

      // Verify no flexContainer exists initially
      await expect(flexContainers(page)).toHaveCount(0);

      await dragAndDropCardOnAnotherCard(page, "Orders", "Orders, Count");

      // Verify flexContainer was created
      await expect(flexContainer(page)).toBeAttached();

      // Verify both cards are now inside the flexContainer
      await assertFlexContainerCardsOrder(flexContainer(page), [
        "Orders",
        "Orders, Count",
      ]);

      // Verify the flexContainer is wrapped in a resizeNode
      await expect(
        documentContent(page)
          .locator('[data-type="resizeNode"]')
          .locator('[data-type="flexContainer"]')
          .first(),
      ).toBeAttached();

      // Verify that originally separate cards are now side by side
      await expect(
        flexContainer(page).getByTestId("document-card-embed"),
      ).toHaveCount(2);
    });

    test("should handle drag and drop with proper drop side positioning", async ({
      page,
    }) => {
      await expect(getDocumentCard(page, "Orders")).toBeVisible();
      await expect(
        getDocumentCard(page, "Orders").getByTestId("table-root"),
      ).toBeAttached();
      await expect(getDocumentCard(page, "Orders, Count")).toBeVisible();
      await expect(
        getDocumentCard(page, "Orders, Count").getByTestId("table-root"),
      ).toBeAttached();

      await dragAndDropCardOnAnotherCard(page, "Orders", "Orders, Count", {
        side: "right",
      });

      // Orders, Count should be first (left), Orders should be second (right)
      await expect(flexContainer(page)).toBeAttached();
      await assertFlexContainerCardsOrder(flexContainer(page), [
        "Orders, Count",
        "Orders",
      ]);
    });

    test("should prevent dropping a card onto itself", async ({ page }) => {
      await expect(getDocumentCard(page, "Orders")).toBeVisible();
      await expect(
        getDocumentCard(page, "Orders").getByTestId("table-root"),
      ).toBeAttached();

      // Verify initial state - no flexContainer
      await expect(flexContainers(page)).toHaveCount(0);

      // Attempt to drag and drop the card onto itself
      await dragAndDropCardOnAnotherCard(page, "Orders", "Orders");

      // Verify no flexContainer was created
      await expect(flexContainers(page)).toHaveCount(0);

      // Verify the card is still standalone
      await expect(getDocumentCard(page, "Orders")).toBeAttached();
    });
  });

  test.describe("advanced flexContainer scenarios", () => {
    let doc: { id: number };

    test.beforeEach(async ({ page, mb }) => {
      doc = await createDocument(mb.api, {
        name: "Advanced DnD Test Document",
        document: DOCUMENT_WITH_THREE_CARDS_AND_COLUMNS,
        collection_id: null,
      });
      await visitDocument(page, doc.id);
    });

    test("should allow you to resize the cards inside a flex container", async ({
      page,
    }) => {
      const [ogWidth1, ogWidth2] = await getCardWidths(page, [
        "Orders",
        "Orders, Count",
      ]);
      expectCloseTo(ogWidth1, ogWidth2, 3);

      const container = getFlexContainerForCard(page, "Orders");
      const handles = getResizeHandlesForFlexContainer(container);
      await documentDoDrag(page, handles.nth(0), { x: 100 });

      await expect
        .poll(async () => {
          const [first] = await getCardWidths(page, ["Orders"]);
          return first;
        })
        .toBeCloseTo(ogWidth1 + 100, -1);

      const [first, second] = await getCardWidths(page, [
        "Orders",
        "Orders, Count",
      ]);
      // compare that changes are close to the drag distance
      expectCloseTo(ogWidth1 + 100, first, 3);
      expectCloseTo(ogWidth2 - 100, second, 3);
      expectCloseTo(first, second + 200, 3);
    });

    test("should add a third card to an existing flexContainer with 2 cards", async ({
      page,
    }) => {
      // Wait for all cards to load
      await expect(getDocumentCard(page, "Orders")).toBeVisible();
      await expect(
        getDocumentCard(page, "Orders").getByTestId("table-root"),
      ).toBeAttached();
      await expect(getDocumentCard(page, "Orders, Count")).toBeVisible();
      await expect(
        getDocumentCard(page, "Orders, Count").getByTestId("table-root"),
      ).toBeAttached();
      await expect(
        getDocumentCard(page, "Orders, Count, Grouped by Created At (year)"),
      ).toBeVisible();
      await expect(
        getDocumentCard(
          page,
          "Orders, Count, Grouped by Created At (year)",
        ).getByTestId("chart-container"),
      ).toBeAttached();

      // Verify initial state - flexContainer exists with 2 cards
      await expect(flexContainer(page)).toBeAttached();
      await expect(
        flexContainer(page).getByTestId("document-card-embed"),
      ).toHaveCount(2);

      // Drag the standalone card onto one of the cards in the flexContainer
      await dragAndDropCardOnAnotherCard(
        page,
        "Orders, Count, Grouped by Created At (year)",
        "Orders",
        { side: "left" },
      );

      await assertFlexContainerCardsOrder(flexContainer(page), [
        "Orders, Count, Grouped by Created At (year)",
        "Orders",
        "Orders, Count",
      ]);

      await documentUndo(page);

      await dragAndDropCardOnAnotherCard(
        page,
        "Orders, Count, Grouped by Created At (year)",
        "Orders",
        { side: "right" },
      );

      await assertFlexContainerCardsOrder(flexContainer(page), [
        "Orders",
        "Orders, Count, Grouped by Created At (year)",
        "Orders, Count",
      ]);

      await documentUndo(page);

      await dragAndDropCardOnAnotherCard(
        page,
        "Orders, Count, Grouped by Created At (year)",
        "Orders, Count",
        { side: "right" },
      );

      await assertFlexContainerCardsOrder(flexContainer(page), [
        "Orders",
        "Orders, Count",
        "Orders, Count, Grouped by Created At (year)",
      ]);

      // changing the widths of 2 cards should leave the 3rd alone
      const cardNames = [
        "Orders",
        "Orders, Count",
        "Orders, Count, Grouped by Created At (year)",
      ];

      const [ogFirst, ogSecond, ogThird] = await getCardWidths(page, cardNames);
      expectCloseTo(ogFirst, ogSecond, 10);
      expectCloseTo(ogFirst, ogThird, 10);

      const container = getFlexContainerForCard(page, "Orders");
      const handles = getResizeHandlesForFlexContainer(container);
      await documentDoDrag(page, handles.nth(1), { x: 50 });

      const [first, second, third] = await getCardWidths(page, cardNames);
      expectCloseTo(first, ogFirst, 3);
      expect(second).toBeGreaterThan(ogSecond);
      expect(third).toBeLessThan(ogThird);
    });

    test("should prevent adding a fourth card to a flexContainer with 3 cards", async ({
      page,
    }) => {
      // Wait for all cards to load
      await expect(getDocumentCard(page, "Orders")).toBeVisible();
      await expect(
        getDocumentCard(page, "Orders").getByTestId("table-root"),
      ).toBeAttached();
      await expect(getDocumentCard(page, "Orders, Count")).toBeVisible();
      await expect(
        getDocumentCard(page, "Orders, Count").getByTestId("table-root"),
      ).toBeAttached();

      // First, add the third card to reach the limit
      await dragAndDropCardOnAnotherCard(
        page,
        "Orders, Count, Grouped by Created At (year)",
        "Orders",
        { side: "right" },
      );

      // Verify we have 3 cards in the flexContainer
      await expect(
        flexContainer(page).getByTestId("document-card-embed"),
      ).toHaveCount(3);

      // Add another card to try to exceed the limit
      await addNewStandaloneCard(page, "Orders Model");

      // Wait for the new card to be added
      await expect(
        documentContent(page).getByTestId("document-card-embed"),
      ).toHaveCount(4); // 3 in flexContainer + 1 new standalone

      // Try to drag the new standalone card onto the flexContainer
      await dragAndDropCardOnAnotherCard(page, "Orders", "Orders, Count", {
        side: "left",
      });

      // Verify the flexContainer still has only 3 cards (drop should be rejected)
      await expect(
        flexContainer(page).getByTestId("document-card-embed"),
      ).toHaveCount(3);

      // Verify the standalone card is still separate
      await expect(
        documentContent(page).getByTestId("document-card-embed"),
      ).toHaveCount(4); // Still 4 total, with 1 standalone
    });

    test("should reorder cards within the same flexContainer", async ({
      page,
    }) => {
      await expect(getDocumentCard(page, "Orders")).toBeVisible();
      await expect(
        getDocumentCard(page, "Orders").getByTestId("table-root"),
      ).toBeAttached();
      await expect(getDocumentCard(page, "Orders, Count")).toBeVisible();
      await expect(
        getDocumentCard(page, "Orders, Count").getByTestId("table-root"),
      ).toBeAttached();

      // Verify initial order: Orders | Orders, Count
      await expect(flexContainer(page)).toBeAttached();
      await assertFlexContainerCardsOrder(flexContainer(page), [
        "Orders",
        "Orders, Count",
      ]);

      // Drag Orders to the right side of Orders, Count to reorder them
      await dragAndDropCardOnAnotherCard(page, "Orders", "Orders, Count", {
        side: "right",
      });

      await expect(flexContainer(page)).toBeAttached();
      await assertFlexContainerCardsOrder(flexContainer(page), [
        "Orders, Count",
        "Orders",
      ]);

      await dragAndDropCardOnAnotherCard(page, "Orders", "Orders, Count", {
        side: "left",
      });

      await expect(flexContainer(page)).toBeAttached();
      await assertFlexContainerCardsOrder(flexContainer(page), [
        "Orders",
        "Orders, Count",
      ]);
    });

    test("should preserve card widths when swapping cards within the same flexContainer", async ({
      page,
    }) => {
      await expect(getDocumentCard(page, "Orders")).toBeVisible();
      await expect(
        getDocumentCard(page, "Orders").getByTestId("table-root"),
      ).toBeAttached();
      await expect(getDocumentCard(page, "Orders, Count")).toBeVisible();
      await expect(
        getDocumentCard(page, "Orders, Count").getByTestId("table-root"),
      ).toBeAttached();

      // Verify initial order: Orders | Orders, Count
      await expect(flexContainer(page)).toBeAttached();
      await assertFlexContainerCardsOrder(flexContainer(page), [
        "Orders",
        "Orders, Count",
      ]);

      // Verify both cards start with equal widths
      const [startFirst, startSecond] = await getCardWidths(page, [
        "Orders",
        "Orders, Count",
      ]);
      expectCloseTo(startFirst, startSecond, 3);

      // Resize the columns to have different widths
      const container = getFlexContainerForCard(page, "Orders");
      const handles = getResizeHandlesForFlexContainer(container);
      await documentDoDrag(page, handles.nth(0), { x: 150 });

      // Store the widths after resizing
      const [ordersWidth, ordersCountWidth] = await getCardWidths(page, [
        "Orders",
        "Orders, Count",
      ]);
      expect(ordersWidth).toBeGreaterThan(ordersCountWidth);

      // Swap the cards by dragging Orders to the right side of Orders, Count
      await dragAndDropCardOnAnotherCard(page, "Orders", "Orders, Count", {
        side: "right",
      });

      // Verify new order: Orders, Count | Orders
      await expect(flexContainer(page)).toBeAttached();
      await assertFlexContainerCardsOrder(flexContainer(page), [
        "Orders, Count",
        "Orders",
      ]);

      // Verify that each card preserved its width after swapping
      const [ordersCountNewWidth, ordersNewWidth] = await getCardWidths(page, [
        "Orders, Count",
        "Orders",
      ]);
      // Orders should still have its original width (now on the right)
      expectCloseTo(ordersNewWidth, ordersWidth, 3);
      // Orders, Count should still have its original width (now on the left)
      expectCloseTo(ordersCountNewWidth, ordersCountWidth, 3);
    });

    test("should handle moving cards between different flexContainers", async ({
      page,
    }) => {
      // Add another standalone card first
      await addNewStandaloneCard(page, "Orders Model");

      // Wait for the new card
      await expect(
        documentContent(page).getByTestId("document-card-embed"),
      ).toHaveCount(4);

      // Create a second flexContainer by dropping Orders by Year onto the new card
      await dragAndDropCardOnAnotherCard(
        page,
        "Orders, Count, Grouped by Created At (year)",
        "Orders Model",
      );

      // Verify we now have 2 flexContainers
      await expect(flexContainers(page)).toHaveCount(2);

      // Move a card from the first flexContainer to the second one
      await dragAndDropCardOnAnotherCard(
        page,
        "Orders, Count",
        "Orders, Count, Grouped by Created At (year)",
        { side: "right" },
      );

      // Verify the first flexContainer now has only 1 card (should be unwrapped)
      await expect(flexContainers(page)).toHaveCount(1);

      // Verify the remaining flexContainer has 3 cards
      await expect(
        flexContainer(page).getByTestId("document-card-embed"),
      ).toHaveCount(3);

      await dragAndDropCardOnAnotherCard(
        page,
        "Orders, Count, Grouped by Created At (year)",
        "Orders",
        { side: "right" },
      );

      await expect(flexContainers(page)).toHaveCount(2);
    });
  });

  test.describe("text wrapping in table cards", () => {
    test("should support text wrapping with proper row heights", async ({
      page,
      mb,
    }) => {
      await createReviewsTextWrapModel(mb.api);

      await page.goto("/document/new");

      await documentContent(page).click();
      await addToDocument(page, "/reviews", false);
      await commandSuggestionItem(page, /reviews/).click();

      await expect(getDocumentCard(page, "reviews")).toBeVisible();
      await expect(
        getDocumentCard(page, "reviews").getByTestId("table-root"),
      ).toBeAttached();

      const firstRow = getDocumentCard(page, "reviews")
        .getByTestId("table-root")
        .locator('[data-index="0"]');
      await expect(firstRow).toBeAttached();
      const box = await firstRow.boundingBox();
      expect(box?.height ?? 0).toBeGreaterThan(60);
    });
  });

  test.describe("navigating from cardEmbed", () => {
    test("should open a question in a new tab when clicking title with ctrl/meta key", async ({
      page,
      mb,
    }) => {
      const created = await createDocument(mb.api, {
        name: "Test Document",
        document: DOCUMENT_WITH_TWO_CARDS,
        collection_id: null,
      });

      await visitDocument(page, created.id);

      // Wait for cards to load
      await expect(getDocumentCard(page, "Orders")).toBeVisible();
      await expect(
        getDocumentCard(page, "Orders").getByTestId("table-root"),
      ).toBeAttached();

      await captureNextAnchorClick(page);

      // Click on the card title with ctrl/meta key
      await getDocumentCard(page, "Orders")
        .getByTestId("card-embed-title")
        .click({ modifiers: ["ControlOrMeta"] });

      await expectCapturedAnchor(page, {
        href: /\/question\//,
        rel: "noopener",
        target: "_blank",
      });
    });

    test("should open drill-through action in a new tab when clicking with ctrl/meta key", async ({
      page,
      mb,
    }) => {
      const created = await createDocument(mb.api, {
        name: "Test Document",
        document: DOCUMENT_WITH_TWO_CARDS,
        collection_id: null,
      });

      await visitDocument(page, created.id);

      // Wait for cards to load
      await expect(getDocumentCard(page, "Orders, Count")).toBeVisible();
      await expect(
        getDocumentCard(page, "Orders, Count").getByTestId("table-root"),
      ).toBeAttached();

      // Click on a table cell to trigger click actions menu
      await getDocumentCard(page, "Orders, Count")
        .getByTestId("table-body")
        .getByTestId("cell-data")
        .first()
        .click();

      await captureNextAnchorClick(page);

      // Wait for the popover to appear and click the first action with ctrl/meta key
      const action = popover(page).getByText("See these Orders", {
        exact: true,
      });
      await expect(action).toBeVisible();
      await action.click({ modifiers: ["ControlOrMeta"] });

      await expectCapturedAnchor(page, {
        href: /\/question/,
        rel: "noopener",
        target: "_blank",
      });
    });
  });

  test.describe("deleting a cardEmbed", () => {
    test("should allow you to remove a card if it is the first item in a docuemnt (UXW-2169)", async ({
      page,
    }) => {
      await page.goto("/document/new");

      await documentContent(page).click();
      await addToDocument(page, "/ord", false);
      await commandSuggestionItem(page, /Orders, Count$/).click();

      await openDocumentCardMenu(page, "Orders, Count");
      await popover(page).getByText("Remove Chart", { exact: true }).click();

      await expect(
        documentContent(page).getByTestId("document-card-embed"),
      ).toHaveCount(0);
    });

    test("should delete a cardEmbed when selected and Backspace is pressed", async ({
      page,
      mb,
    }) => {
      const created = await createDocument(mb.api, {
        name: "DnD Test Document",
        document: DOCUMENT_WITH_TWO_CARDS,
        collection_id: null,
      });

      await visitDocument(page, created.id);

      // Wait for cards to load
      await expect(getDocumentCard(page, "Orders")).toBeVisible();
      await expect(
        getDocumentCard(page, "Orders").getByTestId("table-root"),
      ).toBeAttached();
      await expect(getDocumentCard(page, "Orders, Count")).toBeVisible();
      await expect(
        getDocumentCard(page, "Orders, Count").getByTestId("table-root"),
      ).toBeAttached();

      // Verify initial state - we have 2 standalone cards
      await expect(
        documentContent(page).getByTestId("document-card-embed"),
      ).toHaveCount(2);

      // Click on the Orders card to select it
      await selectCardEmbedFromTop(page, "Orders");

      // Press Backspace to delete the selected card
      await page.keyboard.press("Backspace");

      // Verify the Orders card has been deleted
      await expect(
        documentContent(page)
          .getByTestId("card-embed-title")
          .filter({ hasText: /^Orders$/ }),
      ).toHaveCount(0);

      // Verify only one card remains
      await expect(
        documentContent(page).getByTestId("document-card-embed"),
      ).toHaveCount(1);

      // Verify the remaining card is Orders, Count
      await expect(getDocumentCard(page, "Orders, Count")).toBeVisible();
    });

    test("should delete a cardEmbed from a flexContainer when selected and Backspace is pressed", async ({
      page,
      mb,
    }) => {
      const created = await createDocument(mb.api, {
        name: "DnD Test Document",
        document: DOCUMENT_WITH_THREE_CARDS_AND_COLUMNS,
        collection_id: null,
      });

      await visitDocument(page, created.id);

      // First create a flexContainer by dropping one card onto another
      await expect(getDocumentCard(page, "Orders")).toBeVisible();
      await expect(
        getDocumentCard(page, "Orders").getByTestId("table-root"),
      ).toBeAttached();
      await expect(getDocumentCard(page, "Orders, Count")).toBeVisible();
      await expect(
        getDocumentCard(page, "Orders, Count").getByTestId("table-root"),
      ).toBeAttached();

      // Create flexContainer (3 cards)
      await dragAndDropCardOnAnotherCard(
        page,
        "Orders, Count, Grouped by Created At (year)",
        "Orders",
        { side: "right" },
      );

      await expect(flexContainer(page)).toBeAttached();
      await expect(
        flexContainer(page).getByTestId("document-card-embed"),
      ).toHaveCount(3);

      // Click on one of the cards in the flexContainer to select it
      await selectCardEmbedFromTop(page, "Orders");

      // Press Backspace to delete the selected card
      await page.keyboard.press("Backspace");

      // Verify the Orders card has been deleted from the flexContainer
      await expect(
        documentContent(page)
          .getByTestId("card-embed-title")
          .filter({ hasText: /^Orders$/ }),
      ).toHaveCount(0);

      await expect(
        documentContent(page).getByTestId("document-card-embed"),
      ).toHaveCount(2);

      await expect(flexContainer(page)).toBeAttached();

      // Click on one of the cards in the flexContainer to select it
      await selectCardEmbedFromTop(page, "Orders, Count");

      // Press Backspace to delete the selected card
      await page.keyboard.press("Backspace");

      // FlexContainer should be unwrapped when only 1 card remains
      await expect(flexContainers(page)).toHaveCount(0);

      // Verify only the Orders, Count card remains as a standalone card
      await expect(
        documentContent(page).getByTestId("document-card-embed"),
      ).toHaveCount(1);
      await expect(
        getDocumentCard(page, "Orders, Count, Grouped by Created At (year)"),
      ).toBeAttached();
    });
  });
});
