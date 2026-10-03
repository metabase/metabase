import { ORDERS_QUESTION_ID } from "e2e/support/cypress_sample_instance_data";

const { H } = cy;

const METABOT_PROMPT = "Some metabot prompt";

describe("scenarios > documents > public", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
    H.updateSetting("enable-public-sharing", true);
  });

  it("renders a read-only public document with cards and metabot blocks to anonymous users", () => {
    H.createDocument({
      name: "Public Anonymous Document",
      document: {
        content: [
          {
            type: "paragraph",
            content: [{ type: "text", text: "Test content" }],
            attrs: { _id: "1" },
          },
          {
            type: "resizeNode",
            attrs: { height: 400, minHeight: 280 },
            content: [
              {
                type: "cardEmbed",
                attrs: { id: ORDERS_QUESTION_ID, name: null, _id: "2" },
              },
            ],
          },
          {
            type: "metabot",
            content: [{ type: "text", text: METABOT_PROMPT }],
          },
        ],
        type: "doc",
      },
      collection_id: null,
      idAlias: "documentId",
    });

    cy.get("@documentId")
      .then((documentId) => H.createPublicDocumentLink(documentId))
      .then(({ body: { uuid } }) => {
        cy.signOut();
        cy.visit(`/public/document/${uuid}`);
      });

    cy.log("Document renders read-only without authentication");
    H.documentContent().should("contain", "Test content");
    H.documentContent()
      .findByRole("textbox")
      .should("have.attr", "contenteditable", "false");
    cy.findByRole("button", { name: "Save" }).should("not.exist");
    cy.findByRole("button", { name: "Sign in" }).should("not.exist");

    cy.log("Typing into a metabot block does not change it");
    H.documentContent().findByText(METABOT_PROMPT).click();
    cy.realType("a");
    H.documentContent().findByText(METABOT_PROMPT).should("be.visible");

    cy.log("Card menu only offers result downloads");
    H.getDocumentCard("Orders").should("be.visible");
    H.openDocumentCardMenu("Orders");
    H.popover().within(() => {
      cy.findAllByRole("menuitem")
        .should("have.length", 1)
        .and("contain.text", "Download results");
      cy.findByText("Download results").click();
    });

    H.popover().within(() => {
      cy.findByText(".csv").should("be.visible");
      cy.findByText(".xlsx").should("be.visible");
      cy.findByText(".json").should("be.visible");
      cy.findByTestId("download-results-button").should("be.visible");
    });
  });
});
