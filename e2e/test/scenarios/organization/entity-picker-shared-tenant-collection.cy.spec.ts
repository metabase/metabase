const { H } = cy;
import type { Dashboard } from "metabase-types/api";

const TENANT_ROOT_NAME = "Shared collections";
const TENANT_NAMESPACE = "shared-tenant-collection";

/**
 * Create a collection in the shared-tenant-collection namespace.
 * Collections with this namespace and no parent_id are children of the virtual root.
 */
function createTenantCollection(name: string, parentId?: number) {
  return cy.request("POST", "/api/collection", {
    name,
    namespace: TENANT_NAMESPACE,
    parent_id: parentId ?? null,
  });
}

/**
 * Create test data: a tenant collection and sub-collection
 */
function setupTenantCollections() {
  return createTenantCollection("Test Tenant Collection").then((response) => {
    const tenantCollectionId = response.body.id;

    return createTenantCollection(
      "Tenant Sub-Collection",
      tenantCollectionId,
    ).then((subResponse) => {
      return {
        tenantCollectionId,
        subCollectionId: subResponse.body.id,
      };
    });
  });
}

// The picker rules for the tenant namespace root (which items can go there,
// search, breadcrumbs) are covered by Jest:
// - enterprise/frontend/src/metabase-enterprise/tenants/shared-collections-entity-picker.unit.spec.tsx
// - frontend/src/metabase/dashboard/components/AddCardSidebar/AddCardSidebar.tenant-collections.unit.spec.tsx
// - frontend/src/metabase/new/components/NewModals/NewModals.tenant-collections.unit.spec.tsx
describe("scenarios > organization > entity picker > shared-tenant-collection namespace", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
    H.activateToken("pro-self-hosted");
    H.updateSetting("use-tenants", true);
  });

  it("should create a new collection inside the tenant namespace root", () => {
    cy.intercept("POST", "/api/collection").as("createCollection");

    setupTenantCollections().then(() => {
      cy.visit("/collection/root");

      H.startNewCollectionFromSidebar();

      cy.findByTestId("new-collection-modal").within(() => {
        cy.findByPlaceholderText(/My new fantastic collection/).type(
          "New Collection In Tenant Root",
        );
        cy.findByLabelText(/Collection it's saved in/).click();
      });

      H.entityPickerModal().within(() => {
        cy.findByText(TENANT_ROOT_NAME).click();
        cy.button("Select").should("be.enabled").click();
      });

      cy.findByTestId("new-collection-modal").within(() => {
        cy.button("Create").click();
      });

      cy.wait("@createCollection").then(({ request, response }) => {
        expect(request.body).to.include({
          name: "New Collection In Tenant Root",
          namespace: TENANT_NAMESPACE,
          parent_id: null,
        });
        expect(response?.statusCode).to.eq(200);
      });

      cy.reload();
      H.navigationSidebar()
        .findByRole("tree", { name: "tenant-collection-tree" })
        .findByText("New Collection In Tenant Root")
        .should("be.visible");
    });
  });

  it("should save a question to a tenant sub-collection and add it to a dashboard from there", () => {
    cy.intercept("POST", "/api/card").as("createCard");

    setupTenantCollections().as("tenantCollections");
    H.createDashboard({ name: "Test Dashboard" }).its("body").as("dashboard");

    H.startNewQuestion();
    H.miniPickerBrowseAll().click();
    H.entityPickerModal().within(() => {
      H.entityPickerModalItem(0, "Databases").click();
      H.entityPickerModalItem(1, "Sample Database").click();
      cy.findByText("Orders").click();
    });

    H.visualize();
    cy.findByTestId("qb-save-button").click();

    H.modal().within(() => {
      cy.findByLabelText(/Where do you want to save this/).click();
    });

    H.entityPickerModal().within(() => {
      cy.findByText(TENANT_ROOT_NAME).click();
      cy.findByText("Test Tenant Collection").click();
      cy.findByText("Tenant Sub-Collection").click();
      cy.button("Select this collection").should("be.enabled").click();
    });

    H.modal().within(() => {
      cy.findByLabelText(/Name/).clear().type("Tenant Sub-Collection Question");
      cy.button("Save").click();
    });

    cy.get<{ subCollectionId: number }>("@tenantCollections").then(
      ({ subCollectionId }) => {
        cy.wait("@createCard").then(({ request, response }) => {
          expect(request.body.collection_id).to.eq(subCollectionId);
          expect(response?.statusCode).to.eq(200);
        });
      },
    );

    cy.findByTestId("qb-header").should(
      "contain",
      "Tenant Sub-Collection Question",
    );

    cy.get<Dashboard>("@dashboard").then(({ id }) => {
      H.visitDashboard(id);
    });
    H.editDashboard();
    H.openQuestionsSidebar();

    H.sidebar()
      .findByTestId("breadcrumbs")
      .should("contain", "Collections")
      .and("contain", "Our analytics")
      .findByText("Collections")
      .click();

    H.sidebar().findByText(TENANT_ROOT_NAME).click();
    H.sidebar().findByText("Test Tenant Collection").click();
    H.sidebar().findByText("Tenant Sub-Collection").click();
    H.sidebar().findByText("Tenant Sub-Collection Question").click();

    H.getDashboardCards()
      .should("have.length", 1)
      .and("contain", "Tenant Sub-Collection Question");
  });
});
