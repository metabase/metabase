const { H } = cy;

import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import {
  FIRST_COLLECTION_ID,
  ORDERS_MODEL_ID,
} from "e2e/support/cypress_sample_instance_data";
import type { StructuredQuestionDetails } from "e2e/support/helpers";

const { ORDERS_ID, ORDERS, PRODUCTS_ID, PRODUCTS } = SAMPLE_DATABASE;

export function createMetrics(metrics: StructuredQuestionDetailsWithName[]) {
  metrics.forEach((metric) => H.createQuestion(metric));
}

type StructuredQuestionDetailsWithName = StructuredQuestionDetails & {
  name: string;
};

export const ORDERS_SCALAR_METRIC: StructuredQuestionDetailsWithName = {
  name: "Count of orders",
  type: "metric",
  description: "A metric",
  query: {
    "source-table": ORDERS_ID,
    aggregation: [["count"]],
  },
  display: "scalar",
};

export const ORDERS_SCALAR_MODEL_METRIC: StructuredQuestionDetailsWithName = {
  name: "Orders model metric",
  type: "metric",
  description: "A metric",
  query: {
    "source-table": `card__${ORDERS_MODEL_ID}`,
    aggregation: [["count"]],
  },
  display: "scalar",
  collection_id: FIRST_COLLECTION_ID as number,
};

export const ORDERS_TIMESERIES_METRIC: StructuredQuestionDetailsWithName = {
  name: "Count of orders over time",
  type: "metric",
  description: "A metric",
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
  display: "line",
};

export const PRODUCTS_SCALAR_METRIC: StructuredQuestionDetailsWithName = {
  name: "Count of products",
  type: "metric",
  description: "A metric",
  query: {
    "source-table": PRODUCTS_ID,
    aggregation: [["count"]],
  },
  display: "scalar",
};

export const NON_NUMERIC_METRIC: StructuredQuestionDetailsWithName = {
  name: "Max of product category",
  type: "metric",
  description: "A metric",
  query: {
    "source-table": PRODUCTS_ID,
    aggregation: [["max", ["field", PRODUCTS.CATEGORY, null]]],
  },
  display: "scalar",
};

const ALL_MODELS = [
  NON_NUMERIC_METRIC,
  ORDERS_SCALAR_METRIC,
  ORDERS_SCALAR_MODEL_METRIC,
  ORDERS_TIMESERIES_METRIC,
  PRODUCTS_SCALAR_METRIC,
];

describe("scenarios > metrics > explorer", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
    createMetrics(ALL_MODELS);
  });

  // ============================================================================
  // Test Helpers
  // ============================================================================

  /**
   * Navigate to the metrics explorer page
   */
  const visitMetricsExplorer = () => {
    cy.visit("/explore");
    cy.get("[data-testid='metrics-viewer']").should("exist");
  };

  /**
   * Add a metric or measure to the explorer via the search panel
   */
  const addMetric = (name: string) => {
    H.MetricsViewer.searchInput().type(name);
    H.MetricsViewer.searchResults().findByText(name).click();
  };

  /**
   * Select a breakout dimension
   */
  const selectBreakout = (
    cardname: string,
    dimensionName: string,
    index = 0,
    binning?: string,
  ) => {
    H.MetricsViewer.searchBarPills().contains(cardname).rightclick();
    H.popover().findByText("Break out").click();
    const breakout = H.popover()
      .findAllByText(dimensionName)
      .eq(index)
      .closest("[role=option]");

    if (binning) {
      breakout.findByTestId("dimension-list-item-binning").realHover().click();
      H.popover().findByRole("menuitem", { name: binning }).click();
    } else {
      breakout.click();
    }
  };

  /**
   * Select a display type for the current tab
   */
  const selectDisplayType = (displayType: string) => {
    cy.findByLabelText("Visualization").click();
    cy.findByText(displayType).click();
  };

  /**
   * Apply a filter to a metric definition
   */
  const applyMetricFilter = (
    metricName: string,
    filterType: string,
    filterValue: string,
  ) => {
    cy.findByText(metricName)
      .parent()
      .within(() => {
        cy.findByLabelText("Filter").click();
      });
    // Filter popover opens
    cy.findByText(filterType).click();
    cy.findByDisplayValue(filterValue).type(filterValue);
    cy.findByText("Add filter").click();
  };

  /**
   * Intercept and wait for dataset query
   */
  const intercedptDatasetQuery = () => {
    cy.intercept("POST", "/api/metric/dataset").as("dataset");
  };

  /**
   * Verify the grid displays the correct number of metric cards
   */
  const verifyMetricCount = (count: number) => {
    H.MetricsViewer.searchBarPills().should("have.length", count);
  };

  /**
   * Get an active tab by its name
   */
  const getTab = (tabName: string) => {
    return cy.findByText(tabName).parent("[role='tab']");
  };

  /**
   * Switch to a specific tab
   */
  const switchToTab = (tabName: string) => {
    H.MetricsViewer.getTab(tabName).click();
  };

  // ============================================================================
  // Entry Points
  // ============================================================================

  describe("Entry points", () => {
    it("should show empty state on first load", () => {
      visitMetricsExplorer();
      cy.url().should("include", "/explore");
      cy.findByRole("heading", { name: "Start exploring" }).should("exist");

      addMetric("Count of products");

      cy.log("should persist state in url");

      cy.reload();
      verifyMetricCount(1);
    });

    it("should handle breakout with no results gracefully", () => {
      createMetrics([
        {
          name: "Empty Metric",
          query: {
            "source-table": 1,
            aggregation: [["count"]],
            filter: ["=", ["field", 2, null], null],
          },
          type: "metric",
        },
      ]);
      visitMetricsExplorer();
      addMetric("Empty Metric");

      cy.findByText(/No dice/).should("exist");
    });
  });

  // ============================================================================
  // Adding Metrics and Measures
  // ============================================================================

  describe("Adding metrics and measures", () => {
    beforeEach(() => {
      intercedptDatasetQuery();
      visitMetricsExplorer();
    });

    it("should add multiple metrics", () => {
      addMetric("Count of products");
      cy.wait("@dataset");
      addMetric("Count of orders");
      cy.wait("@dataset");
      verifyMetricCount(2);

      cy.log("no results");
      H.MetricsViewer.searchInput().type("xyznonexistent");
      H.MetricsViewer.searchResults().should(
        "contain.text",
        "No results found",
      );

      cy.log("does not allow duplicates");
      H.MetricsViewer.searchInput().clear().type("Count of products");
      H.MetricsViewer.searchResults().should(
        "contain.text",
        "No results found",
      );
    });
  });

  // ============================================================================
  // Breakouts
  // ============================================================================

  describe("Breakouts", () => {
    beforeEach(() => {
      intercedptDatasetQuery();
      visitMetricsExplorer();
      addMetric("Count of orders");
      cy.wait("@dataset");
    });

    it("should add a temporal breakout dimension", () => {
      selectBreakout("Count of orders", "Created At", 0, "Year");
      cy.wait("@dataset");
      H.MetricsViewer.breakoutLegend()
        .findByRole("heading", { name: "Created At" })
        .should("be.visible");
    });

    it("should add a categorical breakout dimension", () => {
      selectBreakout("Count of orders", "Source");
      cy.wait("@dataset");
      H.MetricsViewer.breakoutLegend()
        .findByRole("heading", { name: "Source" })
        .should("be.visible");
    });

    it("should add a numeric breakout dimension with default binning", () => {
      selectBreakout("Count of orders", "Total");
      cy.wait("@dataset");
      H.MetricsViewer.breakoutLegend()
        .findByRole("heading", { name: "Total" })
        .should("be.visible");
    });
  });

  // ============================================================================
  // Tabs
  // ============================================================================

  describe("Tabs", () => {
    beforeEach(() => {
      intercedptDatasetQuery();
      visitMetricsExplorer();
      addMetric("Count of orders");
      cy.wait("@dataset");
    });

    it("should switch between tabs", () => {
      H.MetricsViewer.tabsShouldBe([
        "All dimensions",
        "Created At",
        "State",
        "Category",
        "Vendor",
      ]);
      H.MetricsViewer.assertVizType("Line");

      switchToTab("State");
      H.MetricsViewer.assertVizType("Map");

      switchToTab("Category");
      H.MetricsViewer.assertVizType("Bar");

      cy.log("should allow changing display types");
      H.MetricsViewer.changeVizType("line");
      H.MetricsViewer.assertVizType("Line");
    });
  });

  // ============================================================================
  // Split View Mode
  // ============================================================================

  describe("Visualization settings", () => {
    beforeEach(() => {
      intercedptDatasetQuery();
      visitMetricsExplorer();
      addMetric("Count of orders");
      cy.wait("@dataset");
    });

    it("should allow to split the view when multiple metrics are present", () => {
      H.MetricsViewer.getLayoutControls()
        .findByRole("button", { name: "split view" })
        .should("not.exist");
      addMetric("Count of products");
      cy.wait("@dataset");
      H.MetricsViewer.getAllMetricVisualizations().should("have.length", 1);

      H.MetricsViewer.getLayoutControls()
        .findByRole("button", { name: "split view" })
        .click();
      H.MetricsViewer.getAllMetricVisualizations().should("have.length", 2);

      selectBreakout("Count of orders", "Source");
      H.MetricsViewer.getAllMetricVisualizations().should("have.length", 6);
      H.MetricsViewer.getLayoutControls()
        .findByRole("button", { name: "unified view" })
        .click();
      H.MetricsViewer.getAllMetricVisualizations().should("have.length", 1);
    });
  });

  // ============================================================================
  // Filters
  // ============================================================================

  describe.skip("Filters", () => {
    beforeEach(() => {
      intercedptDatasetQuery();
      visitMetricsExplorer();
      addMetric("Count");
      cy.wait("@dataset");
    });

    it("should apply a categorical filter to a metric", () => {
      cy.get("[data-testid='metrics-viewer-card']").within(() => {
        cy.findByLabelText("Filter").click();
      });
      cy.findByText("Status").click();
      cy.findByText("New").click();
      cy.findByText("Apply filter").click();
      cy.wait("@dataset");
      // Verify metric is filtered
      cy.get("[data-testid='metrics-filter-pills']").should(
        "contain.text",
        "Status",
      );
    });

    it("should apply a numeric range filter to a metric", () => {
      cy.get("[data-testid='metrics-viewer-card']").within(() => {
        cy.findByLabelText("Filter").click();
      });
      cy.findByText("ID").click();
      cy.findByDisplayValue("").first().type("10");
      cy.findByDisplayValue("").last().type("100");
      cy.findByText("Apply filter").click();
      cy.wait("@dataset");
      cy.get("[data-testid='metrics-filter-pills']").should(
        "contain.text",
        "ID",
      );
    });

    it("should apply a temporal filter to a metric", () => {
      cy.get("[data-testid='metrics-viewer-card']").within(() => {
        cy.findByLabelText("Filter").click();
      });
      cy.findByText("Created At").click();
      cy.findByPlaceholderText("Start date").type("03/01/2025");
      cy.findByText("Apply filter").click();
      cy.wait("@dataset");
      cy.get("[data-testid='metrics-filter-pills']").should(
        "contain.text",
        "Created At",
      );
    });

    it("should apply multiple filters to a single metric", () => {
      // Apply first filter
      cy.get("[data-testid='metrics-viewer-card']").within(() => {
        cy.findByLabelText("Filter").click();
      });
      cy.findByText("Status").click();
      cy.findByText("New").click();
      cy.findByText("Apply filter").click();
      cy.wait("@dataset");

      // Apply second filter
      cy.get("[data-testid='metrics-viewer-card']").within(() => {
        cy.findByLabelText("Filter").click();
      });
      cy.findByText("ID").click();
      cy.findByDisplayValue("").first().type("5");
      cy.findByText("Apply filter").click();
      cy.wait("@dataset");

      cy.get("[data-testid='metrics-filter-pills']").should("have.length", 2);
    });

    it("should remove a filter from a metric", () => {
      cy.get("[data-testid='metrics-viewer-card']").within(() => {
        cy.findByLabelText("Filter").click();
      });
      cy.findByText("Status").click();
      cy.findByText("New").click();
      cy.findByText("Apply filter").click();
      cy.wait("@dataset");

      cy.get("[data-testid='filter-pill-remove']").first().click();
      cy.wait("@dataset");
      cy.get("[data-testid='metrics-filter-pills']").should("not.exist");
    });

    it("should handle metric with filter that excludes all data", () => {
      cy.get("[data-testid='metrics-viewer-card']").within(() => {
        cy.findByLabelText("Filter").click();
      });
      cy.findByText("ID").click();
      cy.findByDisplayValue("").first().type("999999");
      cy.findByDisplayValue("").last().type("999999");
      cy.findByText("Apply filter").click();
      cy.wait("@dataset");
      cy.findByText("No data").should("exist");
    });
  });

  // ============================================================================
  // Drill Through
  // ============================================================================

  describe("Drill through", () => {
    beforeEach(() => {
      intercedptDatasetQuery();
      visitMetricsExplorer();
      addMetric("Count of orders");
      cy.wait("@dataset");
    });

    it.only("should drill into more graual time dimensions on timeseries chart", () => {
      H.MetricsViewer.getMerticControls()
        .findByRole("button", { name: /by month/ })
        .should("exist");
      H.MetricsViewer.getMetricVisualization()
        .get("path[fill='hsla(0, 0%, 100%, 1.00)']")
        .eq(4)
        .click();
      H.popover().findByText("See this month by week").click();

      H.MetricsViewer.getMerticControls()
        .findByRole("button", { name: /by week/ })
        .should("exist");
      H.MetricsViewer.getMetricVisualization()
        .get("path[fill='hsla(0, 0%, 100%, 1.00)']")
        .should("have.length", 5);
    });
  });
});
