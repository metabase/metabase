import { WRITABLE_DB_ID } from "e2e/support/cypress_data";
import { ALL_EXTERNAL_USERS_GROUP_ID } from "e2e/support/cypress_sample_instance_data";

const { H } = cy;

const NON_SAMPLE_DB_NAME = "QA Postgres12";

describe("scenarios - setup guide", () => {
  describe("checklist", () => {
    beforeEach(() => {
      H.restore("setup");
      cy.signInAsAdmin();
      H.activateToken("pro-cloud");
    });

    it('"Connect a database" card should pass from param in navigation URL', () => {
      cy.visit("/embedding/get-started");

      cy.log("Find and click on 'Connect a database' card");
      cy.findByTestId("embedding-hub-main")
        .findByText("Connect a database")
        .click();

      cy.log("Add data modal should open");
      cy.findByRole("dialog").within(() => {
        cy.findByRole("heading", { name: "Add data" }).should("be.visible");
      });

      cy.log("Select a database engine");
      cy.findByRole("dialog").findByText("PostgreSQL").click();

      cy.log("Should navigate with from param");
      cy.url().should("include", "/admin/databases/create");
      cy.url().should("include", "returnToEmbeddingSetupGuide=");
    });

    it("Uploading CSVs to sample database should mark the 'Add Data' step as done", () => {
      cy.intercept("GET", "/api/embedding-hub/checklist").as("getChecklist");

      cy.log("Enable CSV uploads");
      cy.request("PUT", "/api/setting/uploads-settings", {
        value: {
          db_id: 1, // Sample Database ID
          schema_name: "PUBLIC",
          table_prefix: null,
        },
      });

      cy.visit("/embedding/get-started");

      cy.log("'Connect a database' should not be marked as done");
      cy.findByTestId("embedding-hub-main")
        .findByText("Connect a database")
        .closest('[data-testid="embedding-hub-checklist-card"]')
        .findByLabelText("Step 1 complete")
        .should("not.exist");

      cy.findByTestId("embedding-hub-main")
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
      cy.findByTestId("embedding-hub-main")
        .findByText("Connect a database")
        .closest('[data-testid="embedding-hub-checklist-card"]')
        .scrollIntoView()
        .findByLabelText("Step 1 complete")
        .should("be.visible");
    });

    it('"Get embed snippet" step should be done when a guest embed is published', () => {
      cy.log("Create a dashboard to embed");
      H.createDashboard({ name: "Test Dashboard" });

      cy.visit("/embedding/get-started");

      cy.log("step should not be marked as done at first");
      cy.findByTestId("embedding-hub-main")
        .findByText("Get embed snippet")
        .closest('[data-testid="embedding-hub-checklist-card"]')
        .findByLabelText("Step 3 complete")
        .should("not.exist");

      cy.log("open embed wizard");
      cy.findByTestId("embedding-hub-main")
        .findByText("Get embed snippet")
        .click();

      H.modal()
        .first()
        .within(() => {
          cy.findByText("Select your embed experience").should("be.visible");

          cy.log("switch to guest auth");
          cy.findByLabelText("Guest").click();
          cy.log("choose dashboard experience");
          cy.findByText("Dashboard").click();
          cy.log("pick a dashboard");
          cy.findByTestId("embed-browse-entity-button").click();
        });

      H.entityPickerModal().findByText("Test Dashboard").click();

      H.modal()
        .first()
        .within(() => {
          cy.findByText("Next").click();
        });

      cy.log("publish the embed");
      H.publishChanges("dashboard");

      cy.log("close the wizard");
      H.modal().first().findByText("Get code").click();
      H.modal().first().findByLabelText("Close").click();

      cy.log("step should be marked as done");
      cy.findByTestId("embedding-hub-main")
        .findByText("Get embed snippet")
        .closest('[data-testid="embedding-hub-checklist-card"]')
        .findByLabelText("Step 3 complete", { timeout: 10_000 })
        .should("be.visible");
    });

    it("overflow menu > customize homepage opens a modal and dismiss guide hides the embedding homepage", () => {
      cy.log("embedding checklist should not show up if not enabled");
      cy.visit("/");

      cy.findByTestId("home-page")
        .findByText("Try out these sample x-rays to see what Metabase can do.")
        .should("be.visible");
      cy.get("main")
        .findByText("Get started with modular embedding")
        .should("not.exist");

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

      H.menu().findByText("Customize homepage").click();

      cy.findByRole("dialog").within(() => {
        cy.findByText("Pick a dashboard to appear on the homepage").should(
          "be.visible",
        );
        cy.findByRole("button", { name: "Cancel" }).click();
      });
      cy.findByRole("dialog").should("not.exist");

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
  });

  describe("permissions setup", () => {
    beforeEach(() => {
      H.restore("setup");
      cy.signInAsAdmin();
      H.activateToken("pro-self-hosted");
    });

    it('"Enable tenants and create shared collection" button should enable tenants and create a shared collection', () => {
      cy.log("create an x-ray dashboard via the embedding setup guide");
      cy.visit("/embedding/get-started");

      cy.findByTestId("embedding-hub-main")
        .findByText("Create a dashboard")
        .click();

      cy.log("select Orders table from the modal");
      H.modal().within(() => {
        H.pickEntity({
          path: ["Databases", "Sample Database", "Orders"],
        });
      });

      cy.log("wait for x-ray dashboard to generate and save it");
      H.undoToast().should("contain", "Your dashboard was saved");

      cy.visit("/embedding/get-started/permissions");

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

      cy.log(
        "dashboard picker should appear with the x-ray dashboard pre-selected",
      );
      H.main()
        .findByText("This will allow tenant users to see it.")
        .should("be.visible");

      cy.log("x-ray dashboard should be pre-selected, move it");
      cy.intercept("PUT", "/api/dashboard/*").as("moveDashboard");
      H.main()
        .findByRole("button", {
          name: "Move to shared collection",
          timeout: 10_000,
        })
        .should("be.enabled")
        .click();

      cy.wait("@moveDashboard").its("response.statusCode").should("eq", 200);

      cy.log(
        "x-rayed dashboard should have been moved to the shared collection",
      );
      cy.request(
        "GET",
        "/api/collection/tree?namespace=shared-tenant-collection",
      ).then((response) => {
        const sharedCollectionId = response.body[0].id;
        cy.request(
          "GET",
          `/api/collection/${sharedCollectionId}/items?models=dashboard`,
        ).then((itemsResponse) => {
          const dashboards = itemsResponse.body.data;
          expect(dashboards.length).to.be.greaterThan(0);
          expect(
            dashboards.some((d: { name: string }) =>
              d.name.includes("A look at"),
            ),
          ).to.be.true;
        });
      });

      cy.log("enable-tenants step should be marked as completed");
      H.main()
        .findByRole("listitem", {
          name: "Enable multi-tenant user strategy",

          // the embedding checklist query takes time on CI
          timeout: 10_000,
        })
        .should("have.attr", "data-completed", "true");

      cy.log("move-dashboard step should be marked as completed");
      H.main()
        .findByRole("listitem", {
          name: "Create a dashboard in the shared collection",
          timeout: 10_000,
        })
        .should("have.attr", "data-completed", "true");
    });
  });

  describe("row-level security setup", () => {
    beforeEach(() => {
      H.restore("postgres-12");
      cy.signInAsAdmin();
      H.activateToken("pro-self-hosted");
    });

    it("shows autocomplete suggestions for organization_id based on selected field values", () => {
      cy.visit("/embedding/get-started/permissions");

      cy.log("enable tenants and create shared collection");
      H.main()
        .findByRole("button", {
          name: "Enable tenants and create shared collection",
        })
        .click();

      cy.log("wait for tenants to be enabled");
      H.main()
        .findByRole("listitem", {
          name: "Enable multi-tenant user strategy",
          timeout: 10_000,
        })
        .icon("check")
        .should("exist");

      cy.log("complete the move-dashboard step");
      H.main()
        .findByRole("button", { name: "Create a sample dashboard" })
        .click();

      cy.log("use row and column level security");
      H.main()
        .findByRole("radio", { name: /Row and column level security/ })
        .scrollIntoView()
        .click();

      H.main()
        .findByRole("button", { name: "Use row and column level security" })
        .scrollIntoView()
        .click();

      cy.log("pick orders table");
      H.main().findByText("Pick a table").click();
      H.miniPicker().findByText(NON_SAMPLE_DB_NAME).click();
      H.miniPicker().findByText("Orders").click();

      H.main().findByPlaceholderText("Pick a column").click();
      H.popover().findByText("User ID").click();
      H.main().findByRole("button", { name: "Next" }).click();

      cy.log("autocomplete dropdown should show matching user id values");
      H.main().findByPlaceholderText("e.g. 1").type("1");

      H.popover().within(() => {
        cy.findAllByRole("option").should("have.length.at.least", 8);

        // The ID differs across run, so let's only do one assertion here.
        cy.findByRole("option", { name: "1" }).should("exist");
      });
    });

    // Needs its own test case, as the RLS selected table and columns
    // are only populated when the user goes through the "Select data" step
    // in the UI. Without it, the data permissions description won't show.
    it("should create sandboxes for multiple tables via row-level security setup", () => {
      cy.intercept("PUT", "/api/permissions/graph").as(
        "updatePermissionsGraph",
      );

      cy.visit("/embedding/get-started/permissions");

      cy.log("steps 3, 4, and 5 should be locked initially");
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

      H.main()
        .findByRole("button", {
          name: "Enable tenants and create shared collection",
        })
        .click();

      cy.log("wait for tenants to be enabled");
      H.main()
        .findByRole("listitem", {
          name: "Enable multi-tenant user strategy",
          timeout: 10_000,
        })
        .icon("check")
        .should("exist");

      cy.log("complete the move-dashboard step");
      H.main()
        .findByRole("button", { name: "Create a sample dashboard" })
        .click();

      H.main()
        .findByRole("radio", { name: /Row and column level security/ })
        .scrollIntoView()
        .click();

      H.main()
        .findByRole("button", { name: "Use row and column level security" })
        .scrollIntoView()
        .click();

      cy.log("pick first table and column");
      H.main().findByText("Pick a table").click();

      cy.log("Our analytics should be hidden in the table picker");
      H.miniPicker().findByText("Our analytics").should("not.exist");
      cy.log("Sample Database should be hidden in the table picker");
      H.miniPicker().findByText("Sample Database").should("not.exist");

      H.miniPicker().findByText(NON_SAMPLE_DB_NAME).click();
      H.miniPicker().findByText("Orders").click();

      H.main().findByPlaceholderText("Pick a column").click();
      H.popover().findByText("User ID").click();

      cy.log("pick second table and column");
      H.main().findByText("Add table").click();
      H.main().findAllByText("Pick a table").first().click();

      H.miniPicker().findByText(NON_SAMPLE_DB_NAME).click();

      cy.log("orders should be hidden as it's already selected");
      H.miniPicker().findByText("Orders").should("not.exist");

      H.miniPicker().findByText("People").click();

      H.main()
        .findAllByPlaceholderText("Pick a column")
        .should("have.length", 2)
        .last()
        .click();

      H.popover().findByText("ID").click();

      cy.log("create sandbox");
      H.main().findByRole("button", { name: "Next" }).click();

      cy.log("wait for sandbox creation to complete");
      cy.wait("@updatePermissionsGraph");

      cy.log("no error toast should appear");
      H.undoToast().should("not.exist");

      // We verify permissions via API rather than UI because:
      // 1. The admin permissions UI is complex and would add significant test time
      // 2. This test focuses on the onboarding flow, not the permissions UI
      cy.log("access policies should be created");
      H.getTableId({ databaseId: WRITABLE_DB_ID, name: "orders" }).then(
        (ordersTableId) => {
          H.getTableId({ databaseId: WRITABLE_DB_ID, name: "people" }).then(
            (peopleTableId) => {
              cy.request("GET", "/api/mt/gtap").should((response) => {
                const policies = response.body;
                expect(policies.length).to.be.at.least(2);

                const orderPolicy = policies.find(
                  (policy: { table_id: number }) =>
                    policy.table_id === ordersTableId,
                );

                const peoplePolicy = policies.find(
                  (policy: { table_id: number }) =>
                    policy.table_id === peopleTableId,
                );

                expect(orderPolicy).to.exist;
                expect(peoplePolicy).to.exist;

                expect(orderPolicy.attribute_remappings).to.have.property(
                  "organization_id",
                );

                expect(peoplePolicy.attribute_remappings).to.have.property(
                  "organization_id",
                );
              });

              cy.request(
                "GET",
                `/api/permissions/graph/group/${ALL_EXTERNAL_USERS_GROUP_ID}`,
              ).should((response) => {
                const graph = response.body;

                const permissions =
                  graph.groups[ALL_EXTERNAL_USERS_GROUP_ID!][WRITABLE_DB_ID];
                expect(permissions).to.exist;

                expect(permissions["view-data"].public).to.deep.equal({
                  [ordersTableId]: "sandboxed",
                  [peopleTableId]: "sandboxed",
                });

                expect(permissions["create-queries"].public).to.deep.equal({
                  [ordersTableId]: "query-builder",
                  [peopleTableId]: "query-builder",
                });
              });
            },
          );
        },
      );

      H.main()
        .findByRole("listitem", {
          name: "Select data to make available",
          timeout: 10_000,
        })
        .icon("check")
        .should("exist");
    });

    it("should update existing sandboxes when changing column selection", () => {
      cy.intercept("PUT", "/api/permissions/graph").as(
        "updatePermissionsGraph",
      );

      // We use API setup here instead of clicking through the UI because:
      // 1. This test verifies the UPDATE flow (not CREATE), which requires a sandbox to already exist
      // 2. The sandbox can only be created after tenants are enabled (which creates the all-external-users group)
      // 3. Using API calls is cleaner for test data preparation than clicking through UI twice
      cy.log("enable tenants to create the all-external-users");
      H.updateSetting("use-tenants", true);

      cy.log("create shared collection with a dashboard");
      cy.request("POST", "/api/collection", {
        name: "Shared collection",
        parent_id: null,
        namespace: "shared-tenant-collection",
      }).then(({ body: collection }) => {
        H.createDashboard({
          name: "Test Dashboard",
          collection_id: collection.id,
        });
      });

      cy.log("create an existing sandbox for Orders table via API");
      H.getTableId({ databaseId: WRITABLE_DB_ID, name: "orders" }).then(
        (ordersTableId) => {
          cy.wrap(ordersTableId).as("ordersTableId");

          H.getFieldId({ tableId: ordersTableId, name: "user_id" }).then(
            (userIdFieldId) => {
              H.getFieldId({ tableId: ordersTableId, name: "product_id" }).then(
                (productIdFieldId) => {
                  cy.wrap(productIdFieldId).as("productIdFieldId");

                  cy.request("GET", "/api/permissions/group").then(
                    (response) => {
                      const allExternalUsersGroup = response.body.find(
                        (g: { magic_group_type: string }) =>
                          g.magic_group_type === "all-external-users",
                      );

                      cy.request("POST", "/api/mt/gtap", {
                        table_id: ordersTableId,
                        group_id: allExternalUsersGroup.id,
                        card_id: null,
                        attribute_remappings: {
                          organization_id: [
                            "dimension",
                            ["field", userIdFieldId, null],
                          ],
                        },
                      });
                    },
                  );
                },
              );
            },
          );
        },
      );

      cy.visit("/embedding/get-started/permissions");

      cy.log("wait for checklist data to load before interacting with steps");
      H.main()
        .findByRole("listitem", {
          name: /Enable multi-tenant user strategy/,
          timeout: 10_000,
        })
        .should("have.attr", "data-completed", "true");

      // The seeded sandbox marks the later steps done, so the stepper
      // auto-advances to "Create tenants" — clicking before it settles misses.
      cy.log("wait for the stepper to settle on the first incomplete step");
      H.main()
        .findByRole("listitem", { name: "Create tenants", timeout: 10_000 })
        .should("have.attr", "data-active", "true");

      const dataSegregationStep = () =>
        H.main().findByRole("listitem", {
          name: /Which data segregation strategy/,
        });

      cy.log("open the data segregation strategy step");
      dataSegregationStep().scrollIntoView().click();

      cy.log("the strategy picker should be expanded");
      dataSegregationStep().should("have.attr", "data-active", "true");

      cy.log("select row and column level security strategy");
      H.main()
        .findByRole("radio", { name: /Row and column level security/ })
        .scrollIntoView()
        .click();

      H.main()
        .findByRole("button", { name: "Use row and column level security" })
        .scrollIntoView()
        .click();

      cy.log("Select the same Orders table");
      H.main().findByText("Pick a table").click();
      H.miniPicker().findByText(NON_SAMPLE_DB_NAME).click();
      H.miniPicker().findByText("Orders").click();

      cy.log("select Product ID column instead of User ID");
      H.main().findByPlaceholderText("Pick a column").click();
      H.popover().findByText("Product ID").click();
      H.main().findByRole("button", { name: "Next" }).click();

      cy.log("wait for sandbox update to complete");
      // The "Next" click kicks off several sequential metadata fetches
      // (list tables, list databases, read the permissions-graph revision)
      // before it issues the PUT we're aliasing here, so under load the
      // request can take longer than Cypress's default 5s request timeout.
      cy.wait("@updatePermissionsGraph", { timeout: 15_000 });

      cy.log("the 'Select data' step should be marked complete");
      H.main()
        .findByRole("listitem", {
          name: "Select data to make available",
          timeout: 10_000,
        })
        .icon("check")
        .should("exist");

      // Anchor the negative assertion on the positive success signal above so
      // it can't pass by racing an unrendered page.
      cy.log("no error toast should appear once the update has settled");
      H.undoToast().should("not.exist");

      cy.log("sandbox should be updated and not created");
      cy.get<number>("@ordersTableId").then((ordersTableId) => {
        cy.get<number>("@productIdFieldId").then((productIdFieldId) => {
          cy.request("GET", "/api/mt/gtap").should((response) => {
            const policies = response.body;

            const orderPolicies = policies.filter(
              (policy: { table_id: number }) =>
                policy.table_id === ordersTableId,
            );

            // should only have one sandbox for Orders table
            expect(orderPolicies.length).to.equal(1);

            const [orderPolicy] = orderPolicies;
            const tenantFieldRef =
              orderPolicy.attribute_remappings.organization_id;

            expect(tenantFieldRef[1][1]).to.equal(productIdFieldId);
          });
        });
      });
    });
  });

  it(
    "should block schemas without selected tables in RLS setup",
    { tags: ["@external"] },
    () => {
      H.restore("postgres-writable");
      cy.signInAsAdmin();
      H.activateToken("pro-self-hosted");

      cy.log(
        'reset "multi_schema" fixture: creates Domestic and Wild schemas, each with tables',
      );
      H.resetTestTable({ type: "postgres", table: "multi_schema" });
      H.resyncDatabase({ dbId: WRITABLE_DB_ID });

      cy.intercept("PUT", "/api/permissions/graph").as(
        "updatePermissionsGraph",
      );

      cy.visit("/embedding/get-started/permissions");

      cy.log("enable tenants and create shared collection");
      H.main()
        .findByRole("button", {
          name: "Enable tenants and create shared collection",
        })
        .click();

      cy.log("wait for tenants to be enabled");
      H.main()
        .findByRole("listitem", {
          name: "Enable multi-tenant user strategy",
          timeout: 10_000,
        })
        .icon("check")
        .should("exist");

      cy.log("complete the move-dashboard step");
      H.main()
        .findByRole("button", { name: "Create a sample dashboard" })
        .click();

      cy.log("select RLS strategy");
      H.main()
        .findByRole("radio", { name: /Row and column level security/ })
        .scrollIntoView()
        .click();

      H.main()
        .findByRole("button", {
          name: "Use row and column level security",
        })
        .scrollIntoView()
        .click();

      cy.log("pick a table from the Domestic schema of the Postgres database");

      H.main().findByText("Pick a table").click();
      H.miniPicker().findByText("Writable Postgres12").click();
      H.miniPicker().findByText("Domestic").click();
      H.miniPicker().findByText("Animals").click();

      cy.log("pick Score column as the tenant filter field");
      H.main().findByPlaceholderText("Pick a column").click();
      H.popover().findByText("Score").click();

      cy.log("create sandbox");
      H.main().findByRole("button", { name: "Next" }).click();

      cy.log("wait for sandbox creation to complete");
      cy.wait("@updatePermissionsGraph");

      cy.log("no error toast should appear");
      H.undoToast().should("not.exist");

      cy.log("verify schemas without selected tables are blocked");
      cy.request(
        "GET",
        `/api/permissions/graph/group/${ALL_EXTERNAL_USERS_GROUP_ID}`,
      ).then((response) => {
        const graph = response.body;

        const permissions =
          graph.groups[ALL_EXTERNAL_USERS_GROUP_ID!][WRITABLE_DB_ID];
        expect(permissions).to.exist;

        const viewData = permissions["view-data"];
        expect(viewData).to.exist;

        // Domestic schema should have granular per-table permissions
        expect(viewData["Domestic"]).to.be.an("object");
        const domesticTableIds = Object.keys(viewData["Domestic"]);
        expect(domesticTableIds.length).to.be.at.least(1);

        // At least one table should be sandboxed (the Animals table we selected)
        const domesticValues = Object.values(viewData["Domestic"]);
        expect(domesticValues).to.include("sandboxed");

        // Wild schema should be blocked (it has no selected tables)
        expect(viewData["Wild"]).to.equal("blocked");

        // create-queries should allow query-builder for Domestic,
        // and be "no" for Wild (cascaded from blocked view-data)
        const createQueries = permissions["create-queries"];
        expect(createQueries["Domestic"]).to.equal("query-builder");
        expect(createQueries["Wild"]).to.equal("no");
      });

      H.main()
        .findByRole("listitem", {
          name: "Select data to make available",
          timeout: 10_000,
        })
        .icon("check")
        .should("exist");
    },
  );

  describe("connection impersonation step", () => {
    beforeEach(() => {
      H.restore("setup");
      cy.signInAsAdmin();
      H.activateToken("pro-self-hosted");

      H.updateSetting("use-tenants", true);

      cy.request("POST", "/api/collection", {
        name: "Shared collection",
        namespace: "shared-tenant-collection",
      }).then(({ body: collection }) => {
        H.createDashboard({
          name: "Test Dashboard",
          collection_id: collection.id,
        });
      });
    });

    it("should configure connection impersonation for selected databases", function () {
      H.addPostgresDatabase("QA Postgres12");

      cy.get<number>("@postgresID").then((postgresId) => {
        cy.visit("/embedding/get-started/permissions");

        H.main()
          .findByRole("radio", { name: /Connection impersonation/ })
          .scrollIntoView()
          .click();

        H.main()
          .findByRole("button", { name: "Use connection impersonation" })
          .scrollIntoView()
          .click();

        cy.log("open the database picker dropdown");
        H.main().findByPlaceholderText("Pick a database").click();

        H.popover().findByText("Sample Database").should("be.visible");

        cy.log(
          "sample database should have the info icon (does not support connection impersonation)",
        );
        H.popover()
          .findByText("Sample Database")
          .parent()
          .icon("info")
          .should("exist");

        H.popover().findByText("QA Postgres12").should("be.visible");

        cy.log(
          "postgres should not have the info icon (supports connection impersonation)",
        );
        H.popover()
          .findByText("QA Postgres12")
          .parent()
          .icon("info")
          .should("not.exist");

        cy.log("clicking disabled database should not close dropdown");
        H.popover().findByText("Sample Database").click();
        H.popover().should("be.visible");

        cy.log("hover over the info icon to see tooltip");
        H.popover()
          .findByText("Sample Database")
          .parent()
          .icon("info")
          .trigger("mouseenter");

        H.tooltip()
          .findByText("This database doesn't support connection impersonation")
          .should("be.visible");

        H.popover()
          .findByText("Sample Database")
          .parent()
          .icon("info")
          .trigger("mouseleave");
        H.tooltip().should("not.exist");

        cy.log("select database");
        H.popover().findByText("QA Postgres12").click();

        cy.log("database should be selected in the multi-select pill");
        H.main().findAllByLabelText("Remove").should("have.length", 1);
        H.main().findByText("QA Postgres12").should("be.visible");

        cy.log("setup connection impersonation for the database");
        H.main().findByRole("button", { name: "Next" }).click();

        cy.log("step should be marked as complete");
        H.main()
          .findByRole("listitem", {
            name: "Select data to make available",
            timeout: 10_000,
          })
          .icon("check")
          .should("exist");

        cy.log("connection impersonation policy should be created");
        cy.request("GET", "/api/ee/advanced-permissions/impersonation").should(
          (response) => {
            const policies = response.body;
            expect(policies.length).to.be.at.least(1);

            const postgresPolicy = policies.find(
              (policy: { db_id: number }) => policy.db_id === postgresId,
            );

            expect(postgresPolicy).to.exist;
            expect(postgresPolicy.attribute).to.equal("database_role");
          },
        );

        cy.log("permission graph should have impersonated view-data");
        cy.request(
          "GET",
          `/api/permissions/graph/group/${ALL_EXTERNAL_USERS_GROUP_ID}`,
        ).should((response) => {
          const graph = response.body;

          const permissions =
            graph.groups[ALL_EXTERNAL_USERS_GROUP_ID!][postgresId];

          expect(permissions).to.exist;
          expect(permissions["view-data"]).to.equal("impersonated");
          expect(permissions["create-queries"]).to.equal("query-builder");
        });
      });
    });
  });

  describe("sso setup sub-checklist", () => {
    beforeEach(() => {
      H.restore("setup");
      cy.signInAsAdmin();
      H.activateToken("pro-cloud");
    });

    it("can configure JWT auth and complete SSO setup", () => {
      cy.visit("/embedding/get-started");

      cy.log("jwt should be disabled by default");
      cy.request("GET", "/api/session/properties").then(({ body }) => {
        expect(body["jwt-enabled"]).to.equal(false);
      });

      cy.log("production embed step should be locked when JWT is not enabled");
      cy.findByTestId("embedding-hub-main")
        .findByText("Embed in production with SSO")
        .scrollIntoView()
        .should("be.visible")
        .closest('[data-testid="embedding-hub-checklist-card"]')
        .should("have.attr", "aria-disabled", "true")
        .realHover();

      cy.findByRole("tooltip").should("have.text", "Set up SSO to unlock");

      cy.visit("/embedding/get-started/sso");

      cy.log("Enable JWT button should be disabled when IdP URI is empty");
      cy.findByLabelText(/JWT Identity Provider URI/i)
        .should("be.visible")
        .should("be.empty");

      H.main()
        .findByRole("button", {
          name: "Enable JWT authentication and continue",
        })
        .should("be.visible")
        .should("be.disabled");

      cy.log("no steps should be completed initially");
      H.main().icon("check").should("not.exist");

      cy.log("step 1: enable JWT");
      H.main().within(() => {
        cy.findByLabelText(/JWT Identity Provider URI/i)
          .should("be.visible")
          .type("https://jwt.example.com/auth");

        cy.findByRole("button", {
          name: "Enable JWT authentication and continue",
        }).click();
      });

      cy.log("JWT should be enabled");
      cy.request("GET", "/api/session/properties").then(({ body }) => {
        expect(body["jwt-enabled"]).to.equal(true);
        expect(body["jwt-identity-provider-uri"]).to.equal(
          "https://jwt.example.com/auth",
        );
        expect(body["jwt-group-sync"]).to.equal(true);
      });

      cy.log("step 1 should be complete");
      H.main()
        .findByRole("listitem", { name: "Set up JWT authentication" })
        .should("have.attr", "data-completed", "true");

      cy.log("valid signing key should be shown");
      H.main().within(() => {
        cy.findByText(
          /This example code for Node.js sets up an endpoint using Express/,
        ).should("be.visible");

        cy.log("express.js code snippet should be shown inline");
        cy.contains("METABASE_JWT_SHARED_SECRET").should("exist");
        cy.contains("METABASE_INSTANCE_URL").should("exist");

        cy.findByRole("button", { name: "Next" }).scrollIntoView().click();
      });

      cy.log("step 2 should be complete");
      H.main()
        .findByRole("listitem", { name: "Add a new endpoint to your app" })
        .should("have.attr", "data-completed", "true");

      cy.log("step 3: confirm login works");
      H.main().within(() => {
        cy.findByText("Try logging in with SSO. Did it work?").should(
          "be.visible",
        );

        cy.findByRole("link", { name: "Log in works, I'm done" }).click();
      });

      cy.log("should go back to setup guide");
      cy.url().should("include", "/embedding/get-started");
      cy.url().should("not.include", "/sso");

      cy.log("'Configure SSO' card should be marked as done");
      cy.findByTestId("embedding-hub-main")
        .findByText("Set up SSO")
        .closest('[data-testid="embedding-hub-checklist-card"]')
        .scrollIntoView()
        .findByLabelText("Step 5 complete", { timeout: 10_000 })
        .should("be.visible");

      cy.log("'Embed in production with SSO' should now be unlocked");
      cy.findByTestId("embedding-hub-main")
        .findByText("Embed in production with SSO")
        .scrollIntoView()
        .should("be.visible")
        .closest('[data-testid="embedding-hub-checklist-card"]')
        .should("not.have.attr", "aria-disabled");
    });
  });
});
