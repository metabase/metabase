import {
  ORDERS_COUNT_QUESTION_ID,
  ORDERS_QUESTION_ID,
} from "e2e/support/cypress_sample_instance_data";
import { dragAndDropCardOnAnotherCard } from "e2e/support/helpers";

const { H } = cy;

describe("documents card embed drag and drop", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
    H.activateToken("bleeding-edge");
    H.resetSnowplow();
  });

  describe("cardEmbed drag and drop", () => {
    beforeEach(() => {
      H.createDocument({
        name: "DnD Test Document",
        document: {
          content: [
            {
              type: "paragraph",
              content: [
                {
                  type: "text",
                  text: "Testing drag and drop functionality",
                },
              ],
              attrs: {
                _id: "1",
              },
            },
            {
              type: "resizeNode",
              attrs: {
                height: 350,
                minHeight: 280,
                _id: "2",
              },
              content: [
                {
                  type: "cardEmbed",
                  attrs: {
                    id: ORDERS_QUESTION_ID,
                    name: null,
                    _id: "2a",
                  },
                },
              ],
            },
            {
              type: "paragraph",
              content: [
                {
                  type: "text",
                  text: "Some text between cards",
                },
              ],
              attrs: {
                _id: "3",
              },
            },
            {
              type: "resizeNode",
              attrs: {
                height: 350,
                minHeight: 280,
                _id: "4",
              },
              content: [
                {
                  type: "cardEmbed",
                  attrs: {
                    id: ORDERS_COUNT_QUESTION_ID,
                    name: null,
                    _id: "4a",
                  },
                },
              ],
            },
            {
              type: "paragraph",
              attrs: {
                _id: "5",
              },
            },
          ],
          type: "doc",
        },
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

      dragAndDropCardOnAnotherCard("Orders", "Orders, Count");

      // Verify flexContainer was created
      H.documentContent()
        .find('[data-type="flexContainer"]')
        .should("exist")
        .and("be.visible");

      // Verify both cards are now inside the flexContainer
      H.documentContent()
        .find('[data-type="flexContainer"]')
        .within(() => {
          cy.findAllByTestId("document-card-embed")
            .contains('[data-testid="document-card-embed"]', "Orders")
            .should("exist");
          cy.findAllByTestId("document-card-embed")
            .contains('[data-testid="document-card-embed"]', "Orders, Count")
            .should("exist");
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
        .find('[data-testid="document-card-embed"]')
        .should("have.length", 2);
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

      dragAndDropCardOnAnotherCard("Orders", "Orders, Count", {
        side: "right",
      });

      // Verify flexContainer was created with correct order
      H.documentContent()
        .find('[data-type="flexContainer"]')
        .should("exist")
        .within(() => {
          // Orders, Count should be first (left), Orders should be second (right)
          cy.get('[data-testid="document-card-embed"]')
            .should("have.length", 2)
            .first()
            .should("contain.text", "Orders, Count");
          cy.get('[data-testid="document-card-embed"]')
            .should("have.length", 2)
            .last()
            .should("contain.text", "Orders");
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
      dragAndDropCardOnAnotherCard("Orders", "Orders");

      // Verify no flexContainer was created
      H.documentContent()
        .find('[data-type="flexContainer"]')
        .should("not.exist");

      // Verify the card is still standalone
      H.getDocumentCard("Orders").should("exist").and("be.visible");
    });
  });
});
