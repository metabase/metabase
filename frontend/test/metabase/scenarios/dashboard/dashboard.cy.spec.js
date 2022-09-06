import {
  popover,
  restore,
  selectDashboardFilter,
  expectedRouteCalls,
  editDashboard,
  showDashboardCardActions,
  filterWidget,
  sidebar,
  modal,
  openNewCollectionItemFlowFor,
  visitDashboard,
  appbar,
  rightSidebar,
} from "__support__/e2e/helpers";

import { SAMPLE_DB_ID } from "__support__/e2e/cypress_data";
import { SAMPLE_DATABASE } from "__support__/e2e/cypress_sample_database";

const { ORDERS, ORDERS_ID, PRODUCTS, PEOPLE, PEOPLE_ID } = SAMPLE_DATABASE;

function saveDashboard() {
  cy.findByText("Save").click();
  cy.findByText("You're editing this dashboard.").should("not.exist");
}

describe("scenarios > dashboard", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
  });

  it("should create new dashboard and navigate to it from the nav bar and from the root collection (metabase#20638)", () => {
    cy.visit("/");
    cy.findByText("New").click();
    cy.findByText("Dashboard").click();

    createDashboardUsingUI("Dash A", "Desc A");

    cy.findByText("This dashboard is looking empty.");
    cy.findByText("You're editing this dashboard.");

    // See it as a listed dashboard
    cy.visit("/collection/root?type=dashboard");
    cy.findByText("This dashboard is looking empty.").should("not.exist");
    cy.findByText("Dash A");

    cy.log(
      "should create new dashboard and navigate to it from the root collection (metabase#20638)",
    );

    openNewCollectionItemFlowFor("dashboard");

    createDashboardUsingUI("Dash B", "Desc B");

    cy.findByText("This dashboard is looking empty.");
    cy.findByText("You're editing this dashboard.");
  });

  it("should update the name and description", () => {
    cy.intercept("PUT", "/api/dashboard/1").as("updateDashboard");
    visitDashboard(1);

    cy.findByTestId("dashboard-name-heading")
      .click()
      .type("{selectall}Orders per year")
      .blur();

    cy.wait("@updateDashboard");

    cy.get("main header").within(() => {
      cy.icon("info").click();
    });

    rightSidebar().within(() => {
      cy.findByPlaceholderText("Add description")
        .click()
        .type("{selectall}How many orders were placed in each year?")
        .blur();
    });
    cy.wait("@updateDashboard");
    // refresh page and check that title/desc were updated
    visitDashboard(1);
    cy.findByDisplayValue("Orders per year");

    cy.get("main header").within(() => {
      cy.icon("info").click();
    });
    cy.findByDisplayValue("How many orders were placed in each year?");
  });

  it("should not take you out of edit mode when updating title", () => {
    cy.intercept("PUT", "/api/dashboard/1").as("updateDashboard");

    visitDashboard(1);

    cy.icon("pencil").click();
    cy.findByText("You're editing this dashboard.");

    cy.findByTestId("dashboard-name-heading")
      .click()
      .type("{selectall}Orders per year")
      .blur();

    saveDashboard();
    cy.wait("@updateDashboard");
  });

  it("should revert the title if editing is cancelled", () => {
    visitDashboard(1);

    cy.icon("pencil").click();
    cy.findByText("You're editing this dashboard.");

    cy.findByTestId("dashboard-name-heading")
      .click()
      .type("{selectall}Orders per year")
      .blur();

    cy.findByText("You're editing this dashboard.");

    cy.findByText("Cancel").click();
    cy.findByDisplayValue("Orders in a dashboard");
  });

  it("should allow empty card title (metabase#12013)", () => {
    visitDashboard(1);

    cy.findByTextEnsureVisible("Orders");
    cy.findByTestId("legend-caption").should("exist");

    editDashboard();
    showDashboardCardActions();
    cy.icon("palette").click();

    cy.findByDisplayValue("Orders").click().clear();
    cy.get("[data-metabase-event='Chart Settings;Done']").click();

    cy.findByTestId("legend-caption").should("not.exist");
  });

  it("should add a filter", () => {
    visitDashboard(1);
    cy.icon("pencil").click();
    cy.icon("filter").click();
    // Adding location/state doesn't make much sense for this case,
    // but we're testing just that the filter is added to the dashboard
    cy.findByText("Location").click();
    cy.findByText("Dropdown").click();
    cy.findByText("Select…").click();

    popover().within(() => {
      cy.findByText("State").click();
    });
    cy.icon("close");
    cy.get(".Button--primary").contains("Done").click();

    saveDashboard();

    cy.log("Assert that the selected filter is present in the dashboard");
    cy.icon("location");
    cy.findByText("Location");
  });

  it("should add a question", () => {
    visitDashboard(1);
    cy.icon("pencil").click();
    cy.get(".QueryBuilder-section .Icon-add").click();
    cy.findByText("Orders, Count").click();
    saveDashboard();

    cy.findByText("Orders, Count");
  });

  it("should link filters to custom question with filtered aggregate data (metabase#11007)", () => {
    // programatically create and save a question as per repro instructions in #11007
    cy.request("POST", "/api/card", {
      name: "11007",
      dataset_query: {
        database: SAMPLE_DB_ID,
        filter: [">", ["field", "sum", { "base-type": "type/Float" }], 100],
        query: {
          "source-table": ORDERS_ID,
          aggregation: [["sum", ["field", ORDERS.TOTAL, null]]],
          breakout: [
            ["field", ORDERS.CREATED_AT, { "temporal-unit": "day" }],
            ["field", PRODUCTS.ID, { "source-field": ORDERS.PRODUCT_ID }],
            ["field", PRODUCTS.CATEGORY, { "source-field": ORDERS.PRODUCT_ID }],
          ],
          filter: ["=", ["field", ORDERS.USER_ID, null], 1],
        },
        type: "query",
      },
      display: "table",
      visualization_settings: {},
    });

    cy.createDashboard({ name: "dash:11007" });

    cy.visit("/collection/root");
    // enter newly created dashboard
    cy.findByText("dash:11007").click();
    cy.findByText("This dashboard is looking empty.");
    // add previously created question to it
    cy.icon("pencil").click();
    cy.icon("add").last().click();
    cy.findByText("11007").click();

    // add first filter
    cy.icon("filter").click();
    popover().within(() => {
      cy.findByText("Time").click();
      cy.findByText("All Options").click();
    });
    // and connect it to the card
    selectDashboardFilter(cy.get(".DashCard"), "Created At");

    // add second filter
    cy.icon("filter").click();
    popover().within(() => {
      cy.findByText("ID").click();
    });
    // and connect it to the card
    selectDashboardFilter(cy.get(".DashCard"), "Product ID");

    // add third filter
    cy.icon("filter").click();
    popover().within(() => {
      cy.findByText("Text or Category").click();
      cy.findByText("Starts with").click();
    });
    // and connect it to the card
    selectDashboardFilter(cy.get(".DashCard"), "Category");

    cy.findByText("Save").click();
    cy.findByText("You're editing this dashboard.").should("not.exist");
  });

  it("should update a dashboard filter by clicking on a map pin (metabase#13597)", () => {
    cy.createQuestion({
      name: "13597",
      query: {
        "source-table": PEOPLE_ID,
        limit: 2,
      },
      display: "map",
    }).then(({ body: { id: questionId } }) => {
      cy.createDashboard().then(({ body: { id: dashboardId } }) => {
        // add filter (ID) to the dashboard
        cy.request("PUT", `/api/dashboard/${dashboardId}`, {
          parameters: [
            {
              id: "92eb69ea",
              name: "ID",
              sectionId: "id",
              slug: "id",
              type: "id",
            },
          ],
        });

        // add previously created question to the dashboard
        cy.request("POST", `/api/dashboard/${dashboardId}/cards`, {
          cardId: questionId,
        }).then(({ body: { id: dashCardId } }) => {
          // connect filter to that question
          cy.request("PUT", `/api/dashboard/${dashboardId}/cards`, {
            cards: [
              {
                id: dashCardId,
                card_id: questionId,
                row: 0,
                col: 0,
                size_x: 10,
                size_y: 8,
                parameter_mappings: [
                  {
                    parameter_id: "92eb69ea",
                    card_id: questionId,
                    target: ["dimension", ["field", PEOPLE.ID, null]],
                  },
                ],
                visualization_settings: {
                  // set click behavior to update filter (ID)
                  click_behavior: {
                    type: "crossfilter",
                    parameterMapping: {
                      "92eb69ea": {
                        id: "92eb69ea",
                        source: { id: "ID", name: "ID", type: "column" },
                        target: {
                          id: "92eb69ea",
                          type: "parameter",
                        },
                      },
                    },
                  },
                },
              },
            ],
          });
        });

        visitDashboard(dashboardId);
        cy.get(".leaflet-marker-icon") // pin icon
          .eq(0)
          .click({ force: true });
        cy.url().should("include", `/dashboard/${dashboardId}?id=1`);
        cy.contains("Hudson Borer - 1");
      });
    });
  });

  it("should display column options for cross-filter (metabase#14473)", () => {
    const questionDetails = {
      name: "14473",
      native: { query: "SELECT COUNT(*) FROM PRODUCTS", "template-tags": {} },
    };

    cy.createNativeQuestionAndDashboard({ questionDetails }).then(
      ({ body: { dashboard_id } }) => {
        cy.log("Add 4 filters to the dashboard");

        cy.request("PUT", `/api/dashboard/${dashboard_id}`, {
          parameters: [
            { name: "ID", slug: "id", id: "729b6456", type: "id" },
            { name: "ID 1", slug: "id_1", id: "bb20f59e", type: "id" },
            {
              name: "Category",
              slug: "category",
              id: "89873480",
              type: "category",
            },
            {
              name: "Category 1",
              slug: "category_1",
              id: "cbc045f2",
              type: "category",
            },
          ],
        });

        visitDashboard(dashboard_id);
      },
    );

    // Add cross-filter click behavior manually
    cy.icon("pencil").click();
    showDashboardCardActions();
    cy.icon("click").click();
    cy.findByText("COUNT(*)").click();
    cy.findByText("Update a dashboard filter").click();

    checkOptionsForFilter("ID");
    checkOptionsForFilter("Category");
  });

  it("should not get the parameter values from the field API", () => {
    // In this test we're using already present dashboard ("Orders in a dashboard")
    const FILTER_ID = "d7988e02";

    cy.log("Add filter to the dashboard");
    cy.request("PUT", "/api/dashboard/1", {
      parameters: [
        {
          id: FILTER_ID,
          name: "Category",
          slug: "category",
          type: "category",
        },
      ],
    });

    cy.log("Connect filter to the existing card");
    cy.request("PUT", "/api/dashboard/1/cards", {
      cards: [
        {
          id: 1,
          card_id: 1,
          row: 0,
          col: 0,
          size_x: 12,
          size_y: 8,
          parameter_mappings: [
            {
              parameter_id: FILTER_ID,
              card_id: 1,
              target: [
                "dimension",
                [
                  "field",
                  PRODUCTS.CATEGORY,
                  { "source-field": ORDERS.PRODUCT_ID },
                ],
              ],
            },
          ],
          visualization_settings: {},
        },
      ],
    });

    cy.server();
    cy.route(`/api/dashboard/1/params/${FILTER_ID}/values`).as(
      "fetchDashboardParams",
    );
    cy.route(`/api/field/${PRODUCTS.CATEGORY}`).as("fetchField");
    cy.route(`/api/field/${PRODUCTS.CATEGORY}/values`).as("fetchFieldValues");

    visitDashboard(1);

    filterWidget().as("filterWidget").click();

    ["Doohickey", "Gadget", "Gizmo", "Widget"].forEach(category => {
      cy.findByText(category);
    });

    expectedRouteCalls({ route_alias: "fetchDashboardParams", calls: 1 });
    expectedRouteCalls({ route_alias: "fetchField", calls: 0 });
    expectedRouteCalls({ route_alias: "fetchFieldValues", calls: 0 });
  });

  it("should be possible to visit a dashboard with click-behavior linked to the dashboard without permissions (metabase#15368)", () => {
    cy.request("GET", "/api/user/current").then(
      ({ body: { personal_collection_id } }) => {
        // Save new dashboard in admin's personal collection
        cy.request("POST", "/api/dashboard", {
          name: "15368D",
          collection_id: personal_collection_id,
        }).then(({ body: { id: NEW_DASHBOARD_ID } }) => {
          const COLUMN_REF = `["ref",["field-id",${ORDERS.ID}]]`;
          // Add click behavior to the existing "Orders in a dashboard" dashboard
          cy.request("PUT", "/api/dashboard/1/cards", {
            cards: [
              {
                id: 1,
                card_id: 1,
                row: 0,
                col: 0,
                size_x: 12,
                size_y: 8,
                series: [],
                visualization_settings: {
                  column_settings: {
                    [COLUMN_REF]: {
                      click_behavior: {
                        type: "link",
                        linkType: "dashboard",
                        parameterMapping: {},
                        targetId: NEW_DASHBOARD_ID,
                      },
                    },
                  },
                },
                parameter_mappings: [],
              },
            ],
          });

          cy.server();
          cy.route("GET", `/api/dashboard/${NEW_DASHBOARD_ID}`).as(
            "loadDashboard",
          );
        });
      },
    );
    cy.signInAsNormalUser();
    visitDashboard(1);

    cy.wait("@loadDashboard");
    cy.findByText("Orders in a dashboard");
    cy.contains("37.65");
  });

  it("should be possible to scroll vertically after fullscreen layer is closed (metabase#15596)", () => {
    // Make this dashboard card extremely tall so that it spans outside of visible viewport
    cy.request("PUT", "/api/dashboard/1/cards", {
      cards: [
        {
          id: 1,
          card_id: 1,
          row: 0,
          col: 0,
          size_x: 12,
          size_y: 20,
          series: [],
          visualization_settings: {},
          parameter_mappings: [],
        },
      ],
    });

    visitDashboard(1);
    cy.contains("37.65");
    assertScrollBarExists();
    cy.icon("share").click();
    cy.get(".Modal--full").within(() => {
      cy.icon("close").click();
    });
    cy.get(".Modal--full").should("not.exist");
    assertScrollBarExists();
  });

  it("should show values of added dashboard card via search immediately (metabase#15959)", () => {
    cy.intercept("GET", "/api/search*").as("search");
    visitDashboard(1);
    cy.icon("pencil").click();
    cy.icon("add").last().click();

    sidebar().within(() => {
      // From the list
      cy.findByText("Orders, Count").click();

      // From search
      cy.findByPlaceholderText("Search…").type("Orders{enter}");
      cy.wait("@search");
      cy.findByText("Orders, Count").click();
    });

    cy.findByTestId("loading-spinner").should("not.exist");
    cy.findAllByText("18,760").should("have.length", 2);
  });

  it("should show collection breadcrumbs for a dashboard", () => {
    visitDashboard(1);
    appbar().within(() => cy.findByText("Our analytics").click());

    cy.findByText("Orders").should("be.visible");
  });
});

function checkOptionsForFilter(filter) {
  cy.findByText("Available filters").parent().contains(filter).click();
  popover()
    .should("contain", "Columns")
    .and("contain", "COUNT(*)")
    .and("not.contain", "Dashboard filters");

  // Get rid of the open popover to be able to select another filter
  cy.findByText("Pick one or more filters to update").click();
}

function assertScrollBarExists() {
  cy.get("body").then($body => {
    const bodyWidth = $body[0].getBoundingClientRect().width;
    cy.window().its("innerWidth").should("be.gte", bodyWidth);
  });
}

function createDashboardUsingUI(name, description) {
  cy.intercept("POST", "/api/dashboard").as("createDashboard");

  modal().within(() => {
    // Without waiting for this, the test was constantly flaking locally.
    // It typed `est Dashboard`.
    cy.findByText("Our analytics");

    cy.findByLabelText("Name").type(name);
    cy.findByLabelText("Description").type(description);
    cy.findByText("Create").click();
  });

  cy.wait("@createDashboard").then(({ response: { body } }) => {
    cy.url().should("contain", `/dashboard/${body.id}`);
  });
}
