import {
  DOCUMENT_WITH_THREE_CARDS_AND_COLUMNS,
  DOCUMENT_WITH_TWO_CARDS,
} from "e2e/support/document-initial-data";

const { H } = cy;

describe("documents card embed node custom logic", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
    H.activateToken("bleeding-edge");
  });

  describe("cardEmbed drag and drop", () => {
    beforeEach(() => {
      H.createDocument({
        name: "DnD Test Document",
        document: DOCUMENT_WITH_TWO_CARDS,
        collection_id: null,
        alias: "document",
        idAlias: "documentId",
      });

      cy.get("@documentId").then((id) => cy.visit(`/document/${id}`));
    });

    it("should create a flexContainer when dropping one cardEmbed onto another standalone cardEmbed", () => {
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

      // Verify that originally separate cards are now side by side
      H.documentContent()
        .find('[data-type="flexContainer"]')
        .within(() => {
          cy.findAllByTestId("document-card-embed").should("have.length", 2);
        });
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

    it("should prevent dropping a card onto itself", () => {
      // Wait for cards to load
      H.getDocumentCard("Orders")
        .should("be.visible")
        .findByTestId("table-root")
        .should("exist");

      // Verify initial state - no flexContainer
      H.documentContent()
        .find('[data-type="flexContainer"]')
        .should("not.exist");

      // Attempt to drag and drop the card onto itself
      H.dragAndDropCardOnAnotherCard("Orders", "Orders");

      // Verify no flexContainer was created
      H.documentContent()
        .find('[data-type="flexContainer"]')
        .should("not.exist");

      // Verify the card is still standalone
      H.getDocumentCard("Orders").should("exist");
    });
  });

  describe("advanced flexContainer scenarios", () => {
    beforeEach(() => {
      H.createDocument({
        name: "Advanced DnD Test Document",
        document: DOCUMENT_WITH_THREE_CARDS_AND_COLUMNS,
        collection_id: null,
        alias: "document",
        idAlias: "documentId",
      });

      cy.get("@documentId").then((id) => cy.visit(`/document/${id}`));
    });

    it("should allow you to resize the cards inside a flex container", () => {
      getCardWidths(["Orders", "Orders, Count"], (first, second) => {
        cy.wrap(first).as("ogWidth1");
        cy.wrap(second).as("ogWidth2");
        expect(first).to.be.closeTo(second, 3);
      });

      H.getDocumentCard("Orders").as("ORDERS_CARD");
      H.getDocumentCard("Orders, Count").as("ORDERS_COUNT_CARD");

      const flexContainer = H.getFlexContainerForCard("Orders");

      const handles = H.getResizeHandlesForFlexContianer(flexContainer);

      H.documentDoDrag(handles.eq(0), { x: 100 });

      getCardWidths(["Orders", "Orders, Count"], (first, second) => {
        cy.get("@ogWidth1").then((_first) => {
          cy.get("@ogWidth2").then((_second) => {
            cy.log("compare that changes are close to the drag distance");
            expect((_first as unknown as number) + 100).to.be.closeTo(first, 3);
            expect((_second as unknown as number) - 100).to.be.closeTo(
              second,
              3,
            );

            expect(first).to.be.closeTo(second + 200, 3);
          });
        });
      });
    });

    it("should add a third card to an existing flexContainer with 2 cards", () => {
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
        expect(first).to.be.closeTo(third as unknown as number, 10);
      });

      const flexContainer = H.getFlexContainerForCard("Orders");

      const handles = H.getResizeHandlesForFlexContianer(flexContainer);

      H.documentDoDrag(handles.eq(1), { x: 50 });

      getCardWidths(cardNames, (first, second, third) => {
        cy.get("@_first").then((_first) => {
          cy.get("@_second").then((_second) => {
            cy.get("@_third").then((_third) => {
              expect(first).to.be.closeTo(_first as unknown as number, 3);
              expect(second).to.be.greaterThan(_second as unknown as number);
              expect(third).to.be.lessThan(_third as unknown as number);
            });
          });
        });
      });
    });

    it("should prevent adding a fourth card to a flexContainer with 3 cards", () => {
      // Wait for all cards to load
      H.getDocumentCard("Orders")
        .should("be.visible")
        .findByTestId("table-root")
        .should("exist");
      H.getDocumentCard("Orders, Count")
        .should("be.visible")
        .findByTestId("table-root")
        .should("exist");

      // First, add the third card to reach the limit
      H.dragAndDropCardOnAnotherCard(
        "Orders, Count, Grouped by Created At (year)",
        "Orders",
        { side: "right" },
      );

      // Verify we have 3 cards in the flexContainer
      H.documentContent()
        .find('[data-type="flexContainer"]')
        .within(() => {
          cy.findAllByTestId("document-card-embed").should("have.length", 3);
        });

      // Add another card to try to exceed the limit
      addNewStandaloneCard("Orders Model", "model");

      // Wait for the new card to be added
      H.documentContent()
        .findAllByTestId("document-card-embed")
        .should("have.length", 4); // 3 in flexContainer + 1 new standalone

      // Try to drag the new standalone card onto the flexContainer
      H.dragAndDropCardOnAnotherCard("Orders", "Orders, Count", {
        side: "left",
      });

      // Verify the flexContainer still has only 3 cards (drop should be rejected)
      H.documentContent()
        .find('[data-type="flexContainer"]')
        .within(() => {
          cy.findAllByTestId("document-card-embed").should("have.length", 3);
        });

      // Verify the standalone card is still separate
      H.documentContent()
        .findAllByTestId("document-card-embed")
        .should("have.length", 4); // Still 4 total, with 1 standalone
    });

    it("should reorder cards within the same flexContainer", () => {
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
    });

    it("should handle moving cards between different flexContainers", () => {
      // First create another flexContainer by dragging the standalone card onto a new location
      // Add another standalone card first
      addNewStandaloneCard("Orders Model", "model");

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

  describe("deleting a cardEmbed", () => {
    it("should delete a cardEmbed when selected and Backspace is pressed", () => {
      H.createDocument({
        name: "DnD Test Document",
        document: DOCUMENT_WITH_TWO_CARDS,
        collection_id: null,
        alias: "document",
        idAlias: "documentId",
      });

      cy.get("@documentId").then((id) => cy.visit(`/document/${id}`));

      // Wait for cards to load
      H.getDocumentCard("Orders")
        .should("be.visible")
        .findByTestId("table-root")
        .should("exist");
      H.getDocumentCard("Orders, Count")
        .should("be.visible")
        .findByTestId("table-root")
        .should("exist");

      // Verify initial state - we have 2 standalone cards
      H.documentContent()
        .findAllByTestId("document-card-embed")
        .should("have.length", 2);

      // Click on the Orders card to select it
      H.getDocumentCard("Orders").realClick({ position: "top" });

      // Press Backspace to delete the selected card
      cy.realPress("Backspace");

      // Verify the Orders card has been deleted
      H.getDocumentCard("Orders", false).should("not.exist");

      // Verify only one card remains
      H.documentContent()
        .findAllByTestId("document-card-embed")
        .should("have.length", 1);

      // Verify the remaining card is Orders, Count
      H.getDocumentCard("Orders, Count").should("exist").and("be.visible");
    });

    it("should delete a cardEmbed from a flexContainer when selected and Backspace is pressed", () => {
      H.createDocument({
        name: "DnD Test Document",
        document: DOCUMENT_WITH_THREE_CARDS_AND_COLUMNS,
        collection_id: null,
        alias: "document",
        idAlias: "documentId",
      });

      cy.get("@documentId").then((id) => cy.visit(`/document/${id}`));

      // First create a flexContainer by dropping one card onto another
      H.getDocumentCard("Orders")
        .should("be.visible")
        .findByTestId("table-root")
        .should("exist");
      H.getDocumentCard("Orders, Count")
        .should("be.visible")
        .findByTestId("table-root")
        .should("exist");

      // Create flexContainer
      H.dragAndDropCardOnAnotherCard(
        "Orders, Count, Grouped by Created At (year)",
        "Orders",
        { side: "right" },
      );

      // Verify flexContainer was created with 2 cards
      H.documentContent()
        .find('[data-type="flexContainer"]')
        .should("exist")
        .within(() => {
          cy.findAllByTestId("document-card-embed").should("have.length", 3);
        });

      // Click on one of the cards in the flexContainer to select it
      H.getDocumentCard("Orders").realClick({ position: "top" });

      // Press Backspace to delete the selected card
      cy.realPress("Backspace");

      // Verify the Orders card has been deleted from the flexContainer
      H.getDocumentCard("Orders", false).should("not.exist");

      H.documentContent()
        .findAllByTestId("document-card-embed")
        .should("have.length", 2);

      H.documentContent().get('[data-type="flexContainer"]').should("exist");

      // Click on one of the cards in the flexContainer to select it
      H.getDocumentCard("Orders, Count").realClick({ position: "top" });

      // Press Backspace to delete the selected card
      cy.realPress("Backspace");

      // Verify the flexContainer now has only 1 card and should be unwrapped back to standalone
      H.documentContent()
        .get('[data-type="flexContainer"]')
        .should("not.exist"); // FlexContainer should be unwrapped when only 1 card remains

      // Verify only the Orders, Count card remains as a standalone card
      H.documentContent()
        .findAllByTestId("document-card-embed")
        .should("have.length", 1);
      H.getDocumentCard("Orders, Count, Grouped by Created At (year)").should(
        "exist",
      );
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

function addNewStandaloneCard(
  cardName: string,
  cardType: "question" | "model",
) {
  cy.get(".node-paragraph.is-empty").click();
  H.addToDocument("/", false);
  H.commandSuggestionItem("Chart").click();
  H.entityPickerModalTab(
    cardType === "question" ? "Questions" : "Models",
  ).click();
  H.entityPickerModalItem(1, cardName).click();
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
            firstCard.width() as number,
            secondCard.width() as number,
            thirdCard.width() as number,
          );
        });
      } else {
        cb(firstCard.width() as number, secondCard.width() as number);
      }
    });
  });
}
