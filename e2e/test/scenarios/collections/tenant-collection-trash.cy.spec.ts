const { H } = cy;

const TENANT_NAMESPACE = "shared-tenant-collection";
const TENANT_COLLECTION_NAME = "Acme Tenant Collection";

/**
 * Create a collection in the shared-tenant-collection namespace, the kind of
 * collection an admin adds when tenants are enabled.
 */
function createTenantCollection(name: string) {
  return cy
    .request("POST", "/api/collection", {
      name,
      namespace: TENANT_NAMESPACE,
      parent_id: null,
    })
    .then(({ body }) => body);
}

function archiveBanner() {
  return cy.findByTestId("archive-banner");
}

describe("scenarios > collections > tenant collection trash", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
    H.activateToken("bleeding-edge");
    H.updateSetting("use-tenants", true);
  });

  it("can permanently delete a trashed shared tenant collection (metabase#74461)", () => {
    cy.intercept("DELETE", "/api/collection/*").as("deleteCollection");

    createTenantCollection(TENANT_COLLECTION_NAME).then((collection) => {
      H.archiveCollection(collection.id);

      cy.visit(`/collection/${collection.id}`);

      cy.log("the trashed collection page shows the archived banner");
      archiveBanner().should("be.visible");

      cy.log("permanently delete it from the banner");
      archiveBanner().findByText("Delete permanently").click();
      H.modal()
        .findByText(`Delete ${TENANT_COLLECTION_NAME} permanently?`)
        .should("be.visible");
      H.modal().findByText("Delete permanently").click();

      cy.log("the delete request succeeds rather than failing with a 400");
      cy.wait("@deleteCollection").its("response.statusCode").should("eq", 200);

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
