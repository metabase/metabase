import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import {
  DOCUMENT_WITH_SUPPORTING_TEXT,
  DOCUMENT_WITH_THREE_CARDS_AND_COLUMNS,
  DOCUMENT_WITH_TWO_CARDS,
} from "e2e/support/document-initial-data";
import type {
  NativeQuestionDetails,
  StructuredQuestionDetails,
} from "e2e/support/helpers/api";
import {
  ACCOUNTS_COUNT_BY_CREATED_AT,
  PRODUCTS_COUNT_BY_CATEGORY_PIE,
} from "e2e/support/test-visualization-data";

const { H } = cy;

describe("documents card embed node custom logic", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
  });

  describe("cardEmbed drag and drop", () => {
    beforeEach(() => {
      H.createDocument({
        name: "DnD Test Document",
        document: DOCUMENT_WITH_TWO_CARDS,
        collection_id: null,
        idAlias: "documentId",
      });

      H.visitDocument("@documentId");
    });

    it("should not group a card dropped onto itself, group a card dropped onto another, and add supporting text to the group", () => {
      // Wait for cards to load
      H.getDocumentCard("Orders")
        .should("be.visible")
        .findByTestId("table-root")
        .should("exist");
      H.getDocumentCard("Orders, Count")
        .should("be.visible")
        .findByTestId("table-root")
        .should("exist");

      // Verify no flexContainer exists initially
      H.documentContent()
        .find('[data-type="flexContainer"]')
        .should("not.exist");

      cy.log("dropping a card onto itself does nothing");
      H.dragAndDropCardOnAnotherCard("Orders", "Orders");

      // Verify no flexContainer was created
      H.documentContent()
        .find('[data-type="flexContainer"]')
        .should("not.exist");

      // Verify the card is still standalone
      H.getDocumentCard("Orders").should("exist");

      cy.log("dropping a card onto another card creates a flexContainer");
      H.dragAndDropCardOnAnotherCard("Orders", "Orders, Count");

      // Verify flexContainer was created
      H.documentContent().find('[data-type="flexContainer"]').should("exist");

      // Verify both cards are now inside the flexContainer
      H.documentContent()
        .find('[data-type="flexContainer"]')
        .within(() => {
          assertFlexContainerCardsOrder(["Orders", "Orders, Count"]);
        });

      // Verify the flexContainer is wrapped in a resizeNode
      H.documentContent()
        .find('[data-type="resizeNode"]')
        .should("exist")
        .within(() => {
          cy.get('[data-type="flexContainer"]').should("exist");
        });

      cy.log("add supporting text to a card in the flexContainer");
      H.documentContent()
        .findByTestId("document-card-supporting-text")
        .should("not.exist");

      H.openDocumentCardMenu("Orders");
      H.popover()
        .findByText("Add supporting text")
        .closest("button")
        .should("be.enabled")
        .click();

      H.documentContent()
        .findByTestId("document-card-supporting-text")
        .should("exist");

      // Verify the supporting text has the placeholder text
      H.documentContent()
        .findByTestId("document-card-supporting-text")
        .should("contain.text", "Write whatever you'd like to");

      // Verify the flexContainer now contains supporting text and both cards
      H.documentContent()
        .find('[data-type="flexContainer"]')
        .within(() => {
          cy.findByTestId("document-card-supporting-text").should("exist");
          cy.findAllByTestId("document-card-embed").should("have.length", 2);
        });

      // Verify supporting text was added at the beginning of the flexContainer
      H.documentContent()
        .find('[data-type="flexContainer"]')
        .find(
          '[data-testid="document-card-supporting-text"], [data-testid="document-card-embed"]',
        )
        .first()
        .should("have.attr", "data-testid", "document-card-supporting-text");
    });

    it("should handle drag and drop with proper drop side positioning", () => {
      // Wait for cards to load
      H.getDocumentCard("Orders")
        .should("be.visible")
        .findByTestId("table-root")
        .should("exist");
      H.getDocumentCard("Orders, Count")
        .should("be.visible")
        .findByTestId("table-root")
        .should("exist");

      H.dragAndDropCardOnAnotherCard("Orders", "Orders, Count", {
        side: "right",
      });

      // Verify flexContainer was created with correct order
      H.documentContent()
        .find('[data-type="flexContainer"]')
        .should("exist")
        .within(() => {
          // Orders, Count should be first (left), Orders should be second (right)
          assertFlexContainerCardsOrder(["Orders, Count", "Orders"]);
        });
    });
  });

  describe("advanced flexContainer scenarios", () => {
    beforeEach(() => {
      H.createDocument({
        name: "Advanced DnD Test Document",
        document: DOCUMENT_WITH_THREE_CARDS_AND_COLUMNS,
        collection_id: null,
        idAlias: "documentId",
      });

      H.visitDocument("@documentId");
    });

    it("should add a third card to an existing flexContainer with 2 cards, resize it, and delete cards with Backspace", () => {
      // Wait for all cards to load
      H.getDocumentCard("Orders")
        .should("be.visible")
        .findByTestId("table-root")
        .should("exist");
      H.getDocumentCard("Orders, Count")
        .should("be.visible")
        .findByTestId("table-root")
        .should("exist");
      H.getDocumentCard("Orders, Count, Grouped by Created At (year)")
        .should("be.visible")
        .findByTestId("chart-container")
        .should("exist");

      // Verify initial state - flexContainer exists with 2 cards
      H.documentContent()
        .find('[data-type="flexContainer"]')
        .should("exist")
        .within(() => {
          cy.findAllByTestId("document-card-embed").should("have.length", 2);
        });

      // Drag the standalone card (Orders by Year) onto one of the cards in the flexContainer
      H.dragAndDropCardOnAnotherCard(
        "Orders, Count, Grouped by Created At (year)",
        "Orders",
        { side: "left" },
      );

      // Verify the flexContainer now has 3 cards

      H.documentContent()
        .find('[data-type="flexContainer"]')
        .should("exist")
        .within(() => {
          assertFlexContainerCardsOrder([
            "Orders, Count, Grouped by Created At (year)",
            "Orders",
            "Orders, Count",
          ]);
        });

      H.documentUndo();

      H.documentContent()
        .find('[data-type="flexContainer"]')
        .should("have.length", 1)
        .within(() => {
          assertFlexContainerCardsOrder(["Orders", "Orders, Count"]);
        });
      H.getDocumentCard("Orders, Count, Grouped by Created At (year)")
        .should("be.visible")
        .closest('[data-type="flexContainer"]')
        .should("not.exist");

      // Drag the standalone card (Orders by Year) onto one of the cards in the flexContainer
      H.dragAndDropCardOnAnotherCard(
        "Orders, Count, Grouped by Created At (year)",
        "Orders",
        { side: "right" },
      );

      H.documentContent()
        .find('[data-type="flexContainer"]')
        .should("exist")
        .within(() => {
          assertFlexContainerCardsOrder([
            "Orders",
            "Orders, Count, Grouped by Created At (year)",
            "Orders, Count",
          ]);
        });

      H.documentUndo();

      H.documentContent()
        .find('[data-type="flexContainer"]')
        .should("have.length", 1)
        .within(() => {
          assertFlexContainerCardsOrder(["Orders", "Orders, Count"]);
        });
      H.getDocumentCard("Orders, Count, Grouped by Created At (year)")
        .should("be.visible")
        .closest('[data-type="flexContainer"]')
        .should("not.exist");

      // Drag the standalone card (Orders by Year) onto one of the cards in the flexContainer
      H.dragAndDropCardOnAnotherCard(
        "Orders, Count, Grouped by Created At (year)",
        "Orders, Count",
        { side: "right" },
      );

      H.documentContent()
        .find('[data-type="flexContainer"]')
        .should("exist")
        .within(() => {
          assertFlexContainerCardsOrder([
            "Orders",
            "Orders, Count",
            "Orders, Count, Grouped by Created At (year)",
          ]);
        });

      cy.log("changing the widths of 2 cards should leave the 3rd alone");

      const cardNames = [
        "Orders",
        "Orders, Count",
        "Orders, Count, Grouped by Created At (year)",
      ];

      getCardWidths(cardNames, (first, second, third) => {
        cy.wrap(first).as("_first");
        cy.wrap(second).as("_second");
        cy.wrap(third).as("_third");
        expect(first).to.be.closeTo(second, 10);
        // Unjustified type cast. FIXME
        expect(first).to.be.closeTo(third as unknown as number, 10);
      });

      const flexContainer = H.getFlexContainerForCard("Orders");

      const handles = H.getResizeHandlesForFlexContianer(flexContainer);

      H.documentDoDrag(handles.eq(1), { x: 50 });

      getCardWidths(cardNames, (first, second, third) => {
        cy.get("@_first").then((_first) => {
          cy.get("@_second").then((_second) => {
            cy.get("@_third").then((_third) => {
              // Unjustified type cast. FIXME
              expect(first).to.be.closeTo(_first as unknown as number, 3);
              // Unjustified type cast. FIXME
              expect(second).to.be.greaterThan(_second as unknown as number);
              // Unjustified type cast. FIXME
              expect(third).to.be.lessThan(_third as unknown as number);
            });
          });
        });
      });

      cy.log("Backspace deletes a selected card from the flexContainer");
      H.getDocumentCard("Orders").realClick({ position: "top" });
      cy.realPress("Backspace");

      H.documentContent()
        .findAllByTestId("card-embed-title")
        .filter((_index, element) => element.innerText === "Orders")
        .should("not.exist");
      H.documentContent()
        .findAllByTestId("document-card-embed")
        .should("have.length", 2);
      H.documentContent().find('[data-type="flexContainer"]').should("exist");

      cy.log("deleting down to 1 card unwraps the flexContainer");
      H.getDocumentCard("Orders, Count").realClick({ position: "top" });
      cy.realPress("Backspace");

      H.documentContent()
        .find('[data-type="flexContainer"]')
        .should("not.exist");
      H.documentContent()
        .findAllByTestId("document-card-embed")
        .should("have.length", 1);
      H.getDocumentCard("Orders, Count, Grouped by Created At (year)").should(
        "exist",
      );
    });

    it("should reorder cards within the same flexContainer and preserve resized widths when swapping", () => {
      // Wait for all cards to load
      H.getDocumentCard("Orders")
        .should("be.visible")
        .findByTestId("table-root")
        .should("exist");
      H.getDocumentCard("Orders, Count")
        .should("be.visible")
        .findByTestId("table-root")
        .should("exist");

      // Verify initial order: Orders | Orders, Count
      H.documentContent()
        .find('[data-type="flexContainer"]')
        .should("exist")
        .within(() => {
          assertFlexContainerCardsOrder(["Orders", "Orders, Count"]);
        });

      // Drag Orders to the right side of Orders, Count to reorder them
      H.dragAndDropCardOnAnotherCard("Orders", "Orders, Count", {
        side: "right",
      });

      // Verify new order: Orders, Count | Orders
      H.documentContent()
        .find('[data-type="flexContainer"]')
        .should("exist")
        .within(() => {
          assertFlexContainerCardsOrder(["Orders, Count", "Orders"]);
        });

      H.dragAndDropCardOnAnotherCard("Orders", "Orders, Count", {
        side: "left",
      });

      H.documentContent()
        .find('[data-type="flexContainer"]')
        .should("exist")
        .within(() => {
          assertFlexContainerCardsOrder(["Orders", "Orders, Count"]);
        });

      cy.log("resized widths are preserved when swapping cards");
      H.getDocumentCard("Orders")
        .should("be.visible")
        .findByTestId("table-root")
        .should("exist");
      H.getDocumentCard("Orders, Count")
        .should("be.visible")
        .findByTestId("table-root")
        .should("exist");

      // Verify both cards start with equal widths
      getCardWidths(["Orders", "Orders, Count"], (first, second) => {
        cy.wrap(first).as("ogWidth1");
        cy.wrap(second).as("ogWidth2");
        expect(first).to.be.closeTo(second, 3);
      });

      // Resize the columns to have different widths
      const flexContainer = H.getFlexContainerForCard("Orders");
      const handles = H.getResizeHandlesForFlexContianer(flexContainer);
      H.documentDoDrag(handles.eq(0), { x: 150 });

      // Store the widths after resizing
      getCardWidths(
        ["Orders", "Orders, Count"],
        (ordersWidth, ordersCountWidth) => {
          cy.wrap(ordersWidth).as("ordersWidth");
          cy.wrap(ordersCountWidth).as("ordersCountWidth");
          // Verify the widths are now different
          expect(ordersWidth).to.be.greaterThan(ordersCountWidth);
          expect(ordersWidth).to.be.closeTo(ordersCountWidth + 300, 3);

          cy.get<number>("@ogWidth1").then((ogWidth1) => {
            cy.get<number>("@ogWidth2").then((ogWidth2) => {
              cy.log("compare that changes are close to the drag distance");
              expect(ordersWidth).to.be.closeTo(ogWidth1 + 150, 3);
              expect(ordersCountWidth).to.be.closeTo(ogWidth2 - 150, 3);
            });
          });
        },
      );

      // Swap the cards by dragging Orders to the right side of Orders, Count
      H.dragAndDropCardOnAnotherCard("Orders", "Orders, Count", {
        side: "right",
      });

      // Verify new order: Orders, Count | Orders
      H.documentContent()
        .find('[data-type="flexContainer"]')
        .should("exist")
        .within(() => {
          assertFlexContainerCardsOrder(["Orders, Count", "Orders"]);
        });

      // Verify that each card preserved its width after swapping
      getCardWidths(
        ["Orders, Count", "Orders"],
        (ordersCountNewWidth, ordersNewWidth) => {
          cy.get<number>("@ordersWidth").then((originalOrdersWidth) => {
            cy.get<number>("@ordersCountWidth").then(
              (originalOrdersCountWidth) => {
                // Orders should still have its original width (now on the right)
                expect(ordersNewWidth).to.be.closeTo(originalOrdersWidth, 3);
                // Orders, Count should still have its original width (now on the left)
                expect(ordersCountNewWidth).to.be.closeTo(
                  originalOrdersCountWidth,
                  3,
                );
              },
            );
          });
        },
      );
    });

    it("should handle moving cards between different flexContainers", () => {
      // First create another flexContainer by dragging the standalone card onto a new location
      // Add another standalone card first
      addNewStandaloneCard("Orders Model");

      // Wait for the new card
      H.documentContent()
        .findAllByTestId("document-card-embed")
        .should("have.length", 4);

      // Create a second flexContainer by dropping Orders by Year onto the new Orders card
      H.dragAndDropCardOnAnotherCard(
        "Orders, Count, Grouped by Created At (year)",
        "Orders Model",
      );

      // Verify we now have 2 flexContainers
      H.documentContent()
        .find('[data-type="flexContainer"]')
        .should("have.length", 2);

      // Move a card from the first flexContainer to the second one
      H.dragAndDropCardOnAnotherCard(
        "Orders, Count",
        "Orders, Count, Grouped by Created At (year)",
        { side: "right" },
      );

      // Verify the first flexContainer now has only 1 card (should be unwrapped)
      H.documentContent()
        .find('[data-type="flexContainer"]')
        .should("have.length", 1);

      // Verify the remaining flexContainer has 3 cards
      H.documentContent()
        .find('[data-type="flexContainer"]')
        .within(() => {
          cy.findAllByTestId("document-card-embed").should("have.length", 3);
        });

      H.dragAndDropCardOnAnotherCard(
        "Orders, Count, Grouped by Created At (year)",
        "Orders",
        { side: "right" },
      );

      H.documentContent()
        .find('[data-type="flexContainer"]')
        .should("have.length", 2);
    });
  });

  describe("cardEmbed on a new document", () => {
    it("should remove a card that is the first item in a document (UXW-2169) and support text wrapping with proper row heights", () => {
      H.createQuestion({
        name: "reviews",
        type: "model",
        query: {
          "source-table": SAMPLE_DATABASE.REVIEWS_ID,
        },
        visualization_settings: {
          "table.column_widths": [246, 195, 69, 116, 134, 83],
          column_settings: {
            '["name","BODY"]': {
              text_wrapping: true,
            },
          },
        },
      });

      cy.visit("/document/new");

      cy.log("a card that is the first item in a document can be removed");
      H.documentContent().click();
      H.addToDocument("/ord", false);
      H.commandSuggestionItem(/Orders, Count$/).click();

      H.openDocumentCardMenu("Orders, Count");
      H.popover().findByText("Remove Chart").click();

      cy.findAllByTestId("document-card-embed").should("have.length", 0);
      cy.get(H.POPOVER_ELEMENT).should("not.exist");

      cy.log("text wrapping in table cards");
      H.documentContent().click();
      H.addToDocument("/reviews", false);
      H.commandSuggestionItem(/reviews/).click();

      H.getDocumentCard("reviews")
        .should("be.visible")
        .findByTestId("table-root")
        .should("exist");

      H.getDocumentCard("reviews").within(() => {
        H.tableInteractive()
          .find("[data-index=0]")
          .should("exist")
          .invoke("height")
          .should("be.greaterThan", 60);
      });
    });
  });

  describe("supporting text", () => {
    it("should add supporting text to a standalone card, remove, edit and resize it, and persist width after save", () => {
      H.createDocument({
        name: "Resize Supporting Text Test Document",
        document: DOCUMENT_WITH_TWO_CARDS,
        collection_id: null,
        idAlias: "documentId",
      });

      H.visitDocument("@documentId");

      // Wait for cards to load
      H.getDocumentCard("Orders")
        .should("be.visible")
        .findByTestId("table-root")
        .should("exist");

      cy.log("add supporting text to a standalone card");
      H.documentContent()
        .findByTestId("document-card-supporting-text")
        .should("not.exist");
      H.documentContent()
        .find('[data-type="flexContainer"]')
        .should("not.exist");

      // The menu item is rendered disabled while the node view can't resolve its
      // position, and a click on the label of a disabled button is dropped
      // without an error, so click the button itself and wait for it to be enabled.
      H.openDocumentCardMenu("Orders");
      H.popover()
        .findByText("Add supporting text")
        .closest("button")
        .should("be.enabled")
        .click();

      // Verify a flexContainer was created
      H.documentContent().find('[data-type="flexContainer"]').should("exist");

      // Verify supporting text was added with its placeholder text
      H.documentContent()
        .findByTestId("document-card-supporting-text")
        .should("contain.text", "Write whatever you'd like to");

      // Verify the flexContainer contains both supporting text and the card.
      // Kept as two re-queried chains: `.within()` freezes its subject, and the
      // card's node view is recreated when it moves into the new flexContainer.
      H.documentContent()
        .find('[data-type="flexContainer"]')
        .findByTestId("document-card-supporting-text")
        .should("exist");
      H.documentContent()
        .find('[data-type="flexContainer"]')
        .findByTestId("document-card-embed")
        .should("exist");

      cy.log("empty supporting text is removed on Backspace");
      // Click into the supporting text
      H.documentContent()
        .findByTestId("document-card-supporting-text")
        .within(() => cy.get(".node-paragraph").click());

      // Press Backspace to delete the empty supporting text
      cy.realPress("Backspace");

      // Verify supporting text was removed
      H.documentContent()
        .findByTestId("document-card-supporting-text")
        .should("not.exist");

      // Verify the flexContainer was also removed (unwrapped)
      H.documentContent()
        .find('[data-type="flexContainer"]')
        .should("not.exist");

      // Verify the card is still there as a standalone card
      H.getDocumentCard("Orders").should("exist");

      cy.log("add supporting text again and edit it");
      H.openDocumentCardMenu("Orders");
      H.popover()
        .findByText("Add supporting text")
        .closest("button")
        .should("be.enabled")
        .click();

      // Verify flexContainer and supporting text were created
      H.documentContent().find('[data-type="flexContainer"]').should("exist");
      H.documentContent()
        .findByTestId("document-card-supporting-text")
        .should("exist");

      // Type some content
      cy.realType("# Hdg{enter}Lorem ipsum");

      // Verify the text was added
      H.documentContent()
        .findByTestId("document-card-supporting-text")
        .contains("h1", "Hdg")
        .should("exist");
      H.documentContent()
        .findByTestId("document-card-supporting-text")
        .contains("p", "Lorem ipsum")
        .should("exist");

      cy.log("resize supporting text and persist width after save");
      // Get initial widths of supporting text and card
      H.documentContent()
        .findByTestId("document-card-supporting-text")
        .then(($supportingText) => {
          // Unjustified type cast. FIXME
          const initialSupportingTextWidth = $supportingText.width() as number;
          cy.wrap(initialSupportingTextWidth).as("initialSupportingTextWidth");

          H.getDocumentCard("Orders").then(($card) => {
            // Unjustified type cast. FIXME
            const initialCardWidth = $card.width() as number;
            cy.wrap(initialCardWidth).as("initialCardWidth");
          });
        });

      // Get the flex container and resize handles
      const flexContainer = H.documentContent().find(
        '[data-type="flexContainer"]',
      );
      const handles = H.getResizeHandlesForFlexContianer(flexContainer);

      // Drag the handle to resize (increase supporting text width, decrease card width)
      H.documentDoDrag(handles.eq(0), { x: 150 });

      // Verify the widths changed
      H.documentContent()
        .findByTestId("document-card-supporting-text")
        .then(($supportingText) => {
          // Unjustified type cast. FIXME
          const newSupportingTextWidth = $supportingText.width() as number;
          cy.wrap(newSupportingTextWidth).as("newSupportingTextWidth");

          H.getDocumentCard("Orders").then(($card) => {
            // Unjustified type cast. FIXME
            const newCardWidth = $card.width() as number;
            cy.wrap(newCardWidth).as("newCardWidth");

            cy.get<number>("@initialSupportingTextWidth").then(
              (initialWidth) => {
                // Supporting text should be wider
                expect(newSupportingTextWidth).to.be.greaterThan(initialWidth);
                // The change should be close to the drag distance
                expect(newSupportingTextWidth).to.be.closeTo(
                  initialWidth + 150,
                  10,
                );
              },
            );

            cy.get<number>("@initialCardWidth").then((initialWidth) => {
              // Card should be narrower
              expect(newCardWidth).to.be.lessThan(initialWidth);
              // The change should be close to the drag distance
              expect(newCardWidth).to.be.closeTo(initialWidth - 150, 10);
            });
          });
        });

      // Click into the supporting text to edit it
      H.documentContent()
        .findByTestId("document-card-supporting-text")
        .within(() => cy.get(".node-paragraph").click());

      // Type some content
      const testText = "Supporting text for Orders chart";
      cy.realType(testText);
      cy.realPress("Tab");

      // Verify the text was added
      H.documentContent()
        .findByTestId("document-card-supporting-text")
        .should("contain.text", testText);

      // Save the document
      H.documentSaveButton().should("not.be.disabled").click();

      // Wait for save confirmation
      cy.findByTestId("toast-undo")
        .should("be.visible")
        .and("contain.text", "Document saved");

      // Reload the page to verify persistence
      cy.intercept({
        method: "GET",
        path: "/api/document/*",
      }).as("documentGet");
      cy.reload();
      H.closeNavigationSidebar();

      cy.wait("@documentGet");

      // Wait for the document to load
      H.getDocumentCard("Orders")
        .should("be.visible")
        .findByTestId("table-root")
        .should("exist");

      // Verify the widths are still the same after reload
      H.documentContent()
        .findByTestId("document-card-supporting-text")
        .then(($supportingText) => {
          // Unjustified type cast. FIXME
          const reloadedSupportingTextWidth = $supportingText.width() as number;

          H.getDocumentCard("Orders").then(($card) => {
            // Unjustified type cast. FIXME
            const reloadedCardWidth = $card.width() as number;

            cy.get<number>("@newSupportingTextWidth").then((savedWidth) => {
              // Supporting text width should be preserved
              expect(reloadedSupportingTextWidth).to.be.closeTo(savedWidth, 10);
            });

            cy.get<number>("@newCardWidth").then((savedWidth) => {
              // Card width should be preserved
              expect(reloadedCardWidth).to.be.closeTo(savedWidth, 10);
            });
          });
        });
    });

    describe("supporting text drag and drop", () => {
      beforeEach(() => {
        H.createDocument({
          name: "DnD Test Document",
          document: DOCUMENT_WITH_SUPPORTING_TEXT,
          collection_id: null,
          idAlias: "documentId",
        });
        H.visitDocument("@documentId");
      });

      const getSupportingText = (contents: string = "Lorem ipsum") => {
        const testId = "document-card-supporting-text";
        return cy
          .findAllByTestId(testId)
          .contains(contents)
          .closest(`[data-testid="${testId}"]`);
      };

      const assertHorizontalLayout = (
        c1: Cypress.Chainable<JQuery<HTMLElement>>,
        c2: Cypress.Chainable<JQuery<HTMLElement>>,
      ) => {
        c1.then(($c1) => {
          c2.then(($c2) => {
            const rect1 = $c1[0].getBoundingClientRect();
            const rect2 = $c2[0].getBoundingClientRect();
            expect(rect2.left).to.gte(rect1.right);
            expect(rect1.top).to.be.closeTo(rect2.top, 2);
          });
        });
      };

      const assertVerticalLayout = (
        c1: Cypress.Chainable<JQuery<HTMLElement>>,
        c2: Cypress.Chainable<JQuery<HTMLElement>>,
      ) => {
        c1.then(($c1) => {
          c2.then(($c2) => {
            const rect1 = $c1[0].getBoundingClientRect();
            const rect2 = $c2[0].getBoundingClientRect();
            expect(rect2.top).to.gte(rect1.bottom);
            expect(rect1.left).to.be.closeTo(rect2.left, 2);
          });
        });
      };

      it("should do nothing when dropping a supporting text block outside of a group, and reorder when dropping it onto a card", () => {
        H.getDocumentCard("Orders").should("exist");
        H.documentsDragAndDrop({
          getSource: () => getSupportingText().find("[data-drag-handle]"),
          getTarget: () => H.getDocumentCard("Orders, Count"),
        });

        assertHorizontalLayout(
          getSupportingText(),
          H.getDocumentCard("Orders"),
        );
        assertVerticalLayout(
          getSupportingText(),
          H.getDocumentCard("Orders, Count"),
        );

        cy.log("drop supporting text onto a card");
        H.getDocumentCard("Orders").should("exist");
        H.documentsDragAndDrop({
          getSource: () => getSupportingText().find("[data-drag-handle]"),
          getTarget: () => H.getDocumentCard("Orders"),
          side: "right",
        });

        assertHorizontalLayout(
          H.getDocumentCard("Orders"),
          getSupportingText(),
        );
        assertVerticalLayout(
          H.getDocumentCard("Orders"),
          H.getDocumentCard("Orders, Count"),
        );
      });

      it("should reorder when dropping a card onto a supporting text block", () => {
        H.getDocumentCard("Orders").should("exist");
        H.documentsDragAndDrop({
          getSource: () => H.getDocumentCard("Orders"),
          getTarget: () => getSupportingText(),
          side: "left",
        });

        assertHorizontalLayout(
          H.getDocumentCard("Orders"),
          getSupportingText(),
        );
        assertVerticalLayout(
          H.getDocumentCard("Orders"),
          H.getDocumentCard("Orders, Count"),
        );
      });

      it("should insert a card when dropped onto a supporting text block", () => {
        H.getDocumentCard("Orders").should("exist");
        H.documentsDragAndDrop({
          getSource: () => H.getDocumentCard("Orders, Count"),
          getTarget: () => getSupportingText(),
          side: "left",
        });

        assertHorizontalLayout(
          H.getDocumentCard("Orders, Count"),
          getSupportingText(),
        );
        assertHorizontalLayout(
          getSupportingText(),
          H.getDocumentCard("Orders"),
        );
      });
    });
  });

  describe("flex chart widths", () => {
    const PADDING_CARD = 1;
    type ChartCard =
      | (StructuredQuestionDetails & { name: string })
      | (NativeQuestionDetails & { name: string });
    type ChartSpec = {
      label: string;
      card: ChartCard;
      paddingX: number;
      selector: string;
    };

    const isNativeQuestion = (
      question: ChartCard,
    ): question is NativeQuestionDetails & { name: string } =>
      "native" in question;

    const createQuestionForCard = (
      question: ChartCard,
      nameOverride?: string,
    ) => {
      const details = nameOverride
        ? { ...question, name: nameOverride }
        : question;
      return isNativeQuestion(details)
        ? H.createNativeQuestion(details)
        : H.createQuestion(details);
    };

    const chartTypes: ChartSpec[] = [
      {
        label: "line",
        card: ACCOUNTS_COUNT_BY_CREATED_AT,
        paddingX: 16 + PADDING_CARD,
        selector: "[data-testid='chart-container'] > :first-child",
      },
      {
        label: "pie",
        card: PRODUCTS_COUNT_BY_CATEGORY_PIE,
        paddingX: 14 + PADDING_CARD,
        selector: "[data-testid='chart-with-legend']",
      },
    ];

    const assertChartMatchesContainerWidth = (
      cardName: string,
      paddingX: number,
      selector: string,
    ) => {
      H.getDocumentCard(cardName).then(($card) => {
        const cardWidth = $card.width()!;
        cy.wrap($card).find(selector).as("chart");

        cy.get("@chart")
          .should("exist")
          .then(($chart) => {
            const width = $chart.width()!;
            expect(width + paddingX * 2).to.equal(cardWidth);
          });
      });
    };

    it("keeps chart widths in sync during flex resize", () => {
      const cardIds: Record<string, { firstId: number; secondId: number }> = {};

      // Create all questions first
      chartTypes.forEach(({ label, card }) => {
        const secondCardName = `${card.name} (copy)`;

        cy.then(() =>
          createQuestionForCard(card).then(({ body }) => {
            cardIds[label] = { firstId: body.id, secondId: 0 };
          }),
        );

        cy.then(() =>
          createQuestionForCard(card, secondCardName).then(({ body }) => {
            cardIds[label].secondId = body.id;
          }),
        );
      });

      cy.then(() => {
        const content = chartTypes.map(({ label }) => ({
          type: "resizeNode",
          attrs: {
            height: 350,
            minHeight: 280,
            _id: `flex-${label}`,
          },
          content: [
            {
              type: "flexContainer",
              attrs: {
                _id: `flex-${label}-container`,
                columnWidths: [50, 50],
              },
              content: [
                {
                  type: "cardEmbed",
                  attrs: {
                    id: cardIds[label].firstId,
                    name: null,
                    _id: `flex-${label}-card-1`,
                  },
                },
                {
                  type: "cardEmbed",
                  attrs: {
                    id: cardIds[label].secondId,
                    name: null,
                    _id: `flex-${label}-card-2`,
                  },
                },
              ],
            },
          ],
        }));

        return H.createDocument({
          name: "Flex chart width document",
          document: {
            type: "doc",
            content,
          },
          collection_id: null,
          idAlias: "flexDocumentId",
        });
      });

      cy.intercept("POST", "/api/card/*/query").as("cardQuery");

      H.visitDocument("@flexDocumentId");

      // Wait for all cards to load (2 cards per chart type)
      for (let i = 0; i < chartTypes.length * 2; i++) {
        cy.wait("@cardQuery", { timeout: 15000 });
      }

      chartTypes.forEach(({ card, paddingX, selector }) => {
        const firstCardName = card.name;
        const secondCardName = `${card.name} (copy)`;

        const firstCardChart = H.getDocumentCard(firstCardName).find(selector);
        const secondCardChart =
          H.getDocumentCard(secondCardName).find(selector);

        firstCardChart.should("exist");
        secondCardChart.should("exist");

        const flexContainer = H.getFlexContainerForCard(firstCardName);
        const handles = H.getResizeHandlesForFlexContianer(flexContainer);

        H.getDocumentCard(firstCardName).then(($card) => {
          cy.wrap($card.width()).as("initialCardWidth");
        });

        handles.eq(0).then(($handle) => {
          cy.wrap($handle).realMouseDown({
            button: "left",
            position: "center",
          });

          const steps = [10, 40, 60, -100, -10, -40, -60];
          steps.forEach((deltaX, index) => {
            cy.wrap($handle).realMouseMove(deltaX, 0, {
              position: "center",
            });

            if (index === 0) {
              cy.get<number>("@initialCardWidth").then((initialWidth) => {
                H.getDocumentCard(firstCardName).should(($card) => {
                  expect($card.width()).not.to.equal(initialWidth);
                });
              });
            }

            assertChartMatchesContainerWidth(firstCardName, paddingX, selector);
            assertChartMatchesContainerWidth(
              secondCardName,
              paddingX,
              selector,
            );
          });

          cy.wrap($handle).realMouseUp({
            button: "left",
            position: "center",
          });
        });
      });
    });
  });

  describe("navigating from and deleting a cardEmbed", () => {
    it("should open a question and a drill-through action in a new tab when clicking with ctrl/meta key, and delete a selected card with Backspace", () => {
      H.createDocument({
        name: "Test Document",
        document: DOCUMENT_WITH_TWO_CARDS,
        collection_id: null,
        idAlias: "documentId",
      });

      H.visitDocument("@documentId");

      // Wait for cards to load
      H.getDocumentCard("Orders")
        .should("be.visible")
        .findByTestId("table-root")
        .should("exist");

      // Verify window.open was called
      cy.on("uncaught:exception", (error) => {
        expect(error.message.includes("expected '<a>' to have attribute")).to.be
          .false;
      });

      H.onNextAnchorClick(
        cy
          .spy((anchor: HTMLAnchorElement) => {
            expect(anchor)
              .to.have.attr("href")
              .match(/\/question\//);
            expect(anchor).to.have.attr("rel", "noopener");
            expect(anchor).to.have.attr("target", "_blank");
          })
          .as("titleAnchorClick"),
      );

      // Click on the card title with ctrl/meta key
      H.getDocumentCard("Orders")
        .findByTestId("card-embed-title")
        .click(H.holdMetaKey);

      cy.get("@titleAnchorClick").should("have.been.calledOnce");
      cy.location("pathname").should("match", /^\/document\//);

      cy.log("drill-through action");
      // Wait for cards to load
      H.getDocumentCard("Orders, Count")
        .should("be.visible")
        .findByTestId("table-root")
        .should("exist");

      // Click on a table cell to trigger click actions menu
      H.getDocumentCard("Orders, Count")
        .findByTestId("table-body")
        .findAllByTestId("cell-data")
        .first()
        .click();

      H.onNextAnchorClick(
        cy
          .spy((anchor: HTMLAnchorElement) => {
            expect(anchor)
              .to.have.attr("href")
              .match(/\/question/);
            expect(anchor).to.have.attr("rel", "noopener");
            expect(anchor).to.have.attr("target", "_blank");
          })
          .as("drillAnchorClick"),
      );

      // Wait for the popover to appear and click the first action with ctrl/meta key
      H.popover()
        .findByText("See these Orders")
        .should("be.visible")
        .click(H.holdMetaKey);

      cy.get("@drillAnchorClick").should("have.been.calledOnce");
      cy.location("pathname").should("match", /^\/document\//);

      cy.log("Backspace deletes a selected cardEmbed");
      cy.realPress("Escape");
      cy.get(H.POPOVER_ELEMENT).should("not.exist");

      H.getDocumentCard("Orders")
        .should("be.visible")
        .findByTestId("table-root")
        .should("exist");
      H.getDocumentCard("Orders, Count")
        .should("be.visible")
        .findByTestId("table-root")
        .should("exist");

      // The ctrl/meta-clicks leave the document with its 2 standalone cards
      H.documentContent()
        .findAllByTestId("document-card-embed")
        .should("have.length", 2);

      // Click on the Orders card to select it
      H.getDocumentCard("Orders").realClick({ position: "top" });

      // Press Backspace to delete the selected card
      cy.realPress("Backspace");

      // Verify the Orders card has been deleted
      H.documentContent()
        .findAllByTestId("card-embed-title")
        .filter((_index, element) => element.innerText === "Orders")
        .should("not.exist");

      // Verify only one card remains
      H.documentContent()
        .findAllByTestId("document-card-embed")
        .should("have.length", 1);

      // Verify the remaining card is Orders, Count
      H.getDocumentCard("Orders, Count").should("exist").and("be.visible");
    });
  });
});

function assertFlexContainerCardsOrder(expectedCardTitles: string[]) {
  for (let i = 0; i < expectedCardTitles.length; i++) {
    cy.findAllByTestId("document-card-embed")
      .should("have.length", expectedCardTitles.length)
      .eq(i)
      .findByTestId("card-embed-title")
      .should("contain.text", expectedCardTitles[i]);
  }
}

function addNewStandaloneCard(cardName: string) {
  // Move the cursor to the document's trailing empty paragraph
  H.documentContent().findByText("Advanced drag and drop scenarios").click();
  cy.realPress([
    H.metaKey,
    Cypress.platform === "darwin" ? "ArrowDown" : "End",
  ]);
  H.addToDocument("/", false);
  H.commandSuggestionItem("Chart").click();
  H.commandSuggestionItem(/Browse all/).click();
  H.pickEntity({ path: ["Our analytics", cardName], select: true });
}

function getCardWidths(
  cardNames: string[],
  cb: (val1: number, val2: number, val3?: number) => void,
) {
  const [firstCardName, secondCardName, thirdCardName] = cardNames;
  H.getDocumentCard(firstCardName).then((firstCard) => {
    H.getDocumentCard(secondCardName).then((secondCard) => {
      if (thirdCardName) {
        H.getDocumentCard(thirdCardName).then((thirdCard) => {
          cb(
            // Unjustified type cast. FIXME
            firstCard.width() as number,
            // Unjustified type cast. FIXME
            secondCard.width() as number,
            thirdCard.width(),
          );
        });
      } else {
        // Unjustified type cast. FIXME
        cb(firstCard.width() as number, secondCard.width() as number);
      }
    });
  });
}
