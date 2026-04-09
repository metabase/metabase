const { H } = cy;
import { SAMPLE_DB_ID, USER_GROUPS } from "e2e/support/cypress_data";
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import { ORDERS_BY_YEAR_QUESTION_ID } from "e2e/support/cypress_sample_instance_data";

const { ORDERS, ORDERS_ID, PRODUCTS, PRODUCTS_ID, PEOPLE, PEOPLE_ID } =
  SAMPLE_DATABASE;
const { DATA_GROUP } = USER_GROUPS;

describe("scenarios > visualizations > drillthroughs > chart drill", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
  });

  it("should allow brush date filter", () => {
    H.createQuestion(
      {
        name: "Brush Date Temporal Filter",
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

    H.queryBuilderMain().within(() => {
      cy.findByLabelText("Legend").findByText("Gadget").should("exist");
      H.echartsContainer().findByText("January 2023").should("exist");
    });

    cy.wait(100); // wait to avoid grabbing the svg before the chart redraws
    cy.findByTestId("query-visualization-root") // drag across to filter
      .trigger("mousedown", 120, 200)
      .trigger("mousemove", 230, 200)
      .trigger("mouseup", 230, 200);

    // Note: Test was flaking because apparently mouseup doesn't always happen at the same position.
    //       It is enough that we assert that the filter exists.
    cy.findByTestId("qb-filters-panel").should(
      "contain",
      "Product → Created At: Month is",
    );

    H.queryBuilderMain().within(() => {
      H.echartsContainer().findByText("June 2022"); // more granular axis labels

      // confirm that product category is still broken out
      cy.findByLabelText("Legend").within(() => {
        cy.findByText("Gadget").should("exist");
        cy.findByText("Doohickey").should("exist");
        cy.findByText("Gizmo").should("exist");
        cy.findByText("Widget").should("exist");
      });
    });
  });

  ["month", "month-of-year"].forEach((granularity) => {
    it(`brush filter should work post-aggregation for ${granularity} granularity (metabase#18011)`, () => {
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

      H.createQuestion(questionDetails, { visitQuestion: true });

      H.queryBuilderMain().within(() => {
        cy.findByLabelText("Legend").findByText("Gadget").should("exist");
        H.echartsContainer().findByText(/Count/).should("exist");
      });
      cy.wait(100); // wait to avoid grabbing the svg before the chart redraws

      cy.findByTestId("query-visualization-root")
        .trigger("mousedown", 240, 200)
        .trigger("mousemove", 420, 200)
        .trigger("mouseup", 420, 200);

      cy.wait("@dataset");

      // Once the issue gets fixed, figure out the positive assertion for the "month-of-year" granularity
      if (granularity === "month") {
        cy.findByTestId("qb-filters-panel")
          .findByText(
            "Created At: Month is Sep 1, 2022, 12:00 AM – Feb 1, 2023, 12:00 AM",
          )
          .should("exist");
      }

      H.cartesianChartCircle();
    });
  });

  it("should correctly drill through on a card with multiple series (metabase#11442)", () => {
    H.createQuestion({
      name: "11442_Q1",
      query: {
        "source-table": ORDERS_ID,
        aggregation: [["count"]],
        breakout: [["field", ORDERS.CREATED_AT, { "temporal-unit": "year" }]],
      },
      display: "line",
    }).then(({ body: { id: Q1_ID } }) => {
      H.createQuestion({
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
        H.createDashboard({ name: "11442D" }).then(
          ({ body: { id: DASHBOARD_ID } }) => {
            cy.log("Add the first question to the dashboard");

            H.addOrUpdateDashboardCard({
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

            H.visitDashboard(DASHBOARD_ID);

            cy.log("The first series line");
            H.cartesianChartCircleWithColor("#509EE3").eq(0).click();
            cy.findByText("See this year by quarter");
            cy.findByText("See these Orders");

            // Click anywhere else to close the first action panel
            cy.findByText("11442D").click();

            // Second line from the second question
            cy.log("The second series line");
            H.cartesianChartCircleWithColor("#98D9D9").eq(0).click();
            cy.findByText("See this year by quarter");
            cy.findByText("See these Products");
          },
        );
      });
    });
  });

  it("should allow drill-through on combined cards with different amount of series (metabase#13457)", () => {
    H.createQuestion({
      name: "13457_Q1",
      query: {
        "source-table": ORDERS_ID,
        aggregation: [["count"]],
        breakout: [["field", ORDERS.CREATED_AT, { "temporal-unit": "year" }]],
      },
      display: "line",
    }).then(({ body: { id: Q1_ID } }) => {
      H.createQuestion({
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
        H.createDashboard({ name: "13457D" }).then(
          ({ body: { id: DASHBOARD_ID } }) => {
            cy.log("Add the first question to the dashboard");

            H.addOrUpdateDashboardCard({
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

            H.visitDashboard(DASHBOARD_ID);

            cy.log("The first series line");
            H.cartesianChartCircleWithColor("#509EE3").eq(0).click();
            cy.findByText("See this year by quarter");
            cy.findByText("See these Orders");

            // Click anywhere else to close the first action panel
            cy.findByText("13457D").click();

            // Second line from the second question
            cy.log("The third series line");
            H.cartesianChartCircleWithColor("#EF8C8C").eq(0).click();
            cy.findByText("See this year by quarter");
            cy.findByText("See these Orders");
          },
        );
      });
    });
  });

  it("should drill through a nested query", () => {
    cy.intercept("POST", "/api/dataset").as("dataset");

    H.createQuestion({
      name: "CA People",
      query: { "source-table": PEOPLE_ID, limit: 5 },
    });
    // Build a new question off that grouping by City
    H.startNewQuestion();
    H.miniPicker().within(() => {
      cy.findByText("Our analytics").click();
      cy.contains("CA People").click();
    });

    H.addSummaryField({ metric: "Count of rows" });

    // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Pick a column to group by").click();
    H.popover().within(() => {
      cy.findByText("City").click();
    });

    // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Visualize").click();

    cy.wait("@dataset");
    // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
    cy.contains("Count by City");

    H.chartPathWithFillColor("#509EE3").first().click();
    // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
    cy.contains("See this CA Person").click();

    // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
    cy.contains("City is Beaver Dams");
    // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
    cy.contains("Dominique Leffler");
  });

  it("should drill through a with date filter (metabase#12496)", () => {
    H.createQuestion({
      name: "Orders by Created At: Week",
      query: {
        "source-table": ORDERS_ID,
        aggregation: [["count"]],
        breakout: [["field", ORDERS.CREATED_AT, { "temporal-unit": "week" }]],
      },
      display: "line",
    });

    cy.visit("/collection/root");
    cy.findAllByTestId("collection-entry-name")
      .contains("Orders by Created At: Week")
      .click();

    H.echartsContainer().contains("January 2025");
    // drill into a recent week
    H.cartesianChartCircle().should("have.length.gte", 4).eq(-4).click();

    H.popover().contains("See these Orders").click();

    // check that filter is applied and rows displayed
    H.assertQueryBuilderRowCount(127);

    cy.log("Filter should show the range between two dates");
    // Now click on the filter widget to see if the proper parameters got passed in
    cy.findByTestId("filter-pill")
      .contains(/^Created At: Week is .*–/)
      .click(); // en-dash to detect date range
  });

  it("should drill-through on filtered aggregated results (metabase#13504)", () => {
    H.openOrdersTable({ mode: "notebook" });
    H.summarize({ mode: "notebook" });
    H.popover().contains("Count of rows").click();
    cy.findByTestId("breakout-step")
      .contains("Pick a column to group by")
      .click();
    H.popover().contains("Created At").click();
    cy.findByTestId("step-summarize-0-0").within(() => {
      cy.icon("filter").click();
    });
    H.popover().within(() => {
      cy.contains("Count").click();
      cy.contains("Between").click();
    });
    H.popover()
      .should("have.length", 2)
      .last()
      .contains("Greater than")
      .click();
    H.popover().within(() => {
      cy.findByPlaceholderText("Enter a number").click().type("1");
      cy.button("Add filter").click();
    });
    H.visualize();
    cy.button("Visualization").click();
    H.leftSidebar().within(() => {
      cy.findByTestId("more-charts-toggle").click();
      cy.icon("line").click();
    });
    cy.button("Done").click();
    cy.log("Mid-point assertion");
    // at this point, filter is displaying correctly with the name
    cy.findByTestId("filter-pill").contains("Count is greater than 1");

    // drill-through
    H.cartesianChartCircle().should("have.length.gte", 10).eq(10).click();

    H.clickActionsPopover().contains("See these Orders").click();

    cy.log("Reproduced on 0.34.3, 0.35.4, 0.36.7 and 0.37.0-rc2");
    // when the bug is present, filter is missing a name (showing only "is 256")
    H.assertQueryBuilderRowCount(256);
  });

  it("should display correct value in a tooltip for unaggregated data (metabase#11907)", () => {
    H.createNativeQuestion(
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

    H.cartesianChartCircle().eq(0).realHover();
    H.assertEChartsTooltip({
      header: "January 1, 2026",
      rows: [
        {
          color: "#EF8C8C",
          name: "c",
          value: "10",
        },
      ],
    });

    H.echartsTriggerBlur();

    H.cartesianChartCircle().eq(1).realHover();
    H.assertEChartsTooltip({
      header: "January 2, 2026",
      rows: [
        {
          color: "#EF8C8C",
          name: "c",
          value: "5",
        },
      ],
    });
  });

  it('should clear the graph.dimensions setting when drilling through on a chart with "graph.dimensions" set (metabase#55484)', () => {
    H.createQuestion({
      name: "55484",
      display: "line",
      query: {
        "source-table": ORDERS_ID,
        joins: [
          {
            fields: "all",
            "source-table": PRODUCTS_ID,
            condition: [
              "=",
              ["field", ORDERS.PRODUCT_ID, null],
              ["field", PRODUCTS.ID, { "join-alias": "Products" }],
            ],
            alias: "Products",
          },
        ],
        filter: [],
        aggregation: [["count"]],
        breakout: [
          ["field", PRODUCTS.CREATED_AT, { "temporal-unit": "hour" }],
          ["field", ORDERS.CREATED_AT, { "temporal-unit": "hour" }],
        ],
      },
    }).then(({ body: { id: QUESTION_ID } }) => {
      cy.visit(`/question/${QUESTION_ID}/notebook`);
      cy.button("Visualize").click();
      cy.url().should("include", `/question/${QUESTION_ID}-55484`);
      cy.findByTestId("viz-settings-button").click();
      cy.findByDisplayValue("Created At: Hour").click();
      H.popover().within(() => {
        cy.findByText("Products → Created At: Hour").click();
      });
      cy.button("Done").click();

      H.cartesianChartCircle().eq(82).click();
      H.popover().within(() => {
        cy.findByText("See these Orders").click();
      });

      cy.findByTestId("visualization-root").should(
        "have.attr",
        "data-viz-ui-name",
        "Table",
      );

      cy.button("Visualization").click();
      H.leftSidebar().within(() => {
        cy.findByTestId("more-charts-toggle").click();
        cy.icon("line").click();
      });
      cy.findByText(
        "Cannot read properties of undefined (reading 'name')",
      ).should("not.exist");
    });
  });

  it("should display correct value in a tooltip for unaggregated data with breakouts (metabase#15785)", () => {
    H.visitQuestionAdhoc({
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

    H.chartPathWithFillColor("#7172AD").first().trigger("mousemove");
    H.assertEChartsTooltip({
      header: "2",
      rows: [
        {
          color: "#88BF4D",
          name: "9",
          value: "(empty)",
        },
        {
          color: "#7172AD",
          name: "10",
          value: "12",
        },
      ],
    });
  });

  it("should drill-through a custom question that joins a native SQL question (metabase#14495)", () => {
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

    H.createNativeQuestion({
      name: "14495_SQL",
      native: { query: "SELECT * FROM ORDERS", "template-tags": {} },
    }).then(({ body: { id: SQL_ID } }) => {
      const ALIAS = `Question ${SQL_ID}`;

      // Create a QB question and join it with the previously created native question
      H.createQuestion({
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
        H.visitQuestion(QUESTION_ID);

        // Initial visualization has rendered and we can now drill-through
        H.chartPathWithFillColor("#509EE3")
          .should("have.length.gte", 4)
          .eq(4)
          .click();
        cy.findByText("See these People").click();

        // We should see the resulting dataset of that drill-through
        cy.wait("@dataset").then((xhr) => {
          expect(xhr.response.body.error).not.to.exist;
        });
        cy.findByText("Macy Olson");
      });
    });
  });

  it("count of rows from drill-down on binned results should match the number of records (metabase#15324)", () => {
    H.visitQuestionAdhoc({
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
    // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
    cy.findByText(/^10 –/).parent().parent().next().contains("85").click();
    // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
    cy.findByText("See these Orders").click();
    // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Quantity is greater than or equal to 10");
    // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Quantity is less than 20");
    // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Showing 85 rows");
  });

  it("should drill through on a bin of null values (#11345)", () => {
    H.visitQuestionAdhoc({
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
    // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
    cy.findByText("16,845").click();
    // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
    cy.findByText("See these Orders").click();

    // count number of distinct values in the Discount column
    H.tableHeaderClick("Discount ($)");
    // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Distinct values").click();

    // there should be 0 distinct values since they are all null
    cy.get(".test-TableInteractive-cellWrapper").contains("0");
  });

  it("should parse value on click through on the first row of pie chart (metabase#15250)", () => {
    H.createQuestion({
      name: "15250",
      query: {
        "source-table": PRODUCTS_ID,
        aggregation: [["count"]],
        breakout: [["field-id", PRODUCTS.CATEGORY]],
      },
      display: "pie",
    }).then(({ body: { id: QUESTION_ID } }) => {
      H.createDashboard().then(({ body: { id: DASHBOARD_ID } }) => {
        H.addOrUpdateDashboardCard({
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

        H.visitDashboard(DASHBOARD_ID);
      });
    });

    H.pieSliceWithColor("#88BF4D")
      .first()
      .as("doohickeyChart")
      .trigger("mousemove");

    H.assertEChartsTooltip({
      header: "Category",
      rows: [
        {
          color: "#88BF4D",
          name: "Doohickey",
          value: "42",
        },
        {
          color: "#F9D45C",
          name: "Gadget",
          value: "53",
        },
        {
          color: "#A989C5",
          name: "Gizmo",
          value: "51",
        },
        {
          color: "#F2A86F",
          name: "Widget",
          value: "54",
        },
      ],
    });

    cy.get("@doohickeyChart").click();
    cy.location("pathname").should("eq", "/question/42");
  });

  describe("for an unsaved question", () => {
    beforeEach(() => {
      const questionDetails = {
        dataset_query: {
          database: SAMPLE_DB_ID,
          type: "query",
          query: {
            "source-table": PRODUCTS_ID,
            aggregation: [["count"]],
            breakout: [
              [
                "field",
                PRODUCTS.CATEGORY,
                {
                  "base-type": "type/Text",
                },
              ],
            ],
          },
        },
      };

      H.visitQuestionAdhoc(questionDetails);

      // Drill-through the last bar (Widget)
      // eslint-disable-next-line metabase/no-unsafe-element-filtering
      H.chartPathWithFillColor("#509EE3").last().click();
      H.popover().findByTextEnsureVisible("See these Products").click();
    });

    it("should result in a correct query result", () => {
      cy.log("Assert that the URL is correct");
      cy.url().should("include", "/question#");

      cy.log("Assert on the correct product category: Widget");
      cy.findByTestId("qb-filters-panel").findByText("Category is Widget");

      cy.findByTestId("question-row-count").should(
        "have.text",
        "Showing 54 rows",
      );

      cy.findByTestId("visualization-root")
        .should("contain", "Widget")
        .and("not.contain", "Gizmo")
        .and("not.contain", "Doohickey");
    });
  });

  it("should display proper drills on chart click for line chart", () => {
    H.createQuestion(
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

    H.cartesianChartCircle().eq(2).click();
    H.popover().within(() => {
      cy.findByText("See these Orders").should("be.visible");

      cy.findByText("See this month by week").should("be.visible");

      cy.findByText("Break out by…").should("be.visible");
      cy.findByText("Automatic insights…").should("be.visible");

      cy.findByText(">").should("be.visible");
      cy.findByText("<").should("be.visible");
      cy.findByText("=").should("be.visible");
      cy.findByText("≠").should("be.visible");
    });

    cy.findByTestId("timeseries-chrome").within(() => {
      cy.findByText("View").should("be.visible");
      cy.findByText("All time").should("be.visible");
      cy.findByText("by").should("be.visible");
      cy.findByText("Month").should("be.visible");
    });
  });

  it("should display proper drills on chart click for bar chart", () => {
    H.createQuestion(
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

    cy.findAllByTestId("legend-item").first().click();

    H.popover().within(() => {
      cy.findByText("See these Orders").should("be.visible");
      cy.findByText("Automatic insights…").should("be.visible");
    });

    H.chartPathWithFillColor("#A989C5").first().click();
    H.popover().within(() => {
      cy.findByText("See these Orders").should("be.visible");

      cy.findByText("See this month by week").should("be.visible");

      cy.findByText("Break out by…").should("be.visible");
      cy.findByText("Automatic insights…").should("be.visible");

      cy.findByText(">").should("be.visible");
      cy.findByText("<").should("be.visible");
      cy.findByText("=").should("be.visible");
      cy.findByText("≠").should("be.visible");
    });

    cy.findByTestId("timeseries-chrome").within(() => {
      cy.findByText("View").should("be.visible");
      cy.findByText("All time").should("be.visible");
      cy.findByText("by").should("be.visible");
      cy.findByText("Month").should("be.visible");
    });
  });

  it("should display proper drills on chart click for query grouped by state", () => {
    H.createQuestion(
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

    cy.findAllByTestId("choropleth-feature").first().click();

    cy.findByTestId("click-actions-popover-content-for-Count").within(() => {
      cy.findByText("See these People").should("be.visible");
      cy.findByText("Zoom in: State").should("be.visible");

      cy.findByText("Break out by…").should("be.visible");
      cy.findByText("Automatic insights…").should("be.visible");

      cy.findByText(">").should("be.visible");
      cy.findByText("<").should("be.visible");
      cy.findByText("=").should("be.visible");
      cy.findByText("≠").should("be.visible");
    });
  });

  describe("chart click actions analytics", () => {
    beforeEach(() => {
      H.resetSnowplow();
      H.restore();
      cy.signInAsAdmin();
      H.enableTracking();
    });

    afterEach(() => {
      H.expectNoBadSnowplowEvents();
    });

    // This list is not exhaustive. It only covers the events that were defined in a ticket defined by Product.
    // The full list can be found in frontend/src/metabase/visualizations/types/click-actions.ts
    // See: `type ClickActionSection`
    it("should track clicks on action sections", () => {
      H.visitQuestion(ORDERS_BY_YEAR_QUESTION_ID);

      H.cartesianChartCircle().eq(1).should("be.visible").click();

      H.popover()
        .findByText(/^See these/)
        .click();

      H.expectUnstructuredSnowplowEvent({
        event: "click_action",
        triggered_from: "records",
      });

      cy.go("back");
      H.cartesianChartCircle().eq(1).should("be.visible").click();
      H.popover()
        .findByText(/^See this year/)
        .click();

      H.expectUnstructuredSnowplowEvent({
        event: "click_action",
        triggered_from: "zoom",
      });

      H.cartesianChartCircle().eq(1).should("be.visible").click();
      H.popover()
        .findByText(/^Break out by/)
        .click();

      H.expectUnstructuredSnowplowEvent({
        event: "click_action",
        triggered_from: "breakout",
      });

      H.cartesianChartCircle().eq(1).should("be.visible").click();
      H.popover().findByText(">").click();

      H.expectUnstructuredSnowplowEvent({
        event: "click_action",
        triggered_from: "filter",
      });

      cy.go("back");

      H.cartesianChartCircle().eq(1).should("be.visible").click();
      H.popover()
        .findByText(/^Automatic insights/)
        .click();

      H.expectUnstructuredSnowplowEvent({
        event: "click_action",
        triggered_from: "auto",
      });

      H.popover().findByText("X-ray").click();
      H.expectUnstructuredSnowplowEvent({
        event: "x-ray_automatic_insights_clicked",
        event_detail: "x-ray",
      });

      cy.go("back");

      H.cartesianChartCircle().eq(1).should("be.visible").click();
      H.popover()
        .findByText(/^Automatic insights/)
        .click();
      H.popover().findByText("Compare to the rest").click();
      H.expectUnstructuredSnowplowEvent({
        event: "x-ray_automatic_insights_clicked",
        event_detail: "compare_to_rest",
      });
    });
  });
});
