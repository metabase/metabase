import {
  restore,
  openProductsTable,
  openOrdersTable,
  popover,
  sidebar,
  visitQuestionAdhoc,
  visualize,
  summarize,
  visitQuestion,
  visitDashboard,
  startNewQuestion,
  addOrUpdateDashboardCard,
  addSummaryField,
} from "e2e/support/helpers";

import { USER_GROUPS, SAMPLE_DB_ID } from "e2e/support/cypress_data";
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";

const { ORDERS, ORDERS_ID, PRODUCTS, PRODUCTS_ID, PEOPLE, PEOPLE_ID } =
  SAMPLE_DATABASE;
const { DATA_GROUP } = USER_GROUPS;

describe("scenarios > visualizations > drillthroughs > chart drill", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
  });

  it("should allow brush date filter", () => {
    cy.createQuestion(
      {
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
      },
      { visitQuestion: true },
    );

    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.contains("Gadget");
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.contains("January 2023");
    cy.wait(100); // wait longer to avoid grabbing the svg before a chart redraw

    // drag across to filter
    cy.get(".Visualization")
      .trigger("mousedown", 120, 200)
      .trigger("mousemove", 230, 200)
      .trigger("mouseup", 230, 200);

    // new filter applied
    // Note: Test was flaking because apparently mouseup doesn't always happen at the same position.
    //       It is enough that we assert that the filter exists and that it starts with May 2022.
    //       The date range formatter sometimes omits the year of the first month (e.g. May–July 2022),
    //       so checking that 2022 occurs after May ensures that May 2022 is in fact the first date.
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.contains(/^Created At is May.*2022/);
    // more granular axis labels
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.contains("June 2022");
    // confirm that product category is still broken out
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.contains("Gadget");
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.contains("Doohickey");
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.contains("Gizmo");
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.contains("Widget");
  });

  ["month", "month-of-year"].forEach(granularity => {
    it(`brush filter should work post-aggregation for ${granularity} granularity (metabase#18011)`, () => {
      // TODO: Remove this line when the issue is fixed!
      cy.skipOn(granularity === "month-of-year");

      cy.intercept("POST", "/api/dataset").as("dataset");

      const questionDetails = {
        name: "18011",
        database: SAMPLE_DB_ID,
        query: {
          "source-table": PRODUCTS_ID,
          aggregation: [["count"]],
          breakout: [
            ["field", PRODUCTS.CREATED_AT, { "temporal-unit": granularity }],
            ["field", PRODUCTS.CATEGORY, null],
          ],
        },
        display: "line",
      };

      cy.createQuestion(questionDetails, { visitQuestion: true });

      cy.get(".Visualization")
        .trigger("mousedown", 240, 200)
        .trigger("mousemove", 420, 200)
        .trigger("mouseup", 420, 200);

      cy.wait("@dataset");

      granularity === "month"
        ? // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
          cy.findByText("Created At is September 2022 – February 2023")
        : // Once the issue gets fixed, figure out the positive assertion for the "month-of-year" granularity
          null;

      cy.get("circle");
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
        cy.createDashboard({ name: "11442D" }).then(
          ({ body: { id: DASHBOARD_ID } }) => {
            cy.log("Add the first question to the dashboard");

            addOrUpdateDashboardCard({
              card_id: Q1_ID,
              dashboard_id: DASHBOARD_ID,
              card: {
                size_x: 21,
                size_y: 12,
                // Add additional series combining it with the second question
                series: [
                  {
                    id: Q2_ID,
                    model: "card",
                  },
                ],
              },
            });

            visitDashboard(DASHBOARD_ID);

            cy.log("The first series line");
            cy.get(".sub.enable-dots._0")
              .find(".dot")
              .eq(0)
              .click({ force: true });
            cy.findByText("See this year by quarter");
            cy.findByText("See these Orders");

            // Click anywhere else to close the first action panel
            cy.findByText("11442D").click();

            // Second line from the second question
            cy.log("The second series line");
            cy.get(".sub.enable-dots._1")
              .find(".dot")
              .eq(0)
              .click({ force: true });
            cy.findByText("See this year by quarter");
            cy.findByText("See these Products");
          },
        );
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
        cy.createDashboard({ name: "13457D" }).then(
          ({ body: { id: DASHBOARD_ID } }) => {
            cy.log("Add the first question to the dashboard");

            addOrUpdateDashboardCard({
              card_id: Q1_ID,
              dashboard_id: DASHBOARD_ID,
              card: {
                size_x: 21,
                size_y: 12,
                // Add additional series combining it with the second question
                series: [
                  {
                    id: Q2_ID,
                    model: "card",
                  },
                ],
              },
            });

            visitDashboard(DASHBOARD_ID);

            cy.log("The first series line");
            cy.get(".sub.enable-dots._0")
              .find(".dot")
              .eq(0)
              .click({ force: true });
            cy.findByText("See this year by quarter");
            cy.findByText("See these Orders");

            // Click anywhere else to close the first action panel
            cy.findByText("13457D").click();

            // Second line from the second question
            cy.log("The third series line");
            cy.get(".sub.enable-dots._2")
              .find(".dot")
              .eq(0)
              .click({ force: true });
            cy.findByText("See this year by quarter");
            cy.findByText("See these Orders");
          },
        );
      });
    });
  });

  it("should drill through a nested query", () => {
    cy.intercept("POST", "/api/dataset").as("dataset");

    cy.createQuestion({
      name: "CA People",
      query: { "source-table": PEOPLE_ID, limit: 5 },
    });
    // Build a new question off that grouping by City
    startNewQuestion();
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.contains("Saved Questions").click();
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.contains("CA People").click();

    addSummaryField({ metric: "Count of rows" });

    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Pick a column to group by").click();
    popover().within(() => {
      cy.findByText("City").click();
    });

    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Visualize").click();

    cy.wait("@dataset");
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.contains("Count by City");

    cy.get(".bar").first().click({ force: true });
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.contains("See this CA Person").click();

    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.contains("City is Beaver Dams");
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
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
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.contains("Orders by Created At: Week").click({ force: true });
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.contains("January 2025");

    // drill into a recent week
    cy.get(".dot").eq(-4).click({ force: true });
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.contains("See these Orders").click();

    // check that filter is applied and rows displayed
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.contains("Showing 127 rows");

    cy.log("Filter should show the range between two dates");
    // Now click on the filter widget to see if the proper parameters got passed in
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.contains(/^Created At is .*–/).click(); // en-dash to detect date range
  });

  it.skip("should drill-through on filtered aggregated results (metabase#13504)", () => {
    openOrdersTable({ mode: "notebook" });
    summarize({ mode: "notebook" });
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Count of rows").click();
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Pick a column to group by").click();
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Created At").click();

    // add filter: Count > 1
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Filter").click();
    popover().within(() => {
      cy.findByText("Count").click();
      cy.findByText("Equal to").click();
    });
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Greater than").click();
    cy.findByPlaceholderText("Enter a number").click().type("1");
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Add filter").click();

    visualize();

    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Visualization").click();
    cy.icon("line").click();
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Done").click();
    cy.log("Mid-point assertion");
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.contains("Count by Created At: Month");
    // at this point, filter is displaying correctly with the name
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.contains("Count is greater than 1");

    // drill-through
    cy.get(".dot")
      .eq(10) // random dot
      .click({ force: true });
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("See these Orders").click();

    cy.log("Reproduced on 0.34.3, 0.35.4, 0.36.7 and 0.37.0-rc2");
    // when the bug is present, filter is missing a name (showing only "is 256")
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.contains("Count is equal to 256");
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("There was a problem with your question").should("not.exist");
  });

  it("should display correct value in a tooltip for unaggregated data (metabase#11907)", () => {
    cy.createNativeQuestion(
      {
        name: "11907",
        native: {
          query:
            "SELECT parsedatetime('2026-01-01', 'yyyy-MM-dd') AS \"d\", 5 AS \"c\" UNION ALL\nSELECT parsedatetime('2026-01-01', 'yyyy-MM-dd') AS \"d\", 2 AS \"c\" UNION ALL\nSELECT parsedatetime('2026-01-01', 'yyyy-MM-dd') AS \"d\", 3 AS \"c\" UNION ALL\nSELECT parsedatetime('2026-01-02', 'yyyy-MM-dd') AS \"d\", 1 AS \"c\" UNION ALL\nSELECT parsedatetime('2026-01-02', 'yyyy-MM-dd') AS \"d\", 4 AS \"c\"",
          "template-tags": {},
        },
        display: "line",
      },
      { visitQuestion: true },
    );

    hoverLineDot({ index: 0 });
    popover().within(() => {
      cy.findByText("January 1, 2026");
      cy.findByText("10");
    });

    hoverLineDot({ index: 1 });
    popover().within(() => {
      cy.findByText("January 2, 2026");
      cy.findByText("5");
    });
  });

  it("should display correct value in a tooltip for unaggregated data with breakouts (metabase#15785)", () => {
    visitQuestionAdhoc({
      dataset_query: {
        type: "native",
        native: {
          query:
            'select 1 as axis, 5 as "VALUE", 9 as breakout union all\nselect 2 as axis, 6 as "VALUE", 10 as breakout union all\nselect 2 as axis, 6 as "VALUE", 10 as breakout',
        },
        database: SAMPLE_DB_ID,
      },
      display: "bar",
      visualization_settings: {
        "graph.dimensions": ["AXIS", "BREAKOUT"],
        "graph.metrics": ["VALUE"],
      },
    });

    cy.get(".bar").last().trigger("mousemove");
    popover().findByText("12");
  });

  it.skip("should drill-through a custom question that joins a native SQL question (metabase#14495)", () => {
    // Restrict "normal user" (belongs to the DATA_GROUP) from writing native queries
    cy.log("Fetch permissions graph");
    cy.request("GET", "/api/permissions/graph", {}).then(
      ({ body: { groups, revision } }) => {
        // This mutates the original `groups` object => we'll pass it next to the `PUT` request
        groups[DATA_GROUP] = {
          // database_id = 1 (SAMPLE_DATABASE)
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
        cy.intercept("POST", "/api/dataset").as("dataset");

        // Switch to the normal user who has restricted SQL access
        cy.signInAsNormalUser();
        visitQuestion(QUESTION_ID);

        // Initial visualization has rendered and we can now drill-through
        cy.get(".Visualization .bar").eq(4).click({ force: true });
        cy.findByText("See these People").click();

        // We should see the resulting dataset of that drill-through
        cy.wait("@dataset").then(xhr => {
          expect(xhr.response.body.error).not.to.exist;
        });
        cy.findByText("Macy Olson");
      });
    });
  });

  it("count of rows from drill-down on binned results should match the number of records (metabase#15324)", () => {
    visitQuestionAdhoc({
      name: "15324",
      dataset_query: {
        database: SAMPLE_DB_ID,
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
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText(/^10 –/)
      .closest(".TableInteractive-cellWrapper")
      .next()
      .contains("85")
      .click();
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("See these Orders").click();
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Quantity is greater than or equal to 10");
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Quantity is less than 20");
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Showing 85 rows");
  });

  it("should drill through on a bin of null values (#11345)", () => {
    visitQuestionAdhoc({
      name: "11345",
      dataset_query: {
        database: SAMPLE_DB_ID,
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
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("16,845").click();
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("See these Orders").click();

    // count number of distinct values in the Discount column
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Discount ($)").click();
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Distinct values").click();

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
      cy.createDashboard().then(({ body: { id: DASHBOARD_ID } }) => {
        addOrUpdateDashboardCard({
          card_id: QUESTION_ID,
          dashboard_id: DASHBOARD_ID,
          card: {
            size_x: 21,
            size_y: 10,
            visualization_settings: {
              click_behavior: {
                type: "link",
                linkType: "url",
                linkTemplate: "question/{{count}}",
              },
            },
          },
        });

        visitDashboard(DASHBOARD_ID);
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
      summarize();
      sidebar().within(() => {
        cy.contains("Category").click();
      });

      // Drill-through the last bar (Widget)
      cy.get(".bar").last().click({ force: true });
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("See these Products").click();
    });

    // [quarantine] flaky
    it.skip("should result in a correct query result", () => {
      cy.log("Assert that the URL is correct");
      cy.url().should("include", "/question#");

      cy.log("Assert on the correct product category: Widget");
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("Category is Widget");
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("Gizmo").should("not.exist");
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("Doohickey").should("not.exist");
    });
  });

  it("should display proper drills on chart click for line chart", () => {
    cy.createQuestion(
      {
        name: "Line chart drills",
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
      },
      { visitQuestion: true },
    );

    cy.get(".LineAreaBarChart").get(".dot").first().click({ force: true });
    popover().within(() => {
      cy.findByText(`See these Orders`).should("be.visible");

      cy.findByText(`See this month by week`).should("be.visible");

      cy.findByText(`Break out by…`).should("be.visible");
      cy.findByText(`Automatic insights…`).should("be.visible");

      cy.findByText(`>`).should("be.visible");
      cy.findByText(`<`).should("be.visible");
      cy.findByText(`=`).should("be.visible");
      cy.findByText(`≠`).should("be.visible");
    });

    cy.findByTestId("timeseries-mode-bar").within(() => {
      cy.findByText(`View`).should("be.visible");
      cy.findByText(`All Time`).should("be.visible");
      cy.findByText(`by`).should("be.visible");
      cy.findByText(`Month`).should("be.visible");
    });
  });

  it("should display proper drills on chart click for bar chart", () => {
    cy.createQuestion(
      {
        name: "Line chart drills",
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
        display: "bar",
      },
      { visitQuestion: true },
    );

    cy.get(".LineAreaBarChart").findAllByTestId("legend-item").first().click();

    popover().within(() => {
      cy.findByText(`See these Orders`).should("be.visible");
      cy.findByText(`Automatic insights…`).should("be.visible");
    });

    cy.get(".LineAreaBarChart").get(".bar").first().click({ force: true });
    popover().within(() => {
      cy.findByText(`See these Orders`).should("be.visible");

      cy.findByText(`See this month by week`).should("be.visible");

      cy.findByText(`Break out by…`).should("be.visible");
      cy.findByText(`Automatic insights…`).should("be.visible");

      cy.findByText(`>`).should("be.visible");
      cy.findByText(`<`).should("be.visible");
      cy.findByText(`=`).should("be.visible");
      cy.findByText(`≠`).should("be.visible");
    });

    cy.findByTestId("timeseries-mode-bar").within(() => {
      cy.findByText(`View`).should("be.visible");
      cy.findByText(`All Time`).should("be.visible");
      cy.findByText(`by`).should("be.visible");
      cy.findByText(`Month`).should("be.visible");
    });
  });

  it("should display proper drills on chart click for query grouped by state", () => {
    cy.createQuestion(
      {
        name: "Line chart drills",
        query: {
          "source-table": PEOPLE_ID,
          aggregation: [["count"]],
          breakout: [["field", PEOPLE.STATE, null]],
        },
        display: "map",
      },
      { visitQuestion: true },
    );

    cy.get(".CardVisualization").get("path.cursor-pointer").first().click();

    popover().within(() => {
      cy.findByText(`See these People`).should("be.visible");
      cy.findByText(`Zoom in`).should("be.visible");

      cy.findByText(`Break out by…`).should("be.visible");
      cy.findByText(`Automatic insights…`).should("be.visible");

      cy.findByText(`>`).should("be.visible");
      cy.findByText(`<`).should("be.visible");
      cy.findByText(`=`).should("be.visible");
      cy.findByText(`≠`).should("be.visible");
    });
  });
});

function hoverLineDot({ index } = {}) {
  cy.get(".Visualization .dot").eq(index).realHover();
}
