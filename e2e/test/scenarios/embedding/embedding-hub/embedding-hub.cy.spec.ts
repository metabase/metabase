import { SAMPLE_DB_TABLES } from "e2e/support/cypress_data";
import { enableJwtAuth } from "e2e/support/helpers/e2e-jwt-helpers";

const { H } = cy;

const { STATIC_ORDERS_ID } = SAMPLE_DB_TABLES;

describe("scenarios - embedding hub", () => {
  describe("checklist", () => {
    beforeEach(() => {
      H.restore("setup");
      cy.signInAsAdmin();
      H.activateToken("pro-cloud");
    });

    it("Contains setup guide in sidebar", () => {
      cy.visit("/admin/embedding");

      cy.findByTestId("admin-layout-sidebar")
        .findByText("Setup guide")
        .should("exist")
        .click();

      cy.findByTestId("admin-layout-content")
        .findByRole("heading", { name: "Embedding setup guide" })
        .should("exist");
    });

    it('"Create a dashboard" card should work correctly', () => {
      cy.visit("/admin/embedding/setup-guide");

      cy.log("Find and click on 'Create a dashboard' card");
      cy.findByTestId("admin-layout-content")
        .findByText("Create a dashboard")
        .click();

      cy.log("Select a table to generate dashboard from");
      H.modal().within(() => {
        cy.findByText("Choose a table to generate a dashboard").should(
          "be.visible",
        );
        H.pickEntity({ path: ["Databases", "Sample Database", "Accounts"] });
      });

      cy.log("Should navigate to auto dashboard creation");
      cy.url().should("include", "/auto/dashboard/table/");
    });

    it('"Connect a database" card should work correctly', () => {
      cy.visit("/admin/embedding/setup-guide");

      cy.log("Find and click on 'Connect a database' card");
      cy.findByTestId("admin-layout-content")
        .findByText("Connect a database")
        .click();

      cy.log("Add data modal should open");
      cy.findByRole("dialog").within(() => {
        cy.findByRole("heading", { name: "Add data" }).should("be.visible");
      });
    });

    it("Uploading CSVs to sample database should mark the 'Add Data' step as done", () => {
      cy.intercept("GET", "/api/ee/embedding-hub/checklist").as("getChecklist");

      cy.log("Enable CSV uploads");
      cy.request("PUT", "/api/setting/uploads-settings", {
        value: {
          db_id: 1, // Sample Database ID
          schema_name: "PUBLIC",
          table_prefix: null,
        },
      });

      cy.visit("/admin/embedding/setup-guide");

      cy.log("'Connect a database' should not be marked as done");
      cy.findByTestId("admin-layout-content")
        .findByText("Connect a database")
        .closest("button")
        .findByText("Done")
        .should("not.exist");

      cy.findByTestId("admin-layout-content")
        .findByText("Connect a database")
        .click();

      H.modal().within(() => {
        cy.findByText("CSV").click();

        cy.log("Upload a CSV file");
        cy.get("#add-data-modal-upload-csv-input").selectFile(
          {
            contents: Cypress.Buffer.from(
              "header1,header2\nvalue1,value2",
              "utf8",
            ),
            fileName: "test-upload.csv",
            mimeType: "text/csv",
            lastModified: Date.now(),
          },
          { force: true },
        );

        cy.button("Upload").should("be.enabled").click();
      });

      cy.wait("@getChecklist");

      cy.log("'Connect a database' should be marked as done");
      cy.findByTestId("admin-layout-content")
        .findByText("Connect a database")
        .closest("button")
        .scrollIntoView()
        .findByText("Done")
        .should("be.visible");
    });

    [
      { dbId: 1, dbName: "sample db" },
      { dbId: 2, dbName: "sqlite db" },
    ].forEach(({ dbId, dbName }) => {
      it(`"Create models" step should be marked in ${dbName} as done after creating a model`, () => {
        if (dbId === 2) {
          H.addSqliteDatabase(dbName);
        }

        cy.log("Create a native query model via API");
        H.createNativeQuestion(
          {
            name: "Test Model",
            type: "model",
            database: dbId,
            native: { query: "SELECT 1 as t" },
          },
          { visitQuestion: true },
        );

        cy.log("Navigate to embedding setup guide");
        cy.visit("/admin/embedding/setup-guide");

        cy.log("'Create models' should now be marked as done");
        cy.findByTestId("admin-layout-content")
          .findByText("Create models")
          .closest("button")
          .scrollIntoView()
          .findByText("Done", { timeout: 10_000 })
          .should("be.visible");
      });
    });

    it('"Get embed snippet" card should take you to the embed flow', () => {
      cy.visit("/admin/embedding/setup-guide");

      cy.findByTestId("admin-layout-content")
        .findByText("Get embed snippet")
        .click();

      H.modal()
        .first()
        .within(() => {
          cy.findByText("Select your embed experience").should("be.visible");
        });
    });

    it("Embed in production step should be locked until JWT is enabled", () => {
      cy.visit("/admin/embedding/setup-guide");

      cy.findByTestId("admin-layout-content")
        .findByText("Embed in production with SSO")
        .scrollIntoView()
        .should("be.visible")
        .closest("button")
        .icon("lock")
        .should("be.visible");

      enableJwtAuth();
      cy.reload();

      cy.findByTestId("admin-layout-content")
        .findByText("Embed in production with SSO")
        .scrollIntoView()
        .should("be.visible")
        .closest("button")
        .icon("lock")
        .should("not.exist");
    });

    it("embedding checklist should show up on the embedding homepage", () => {
      cy.request("PUT", "/api/setting/embedding-homepage", {
        value: "visible",
      });

      cy.visit("/");

      cy.findAllByText("Get started with modular embedding")
        .first()
        .should("be.visible");

      cy.get("main").within(() => {
        cy.findByText("Create models").should("be.visible");
        cy.findByText("Create a dashboard").should("be.visible");
        cy.findByText("Connect a database").should("be.visible").click();
      });

      cy.log("Sanity check: add data modal should open");
      cy.findByRole("dialog").within(() => {
        cy.findByRole("heading", { name: "Add data" }).should("be.visible");
      });
    });

    it("embedding checklist should not show up on the embedding homepage if not enabled", () => {
      cy.visit("/");

      cy.get("main")
        .findByText("Get started with modular embedding")
        .should("not.exist");
    });

    it("overflow menu > customize homepage opens modal with correct title", () => {
      cy.request("PUT", "/api/setting/embedding-homepage", {
        value: "visible",
      });

      cy.visit("/");

      cy.log("Click overflow menu button on the embedding homepage");
      cy.get("main").within(() => {
        cy.findByLabelText("More options").click();
      });

      H.menu().findByText("Customize homepage").click();

      cy.findByRole("dialog").within(() => {
        cy.findByText("Pick a dashboard to appear on the homepage").should(
          "be.visible",
        );
      });
    });

    it("overflow menu > dismiss guide hides the embedding homepage", () => {
      cy.request("PUT", "/api/setting/embedding-homepage", {
        value: "visible",
      });

      cy.visit("/");

      cy.get("main")
        .findByText("Get started with modular embedding")
        .should("be.visible");

      cy.log("Click overflow menu button on the embedding homepage");
      cy.get("main").within(() => {
        cy.findByLabelText("More options").click();
      });

      H.menu().findByText("Dismiss guide").click();

      cy.log("Verify guide is dismissed and no longer visible");
      cy.get("main")
        .findByText("Get started with modular embedding")
        .should("not.exist");
    });

    it("should link to user strategy when tenants are disabled", () => {
      H.restore("setup");
      cy.signInAsAdmin();
      H.activateToken("bleeding-edge");

      cy.visit("/admin/embedding/setup-guide");

      H.main()
        .findByText("Tenants")
        .scrollIntoView()
        .should("be.visible")
        .closest("a")
        .should("have.attr", "href", "/admin/people/user-strategy");
    });

    it("should link to tenants page when tenants are enabled", () => {
      H.restore("setup");
      cy.signInAsAdmin();
      H.activateToken("bleeding-edge");

      H.updateSetting("use-tenants", true);
      cy.visit("/admin/embedding/setup-guide");

      H.main()
        .findByText("Tenants")
        .scrollIntoView()
        .should("be.visible")
        .closest("a")
        .should("have.attr", "href", "/admin/people/tenants");
    });

    it('"Configure data permissions and enable tenants" card should navigate to permissions onboarding page', () => {
      cy.visit("/admin/embedding/setup-guide");

      cy.findByTestId("admin-layout-content")
        .findByText("Configure data permissions and enable tenants")
        .click();

      cy.url().should("include", "/admin/embedding/setup-guide/permissions");

      H.main()
        .findByText("Configure data permissions and enable tenants")
        .scrollIntoView()
        .should("be.visible");
    });

    it("permissions setup page should mark steps as completed", () => {
      H.restore("setup");
      cy.signInAsAdmin();
      H.activateToken("bleeding-edge");

      cy.visit("/admin/embedding/setup-guide/permissions");

      cy.log("all 5 steps are present and none are completed at first");
      H.main().within(() => {
        cy.findByText("Enable multi-tenant user strategy")
          .scrollIntoView()
          .should("be.visible");

        cy.findByText("Which data segregation strategy does your database use?")
          .scrollIntoView()
          .should("be.visible");

        cy.findByText("Select data to make available")
          .scrollIntoView()
          .should("be.visible");

        cy.findByText("Create tenants").scrollIntoView().should("be.visible");
        cy.findByText("Summary").scrollIntoView().should("be.visible");

        // No steps should be completed yet (no check icons)
        cy.icon("check").should("not.exist");
      });

      cy.log("enable tenants and create a shared collection");
      H.updateSetting("use-tenants", true);
      cy.request("POST", "/api/collection", {
        name: "Shared collection",
        namespace: "shared-tenant-collection",
      });

      cy.log("create a tenant");
      cy.request("POST", "/api/ee/tenant", {
        name: "Test Tenant",
        slug: "test-tenant",
      });

      cy.log("check steps 1 and 4 are completed");
      cy.reload();
      H.main().icon("check").should("have.length", 2);

      cy.log("setup row-level security");
      cy.request("POST", "/api/permissions/group", { name: "Test Group" }).then(
        ({ body: group }) => {
          cy.sandboxTable({
            table_id: STATIC_ORDERS_ID,
            group_id: group.id,
          });
        },
      );

      cy.log("check all 5 steps are completed");
      cy.reload();
      H.main().icon("check").should("have.length", 5);
    });

    it('"Enable tenants and create shared collection" button should enable tenants and create a shared collection', () => {
      H.restore("setup");
      cy.signInAsAdmin();
      H.activateToken("bleeding-edge");

      cy.visit("/admin/embedding/setup-guide/permissions");

      cy.log("tenants should not be enabled");
      cy.request("GET", "/api/session/properties").then((response) => {
        expect(response.body["use-tenants"]).to.equal(false);
      });

      cy.log("shared tenants collection should not exist");
      cy.request(
        "GET",
        "/api/collection/tree?namespace=shared-tenant-collection",
      ).then((response) => {
        expect(response.body).to.have.length(0);
      });

      cy.log("click the enable tenants button");
      H.main()
        .findByRole("button", {
          name: "Enable tenants and create shared collection",
        })
        .should("be.enabled")
        .click();

      cy.log("tenants should be enabled");
      cy.request("GET", "/api/session/properties").then((response) => {
        expect(response.body["use-tenants"]).to.equal(true);
      });

      cy.log("shared collection should be created");
      cy.request(
        "GET",
        "/api/collection/tree?namespace=shared-tenant-collection",
      ).then((response) => {
        expect(response.body).to.have.length(1);
        expect(response.body[0].name).to.equal("Shared collection");
      });

      cy.log("enable-tenants step should be marked as completed");
      H.main()
        .findByRole("listitem", {
          name: "Enable multi-tenant user strategy",

          // the embedding checklist query takes time on CI
          timeout: 10_000,
        })
        .should("have.attr", "data-completed", "true");
    });

    it("enable-tenants step should not be marked as completed when tenants are enabled but no shared collection exists", () => {
      H.restore("setup");
      cy.signInAsAdmin();
      H.activateToken("bleeding-edge");

      cy.log("enable tenants via setting without creating a shared collection");
      H.updateSetting("use-tenants", true);

      cy.visit("/admin/embedding/setup-guide/permissions");

      cy.log("no steps should be completed");
      H.main().within(() => {
        cy.findByText("Enable multi-tenant user strategy")
          .scrollIntoView()
          .should("be.visible");

        cy.icon("check").should("not.exist");
      });

      cy.log("button should still be enabled");
      H.main()
        .findByRole("button", {
          name: "Enable tenants and create shared collection",
        })
        .should("be.enabled");
    });

    it("permissions setup should lock steps 3 to 5", () => {
      H.restore("setup");
      cy.signInAsAdmin();
      H.activateToken("bleeding-edge");

      cy.visit("/admin/embedding/setup-guide/permissions");

      cy.log("steps 3, 4, and 5 should be locked");
      H.main().within(() => {
        cy.findByRole("listitem", { name: "Select data to make available" })
          .icon("lock")
          .should("exist");

        cy.findByRole("listitem", { name: "Create tenants" })
          .icon("lock")
          .should("exist");

        cy.findByRole("listitem", { name: "Summary" })
          .icon("lock")
          .should("exist");
      });

      cy.log("enable tenants (step 1)");
      H.main()
        .findByRole("button", {
          name: "Enable tenants and create shared collection",
        })
        .should("be.enabled")
        .click();

      cy.log("setup row-level security (step 2 and 3)");
      cy.request("POST", "/api/permissions/group", { name: "Test Group" }).then(
        ({ body: group }) => {
          cy.sandboxTable({
            table_id: STATIC_ORDERS_ID,
            group_id: group.id,
          });
        },
      );

      cy.log("steps 3 and 4 should be unlocked");
      cy.reload();
      H.main().within(() => {
        cy.findByRole("listitem", { name: "Select data to make available" })
          .icon("lock")
          .should("not.exist");

        cy.findByRole("listitem", { name: "Create tenants" })
          .icon("lock")
          .should("not.exist");

        cy.log("step 5 should still be locked (tenants not created yet)");
        cy.findByRole("listitem", { name: "Summary" })
          .icon("lock")
          .should("exist");
      });

      cy.log("create a tenant (step 4)");
      cy.request("POST", "/api/ee/tenant", {
        name: "Test Tenant",
        slug: "test-tenant",
      });

      cy.log("step 5 should be unlocked");
      cy.reload();
      H.main()
        .findByRole("listitem", { name: "Summary" })
        .icon("lock")
        .should("not.exist");
    });

    it('"Enable tenants and create shared collection" button should be disabled when already set up', () => {
      H.restore("setup");
      cy.signInAsAdmin();
      H.activateToken("bleeding-edge");

      cy.log("enable tenants and create a shared collection");
      H.updateSetting("use-tenants", true);
      cy.request("POST", "/api/collection", {
        name: "Shared collection",
        namespace: "shared-tenant-collection",
      });

      cy.visit("/admin/embedding/setup-guide/permissions");

      cy.log("wait until step is marked as complete");
      H.main().icon("check").should("have.length", 1);

      cy.log("un-collapse the pre-collapsed step");
      H.main().findByText("Enable multi-tenant user strategy").click();

      cy.log("button should be disabled as setup was already complete");
      H.main()
        .findByRole("button", {
          name: "Enable tenants and create shared collection",
        })
        .should("be.disabled");
    });

    it("selecting database routing strategy should show documentation link in step 3", () => {
      H.restore("setup");
      cy.signInAsAdmin();
      H.activateToken("bleeding-edge");

      cy.visit("/admin/embedding/setup-guide/permissions");

      cy.log("click the enable tenants button");
      H.main()
        .findByRole("button", {
          name: "Enable tenants and create shared collection",
        })
        .should("be.enabled")
        .click();

      cy.log("select database routing strategy");
      H.main()
        .findByRole("radio", { name: /Database routing/ })
        .click();

      cy.log("confirm the strategy selection");
      H.main().findByRole("button", { name: "Use database routing" }).click();

      cy.log("should show database routing content with docs link");
      H.main()
        .findByText("Manage data permissions with database routing")
        .should("be.visible");

      H.main()
        .findByRole("link", { name: /View the guide/i })
        .should("have.attr", "href")
        .and("include", "database-routing");
    });

    describe("create tenants step", () => {
      beforeEach(() => {
        H.restore("setup");
        cy.signInAsAdmin();
        H.activateToken("bleeding-edge");

        cy.log("enable tenants and create shared collection");
        H.updateSetting("use-tenants", true);
        cy.request("POST", "/api/collection", {
          name: "Shared collection",
          namespace: "shared-tenant-collection",
        });

        cy.log("setup row-level security to unlock the create tenants step");
        cy.request("POST", "/api/permissions/group", {
          name: "Test Group",
        }).then(({ body: group }) => {
          cy.sandboxTable({
            table_id: STATIC_ORDERS_ID,
            group_id: group.id,
          });
        });
      });

      it("can create two tenants and show summary", () => {
        cy.visit("/admin/embedding/setup-guide/permissions");

        H.main().within(() => {
          cy.log("navigate to create tenants step");

          cy.findByRole("listitem", { name: "Create tenants" })
            .should("be.visible")
            .click();

          cy.log("fill out the tenant form");
          cy.findByPlaceholderText("Tenant name").clear().type("Acme Corp");
          cy.findByPlaceholderText("tenant_id").type("acme-123");
          cy.findByPlaceholderText("tenant-slug")
            .clear()
            .type("acme-corp-slug");

          cy.log("add another tenant");
          cy.findByRole("button", { name: /New tenant/ }).click();
        });

        cy.log("fill out the second tenant form");
        H.main().within(() => {
          cy.findAllByPlaceholderText("Tenant name")
            .should("have.length", 2)
            .last()
            .clear()
            .type("Beta Inc");

          cy.findAllByPlaceholderText("tenant_id")
            .should("have.length", 2)
            .last()
            .type("beta-456");

          cy.findAllByPlaceholderText("tenant-slug")
            .should("have.length", 2)
            .last()
            .clear()
            .type("beta-inc-slug");
        });

        cy.log("submit the tenant creation form");
        H.main().findByRole("button", { name: "Next" }).click();

        cy.log("success toast should show");
        H.undoToast()
          .findByText("Tenants created successfully")
          .should("be.visible");

        H.main().within(() => {
          cy.log("step 4 should be marked as completed");
          cy.findByRole("listitem", {
            name: "Create tenants",
            timeout: 10_000,
          }).should("have.attr", "data-completed", "true");

          cy.findByText("You created the following tenants").should(
            "be.visible",
          );

          cy.log("step 5 should hide title when active");
          cy.findByText("Summary").should("not.exist");

          cy.log("summary step should show tenant #1");
          cy.findByText("Acme Corp").should("be.visible");
          cy.findByText("acme-corp-slug").should("be.visible");

          cy.log("summary step should show tenant #2");
          cy.findByText("Beta Inc").should("be.visible");
          cy.findByText("beta-inc-slug").should("be.visible");

          cy.log("navigation links should be shown in summary");
          cy.findByRole("link", { name: /Tenants/ }).should("be.visible");
          cy.findByRole("button", { name: "Done" }).click();
        });

        cy.log("Configure data permissions step should be done");
        cy.findByTestId("admin-layout-content")
          .findByText("Configure data permissions and enable tenants")
          .closest("button")
          .findByText("Done")
          .should("be.visible");

        cy.visit("/admin/people/tenants");

        cy.log("tenants are shown in the tenants page");
        H.main().within(() => {
          cy.findByText("Acme Corp").should("be.visible");
          cy.findByText("Beta Inc").should("be.visible");
        });
      });

      it("shows error toast when creating a tenant with duplicate slug", () => {
        cy.log("create an existing tenant");
        cy.request("POST", "/api/ee/tenant", {
          name: "Existing Tenant",
          slug: "existing-tenant",
        });

        cy.visit("/admin/embedding/setup-guide/permissions");

        H.main()
          .findByRole("listitem", { name: "Create tenants" })
          .should("be.visible")
          .click();

        cy.log("fill out the tenant form with a colliding slug");
        H.main().within(() => {
          cy.findByPlaceholderText("Tenant name")
            .clear()
            .type("Another Tenant");

          cy.findByPlaceholderText("tenant_id").type("another-id");

          cy.findByPlaceholderText("tenant-slug")
            .clear()
            .type("existing-tenant");
        });

        H.main().findByRole("button", { name: "Next" }).click();

        cy.log("error toast should be shown");
        H.undoToast()
          .findByText("This tenant name or slug is already taken.", {
            timeout: 10_000,
          })
          .should("be.visible");

        cy.log("we should still be on the create tenants step");
        H.main().findByPlaceholderText("Tenant name").should("be.visible");
      });
    });
  });
});
