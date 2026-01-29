const { H } = cy;
import { USER_GROUPS } from "e2e/support/cypress_data";

const { ALL_USERS_GROUP } = USER_GROUPS;

describe("document permissions", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
    H.resetSnowplow();
    cy.signOut();
  });

  it("should allow a non-admin user to create a new document and save it", () => {
    cy.signInAsAdmin();

    cy.updateCollectionGraph({
      [ALL_USERS_GROUP]: { root: "none" },
    });

    cy.signOut();

    cy.signIn("none");

    cy.visit("/");

    H.newButton("Document").click();
    cy.title().should("eq", "New document · Metabase");

    cy.findByRole("textbox", { name: "Document Title" })
      .should("be.focused")
      .type("User Document");

    H.documentContent().type("This is a document created by a non-admin user");

    cy.findByRole("button", { name: "Save" }).click();

    H.entityPickerModalLevel(0).findByText("Our analytics").should("not.exist");
    H.entityPickerModalItem(0, "Collections").should("exist");

    H.entityPickerModalItem(0, /Personal Collection/).click();
    H.entityPickerModal().findByRole("button", { name: "Select" }).click();

    cy.location("pathname").should("match", /^\/document\/\d+/);
    cy.title().should("eq", "User Document · Metabase");

    H.expectUnstructuredSnowplowEvent({ event: "document_created" });

    H.appBar()
      .findByRole("link", { name: /Personal Collection/ })
      .click();

    H.collectionTable()
      .findByRole("link", { name: "User Document" })
      .should("exist");
  });

  it("should allow a non-admin user to edit their own document", () => {
    cy.signInAsNormalUser();

    H.createDocument({
      name: "User Document",
      document: {
        content: [
          {
            type: "paragraph",
            content: [
              {
                type: "text",
                text: "Original content",
              },
            ],
            attrs: {
              _id: "1",
            },
          },
        ],
        type: "doc",
      },
      collection_id: null,
      alias: "document",
      idAlias: "documentId",
    });

    H.visitDocument("@documentId");

    H.documentContent().should("contain.text", "Original content");

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
      "Original content and some new content",
    );
  });
});
