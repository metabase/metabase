import { times } from "underscore";

import { PRODUCTS_AVERAGE_BY_CATEGORY } from "e2e/support/test-visualizer-data";

const { H } = cy;

describe("Links in documents", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
  });

  describe("plain links", () => {
    it("should support adding, editing, and removing links via floating menu", () => {
      cy.visit("/document/new");
      H.documentContent().click();

      cy.log("Add text and make a link");
      H.addToDocument("Click here", false);
      times("here".length, () => cy.realPress(["Shift", "{leftarrow}"]));
      H.documentFormattingMenu().findByRole("button", { name: /link/ }).click();
      cy.realType("test.com{enter}");

      cy.log("Assert link exists with correct href");
      H.documentContent()
        .findByRole("link", { name: "here" })
        .invoke("attr", "href")
        .then((href) => expect(href).to.equal("https://test.com"));

      cy.log("Edit link url");
      H.documentContent().findByRole("link", { name: "here" }).realHover();
      cy.icon("pencil").click();
      cy.findByTestId("document-formatting-menu")
        .get("input")
        .should("be.focused");
      cy.realType("url.com/a/1?k=v");
      cy.icon("check").click();

      cy.log("Assert link still exists, has updated href");
      H.documentContent()
        .findByRole("link", { name: "here" })
        .invoke("attr", "href")
        .then((href) => expect(href).to.equal("https://url.com/a/1?k=v"));

      cy.log("Remove link");
      H.documentContent().findByRole("link", { name: "here" }).realHover();
      cy.icon("pencil").click();
      cy.findByTestId("document-formatting-menu").icon("trash").click();

      cy.log("Assert link is unlinked");
      H.documentContent()
        .findByRole("paragraph")
        .should("contain.text", "Click here")
        .findByRole("link", { name: "here" })
        .should("not.exist");
    });

    it("should convert markdown links to real links", () => {
      cy.visit("/document/new");
      H.documentContent().click();
      H.addToDocument("Click [here](url.com).", false);
      H.documentContent()
        .findByRole("paragraph")
        .should("contain.text", "Click here.")
        .findByRole("link", { name: "here" })
        .should("exist");
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
