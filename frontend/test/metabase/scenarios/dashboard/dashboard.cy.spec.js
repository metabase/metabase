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

    cy.createNativeQuestion({
      name: "12720_SQL",
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

    cy.signIn("nodata");

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

  it.skip("filter dropdown should not send request for values every time the widget is opened (metabase#16103)", () => {
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

    filterWidget()
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
    cy.createQuestion({
      name: "13150 (Products)",
      query: { "source-table": PRODUCTS_ID },
    }).then(({ body: { id: QUESTION_ID } }) => {
      cy.createDashboard("13150D").then(({ body: { id: DASHBOARD_ID } }) => {
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

  it("user without data permissions should be able to use dashboard filter (metabase#15119)", () => {
    cy.createQuestion({
      name: "15119",
      query: { "source-table": 1 },
    }).then(({ body: { id: QUESTION_ID } }) => {
      cy.createDashboard("15119D").then(({ body: { id: DASHBOARD_ID } }) => {
        // Add filter to the dashboard
        cy.request("PUT", `/api/dashboard/${DASHBOARD_ID}`, {
          parameters: [
            {
              name: "Category",
              slug: "category",
              id: "ad1c877e",
              type: "category",
            },
          ],
        });
        // Add card to the dashboard
        cy.request("POST", `/api/dashboard/${DASHBOARD_ID}/cards`, {
          cardId: QUESTION_ID,
        }).then(({ body: { id: DASH_CARD_ID } }) => {
          // Connect filter to the card
          cy.request("PUT", `/api/dashboard/${DASHBOARD_ID}/cards`, {
            cards: [
              {
                id: DASH_CARD_ID,
                card_id: QUESTION_ID,
                row: 0,
                col: 0,
                sizeX: 12,
                sizeY: 9,
                visualization_settings: {},
                parameter_mappings: [
                  {
                    parameter_id: "ad1c877e",
                    card_id: QUESTION_ID,
                    target: ["dimension", ["field-id", PRODUCTS.CATEGORY]],
                  },
                ],
              },
            ],
          });
        });

        cy.signIn("nodata");
        cy.visit(`/dashboard/${DASHBOARD_ID}`);

        filterWidget()
          .contains("Category")
          .click();
        cy.findByPlaceholderText("Search the list").type("Gizmo");
        cy.button("Add filter").click();

        cy.contains("Rustic Paper Wallet");
      });
    });
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

  it("filters should work even if one of them is corrupted (metabase #15279)", () => {
    const parameters = [
      {
        name: "List",
        slug: "list",
        id: "6fe14171",
        type: "category",
      },
      {
        name: "Search",
        slug: "search",
        id: "4db4913a",
        type: "category",
      },
      // This filter is corrupted because it's missing `name` and the `slug`
      {
        name: "",
        slug: "",
        id: "af72ce9c",
        type: "category",
      },
    ];

    cy.createQuestion({
      name: "15279",
      query: { "source-table": PEOPLE_ID },
    }).then(({ body: { id: QUESTION_ID } }) => {
      cy.createDashboard("15279D").then(({ body: { id: DASHBOARD_ID } }) => {
        // Add filters to the dashboard
        cy.request("PUT", `/api/dashboard/${DASHBOARD_ID}`, {
          parameters,
        });

        // Add previously created question to the dashboard
        cy.request("POST", `/api/dashboard/${DASHBOARD_ID}/cards`, {
          cardId: QUESTION_ID,
        }).then(({ body: { id: DASH_CARD_ID } }) => {
          // Connect filters to that question
          cy.request("PUT", `/api/dashboard/${DASHBOARD_ID}/cards`, {
            cards: [
              {
                id: DASH_CARD_ID,
                card_id: QUESTION_ID,
                row: 0,
                col: 0,
                sizeX: 18,
                sizeY: 8,
                series: [],
                visualization_settings: {},
                parameter_mappings: [
                  {
                    parameter_id: "6fe14171",
                    card_id: QUESTION_ID,
                    target: ["dimension", ["field-id", PEOPLE.SOURCE]],
                  },
                  {
                    parameter_id: "4db4913a",
                    card_id: QUESTION_ID,
                    target: ["dimension", ["field-id", PEOPLE.NAME]],
                  },
                ],
              },
            ],
          });
        });

        cy.visit(`/dashboard/${DASHBOARD_ID}`);
      });
    });

    // Check that list filter works
    filterWidget()
      .contains("List")
      .click();

    cy.findByPlaceholderText("Enter some text")
      .type("Organic")
      .blur();
    cy.button("Add filter").click();

    // Check that the search filter works
    filterWidget()
      .contains("Search")
      .click();
    cy.findByPlaceholderText("Search by Name").type("Lora Cronin");
    cy.button("Add filter").click();

    cy.findByText("Gold Beach");
    cy.findByText("Arcadia").should("not.exist");

    // The corrupted filter is now present in the UI, but it doesn't work (as expected)
    // People can now easily remove it
    cy.findByPlaceholderText("Enter a value...");
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

  it("dashboard filters should allow multiple selections (metabase#15689)", () => {
    cy.createQuestion({
      name: "15689",
      query: { "source-table": PEOPLE_ID },
    }).then(({ body: { id: QUESTION_ID } }) => {
      cy.createDashboard("15689D").then(({ body: { id: DASHBOARD_ID } }) => {
        // Add filter to the dashboard
        cy.request("PUT", `/api/dashboard/${DASHBOARD_ID}`, {
          parameters: [
            {
              name: "Location",
              slug: "location",
              id: "5aefc725",
              type: "string/=",
              sectionId: "location",
            },
          ],
        });
        // Add card to the dashboard
        cy.request("POST", `/api/dashboard/${DASHBOARD_ID}/cards`, {
          cardId: QUESTION_ID,
        }).then(({ body: { id: DASH_CARD_ID } }) => {
          // Connect filter to the card
          cy.request("PUT", `/api/dashboard/${DASHBOARD_ID}/cards`, {
            cards: [
              {
                id: DASH_CARD_ID,
                card_id: QUESTION_ID,
                row: 0,
                col: 0,
                sizeX: 12,
                sizeY: 9,
                visualization_settings: {},
                parameter_mappings: [
                  {
                    parameter_id: "5aefc725",
                    card_id: QUESTION_ID,
                    target: ["dimension", ["field", PEOPLE.STATE, null]],
                  },
                ],
              },
            ],
          });
        });

        cy.visit(`/dashboard/${DASHBOARD_ID}`);
      });
    });

    filterWidget().click();
    cy.findByText("AK").click();
    cy.findByText("CA").click();
    cy.icon("close")
      .as("close")
      .should("have.length", 2);
    cy.get("@close")
      .first()
      .closest("li")
      .contains("AK");
    cy.get("@close")
      .last()
      .closest("li")
      .contains("CA");
  });

  it("dashboard filters should not limit the number of search results (metabase#15695)", () => {
    // Change filtering on this field to "a list of all values"
    cy.request("PUT", `/api/field/${PRODUCTS.TITLE}`, {
      has_field_values: "list",
    });

    cy.createQuestion({
      name: "15695",
      query: { "source-table": PRODUCTS_ID },
    }).then(({ body: { id: QUESTION_ID } }) => {
      cy.createDashboard("15695D").then(({ body: { id: DASHBOARD_ID } }) => {
        // Add filter to the dashboard
        cy.request("PUT", `/api/dashboard/${DASHBOARD_ID}`, {
          parameters: [
            {
              name: "Text",
              slug: "text",
              id: "de9f36f0",
              type: "string/=",
              sectionId: "string",
            },
          ],
        });
        // Add card to the dashboard
        cy.request("POST", `/api/dashboard/${DASHBOARD_ID}/cards`, {
          cardId: QUESTION_ID,
        }).then(({ body: { id: DASH_CARD_ID } }) => {
          // Connect filter to the card
          cy.request("PUT", `/api/dashboard/${DASHBOARD_ID}/cards`, {
            cards: [
              {
                id: DASH_CARD_ID,
                card_id: QUESTION_ID,
                row: 0,
                col: 0,
                sizeX: 12,
                sizeY: 9,
                visualization_settings: {},
                parameter_mappings: [
                  {
                    parameter_id: "de9f36f0",
                    card_id: QUESTION_ID,
                    target: ["dimension", ["field", PRODUCTS.TITLE, null]],
                  },
                ],
              },
            ],
          });
        });
        cy.visit(`/dashboard/${DASHBOARD_ID}`);
      });
    });
    filterWidget().click();
    cy.findByPlaceholderText("Search the list").type("Syner");
    cy.findByText("Synergistic Wool Coat");
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
