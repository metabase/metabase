// Mostly ported from `dashboard.e2e.spec.js`
// *** Haven't ported: should add the parameter values to state tree for public dashboards
import {
  popover,
  restore,
  signIn,
  signInAsAdmin,
  selectDashboardFilter,
  expectedRouteCalls,
} from "__support__/cypress";

import { SAMPLE_DATASET } from "__support__/cypress_sample_dataset";

const {
  ORDERS,
  ORDERS_ID,
  PRODUCTS,
  PRODUCTS_ID,
  PEOPLE,
  PEOPLE_ID,
} = SAMPLE_DATASET;

function saveDashboard() {
  cy.findByText("Save").click();
  cy.findByText("You're editing this dashboard.").should("not.exist");
}

describe("scenarios > dashboard", () => {
  beforeEach(() => {
    restore();
    signInAsAdmin();
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

  it("should update title and description", () => {
    cy.visit("/dashboard/1");
    cy.icon("ellipsis").click();
    cy.findByText("Change title and description").click();
    cy.findByLabelText("Name")
      .click()
      .clear()
      .type("Test Title");
    cy.findByLabelText("Description")
      .click()
      .clear()
      .type("Test description");

    cy.findByText("Update").click();
    cy.findByText("Test Title");
    cy.icon("info").click();
    cy.findByText("Test description");
  });

  it("should add a filter", () => {
    cy.visit("/dashboard/1");
    cy.icon("pencil").click();
    cy.icon("filter").click();
    // Adding location/state doesn't make much sense for this case,
    // but we're testing just that the filter is added to the dashboard
    cy.findByText("Location").click();
    cy.findByText("State").click();
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
    cy.findByText("State");
  });

  it("should add a question", () => {
    cy.visit("/dashboard/1");
    cy.icon("pencil").click();
    cy.get(".QueryBuilder-section .Icon-add").click();
    cy.findByText("Orders, Count").click();
    saveDashboard();

    cy.findByText("Orders, Count");
  });

  it("should duplicate a dashboard", () => {
    cy.visit("/dashboard/1");
    cy.findByText("Orders in a dashboard");
    cy.icon("ellipsis").click();
    cy.findByText("Duplicate").click();
    cy.findByLabelText("Name")
      .click()
      .clear()
      .type("Doppleganger");
    cy.get(".Button--primary")
      .contains("Duplicate")
      .click();

    cy.findByText("Orders in a dashboard").should("not.exist");
    cy.findByText("Doppleganger");
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

    // create a dashboard
    cy.request("POST", "/api/dashboard", {
      name: "dash:11007",
    });

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
      cy.findByText("Other Categories").click();
    });
    // and connect it to the card
    selectDashboardFilter(cy.get(".DashCard"), "Category");

    cy.findByText("Save").click();
    cy.findByText("You're editing this dashboard.").should("not.exist");
  });

  it.skip("should update a dashboard filter by clicking on a map pin (metabase#13597)", () => {
    // 1. create a question based on repro steps in #13597
    cy.request("POST", "/api/card", {
      name: "13597",
      dataset_query: {
        database: 1,
        query: {
          "source-table": PEOPLE_ID,
          limit: 2,
        },
        type: "query",
      },
      display: "map",
      visualization_settings: {},
    }).then(({ body: { id: questionId } }) => {
      // 2. create a dashboard
      cy.request("POST", "/api/dashboard", {
        name: "13597D",
      }).then(({ body: { id: dashboardId } }) => {
        // add filter (ID) to the dashboard
        cy.request("PUT", `/api/dashboard/${dashboardId}`, {
          parameters: [
            {
              id: "92eb69ea",
              name: "ID",
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
    cy.log("Create a question");

    cy.request("POST", "/api/card", {
      name: "14473",
      dataset_query: {
        type: "native",
        native: { query: "SELECT COUNT(*) FROM PRODUCTS", "template-tags": {} },
        database: 1,
      },
      display: "table",
      visualization_settings: {},
    }).then(({ body: { id: QUESTION_ID } }) => {
      cy.log("Create a dashboard");

      cy.request("POST", "/api/dashboard", {
        name: "14473D",
      }).then(({ body: { id: DASHBOARD_ID } }) => {
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
    cy.get(".DashCard .Icon-click").click({ force: true });
    cy.findByText("COUNT(*)").click();
    cy.findByText("Update a dashboard filter").click();

    checkOptionsForFilter("ID");
    checkOptionsForFilter("Category");
  });

  it.skip("should show QB question on a dashboard with filter connected to card without data-permission (metabase#12720)", () => {
    // In this test we're using already present question ("Orders") and the dashboard with that question ("Orders in a dashboard")
    cy.log(
      "Add filter to the dashboard with the default value (after January 1st, 2020)",
    );
    cy.request("PUT", "/api/dashboard/1", {
      parameters: [
        {
          default: "2020-01-01~",
          id: "d3b78b27",
          name: "Date Filter",
          slug: "date_filter",
          type: "date/all-options",
        },
      ],
    });

    cy.log("Create SQL question with a filter");

    cy.request("POST", "/api/card", {
      name: "12720_SQL",
      dataset_query: {
        type: "native",
        native: {
          query: "SELECT * FROM ORDERS WHERE {{filter}}",
          "template-tags": {
            filter: {
              id: "1d006bb7-045f-6c57-e41b-2661a7648276",
              name: "filter",
              "display-name": "Filter",
              type: "dimension",
              dimension: ["field", ORDERS.CREATED_AT, null],
              "widget-type": "date/month-year",
              default: null,
            },
          },
        },
        database: 1,
      },
      display: "table",
      visualization_settings: {},
    }).then(({ body: { id: SQL_ID } }) => {
      cy.log("Add SQL question to the dashboard");

      cy.request("POST", "/api/dashboard/1/cards", {
        cardId: SQL_ID,
      }).then(({ body: { id: SQL_DASH_CARD_ID } }) => {
        cy.log(
          "Edit both cards (adjust their size and connect them to the filter)",
        );

        cy.request("PUT", "/api/dashboard/1/cards", {
          cards: [
            {
              id: 1,
              card_id: 1,
              row: 0,
              col: 0,
              sizeX: 5,
              sizeY: 5,
              parameter_mappings: [
                {
                  parameter_id: "d3b78b27",
                  card_id: 1,
                  target: ["dimension", ["field", ORDERS.CREATED_AT, null]],
                },
              ],
              visualization_settings: {},
            },
            {
              id: SQL_DASH_CARD_ID,
              card_id: SQL_ID,
              row: 0,
              col: 6, // previous card's sizeX + 1 (making sure they don't overlap)
              sizeX: 5,
              sizeY: 5,
              parameter_mappings: [
                {
                  parameter_id: "d3b78b27",
                  card_id: SQL_ID,
                  target: ["dimension", ["template-tag", "filter"]],
                },
              ],
              visualization_settings: {},
            },
          ],
        });
      });
    });
    cy.server();
    cy.route("POST", "/api/card/*/query").as("cardQuery");

    signIn("nodata");

    clickThrough("12720_SQL");
    clickThrough("Orders");

    /**
     * Helper function related to this test only
     */
    function clickThrough(title) {
      cy.visit("/dashboard/1");
      cy.wait("@cardQuery.all");
      cy.get(".LegendItem")
        .contains(title)
        .click();
      cy.findByText(/^January 17, 2020/);
    }
  });

  it.skip("should cache filter results after the first DB call (metabase#13832)", () => {
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
    cy.route(`/api/dashboard/1/params/${FILTER_ID}/values`).as("fetchFromDB");

    cy.visit("/dashboard/1");

    cy.get("fieldset")
      .as("filterWidget")
      .click();
    expectedRouteCalls({ route_alias: "fetchFromDB", calls: 1 });

    // Make sure all filters were fetched (should be cached after this)
    ["Doohickey", "Gadget", "Gizmo", "Widget"].forEach(category => {
      cy.findByText(category);
    });

    // Get rid of the popover
    cy.findByText("Orders in a dashboard").click();

    cy.log(
      "Clicking on the filter again should NOT send another query to the source DB again! Results should have been cached by now.",
    );
    cy.get("@filterWidget").click();
    expectedRouteCalls({ route_alias: "fetchFromDB", calls: 1 });
  });

  it.skip("should not send additional card queries for all filters (metabase#13150)", () => {
    cy.log("Create a question");

    cy.request("POST", "/api/card", {
      name: "13150 (Products)",
      dataset_query: {
        database: 1,
        query: { "source-table": PRODUCTS_ID },
        type: "query",
      },
      display: "table",
      visualization_settings: {},
    }).then(({ body: { id: QUESTION_ID } }) => {
      cy.log("Create a dashboard");

      cy.request("POST", "/api/dashboard", {
        name: "13150D",
      }).then(({ body: { id: DASHBOARD_ID } }) => {
        cy.log("Add 3 filters to the dashboard");

        cy.request("PUT", `/api/dashboard/${DASHBOARD_ID}`, {
          parameters: [
            { name: "Title", slug: "title", id: "9f20a0d5", type: "category" },
            {
              name: "Category",
              slug: "category",
              id: "719fe1c2",
              type: "category",
            },
            { name: "Vendor", slug: "vendor", id: "a73b7c9", type: "category" },
          ],
        });

        cy.log("Add previously created qeustion to the dashboard");

        cy.request("POST", `/api/dashboard/${DASHBOARD_ID}/cards`, {
          cardId: QUESTION_ID,
        }).then(({ body: { id: DASH_CARD_ID } }) => {
          cy.log("Connect all filters to the card");

          cy.request("PUT", `/api/dashboard/${DASHBOARD_ID}/cards`, {
            cards: [
              {
                id: DASH_CARD_ID,
                card_id: QUESTION_ID,
                row: 0,
                col: 0,
                sizeX: 14,
                sizeY: 12,
                parameter_mappings: [
                  {
                    parameter_id: "9f20a0d5",
                    card_id: QUESTION_ID,
                    target: ["dimension", ["field", PRODUCTS.TITLE, null]],
                  },
                  {
                    parameter_id: "719fe1c2",
                    card_id: QUESTION_ID,
                    target: ["dimension", ["field", PRODUCTS.CATEGORY, null]],
                  },
                  {
                    parameter_id: "a73b7c9",
                    card_id: QUESTION_ID,
                    target: ["dimension", ["field", PRODUCTS.VENDOR, null]],
                  },
                ],
                visualization_settings: {},
              },
            ],
          });
          cy.server();
          cy.route("POST", `/api/card/${QUESTION_ID}/query`).as("cardQuery");

          cy.visit(
            `/dashboard/${DASHBOARD_ID}?title=Awesome Concrete Shoes&category=Widget&vendor=McClure-Lockman`,
          );

          cy.wait("@cardQuery.all");
          expectedRouteCalls({ route_alias: "cardQuery", calls: 1 });
        });
      });
    });
  });

  describe("revisions screen", () => {
    it("should open and close", () => {
      cy.visit("/dashboard/1");
      cy.icon("ellipsis").click();
      cy.findByText("Revision history").click();

      cy.get(".Modal").within(() => {
        cy.get(".LoadingSpinner").should("not.exist");
      });

      cy.findAllByText("Bobby Tables");
      cy.contains(/revert/i);

      cy.get(".Modal .Icon-close").click();
      cy.findAllByText("Bobby Tables").should("not.exist");
    });

    it("should open with url", () => {
      cy.visit("/dashboard/1/history");
      cy.get(".Modal").within(() => {
        cy.get(".LoadingSpinner").should("not.exist");
        cy.findByText("Revision history");
      });

      cy.findAllByText("Bobby Tables");
      cy.contains(/revert/i);
    });
  });

  it("should show sub-day resolutions in relative date filter (metabase#6660)", () => {
    cy.visit("/dashboard/1");
    cy.icon("pencil").click();
    cy.icon("filter").click();
    popover().within(() => {
      cy.findByText("Time").click();
      cy.findByText("All Options").click();
    });
    cy.findByText("No default").click();
    // click on Previous, to expand the relative date filter type dropdown
    cy.findByText("Previous").click();
    // choose Next, under which the new options should be available
    cy.findByText("Next").click();
    // click on Days (the default value), which should open the resolution dropdown
    cy.findByText("Days").click();
    // Hours should appear in the selection box (don't click it)
    cy.findByText("Hours");
    // Minutes should appear in the selection box; click it
    cy.findByText("Minutes").click();
    // also check the "Include this minute" checkbox
    // which is actually "Include" followed by "this minute" wrapped in <strong>, so has to be clicked this way
    cy.contains("Include this minute").click();
    // make sure the checkbox was checked
    cy.findByRole("checkbox").should("have.attr", "aria-checked", "true");
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
