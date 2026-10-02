import { ORDERS_QUESTION_ID } from "e2e/support/cypress_sample_instance_data";

const { H } = cy;

// Helper function to create a test document with embedded card
function createTestDocumentWithCard(name = "Test Document") {
  return H.createDocument({
    name,
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
}

// Helper function to visit a public document
function visitPublicDocument() {
  cy.get("@documentId")
    .then((documentId) => {
      return H.createPublicDocumentLink(documentId);
    })
    .then(({ body: { uuid } }) => {
      cy.visit(`/public/document/${uuid}`);
    });
}

// Helper function to verify document is read-only
function verifyDocumentIsReadOnly() {
  H.documentContent()
    .findByRole("textbox")
    .should("have.attr", "contenteditable", "false");
  cy.findByRole("button", { name: "Save" }).should("not.exist");
}

// Helper function to verify comments are hidden
function verifyCommentsAreHidden() {
  H.Comments.getDocumentNodeButtons().should("not.exist");
  cy.findByTestId("comments-sidebar").should("not.exist");
  cy.findByRole("link", { name: "Show all comments" }).should("not.exist");
}

// Helper function to verify error message is displayed
function verifyErrorMessage(expectedMessage: string) {
  // PublicError and PublicNotFound render messages in error pages
  cy.contains(expectedMessage).should("be.visible");
  H.documentContent().should("not.exist");
}

describe("scenarios > documents > public", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
    H.updateSetting("enable-public-sharing", true);
  });

  it("should restrict comments, header menu, editing, and metabot blocks in public view", () => {
    const metabotPrompt = "Some metabot prompt";
    H.createDocument({
      name: "Test Public Document",
      document: {
        content: [
          {
            type: "paragraph",
            content: [{ type: "text", text: "This is a test paragraph" }],
            attrs: { _id: "1" },
          },
          {
            type: "metabot",
            content: [{ type: "text", text: metabotPrompt }],
          },
        ],
        type: "doc",
      },
      collection_id: null,
      idAlias: "documentId",
    });

    cy.log("Visit the document as admin");
    H.visitDocument("@documentId");

    // Verify the document content loaded
    H.documentContent().should("contain", "This is a test paragraph");

    // Verify comment buttons exist for authenticated users
    H.Comments.getDocumentNodeButtons().should("exist");

    // Check that "More options" menu exists with admin options
    cy.findByRole("button", { name: "More options" }).click();
    H.popover().within(() => {
      cy.findByText("Bookmark").should("exist");
      cy.findByText("Move to trash").should("exist");
      cy.findByText("Print Document").should("exist");
    });

    // Close the popover
    H.documentContent().click();

    // Verify the document content is editable
    H.documentContent()
      .findByRole("textbox")
      .should("have.attr", "contenteditable", "true");

    // Verify the metabot block shows its Run button
    H.documentContent().findByRole("button", { name: "Run" }).should("exist");

    cy.log("Create public link and visit public document");
    visitPublicDocument();

    cy.log("Verify document content is visible");
    H.documentContent().should("contain", "This is a test paragraph");

    cy.log("Verify comment buttons do not exist in public view");
    verifyCommentsAreHidden();

    cy.log("Verify 'More options' menu is hidden");
    cy.findByRole("button", { name: "More options" }).should("not.exist");

    cy.log("Verify document is read-only");
    verifyDocumentIsReadOnly();

    cy.log("Metabot block is read-only");
    H.documentContent().findByText(metabotPrompt).click();
    cy.realType("a");

    cy.log("Verify the text wasn't updated");
    H.documentContent().findByText(metabotPrompt).should("exist");

    cy.log("Verify that run/close buttons don't exist");
    H.documentContent().find("button").should("not.exist");
  });

  it("should only offer downloads in the public card menu and show an error after the document is trashed", () => {
    // Create a document with an embedded card
    createTestDocumentWithCard("Test Document with Card");

    cy.log("Create public link and visit public document");
    cy.get("@documentId")
      .then((documentId) => {
        return H.createPublicDocumentLink(documentId);
      })
      .then(({ body: { uuid } }) => {
        cy.wrap(uuid).as("publicUuid");
        cy.visit(`/public/document/${uuid}`);
      });

    cy.log("Verify document and card are visible in public view");
    H.documentContent().should("contain", "Test content");
    H.getDocumentCard("Orders").should("exist");

    cy.log("Open card menu in public view");
    H.openDocumentCardMenu("Orders");

    cy.log("Verify only 'Download results' option is present");
    H.popover().within(() => {
      cy.findByText("Download results").should("exist");

      // Verify there's only one menu item
      cy.findAllByRole("menuitem").should("have.length", 1);
    });

    cy.log("Click 'Download results' to show format options");
    H.popover().findByText("Download results").click();

    cy.log("Verify all download format options are available");
    H.popover().within(() => {
      cy.findByText(".csv").should("exist");
      cy.findByText(".xlsx").should("exist");
      cy.findByText(".json").should("exist");
      cy.findByTestId("download-results-button").should("exist");
    });

    cy.log("Move the document to trash");
    cy.intercept("PUT", "/api/document/*").as("updateDocument");
    H.visitDocument("@documentId");
    cy.findByRole("button", { name: "More options" }).click();
    H.popover().findByText("Move to trash").click();
    cy.wait("@updateDocument");

    cy.log("Try to access public link after document deletion");
    cy.get("@publicUuid").then((uuid) => {
      cy.visit(`/public/document/${uuid}`);

      cy.log("Verify error message is shown");
      verifyErrorMessage("Not found");
    });
  });

  it("should be accessible anonymously with branding, become inaccessible when public sharing is disabled, and hide branding for premium", () => {
    // Create a document with public link
    createTestDocumentWithCard("Document for Disabling Test");

    cy.log("Create public link while sharing is enabled");
    cy.get("@documentId")
      .then((documentId) => {
        return H.createPublicDocumentLink(documentId);
      })
      .then(({ body: { uuid } }) => {
        cy.wrap(uuid).as("publicUuid");

        cy.log("Verify document is accessible with sharing enabled");
        cy.signOut();
        cy.visit(`/public/document/${uuid}`);
        H.documentContent().should("contain", "Test content");
      });

    cy.log("Verify the document is read-only without authentication");
    H.getDocumentCard("Orders").should("exist");
    verifyDocumentIsReadOnly();
    cy.location("pathname").should("match", /^\/public\/document\//);

    cy.log("Verify 'Powered by Metabase' link exists in footer");
    cy.findByRole("link", { name: "Powered by Metabase" })
      .should("exist")
      .should("be.visible")
      .should("have.attr", "href")
      .and("contain", "https://www.metabase.com?");

    cy.log("Disable public sharing");
    cy.signInAsAdmin();
    H.updateSetting("enable-public-sharing", false);
    cy.signOut();

    cy.log("Try to access public document after disabling sharing");
    cy.get("@publicUuid").then((uuid) => {
      cy.visit(`/public/document/${uuid}`);

      cy.log("Verify document is no longer accessible");
      verifyErrorMessage("An error occurred.");
    });

    cy.log("Re-enable public sharing with a premium token");
    cy.signInAsAdmin();
    H.updateSetting("enable-public-sharing", true);
    H.activateToken("pro-self-hosted");
    cy.signOut();

    cy.get("@publicUuid").then((uuid) => {
      cy.visit(`/public/document/${uuid}`);
    });
    H.documentContent().should("contain", "Test content");

    cy.log("Verify 'Powered by Metabase' link is hidden for premium");
    cy.findByRole("link", { name: "Powered by Metabase" }).should("not.exist");
  });
});
