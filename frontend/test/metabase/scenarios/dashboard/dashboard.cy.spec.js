import {
  popover,
  restore,
  selectDashboardFilter,
  expectedRouteCalls,
  showDashboardCardActions,
  modal,
  filterWidget,
} from "__support__/e2e/cypress";

import { SAMPLE_DATASET } from "__support__/e2e/cypress_sample_dataset";

const { ORDERS, ORDERS_ID, PRODUCTS, PEOPLE, PEOPLE_ID } = SAMPLE_DATASET;

function saveDashboard() {
  cy.findByText("Save").click();
  cy.findByText("You're editing this dashboard.").should("not.exist");
}

describe("scenarios > dashboard", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
  });

  it("should create new dashboard", () => {
    // Create dashboard
    cy.visit("/");
    cy.icon("add").click();
    cy.findByText("New dashboard").click();
    cy.findByLabelText("Name").type("Test Dash");
    cy.findByLabelText("Description").type("Desc");
    cy.findByText("Create").click();
    cy.findByText("This dashboard is looking empty.");

    // See it as a listed dashboard
    cy.visit("/collection/root?type=dashboard");
    cy.findByText("This dashboard is looking empty.").should("not.exist");
    cy.findByText("Test Dash");
  });

  it("should add a filter", () => {
    cy.visit("/dashboard/1");
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
    cy.get(".Button--primary")
      .contains("Done")
      .click();

    saveDashboard();

    cy.log("Assert that the selected filter is present in the dashboard");
    cy.icon("location");
    cy.findByText("Location");
  });

  it("should add a question", () => {
    cy.visit("/dashboard/1");
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
        database: 1,
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

    cy.createDashboard("dash:11007");

    cy.visit("/collection/root");
    // enter newly created dashboard
    cy.findByText("dash:11007").click();
    cy.findByText("This dashboard is looking empty.");
    // add previously created question to it
    cy.icon("pencil").click();
    cy.icon("add")
      .last()
      .click();
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
      cy.createDashboard("13597D").then(({ body: { id: dashboardId } }) => {
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
                sizeX: 10,
                sizeY: 8,
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

        cy.visit(`/dashboard/${dashboardId}`);
        cy.get(".leaflet-marker-icon") // pin icon
          .eq(0)
          .click({ force: true });
        cy.url().should("include", `/dashboard/${dashboardId}?id=1`);
        cy.contains("Hudson Borer - 1");
      });
    });
  });

  it("should display column options for cross-filter (metabase#14473)", () => {
    cy.createNativeQuestion({
      name: "14473",
      native: { query: "SELECT COUNT(*) FROM PRODUCTS", "template-tags": {} },
    }).then(({ body: { id: QUESTION_ID } }) => {
      cy.createDashboard("14473D").then(({ body: { id: DASHBOARD_ID } }) => {
        cy.log("Add 4 filters to the dashboard");

        cy.request("PUT", `/api/dashboard/${DASHBOARD_ID}`, {
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

        cy.log("Add previously created question to the dashboard");
        cy.request("POST", `/api/dashboard/${DASHBOARD_ID}/cards`, {
          cardId: QUESTION_ID,
        });

        cy.visit(`/dashboard/${DASHBOARD_ID}`);
      });
    });

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
          sizeX: 12,
          sizeY: 8,
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

    cy.visit("/dashboard/1");

    filterWidget()
      .as("filterWidget")
      .click();

    ["Doohickey", "Gadget", "Gizmo", "Widget"].forEach(category => {
      cy.findByText(category);
    });

    expectedRouteCalls({ route_alias: "fetchDashboardParams", calls: 1 });
    expectedRouteCalls({ route_alias: "fetchField", calls: 0 });
    expectedRouteCalls({ route_alias: "fetchFieldValues", calls: 0 });
  });

  it.skip("should be possible to visit a dashboard with click-behavior linked to the dashboard without permissions (metabase#15368)", () => {
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
                sizeX: 12,
                sizeY: 8,
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
    cy.visit("/dashboard/1");

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
          sizeX: 12,
          sizeY: 20,
          series: [],
          visualization_settings: {},
          parameter_mappings: [],
        },
      ],
    });

    cy.visit("/dashboard/1");
    cy.contains("37.65");
    assertScrollBarExists();
    cy.icon("share").click();
    cy.findByText("Sharing and embedding").click();
    // Fullscreen modal opens - close it now
    cy.icon("close").click();
    cy.get(".Modal--full").should("not.exist");
    assertScrollBarExists();
  });

  it.skip("should show values of added dashboard card via search immediately (metabase#15959)", () => {
    /**
     * For the reason I don't udnerstand, I could reproduce this issue ONLY if I use these specific functions in this order:
     *  1. realType()
     *  2. type()
     */
    cy.visit("/dashboard/1");
    cy.icon("pencil").click();
    cy.icon("add")
      .last()
      .as("addQuestion")
      .click();
    cy.icon("search")
      .last()
      .as("searchModal")
      .click();
    cy.findByPlaceholderText("Search").realType("Orders{enter}"); /* [1] */
    modal()
      .findByText("Orders, Count")
      .realClick();
    cy.get("@addQuestion").click();
    cy.get("@searchModal").click();
    cy.findByPlaceholderText("Search").type("Orders{enter}"); /* [2] */
    modal()
      .findByText("Orders, Count")
      .realClick();
    cy.get(".LoadingSpinner").should("not.exist");
    cy.findAllByText("18,760").should("have.length", 2);
  });
});

function checkOptionsForFilter(filter) {
  cy.findByText("Available filters")
    .parent()
    .contains(filter)
    .click();
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
    cy.window()
      .its("innerWidth")
      .should("be.gt", bodyWidth);
  });
}
