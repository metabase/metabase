const { H } = cy;
import { SAMPLE_DB_ID } from "e2e/support/cypress_data";
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";

const { ORDERS, ORDERS_ID, PRODUCTS, PRODUCTS_ID, PEOPLE, PEOPLE_ID } =
  SAMPLE_DATABASE;

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
    H.restore();
    cy.signInAsNormalUser();
  });

  it("should be able to change y axis position (metabase#13487)", () => {
    H.visitQuestionAdhoc({
      dataset_query: testQuery,
      display: "line",
    });

    H.openVizSettingsSidebar();
    H.openSeriesSettings("Count");

    H.echartsContainer()
      .findByText("Count")
      .then((label) => {
        const { x, y } = H.getXYTransform(label);
        cy.wrap({ x, y }).as("leftAxisLabelPosition");
      });

    // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Right").click();
    H.echartsContainer()
      .findByText("Count")
      .then((label) => {
        const { x: xRight, y: yRight } = H.getXYTransform(label);
        cy.get("@leftAxisLabelPosition").then(({ x: xLeft, y: yLeft }) => {
          expect(yRight).to.be.eq(yLeft);
          expect(xRight).to.be.greaterThan(xLeft);
        });
      });
  });

  it("should display line settings only for line/area charts", () => {
    H.visitQuestionAdhoc({
      dataset_query: testQuery,
      display: "line",
    });

    H.openVizSettingsSidebar();
    H.openSeriesSettings("Count");

    H.popover().within(() => {
      // For line chart
      cy.findByText("Line shape").should("exist");
      cy.findByText("Line style").should("exist");
      cy.findByText("Line size").should("exist");
      cy.findByText("Show dots on lines").should("exist");

      // For area chart
      cy.icon("area").click();
      cy.findByText("Line shape").should("exist");
      cy.findByText("Line style").should("exist");
      cy.findByText("Line size").should("exist");
      cy.findByText("Show dots on lines").should("exist");

      // For bar chart
      cy.icon("bar").click();
      cy.findByText("Line shape").should("not.be.visible");
      cy.findByText("Line style").should("not.be.visible");
      cy.findByText("Line size").should("not.be.visible");
      cy.findByText("Show dots on lines").should("not.be.visible");
    });
  });

  it("should allow changing formatting settings", () => {
    H.visitQuestionAdhoc({
      dataset_query: testQuery,
      display: "line",
    });

    H.openVizSettingsSidebar();
    H.openSeriesSettings("Count");

    H.popover().within(() => {
      cy.findByText("Formatting").click();

      cy.findByText("Add a prefix").should("exist");
      cy.findByPlaceholderText("$").type("prefix").blur();
    });

    H.echartsContainer().findByText("prefix0");
  });

  it("should reset series settings when switching to line chart", () => {
    H.visitQuestionAdhoc({
      dataset_query: testQuery,
      display: "area",
    });

    H.openVizSettingsSidebar();
    H.openSeriesSettings("Count");
    cy.icon("bar").click();

    H.openVizTypeSidebar();

    cy.icon("line").click();

    // should be a line chart
    H.cartesianChartCircleWithColor("#509EE3");
  });

  it("should reset stacking settings when switching to line chart (metabase#43538)", () => {
    H.visitQuestionAdhoc({
      dataset_query: {
        database: SAMPLE_DB_ID,
        query: {
          "source-table": PRODUCTS_ID,
          aggregation: [["avg", ["field", PRODUCTS.PRICE, null]]],
          breakout: [
            ["field", PRODUCTS.CREATED_AT, { "temporal-unit": "year" }],
            ["field", PRODUCTS.CATEGORY, null],
          ],
        },
        type: "query",
      },
      display: "bar",
      visualization_settings: {
        "stackable.stack_type": "normalized",
      },
    });

    H.openVizTypeSidebar();

    cy.icon("line").click();

    H.cartesianChartCircleWithColor("#A989C5");

    // Y-axis scale should not be normalized
    H.echartsContainer().findByText("100%").should("not.exist");
  });

  it("should be able to format data point values style independently on multi-series chart (metabase#13095)", () => {
    H.visitQuestionAdhoc({
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

    H.echartsContainer().get("text").contains("39.75%");
  });

  it("should let unpin y-axis from zero", () => {
    H.visitQuestionAdhoc({
      dataset_query: {
        type: "query",
        query: {
          "source-table": ORDERS_ID,
          aggregation: [["avg", ["field", ORDERS.TOTAL, null]]],
          breakout: [["field", ORDERS.CREATED_AT, { "temporal-unit": "year" }]],
        },
        database: SAMPLE_DB_ID,
      },
      display: "line",
      visualization_settings: {
        "graph.dimensions": ["CREATED_AT"],
        "graph.metrics": ["avg"],
      },
    });

    // The chart is pinned to zero by default: 0 tick should exist
    H.echartsContainer().findByText("0");

    H.openVizSettingsSidebar();
    cy.findByTestId("chartsettings-sidebar").within(() => {
      cy.findByText("Axes").click();
      cy.findByText("Unpin from zero").click();
    });

    // Ensure unpinned chart does not have 0 tick
    H.echartsContainer().findByText("0").should("not.exist");

    cy.findByTestId("chartsettings-sidebar")
      .findByText("Unpin from zero")
      .click();

    H.echartsContainer().findByText("0");
  });

  it("should display an error message when there are more series than the chart supports", () => {
    H.visitQuestionAdhoc({
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

    // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
    cy.findByText(
      "This chart type doesn't support more than 100 series of data.",
    );
  });

  it("should correctly display tooltip values when X-axis is numeric and style is 'Ordinal' (metabase#15998)", () => {
    H.visitQuestionAdhoc({
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

    H.cartesianChartCircleWithColor("#509EE3").eq(3).realHover();
    H.assertEChartsTooltip({
      header: "2.7",
      rows: [
        {
          color: "#509EE3",
          name: "Count",
          value: "191",
        },
        {
          color: "#88BF4D",
          name: "Sum of Total",
          value: "14,747.05",
        },
        {
          color: "#A989C5",
          name: "Average of Quantity",
          value: "4.3",
        },
      ],
    });
  });

  it("should be possible to update/change label for an empty row value (metabase#12128)", () => {
    H.visitQuestionAdhoc({
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

    H.openVizSettingsSidebar();

    // Make sure we can update input with some existing value
    H.openSeriesSettings("cat1", true);
    H.popover().within(() => {
      cy.findByDisplayValue("cat1").type(" new").blur();
      cy.findByDisplayValue("cat1 new");
      cy.wait(500);
    });
    // Now do the same for the input with no value
    H.openSeriesSettings("(empty)", true);
    H.popover().within(() => {
      cy.findAllByTestId("series-name-input").clear().type("cat2").blur();
      cy.findByDisplayValue("cat2");
    });
    cy.button("Done").click();

    cy.findAllByTestId("legend-item")
      .should("contain", "cat1 new")
      .and("contain", "cat2")
      .and("contain", "cat3");
  });

  it("should interpolate null value by not rendering a data point (metabase#4122)", () => {
    H.visitQuestionAdhoc({
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

    H.cartesianChartCircle().should("have.length", 2);
  });

  it("should show the trend line", () => {
    H.visitQuestionAdhoc({
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

    H.trendLine().should("be.visible");
  });

  it("should show label for empty value series breakout (metabase#32107)", () => {
    H.visitQuestionAdhoc({
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

    H.openVizSettingsSidebar();
    cy.findByTestId("chartsettings-sidebar").findByText("(empty)");
  });

  describe("y-axis splitting (metabase#12939)", () => {
    it("should not split the y-axis when columns are of the same semantic_type and have close values", () => {
      H.visitQuestionAdhoc({
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
      H.visitQuestionAdhoc({
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

      H.echartsContainer().within(() => {
        cy.findByText("Average of Latitude").should("be.visible");
        cy.findByText("Average of Longitude").should("be.visible");
      });
    });

    it("should split the y-axis when columns are of the same semantic_type but have far values", () => {
      H.visitQuestionAdhoc({
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

      H.echartsContainer().within(() => {
        cy.findByText("Sum of Total").should("be.visible");
        cy.findByText("Min of Total").should("be.visible");
      });
    });

    it("should not split the y-axis when the setting is disabled", () => {
      H.visitQuestionAdhoc({
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

  describe("color series", () => {
    it("should allow drag and drop", () => {
      const testQuery = {
        type: "query",
        query: {
          "source-table": ORDERS_ID,
          aggregation: [["count"], ["sum", ["field", ORDERS.TOTAL, null]]],
          breakout: [
            ["datetime-field", ["field-id", ORDERS.CREATED_AT], "month"],
          ],
        },
        database: SAMPLE_DB_ID,
      };

      H.visitQuestionAdhoc({
        dataset_query: testQuery,
        display: "line",
      });

      H.openVizSettingsSidebar();

      // making sure the grabber icon is there
      cy.findAllByTestId("chart-setting-select")
        .then(($elements) => {
          for (const element of $elements) {
            if (element.value === "Sum of Total") {
              return cy.wrap(element);
            }
          }
        })
        .closest("[data-testid=chartsettings-field-picker]")
        .icon("grabber");

      cy.log("Drag and drop the first y-axis field to the last position");
      cy.findAllByTestId("chart-setting-select").then((initial) => {
        cy.findByTestId("chart-settings-widget-graph.metrics").within(() => {
          cy.findAllByTestId("drag-handle").first().as("dragElement");
          H.moveDnDKitElementByAlias("@dragElement", {
            vertical: 50,
          });
        });

        cy.findAllByTestId("chart-setting-select").should((content) => {
          expect(content[0].value).to.eq(initial[0].value); // Created At: Month
          expect(content[1].value).to.eq(initial[2].value); // Sum of Total
          expect(content[2].value).to.eq(initial[1].value); // Count
        });
      });
    });

    it("should allow changing a series' color - #53735", () => {
      H.visitQuestionAdhoc({
        dataset_query: testQuery,
        display: "line",
      });

      H.openVizSettingsSidebar();
      H.openSeriesSettings("Count");

      H.popover().within(() => {
        cy.findByTestId("color-selector-button").button().click();
      });

      H.popover()
        .should("have.length", 2)
        .last()
        .within(() => {
          cy.findByLabelText("#EF8C8C").realClick();
        });

      cy.button("Done").click();

      H.cartesianChartCircleWithColor("#EF8C8C");
    });
  });

  describe("problems with the labels when showing only one row in the results (metabase#12782, metabase#4995)", () => {
    beforeEach(() => {
      H.visitQuestionAdhoc({
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
      // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
      cy.findByText("Category is Doohickey");
    });

    it("should not drop the chart legend (metabase#4995)", () => {
      cy.findAllByTestId("legend-item").should("contain", "Doohickey");

      cy.log("Ensure that legend is hidden when not dealing with multi series");
      H.openVizSettingsSidebar();
      cy.findByTestId("remove-CATEGORY").click();
      H.queryBuilderMain().should("not.contain", "Doohickey");
    });

    it("should display correct axis labels (metabase#12782)", () => {
      H.echartsContainer()
        .get("text")
        .contains("Created At")
        .should("be.visible");
      H.echartsContainer()
        .get("text")
        .contains("Average of Price")
        .should("be.visible");
    });
  });

  it("should apply brush filters to the series selecting area range when axis is a number", () => {
    const testQuery = {
      type: "query",
      query: {
        "source-table": ORDERS_ID,
        aggregation: [["count"]],
        breakout: [["field", ORDERS.QUANTITY]],
      },
      database: SAMPLE_DB_ID,
    };

    cy.viewport(1280, 800);

    H.visitQuestionAdhoc({
      dataset_query: testQuery,
      display: "line",
    });

    H.queryBuilderMain().within(() => {
      H.echartsContainer().findByText("Quantity").should("exist");
    });
    cy.wait(100); // wait to avoid grabbing the svg before the chart redraws

    cy.findByTestId("query-visualization-root")
      .trigger("mousedown", 180, 200)
      .trigger("mousemove", 180, 200)
      .trigger("mouseup", 220, 200);

    cy.wait("@dataset");

    cy.findByTestId("filter-pill").should(
      "contain.text",
      "Quantity is between",
    );
    const X_AXIS_VALUE = 8;
    H.echartsContainer().within(() => {
      cy.get("text").contains("Quantity").should("be.visible");
      cy.findByText(X_AXIS_VALUE);
    });
  });

  it("should format goal tooltip value to match y-axis tick formatting", () => {
    H.visitQuestionAdhoc({
      dataset_query: {
        type: "query",
        query: {
          "source-table": ORDERS_ID,
          aggregation: [["sum", ["field", ORDERS.TOTAL, null]]],
          breakout: [
            ["datetime-field", ["field-id", ORDERS.CREATED_AT], "month"],
          ],
        },
        database: SAMPLE_DB_ID,
      },
      display: "line",
      visualization_settings: {
        "graph.goal_value": 5000,
        "graph.show_goal": true,
        "graph.label_value_formatting": "compact",
        column_settings: {
          '["name","sum"]': {
            number_style: "currency",
            currency: "USD",
          },
        },
      },
    });

    H.echartsContainer().findByText("$50.0k").should("exist");
    H.echartsContainer().findByText("Goal").trigger("mousemove");

    H.popover().within(() => {
      cy.findByText("Goal:").should("exist");
      cy.findByText("$5,000.00").should("exist");
    });
  });

  it("should support formatting goal tooltip value as a percent", () => {
    H.visitQuestionAdhoc({
      dataset_query: testQuery,
      display: "line",
      visualization_settings: {
        "graph.goal_value": 123.4567,
        "graph.show_goal": true,
        "graph.label_value_formatting": "compact",
        column_settings: {
          '["name","count"]': {
            number_style: "percent",
          },
        },
      },
    });

    H.echartsContainer().findByText("50.0k%").should("exist");
    H.echartsContainer().findByText("Goal").trigger("mousemove");

    H.popover().within(() => {
      cy.findByText("Goal:").should("exist");
      cy.findByText("12,345.67%").should("exist");
    });
  });
});
