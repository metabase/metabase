import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import {
  DOCUMENT_WITH_THREE_CARDS_AND_COLUMNS,
  DOCUMENT_WITH_TWO_CARDS,
} from "e2e/support/document-initial-data";

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
        alias: "document",
        idAlias: "documentId",
      });

      H.visitDocument("@documentId");
    });

    it("should combine standalone cards into a flexContainer on the drop side", () => {
      waitForTableCard("Orders");
      waitForTableCard("Orders, Count");

      cy.log("dropping a card onto itself leaves both cards standalone");
      H.dragAndDropCardOnAnotherCard("Orders", "Orders");
      H.documentContent()
        .findAllByTestId("document-card-embed")
        .should("have.length", 2);
      flexContainers().should("not.exist");

      cy.log("dropping on the left side puts the dragged card first");
      H.dragAndDropCardOnAnotherCard("Orders", "Orders, Count");
      H.documentContent()
        .find('[data-type="resizeNode"] [data-type="flexContainer"]')
        .should("have.length", 1);
      flexContainers().within(() => {
        assertFlexContainerCardsOrder(["Orders", "Orders, Count"]);
      });

      H.documentUndo();
      H.documentContent()
        .findAllByTestId("document-card-embed")
        .should("have.length", 2);
      flexContainers().should("not.exist");

      cy.log("dropping on the right side puts the dragged card second");
      H.dragAndDropCardOnAnotherCard("Orders", "Orders, Count", {
        side: "right",
      });
      flexContainers().within(() => {
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
        alias: "document",
        idAlias: "documentId",
      });

      H.visitDocument("@documentId");
    });

    it("should resize and reorder cards within a flexContainer, keeping each card's width", () => {
      waitForTableCard("Orders");
      waitForTableCard("Orders, Count");

      flexContainers().within(() => {
        assertFlexContainerCardsOrder(["Orders", "Orders, Count"]);
      });

      getCardWidths(["Orders", "Orders, Count"], (first, second) => {
        cy.wrap(first).as("ogWidth1");
        cy.wrap(second).as("ogWidth2");
        expect(first).to.be.closeTo(second, 3);
      });

      cy.log("resize the columns");
      H.documentDoDrag(
        H.getResizeHandlesForFlexContianer(
          H.getFlexContainerForCard("Orders"),
        ).eq(0),
        { x: 100 },
      );

      getCardWidths(["Orders", "Orders, Count"], (first, second) => {
        cy.get<number>("@ogWidth1").then((originalFirst) => {
          cy.get<number>("@ogWidth2").then((originalSecond) => {
            cy.log("compare that changes are close to the drag distance");
            expect(originalFirst + 100).to.be.closeTo(first, 3);
            expect(originalSecond - 100).to.be.closeTo(second, 3);
            expect(first).to.be.closeTo(second + 200, 3);
          });
        });
        cy.wrap(first).as("ordersWidth");
        cy.wrap(second).as("ordersCountWidth");
      });

      cy.log("swap the cards");
      H.dragAndDropCardOnAnotherCard("Orders", "Orders, Count", {
        side: "right",
      });

      flexContainers().within(() => {
        assertFlexContainerCardsOrder(["Orders, Count", "Orders"]);
      });

      getCardWidths(
        ["Orders, Count", "Orders"],
        (ordersCountNewWidth, ordersNewWidth) => {
          cy.get<number>("@ordersWidth").then((originalOrdersWidth) => {
            cy.get<number>("@ordersCountWidth").then(
              (originalOrdersCountWidth) => {
                expect(ordersNewWidth).to.be.closeTo(originalOrdersWidth, 3);
                expect(ordersCountNewWidth).to.be.closeTo(
                  originalOrdersCountWidth,
                  3,
                );
              },
            );
          });
        },
      );

      cy.log("swap the cards back");
      H.dragAndDropCardOnAnotherCard("Orders", "Orders, Count", {
        side: "left",
      });

      flexContainers().within(() => {
        assertFlexContainerCardsOrder(["Orders", "Orders, Count"]);
      });

      cy.log(
        "moving a card out of the flexContainer onto a standalone card unwraps the card left behind",
      );
      H.dragAndDropCardOnAnotherCard(
        "Orders, Count",
        "Orders, Count, Grouped by Created At (year)",
        { side: "right" },
      );

      flexContainers()
        .should("have.length", 1)
        .within(() => {
          assertFlexContainerCardsOrder([
            "Orders, Count, Grouped by Created At (year)",
            "Orders, Count",
          ]);
        });
      H.documentContent()
        .findAllByTestId("document-card-embed")
        .should("have.length", 3);
    });

    it("should add a third card to an existing flexContainer, resize it, and delete cards from it", () => {
      waitForTableCard("Orders");
      waitForTableCard("Orders, Count");
      H.getDocumentCard("Orders, Count, Grouped by Created At (year)")
        .should("be.visible")
        .findByTestId("chart-container")
        .should("be.visible");

      flexContainers()
        .findAllByTestId("document-card-embed")
        .should("have.length", 2);

      H.dragAndDropCardOnAnotherCard(
        "Orders, Count, Grouped by Created At (year)",
        "Orders",
        { side: "left" },
      );

      flexContainers().within(() => {
        assertFlexContainerCardsOrder([
          "Orders, Count, Grouped by Created At (year)",
          "Orders",
          "Orders, Count",
        ]);
      });

      H.documentUndo();

      H.dragAndDropCardOnAnotherCard(
        "Orders, Count, Grouped by Created At (year)",
        "Orders",
        { side: "right" },
      );

      flexContainers().within(() => {
        assertFlexContainerCardsOrder([
          "Orders",
          "Orders, Count, Grouped by Created At (year)",
          "Orders, Count",
        ]);
      });

      H.documentUndo();

      H.dragAndDropCardOnAnotherCard(
        "Orders, Count, Grouped by Created At (year)",
        "Orders, Count",
        { side: "right" },
      );

      flexContainers().within(() => {
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

      H.documentDoDrag(
        H.getResizeHandlesForFlexContianer(
          H.getFlexContainerForCard("Orders"),
        ).eq(1),
        { x: 50 },
      );

      getCardWidths(cardNames, (first, second, third) => {
        cy.get<number>("@_first").then((_first) => {
          cy.get<number>("@_second").then((_second) => {
            cy.get<number>("@_third").then((_third) => {
              expect(first).to.be.closeTo(_first, 3);
              expect(second).to.be.greaterThan(_second);
              // Unjustified type cast. FIXME
              expect(third as unknown as number).to.be.lessThan(_third);
            });
          });
        });
      });

      cy.log("select a card in the flexContainer and delete it with Backspace");
      H.getDocumentCard("Orders").realClick({ position: "top" });
      cy.realPress("Backspace");

      flexContainers().within(() => {
        assertFlexContainerCardsOrder([
          "Orders, Count",
          "Orders, Count, Grouped by Created At (year)",
        ]);
      });

      cy.log("deleting down to 1 card unwraps the flexContainer");
      H.getDocumentCard("Orders, Count").realClick({ position: "top" });
      cy.realPress("Backspace");

      H.documentContent()
        .findAllByTestId("document-card-embed")
        .should("have.length", 1);
      H.getDocumentCard("Orders, Count, Grouped by Created At (year)").should(
        "be.visible",
      );
      flexContainers().should("not.exist");
    });
  });

  describe("adding and removing a table card in a new document", () => {
    it("should support text wrapping with proper row heights, and remove the card when it is the first item (UXW-2169)", () => {
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

      H.documentContent().click();
      H.addToDocument("/reviews", false);
      H.commandSuggestionItem(/reviews/).click();

      waitForTableCard("reviews");

      H.getDocumentCard("reviews").within(() => {
        H.tableInteractive()
          .find("[data-index=0]")
          .should("be.visible")
          .invoke("height")
          .should("be.greaterThan", 60);
      });

      cy.log("remove the card through its menu");
      H.openDocumentCardMenu("reviews");
      H.popover().findByText("Remove Chart").click();

      H.documentContent()
        .findAllByTestId("document-card-embed")
        .should("have.length", 0);
    });
  });

  describe("navigating from and deleting a cardEmbed", () => {
    it("should open the question and drill-throughs in a new tab with ctrl/meta, and delete a selected card with Backspace", () => {
      H.createDocument({
        name: "Test Document",
        document: DOCUMENT_WITH_TWO_CARDS,
        collection_id: null,
        alias: "document",
        idAlias: "documentId",
      });

      H.visitDocument("@documentId");

      waitForTableCard("Orders");
      waitForTableCard("Orders, Count");

      cy.log("ctrl/meta-click the card title");
      H.onNextAnchorClick(cy.stub().as("titleAnchorClick"));
      H.getDocumentCard("Orders")
        .findByTestId("card-embed-title")
        .click(H.holdMetaKey);
      assertOpenedInNewTab({
        alias: "@titleAnchorClick",
        href: /\/question\//,
      });

      cy.log("select the Orders card and delete it with Backspace");
      H.getDocumentCard("Orders").realClick({ position: "top" });
      cy.realPress("Backspace");

      H.documentContent()
        .findAllByTestId("document-card-embed")
        .should("have.length", 1);
      H.documentContent()
        .findByTestId("card-embed-title")
        .should("have.text", "Orders, Count");

      cy.log("ctrl/meta-click a drill-through action");
      H.getDocumentCard("Orders, Count")
        .findByTestId("table-body")
        .findAllByTestId("cell-data")
        .first()
        .click();

      H.onNextAnchorClick(cy.stub().as("drillAnchorClick"));
      H.popover()
        .findByText("See these Orders")
        .should("be.visible")
        .click(H.holdMetaKey);
      assertOpenedInNewTab({
        alias: "@drillAnchorClick",
        href: /\/question/,
      });
    });
  });
});

function flexContainers() {
  return H.documentContent().find('[data-type="flexContainer"]');
}

function waitForTableCard(cardName: string) {
  H.getDocumentCard(cardName)
    .should("be.visible")
    .findByTestId("table-root")
    .should("be.visible");
}

function assertOpenedInNewTab({
  alias,
  href,
}: {
  alias: string;
  href: RegExp;
}) {
  cy.get<sinon.SinonStub>(alias)
    .should("have.been.calledOnce")
    .then((stub) => {
      const anchor = stub.firstCall.args[0];
      expect(anchor).to.have.attr("href").match(href);
      expect(anchor).to.have.attr("rel", "noopener");
      expect(anchor).to.have.attr("target", "_blank");
    });
}

function assertFlexContainerCardsOrder(expectedCardTitles: string[]) {
  for (let i = 0; i < expectedCardTitles.length; i++) {
    cy.findAllByTestId("document-card-embed")
      .should("have.length", expectedCardTitles.length)
      .eq(i)
      .findByTestId("card-embed-title")
      .should("contain.text", expectedCardTitles[i]);
  }
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
