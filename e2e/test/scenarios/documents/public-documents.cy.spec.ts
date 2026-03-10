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

// Helper function to create a test document with custom content
function createTestDocument(name: string, content: string) {
  return H.createDocument({
    name,
    document: {
      content: [
        {
          type: "paragraph",
          content: [{ type: "text", text: content }],
          attrs: { _id: "1" },
        },
      ],
      type: "doc",
    },
    collection_id: null,
    idAlias: "documentId",
  });
}

// Helper function to visit a public document
function visitPublicDocument(
  documentIdAlias = "@documentId",
  options?: { signOut?: boolean },
) {
  cy.get(documentIdAlias)
    .then((documentId) => {
      return H.createPublicDocumentLink(documentId);
    })
    .then(({ body: { uuid } }) => {
      if (options?.signOut) {
        cy.signOut();
      }
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

  it("should not show comments in public documents", () => {
    // Create a document with content and an embedded card
    createTestDocument("Test Public Document", "This is a test paragraph");

    cy.log("Visit the document as admin to verify comments exist");
    H.visitDocument("@documentId");

    // Verify the document content loaded
    H.documentContent().should("contain", "This is a test paragraph");

    // Verify comment buttons exist for authenticated users
    H.Comments.getDocumentNodeButtons().should("exist");

    cy.log("Create public link and visit public document");
    visitPublicDocument();

    cy.log("Verify document content is visible");
    H.documentContent().should("contain", "This is a test paragraph");

    cy.log("Verify comment buttons do not exist in public view");
    verifyCommentsAreHidden();
  });

  it("should only show 'Download results' in card menu for public documents", () => {
    // Create a document with an embedded card
    createTestDocumentWithCard("Test Document with Card");

    cy.log("Visit document as admin to verify full menu exists");
    H.visitDocument("@documentId");

    // Wait for card to load
    H.getDocumentCard("Orders").should("exist");

    // Open card menu as admin and verify multiple options exist
    H.openDocumentCardMenu("Orders");
    H.popover().within(() => {
      cy.findByText("Edit Visualization").should("exist");
      cy.findByText("Edit Query").should("exist");
      cy.findByText("Replace").should("exist");
    });

    // Close the popover by clicking outside
    H.documentContent().click();

    cy.log("Create public link and visit public document");
    visitPublicDocument();

    cy.log("Verify card is visible in public view");
    H.getDocumentCard("Orders").should("exist");

    cy.log("Open card menu in public view");
    H.openDocumentCardMenu("Orders");

    cy.log("Verify only 'Download results' option is present");
    H.popover().within(() => {
      cy.findByText("Download results").should("exist");
      cy.findByText("Edit Visualization").should("not.exist");
      cy.findByText("Edit Query").should("not.exist");
      cy.findByText("Replace").should("not.exist");

      // Verify there's only one menu item
      cy.findAllByRole("menuitem").should("have.length", 1);
    });
  });

  it("should restrict document header menu in public view", () => {
    // Create a document
    createTestDocument(
      "Test Document Header",
      "Testing header menu restrictions",
    );

    cy.log("Visit document as admin to verify full menu exists");
    H.visitDocument("@documentId");

    // Verify the document content loaded
    H.documentContent().should("contain", "Testing header menu restrictions");

    // Check that "More options" menu exists with admin options
    cy.findByRole("button", { name: "More options" }).click();
    H.popover().within(() => {
      cy.findByText("Bookmark").should("exist");
      cy.findByText("Move to trash").should("exist");
      cy.findByText("Print Document").should("exist");
    });

    // Close the popover
    H.documentContent().click();

    cy.log("Create public link and visit public document");
    visitPublicDocument();

    cy.log("Verify document content is visible in public view");
    H.documentContent().should("contain", "Testing header menu restrictions");

    cy.log("Verify 'More options' menu is either hidden or restricted");
    // In public view, the "More options" button should not exist or should have limited options
    cy.findByRole("button", { name: "More options" }).should("not.exist");
  });

  it("should be read-only in public view", () => {
    // Create a document
    createTestDocument(
      "Read-only Test Document",
      "This content should not be editable",
    );

    cy.log("Visit document as admin to verify it's editable");
    H.visitDocument("@documentId");

    // Verify the document content is editable
    H.documentContent()
      .findByRole("textbox")
      .should("have.attr", "contenteditable", "true");

    cy.log("Create public link and visit public document");
    visitPublicDocument();

    cy.log("Verify document content is visible");
    H.documentContent().should(
      "contain",
      "This content should not be editable",
    );

    cy.log("Verify document is read-only");
    verifyDocumentIsReadOnly();
  });

  it("should display metabot blocks in a read-only state", () => {
    const text = "Some metabot prompt";
    H.createDocument({
      name: "Document with metabot block",
      document: {
        content: [
          {
            type: "metabot",
            content: [{ type: "text", text }],
          },
        ],
        type: "doc",
      },
      collection_id: null,
      idAlias: "documentId",
    });
    visitPublicDocument();

    cy.log("Click the metabot block and enter text");
    H.documentContent().findByText(text).click();
    cy.realType("a");

    cy.log("Verify the text wasn't updated");
    H.documentContent().findByText(text).should("exist");

    cy.log("Verify that run/close buttons don't exist but a metabot icon does");
    H.documentContent().find("button").should("not.exist");
    H.documentContent().icon("metabot").should("exist");
  });

  it("should allow downloading results from embedded cards", () => {
    // Create a document with an embedded card
    createTestDocumentWithCard("Download Test Document");

    cy.log("Create public link and visit public document");
    visitPublicDocument();

    cy.log("Verify card is visible");
    H.getDocumentCard("Orders").should("exist");

    cy.log("Open card menu and verify download option");
    H.openDocumentCardMenu("Orders");
    H.popover().within(() => {
      cy.findByText("Download results").should("exist");
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
  });

  it("should be accessible without authentication", () => {
    // Create a document with public link
    createTestDocumentWithCard("Public Anonymous Document");

    cy.log("Sign out and visit public document as anonymous user");
    visitPublicDocument("@documentId", { signOut: true });

    cy.log("Verify document content is visible without authentication");
    H.documentContent().should("contain", "Test content");
    H.getDocumentCard("Orders").should("exist");

    cy.log("Verify document is read-only");
    verifyDocumentIsReadOnly();

    cy.log("Verify no authentication UI is shown");
    cy.findByRole("button", { name: "Sign in" }).should("not.exist");
  });

  it("should become inaccessible when public sharing is disabled", () => {
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

    // Cleanup: Re-enable public sharing for subsequent tests
    cy.signInAsAdmin();
    H.updateSetting("enable-public-sharing", true);
  });

  it("should show error when accessing public link of deleted document", () => {
    // Create a document with public link
    createTestDocumentWithCard("Document to be Deleted");

    cy.log("Create public link");
    cy.get("@documentId")
      .then((documentId) => {
        return H.createPublicDocumentLink(documentId);
      })
      .then(({ body: { uuid } }) => {
        cy.wrap(uuid).as("publicUuid");

        cy.log("Verify document is accessible before deletion");
        cy.visit(`/public/document/${uuid}`);
        H.documentContent().should("contain", "Test content");
      });

    cy.log("Delete the document");
    cy.get("@documentId").then((documentId) => {
      H.visitDocument(documentId);
    });

    // Move document to trash
    cy.findByRole("button", { name: "More options" }).click();
    H.popover().findByText("Move to trash").click();

    cy.log("Try to access public link after document deletion");
    cy.get("@publicUuid").then((uuid) => {
      cy.visit(`/public/document/${uuid}`);

      cy.log("Verify error message is shown");
      verifyErrorMessage("Not found");
    });
  });

  it("should display 'Powered by Metabase' link in footer", () => {
    // Create a document
    createTestDocument(
      "Test Document with Footer",
      "Testing footer branding link",
    );

    cy.log("Create public link and visit public document");
    visitPublicDocument("@documentId", { signOut: true });

    cy.log("Verify document content is visible");
    H.documentContent().should("contain", "Testing footer branding link");

    cy.log("Verify 'Powered by Metabase' link exists in footer");
    cy.findByRole("link", { name: "Powered by Metabase" })
      .should("exist")
      .should("be.visible")
      .should("have.attr", "href")
      .and("contain", "https://www.metabase.com?");
  });

  it("should not display footer for premium", () => {
    H.activateToken("bleeding-edge");

    // Create a document
    createTestDocument(
      "Test Document with Footer",
      "Testing footer branding link",
    );

    cy.log("Create public link and visit public document");
    visitPublicDocument("@documentId", { signOut: true });

    cy.log("Verify document content is visible");
    H.documentContent().should("contain", "Testing footer branding link");

    cy.findByTestId("embed-frame-footer").should("not.exist");
  });
});
