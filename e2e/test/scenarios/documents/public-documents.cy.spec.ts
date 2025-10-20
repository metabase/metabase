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

describe("scenarios > documents > public", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
    H.activateToken("bleeding-edge");
    H.updateSetting("enable-public-sharing", true);
  });

  it("should not show comments in public documents", () => {
    // Create a document with content and an embedded card
    H.createDocument({
      name: "Test Public Document",
      document: {
        content: [
          {
            type: "paragraph",
            content: [
              {
                type: "text",
                text: "This is a test paragraph",
              },
            ],
            attrs: {
              _id: "1",
            },
          },
          {
            type: "resizeNode",
            attrs: {
              height: 400,
              minHeight: 280,
            },
            content: [
              {
                type: "cardEmbed",
                attrs: {
                  id: ORDERS_QUESTION_ID,
                  name: null,
                  _id: "2",
                },
              },
            ],
          },
          {
            type: "paragraph",
            attrs: {
              _id: "3",
            },
          },
        ],
        type: "doc",
      },
      collection_id: null,
      idAlias: "documentId",
    });

    cy.log("Visit the document as admin to verify comments exist");
    H.visitDocument("@documentId");

    // Verify the document content loaded
    H.documentContent().should("contain", "This is a test paragraph");

    // Verify comment buttons exist for authenticated users
    H.Comments.getDocumentNodeButtons().should("exist");

    cy.log("Create public link and visit public document");
    cy.get("@documentId")
      .then((documentId) => {
        return H.createPublicDocumentLink(documentId);
      })
      .then(({ body: { uuid } }) => {
        cy.visit(`/public/document/${uuid}`);
      });

    cy.log("Verify document content is visible");
    H.documentContent().should("contain", "This is a test paragraph");
    H.getDocumentCard("Orders").should("exist");

    cy.log("Verify comment buttons do not exist in public view");
    H.Comments.getDocumentNodeButtons().should("not.exist");

    cy.log("Verify comment sidebar is not accessible");
    cy.findByTestId("comments-sidebar").should("not.exist");
    cy.findByRole("link", { name: "Show all comments" }).should("not.exist");
  });

  it("should only show 'Download results' in card menu for public documents", () => {
    // Create a document with an embedded card
    H.createDocument({
      name: "Test Document with Card",
      document: {
        content: [
          {
            type: "paragraph",
            content: [
              {
                type: "text",
                text: "Document with embedded card",
              },
            ],
            attrs: {
              _id: "1",
            },
          },
          {
            type: "resizeNode",
            attrs: {
              height: 400,
              minHeight: 280,
            },
            content: [
              {
                type: "cardEmbed",
                attrs: {
                  id: ORDERS_QUESTION_ID,
                  name: null,
                  _id: "2",
                },
              },
            ],
          },
          {
            type: "paragraph",
            attrs: {
              _id: "3",
            },
          },
        ],
        type: "doc",
      },
      collection_id: null,
      idAlias: "documentId",
    });

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
    cy.get("@documentId")
      .then((documentId) => {
        return H.createPublicDocumentLink(documentId);
      })
      .then(({ body: { uuid } }) => {
        cy.visit(`/public/document/${uuid}`);
      });

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
    H.createDocument({
      name: "Test Document Header",
      document: {
        content: [
          {
            type: "paragraph",
            content: [
              {
                type: "text",
                text: "Testing header menu restrictions",
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
    cy.get("@documentId")
      .then((documentId) => {
        return H.createPublicDocumentLink(documentId);
      })
      .then(({ body: { uuid } }) => {
        cy.visit(`/public/document/${uuid}`);
      });

    cy.log("Verify document content is visible in public view");
    H.documentContent().should("contain", "Testing header menu restrictions");

    cy.log("Verify 'More options' menu is either hidden or restricted");
    // In public view, the "More options" button should not exist or should have limited options
    cy.findByRole("button", { name: "More options" }).should("not.exist");
  });

  it("should be read-only in public view", () => {
    // Create a document
    H.createDocument({
      name: "Read-only Test Document",
      document: {
        content: [
          {
            type: "paragraph",
            content: [
              {
                type: "text",
                text: "This content should not be editable",
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

    cy.log("Visit document as admin to verify it's editable");
    H.visitDocument("@documentId");

    // Verify the document content is editable
    H.documentContent()
      .findByRole("textbox")
      .should("have.attr", "contenteditable", "true");

    cy.log("Create public link and visit public document");
    cy.get("@documentId")
      .then((documentId) => {
        return H.createPublicDocumentLink(documentId);
      })
      .then(({ body: { uuid } }) => {
        cy.visit(`/public/document/${uuid}`);
      });

    cy.log("Verify document content is visible");
    H.documentContent().should(
      "contain",
      "This content should not be editable",
    );

    cy.log("Verify document is read-only");
    H.documentContent()
      .findByRole("textbox")
      .should("have.attr", "contenteditable", "false");

    cy.log("Verify no save button exists");
    cy.findByRole("button", { name: "Save" }).should("not.exist");
  });

  it("should allow downloading results from embedded cards", () => {
    // Create a document with an embedded card
    H.createDocument({
      name: "Download Test Document",
      document: {
        content: [
          {
            type: "paragraph",
            content: [
              {
                type: "text",
                text: "Document with downloadable card",
              },
            ],
            attrs: {
              _id: "1",
            },
          },
          {
            type: "resizeNode",
            attrs: {
              height: 400,
              minHeight: 280,
            },
            content: [
              {
                type: "cardEmbed",
                attrs: {
                  id: ORDERS_QUESTION_ID,
                  name: null,
                  _id: "2",
                },
              },
            ],
          },
        ],
        type: "doc",
      },
      collection_id: null,
      idAlias: "documentId",
    });

    cy.log("Create public link and visit public document");
    cy.get("@documentId")
      .then((documentId) => {
        return H.createPublicDocumentLink(documentId);
      })
      .then(({ body: { uuid } }) => {
        cy.visit(`/public/document/${uuid}`);
      });

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

    cy.log("Create public link");
    cy.get("@documentId")
      .then((documentId) => {
        return H.createPublicDocumentLink(documentId);
      })
      .then(({ body: { uuid } }) => {
        cy.log("Sign out and visit public document as anonymous user");
        cy.signOut();
        cy.visit(`/public/document/${uuid}`);
      });

    cy.log("Verify document content is visible without authentication");
    H.documentContent().should("contain", "Test content");
    H.getDocumentCard("Orders").should("exist");

    cy.log("Verify document is read-only");
    H.documentContent()
      .findByRole("textbox")
      .should("have.attr", "contenteditable", "false");

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
      // Public routes return a generic error message when sharing is disabled
      cy.findByText("An error occurred.").should("be.visible");

      // Verify the document content is not shown
      H.documentContent().should("not.exist");
    });
  });

  it("should generate valid UUID format for public links", () => {
    // Create a document
    createTestDocumentWithCard("UUID Format Test");

    cy.log("Create public link and verify UUID format");
    cy.get("@documentId")
      .then((documentId) => {
        return H.createPublicDocumentLink(documentId);
      })
      .then(({ body: { uuid } }) => {
        cy.log("Verify UUID has valid format");
        expect(uuid).to.match(
          /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/,
        );

        cy.log("Verify document is accessible via the UUID");
        cy.visit(`/public/document/${uuid}`);
        H.documentContent().should("contain", "Test content");
      });
  });
});
