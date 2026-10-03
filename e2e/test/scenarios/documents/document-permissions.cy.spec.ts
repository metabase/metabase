import { USER_GROUPS } from "e2e/support/cypress_data";
import { DOCUMENT_WITH_TWO_CARDS } from "e2e/support/document-initial-data";

const { H } = cy;

const { ALL_USERS_GROUP } = USER_GROUPS;

describe("document permissions", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
  });

  it("should allow a non-admin user to create, save, and edit their own document", () => {
    H.resetSnowplow();
    cy.updateCollectionGraph({
      [ALL_USERS_GROUP]: { root: "none" },
    });
    cy.signIn("none");

    cy.visit("/");

    H.newButton("Document").click();
    cy.title().should("eq", "New document · Metabase");

    cy.findByRole("textbox", { name: "Document Title" })
      .should("be.focused")
      .type("User Document");

    H.documentContent().type("This is a document created by a non-admin user");

    cy.findByRole("button", { name: "Save" }).click();

    H.entityPickerModalItem(0, "Collections").should("be.visible");
    H.entityPickerModalLevel(0).findByText("Our analytics").should("not.exist");

    H.entityPickerModalItem(0, /Personal Collection/).click();
    H.entityPickerModal().findByRole("button", { name: "Select" }).click();

    cy.location("pathname").should("match", /^\/document\/\d+/);
    cy.title().should("eq", "User Document · Metabase");

    H.expectUnstructuredSnowplowEvent({ event: "document_created" });

    cy.log("Edit the saved document");
    H.documentContent()
      .findByRole("textbox")
      .should("have.attr", "contenteditable", "true");
    H.documentContent().click();
    H.addToDocument(" and some new content");

    H.documentSaveButton().click();

    cy.findByTestId("toast-undo")
      .findByText("Document saved")
      .should("be.visible");

    H.documentContent().should(
      "contain.text",
      "This is a document created by a non-admin user and some new content",
    );

    cy.log("The document is listed in the personal collection");
    H.appBar()
      .findByRole("link", { name: /Personal Collection/ })
      .click();

    H.collectionTable()
      .findByRole("link", { name: "User Document" })
      .should("be.visible");
  });

  it("should let a read-only user download card results but not edit cards", () => {
    H.createDocument({
      name: "Download Test Document",
      document: DOCUMENT_WITH_TWO_CARDS,
      collection_id: null,
      idAlias: "documentId",
    });

    cy.signIn("readonly");
    H.visitDocument("@documentId");

    H.getDocumentCard("Orders")
      .should("be.visible")
      .findByTestId("table-root")
      .should("be.visible");

    H.openDocumentCardMenu("Orders");

    H.popover().within(() => {
      cy.findByRole("menuitem", { name: /Download results/i }).should(
        "be.enabled",
      );
      cy.findByRole("menuitem", { name: /Edit Query/i }).should("be.disabled");
      cy.findByRole("menuitem", { name: /Edit Visualization/i }).should(
        "be.disabled",
      );
      cy.findByRole("menuitem", { name: /Replace/i }).should("be.disabled");
      cy.findByRole("menuitem", { name: /Remove Chart/i }).should(
        "be.disabled",
      );

      cy.findByRole("menuitem", { name: /Download results/i }).click();

      cy.findByText(".csv").should("be.visible");
      cy.findByText(".xlsx").should("be.visible");
      cy.findByText(".json").should("be.visible");
    });
  });
});
