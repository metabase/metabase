import {
  restore,
  visitQuestionAdhoc,
  popover,
  visitDashboard,
  openSeriesSettings,
  queryBuilderMain,
  addOrUpdateDashboardCard,
} from "e2e/support/helpers";

import { SAMPLE_DB_ID } from "e2e/support/cypress_data";
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";

const { ORDERS, ORDERS_ID, PRODUCTS, PRODUCTS_ID, PEOPLE, PEOPLE_ID } =
  SAMPLE_DATABASE;

const Y_AXIS_RIGHT_SELECTOR = ".axis.yr";

const testQuery = {
  type: "query",
  query: {
    "source-table": ORDERS_ID,
    aggregation: [["count"]],
    breakout: [["datetime-field", ["field-id", ORDERS.CREATED_AT], "month"]],
  },
  database: SAMPLE_DB_ID,
};

describe("scenarios > visualizations > line chart", () => {
  beforeEach(() => {
    restore();
    cy.signInAsNormalUser();
  });

  it("should be able to change y axis position (metabase#13487)", () => {
    visitQuestionAdhoc({
      dataset_query: testQuery,
      display: "line",
    });

    cy.findByTestId("viz-settings-button").click();
    openSeriesSettings("Count");
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Right").click();
    cy.get(Y_AXIS_RIGHT_SELECTOR);
  });

  it("should be able to format data point values style independently on multi-series chart (metabase#13095)", () => {
    visitQuestionAdhoc({
      dataset_query: {
        type: "query",
        query: {
          "source-table": ORDERS_ID,
          aggregation: [
            ["sum", ["field", ORDERS.TOTAL, null]],
            [
              "aggregation-options",
              ["/", ["avg", ["field", ORDERS.QUANTITY, null]], 10],
              { "display-name": "AvgPct" },
            ],
          ],
          breakout: [["field", ORDERS.CREATED_AT, { "temporal-unit": "year" }]],
        },
        database: SAMPLE_DB_ID,
      },
      display: "line",
      visualization_settings: {
        "graph.show_values": true,
        column_settings: {
          '["name","expression"]': { number_style: "percent" },
        },
        "graph.dimensions": ["CREATED_AT"],
        "graph.metrics": ["sum", "expression"],
      },
    });

    cy.get(".value-labels").contains("39.75%");
  });

  it("should display an error message when there are more series than the chart supports", () => {
    visitQuestionAdhoc({
      display: "line",
      dataset_query: {
        database: SAMPLE_DB_ID,
        type: "query",
        query: {
          "source-table": PRODUCTS_ID,
          aggregation: [["count"]],
          breakout: [
            ["field", PRODUCTS.CREATED_AT, { "temporal-unit": "year" }],
            ["field", PRODUCTS.TITLE, null],
          ],
        },
      },
      visualization_settings: {
        "graph.dimensions": ["CREATED_AT", "TITLE"],
        "graph.metrics": ["count"],
      },
    });

    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText(
      "This chart type doesn't support more than 100 series of data.",
    );
  });

  it("should correctly display tooltip values when X-axis is numeric and style is 'Ordinal' (metabase#15998)", () => {
    visitQuestionAdhoc({
      dataset_query: {
        database: SAMPLE_DB_ID,
        query: {
          "source-table": ORDERS_ID,
          aggregation: [
            ["count"],
            ["sum", ["field", ORDERS.TOTAL, null]],
            ["avg", ["field", ORDERS.QUANTITY, null]],
          ],
          breakout: [
            ["field", PRODUCTS.RATING, { "source-field": ORDERS.PRODUCT_ID }],
          ],
        },
        type: "query",
      },
      display: "line",
      visualization_settings: {
        "graph.x_axis.scale": "ordinal",
        "graph.dimensions": ["RATING"],
        "graph.metrics": ["count", "sum", "avg"],
      },
    });

    cy.get(".Visualization .enable-dots")
      .last()
      .find(".dot")
      .eq(3)
      .trigger("mousemove", { force: true });
    popover().within(() => {
      testPairedTooltipValues("Product → Rating", "2.7");
      testPairedTooltipValues("Count", "191");
      testPairedTooltipValues("Sum of Total", "14,747.05");
      testPairedTooltipValues("Average of Quantity", "4.3");
    });
  });

  it("should be possible to update/change label for an empty row value (metabase#12128)", () => {
    visitQuestionAdhoc({
      dataset_query: {
        type: "native",
        native: {
          query:
            "SELECT '2026-03-01'::date as date, 'cat1' as category, 23 as \"value\"\nUNION ALL\nSELECT '2026-03-01'::date, '', 44\nUNION ALL\nSELECT  '2026-03-01'::date, 'cat3', 58\n\nUNION ALL\n\nSELECT '2026-03-02'::date as date, 'cat1' as category, 20 as \"value\"\nUNION ALL\nSELECT '2026-03-02'::date, '', 50\nUNION ALL\nSELECT  '2026-03-02'::date, 'cat3', 58",
          "template-tags": {},
        },
        database: SAMPLE_DB_ID,
      },
      display: "line",
      visualization_settings: {
        "graph.dimensions": ["DATE", "CATEGORY"],
        "graph.metrics": ["VALUE"],
      },
    });

    cy.findByTestId("viz-settings-button").click();

    // Make sure we can update input with some existing value
    openSeriesSettings("cat1", true);
    popover().within(() => {
      cy.findByDisplayValue("cat1").type(" new").blur();
      cy.findByDisplayValue("cat1 new");
      cy.wait(500);
    });
    // Now do the same for the input with no value
    openSeriesSettings("(empty)", true);
    popover().within(() => {
      cy.findAllByLabelText("series-name-input").clear().type("cat2").blur();
      cy.findByDisplayValue("cat2");
    });
    cy.button("Done").click();

    cy.findAllByTestId("legend-item")
      .should("contain", "cat1 new")
      .and("contain", "cat2")
      .and("contain", "cat3");
  });

  it("should interpolate null value by not rendering a data point (metabase#4122)", () => {
    visitQuestionAdhoc({
      dataset_query: {
        type: "native",
        native: {
          query: `
            select 'a' x, 1 y
            union all
            select 'b' x, null y
            union all
            select 'c' x, 2 y
          `,
          "template-tags": {},
        },
        database: SAMPLE_DB_ID,
      },
      display: "line",
    });

    cy.get(`.sub._0`).find("circle").should("have.length", 2);
  });

  it("should show the trend line", () => {
    visitQuestionAdhoc({
      display: "line",
      dataset_query: {
        database: SAMPLE_DB_ID,
        type: "query",
        query: {
          "source-table": ORDERS_ID,
          aggregation: [["count"]],
          breakout: [
            [
              "field",
              ORDERS.CREATED_AT,
              { "base-type": "type/DateTime", "temporal-unit": "month" },
            ],
          ],
        },
      },
      visualization_settings: {
        "graph.dimensions": ["CREATED_AT"],
        "graph.show_trendline": true,
        "graph.show_goal": false,
        "graph.show_values": false,
        "graph.metrics": ["count"],
      },
    });

    cy.get(".LineAreaBarChart").get(".trend").should("be.visible");
  });

  it("should show label for empty value series breakout (metabase#32107)", () => {
    visitQuestionAdhoc({
      dataset_query: {
        type: "native",
        native: {
          query: `
            select 1 id, 50 val1, null val2
            union all select 2, 75, null
            union all select 3, 175, null
            union all select 4, 200, null
            union all select 5, 280, null
          `,
        },
        database: SAMPLE_DB_ID,
      },
      display: "line",
      visualization_settings: {
        "graph.dimensions": ["ID", "VAL2"],
        "graph.series_order_dimension": null,
        "graph.series_order": null,
        "graph.metrics": ["VAL1"],
      },
    });

    cy.findByTestId("visualization-root")
      .findByTestId("legend-item")
      .findByText("(empty)")
      .should("be.visible");

    cy.findByTestId("viz-settings-button").click();
    cy.findByTestId("chartsettings-sidebar").findByText("(empty)");
  });

  describe("y-axis splitting (metabase#12939)", () => {
    it("should not split the y-axis when columns are of the same semantic_type and have close values", () => {
      visitQuestionAdhoc({
        dataset_query: {
          type: "query",
          query: {
            "source-table": ORDERS_ID,
            aggregation: [
              ["avg", ["field", ORDERS.TOTAL, null]],
              ["min", ["field", ORDERS.TOTAL, null]],
            ],
            breakout: [
              ["field", ORDERS.CREATED_AT, { "temporal-unit": "month" }],
            ],
          },
          database: SAMPLE_DB_ID,
        },
        display: "line",
      });

      cy.get("g.axis.yr").should("not.exist");
    });

    it("should split the y-axis when columns are of different semantic_type", () => {
      visitQuestionAdhoc({
        dataset_query: {
          type: "query",
          query: {
            "source-table": PEOPLE_ID,
            aggregation: [
              ["avg", ["field", PEOPLE.LATITUDE, null]],
              ["avg", ["field", PEOPLE.LONGITUDE, null]],
            ],
            breakout: [
              ["field", PEOPLE.CREATED_AT, { "temporal-unit": "month" }],
            ],
          },
          database: SAMPLE_DB_ID,
        },
        display: "line",
      });

      cy.get("g.axis.yr").should("be.visible");
    });

    it("should split the y-six when columns are of the same semantic_type but have far values", () => {
      visitQuestionAdhoc({
        dataset_query: {
          type: "query",
          query: {
            "source-table": ORDERS_ID,
            aggregation: [
              ["sum", ["field", ORDERS.TOTAL, null]],
              ["min", ["field", ORDERS.TOTAL, null]],
            ],
            breakout: [
              ["field", ORDERS.CREATED_AT, { "temporal-unit": "month" }],
            ],
          },
          database: SAMPLE_DB_ID,
        },
        display: "line",
      });

      cy.get("g.axis.yr").should("be.visible");
    });

    it("should not split the y-axis when the setting is disabled", () => {
      visitQuestionAdhoc({
        dataset_query: {
          type: "query",
          query: {
            "source-table": ORDERS_ID,
            aggregation: [
              ["sum", ["field", ORDERS.TOTAL, null]],
              ["min", ["field", ORDERS.TOTAL, null]],
            ],
            breakout: [
              ["field", ORDERS.CREATED_AT, { "temporal-unit": "month" }],
            ],
          },
          database: SAMPLE_DB_ID,
        },
        display: "line",
        visualization_settings: {
          "graph.y_axis.auto_split": false,
        },
      });

      cy.get("g.axis.yr").should("not.exist");
    });
  });

  describe("tooltip of combined dashboard cards (multi-series) should show the correct column title (metabase#16249", () => {
    const RENAMED_FIRST_SERIES = "Foo";
    const RENAMED_SECOND_SERIES = "Bar";

    it("custom expression names (metabase#16249-1)", () => {
      createOrdersQuestionWithAggregation({
        name: "16249_Q1",
        aggregation: [
          [
            "aggregation-options",
            ["sum", ["field", ORDERS.TOTAL, null]],
            { "display-name": "CE" },
          ],
        ],
      }).then(({ body: { id: question1Id } }) => {
        createOrdersQuestionWithAggregation({
          name: "16249_Q2",
          aggregation: [
            [
              "aggregation-options",
              ["avg", ["field", ORDERS.SUBTOTAL, null]],
              { "display-name": "CE" },
            ],
          ],
        }).then(({ body: { id: question2Id } }) => {
          cy.createDashboard().then(({ body: { id: dashboardId } }) => {
            addBothSeriesToDashboard({
              dashboardId,
              firstCardId: question1Id,
              secondCardId: question2Id,
            });
            visitDashboard(dashboardId);

            // Rename both series
            renameSeries([
              ["16249_Q1", RENAMED_FIRST_SERIES],
              ["16249_Q2", RENAMED_SECOND_SERIES],
            ]);

            assertOnLegendItemsValues();
            assertOnYAxisValues();

            showTooltipForFirstCircleInSeries(0);
            popover().within(() => {
              testPairedTooltipValues("Created At", "2022");
              testPairedTooltipValues(RENAMED_FIRST_SERIES, "42,156.87");
            });

            showTooltipForFirstCircleInSeries(1);
            popover().within(() => {
              testPairedTooltipValues("Created At", "2022");
              testPairedTooltipValues(RENAMED_SECOND_SERIES, "54.44");
            });
          });
        });
      });
    });

    it("regular column names (metabase#16249-2)", () => {
      createOrdersQuestionWithAggregation({
        name: "16249_Q3",
        aggregation: [["sum", ["field", ORDERS.TOTAL, null]]],
      }).then(({ body: { id: question1Id } }) => {
        cy.createQuestion({
          name: "16249_Q4",
          query: {
            "source-table": PRODUCTS_ID,
            aggregation: [["sum", ["field", PRODUCTS.PRICE, null]]],
            breakout: [
              ["field", PRODUCTS.CREATED_AT, { "temporal-unit": "year" }],
            ],
          },
          display: "line",
        }).then(({ body: { id: question2Id } }) => {
          cy.createDashboard().then(({ body: { id: dashboardId } }) => {
            addBothSeriesToDashboard({
              dashboardId,
              firstCardId: question1Id,
              secondCardId: question2Id,
            });

            visitDashboard(dashboardId);

            renameSeries([
              ["16249_Q3", RENAMED_FIRST_SERIES],
              ["16249_Q4", RENAMED_SECOND_SERIES],
            ]);

            assertOnLegendItemsValues();
            assertOnYAxisValues();

            showTooltipForFirstCircleInSeries(0);
            popover().within(() => {
              testPairedTooltipValues("Created At", "2022");
              testPairedTooltipValues(RENAMED_FIRST_SERIES, "42,156.87");
            });

            showTooltipForFirstCircleInSeries(1);
            popover().within(() => {
              testPairedTooltipValues("Created At", "2022");
              testPairedTooltipValues(RENAMED_SECOND_SERIES, "2,829.03");
            });
          });
        });
      });
    });

    /**
     * Helper functions related to repros around 16249 only!
     * Note:
     *  - This might be too abstract and highly specific.
     *  - That's true in general sense, but that's the reason we're not using them anywhere else than here.
     *  - Without these abstractions, both tests would be MUCH longer and harder to review.
     */

    function addBothSeriesToDashboard({
      dashboardId,
      firstCardId,
      secondCardId,
    } = {}) {
      // Add the first question to the dashboard
      addOrUpdateDashboardCard({
        dashboard_id: dashboardId,
        card_id: firstCardId,
        card: {
          size_x: 24,
          size_y: 12,
          series: [
            {
              id: secondCardId,
            },
          ],
        },
      });
    }

    function createOrdersQuestionWithAggregation({ name, aggregation } = {}) {
      return cy.createQuestion({
        name,
        query: {
          "source-table": ORDERS_ID,
          aggregation,
          breakout: [["field", ORDERS.CREATED_AT, { "temporal-unit": "year" }]],
        },
        display: "line",
      });
    }

    function renameSeries(series) {
      cy.icon("pencil").click();
      cy.get(".Card").realHover();
      cy.icon("palette").click();
      series.forEach(serie => {
        const [old_name, new_name] = serie;

        cy.findByDisplayValue(old_name).clear().type(new_name);
      });

      cy.get(".Modal")
        .as("modal")
        .within(() => {
          cy.button("Done").click();
        });
      cy.button("Save").click();
      cy.findByText("You're editing this dashboard.").should("not.exist");
    }

    function assertOnLegendItemsValues() {
      cy.findAllByTestId("legend-item")
        .should("contain", RENAMED_FIRST_SERIES)
        .and("contain", RENAMED_SECOND_SERIES);
    }

    function assertOnYAxisValues() {
      cy.get(".y-axis-label")
        .should("contain", RENAMED_FIRST_SERIES)
        .and("contain", RENAMED_SECOND_SERIES);
    }
  });

  describe("problems with the labels when showing only one row in the results (metabase#12782, metabase#4995)", () => {
    beforeEach(() => {
      visitQuestionAdhoc({
        dataset_query: {
          database: SAMPLE_DB_ID,
          query: {
            "source-table": PRODUCTS_ID,
            aggregation: [["avg", ["field", PRODUCTS.PRICE, null]]],
            breakout: [
              ["field", PRODUCTS.CREATED_AT, { "temporal-unit": "year" }],
              ["field", PRODUCTS.CATEGORY, null],
            ],
            filter: ["=", ["field", PRODUCTS.CATEGORY, null], "Doohickey"],
          },
          type: "query",
        },
        display: "line",
      });
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("Category is Doohickey");
    });

    it("should not drop the chart legend (metabase#4995)", () => {
      cy.findAllByTestId("legend-item").should("contain", "Doohickey");

      cy.log("Ensure that legend is hidden when not dealing with multi series");
      cy.findByTestId("viz-settings-button").click();
      cy.findByTestId("remove-CATEGORY").click();
      queryBuilderMain().should("not.contain", "Doohickey");
    });

    it("should display correct axis labels (metabase#12782)", () => {
      cy.get(".x-axis-label").invoke("text").should("eq", "Created At");
      cy.get(".y-axis-label").invoke("text").should("eq", "Average of Price");
    });
  });
});

function testPairedTooltipValues(val1, val2) {
  cy.contains(val1).closest("td").siblings("td").findByText(val2);
}

function showTooltipForFirstCircleInSeries(series_index) {
  cy.get(`.sub._${series_index}`)
    .as("firstSeries")
    .find("circle")
    .first()
    .trigger("mousemove", { force: true });
}
