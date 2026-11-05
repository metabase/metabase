import { USER_GROUPS } from "e2e/support/cypress_data";
import { ORDERS_QUESTION_ID } from "e2e/support/cypress_sample_instance_data";
import type { DocumentId } from "metabase-types/api";

const { H } = cy;

const { ALL_USERS_GROUP } = USER_GROUPS;

describe("document permissions", () => {
  beforeEach(() => {
    H.restore();
  });

  it("should allow a non-admin user to create a new document and save it", () => {
    cy.signInAsAdmin();
    H.resetSnowplow();

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

    H.entityPickerModalItem(0, "Collections").should("exist");
    H.entityPickerModalLevel(0).findByText("Our analytics").should("not.exist");

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

describe("document permissions > public links", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
    H.updateSetting("enable-public-sharing", true);

    H.createDocument({
      name: "Public Document",
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
          { type: "paragraph", attrs: { _id: "3" } },
        ],
        type: "doc",
      },
      collection_id: null,
      idAlias: "documentId",
    });

    cy.get<DocumentId>("@documentId")
      .then((documentId) => H.createPublicDocumentLink(documentId))
      .then(({ body: { uuid } }) => cy.wrap(uuid).as("publicUuid"));
  });

  function visitPublicDocument() {
    cy.get("@publicUuid").then((uuid) => cy.visit(`/public/document/${uuid}`));
  }

  function verifyErrorMessage(expectedMessage: string) {
    cy.contains(expectedMessage).should("be.visible");
    H.documentContent().should("not.exist");
  }

  it("should be accessible anonymously, and inaccessible once public sharing is disabled", () => {
    cy.signOut();
    visitPublicDocument();

    H.documentContent().should("contain", "Test content");
    H.getDocumentCard("Orders").findByTestId("table-root").should("exist");
    cy.location("pathname").should("match", /^\/public\/document\//);
    cy.findByRole("button", { name: "Sign in" }).should("not.exist");

    cy.log("Disable public sharing");
    cy.signInAsAdmin();
    H.updateSetting("enable-public-sharing", false);
    cy.signOut();

    visitPublicDocument();
    verifyErrorMessage("An error occurred.");
  });

  it("should not be accessible once the document is trashed", () => {
    visitPublicDocument();
    H.documentContent().should("contain", "Test content");

    cy.intercept("PUT", "/api/document/*").as("updateDocument");
    H.visitDocument("@documentId");
    cy.findByRole("button", { name: "More options" }).click();
    H.popover().findByText("Move to trash").click();
    cy.wait("@updateDocument");

    visitPublicDocument();
    verifyErrorMessage("Not found");
  });
});
