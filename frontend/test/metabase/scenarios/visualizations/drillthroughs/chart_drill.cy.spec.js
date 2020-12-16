import {
  signInAsAdmin,
  restore,
  openProductsTable,
  openOrdersTable,
  popover,
  sidebar,
} from "__support__/cypress";

import { SAMPLE_DATASET } from "__support__/cypress_sample_dataset";

const { ORDERS, ORDERS_ID, PRODUCTS, PEOPLE_ID } = SAMPLE_DATASET;

describe("scenarios > visualizations > drillthroughs > chart drill", () => {
  beforeEach(() => {
    restore();
    signInAsAdmin();
  });

  it("should allow brush date filter", () => {
    cy.request("POST", "/api/card", {
      name: "Orders by Product → Created At (month) and Product → Category",
      dataset_query: {
        database: 1,
        query: {
          "source-table": ORDERS_ID,
          aggregation: [["count"]],
          breakout: [
            [
              "datetime-field",
              [
                "fk->",
                ["field-id", ORDERS.PRODUCT_ID],
                ["field-id", PRODUCTS.CREATED_AT],
              ],
              "month",
            ],
            [
              "fk->",
              ["field-id", ORDERS.PRODUCT_ID],
              ["field-id", PRODUCTS.CATEGORY],
            ],
          ],
        },
        type: "query",
      },
      display: "line",
      visualization_settings: {},
    }).then(response => {
      cy.visit(`/question/${response.body.id}`);

      // wait for chart to expand and display legend/labels
      cy.contains("Loading..."); // this gives more time to load
      cy.contains("Gadget");
      cy.contains("January, 2017");
      cy.wait(100); // wait longer to avoid grabbing the svg before a chart redraw

      // drag across to filter
      cy.get(".dc-chart svg")
        .trigger("mousedown", 100, 200)
        .trigger("mousemove", 200, 200)
        .trigger("mouseup", 200, 200);

      // new filter applied
      cy.contains("Created At between May, 2016 July, 2016");
      // more granular axis labels
      cy.contains("June, 2016");
      // confirm that product category is still broken out
      cy.contains("Gadget");
      cy.contains("Doohickey");
      cy.contains("Gizmo");
      cy.contains("Widget");
    });
  });

  it.skip("should allow drill-through on combined cards with different amount of series (metabase#13457)", () => {
    cy.log("**--1. Create the first question--**");

    cy.request("POST", "/api/card", {
      name: "13457_Q1",
      dataset_query: {
        database: 1,
        query: {
          "source-table": ORDERS_ID,
          aggregation: [["count"]],
          breakout: [
            ["datetime-field", ["field-id", ORDERS.CREATED_AT], "year"],
          ],
        },
        type: "query",
      },
      display: "line",
      visualization_settings: {},
    }).then(({ body: { id: Q1_ID } }) => {
      cy.log("**--2. Create the second question--**");

      cy.request("POST", "/api/card", {
        name: "13457_Q2",
        dataset_query: {
          database: 1,
          query: {
            "source-table": ORDERS_ID,
            aggregation: [
              ["avg", ["field-id", ORDERS.DISCOUNT]],
              ["avg", ["field-id", ORDERS.QUANTITY]],
            ],
            breakout: [
              ["datetime-field", ["field-id", ORDERS.CREATED_AT], "year"],
            ],
          },
          type: "query",
        },
        display: "line",
        visualization_settings: {},
      }).then(({ body: { id: Q2_ID } }) => {
        cy.log("**--3. Create a dashboard--**");

        cy.request("POST", "/api/dashboard", {
          name: "13457D",
        }).then(({ body: { id: DASHBOARD_ID } }) => {
          cy.log("**--4. Add the first question to the dashboard--**");

          cy.request("POST", `/api/dashboard/${DASHBOARD_ID}/cards`, {
            cardId: Q1_ID,
          }).then(({ body: { id: DASH_CARD_ID } }) => {
            cy.log(
              "**--5. Add additional series combining it with the second question--**",
            );

            cy.request("PUT", `/api/dashboard/${DASHBOARD_ID}/cards`, {
              cards: [
                {
                  id: DASH_CARD_ID,
                  card_id: Q1_ID,
                  row: 0,
                  col: 0,
                  sizeX: 16,
                  sizeY: 12,
                  series: [
                    {
                      id: Q2_ID,
                      model: "card",
                    },
                  ],
                  visualization_settings: {},
                  parameter_mappings: [],
                },
              ],
            });
          });

          cy.visit(`/dashboard/${DASHBOARD_ID}`);

          cy.log("**The first series line**");
          cy.get(".sub.enable-dots._0")
            .find(".dot")
            .eq(0)
            .click({ force: true });
          cy.findByText(/Zoom in/i);
          cy.findByText(/View these Orders/i);

          // Click anywhere else to close the first action panel
          cy.findByText("13457D").click();

          // Second line from the second question
          cy.log("**The third series line**");
          cy.get(".sub.enable-dots._2")
            .find(".dot")
            .eq(0)
            .click({ force: true });
          cy.findByText(/Zoom in/i);
          cy.findByText(/View these Orders/i);
        });
      });
    });
  });

  // this test was very flaky
  it.skip("should drill through a nested query", () => {
    // There's a slight hiccup in the UI with nested questions when we Summarize by City below.
    // Because there's only 5 rows, it automatically switches to the chart, but issues another
    // dataset request. So we wait for the dataset to load.
    cy.server();
    cy.route("POST", "/api/dataset").as("dataset");

    // save a question of people in CA
    cy.request("POST", "/api/card", {
      name: "CA People",
      display: "table",
      visualization_settings: {},
      dataset_query: {
        database: 1,
        query: { "source-table": PEOPLE_ID, limit: 5 },
        type: "query",
      },
    });

    // build a new question off that grouping by City
    cy.visit("/question/new");
    cy.contains("Simple question").click();
    cy.contains("Saved Questions").click();
    cy.contains("CA People").click();
    cy.contains("Hudson Borer");
    cy.contains("Summarize").click();
    cy.contains("Summarize by")
      .parent()
      .parent()
      .contains("City")
      .click();

    // wait for chart to load
    cy.wait("@dataset");
    cy.contains("Count by City");
    // drill into the first bar
    cy.get(".bar")
      .first()
      .click({ force: true });
    cy.contains("View this CA Person").click();

    // check that filter is applied and person displayed
    cy.contains("City is Beaver Dams");
    cy.contains("Dominique Leffler");
  });

  it.skip("should drill through a with date filter (metabase#12496)", () => {
    // save a question of orders by week
    cy.request("POST", "/api/card", {
      name: "Orders by Created At: Week",
      dataset_query: {
        database: 1,
        query: {
          "source-table": ORDERS_ID,
          aggregation: [["count"]],
          breakout: [["datetime-field", ORDERS.CREATED_AT, "week"]],
        },
        type: "query",
      },
      display: "line",
      visualization_settings: {},
    });

    // Load the question up
    cy.visit("/collection/root");
    cy.contains("Orders by Created At: Week").click({ force: true });
    cy.contains("January, 2019");

    // drill into a recent week
    cy.get(".dot")
      .eq(-4)
      .click({ force: true });
    cy.contains("View these Orders").click();

    // check that filter is applied and rows displayed
    cy.contains("Showing 127 rows");

    cy.log("**Filter should show the range between two dates**");
    // Now click on the filter widget to see if the proper parameters got passed in
    cy.contains("Created At between").click();
  });

  it.skip("should drill-through on filtered aggregated results (metabase#13504)", () => {
    openOrdersTable({ mode: "notebook" });
    cy.findByText("Summarize").click();
    cy.findByText("Count of rows").click();
    cy.findByText("Pick a column to group by").click();
    cy.findByText("Created At").click();

    // add filter: Count > 1
    cy.findByText("Filter").click();
    popover().within(() => {
      cy.findByText("Count").click();
      cy.findByText("Equal to").click();
    });
    cy.findByText("Greater than").click();
    cy.findByPlaceholderText("Enter a number")
      .click()
      .type("1");
    cy.findByText("Add filter").click();

    // Visualize: line
    cy.findByText("Visualize").click();
    cy.findByText("Visualization").click();
    cy.get(".Icon-line").click();
    cy.findByText("Done").click();
    cy.log("**Mid-point assertion**");
    cy.contains("Count by Created At: Month");
    // at this point, filter is displaying correctly with the name
    cy.contains("Count is greater than 1");

    // drill-through
    cy.get(".dot")
      .eq(10) // random dot
      .click({ force: true });
    cy.findByText("View these Orders").click();

    cy.log("**Reproduced on 0.34.3, 0.35.4, 0.36.7 and 0.37.0-rc2**");
    // when the bug is present, filter is missing a name (showing only "is 256")
    cy.contains("Count is equal to 256");
    cy.findByText("There was a problem with your question").should("not.exist");
  });

  it.skip("should display correct value in a tooltip for unaggregated data (metabase#11907)", () => {
    cy.request("POST", "/api/card", {
      name: "11907",
      dataset_query: {
        type: "native",
        native: {
          query:
            "SELECT parsedatetime('2020-01-01', 'yyyy-MM-dd') AS \"d\", 5 AS \"c\" UNION ALL\nSELECT parsedatetime('2020-01-01', 'yyyy-MM-dd') AS \"d\", 2 AS \"c\" UNION ALL\nSELECT parsedatetime('2020-01-01', 'yyyy-MM-dd') AS \"d\", 3 AS \"c\" UNION ALL\nSELECT parsedatetime('2020-01-02', 'yyyy-MM-dd') AS \"d\", 1 AS \"c\" UNION ALL\nSELECT parsedatetime('2020-01-02', 'yyyy-MM-dd') AS \"d\", 4 AS \"c\"",
          "template-tags": {},
        },
        database: 1,
      },
      display: "line",
      visualization_settings: {},
    }).then(({ body: { id: QUESTION_ID } }) => {
      cy.visit(`/question/${QUESTION_ID}`);

      clickLineDot({ index: 0 });
      popover().within(() => {
        cy.findByText("January 1, 2020");
        cy.findByText("10");
      });

      clickLineDot({ index: 1 });
      popover().within(() => {
        cy.findByText("January 2, 2020");
        cy.findByText("5");
      });
    });
  });

  describe("for an unsaved question", () => {
    before(() => {
      restore();
      signInAsAdmin();
      // Build a question without saving
      openProductsTable();
      cy.findByText("Summarize").click();
      sidebar().within(() => {
        cy.contains("Category").click();
      });

      // Drill-through the last bar (Widget)
      cy.get(".bar")
        .last()
        .click({ force: true });
      cy.findByText("View these Products").click();
    });

    // [quarantine] flaky
    it.skip("should result in a correct query result", () => {
      cy.log("**Assert that the URL is correct**");
      cy.url().should("include", "/question#");

      cy.log("**Assert on the correct product category: Widget**");
      cy.findByText("Category is Widget");
      cy.findByText("Gizmo").should("not.exist");
      cy.findByText("Doohickey").should("not.exist");
    });
  });
});

function clickLineDot({ index } = {}) {
  cy.get(".Visualization .dot")
    .eq(index)
    .click({ force: true });
}
