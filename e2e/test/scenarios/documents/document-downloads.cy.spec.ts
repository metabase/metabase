import { DOCUMENT_WITH_TWO_CARDS } from "e2e/support/document-initial-data";

const { H } = cy;

describe("scenarios > documents > downloads", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
    H.activateToken("bleeding-edge");
  });

  it("shows Download results for read-only document access", () => {
    H.createDocument({
      name: "Download Test Document",
      document: DOCUMENT_WITH_TWO_CARDS,
      collection_id: null,
      alias: "document",
      idAlias: "documentId",
    });

    H.visitDocument("@documentId");

    // Wait for card to load
    H.getDocumentCard("Orders")
      .should("be.visible")
      .findByTestId("table-root")
      .should("exist");

    // Sign in as read-only user
    cy.signIn("readonly");
    H.visitDocument("@documentId");

    // Wait for card to load as readonly user
    H.getDocumentCard("Orders")
      .should("be.visible")
      .findByTestId("table-root")
      .should("exist");

    // Open card menu
    H.openDocumentCardMenu("Orders");

    // Verify menu shows only "Download results" and it's enabled
    H.popover().within(() => {
      cy.findByRole("menuitem", { name: /Download results/i }).should(
        "be.visible",
      );
      // Verify all menu items: only Download results should be enabled
      cy.findAllByRole("menuitem").each(($item) => {
        const text = $item.text();
        if (text.includes("Download results")) {
          cy.wrap($item).should("not.be.disabled");
        } else {
          cy.wrap($item).should("be.disabled");
        }
      });
    });

    // Click Download results
    cy.findByRole("menuitem", { name: /Download results/i }).click();

    // Verify format options appear
    H.popover().within(() => {
      cy.findByText(".csv").should("be.visible");
      cy.findByText(".xlsx").should("be.visible");
      cy.findByText(".json").should("be.visible");
    });
  });

  it("shows full menu including Download results for write access", () => {
    H.createDocument({
      name: "Admin Download Test Document",
      document: DOCUMENT_WITH_TWO_CARDS,
      collection_id: null,
      alias: "document",
      idAlias: "documentId",
    });

    H.visitDocument("@documentId");

    // Wait for card to load
    H.getDocumentCard("Orders")
      .should("be.visible")
      .findByTestId("table-root")
      .should("exist");

    // Open card menu
    H.openDocumentCardMenu("Orders");

    // Verify menu shows all options with Download results
    H.popover().within(() => {
      cy.findByRole("menuitem", { name: /Edit Query/i }).should("be.visible");
      cy.findByRole("menuitem", { name: /Edit Visualization/i }).should(
        "be.visible",
      );
      cy.findByRole("menuitem", { name: /Replace/i }).should("be.visible");
      cy.findByRole("menuitem", { name: /Download results/i }).should(
        "be.visible",
      );
      cy.findByRole("menuitem", { name: /Remove Chart/i }).should("be.visible");
    });

    // Click Download results
    cy.findByRole("menuitem", { name: /Download results/i }).click();

    // Verify format options appear
    H.popover().within(() => {
      cy.findByText(".csv").should("be.visible");
      cy.findByText(".xlsx").should("be.visible");
      cy.findByText(".json").should("be.visible");
    });
  });

  it("does not show download when permissions are 'none'", () => {
    H.createDocument({
      name: "No Access Document",
      document: DOCUMENT_WITH_TWO_CARDS,
      collection_id: null,
      alias: "document",
      idAlias: "documentId",
    });

    H.visitDocument("@documentId");

    // Wait for card to load
    H.getDocumentCard("Orders")
      .should("be.visible")
      .findByTestId("table-root")
      .should("exist");

    // Sign in as user with no collection access
    cy.signIn("nocollection");
    H.visitDocument("@documentId");

    // Should see permission denied message
    cy.findByRole("status").should(
      "contain.text",
      "Sorry, you don't have permission to see that.",
    );

    // No card menu should be visible
    H.documentContent()
      .findByRole("button", { name: /ellipsis/ })
      .should("not.exist");
  });
});
