const { H } = cy;
import { SAMPLE_DB_ID } from "e2e/support/cypress_data";
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import { ALL_EXTERNAL_USERS_GROUP_ID } from "e2e/support/cypress_sample_instance_data";
import { JWT_SHARED_SECRET } from "e2e/support/helpers/e2e-jwt-helpers";

const { ORDERS_ID } = SAMPLE_DATABASE;

describe("managing dashboard from the dashboard's edit menu", () => {
  const QUERY_VALUE = "42";
  const CURATE_ACCESS_USERS = ["admin", "nodata"];
  const questionDetails = {
    name: "Q1",
    native: { query: `SELECT  '${QUERY_VALUE}' as ANSWER` },
    display: "scalar",
  };
  const dashboardName = "FooBar";

  beforeEach(() => {
    H.restore();
  });

  context("curate access", () => {
    CURATE_ACCESS_USERS.forEach((user) => {
      describe(`${user} user`, () => {
        beforeEach(() => {
          cy.signInAsAdmin();
          H.createNativeQuestionAndDashboard({
            questionDetails,
            dashboardDetails: { name: dashboardName },
          }).then(({ body: { dashboard_id } }) => {
            cy.wrap(dashboard_id).as("originalDashboardId");
            cy.intercept("GET", `/api/dashboard/${dashboard_id}*`).as(
              "getDashboard",
            );
            cy.intercept("PUT", `/api/dashboard/${dashboard_id}`).as(
              "updateDashboard",
            );

            cy.signIn(user);

            H.visitDashboard(dashboard_id);
            cy.findByTestId("scalar-value")
              .should("have.text", QUERY_VALUE)
              .and("be.visible");
            assertOnRequest("getDashboard");
          });

          H.openDashboardMenu();
        });

        it("should be able to change title and description", () => {
          cy.findByTestId("dashboard-name-heading").type("1").blur();
          assertOnRequest("updateDashboard");
          assertOnRequest("getDashboard");

          H.openDashboardInfoSidebar();

          H.sidesheet()
            .findByPlaceholderText("Add description")
            .type("Foo")
            .blur();
          H.closeDashboardInfoSidebar();

          assertOnRequest("updateDashboard");
          assertOnRequest("getDashboard");

          cy.reload();
          cy.findByTestId("scalar-value")
            .should("have.text", QUERY_VALUE)
            .and("be.visible");
          assertOnRequest("getDashboard");
          cy.findByDisplayValue(`${dashboardName}1`);
          H.openDashboardInfoSidebar();
          H.sidesheet().findByText("Foo").should("be.visible");
        });

        it("should shallow duplicate a dashboard but not its cards", () => {
          cy.get("@originalDashboardId").then((id) => {
            cy.intercept("POST", `/api/dashboard/${id}/copy`).as(
              "copyDashboard",
            );

            const newDashboardName = `${dashboardName} - Duplicate`;
            const { name: originalQuestionName } = questionDetails;
            const newQuestionName = `${originalQuestionName} - Duplicate`;
            const newDashboardId = id + 1;

            cy.log(
              "add virtual card to check shallow copy checkbox plays nicely",
            );
            H.addTextBox("Foo bar baz");
            H.saveDashboard();
            H.openDashboardMenu();

            H.popover().findByText("Duplicate").should("be.visible").click();
            cy.location("pathname").should("eq", `/dashboard/${id}/copy`);

            H.modal().within(() => {
              cy.findByRole("heading", {
                name: `Duplicate "${dashboardName}" and its questions`,
              });
              cy.findByDisplayValue(newDashboardName);
              cy.findByLabelText("Only duplicate the dashboard")
                .as("shallowCopyCheckbox")
                .should("not.be.checked")
                .should("not.be.disabled")
                .click();
              cy.get("@shallowCopyCheckbox").should("be.checked");
              cy.findByRole("heading", {
                name: `Duplicate "${dashboardName}"`,
              });
              cy.button("Duplicate").click();
            });
            assertOnRequest("copyDashboard");

            cy.url().should("contain", `/dashboard/${newDashboardId}`);

            cy.findByDisplayValue(newDashboardName);
            H.appBar().findByText("Our analytics").click();

            H.collectionTable().within(() => {
              cy.findByText(dashboardName).should("be.visible");
              cy.findByText(newDashboardName).should("be.visible");
              cy.findByText(originalQuestionName).should("be.visible");
              cy.findByText(newQuestionName).should("not.exist");
            });
          });
        });

        it("should deep duplicate a dashboard and its cards to the same and to a new collection", () => {
          cy.get("@originalDashboardId").then((id) => {
            cy.intercept("POST", `/api/dashboard/${id}/copy`).as(
              "copyDashboard",
            );
            const newDashboardName = `${dashboardName} - Duplicate`;
            const { name: originalQuestionName } = questionDetails;
            const newQuestionName = `${originalQuestionName} - Duplicate`;
            const newDashboardId = id + 1;

            H.popover().findByText("Duplicate").should("be.visible").click();
            cy.location("pathname").should("eq", `/dashboard/${id}/copy`);

            H.modal().within(() => {
              cy.findByRole("heading", {
                name: `Duplicate "${dashboardName}" and its questions`,
              });
              cy.findByDisplayValue(newDashboardName);
              cy.findByLabelText("Only duplicate the dashboard").should(
                "not.be.checked",
              );
              cy.icon("info").realHover();
            });

            H.tooltip().should(
              "contain.text",
              "If you check this, the cards in the duplicated dashboard will reference the original questions.",
            );

            H.modal().button("Duplicate").click();
            assertOnRequest("copyDashboard");

            cy.url().should("contain", `/dashboard/${newDashboardId}`);

            cy.findByDisplayValue(newDashboardName);
            H.appBar().findByText("Our analytics").click();

            H.collectionTable().within(() => {
              cy.findByText(dashboardName).should("be.visible");
              cy.findByText(newDashboardName).should("be.visible");
              cy.findByText(originalQuestionName).should("be.visible");
              cy.findByText(newQuestionName).should("be.visible");
            });

            cy.log("deep duplicate to a collection created on the go");
            const newCollectionDashboardId = id + 2;
            const newCollectionQuestionName = originalQuestionName;

            H.visitDashboard(id);
            H.openDashboardMenu();
            H.popover().findByText("Duplicate").should("be.visible").click();
            cy.location("pathname").should("eq", `/dashboard/${id}/copy`);

            H.modal().within(() => {
              cy.findByRole("heading", {
                name: `Duplicate "${dashboardName}" and its questions`,
              });
              cy.findByDisplayValue(newDashboardName);
              cy.findByLabelText("Only duplicate the dashboard").should(
                "not.be.checked",
              );
              cy.findByTestId("collection-picker-button").click();
            });

            H.entityPickerModal()
              .findByText("New collection")
              .should("be.visible")
              .click();
            const NEW_COLLECTION = "Foo Collection";
            H.collectionOnTheGoModal().within(() => {
              cy.findByPlaceholderText("My new collection").type(
                NEW_COLLECTION,
              );
              cy.button("Create").click();
            });
            cy.button("Select").click();
            cy.button("Duplicate").click();
            assertOnRequest("copyDashboard");

            cy.url().should(
              "contain",
              `/dashboard/${newCollectionDashboardId}`,
            );

            cy.findByDisplayValue(newDashboardName);
            H.appBar().findByText(NEW_COLLECTION).click();
            H.collectionTable().within(() => {
              cy.findByText(newDashboardName).should("be.visible");
              cy.findByText(newCollectionQuestionName).should("be.visible");
              cy.findByText(newQuestionName).should("not.exist");
            });

            H.openNavigationSidebar();
            H.navigationSidebar().findByText("Our analytics").click();
            H.collectionTable().within(() => {
              cy.findByText(dashboardName).should("be.visible");
              cy.findByText(originalQuestionName).should("be.visible");
            });
          });
        });

        it("should be able to move/undo move a dashboard (metabase#13059, metabase#25705)", () => {
          cy.get("@originalDashboardId").then((id) => {
            H.appBar().contains("Our analytics");

            H.popover().findByText("Move").click();
            cy.location("pathname").should("eq", `/dashboard/${id}/move`);

            H.entityPickerModal().within(() => {
              cy.findByText("Our analytics").click();
              cy.findByText("First collection").click();
              cy.button("Move").click();
            });

            assertOnRequest("updateDashboard");
            H.getDashboardCard().contains("42");

            cy.log(
              "it should update dashboard's collection after the move without the page reload (metabase#13059)",
            );
            H.appBar().contains("First collection");
            H.appBar().should("not.contain", "Our analytics");

            H.undoToast().within(() => {
              cy.contains("Dashboard moved to First collection");
              cy.button("Undo").click();
            });
            assertOnRequest("updateDashboard");

            H.appBar().contains("Our analytics");
            H.appBar().should("not.contain", "First collection");
          });
        });

        it("should be able to archive/unarchive a dashboard", () => {
          cy.get("@originalDashboardId").then((id) => {
            H.popover()
              .findByText("Move to trash")
              .should("be.visible")
              .click();

            cy.location("pathname").should("eq", `/dashboard/${id}/archive`);
            H.modal().within(() => {
              cy.findByRole("heading", {
                name: "Move this dashboard to trash?",
              }); //Without this, there is some race condition and the button click fails
              cy.button("Move to trash").click();
            });
            assertOnRequest("updateDashboard");

            cy.location("pathname").should("eq", `/dashboard/${id}`);

            cy.findByTestId("archive-banner").should("exist");

            H.undoToast().within(() => {
              cy.findByText("FooBar has been moved to the trash.");
              cy.button("Undo").click();
            });
            assertOnRequest("updateDashboard");

            cy.visit("/collection/root");
            cy.findAllByTestId("collection-entry-name").should(
              "contain",
              dashboardName,
            );
          });
        });
      });
    });
  });
});

describe("scenarios > dashboard > auto-refresh", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
  });

  it("should re-run the card queries on auto-refresh (metabase#12578)", () => {
    cy.clock(Date.now());
    H.createQuestionAndDashboard({
      questionDetails: {
        name: "Orders Count",
        query: {
          "source-table": ORDERS_ID,
          aggregation: [["count"]],
        },
      },
    }).then(({ body: { dashboard_id } }) => {
      cy.intercept("GET", `/api/dashboard/${dashboard_id}*`).as(
        "dashboardLoad",
      );
      H.visitDashboard(dashboard_id);
    });

    // Without tick the dashboard header will not load
    cy.tick();
    H.openDashboardMenu("Auto-refresh");
    H.popover().findByText("1 minute").click();

    cy.intercept("POST", "/api/dashboard/*/dashcard/*/card/*/query").as(
      "dashcardQuery",
    );

    cy.tick(61 * 1000);
    cy.wait("@dashcardQuery");
    cy.get("@dashcardQuery.all").should("have.length", 1);
    H.getDashboardCard().findByText("18,760").should("be.visible");
    cy.get("@dashboardLoad.all").should("have.length", 1);
  });
});

describe("scenarios > dashboard > tenant question picker", () => {
  const TENANT_USER = {
    first_name: "acme",
    last_name: "user",
    email: "acme.user@email.com",
    "@tenant": "acme",
  };

  const loginAsTenantUser = (returnTo) => {
    cy.task("signJwt", {
      payload: TENANT_USER,
      secret: JWT_SHARED_SECRET,
    }).then((key) =>
      cy.visit(
        `/auth/sso?return_to=${encodeURIComponent(returnTo)}&jwt=${key}`,
      ),
    );
  };

  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
    H.activateToken("pro-self-hosted");

    cy.request("PUT", "/api/setting", {
      "jwt-attribute-email": "email",
      "jwt-attribute-firstname": "first_name",
      "jwt-attribute-lastname": "last_name",
      "jwt-enabled": true,
      "jwt-identity-provider-uri": "localhost:4000",
      "jwt-shared-secret": JWT_SHARED_SECRET,
      "jwt-user-provisioning-enabled?": true,
      "use-tenants": true,
    });

    cy.request("POST", "/api/ee/tenant", {
      name: "Acme",
      slug: "acme",
    })
      .its("body")
      .as("tenant");

    // Lets tenant users see the results of the question they add.
    cy.updatePermissionsGraph({
      [ALL_EXTERNAL_USERS_GROUP_ID]: {
        [SAMPLE_DB_ID]: {
          "view-data": "unrestricted",
        },
      },
    });

    H.createSharedTenantCollection("Finance");
    H.createSharedTenantCollection("Marketing");

    cy.get("@tenant")
      .then(({ tenant_collection_id }) =>
        H.createCollection({
          name: "Tenant questions",
          parent_id: tenant_collection_id,
        }),
      )
      .its("body")
      .as("tenantCollection");

    cy.get("@tenantCollection").then((tenantCollection) =>
      H.createQuestion({
        name: "Tenant orders",
        collection_id: tenantCollection.id,
        query: { "source-table": ORDERS_ID },
      }),
    );
  });

  // The backend decides which collections a tenant user can see, so this
  // test needs a real tenant user. The unit tests in
  // AddCardSidebar.tenants.unit.spec.tsx cover the tree with mocked endpoints.
  it("shows tenant users a flattened collection tree and lets them add a question (EMB-2312)", () => {
    cy.log("as an admin, from a dashboard in the tenant-specific collection");
    cy.get("@tenant")
      .then(({ tenant_collection_id }) =>
        H.createDashboard({
          name: "Admin tenant dashboard",
          collection_id: tenant_collection_id,
        }),
      )
      .its("body")
      .then(({ id }) => H.visitDashboard(id));
    H.editDashboard();
    H.openQuestionsSidebar();

    H.sidebar()
      .findByTestId("breadcrumbs")
      .should("contain", "Acme")
      .and("not.contain", "Unknown");

    cy.get("@tenantCollection")
      .then(({ id }) =>
        H.createDashboard({
          name: "Tenant dashboard",
          collection_id: id,
        }),
      )
      .its("body")
      .as("tenantDashboard");

    // Tenant users do not know what is a 'Tenant-specific collection' or 'Shared collection'.
    // Only show a flattened structure for them, with "Our data" being their tenant collection.
    cy.log("from a dashboard in the tenant collection");
    cy.get("@tenantDashboard").then(({ id }) => {
      loginAsTenantUser(`/dashboard/${id}`);
    });
    H.editDashboard();
    H.openQuestionsSidebar();

    H.sidebar()
      .findByTestId("breadcrumbs")
      .should("contain", "Collections")
      .and("contain", "Our data");

    H.sidebar().findByTestId("breadcrumbs").findByText("Collections").click();

    H.sidebar().findByText("Our data").should("be.visible");
    H.sidebar().findByText("Finance").should("be.visible");
    H.sidebar().findByText("Marketing").should("be.visible");
    H.sidebar().findByText("Our analytics").should("not.exist");
    H.sidebar().findByText("Shared collections").should("not.exist");
    H.sidebar().findByText("Tenant collections").should("not.exist");

    cy.log("add a question from the tenant collection and save");
    H.sidebar().findByText("Our data").click();
    H.sidebar().findByText("Tenant questions").click();
    H.sidebar().findByText("Tenant orders").click();

    H.getDashboardCards()
      .should("have.length", 1)
      .and("contain", "Tenant orders");
    H.saveDashboard();

    cy.reload();
    H.getDashboardCards()
      .should("have.length", 1)
      .and("contain", "Tenant orders")
      .and("not.contain", "Sorry, you don't have permission to see this card.");

    // The API omits 'Our analytics' when tenant users cannot read it, but it still
    // returns their personal collection. Show that collection directly under the
    // synthetic collections level instead of adding another 'collections' folder.
    cy.log("from a dashboard in the personal collection");
    cy.request("GET", "/api/user/current").its("body").as("tenantUser");

    cy.get("@tenantUser")
      .then(({ personal_collection_id }) => {
        if (personal_collection_id == null) {
          throw new Error("Tenant user has no personal collection");
        }

        return H.createDashboard({
          name: "Personal dashboard",
          collection_id: personal_collection_id,
        });
      })
      .its("body")
      .as("personalDashboard");

    cy.intercept({
      method: "GET",
      pathname: "/api/collection/tree",
      query: {
        namespace: "shared-tenant-collection",
        "exclude-archived": "true",
      },
    }).as("sharedTenantCollections");

    cy.get("@personalDashboard").then(({ id }) => {
      H.visitDashboard(id);
    });
    H.editDashboard();
    H.openQuestionsSidebar();

    cy.wait("@sharedTenantCollections");

    H.sidebar()
      .findByTestId("breadcrumbs")
      .should("contain", "Collections")
      .and("contain", "My personal collection");

    H.sidebar().findByTestId("breadcrumbs").findByText("Collections").click();

    H.sidebar()
      .findByRole("menuitem", { name: "My personal collection" })
      .should("be.visible");

    // There should not be a second nested "Collections" folder.
    H.sidebar()
      .findByTestId("breadcrumbs")
      .findAllByText("Collections")
      .should("have.length", 1);

    H.sidebar()
      .findByRole("menuitem", { name: "Collections" })
      .should("not.exist");
  });
});

describe("issue 48878", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
    H.setActionsEnabledForDB(SAMPLE_DB_ID);

    cy.intercept("POST", "/api/dataset").as("dataset");
    cy.intercept("POST", "/api/card").as("saveQuestion");
    cy.intercept("POST", "/api/action").as("createAction");
    cy.intercept("GET", "/api/dashboard/*").as("getDashboard");
    cy.intercept("PUT", "/api/dashboard/*").as("updateDashboard");

    cy.intercept("GET", "/api/card/*").as("fetchCard");
    setup();
  });

  // I could only reproduce this issue in Cypress when I didn't use any helpers like createQuestion, etc.
  it("does not crash the action button viz (metabase#48878)", () => {
    cy.reload();
    H.getDashboardCard(0).findByText("Click Me").should("be.visible");
  });

  function setup() {
    cy.log("create model");

    createModel({
      name: "SQL Model",
      query: "select * from orders limit 5",
    });

    cy.log("create model action");

    cy.findByTestId("qb-header-info-button").click();
    H.sidesheet().findByText("Actions").click();

    cy.findByTestId("model-actions-header").findByText("New action").click();

    H.modal().within(() => {
      H.NativeEditor.focus().type("UPDATE orders SET plan = {{ plan ", {
        parseSpecialCharSequences: false,
      });
      cy.button("Save").click();
    });

    // eslint-disable-next-line metabase/no-unsafe-element-filtering
    H.modal()
      .last()
      .within(() => {
        cy.findByPlaceholderText("My new fantastic action").type("Test action");
        cy.button("Create").click();
        cy.wait("@createAction");
      });

    cy.visit("/");

    cy.log("create dashoard");

    cy.button("New").click();
    H.popover().findByText("Dashboard").click();

    H.modal().within(() => {
      cy.findByPlaceholderText("What is the name of your dashboard?").type(
        "Dash",
      );
      cy.button("Create").click();
      cy.wait("@getDashboard");
    });

    cy.button("Add action").click();
    cy.button("Pick an action").click();
    H.modal().within(() => {
      cy.findByText("SQL Model").click();
      cy.findByText("Test action").click();
      cy.button("Done").click();
    });
    cy.button("Save").click();
    cy.wait("@updateDashboard");
  }

  function createModel({ name, query }) {
    cy.visit("/model/new");
    cy.findByTestId("new-model-options")
      .findByText("Use a native query")
      .click();

    H.NativeEditor.focus().type(query);
    cy.findByTestId("native-query-editor-container")
      .findByTestId("run-button")
      .click();
    cy.wait("@dataset");
    cy.button("Save").click();

    H.modal().within(() => {
      cy.findByPlaceholderText("What is the name of your model?").type(name);
      cy.button("Save").click();
      cy.wait("@saveQuestion");
    });
    cy.wait("@fetchCard");
  }
});

function assertOnRequest(alias) {
  cy.wait(`@${alias}`).its("response.statusCode").should("not.eq", 403);
  cy.findByText("Sorry, you don’t have permission to see that.").should(
    "not.exist",
  );
  H.modal().should("not.exist");
}
