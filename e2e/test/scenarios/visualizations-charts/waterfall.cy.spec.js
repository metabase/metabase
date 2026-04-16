const { H } = cy;
import { SAMPLE_DB_ID } from "e2e/support/cypress_data";
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";

const { ORDERS, ORDERS_ID, PRODUCTS } = SAMPLE_DATABASE;

describe("scenarios > visualizations > waterfall", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsNormalUser();
  });

  function verifyWaterfallRendering(xLabel = null, yLabel = null) {
    H.chartPathWithFillColor("#88BF4D").should("be.visible"); // A bar
    H.chartPathWithFillColor("#303D46").should("be.visible"); // Total bar
    H.echartsContainer().get("text").contains("Total");

    if (xLabel) {
      H.echartsContainer().get("text").contains(xLabel);
    }
    if (yLabel) {
      H.echartsContainer().get("text").contains(yLabel);
    }
  }

  it("should work with ordinal series", () => {
    H.startNewNativeQuestion();
    H.NativeEditor.type(
      "select 'A' as product, 10 as profit union select 'B' as product, -4 as profit",
    );
    cy.findByTestId("native-query-editor-container").icon("play").click();
    // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
    cy.contains("Visualization").click();
    cy.icon("waterfall").click();

    verifyWaterfallRendering("PRODUCT", "PROFIT");
  });

  it("should work with ordinal series and numeric X-axis (metabase#15550)", () => {
    H.startNewNativeQuestion();
    H.NativeEditor.type("select 1 as X, 20 as Y union select 2 as X, -10 as Y");

    cy.findByTestId("native-query-editor-container").icon("play").click();
    // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
    cy.contains("Visualization").click();
    switchToWaterfallDisplay();

    H.sidebar().findAllByPlaceholderText("Select a field").first().click();
    H.popover().findByText("X").click();

    // eslint-disable-next-line metabase/no-unsafe-element-filtering
    H.sidebar().findAllByPlaceholderText("Select a field").last().click();
    H.popover().findByText("Y").click();

    // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
    cy.contains("Axes").click();

    H.sidebar().findAllByDisplayValue("Linear").first().click();
    H.popover().findByText("Ordinal").click();

    verifyWaterfallRendering("X", "Y");
  });

  it("should work with quantitative series", () => {
    H.startNewNativeQuestion();
    H.NativeEditor.type("select 1 as X, 10 as Y union select 2 as X, -2 as Y");
    cy.findByTestId("native-query-editor-container").icon("play").click();
    // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
    cy.contains("Visualization").click();
    switchToWaterfallDisplay();

    H.sidebar().findAllByPlaceholderText("Select a field").first().click();
    H.popover().findByText("X").click();

    // eslint-disable-next-line metabase/no-unsafe-element-filtering
    H.sidebar().findAllByPlaceholderText("Select a field").last().click();
    H.popover().findByText("Y").click();

    verifyWaterfallRendering("X", "Y");
  });

  it("should work with time-series data", () => {
    H.openOrdersTable({ mode: "notebook" });
    H.summarize({ mode: "notebook" });
    // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Count of rows").click();
    // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Pick a column to group by").click();
    // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Created At").click();
    // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Filter").click();
    // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Custom Expression").click();
    H.CustomExpressionEditor.type(
      "between([Created At: Month], '2022-01-01', '2022-08-01')",
    ).blur();
    cy.button("Done").click();

    H.visualize();

    // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
    cy.contains("Visualization").click();
    switchToWaterfallDisplay();

    verifyWaterfallRendering("Created At", "Count");
  });

  it("should hide the Total label if there is no space", () => {
    H.openOrdersTable({ mode: "notebook" });
    H.summarize({ mode: "notebook" });
    // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Count of rows").click();
    // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Pick a column to group by").click();
    // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Created At").click();

    H.visualize();

    // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
    cy.contains("Visualization").click();
    switchToWaterfallDisplay();

    H.echartsContainer().get("text").contains("Total").should("not.exist");
  });

  describe("multi-series (metabase#15152)", () => {
    const DATASET_QUERY = {
      type: "query",
      query: {
        "source-table": ORDERS_ID,
        aggregation: [["count"], ["sum", ["field-id", ORDERS.TOTAL]]],
        breakout: [["field", ORDERS.CREATED_AT, { "temporal-unit": "year" }]],
      },
      database: SAMPLE_DB_ID,
    };

    function testSwitchingToWaterfall() {
      H.openVizTypeSidebar();
      switchToWaterfallDisplay();

      H.echartsContainer().within(() => {
        cy.findByText("Created At: Year").should("exist"); // x-axis
        cy.findByText("Count").should("exist"); // y-axis
        cy.findByText("Sum of Total").should("not.exist");

        // x-axis labels (some)
        ["2022", "2023", "2026", "Total"].forEach((label) => {
          cy.findByText(label).should("exist");
        });

        // y-axis labels (some)
        ["0", "3,000", "6,000", "18,000", "21,000"].forEach((label) => {
          cy.findByText(label).should("exist");
        });
      });

      H.leftSidebar().within(() => {
        cy.findByDisplayValue("Count").should("exist");
        cy.findByDisplayValue("Sum of Total").should("not.exist");
        cy.findByText(/Add another/).should("not.exist");

        cy.findByDisplayValue("Count").click();
      });
      H.popover().findByText("Sum of Total").click();
      H.leftSidebar().within(() => {
        cy.findByDisplayValue("Sum of Total").should("exist");
        cy.findByDisplayValue("Count").should("not.exist");
      });

      H.echartsContainer().within(() => {
        cy.findByText("Sum of Total").should("exist"); // x-axis
        cy.findByText("Created At: Year").should("exist"); // y-axis
        cy.findByText("Count").should("not.exist");

        // x-axis labels (some)
        ["2022", "2023", "2026", "Total"].forEach((label) => {
          cy.findByText(label).should("exist");
        });

        // y-axis labels (some)
        ["0", "300,000", "900,000", "1,800,000"].forEach((label) => {
          cy.findByText(label).should("exist");
        });
      });
    }

    it("should correctly switch into single-series mode for ad-hoc queries", () => {
      H.visitQuestionAdhoc({ dataset_query: DATASET_QUERY, display: "line" });
      testSwitchingToWaterfall();
    });

    it("should correctly switch into single-series mode for ad-hoc queries", () => {
      H.createQuestion(
        { name: "Q1", query: DATASET_QUERY.query, display: "line" },
        { visitQuestion: true },
      );
      testSwitchingToWaterfall();
    });
  });

  it("should not allow you to choose X-axis breakout", () => {
    H.visitQuestionAdhoc({
      dataset_query: {
        type: "query",
        query: {
          "source-table": ORDERS_ID,
          aggregation: [["count"]],
          breakout: [
            ["field", ORDERS.CREATED_AT, { "temporal-unit": "year" }],
            ["field", PRODUCTS.CATEGORY, { "source-field": ORDERS.PRODUCT_ID }],
          ],
        },
        database: SAMPLE_DB_ID,
      },
      display: "line",
    });

    // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Visualization").click();
    switchToWaterfallDisplay();

    H.sidebar().findAllByPlaceholderText("Select a field").first().click();
    H.popover().findByText("Created At: Year").click();

    // eslint-disable-next-line metabase/no-unsafe-element-filtering
    H.sidebar().findAllByPlaceholderText("Select a field").last().click();
    H.popover().findByText("Count").click();

    H.echartsContainer().should("exist"); // Chart renders after adding a metric

    // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
    cy.findByText(/Add another/).should("not.exist");
  });

  it("should work for unaggregated data (metabase#15465)", () => {
    H.visitQuestionAdhoc({
      dataset_query: {
        type: "native",
        native: {
          query:
            "SELECT parsedatetime('2026-01-01', 'yyyy-MM-dd') AS \"d\", 1 AS \"c\" UNION ALL\nSELECT parsedatetime('2026-01-01', 'yyyy-MM-dd') AS \"d\", 2 AS \"c\" UNION ALL\nSELECT parsedatetime('2026-01-02', 'yyyy-MM-dd') AS \"d\", 3 AS \"c\"",
        },
        database: SAMPLE_DB_ID,
      },
    });
    // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Visualization").click();
    cy.icon("waterfall").click({ force: true });
    H.chartPathWithFillColor("#88BF4D").should("be.visible");
  });

  it("should display correct values when one of them is 0 (metabase#16246)", () => {
    H.visitQuestionAdhoc({
      dataset_query: {
        type: "native",
        native: {
          query:
            "SELECT * FROM (\nVALUES \n('a',2),\n('b',1),\n('c',-0.5),\n('d',-0.5),\n('e',0.1),\n('f',0),\n('g', -2)\n)\n",
          "template-tags": {},
        },
        database: SAMPLE_DB_ID,
      },
      display: "waterfall",
      visualization_settings: {
        "graph.show_values": true,
      },
    });

    // eslint-disable-next-line metabase/no-unsafe-element-filtering
    getWaterfallDataLabels()
      .as("labels")
      .eq(-3)
      .invoke("text")
      .should("eq", "0");

    // eslint-disable-next-line metabase/no-unsafe-element-filtering
    cy.get("@labels").last().invoke("text").should("eq", "0.1");
  });

  it("should now display null values (metabase#16246)", () => {
    H.visitQuestionAdhoc({
      dataset_query: {
        type: "native",
        native: {
          query:
            "SELECT * FROM (\nVALUES \n('a',2),\n('b',1),\n('c',-0.5),\n('d',-0.5),\n('e',0.1),\n('f',null),\n('g', -2)\n)\n",
          "template-tags": {},
        },
        database: SAMPLE_DB_ID,
      },
      display: "waterfall",
      visualization_settings: {
        "graph.show_values": true,
      },
    });

    // the null data label which should exist at index -3
    // should now display no label. so the label at index -3 should be the label
    // before the null data point
    // eslint-disable-next-line metabase/no-unsafe-element-filtering
    getWaterfallDataLabels()
      .as("labels")
      .eq(-3)
      .invoke("text")
      .should("eq", "0.1");

    // but the x-axis label and area should still be shown for the null data point
    H.echartsContainer().findByText("f");

    // eslint-disable-next-line metabase/no-unsafe-element-filtering
    getWaterfallDataLabels()
      .as("labels")
      .eq(-2)
      .invoke("text")
      .should("eq", "(2)");

    // eslint-disable-next-line metabase/no-unsafe-element-filtering
    cy.get("@labels").last().invoke("text").should("eq", "0.1");
  });

  it("should correctly apply column value scaling in tool-tips (metabase#44176)", () => {
    H.visitQuestionAdhoc({
      dataset_query: {
        type: "native",
        native: {
          query:
            "SELECT * FROM (\nVALUES \n('a',2),\n('b',1),\n('c',-0.5),\n('d',-0.5),\n('e',0.1),\n('f', -2)\n)\n",
          "template-tags": {},
        },
        database: SAMPLE_DB_ID,
      },
      display: "waterfall",
      visualization_settings: {
        "graph.show_values": true,
        column_settings: { '["name","C2"]': { scale: 0.1 } },
      },
    });

    getWaterfallDataLabels().first().invoke("text").should("eq", "0.2");

    H.chartPathWithFillColor("#88BF4D").first().trigger("mousemove");

    H.assertEChartsTooltip({
      rows: [
        {
          name: "C2",
          value: "0.2",
        },
      ],
    });
  });

  it("should allow adding non-series columns to the tooltip", () => {
    const INCREASE_COLOR = "#00FF00";

    function getFirstWaterfallSegment() {
      return H.echartsContainer()
        .find(`path[fill='${INCREASE_COLOR}']`)
        .first();
    }

    H.visitQuestionAdhoc({
      display: "waterfall",
      dataset_query: {
        type: "query",
        database: SAMPLE_DB_ID,
        query: {
          "source-table": ORDERS_ID,
          aggregation: [["count"], ["sum", ["field-id", ORDERS.TOTAL]]],
          breakout: [["field", ORDERS.CREATED_AT, { "temporal-unit": "year" }]],
        },
      },
      visualization_settings: {
        "waterfall.increase_color": INCREASE_COLOR,
      },
    });

    getFirstWaterfallSegment().realHover();
    H.assertEChartsTooltip({
      header: "2022",
      rows: [{ name: "Count", value: "744", color: INCREASE_COLOR }],
    });
    H.assertEChartsTooltipNotContain(["Sum of Total"]);

    H.openVizSettingsSidebar();

    H.leftSidebar().within(() => {
      cy.findByText("Display").click();
      cy.findByPlaceholderText("Enter column names").click();
    });
    cy.findByRole("option", { name: "Sum of Total" }).click();

    getFirstWaterfallSegment().realHover();
    H.assertEChartsTooltip({
      header: "2022",
      rows: [
        { name: "Count", value: "744", color: INCREASE_COLOR },
        { name: "Sum of Total", value: "42,156.87" },
      ],
    });
  });

  it("should show tooltip when hovering the total bar (metabase#48118)", () => {
    H.visitQuestionAdhoc({
      display: "waterfall",
      dataset_query: {
        type: "query",
        database: SAMPLE_DB_ID,
        query: {
          "source-table": ORDERS_ID,
          aggregation: [["count"], ["sum", ["field-id", ORDERS.TOTAL]]],
          breakout: [["field", ORDERS.CREATED_AT, { "temporal-unit": "year" }]],
        },
      },
    });

    const totalBarColor = "#303D46";

    H.chartPathWithFillColor(totalBarColor).realHover();

    H.assertEChartsTooltip({
      header: "Total",
      rows: [{ name: "Count", value: "18,760", color: totalBarColor }],
    });
  });

  describe("scenarios > visualizations > waterfall settings", () => {
    beforeEach(() => {
      H.restore();
      cy.signInAsNormalUser();

      H.startNewNativeQuestion();
      H.NativeEditor.type("select 'A' as X, -4.56 as Y");
      cy.findByTestId("native-query-editor-container").icon("play").click();
      // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
      cy.contains("Visualization").click();
      switchToWaterfallDisplay();
    });

    it("should have increase, decrease, and total color options", () => {
      // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
      cy.contains("Display").click();
      // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
      cy.findByText("Increase color").click();
      // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
      cy.findByText("Decrease color").click();
      // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
      cy.findByText("Total color").click();
    });

    it("should allow toggling of the total bar", () => {
      // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
      cy.contains("Display").click();

      cy.get('[data-field-title="Show total"]').within(() => {
        cy.findByRole("switch").click({ force: true });
      });

      H.echartsContainer().get("text").contains("Total").should("not.exist");

      cy.get('[data-field-title="Show total"]').within(() => {
        cy.findByRole("switch").click({ force: true });
      });
      H.echartsContainer().get("text").contains("Total").should("exist");
    });

    it("should allow toggling of value labels", () => {
      // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
      cy.contains("Display").click();

      H.echartsContainer().get("text").contains("(4.56)").should("not.exist");

      cy.get('[data-field-title="Show values on data points"]')
        .findByRole("switch")
        .click({ force: true });
      H.echartsContainer().get("text").contains("(4.56)").should("be.visible");
    });
  });
});

const switchToWaterfallDisplay = () => {
  H.leftSidebar().within(() => {
    cy.findByTestId("more-charts-toggle").then(($toggle) => {
      if (
        $toggle.closest("[aria-expanded]").attr("aria-expanded") === "false"
      ) {
        cy.wrap($toggle).click();
      }
    });
    cy.icon("waterfall").click();
  });
  cy.findByTestId("Waterfall-container").within(() => {
    cy.icon("gear").click();
  });
};

function getWaterfallDataLabels() {
  // paint-order='stroke' targets the waterfall labels only
  return H.echartsContainer().get("text[paint-order='stroke']");
}
