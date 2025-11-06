import { PRODUCTS_AVERAGE_BY_CATEGORY } from "e2e/support/test-visualizer-data";

const { H } = cy;

describe("Links in documents", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
    H.activateToken("bleeding-edge");
  });

  describe("plain links", () => {
    it("should support adding links via floating menu", () => {
      cy.visit("/document/new");
      H.documentContent().click();
      H.addToDocument("Click here", false);

      cy.realPress(["Shift", "Alt", "{leftarrow}"]);
      H.documentFormattingMenu().should("exist");
      H.documentFormattingMenu().findByRole("button", { name: /link/ }).click();
      cy.realType("test.com{enter}");

      H.documentContent()
        .findByRole("link")
        .should("contain.text", "here")
        .invoke("attr", "href")
        .then((href) => {
          expect(href).to.equal("https://test.com");
        });
    });
  });

  describe("smart links", () => {
    beforeEach(() => {
      H.createQuestion(PRODUCTS_AVERAGE_BY_CATEGORY, { wrapId: true });
      cy.get("@questionId").then((questionId) => {
        H.createDocument({
          name: "Document with SmartLinks",
          document: {
            type: "doc",
            content: [
              {
                type: "paragraph",
                content: [
                  { type: "text", text: "See " },
                  {
                    type: "smartLink",
                    attrs: {
                      entityId: questionId,
                      model: "card",
                      label: "cached name",
                    },
                  },
                  { type: "text", text: "." },
                ],
              },
            ],
          },
          idAlias: "documentId",
        });
      });
    });

    it("should display the most up-to-date title for the entity it references", () => {
      H.visitDocument("@documentId");

      H.documentContent().should(
        "contain.text",
        `See ${PRODUCTS_AVERAGE_BY_CATEGORY.name}`,
      );

      H.documentContent()
        .findByRole("link", {
          name: new RegExp(PRODUCTS_AVERAGE_BY_CATEGORY.name),
        })
        .should("exist");

      H.documentContent()
        .findByRole("link", { name: /cached name/ })
        .should("not.exist");
    });

    it("should display 'No access' if the user doesn't have permission to see the link", () => {
      cy.get("@questionId").then((questionId) => {
        cy.intercept("GET", `/api/card/${questionId}`, {
          statusCode: 403,
        });
      });
      H.visitDocument("@documentId");

      H.documentContent().should("contain.text", "See No access");
      H.documentContent()
        .findByText("No access")
        .should("exist")
        .icon("eye_crossed_out")
        .should("exist");
    });
  });
});
