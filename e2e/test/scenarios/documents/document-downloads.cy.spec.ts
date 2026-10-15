import { SAMPLE_DB_ID, USER_GROUPS } from "e2e/support/cypress_data";
import { DOCUMENT_WITH_TWO_CARDS } from "e2e/support/document-initial-data";
import { DataPermissionValue } from "metabase/admin/permissions/types";

const { H } = cy;

describe("scenarios > documents > downloads", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
  });

  it("shows the full card menu for write access, only Download results for read-only access, no document without collection access, and no Download results without download permission", () => {
    H.createDocument({
      name: "Download Test Document",
      document: DOCUMENT_WITH_TWO_CARDS,
      collection_id: null,
      idAlias: "documentId",
    });

    cy.log("Write access shows the full menu including Download results");
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

    cy.log("Read-only access shows only Download results");
    cy.signIn("readonly");
    H.visitDocument("@documentId");

    H.documentContent()
      .findByRole("textbox")
      .should("have.attr", "contenteditable", "false");

    // Wait for card to load as readonly user
    H.getDocumentCard("Orders")
      .should("be.visible")
      .findByTestId("table-root")
      .should("exist");

    // Open card menu
    H.openDocumentCardMenu("Orders");

    // Verify only "Download results" is enabled
    H.popover().within(() => {
      cy.findByRole("menuitem", { name: /Download results/i })
        .should("be.visible")
        .and("be.enabled");
      [
        /Add supporting text/,
        /Edit Visualization/,
        /Edit Query/,
        /Replace/,
        /Remove Chart/,
      ].forEach((name) => {
        cy.findByRole("menuitem", { name }).should("be.disabled");
      });
      cy.findAllByRole("menuitem").should("have.length", 6);
    });

    // Click Download results
    cy.findByRole("menuitem", { name: /Download results/i }).click();

    // Verify format options appear
    H.popover().within(() => {
      cy.findByText(".csv").should("be.visible");
      cy.findByText(".xlsx").should("be.visible");
      cy.findByText(".json").should("be.visible");
    });

    cy.log("No collection access shows a permission error");
    cy.signIn("nocollection");
    H.visitDocument("@documentId");

    // Should see permission denied message
    cy.findByRole("status").should(
      "contain.text",
      "Sorry, you don’t have permission to see that.",
    );

    // Document content should not render and no card menu should be visible
    H.documentContent().should("not.exist");
    cy.findByRole("button", { name: /ellipsis/ }).should("not.exist");

    cy.log(
      "No download permission hides Download results while the collection stays viewable",
    );
    cy.signInAsAdmin();
    H.activateToken("pro-self-hosted");
    H.visitDocument("@documentId");

    // Wait for card to load
    H.getDocumentCard("Orders")
      .should("be.visible")
      .findByTestId("table-root")
      .should("exist");

    // Remove download permission but keep view-data unrestricted
    const { READONLY_GROUP, ALL_USERS_GROUP } = USER_GROUPS;
    cy.updatePermissionsGraph({
      [READONLY_GROUP]: {
        [SAMPLE_DB_ID]: {
          download: { schemas: DataPermissionValue.NONE },
          "view-data": DataPermissionValue.UNRESTRICTED,
        },
      },
      [ALL_USERS_GROUP]: {
        [SAMPLE_DB_ID]: {
          download: { schemas: DataPermissionValue.NONE },
        },
      },
    });

    // Sign in as read-only user who can view the collection but cannot download
    cy.signIn("readonly");
    H.visitDocument("@documentId");

    // Wait for card to load as readonly user
    H.getDocumentCard("Orders")
      .should("be.visible")
      .findByTestId("table-root")
      .should("exist");

    // Open card menu
    H.openDocumentCardMenu("Orders");

    // Verify that Download results is not shown
    H.popover().within(() => {
      cy.findByRole("menuitem", { name: /Edit Query/ }).should("be.disabled");
      cy.findByRole("menuitem", { name: /Download results/i }).should(
        "not.exist",
      );
    });
  });
});
