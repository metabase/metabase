const { H } = cy;
import { SAMPLE_DB_ID } from "e2e/support/cypress_data";
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";

const { ORDERS, ORDERS_ID, PRODUCTS, PRODUCTS_ID } = SAMPLE_DATABASE;

const testQuery = {
  type: "query",
  database: SAMPLE_DB_ID,
  query: {
    "source-table": ORDERS_ID,
    aggregation: [["count"]],
    breakout: [
      ["field", ORDERS.CREATED_AT, { "temporal-unit": "year" }],
      [
        "field",
        ORDERS.TOTAL,
        { binning: { strategy: "num-bins", "num-bins": 50 } },
      ],
    ],
  },
};

const singleSeriesQuestion = {
  dataset_query: testQuery,
  display: "boxplot",
  visualization_settings: {
    "graph.dimensions": ["CREATED_AT"],
  },
};

describe("scenarios > visualizations > boxplot", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsNormalUser();
  });

  it("should render boxplot and update chart on display settings changes", () => {
    H.visitQuestionAdhoc(singleSeriesQuestion);

    // 5 Boxes: 2022-2026
    H.BoxPlot.getBoxes().should("have.length", 5);

    // By default: Tukey whiskers, outliers shown, mean shown
    H.BoxPlot.getPoints().should("have.length", 1); // Only one outlier
    H.BoxPlot.getMeanMarkers().should("have.length", 5);

    // Open settings and change whisker type to Min/Max
    H.openVizSettingsSidebar();
    H.leftSidebar().within(() => {
      cy.findByText("Display").click();
      cy.findByText("Whiskers extend to").should("exist");
      cy.findByText("1.5 × interquartile range").should("exist");
      cy.findByText("Min/Max").click();
    });

    // With Min/Max whiskers, there should be no outliers
    H.BoxPlot.getPoints().should("not.exist");

    // "Outliers only" option should be hidden when Min/Max is selected
    H.leftSidebar().findByText("Outliers only").should("not.exist");

    // Change points mode to show all points
    H.leftSidebar().findByText("All points").click();
    H.BoxPlot.getPoints().should("have.length.at.least", 5);

    // Hide points entirely
    H.leftSidebar().findByText("None").click();
    H.BoxPlot.getPoints().should("not.exist");

    // Toggle mean off
    H.leftSidebar().findByText("Show mean").click();
    H.BoxPlot.getMeanMarkers().should("not.exist");

    // Toggle mean back on
    H.leftSidebar().findByText("Show mean").click();
    H.BoxPlot.getMeanMarkers().should("have.length", 5);
  });

  it("should show and configure data labels", () => {
    H.visitQuestionAdhoc(singleSeriesQuestion);

    H.openVizSettingsSidebar();
    H.leftSidebar().within(() => {
      cy.findByText("Display").click();
      cy.findByText("Show values on data points").click();
    });

    // After enabling, "Values to display" option appears with segmented buttons
    H.leftSidebar().within(() => {
      cy.findByText("Values to display").should("exist");
      cy.findByRole("button", { name: "Median only" }).should("exist");
      cy.findByRole("button", { name: "All" }).click();
    });

    // Verify label value appears
    H.echartsContainer().findByText("412").should("exist");

    // Disable "Hide overlapping labels" to show more labels
    H.leftSidebar().findByText("Hide overlapping labels").click();
    H.echartsContainer().findByText("91.75").should("exist");

    // Test "Auto formatting" segmented button
    H.leftSidebar().within(() => {
      cy.findByText("Auto formatting").should("exist");
      cy.findByRole("button", { name: "Full" }).click();
    });
  });

  it("should display tooltips on hover", () => {
    H.visitQuestionAdhoc(singleSeriesQuestion);

    // Hover over a box element from the left side to avoid mean marker overlap
    H.BoxPlot.getBoxes().first().trigger("mousemove", "left");
    H.assertEChartsTooltip({
      header: "2022",
      rows: [
        { name: "Upper whisker", value: "84" },
        { name: "Q3 (75th percentile)", value: "59" },
        { name: "Median", value: "35" },
        { name: "Mean", value: "39.16" },
        { name: "Q1 (25th percentile)", value: "15.5" },
        { name: "Lower whisker", value: "1" },
      ],
    });

    // Hover over the outlier point
    H.BoxPlot.getPoints().first().trigger("mousemove");
    H.assertEChartsTooltip({
      header: "2026 (outlier)",
      rows: [
        { name: "Count", value: "189" },
        { name: "Total: 50 bins", value: "70 – 75" },
      ],
    });
  });

  it("should support axis customization", () => {
    H.visitQuestionAdhoc(singleSeriesQuestion);

    H.openVizSettingsSidebar();
    H.leftSidebar().findByText("Axes").click();

    // Add y-axis label
    H.leftSidebar().within(() => {
      cy.findByDisplayValue("Count").clear().type("Count Label");
    });
    H.echartsContainer().findByText("Count Label").should("exist");

    // Add x-axis label
    H.leftSidebar().within(() => {
      cy.findByDisplayValue("Created At: Year").clear().type("Year Label");
    });
    H.echartsContainer().findByText("Year Label").should("exist");

    // Toggle auto y-axis range
    // Before toggling auto y-axis range, the y-axis labels contains 600
    H.echartsContainer().findByText("600");

    H.leftSidebar().findByText("Auto y-axis range").click();
    H.echartsContainer().within(() => {
      cy.findByText("100"); // Y-axis label since default non-auto range is [0, 100]
      cy.findByText("600").should("not.exist");
    });
  });

  it("should display goal line when configured", () => {
    H.visitQuestionAdhoc(singleSeriesQuestion);

    H.openVizSettingsSidebar();
    H.leftSidebar().findByText("Display").click();
    H.leftSidebar().findByText("Goal line").click();

    H.leftSidebar().within(() => {
      cy.findByLabelText("Goal value").clear().type("100");
      cy.findByLabelText("Goal label").clear().type("Target");
    });

    H.echartsContainer().findByText("Target").should("exist");
    H.goalLine().should("exist");
  });

  it("should render in dashboard and support drill-through on boxes and outliers", () => {
    H.createQuestionAndDashboard({
      questionDetails: {
        name: "BoxPlot Dashboard Test",
        query: singleSeriesQuestion.dataset_query.query,
        display: "boxplot",
        visualization_settings: singleSeriesQuestion.visualization_settings,
      },
    }).then(({ body: dashcard }) => {
      H.visitDashboard(dashcard.dashboard_id);
    });

    H.echartsContainer().should("be.visible");
    // Verify boxplot renders in dashboard context (5 boxes: 2022-2026)
    H.BoxPlot.getBoxes().should("have.length", 5);
    H.BoxPlot.getMeanMarkers().should("have.length", 5);

    // Click on a box to trigger drill-through (click left to avoid mean marker overlap)
    H.BoxPlot.getBoxes().first().click("left");

    // Click "See these Orders" to drill down
    H.popover().findByText("See these Orders").click();

    // Should navigate to filtered table view with dimension filter applied
    cy.findByTestId("filter-pill").should(
      "have.text",
      "Created At: Year is Jan 1 – Dec 31, 2022",
    );

    // Verify we're viewing a table with results
    H.tableInteractiveBody().contains("79.37").should("exist");

    // Go back to dashboard
    cy.findByLabelText("Back to Test Dashboard").click();

    // Click on an outlier point
    H.BoxPlot.getPoints().first().click();

    // Should show drill options
    H.popover().within(() => {
      cy.findByText("See these Orders").should("exist");
    });

    H.popover().findByText("See these Orders").click();

    // Should filter to specific dimension and show table
    cy.findByTestId("filter-pill").should(
      "have.text",
      "Created At: Year is Jan 1 – Dec 31, 2026",
    );

    // Verify we're viewing a table with results
    H.tableInteractiveBody().contains("97.44").should("exist");
  });

  describe("multi-series", () => {
    const breakoutQuery = {
      type: "query",
      database: SAMPLE_DB_ID,
      query: {
        "source-table": ORDERS_ID,
        aggregation: [["count"]],
        breakout: [
          ["field", ORDERS.CREATED_AT, { "temporal-unit": "year" }],
          [
            "field",
            ORDERS.TOTAL,
            { binning: { strategy: "num-bins", "num-bins": 50 } },
          ],
          ["field", PRODUCTS.CATEGORY, { "source-field": ORDERS.PRODUCT_ID }],
        ],
      },
    };

    const twoMetricsQuery = {
      type: "query",
      database: SAMPLE_DB_ID,
      query: {
        "source-table": ORDERS_ID,
        aggregation: [["count"], ["sum", ["field", ORDERS.QUANTITY, null]]],
        breakout: [
          ["field", ORDERS.CREATED_AT, { "temporal-unit": "year" }],
          [
            "field",
            ORDERS.TOTAL,
            { binning: { strategy: "num-bins", "num-bins": 50 } },
          ],
        ],
      },
    };

    it("should render boxplot with breakout (two dimensions, one metric)", () => {
      H.visitQuestionAdhoc({
        dataset_query: breakoutQuery,
        display: "boxplot",
      });

      // Select dimensions via UI
      H.openVizSettingsSidebar();
      H.leftSidebar().findByText("Data").click();

      // Configure dimensions
      H.leftSidebar().findAllByPlaceholderText("Select a field").eq(0).click();
      H.popover().findByText("Created At: Year").click();
      H.leftSidebar().findByText("Add series breakout").click();
      H.popover().findByText("Product → Category").click();

      // Configure metrics
      H.leftSidebar().findAllByPlaceholderText("Select a field").eq(2).click();
      H.popover().findByText("Count").click();

      // Should have legend items for each category
      cy.findAllByTestId("legend-item").should("have.length", 4);
      cy.findAllByTestId("legend-item").should("contain", "Doohickey");
      cy.findAllByTestId("legend-item").should("contain", "Gadget");
      cy.findAllByTestId("legend-item").should("contain", "Gizmo");
      cy.findAllByTestId("legend-item").should("contain", "Widget");

      // Should have 5 boxes per category (5 years × 4 categories = 20 boxes)
      H.BoxPlot.getBoxes().should("have.length", 20);

      // Hover over a box and verify tooltip shows breakout value
      H.BoxPlot.getBoxes().first().trigger("mousemove", "left");
      H.assertEChartsTooltip({
        header: "2022",
        rows: [
          { name: "Product → Category", value: "Gadget" },
          { name: "Upper whisker", value: "25" },
          { name: "Q3 (75th percentile)", value: "18.25" },
          { name: "Median", value: "12" },
          { name: "Mean", value: "12.44" },
          { name: "Q1 (25th percentile)", value: "6.5" },
          { name: "Lower whisker", value: "1" },
        ],
      });

      // Hide first series (Doohickey)
      cy.findAllByTestId("legend-item")
        .eq(0)
        .findByLabelText("Hide series")
        .click();
      H.BoxPlot.getBoxes().should("have.length", 15);

      // Show it back
      cy.findAllByTestId("legend-item")
        .eq(0)
        .findByLabelText("Show series")
        .click();
      // Move mouse away to reset focus/blur state
      H.echartsContainer().realHover({ position: "top" });
      H.BoxPlot.getBoxes().should("have.length", 20);

      // Verify drill-through includes both dimension and breakout filters
      H.BoxPlot.getBoxes().first().click("left");
      H.popover().findByText("See these Orders").click();

      cy.findAllByTestId("filter-pill").should("have.length", 2);
      cy.findAllByTestId("filter-pill")
        .eq(0)
        .should("have.text", "Created At: Year is Jan 1 – Dec 31, 2022");
      cy.findAllByTestId("filter-pill")
        .eq(1)
        .should("have.text", "Product → Category is Doohickey");

      H.tableInteractiveBody().should("exist");
    });

    it("should render boxplot with two metrics", () => {
      H.visitQuestionAdhoc({
        dataset_query: twoMetricsQuery,
        display: "boxplot",
      });

      // Select via UI
      H.openVizSettingsSidebar();
      H.leftSidebar().findByText("Data").click();

      // Configure dimension
      H.leftSidebar().findAllByPlaceholderText("Select a field").eq(0).click();
      H.popover().findByText("Created At: Year").click();

      // Should have legend items for each metric
      cy.findAllByTestId("legend-item").should("have.length", 2);
      cy.findAllByTestId("legend-item").should("contain", "Count");
      cy.findAllByTestId("legend-item").should("contain", "Sum of Quantity");

      // Should have 5 boxes per metric (5 years × 2 metrics = 10 boxes)
      H.BoxPlot.getBoxes().should("have.length", 10);

      // Hover over a box from the first metric and verify tooltip
      H.BoxPlot.getBoxes().first().trigger("mousemove", "left");
      H.assertEChartsTooltip({
        header: "2022",
        rows: [
          { name: "Upper whisker", value: "84" },
          { name: "Q3 (75th percentile)", value: "59" },
          { name: "Median", value: "35" },
          { name: "Mean", value: "39.16" },
          { name: "Q1 (25th percentile)", value: "15.5" },
          { name: "Lower whisker", value: "1" },
        ],
      });

      // Hide first series (Count)
      cy.findAllByTestId("legend-item")
        .eq(0)
        .findByLabelText("Hide series")
        .click();
      H.BoxPlot.getBoxes().should("have.length", 5);

      // Show it back
      cy.findAllByTestId("legend-item")
        .eq(0)
        .findByLabelText("Show series")
        .click();
      // Move mouse away to reset focus/blur state
      H.echartsContainer().realHover({ position: "top" });
      H.BoxPlot.getBoxes().should("have.length", 10);

      // Verify drill-through applies dimension filter
      H.BoxPlot.getBoxes().first().click("left");
      H.popover().findByText("See these Orders").click();

      cy.findByTestId("filter-pill").should(
        "have.text",
        "Created At: Year is Jan 1 – Dec 31, 2022",
      );

      H.tableInteractiveBody().should("exist");
    });
  });

  it("should support value formatting, axis settings, and series customization", () => {
    // Use Products table: Average of Price by Category and Created at (year)
    const priceByYearQuery = {
      type: "query",
      database: SAMPLE_DB_ID,
      query: {
        "source-table": PRODUCTS_ID,
        aggregation: [["avg", ["field", PRODUCTS.PRICE, null]]],
        breakout: [
          ["field", PRODUCTS.CREATED_AT, { "temporal-unit": "year" }],
          ["field", PRODUCTS.CATEGORY, null],
        ],
      },
    };

    H.visitQuestionAdhoc({
      dataset_query: priceByYearQuery,
      display: "boxplot",
      visualization_settings: {
        "graph.dimensions": ["CREATED_AT"],
        "graph.metrics": ["avg"],
        "graph.show_values": true,
      },
    });

    H.BoxPlot.getBoxes().should("have.length", 4);

    // Set currency formatting via UI using series settings
    H.openVizSettingsSidebar();
    H.openSeriesSettings("Average of Price");
    H.popover().within(() => {
      cy.findByText("Formatting").click();
      cy.findByLabelText("Style").click();
      cy.findByText("Currency").click();
    });

    // Verify formatted value appears in labels (should have $ prefix)
    H.echartsContainer().findByText("$52.13").should("be.visible");
    cy.button("Done").click();

    // Verify formatted tooltip with all currency values
    H.BoxPlot.getBoxes().first().trigger("mousemove", "left");
    H.assertEChartsTooltip({
      header: "2022",
      rows: [
        { name: "Upper whisker", value: "$53.93" },
        { name: "Q3 (75th percentile)", value: "$53.93" },
        { name: "Median", value: "$52.13" },
        { name: "Mean", value: "$52.94" },
        { name: "Q1 (25th percentile)", value: "$51.13" },
        { name: "Lower whisker", value: "$48.62" },
      ],
    });

    H.openVizSettingsSidebar();
    H.leftSidebar().findByText("Axes").click();

    // Default: pinned to zero, y-axis should include 0
    H.echartsContainer().findByText("$0").should("be.visible");
    H.leftSidebar().findByText("Unpin from zero").click();

    // After unpinning, 0 should not be visible (y-axis starts higher since prices are ~$40-80)
    H.echartsContainer().findByText("$0").should("not.exist");
  });
});
