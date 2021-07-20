import {
  restore,
  openProductsTable,
  openOrdersTable,
  popover,
  sidebar,
  visitQuestionAdhoc,
} from "__support__/e2e/cypress";
import { USER_GROUPS } from "__support__/e2e/cypress_data";
import { SAMPLE_DATASET } from "__support__/e2e/cypress_sample_dataset";

const {
  ORDERS,
  ORDERS_ID,
  PRODUCTS,
  PRODUCTS_ID,
  PEOPLE,
  PEOPLE_ID,
} = SAMPLE_DATASET;
const { DATA_GROUP } = USER_GROUPS;

describe("scenarios > visualizations > drillthroughs > chart drill", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
  });

  it("should allow brush date filter", () => {
    cy.createQuestion({
      name: "Brush Date Filter",
      query: {
        "source-table": ORDERS_ID,
        aggregation: [["count"]],
        breakout: [
          [
            "field",
            PRODUCTS.CREATED_AT,
            { "source-field": ORDERS.PRODUCT_ID, "temporal-unit": "month" },
          ],
          ["field", PRODUCTS.CATEGORY, { "source-field": ORDERS.PRODUCT_ID }],
        ],
      },
      display: "line",
    }).then(response => {
      cy.visit(`/question/${response.body.id}`);

      // wait for chart to expand and display legend/labels
      cy.contains("Loading..."); // this gives more time to load
      cy.contains("Gadget");
      cy.contains("January, 2017");
      cy.wait(100); // wait longer to avoid grabbing the svg before a chart redraw

      // drag across to filter
      cy.get(".Visualization")
        .trigger("mousedown", 100, 200)
        .trigger("mousemove", 210, 200)
        .trigger("mouseup", 210, 200);

      // new filter applied
      // Note: Test was flaking because apparently mouseup doesn't always happen at the same position.
      //       It is enough that we assert that the filter exists and that it starts with May, 2016
      cy.contains(/^Created At between May, 2016/);
      // more granular axis labels
      cy.contains("June, 2016");
      // confirm that product category is still broken out
      cy.contains("Gadget");
      cy.contains("Doohickey");
      cy.contains("Gizmo");
      cy.contains("Widget");
    });
  });

  it("should correctly drill through on a card with multiple series (metabase#11442)", () => {
    cy.createQuestion({
      name: "11442_Q1",
      query: {
        "source-table": ORDERS_ID,
        aggregation: [["count"]],
        breakout: [["field", ORDERS.CREATED_AT, { "temporal-unit": "year" }]],
      },
      display: "line",
    }).then(({ body: { id: Q1_ID } }) => {
      cy.createQuestion({
        name: "11442_Q2",
        query: {
          "source-table": PRODUCTS_ID,
          aggregation: [["count"]],
          breakout: [
            ["field", PRODUCTS.CREATED_AT, { "temporal-unit": "year" }],
          ],
        },
        display: "line",
      }).then(({ body: { id: Q2_ID } }) => {
        cy.createDashboard("11442D").then(({ body: { id: DASHBOARD_ID } }) => {
          cy.log("Add the first question to the dashboard");

          cy.request("POST", `/api/dashboard/${DASHBOARD_ID}/cards`, {
            cardId: Q1_ID,
          }).then(({ body: { id: DASH_CARD_ID } }) => {
            cy.log(
              "Add additional series combining it with the second question",
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

          cy.log("The first series line");
          cy.get(".sub.enable-dots._0")
            .find(".dot")
            .eq(0)
            .click({ force: true });
          cy.findByText(/Zoom in/i);
          cy.findByText(/View these Orders/i);

          // Click anywhere else to close the first action panel
          cy.findByText("11442D").click();

          // Second line from the second question
          cy.log("The second series line");
          cy.get(".sub.enable-dots._1")
            .find(".dot")
            .eq(0)
            .click({ force: true });
          cy.findByText(/Zoom in/i);
          cy.findByText(/View these Products/i);
        });
      });
    });
  });

  it("should allow drill-through on combined cards with different amount of series (metabase#13457)", () => {
    cy.createQuestion({
      name: "13457_Q1",
      query: {
        "source-table": ORDERS_ID,
        aggregation: [["count"]],
        breakout: [["field", ORDERS.CREATED_AT, { "temporal-unit": "year" }]],
      },
      display: "line",
    }).then(({ body: { id: Q1_ID } }) => {
      cy.createQuestion({
        name: "13457_Q2",
        query: {
          "source-table": ORDERS_ID,
          aggregation: [
            ["avg", ["field", ORDERS.DISCOUNT, null]],
            ["avg", ["field", ORDERS.QUANTITY, null]],
          ],
          breakout: [["field", ORDERS.CREATED_AT, { "temporal-unit": "year" }]],
        },
        display: "line",
      }).then(({ body: { id: Q2_ID } }) => {
        cy.createDashboard("13457D").then(({ body: { id: DASHBOARD_ID } }) => {
          cy.log("Add the first question to the dashboard");

          cy.request("POST", `/api/dashboard/${DASHBOARD_ID}/cards`, {
            cardId: Q1_ID,
          }).then(({ body: { id: DASH_CARD_ID } }) => {
            cy.log(
              "Add additional series combining it with the second question",
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

          cy.log("The first series line");
          cy.get(".sub.enable-dots._0")
            .find(".dot")
            .eq(0)
            .click({ force: true });
          cy.findByText(/Zoom in/i);
          cy.findByText(/View these Orders/i);

          // Click anywhere else to close the first action panel
          cy.findByText("13457D").click();

          // Second line from the second question
          cy.log("The third series line");
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

    // People in CA
    cy.createQuestion({
      name: "CA People",
      query: { "source-table": PEOPLE_ID, limit: 5 },
    });
    // Build a new question off that grouping by City
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
    cy.createQuestion({
      name: "Orders by Created At: Week",
      query: {
        "source-table": ORDERS_ID,
        aggregation: [["count"]],
        breakout: [["field", ORDERS.CREATED_AT, { "temporal-unit": "week" }]],
      },
      display: "line",
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

    cy.log("Filter should show the range between two dates");
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
    cy.button("Visualize").click();
    cy.findByText("Visualization").click();
    cy.icon("line").click();
    cy.findByText("Done").click();
    cy.log("Mid-point assertion");
    cy.contains("Count by Created At: Month");
    // at this point, filter is displaying correctly with the name
    cy.contains("Count is greater than 1");

    // drill-through
    cy.get(".dot")
      .eq(10) // random dot
      .click({ force: true });
    cy.findByText("View these Orders").click();

    cy.log("Reproduced on 0.34.3, 0.35.4, 0.36.7 and 0.37.0-rc2");
    // when the bug is present, filter is missing a name (showing only "is 256")
    cy.contains("Count is equal to 256");
    cy.findByText("There was a problem with your question").should("not.exist");
  });

  it("should display correct value in a tooltip for unaggregated data (metabase#11907)", () => {
    cy.createNativeQuestion({
      name: "11907",
      native: {
        query:
          "SELECT parsedatetime('2020-01-01', 'yyyy-MM-dd') AS \"d\", 5 AS \"c\" UNION ALL\nSELECT parsedatetime('2020-01-01', 'yyyy-MM-dd') AS \"d\", 2 AS \"c\" UNION ALL\nSELECT parsedatetime('2020-01-01', 'yyyy-MM-dd') AS \"d\", 3 AS \"c\" UNION ALL\nSELECT parsedatetime('2020-01-02', 'yyyy-MM-dd') AS \"d\", 1 AS \"c\" UNION ALL\nSELECT parsedatetime('2020-01-02', 'yyyy-MM-dd') AS \"d\", 4 AS \"c\"",
        "template-tags": {},
      },
      display: "line",
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

  it("should display correct value in a tooltip for unaggregated data with breakouts (metabase#15785)", () => {
    visitQuestionAdhoc({
      dataset_query: {
        type: "native",
        native: {
          query:
            "select 1 as axis, 5 as value, 9 as breakout union all\nselect 2 as axis, 6 as value, 10 as breakout union all\nselect 2 as axis, 6 as value, 10 as breakout",
        },
        database: 1,
      },
      display: "bar",
      visualization_settings: {
        "graph.dimensions": ["AXIS", "BREAKOUT"],
        "graph.metrics": ["VALUE"],
      },
    });

    cy.get(".bar")
      .last()
      .trigger("mousemove");
    popover().findByText("12");
  });

  it.skip("should drill-through a custom question that joins a native SQL question (metabase#14495)", () => {
    // Restrict "normal user" (belongs to the DATA_GROUP) from writing native queries
    cy.log("Fetch permissions graph");
    cy.request("GET", "/api/permissions/graph", {}).then(
      ({ body: { groups, revision } }) => {
        // This mutates the original `groups` object => we'll pass it next to the `PUT` request
        groups[DATA_GROUP] = {
          // database_id = 1 (SAMPLE_DATASET)
          1: { schemas: "all", native: "none" },
        };

        cy.log("Update/save permissions");
        cy.request("PUT", "/api/permissions/graph", {
          groups,
          revision,
        });
      },
    );

    cy.createNativeQuestion({
      name: "14495_SQL",
      native: { query: "SELECT * FROM ORDERS", "template-tags": {} },
    }).then(({ body: { id: SQL_ID } }) => {
      const ALIAS = `Question ${SQL_ID}`;

      // Create a QB question and join it with the previously created native question
      cy.createQuestion({
        name: "14495",
        query: {
          "source-table": PEOPLE_ID,
          joins: [
            {
              fields: "all",
              "source-table": `card__${SQL_ID}`,
              condition: [
                "=",
                ["field", PEOPLE.ID, null],
                [
                  "field",
                  "ID",
                  { "base-type": "type/BigInteger", "join-alias": ALIAS },
                ],
              ],
              alias: ALIAS,
            },
          ],
          aggregation: [["count"]],
          breakout: [
            ["field", PEOPLE.CREATED_AT, { "temporal-unit": "month" }],
          ],
        },
        display: "bar",
      }).then(({ body: { id: QUESTION_ID } }) => {
        // Prepare to wait for certain imporatnt queries
        cy.server();
        cy.route("POST", `/api/card/${QUESTION_ID}/query`).as("cardQuery");
        cy.route("POST", "/api/dataset").as("dataset");

        // Switch to the normal user who has restricted SQL access
        cy.signInAsNormalUser();
        cy.visit(`/question/${QUESTION_ID}`);

        // Initial visualization has rendered and we can now drill-through
        cy.wait("@cardQuery");
        cy.get(".Visualization .bar")
          .eq(4)
          .click({ force: true });
        cy.findByText(/View these People/i).click();

        // We should see the resulting dataset of that drill-through
        cy.wait("@dataset").then(xhr => {
          expect(xhr.response.body.error).not.to.exist;
        });
        cy.findByText("Macy Olson");
      });
    });
  });

  it.skip("count of rows from drill-down on binned results should match the number of records (metabase#15324)", () => {
    visitQuestionAdhoc({
      name: "15324",
      dataset_query: {
        database: 1,
        query: {
          "source-table": ORDERS_ID,
          aggregation: [["count"]],
          breakout: [
            ["binning-strategy", ["field-id", ORDERS.QUANTITY], "num-bins", 10],
          ],
        },
        type: "query",
      },
      display: "table",
    });
    cy.findByText(/^10 –/)
      .closest(".TableInteractive-cellWrapper")
      .next()
      .contains("85")
      .click();
    cy.findByText("View these Orders").click();
    cy.findByText("Quantity between 10 20");
    cy.findByText("Showing 85 rows");
  });

  it("should drill through on a bin of null values (#11345)", () => {
    visitQuestionAdhoc({
      name: "11345",
      dataset_query: {
        database: 1,
        query: {
          "source-table": ORDERS_ID,
          aggregation: [["count"]],
          breakout: [
            ["field", ORDERS.DISCOUNT, { binning: { strategy: "default" } }],
          ],
        },
        type: "query",
      },
      display: "table",
    });

    // click on the Count column cell showing the count of null rows
    cy.findByText("16,845").click();
    cy.findByText("View these Orders").click();

    // count number of distinct values in the Discount column
    cy.findByText("Discount ($)").click();
    cy.findByText("Distincts").click();

    // there should be 0 distinct values since they are all null
    cy.get(".TableInteractive-cellWrapper").contains("0");
  });

  it("should parse value on click through on the first row of pie chart (metabase#15250)", () => {
    cy.createQuestion({
      name: "15250",
      query: {
        "source-table": PRODUCTS_ID,
        aggregation: [["count"]],
        breakout: [["field-id", PRODUCTS.CATEGORY]],
      },
      display: "pie",
    }).then(({ body: { id: QUESTION_ID } }) => {
      cy.createDashboard("15250D").then(({ body: { id: DASHBOARD_ID } }) => {
        cy.request("POST", `/api/dashboard/${DASHBOARD_ID}/cards`, {
          cardId: QUESTION_ID,
        }).then(({ body: { id: DASH_CARD_ID } }) => {
          // Add click through to the custom destination on a card
          cy.request("PUT", `/api/dashboard/${DASHBOARD_ID}/cards`, {
            cards: [
              {
                id: DASH_CARD_ID,
                card_id: QUESTION_ID,
                row: 0,
                col: 0,
                sizeX: 16,
                sizeY: 10,
                series: [],
                visualization_settings: {
                  click_behavior: {
                    type: "link",
                    linkType: "url",
                    linkTemplate: "question/{{count}}",
                  },
                },
                parameter_mappings: [],
              },
            ],
          });
        });

        cy.visit(`/dashboard/${DASHBOARD_ID}`);
      });
    });

    cy.findByTestId("pie-chart")
      .find("path")
      .first()
      .as("doohickeyChart")
      .trigger("mousemove");
    popover().within(() => {
      cy.findByText("Doohickey");
      cy.findByText("42");
    });
    cy.get("@doohickeyChart").click();
    cy.location("pathname").should("eq", "/question/42");
  });

  describe("for an unsaved question", () => {
    beforeEach(() => {
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
      cy.log("Assert that the URL is correct");
      cy.url().should("include", "/question#");

      cy.log("Assert on the correct product category: Widget");
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
