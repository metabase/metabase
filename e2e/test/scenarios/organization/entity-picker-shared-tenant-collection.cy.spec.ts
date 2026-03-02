const { H } = cy;
import { ORDERS_QUESTION_ID } from "e2e/support/cypress_sample_instance_data";

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

describe("scenarios > organization > entity picker > shared-tenant-collection namespace", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
    H.activateToken("bleeding-edge");
    H.updateSetting("use-tenants", true);
  });

  describe("virtual tenant root display", () => {
    it("should display Shared collections in the entity picker when tenants are enabled", () => {
      setupTenantCollections().then(() => {
        H.visitQuestion(ORDERS_QUESTION_ID);
        H.openQuestionActions();
        H.popover().findByText("Move").click();

        H.entityPickerModal().within(() => {
          cy.findByText(TENANT_ROOT_NAME).should("be.visible");
        });
      });
    });

    it("should NOT display Shared collections when tenants are disabled", () => {
      H.updateSetting("use-tenants", false);

      H.visitQuestion(ORDERS_QUESTION_ID);
      H.openQuestionActions();
      H.popover().findByText("Move").click();

      H.entityPickerModal().within(() => {
        cy.findByText(TENANT_ROOT_NAME).should("not.exist");
      });
    });

    it("should navigate into Shared collections and see sub-collections", () => {
      setupTenantCollections().then(() => {
        H.visitQuestion(ORDERS_QUESTION_ID);
        H.openQuestionActions();
        H.popover().findByText("Move").click();

        H.entityPickerModal().within(() => {
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
              cy.findByText(TENANT_ROOT_NAME).should("not.exist");

              // Close the modal
              cy.button("Cancel").click();
            });

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

          cy.button("Select this collection").should("be.disabled");
        });
      });
    });

    it("should allow saving a question to a sub-collection within tenant namespace", () => {
      setupTenantCollections().then(() => {
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

          cy.button("Select this collection").should("not.be.disabled");
          cy.button("Select this collection").click();
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
          cy.findByText(TENANT_ROOT_NAME).click();

          cy.button("Move").should("be.disabled");

          cy.findByText("Test Tenant Collection").click();
          cy.button("Move").should("not.be.disabled");
        });
      });
    });
  });

  describe("search functionality", () => {
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

    it("should NOT show tenant collections in search when moving a non-tenant collection", () => {
      setupTenantCollections().then(() => {
        H.createCollection({ name: "Regular Collection" }).then(
          ({ body: collection }) => {
            H.visitCollection(collection.id);

            H.openCollectionMenu();
            H.popover().findByText("Move").click();

            H.entityPickerModal().within(() => {
              // Search for the tenant collection
              cy.findByPlaceholderText(/Search/).type("Test Tenant Collection");

              // Tenant collection should NOT appear in search results
              cy.findByText("Test Tenant Collection").should("not.exist");

              // Clear search and verify regular collections are still searchable
              cy.findByPlaceholderText(/Search/)
                .clear()
                .type("First collection");
              cy.findByText("First collection").should("be.visible");
            });
          },
        );
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
          cy.findByText(TENANT_ROOT_NAME).click();
          cy.button(/New dashboard/).should("be.disabled");
        });
      });
    });
  });
});
