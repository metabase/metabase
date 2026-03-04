const { H } = cy;
import { WRITABLE_DB_ID } from "e2e/support/cypress_data";
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

const SNAPSHOT_NAME = "metrics-explorer-snapshot";

describe("scenarios > metrics > explorer", () => {
  before(() => {
    H.restore();
    cy.signInAsAdmin();
    createMetrics(ALL_MODELS);
    H.snapshot(SNAPSHOT_NAME);
  });
  beforeEach(() => {
    H.restore(SNAPSHOT_NAME as any);
    cy.signInAsAdmin();
  });

  // ============================================================================
  // Test Helpers
  // ============================================================================

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
      .should("have.length.at.least", index)
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
      H.MetricsViewer.goToViewer();
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
      H.MetricsViewer.goToViewer();
      addMetric("Empty Metric");

      H.MetricsViewer.getMetricVisualization()
        .findByText(/No dice/)
        .should("exist");
    });
  });

  // ============================================================================
  // Adding Metrics and Measures
  // ============================================================================

  describe("Adding metrics and measures", () => {
    beforeEach(() => {
      intercedptDatasetQuery();
      H.MetricsViewer.goToViewer();
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
      H.MetricsViewer.goToViewer();
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
        .findByRole("heading", { name: /Source/ })
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
      H.MetricsViewer.goToViewer();
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

    it("should show all dimension tabs in a grid on the All dimensions tab", () => {
      const dimensionTabs = ["Created At", "State", "Category", "Vendor"];

      addMetric("Count of products");
      cy.wait("@dataset");

      cy.log("All dimensions tab should be selected by default");
      H.MetricsViewer.tablist()
        .findByRole("tab", { name: "All dimensions" })
        .click();

      cy.log("should show one visualization card per dimension tab");
      H.MetricsViewer.getAllCards().should("have.length", dimensionTabs.length);

      cy.log("each card should be labeled with its dimension name");
      dimensionTabs.forEach((name) => {
        H.MetricsViewer.getAllCards().contains(name).should("be.visible");
      });

      cy.log(
        "clicking a dimension tab should show a single visualization instead of the grid",
      );
      switchToTab("Category");
      H.MetricsViewer.getAllMetricVisualizations().should("have.length", 1);

      cy.log("switching back to All dimensions should restore the grid");
      switchToTab("All dimensions");
      H.MetricsViewer.getAllCards().should("have.length", dimensionTabs.length);
    });

    it("should add a dimension tab and remove it", () => {
      H.MetricsViewer.tabsShouldBe([
        "All dimensions",
        "Created At",
        "State",
        "Category",
        "Vendor",
      ]);

      cy.log("add a new dimension tab");
      H.MetricsViewer.getAddDimensionButton().click();
      H.popover().findByPlaceholderText(/Find/).should("be.visible");
      H.popover().findByText("Source").click();
      cy.wait("@dataset");

      H.MetricsViewer.tabsShouldBe([
        "All dimensions",
        "Created At",
        "State",
        "Category",
        "Vendor",
        "Source",
      ]);

      cy.log("new tab should be selected and show correct viz type");
      H.MetricsViewer.tablist()
        .findByRole("tab", { name: "Source" })
        .should("have.attr", "aria-selected", "true");
      H.MetricsViewer.assertVizType("Bar");

      cy.log("remove the added tab");

      // Need to hover the tab so that the remove button is accessible
      H.MetricsViewer.tablist()
        .findByRole("tab", { name: "Source" })
        .realHover();
      H.MetricsViewer.getRemoveTabButton("Source").click();
      H.MetricsViewer.tablist()
        .findByRole("tab", { name: "Source" })
        .should("not.exist");
      H.MetricsViewer.tabsShouldBe([
        "All dimensions",
        "Created At",
        "State",
        "Category",
        "Vendor",
      ]);
    });
  });

  // ============================================================================
  // Automatic Split View
  // ============================================================================

  describe("Automatic split view", () => {
    beforeEach(() => {
      intercedptDatasetQuery();
      H.MetricsViewer.goToViewer();
      addMetric("Count of orders");
      cy.wait("@dataset");
    });

    it("should show unified view for display types that support multiple series", () => {
      addMetric("Count of products");
      cy.wait("@dataset");

      cy.log("line charts support multiple series, so should be unified");
      H.MetricsViewer.assertVizType("Line");
      H.MetricsViewer.getAllMetricVisualizations().should("have.length", 1);

      cy.log("bar charts also support multiple series");
      switchToTab("Category");
      H.MetricsViewer.assertVizType("Bar");
      H.MetricsViewer.getAllMetricVisualizations().should("have.length", 1);
    });

    it("should automatically split for display types that do not support multiple series", () => {
      cy.log("with a single series, map shows one visualization");
      switchToTab("State");
      H.MetricsViewer.assertVizType("Map");
      H.MetricsViewer.getAllMetricVisualizations().should("have.length", 1);

      cy.log("add a breakout to create multiple series");
      switchToTab("Created At");
      selectBreakout("Count of orders", "Source");
      cy.wait("@dataset");

      cy.log("line supports multiple series, so should remain unified");
      H.MetricsViewer.getAllMetricVisualizations().should("have.length", 1);

      cy.log("map does not support multiple series, so should auto-split");
      switchToTab("State");
      H.MetricsViewer.getAllMetricVisualizations().should(
        "have.length.greaterThan",
        1,
      );
    });
  });

  // ============================================================================
  // Filters
  // ============================================================================

  describe("Filters", () => {
    beforeEach(() => {
      intercedptDatasetQuery();
      H.MetricsViewer.goToViewer();
      addMetric("Count of orders");
      cy.wait("@dataset");
      selectBreakout("Count of orders", "Category");
    });

    it("should apply a categorical filter to a metric", () => {
      H.MetricsViewer.breakoutLegend()
        .should("contain.text", "Doohickey")
        .should("contain.text", "Gadget")
        .should("contain.text", "Gizmo")
        .should("contain.text", "Widget");

      H.MetricsViewer.getFilterButton().click();
      H.popover().findByText("Category").click();

      H.popover().findByText("Doohickey").click();
      H.popover().findByText("Gadget").click();
      H.popover().findByRole("button", { name: "Add filter" }).click();

      H.MetricsViewer.getAllFilterPills()
        .should("have.length", 1)
        .should("contain.text", "Doohickey")
        .should("contain.text", "Gadget")
        .should("contain.text", "Category");

      H.MetricsViewer.breakoutLegend()
        .should("contain.text", "Doohickey")
        .should("contain.text", "Gadget");

      switchToTab("Category");
      H.MetricsViewer.getMetricVisualization().should(
        "contain.text",
        "Doohickey",
      );

      cy.log("filter on a per tab level");

      H.MetricsViewer.getMerticControls()
        .findByRole("button", { name: /All values/ })
        .click();

      H.popover().findByText("Doohickey").click();

      H.popover().findByRole("button", { name: "Update filter" }).click();
      H.MetricsViewer.getMetricVisualization().should(
        "not.contain.text",
        "Doohickey",
      );

      cy.log("remove filter");
      switchToTab("State");
      H.MetricsViewer.getAllMetricVisualizations().should("have.length", 2);

      H.MetricsViewer.getAllFilterPills()
        .should("have.length", 1)
        .eq(0)
        .findByRole("button", { name: "Remove" })
        .click();
      H.MetricsViewer.getAllMetricVisualizations().should("have.length", 4);
    });
  });

  // ============================================================================
  // Drill Through
  // ============================================================================

  describe("Drill through", () => {
    beforeEach(() => {
      intercedptDatasetQuery();
      H.MetricsViewer.goToViewer();
      addMetric("Count of orders");
      cy.wait("@dataset");
    });

    it("should drill into more graual time dimensions on timeseries chart", () => {
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

describe("scenarios > metrics > explorer > BigInt filters", () => {
  it("should filter on BigInt values", () => {
    const DECIMAL_PK_TABLE_NAME = "decimal_pk_table";
    const METRIC_NAME = "Count of decimal_pk_table";

    H.restore("postgres-writable");
    cy.signInAsAdmin();
    H.resetTestTable({ type: "postgres", table: DECIMAL_PK_TABLE_NAME });
    H.resyncDatabase({ dbId: WRITABLE_DB_ID });

    H.getTableId({ name: DECIMAL_PK_TABLE_NAME }).then((tableId) => {
      const BIGINT_METRIC: StructuredQuestionDetailsWithName = {
        name: METRIC_NAME,
        type: "metric",
        description: "A metric",
        query: {
          "source-table": tableId,
          aggregation: [["count"]],
        },
        database: WRITABLE_DB_ID,
        display: "scalar",
      };
      H.createQuestion(BIGINT_METRIC);
      H.MetricsViewer.goToViewer();
      H.MetricsViewer.searchInput().type(METRIC_NAME);
      H.MetricsViewer.searchResults().findByText(METRIC_NAME).click();
      H.MetricsViewer.getFilterButton().click();
      H.popover().findByText("ID").click();
      H.popover().within(() => {
        cy.findByPlaceholderText("Enter an ID").type("9223372036854775808");
        cy.button("Add filter").click();
      });
      H.MetricsViewer.getMetricVisualization()
        .should("contain.text", "Positive")
        .should("not.contain.text", "Negative")
        .should("not.contain.text", "Zero");
    });
  });
});
