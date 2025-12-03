const { H } = cy;
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import { ORDERS_QUESTION_ID } from "e2e/support/cypress_sample_instance_data";

const { ORDERS_ID } = SAMPLE_DATABASE;

const TENANT_ROOT_NAME = "Shared Tenant Collections";
const TENANT_NAMESPACE = "shared-tenant-collection";

/**
 * Enable tenants feature - this makes the virtual tenant root appear
 */
function enableTenantsFeature() {
  cy.request("PUT", "/api/setting/use-tenants", { value: true });
}

/**
 * Disable tenants feature
 */
function disableTenantsFeature() {
  cy.request("PUT", "/api/setting/use-tenants", { value: false });
}

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

describe("scenarios > organization > entity picker > shared-tenant-collection namespace", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
    H.activateToken("pro-self-hosted");
    enableTenantsFeature();
  });

  describe("virtual tenant root display", () => {
    it("should display Shared Tenant Collections in the entity picker when tenants are enabled", () => {
      setupTenantCollections().then(() => {
        H.visitQuestion(ORDERS_QUESTION_ID);
        H.openQuestionActions();
        H.popover().findByText("Move").click();

        H.entityPickerModal().within(() => {
          H.entityPickerModalTab("Browse").click();
          cy.findByText(TENANT_ROOT_NAME).should("be.visible");
        });
      });
    });

    it("should NOT display Shared Tenant Collections when tenants are disabled", () => {
      disableTenantsFeature();

      H.visitQuestion(ORDERS_QUESTION_ID);
      H.openQuestionActions();
      H.popover().findByText("Move").click();

      H.entityPickerModal().within(() => {
        H.entityPickerModalTab("Browse").click();
        cy.findByText(TENANT_ROOT_NAME).should("not.exist");
      });
    });

    it("should navigate into Shared Tenant Collections and see sub-collections", () => {
      setupTenantCollections().then(() => {
        H.visitQuestion(ORDERS_QUESTION_ID);
        H.openQuestionActions();
        H.popover().findByText("Move").click();

        H.entityPickerModal().within(() => {
          H.entityPickerModalTab("Browse").click();
          cy.findByText(TENANT_ROOT_NAME).click();

          cy.findByText("Test Tenant Collection").should("be.visible");
        });
      });
    });
  });

  describe("collection creation (allowed)", () => {
    it("should allow creating a new collection inside the tenant namespace root", () => {
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
          H.entityPickerModalTab("Collections").click();
          cy.findByText(TENANT_ROOT_NAME).click();

          cy.button("Select").should("not.be.disabled");
          cy.button("Select").click();
        });

        cy.findByTestId("new-collection-modal").within(() => {
          cy.button("Create").click();
        });
      });
    });

    it("should not allow moving a collection to the tenant namespace root", () => {
      setupTenantCollections().then(() => {
        H.createCollection({ name: "Collection To Move" }).then(
          ({ body: collection }) => {
            H.visitCollection(collection.id);

            H.openCollectionMenu();
            H.popover().findByText("Move").click();

            H.entityPickerModal().within(() => {
              H.entityPickerModalTab("Collections").click();
              cy.findByText(TENANT_ROOT_NAME).click();

              // Move button should be disabled for the tenant root
              cy.button("Move").should("be.disabled");

              // Close the modal
              cy.button("Cancel").click();
            });

            // Verify the collection is NOT under Shared Tenant Collections in sidebar
            H.navigationSidebar().within(() => {
              cy.findByText(TENANT_ROOT_NAME).click();
            });

            // The collection should not appear under tenant collections
            H.navigationSidebar()
              .findByText("Collection To Move")
              .should("not.exist");

            // The collection should still be in Our analytics (root)
            H.navigationSidebar().within(() => {
              cy.findByText("Our analytics").click();
            });
            H.navigationSidebar()
              .findByText("Collection To Move")
              .should("be.visible");
          },
        );
      });
    });
  });

  describe("dashboard restrictions", () => {
    it("should NOT allow saving a dashboard to the tenant namespace root", () => {
      setupTenantCollections().then(() => {
        cy.visit("/");

        H.newButton("Dashboard").click();

        H.modal().within(() => {
          cy.findByLabelText(/Which collection/).click();
        });

        H.entityPickerModal().within(() => {
          H.entityPickerModalTab("Browse").click();
          cy.findByText(TENANT_ROOT_NAME).click();

          cy.button("Select").should("be.disabled");
        });
      });
    });

    it("should allow saving a dashboard to a sub-collection within tenant namespace", () => {
      setupTenantCollections().then(() => {
        cy.visit("/");

        H.newButton("Dashboard").click();

        H.modal().within(() => {
          cy.findByLabelText(/Which collection/).click();
        });

        H.entityPickerModal().within(() => {
          H.entityPickerModalTab("Browse").click();
          cy.findByText(TENANT_ROOT_NAME).click();
          cy.findByText("Test Tenant Collection").click();

          cy.button("Select").should("not.be.disabled");
          cy.button("Select").click();
        });

        H.modal().within(() => {
          cy.findByLabelText(/Name/).type("Dashboard in Tenant Collection");
          cy.button("Create").click();
        });

        cy.url().should("include", "/dashboard/");
      });
    });

    it("should NOT allow moving a dashboard to the tenant namespace root", () => {
      setupTenantCollections().then(() => {
        H.createDashboard({
          name: "Dashboard to Move",
          collection_id: null,
        }).then(({ body: dashboard }) => {
          H.visitDashboard(dashboard.id);

          cy.findByTestId("dashboard-header").icon("ellipsis").click();
          H.popover().findByText("Move").click();

          H.entityPickerModal().within(() => {
            H.entityPickerModalTab("Browse").click();
            cy.findByText(TENANT_ROOT_NAME).click();

            cy.button("Move").should("be.disabled");

            cy.findByText("Test Tenant Collection").click();
            cy.button("Move").should("not.be.disabled");
          });
        });
      });
    });
  });

  describe("question restrictions", () => {
    it("should NOT allow saving a question to the tenant namespace root", () => {
      setupTenantCollections().then(() => {
        H.startNewQuestion();
        H.miniPickerBrowseAll().click();
        H.entityPickerModal().within(() => {
          H.entityPickerModalItem(0, "Databases").click();
          cy.findByText("Orders").click();
        });

        H.visualize();
        cy.findByTestId("qb-save-button").click();

        H.modal().within(() => {
          cy.findByLabelText(/Where do you want to save this/).click();
        });

        H.entityPickerModal().within(() => {
          H.entityPickerModalTab("Browse").click();
          cy.findByText(TENANT_ROOT_NAME).click();

          cy.button("Select").should("be.disabled");
        });
      });
    });

    it("should allow saving a question to a sub-collection within tenant namespace", () => {
      setupTenantCollections().then(() => {
        H.startNewQuestion();
        H.miniPickerBrowseAll().click();
        H.entityPickerModal().within(() => {
          H.entityPickerModalItem(0, "Databases").click();
          cy.findByText("Orders").click();
        });

        H.visualize();
        cy.findByTestId("qb-save-button").click();

        H.modal().within(() => {
          cy.findByLabelText(/Where do you want to save this/).click();
        });

        H.entityPickerModal().within(() => {
          H.entityPickerModalTab("Browse").click();
          cy.findByText(TENANT_ROOT_NAME).click();
          cy.findByText("Test Tenant Collection").click();

          cy.button("Select").should("not.be.disabled");
          cy.button("Select").click();
        });

        H.modal().within(() => {
          cy.findByLabelText(/Name/)
            .clear()
            .type("Question in Tenant Collection");
          cy.button("Save").click();
        });

        cy.findByTestId("qb-header").should(
          "contain",
          "Question in Tenant Collection",
        );
      });
    });

    it("should NOT allow moving a question to the tenant namespace root", () => {
      setupTenantCollections().then(() => {
        H.visitQuestion(ORDERS_QUESTION_ID);
        H.openQuestionActions();
        H.popover().findByText("Move").click();

        H.entityPickerModal().within(() => {
          H.entityPickerModalTab("Browse").click();
          cy.findByText(TENANT_ROOT_NAME).click();

          cy.button("Move").should("be.disabled");

          cy.findByText("Test Tenant Collection").click();
          cy.button("Move").should("not.be.disabled");
        });
      });
    });
  });

  describe("search functionality", () => {
    it("should find items in tenant collections via global search", () => {
      setupTenantCollections().then(({ tenantCollectionId }) => {
        H.createQuestion({
          name: "Searchable Tenant Question",
          type: "question",
          query: { "source-table": ORDERS_ID, aggregation: [["count"]] },
          collection_id: tenantCollectionId,
        }).then(() => {
          H.visitQuestion(ORDERS_QUESTION_ID);
          H.openQuestionActions();
          H.popover().findByText("Move").click();

          H.entityPickerModal().within(() => {
            cy.findByPlaceholderText(/Search/).type("Searchable Tenant");

            cy.findByText("Searchable Tenant Question").should("be.visible");
          });
        });
      });
    });

    it("should find tenant collections via search", () => {
      setupTenantCollections().then(() => {
        H.visitQuestion(ORDERS_QUESTION_ID);
        H.openQuestionActions();
        H.popover().findByText("Move").click();

        H.entityPickerModal().within(() => {
          cy.findByPlaceholderText(/Search/).type("Test Tenant Collection");

          cy.findByText("Test Tenant Collection").should("be.visible");
        });
      });
    });
  });

  describe("add to dashboard flow", () => {
    it("should NOT allow creating new dashboard in tenant root via add-to-dashboard flow", () => {
      setupTenantCollections().then(() => {
        H.visitQuestion(ORDERS_QUESTION_ID);
        H.openQuestionActions();
        H.popover().findByText("Add to dashboard").click();

        H.entityPickerModal().within(() => {
          H.entityPickerModalTab("Dashboards").click();
          cy.button(/New dashboard/).click();
        });

        H.dashboardOnTheGoModal().within(() => {
          cy.findByLabelText(/Which collection/).click();
        });

        H.entityPickerModal().within(() => {
          cy.findByText(TENANT_ROOT_NAME).click();
          cy.button("Select").should("be.disabled");
        });
      });
    });
  });
});
