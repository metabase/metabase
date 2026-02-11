const { H } = cy;

const TENANT_NAMESPACE = "shared-tenant-collection";

/**
 * Create a collection in the shared-tenant-collection namespace.
 * Collections with this namespace are shared collections.
 */
function createSharedCollection(name: string, parentId?: number) {
  return cy.request("POST", "/api/collection", {
    name,
    namespace: TENANT_NAMESPACE,
    parent_id: parentId ?? null,
  });
}

describe("scenarios > collections > collection picker with tenants", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
    H.activateToken("bleeding-edge");
    H.updateSetting("use-tenants", true);
  });

  it("should not allow marking collections as official in shared collections and its sub-collections", () => {
    createSharedCollection("Test Shared Collection").then((response) => {
      const sharedCollectionId = response.body.id;

      cy.log("Navigate to the shared collection");
      H.visitCollection(sharedCollectionId);

      cy.log("Verify collection loaded");
      cy.findByTestId("collection-name-heading").should(
        "have.text",
        "Test Shared Collection",
      );

      cy.log("Click on the three dots menu and verify cannot mark as official");
      H.openCollectionMenu();

      H.popover().within(() => {
        cy.log("Should not have 'Make collection official' option");
        cy.findByText("Make collection official").should("not.exist");
        cy.findByText("Remove Official badge").should("not.exist");
      });

      // Close the popover
      cy.findByTestId("app-bar").click();

      cy.log("Click 'Create a new collection' button");
      cy.findByTestId("collection-menu")
        .findByLabelText("Create a new collection")
        .click();

      cy.findByTestId("new-collection-modal").within(() => {
        cy.log("Should not see 'Collection type' picker");
        cy.findByText(/Collection type/i).should("not.exist");
        cy.findByText("Regular").should("not.exist");
        cy.findByText("Official").should("not.exist");

        cy.log("Verify we're creating inside the shared collection");
        cy.findByTestId("collection-picker-button").should(
          "contain",
          "Test Shared Collection",
        );

        cy.log("Edge case: Change target collection to a normal collection");
        cy.findByTestId("collection-picker-button").click();
      });

      H.entityPickerModal().within(() => {
        cy.log("Select 'Our analytics' (a normal collection)");
        H.entityPickerModalTab("Collections").click();
        cy.findByText("Our analytics").click();
        cy.button("Select").click();
      });

      cy.findByTestId("new-collection-modal").within(() => {
        cy.log("Wait for collection picker to update to 'Our analytics'");
        cy.findByTestId("collection-picker-button").should(
          "contain",
          "Our analytics",
        );

        cy.log("Should now see 'Collection type' picker");
        cy.findByText(/Collection type/i).should("exist");
        cy.findByText("Regular").should("exist");
        cy.findByText("Official").should("exist");

        cy.log("Close modal without creating");
        cy.findByLabelText("Close").click();
      });
    });
  });

  it("should block official collections in sub-collections of shared collections", () => {
    createSharedCollection("Shared Parent Collection").then((response) => {
      const sharedParentId = response.body.id;

      createSharedCollection("Shared Sub Collection", sharedParentId).then(
        (subResponse) => {
          const sharedSubCollectionId = subResponse.body.id;

          cy.log("Navigate to the sub-collection");
          H.visitCollection(sharedSubCollectionId);

          cy.log("Verify sub-collection loaded");
          cy.findByTestId("collection-name-heading").should(
            "have.text",
            "Shared Sub Collection",
          );

          cy.log("Open collection menu");
          H.openCollectionMenu();

          H.popover().within(() => {
            cy.log("Should not have 'Make collection official' option");
            cy.findByText("Make collection official").should("not.exist");
            cy.findByText("Remove Official badge").should("not.exist");
          });

          // Close the popover
          cy.findByTestId("app-bar").click();

          cy.log("Create a new sub-sub-collection");
          cy.findByTestId("collection-menu")
            .findByLabelText("Create a new collection")
            .click();

          cy.findByTestId("new-collection-modal").within(() => {
            cy.log("Should not see 'Collection type' picker");
            cy.findByText(/Collection type/i).should("not.exist");
            cy.findByText("Regular").should("not.exist");
            cy.findByText("Official").should("not.exist");
          });
        },
      );
    });
  });

  it("should hide collection type picker when switching from normal to shared collection in create modal", () => {
    createSharedCollection("Target Shared Collection");

    cy.log("Start creating a new collection from root");
    cy.visit("/collection/root");
    H.startNewCollectionFromSidebar();

    cy.findByTestId("new-collection-modal").within(() => {
      cy.log("Initially should see collection type picker");
      cy.findByText(/Collection type/i).should("exist");

      cy.log("Click collection picker to change target");
      cy.findByTestId("collection-picker-button").click();
    });

    H.entityPickerModal().within(() => {
      H.entityPickerModalTab("Collections").click();
      cy.log("Navigate to Shared collections");
      cy.findByText("Shared collections").click();
      cy.findByText("Target Shared Collection").click();
      cy.button("Select").click();
    });

    cy.findByTestId("new-collection-modal").within(() => {
      cy.log("Should no longer see collection type picker");
      cy.findByText(/Collection type/i).should("not.exist");
      cy.findByText("Regular").should("not.exist");
      cy.findByText("Official").should("not.exist");
    });
  });

  it("should show collection type picker when switching from shared to normal collection in create modal", () => {
    createSharedCollection("Shared Collection for Switching").then(
      (response) => {
        const sharedCollectionId = response.body.id;

        cy.log("Navigate inside shared collection");
        H.visitCollection(sharedCollectionId);

        cy.log("Start creating a sub-collection");
        cy.findByTestId("collection-menu")
          .findByLabelText("Create a new collection")
          .click();

        cy.findByTestId("new-collection-modal").within(() => {
          cy.log("Should not see collection type picker initially");
          cy.findByText(/Collection type/i).should("not.exist");

          cy.log("Click collection picker to change target");
          cy.findByTestId("collection-picker-button").click();
        });

        H.entityPickerModal().within(() => {
          H.entityPickerModalTab("Collections").click();
          cy.log("Select 'Our analytics' (normal collection)");
          cy.findByText("Our analytics").click();
          cy.button("Select").click();
        });

        cy.findByTestId("new-collection-modal").within(() => {
          cy.log("Wait for collection picker to update to 'Our analytics'");
          cy.findByTestId("collection-picker-button").should(
            "contain",
            "Our analytics",
          );

          cy.log("Should now see collection type picker");
          cy.findByText(/Collection type/i).should("exist");
          cy.findByText("Regular").should("exist");
          cy.findByText("Official").should("exist");
        });
      },
    );
  });
});
