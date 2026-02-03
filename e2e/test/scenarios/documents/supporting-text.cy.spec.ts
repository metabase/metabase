import {
  DOCUMENT_WITH_SUPPORTING_TEXT,
  DOCUMENT_WITH_THREE_CARDS_AND_COLUMNS,
  DOCUMENT_WITH_TWO_CARDS,
} from "e2e/support/document-initial-data";

const { H } = cy;

describe("documents supporting text", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
  });

  it("should add supporting text to a standalone cardEmbed", () => {
    H.createDocument({
      name: "Supporting Text Test Document",
      document: DOCUMENT_WITH_TWO_CARDS,
      collection_id: null,
      alias: "document",
      idAlias: "documentId",
    });

    H.visitDocument("@documentId");

    // Wait for cards to load
    H.getDocumentCard("Orders")
      .should("be.visible")
      .findByTestId("table-root")
      .should("exist");

    // Verify no supporting text or flexContainer exists initially
    H.documentContent()
      .findByTestId("document-card-supporting-text")
      .should("not.exist");
    H.documentContent().find('[data-type="flexContainer"]').should("not.exist");

    // Open the card menu and click "Add supporting text"
    H.openDocumentCardMenu("Orders");
    H.popover().findByText("Add supporting text").click();

    // Verify a flexContainer was created
    H.documentContent().find('[data-type="flexContainer"]').should("exist");

    // Verify supporting text was added
    H.documentContent()
      .findByTestId("document-card-supporting-text")
      .should("exist");

    // Verify the supporting text has the placeholder text
    H.documentContent()
      .findByTestId("document-card-supporting-text")
      .should("contain.text", "Write whatever you'd like to");

    // Verify the flexContainer contains both supporting text and the card
    H.documentContent()
      .find('[data-type="flexContainer"]')
      .within(() => {
        cy.findByTestId("document-card-supporting-text").should("exist");
        cy.findByTestId("document-card-embed").should("exist");
      });

    // Verify the card is still there
    H.getDocumentCard("Orders").should("exist");
  });

  it("should add supporting text to a cardEmbed in a flexContainer", () => {
    H.createDocument({
      name: "Supporting Text Flex Test Document",
      document: DOCUMENT_WITH_TWO_CARDS,
      collection_id: null,
      alias: "document",
      idAlias: "documentId",
    });

    H.visitDocument("@documentId");

    // Wait for cards to load
    H.getDocumentCard("Orders")
      .should("be.visible")
      .findByTestId("table-root")
      .should("exist");
    H.getDocumentCard("Orders, Count")
      .should("be.visible")
      .findByTestId("table-root")
      .should("exist");

    // Create a flexContainer by dropping one card onto another
    H.dragAndDropCardOnAnotherCard("Orders", "Orders, Count");

    // Verify flexContainer was created
    H.documentContent().find('[data-type="flexContainer"]').should("exist");

    // Verify no supporting text exists yet
    H.documentContent()
      .findByTestId("document-card-supporting-text")
      .should("not.exist");

    // Open the card menu and click "Add supporting text"
    H.openDocumentCardMenu("Orders");
    H.popover().findByText("Add supporting text").click();

    // Verify supporting text was added at the beginning of the flexContainer
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
  });

  it("should allow editing supporting text content", () => {
    H.createDocument({
      name: "Edit Supporting Text Test Document",
      document: DOCUMENT_WITH_TWO_CARDS,
      collection_id: null,
      alias: "document",
      idAlias: "documentId",
    });

    H.visitDocument("@documentId");

    // Wait for cards to load
    H.getDocumentCard("Orders")
      .should("be.visible")
      .findByTestId("table-root")
      .should("exist");

    // Add supporting text
    H.openDocumentCardMenu("Orders");
    H.popover().findByText("Add supporting text").click();

    // Verify supporting text was added
    H.documentContent()
      .findByTestId("document-card-supporting-text")
      .should("exist");

    // Type some content
    const testText = "# Hdg{enter}Lorem ipsum";
    cy.realType(testText);

    // Verify the text was added
    H.documentContent()
      .findByTestId("document-card-supporting-text")
      .contains("h1", "Hdg")
      .should("exist");
    H.documentContent()
      .findByTestId("document-card-supporting-text")
      .contains("p", "Lorem ipsum")
      .should("exist");
  });

  it("should disable 'Add supporting text' when supporting text already exists in flexContainer", () => {
    H.createDocument({
      name: "Disable Supporting Text Test Document",
      document: DOCUMENT_WITH_TWO_CARDS,
      collection_id: null,
      alias: "document",
      idAlias: "documentId",
    });

    H.visitDocument("@documentId");

    // Wait for cards to load
    H.getDocumentCard("Orders")
      .should("be.visible")
      .findByTestId("table-root")
      .should("exist");

    // Add supporting text to the first card
    H.openDocumentCardMenu("Orders");
    H.popover().findByText("Add supporting text").click();

    // Verify supporting text was added
    H.documentContent()
      .findByTestId("document-card-supporting-text")
      .should("exist");

    // Try to add another supporting text to the same flexContainer
    H.openDocumentCardMenu("Orders");

    // Verify the "Add supporting text" option is disabled
    H.popover()
      .findByText("Add supporting text")
      .closest("button")
      .should("have.attr", "data-disabled");
  });

  it("should disable 'Add supporting text' when flexContainer has 3 cards", () => {
    H.createDocument({
      name: "Max Cards Supporting Text Test Document",
      document: DOCUMENT_WITH_THREE_CARDS_AND_COLUMNS,
      collection_id: null,
      alias: "document",
      idAlias: "documentId",
    });

    H.visitDocument("@documentId");

    // Wait for all cards to load
    H.getDocumentCard("Orders")
      .should("be.visible")
      .findByTestId("table-root")
      .should("exist");
    H.getDocumentCard("Orders, Count")
      .should("be.visible")
      .findByTestId("table-root")
      .should("exist");

    // Add the third card to reach MAX_GROUP_SIZE
    H.dragAndDropCardOnAnotherCard(
      "Orders, Count, Grouped by Created At (year)",
      "Orders",
      { side: "right" },
    );

    // Verify flexContainer has 3 cards
    H.documentContent()
      .find('[data-type="flexContainer"]')
      .within(() => {
        cy.findAllByTestId("document-card-embed").should("have.length", 3);
      });

    // Open the card menu
    H.openDocumentCardMenu("Orders");

    // Verify the "Add supporting text" option is disabled
    H.popover()
      .findByText("Add supporting text")
      .closest("button")
      .should("have.attr", "data-disabled");
  });

  it("should remove supporting text when it becomes empty and Backspace is pressed", () => {
    H.createDocument({
      name: "Remove Empty Supporting Text Test Document",
      document: DOCUMENT_WITH_TWO_CARDS,
      collection_id: null,
      alias: "document",
      idAlias: "documentId",
    });

    H.visitDocument("@documentId");

    // Wait for cards to load
    H.getDocumentCard("Orders")
      .should("be.visible")
      .findByTestId("table-root")
      .should("exist");

    // Add supporting text
    H.openDocumentCardMenu("Orders");
    H.popover().findByText("Add supporting text").click();

    // Verify supporting text was added
    H.documentContent()
      .findByTestId("document-card-supporting-text")
      .should("exist");

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
    H.documentContent().find('[data-type="flexContainer"]').should("not.exist");

    // Verify the card is still there as a standalone card
    H.getDocumentCard("Orders").should("exist");
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

    // Wait for cards to load
    H.getDocumentCard("Orders")
      .should("be.visible")
      .findByTestId("table-root")
      .should("exist");

    // Add supporting text to create a flexContainer
    H.openDocumentCardMenu("Orders");
    H.popover().findByText("Add supporting text").click();

    // Verify flexContainer and supporting text were created
    H.documentContent().find('[data-type="flexContainer"]').should("exist");
    H.documentContent()
      .findByTestId("document-card-supporting-text")
      .should("exist");

    // Get initial widths of supporting text and card
    H.documentContent()
      .findByTestId("document-card-supporting-text")
      .then(($supportingText) => {
        const initialSupportingTextWidth = $supportingText.width() as number;
        cy.wrap(initialSupportingTextWidth).as("initialSupportingTextWidth");

        H.getDocumentCard("Orders").then(($card) => {
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
        const newSupportingTextWidth = $supportingText.width() as number;
        cy.wrap(newSupportingTextWidth).as("newSupportingTextWidth");

        H.getDocumentCard("Orders").then(($card) => {
          const newCardWidth = $card.width() as number;
          cy.wrap(newCardWidth).as("newCardWidth");

          cy.get<number>("@initialSupportingTextWidth").then((initialWidth) => {
            // Supporting text should be wider
            expect(newSupportingTextWidth).to.be.greaterThan(initialWidth);
            // The change should be close to the drag distance
            expect(newSupportingTextWidth).to.be.closeTo(
              initialWidth + 150,
              10,
            );
          });

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
    cy.reload();

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
        const reloadedSupportingTextWidth = $supportingText.width() as number;

        H.getDocumentCard("Orders").then(($card) => {
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

  it("should remove supporting text when the last chart in its group is removed", () => {
    H.createDocument({
      name: "Supporting Text auto-cleanup",
      document: DOCUMENT_WITH_THREE_CARDS_AND_COLUMNS,
      collection_id: null,
      alias: "document",
      idAlias: "documentId",
    });
    H.visitDocument("@documentId");

    H.openDocumentCardMenu("Orders");
    H.popover().findByText("Add supporting text").click();
    cy.realType("Lorem ipsum");

    const targetCardTitle = "Orders, Count, Grouped by Created At (year)";

    cy.log("One card remaining in group, supportingText should exist");
    H.dragAndDropCardOnAnotherCard("Orders", targetCardTitle);
    H.documentContent().findByText("Lorem ipsum").should("exist");

    cy.log("No cards remaining in group, supportingText should not exist");
    H.dragAndDropCardOnAnotherCard("Orders, Count", targetCardTitle);
    H.documentContent().findByText("Lorem ipsum").should("not.exist");
  });

  describe("drag and drop", () => {
    beforeEach(() => {
      H.createDocument({
        name: "DnD Test Document",
        document: DOCUMENT_WITH_SUPPORTING_TEXT,
        collection_id: null,
        alias: "document",
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

    it("should reorder when dropping a supporting text block onto a card", () => {
      H.getDocumentCard("Orders").should("exist");
      H.documentsDragAndDrop({
        getSource: () => getSupportingText().find("[data-drag-handle]"),
        getTarget: () => H.getDocumentCard("Orders"),
        side: "right",
      });

      assertHorizontalLayout(H.getDocumentCard("Orders"), getSupportingText());
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

      assertHorizontalLayout(H.getDocumentCard("Orders"), getSupportingText());
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
      assertHorizontalLayout(getSupportingText(), H.getDocumentCard("Orders"));
    });

    it("should do nothing if dragging a supporting text block outside of a group", () => {
      H.getDocumentCard("Orders").should("exist");
      H.documentsDragAndDrop({
        getSource: () => getSupportingText().find("[data-drag-handle]"),
        getTarget: () => H.getDocumentCard("Orders, Count"),
      });

      assertHorizontalLayout(getSupportingText(), H.getDocumentCard("Orders"));
      assertVerticalLayout(
        getSupportingText(),
        H.getDocumentCard("Orders, Count"),
      );
    });
  });
});
