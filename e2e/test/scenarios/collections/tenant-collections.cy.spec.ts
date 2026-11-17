const { H } = cy;

const TENANT_NAMESPACE = "shared-tenant-collection";

/**
 * Create a collection in the shared-tenant-collection namespace.
 * Collections with this namespace are shared collections.
 */
function createSharedCollection(name: string, parentId?: number) {
  return cy
    .request("POST", "/api/collection", {
      name,
      namespace: TENANT_NAMESPACE,
      parent_id: parentId ?? null,
    })
    .then(({ body }) => body);
}

describe("scenarios > collections > tenant collections", () => {
  describe("official and collection type controls in shared collections", () => {
    beforeEach(() => {
      H.restore();
      cy.signInAsAdmin();
      H.activateToken("pro-self-hosted");
      H.updateSetting("use-tenants", true);
    });

    it("should not allow marking shared collections as official", () => {
      createSharedCollection("Test Shared Collection").then(
        (sharedCollection) => {
          createSharedCollection(
            "Shared Sub Collection",
            sharedCollection.id,
          ).then((subCollection) => {
            H.visitCollection(subCollection.id);
          });
        },
      );

      cy.findByTestId("collection-name-heading").should(
        "have.text",
        "Shared Sub Collection",
      );

      cy.log("the collection menu has no official option");
      H.openCollectionMenu();
      H.popover().within(() => {
        cy.findByText("Move").should("be.visible");
        cy.findByText("Make collection official").should("not.exist");
      });
      cy.findByTestId("app-bar").click();

      cy.log("the new collection modal has no collection type picker");
      cy.findByTestId("collection-menu")
        .findByLabelText("Create a new collection")
        .click();
      cy.findByTestId("new-collection-modal").within(() => {
        cy.findByTestId("collection-picker-button").should(
          "contain",
          "Shared Sub Collection",
        );
        cy.findByText(/Collection type/i).should("not.exist");
        cy.findByTestId("collection-picker-button").click();
      });

      cy.log("a regular parent shows the collection type picker");
      H.entityPickerModal().within(() => {
        cy.findByText("Our analytics").click();
        cy.button("Select").click();
      });
      cy.findByTestId("new-collection-modal").within(() => {
        cy.findByTestId("collection-picker-button").should(
          "contain",
          "Our analytics",
        );
        cy.findByText(/Collection type/i).should("exist");
        cy.findByTestId("collection-picker-button").click();
      });

      cy.log("a shared parent picked from the picker hides it again");
      H.entityPickerModal().within(() => {
        cy.findByText("Shared collections").click();
        cy.findByText("Test Shared Collection").click();
        cy.button("Select").click();
      });
      cy.findByTestId("new-collection-modal").within(() => {
        cy.findByTestId("collection-picker-button").should(
          "contain",
          "Test Shared Collection",
        );
        cy.findByText(/Collection type/i).should("not.exist");
      });
    });
  });

  describe("tenant collections list", () => {
    beforeEach(() => {
      H.restore();
      cy.signInAsAdmin();
      H.activateToken("pro-self-hosted");
      H.updateSetting("use-tenants", true);
    });

    it("should display active tenant collections", () => {
      cy.request("POST", "/api/ee/tenant", {
        name: "Tenant 01",
        slug: "tenant-01",
      });
      cy.request("POST", "/api/ee/tenant", {
        name: "Tenant 02",
        slug: "tenant-02",
      });
      cy.request("POST", "/api/ee/tenant", {
        name: "Deactivated Tenant",
        slug: "deactivated-tenant",
      }).then(({ body: tenant }) => {
        cy.request("PUT", `/api/ee/tenant/${tenant.id}`, { is_active: false });
      });

      cy.visit("/collection/tenant-specific");

      H.main().findByText("Tenant 01").should("be.visible");
      H.main().findByText("Tenant 02").should("be.visible");
      H.main().findByText("Deactivated Tenant").should("not.exist");

      cy.log("can navigate to tenant collection");
      H.main().findByText("Tenant 02").click();
      H.main().findByText("Tenant collection: Tenant 02").should("be.visible");
    });
  });

  describe("tenant collection trash", () => {
    beforeEach(() => {
      H.restore();
      cy.signInAsAdmin();
      H.activateToken("bleeding-edge");
      H.updateSetting("use-tenants", true);
    });

    it("can permanently delete a trashed shared tenant collection (metabase#74461)", () => {
      const collectionName = "Acme Tenant Collection";
      cy.intercept("DELETE", "/api/collection/*").as("deleteCollection");

      createSharedCollection(collectionName).then((collection) => {
        H.archiveCollection(collection.id);

        cy.visit(`/collection/${collection.id}`);

        cy.log("the trashed collection page shows the archived banner");
        cy.findByTestId("archive-banner").should("be.visible");

        cy.log("permanently delete it from the banner");
        cy.findByTestId("archive-banner")
          .findByText("Delete permanently")
          .click();
        H.modal()
          .findByText(`Delete ${collectionName} permanently?`)
          .should("be.visible");
        H.modal().findByText("Delete permanently").click();

        cy.log("the delete request succeeds rather than failing with a 400");
        cy.wait("@deleteCollection")
          .its("response.statusCode")
          .should("eq", 200);

        cy.log("the collection is gone from the database");
        cy.request({
          method: "GET",
          url: `/api/collection/${collection.id}`,
          failOnStatusCode: false,
        })
          .its("status")
          .should("eq", 404);
      });
    });
  });
});
