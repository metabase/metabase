import {
  DOCUMENT_WITH_SUPPORTING_TEXT,
  DOCUMENT_WITH_THREE_CARDS_AND_COLUMNS,
  DOCUMENT_WITH_TWO_CARDS,
  DOCUMENT_WITH_TWO_LIGHTWEIGHT_CARDS,
} from "e2e/support/document-initial-data";

const { H } = cy;

const SUPPORTING_TEXT_PLACEHOLDER = "Write whatever you'd like to";
const ORDERS_BY_YEAR_CARD_TITLE = "Orders, Count, Grouped by Created At (year)";

const flexContainer = () =>
  H.documentContent().find('[data-type="flexContainer"]');

const supportingText = () =>
  H.documentContent().findByTestId("document-card-supporting-text");

// The menu item is rendered disabled while the node view can't resolve its
// position, and a click on the label of a disabled button is dropped without
// an error, so click the button itself once it is enabled.
const addSupportingText = (cardTitle: string) => {
  H.openDocumentCardMenu(cardTitle);
  H.popover()
    .findByText("Add supporting text")
    .closest("button")
    .should("be.enabled")
    .click();
};

// The item is also disabled while the card's node view can't resolve its
// position, which lasts until the node view renders again after it is attached
// to the editor. The visualization only renders once the attached card reports
// it is in the viewport, so a visible visualization means the menu reflects
// the supporting-text rule.
const assertAddSupportingTextDisabled = ({
  cardTitle,
  vizTestId,
}: {
  cardTitle: string;
  vizTestId: "visualization-root" | "table-root";
}) => {
  H.getDocumentCard(cardTitle).findByTestId(vizTestId).should("be.visible");
  H.openDocumentCardMenu(cardTitle);
  H.popover()
    .findByRole("menuitem", { name: /Replace/ })
    .should("be.enabled");
  H.popover()
    .findByText("Add supporting text")
    .closest("button")
    .should("have.attr", "data-disabled");
};

describe("documents supporting text", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
  });

  it("should add and edit supporting text on a standalone card, and allow only one per group", () => {
    H.createDocument({
      name: "Supporting Text Test Document",
      document: DOCUMENT_WITH_TWO_LIGHTWEIGHT_CARDS,
      collection_id: null,
      alias: "document",
      idAlias: "documentId",
    });

    H.visitDocument("@documentId");

    H.getDocumentCard(ORDERS_BY_YEAR_CARD_TITLE)
      .findByTestId("visualization-root")
      .should("be.visible");
    supportingText().should("not.exist");
    flexContainer().should("not.exist");

    addSupportingText(ORDERS_BY_YEAR_CARD_TITLE);

    cy.log(
      "The card is wrapped in a flexContainer together with an empty supporting text",
    );
    // Kept as two re-queried chains: `.within()` freezes its subject, and the
    // card's node view is recreated when it moves into the new flexContainer.
    flexContainer()
      .findByTestId("document-card-supporting-text")
      .should("contain.text", SUPPORTING_TEXT_PLACEHOLDER);
    flexContainer()
      .findByTestId("document-card-embed")
      .should("contain.text", ORDERS_BY_YEAR_CARD_TITLE);

    cy.log(
      "Backspace in empty supporting text removes it and unwraps the flexContainer",
    );
    supportingText().find(".node-paragraph").click();
    cy.realPress("Backspace");
    supportingText().should("not.exist");
    flexContainer().should("not.exist");
    H.getDocumentCard(ORDERS_BY_YEAR_CARD_TITLE)
      .findByTestId("visualization-root")
      .should("be.visible");

    addSupportingText(ORDERS_BY_YEAR_CARD_TITLE);
    supportingText().should("contain.text", SUPPORTING_TEXT_PLACEHOLDER);

    cy.log("Markdown input rules apply inside supporting text");
    cy.realType("# Hdg{enter}Lorem ipsum");
    supportingText().contains("h1", "Hdg").should("be.visible");
    supportingText().contains("p", "Lorem ipsum").should("be.visible");

    cy.log("A group that already has supporting text can't get another one");
    assertAddSupportingTextDisabled({
      cardTitle: ORDERS_BY_YEAR_CARD_TITLE,
      vizTestId: "visualization-root",
    });
  });

  it("should add supporting text to a group, drop it when the group loses its last card, and disallow it in a full group", () => {
    H.createDocument({
      name: "Supporting Text auto-cleanup",
      document: DOCUMENT_WITH_THREE_CARDS_AND_COLUMNS,
      collection_id: null,
      alias: "document",
      idAlias: "documentId",
    });
    H.visitDocument("@documentId");

    H.getDocumentCard("Orders").findByTestId("table-root").should("be.visible");
    supportingText().should("not.exist");

    addSupportingText("Orders");

    cy.log("Supporting text is inserted into the existing flexContainer");
    flexContainer()
      .findByTestId("document-card-supporting-text")
      .should("contain.text", SUPPORTING_TEXT_PLACEHOLDER);
    flexContainer()
      .findAllByTestId("document-card-embed")
      .should("have.length", 2);

    cy.realType("Lorem ipsum");
    supportingText().should("contain.text", "Lorem ipsum");

    cy.log("One card remaining in group, supportingText should exist");
    H.dragAndDropCardOnAnotherCard("Orders", ORDERS_BY_YEAR_CARD_TITLE);
    H.getFlexContainerForCard(ORDERS_BY_YEAR_CARD_TITLE)
      .findAllByTestId("document-card-embed")
      .should("have.length", 2);
    H.documentContent().findByText("Lorem ipsum").should("be.visible");

    cy.log("No cards remaining in group, supportingText should not exist");
    H.dragAndDropCardOnAnotherCard("Orders, Count", ORDERS_BY_YEAR_CARD_TITLE);
    H.getFlexContainerForCard(ORDERS_BY_YEAR_CARD_TITLE)
      .findAllByTestId("document-card-embed")
      .should("have.length", 3);
    H.documentContent().findByText("Lorem ipsum").should("not.exist");

    cy.log("A group with 3 cards can't get supporting text");
    assertAddSupportingTextDisabled({
      cardTitle: "Orders",
      vizTestId: "table-root",
    });
  });

  it("should allow resizing supporting text and persist width after save", () => {
    cy.intercept({
      method: "GET",
      path: "/api/document/*",
    }).as("documentGet");

    H.createDocument({
      name: "Resize Supporting Text Test Document",
      document: DOCUMENT_WITH_TWO_CARDS,
      collection_id: null,
      alias: "document",
      idAlias: "documentId",
    });

    H.visitDocument("@documentId");

    H.getDocumentCard("Orders").findByTestId("table-root").should("be.visible");

    addSupportingText("Orders");

    flexContainer()
      .findByTestId("document-card-supporting-text")
      .should("be.visible");

    cy.log("Measure initial widths of supporting text and card");
    supportingText().then(($supportingText) => {
      // Unjustified type cast. FIXME
      const initialSupportingTextWidth = $supportingText.width() as number;
      cy.wrap(initialSupportingTextWidth).as("initialSupportingTextWidth");

      H.getDocumentCard("Orders").then(($card) => {
        // Unjustified type cast. FIXME
        const initialCardWidth = $card.width() as number;
        cy.wrap(initialCardWidth).as("initialCardWidth");
      });
    });

    cy.log("Drag the handle to widen the supporting text and narrow the card");
    H.documentDoDrag(
      H.getResizeHandlesForFlexContianer(flexContainer()).eq(0),
      { x: 150 },
    );

    supportingText().then(($supportingText) => {
      // Unjustified type cast. FIXME
      const newSupportingTextWidth = $supportingText.width() as number;
      cy.wrap(newSupportingTextWidth).as("newSupportingTextWidth");

      H.getDocumentCard("Orders").then(($card) => {
        // Unjustified type cast. FIXME
        const newCardWidth = $card.width() as number;
        cy.wrap(newCardWidth).as("newCardWidth");

        cy.get<number>("@initialSupportingTextWidth").then((initialWidth) => {
          expect(newSupportingTextWidth).to.be.greaterThan(initialWidth);
          expect(newSupportingTextWidth).to.be.closeTo(initialWidth + 150, 10);
        });

        cy.get<number>("@initialCardWidth").then((initialWidth) => {
          expect(newCardWidth).to.be.lessThan(initialWidth);
          expect(newCardWidth).to.be.closeTo(initialWidth - 150, 10);
        });
      });
    });

    supportingText().within(() => cy.get(".node-paragraph").click());

    const testText = "Supporting text for Orders chart";
    cy.realType(testText);
    cy.realPress("Tab");

    supportingText().should("contain.text", testText);

    H.documentSaveButton().should("not.be.disabled").click();

    cy.findByTestId("toast-undo")
      .should("be.visible")
      .and("contain.text", "Document saved");

    cy.log("Reload to verify the widths persisted");
    cy.reload();

    cy.wait("@documentGet");

    H.getDocumentCard("Orders").findByTestId("table-root").should("be.visible");

    supportingText()
      .should("contain.text", testText)
      .then(($supportingText) => {
        // Unjustified type cast. FIXME
        const reloadedSupportingTextWidth = $supportingText.width() as number;

        H.getDocumentCard("Orders").then(($card) => {
          // Unjustified type cast. FIXME
          const reloadedCardWidth = $card.width() as number;

          cy.get<number>("@newSupportingTextWidth").then((savedWidth) => {
            expect(reloadedSupportingTextWidth).to.be.closeTo(savedWidth, 10);
          });

          cy.get<number>("@newCardWidth").then((savedWidth) => {
            expect(reloadedCardWidth).to.be.closeTo(savedWidth, 10);
          });
        });
      });
  });

  describe("drag and drop", () => {
    type Block = { card: string } | { supportingText: string };

    const blockRect = ($content: JQuery<HTMLElement>, block: Block) => {
      const $block =
        "card" in block
          ? $content
              .find('[data-testid="card-embed-title"]')
              .filter((_index, element) => element.innerText === block.card)
              .closest('[data-testid="document-card-embed"]')
          : $content
              .find('[data-testid="document-card-supporting-text"]')
              .filter((_index, element) =>
                element.innerText.includes(block.supportingText),
              );
      expect($block).to.have.length(1);
      return $block[0].getBoundingClientRect();
    };

    const assertHorizontalLayout = (left: Block, right: Block) =>
      H.documentContent().should(($content) => {
        const leftRect = blockRect($content, left);
        const rightRect = blockRect($content, right);
        expect(rightRect.left).to.gte(leftRect.right);
        expect(leftRect.top).to.be.closeTo(rightRect.top, 2);
      });

    const assertVerticalLayout = (top: Block, bottom: Block) =>
      H.documentContent().should(($content) => {
        const topRect = blockRect($content, top);
        const bottomRect = blockRect($content, bottom);
        expect(bottomRect.top).to.gte(topRect.bottom);
        expect(topRect.left).to.be.closeTo(bottomRect.left, 2);
      });

    const getSupportingText = () =>
      H.documentContent()
        .findAllByTestId("document-card-supporting-text")
        .contains("Lorem ipsum")
        .closest('[data-testid="document-card-supporting-text"]');

    const SUPPORTING_TEXT: Block = { supportingText: "Lorem ipsum" };
    const ORDERS: Block = { card: "Orders" };
    const ORDERS_COUNT: Block = { card: "Orders, Count" };

    it("should reorder and insert blocks around a supporting text, and ignore drops outside its group", () => {
      H.createDocument({
        name: "DnD Test Document",
        document: DOCUMENT_WITH_SUPPORTING_TEXT,
        collection_id: null,
        alias: "document",
        idAlias: "documentId",
      });
      H.visitDocument("@documentId");

      H.getDocumentCard("Orders").should("be.visible");
      H.getDocumentCard("Orders, Count").should("be.visible");
      assertHorizontalLayout(SUPPORTING_TEXT, ORDERS);

      cy.log("Dropping a supporting text outside of its group does nothing");
      H.documentsDragAndDrop({
        getSource: () => getSupportingText().find("[data-drag-handle]"),
        getTarget: () => H.getDocumentCard("Orders, Count"),
      });
      assertHorizontalLayout(SUPPORTING_TEXT, ORDERS);
      assertVerticalLayout(SUPPORTING_TEXT, ORDERS_COUNT);

      cy.log("Dropping a supporting text onto a card reorders the group");
      H.documentsDragAndDrop({
        getSource: () => getSupportingText().find("[data-drag-handle]"),
        getTarget: () => H.getDocumentCard("Orders"),
        side: "right",
      });
      assertHorizontalLayout(ORDERS, SUPPORTING_TEXT);
      assertVerticalLayout(ORDERS, ORDERS_COUNT);

      cy.log("Dropping a card onto a supporting text reorders the group");
      H.documentsDragAndDrop({
        getSource: () => H.getDocumentCard("Orders"),
        getTarget: () => getSupportingText(),
        side: "right",
      });
      assertHorizontalLayout(SUPPORTING_TEXT, ORDERS);
      assertVerticalLayout(SUPPORTING_TEXT, ORDERS_COUNT);

      cy.log("Dropping an outside card onto a supporting text inserts it");
      H.documentsDragAndDrop({
        getSource: () => H.getDocumentCard("Orders, Count"),
        getTarget: () => getSupportingText(),
        side: "left",
      });
      assertHorizontalLayout(ORDERS_COUNT, SUPPORTING_TEXT);
      assertHorizontalLayout(SUPPORTING_TEXT, ORDERS);
    });
  });
});
