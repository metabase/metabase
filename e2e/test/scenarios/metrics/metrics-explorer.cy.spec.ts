import Color from "color";

const { H } = cy;

import { SAMPLE_DB_ID, WRITABLE_DB_ID } from "e2e/support/cypress_data";
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import {
  FIRST_COLLECTION_ID,
  ORDERS_MODEL_ID,
} from "e2e/support/cypress_sample_instance_data";
import type { StructuredQuestionDetails } from "e2e/support/helpers";
const { ORDERS_ID, ORDERS, PRODUCTS_ID, PRODUCTS, ACCOUNTS_ID, FEEDBACK_ID } =
  SAMPLE_DATABASE;

type StructuredQuestionDetailsWithName = StructuredQuestionDetails & {
  name: string;
};

const ORDERS_SCALAR_METRIC: StructuredQuestionDetailsWithName = {
  name: "Count of orders",
  type: "metric",
  description: "A metric",
  query: {
    "source-table": ORDERS_ID,
    aggregation: [["count"]],
  },
  display: "scalar",
};

const ACCOUNTS_SCALAR_METRIC: StructuredQuestionDetailsWithName = {
  name: "Count of accounts",
  type: "metric",
  description: "A metric",
  query: {
    "source-table": ACCOUNTS_ID,
    aggregation: [["count"]],
  },
  display: "scalar",
};

const FEEDBACK_SCALAR_METRIC: StructuredQuestionDetailsWithName = {
  name: "Count of feedback",
  type: "metric",
  description: "A metric",
  query: {
    "source-table": FEEDBACK_ID,
    aggregation: [["count"]],
  },
  display: "scalar",
};

const ORDERS_SCALAR_MODEL_METRIC: StructuredQuestionDetailsWithName = {
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

const ORDERS_TIMESERIES_METRIC: StructuredQuestionDetailsWithName = {
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

const PRODUCTS_SCALAR_METRIC: StructuredQuestionDetailsWithName = {
  name: "Count of products",
  type: "metric",
  description: "A metric",
  query: {
    "source-table": PRODUCTS_ID,
    aggregation: [["count"]],
  },
  display: "scalar",
};

const NON_NUMERIC_METRIC: StructuredQuestionDetailsWithName = {
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
  ACCOUNTS_SCALAR_METRIC,
  FEEDBACK_SCALAR_METRIC,
  NON_NUMERIC_METRIC,
  ORDERS_SCALAR_METRIC,
  ORDERS_SCALAR_MODEL_METRIC,
  ORDERS_TIMESERIES_METRIC,
  PRODUCTS_SCALAR_METRIC,
];

const SNAPSHOT_NAME = "metrics-explorer-snapshot";

// ============================================================================
// Test Helpers
// ============================================================================

/**
 * Add a metric or measure to the explorer via the search panel
 */
const addMetric = (name: string) => {
  // for some reason `type` clicks in the middle of the input first
  // so we use `{end}` to make sure we type at the end
  H.MetricsViewer.searchInput().type(`{end}, ${name}`);
  H.MetricsViewer.searchResults().findByText(name).click();

  H.MetricsViewer.runButton().click();
};
const addMetricMath = (expression: ({ metricName: string } | string)[]) => {
  H.MetricsViewer.searchInput().type("{end}, ");
  for (const item of expression) {
    if (typeof item === "string") {
      H.MetricsViewer.searchInput().type(`{end}${item}`);
    } else {
      H.MetricsViewer.searchInput().type(`{end}${item.metricName}`);
      H.MetricsViewer.searchResults().findByText(item.metricName).click();
    }
  }
  H.MetricsViewer.runButton().click();
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
const interceptDatasetQuery = () => {
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

/**
 * Convert CSS rgb() color string to uppercase hex (#RRGGBB).
 */
const rgbToHex = (rgb: string): string => {
  return Color(rgb).hex().toUpperCase();
};

/**
 * Get hex color(s) from a search bar pill's color indicator.
 * Returns an array of hex color strings.
 */
const getPillColors = (pillIndex: number): Cypress.Chainable<string[]> => {
  // eslint-disable-next-line metabase/no-unsafe-element-filtering
  return H.MetricsViewer.searchBarPills()
    .should("have.length.greaterThan", pillIndex)
    .eq(pillIndex)
    .findByTestId("color-indicator-container")
    .children()
    .then(($children) => {
      const colors: string[] = [];
      $children.each((_i, el) => {
        const $el = Cypress.$(el);
        // Multi-dot: backgroundColor is set; single icon: color is set
        const bg = $el.css("background-color");
        const fg = $el.css("color");
        const raw =
          bg && bg !== "rgba(0, 0, 0, 0)" && bg !== "transparent" ? bg : fg;
        colors.push(rgbToHex(raw));
      });
      return colors;
    });
};

/**
 * Assert that every color in a pill's indicator appears somewhere on the
 * chart (as a `fill` or `stroke` attribute on an SVG `path`).
 */
const assertPillColorsInChart = (pillIndex: number) => {
  getPillColors(pillIndex).then((colors) => {
    for (const color of colors) {
      H.echartsContainer()
        .find(`path[fill="${color}"], path[stroke="${color}"]`)
        .should("exist");
    }
  });
};

/**
 * Assert that the breakout legend dot colors match the pill colors for the
 * given pill index.
 */
const assertLegendColorsMatchPill = (pillIndex: number) => {
  getPillColors(pillIndex).then((pillColors) => {
    H.MetricsViewer.breakoutLegend()
      .findAllByTestId("breakout-legend-dot")
      .then(($dots) => {
        const legendColors: string[] = [];
        $dots.each((_i, el) => {
          const bg = Cypress.$(el).css("background-color");
          legendColors.push(rgbToHex(bg));
        });

        // Every pill color should appear in the legend
        for (const color of pillColors) {
          expect(legendColors).to.include(color);
        }
      });
  });
};

describe("scenarios > metrics > explorer", () => {
  before(() => {
    H.restore();
    cy.signInAsAdmin();
    createMetrics(ALL_MODELS);
    createTestMeasure();
    H.snapshot(SNAPSHOT_NAME);
  });
  beforeEach(() => {
    H.restore(SNAPSHOT_NAME as any);
    cy.signInAsAdmin();

    interceptDatasetQuery();
    cy.intercept("GET", "/api/metric/*").as("getMetric");
    cy.intercept("GET", "/api/measure/*").as("getMeasure");
    H.resetSnowplow();
    H.enableTracking();
  });

  afterEach(() => {
    H.expectNoBadSnowplowEvents();
  });

  // ============================================================================
  // Entry Points
  // ============================================================================

  describe("Entry points", () => {
    it("should show empty state on first load", () => {
      H.MetricsViewer.goToViewer();
      cy.url().should("include", "/explore");
      cy.findByRole("heading", { name: "Start exploring" }).should("exist");

      addMetric("Count of products");

      H.echartsContainer().should("be.visible");

      cy.log("should persist state in url");

      cy.reload();
      verifyMetricCount(1);
    });

    it("should not show Edit in Data Studio for users without data studio access", () => {
      cy.signInAsNormalUser();
      H.MetricsViewer.goToViewer();
      addMetric("Count of orders");

      H.MetricsViewer.searchBarPills().contains("Count of orders").rightclick();
      H.popover().should("not.contain", "Edit in Data Studio");
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
    it("should add multiple metrics", () => {
      H.MetricsViewer.goToViewer();

      addMetric("Count of products");
      cy.wait("@dataset");

      H.expectUnstructuredSnowplowEvent({
        event: "metrics_viewer_metric_added",
        event_detail: "metric",
      });

      addMetric("Count of orders");
      cy.wait("@dataset");
      verifyMetricCount(2);

      cy.log("allows duplicates");
      addMetric("Count of products");

      cy.log("Should allow me to add measures");
      addMetric("Test Measure");
      H.expectUnstructuredSnowplowEvent({
        event: "metrics_viewer_metric_added",
        event_detail: "measure",
      });

      cy.log("no results");
      H.MetricsViewer.searchInput().type("{end}, xyznonexistent");
      H.MetricsViewer.searchResults().should(
        "contain.text",
        "No results found",
      );
    });

    it("Should not show me metrics that live in collections I do not have permissions to see", () => {
      cy.signIn("nocollection");
      H.MetricsViewer.goToViewer();
      H.MetricsViewer.searchInput().type("Count of");
      H.MetricsViewer.searchResults().should(
        "contain.text",
        "No results found",
      );

      H.MetricsViewer.searchInput().clear().type("Test Measure");
      H.MetricsViewer.searchResults().should("contain.text", "Test Measure");
    });

    it("Should not show me measures that live in tables I do not have permissions to see", () => {
      cy.signIn("nodata");
      H.MetricsViewer.goToViewer();
      H.MetricsViewer.searchInput().type("Test Measure");
      H.MetricsViewer.searchResults().should(
        "contain.text",
        "No results found",
      );

      H.MetricsViewer.searchInput().clear();

      addMetric("Count of orders");
      cy.log(
        "even though we can see the metric, we don't have permissions to run the query",
      );
      cy.findByRole("heading", {
        name: /You do not have permissions to run this query/i,
      }).should("be.visible");
    });
  });

  // ============================================================================
  // Breakouts
  // ============================================================================

  describe("Breakouts", () => {
    beforeEach(() => {
      interceptDatasetQuery();
      cy.intercept("GET", "/api/metric/*").as("getMetric");
      H.MetricsViewer.goToViewer();
      addMetric("Count of orders");
      cy.wait("@dataset");
    });

    it("should add a temporal breakout dimension", () => {
      selectBreakout("Count of orders", "Created At", 0, "Year");
      cy.wait("@dataset");
      H.MetricsViewer.breakoutLegend().within(() => {
        cy.findByRole("heading", { name: "Created At" }).should("be.visible");
        const currentYear = new Date().getFullYear();
        for (let year = 2025; year <= currentYear; year++) {
          cy.findByText(String(year)).should("be.visible");
        }
      });

      H.MetricsViewer.searchBarPills()
        .contains("[data-testid=metrics-viewer-search-pill]", "Count of orders")
        .findByTestId("color-indicator-container")
        .children()
        .should("have.length", 5);

      H.MetricsViewer.searchBarPills().contains("Count of orders").rightclick();
      H.popover().findByText("Change breakout").click();
      H.popover().findByText("Category").click();

      H.MetricsViewer.breakoutLegend()
        .findByRole("heading", { name: /Category/ })
        .should("be.visible");

      H.MetricsViewer.searchBarPills().contains("Count of orders").rightclick();
      H.popover().findByText("Remove breakout").click();
      H.MetricsViewer.breakoutLegend().should("not.exist");
    });

    it("should add a categorical breakout dimension", () => {
      selectBreakout("Count of orders", "Source");
      cy.wait("@dataset");
      H.MetricsViewer.breakoutLegend()
        .findByRole("heading", { name: /Source/ })
        .should("be.visible");

      H.MetricsViewer.breakoutLegend().within(() => {
        cy.findByRole("heading", { name: /Source/ }).should("be.visible");
        cy.findByText("Twitter").should("be.visible");
        cy.findByText("Facebook").should("be.visible");
        cy.findByText("Organic").should("be.visible");
        cy.findByText("Google").should("be.visible");
        cy.findByText("Affiliate").should("be.visible");
      });
    });

    it("should add a numeric breakout dimension with default binning", () => {
      selectBreakout("Count of orders", "Total");
      cy.wait("@dataset");
      H.MetricsViewer.breakoutLegend().within(() => {
        cy.findByRole("heading", { name: "Total" }).should("be.visible");

        cy.findByText("-60 – -40").should("be.visible");
        cy.findByText("0 – 20").should("be.visible");
        cy.findByText("20 – 40").should("be.visible");
        cy.findByText("40 – 60").should("be.visible");
        cy.findByText("60 – 80").should("be.visible");
        cy.findByText("80 – 100").should("be.visible");
        cy.findByText("100 – 120").should("be.visible");
        cy.findByText("120 – 140").should("be.visible");
        cy.findByText("140 – 160").should("be.visible");
      });

      cy.log("Search pill should cap at 6 color indicators");
      H.MetricsViewer.searchBarPills()
        .contains("[data-testid=metrics-viewer-search-pill]", "Count of orders")
        .findByTestId("color-indicator-container")
        .children()
        .should("have.length", 6);
    });

    it("should handle breakout independently for multiple instances of the same metric", () => {
      cy.log(
        "Expand formula editor and create expression with second metric instance",
      );
      cy.findByTestId("metrics-formula-input").click();
      H.MetricsViewer.searchInput().type(", Count of orders");
      H.MetricsViewer.searchResults().findByText("Count of orders").click();
      cy.wait("@getMetric");

      H.MetricsViewer.searchInput().type(" + Count of products");

      H.MetricsViewer.searchResults().findByText("Count of products").click();
      cy.wait("@getMetric");

      H.MetricsViewer.searchInput().type(", Count of orders");
      H.MetricsViewer.searchResults().findByText("Count of orders").click();
      cy.wait("@getMetric");

      cy.findByTestId("run-expression-button").click();

      cy.wait("@dataset");

      cy.log("Should have 2 metric pills (expression pill is separate)");
      H.MetricsViewer.searchBarPills().should("have.length", 3);

      cy.log(
        "Two standalone instances of the same metric should have different pill colors",
      );
      getPillColors(0).then((pill0Colors) => {
        getPillColors(2).then((pill2Colors) => {
          expect(pill0Colors[0]).to.not.equal(pill2Colors[0]);
        });
      });

      cy.log(
        "Each standalone pill color should appear on the chart as fill or stroke",
      );
      assertPillColorsInChart(0);
      assertPillColorsInChart(2);

      cy.log("Apply breakout to first instance of Count of orders");
      H.MetricsViewer.searchBarPills().eq(0).rightclick();
      H.popover().findByText("Break out").click();
      H.popover().findByText("Source").click();
      cy.wait("@dataset");

      cy.log("Breakout legend should be visible with Source values");
      H.MetricsViewer.breakoutLegend().should("be.visible");
      H.MetricsViewer.breakoutLegend().within(() => {
        cy.findByRole("heading", { name: "User → Source" }).should(
          "be.visible",
        );
        cy.findByText("Twitter").should("be.visible");
        cy.findByText("Facebook").should("be.visible");
        cy.findByText("Organic").should("be.visible");
        cy.findByText("Google").should("be.visible");
        cy.findByText("Affiliate").should("be.visible");
      });

      cy.log("First pill should show multiple color indicators (breakout)");
      H.MetricsViewer.searchBarPills()
        .eq(0)
        .findByTestId("color-indicator-container")
        .children()
        .should("have.length.greaterThan", 1);

      cy.log("Second pill should have single color (no breakout yet)");
      H.MetricsViewer.searchBarPills()
        .eq(2)
        .findByTestId("color-indicator-container")
        .children()
        .should("have.length", 1);

      cy.log("Breakout pill colors should appear on the chart");
      assertPillColorsInChart(0);

      cy.log("Non-breakout pill color should appear on the chart");
      assertPillColorsInChart(2);

      cy.log(
        "Legend dot colors should match pill colors for breakout instance",
      );
      assertLegendColorsMatchPill(0);

      cy.log("Apply breakout to second instance of Count of orders");
      H.MetricsViewer.searchBarPills().eq(2).rightclick();
      H.popover().findByText("Break out").click();
      H.popover().findByText("Source").click();
      cy.wait("@dataset");

      cy.log("Both pills should now have multiple color indicators");
      H.MetricsViewer.searchBarPills()
        .eq(0)
        .findByTestId("color-indicator-container")
        .children()
        .should("have.length.greaterThan", 1);
      H.MetricsViewer.searchBarPills()
        .eq(2)
        .findByTestId("color-indicator-container")
        .children()
        .should("have.length.greaterThan", 1);

      cy.log("Both breakout pills' colors should appear on the chart");
      assertPillColorsInChart(0);
      assertPillColorsInChart(2);

      cy.log(
        "The two breakout pills should have different color sets (different entities)",
      );
      getPillColors(0).then((pill0Colors) => {
        getPillColors(2).then((pill2Colors) => {
          expect(pill0Colors[0]).to.not.equal(pill2Colors[0]);
        });
      });

      cy.log("Remove breakout from first instance");
      H.MetricsViewer.searchBarPills().eq(0).rightclick();
      H.popover().findByText("Remove breakout").click();

      cy.log(
        "Legend should still be visible because second instance has breakout",
      );
      H.MetricsViewer.breakoutLegend().should("be.visible");
      H.MetricsViewer.breakoutLegend().within(() => {
        cy.findByRole("heading", { name: "User → Source" }).should(
          "be.visible",
        );
      });

      cy.log("First pill should have single color (breakout removed)");
      H.MetricsViewer.searchBarPills()
        .eq(0)
        .findByTestId("color-indicator-container")
        .children()
        .should("have.length", 1);

      cy.log("Second pill should still have multiple colors");
      H.MetricsViewer.searchBarPills()
        .eq(2)
        .findByTestId("color-indicator-container")
        .children()
        .should("have.length.greaterThan", 1);

      cy.log("After removing breakout, pill colors should still match chart");
      assertPillColorsInChart(0);
      assertPillColorsInChart(2);
    });

    it("should preserve breakout state when editing formula and re-running", () => {
      cy.log("Set up: two instances of Count of orders with an expression");
      cy.findByTestId("metrics-formula-input").click();

      addMetric("Count of orders");
      cy.wait("@dataset");

      H.MetricsViewer.searchBarPills().should("have.length", 2);

      cy.log("Apply breakout to first instance of Count of orders");
      H.MetricsViewer.searchBarPills().eq(0).rightclick();
      H.popover().findByText("Break out").click();
      H.popover().findByText("Source").click();
      cy.wait("@dataset");

      cy.log("Verify breakout is applied — first pill has multiple colors");
      H.MetricsViewer.searchBarPills()
        .eq(0)
        .findByTestId("color-indicator-container")
        .children()
        .should("have.length.greaterThan", 1);

      H.MetricsViewer.breakoutLegend().should("be.visible");

      cy.log("Enter formula edit mode and append a new metric");
      cy.findByTestId("metrics-formula-input").click();
      H.MetricsViewer.searchInput().type(", Count of products");
      H.MetricsViewer.searchResults().findByText("Count of products").click();
      cy.wait("@getMetric");

      cy.findByTestId("run-expression-button").click();
      cy.wait("@dataset");

      cy.log("Should now have 3 metric pills");
      H.MetricsViewer.searchBarPills().should("have.length", 3);

      cy.log(
        "First pill should still have breakout — multiple color indicators preserved",
      );
      H.MetricsViewer.searchBarPills()
        .eq(0)
        .findByTestId("color-indicator-container")
        .children()
        .should("have.length.greaterThan", 1);

      cy.log("Breakout legend should still be visible");
      H.MetricsViewer.breakoutLegend().should("be.visible");
      H.MetricsViewer.breakoutLegend().within(() => {
        cy.findByRole("heading", { name: "User → Source" }).should(
          "be.visible",
        );
      });

      cy.log("Newly added third pill should have single color (no breakout)");
      H.MetricsViewer.searchBarPills()
        .eq(2)
        .findByTestId("color-indicator-container")
        .children()
        .should("have.length", 1);

      cy.log("Second pill (standalone Count of orders) should still be single");
      H.MetricsViewer.searchBarPills()
        .eq(1)
        .findByTestId("color-indicator-container")
        .children()
        .should("have.length", 1);

      cy.log("Remove second pill (standalone Count of orders)");
      H.MetricsViewer.searchBarPills()
        .eq(1)
        .findByLabelText("Remove Count of orders")
        .click();

      cy.log(
        "First pill should still have breakout — multiple color indicators preserved",
      );
      H.MetricsViewer.searchBarPills()
        .eq(0)
        .findByTestId("color-indicator-container")
        .children()
        .should("have.length.greaterThan", 1);
    });

    it("cannot breakout a metric math expression", () => {
      addMetricMath([
        { metricName: "Count of orders" },
        "+",
        { metricName: "Test Measure" },
      ]);
      cy.wait("@dataset");
      H.MetricsViewer.searchBarPills().eq(1).rightclick();
      H.popover({ skipVisibilityCheck: true }).should("not.exist");
    });

    it("should show an expression dimension pill with per-metric accordion", () => {
      cy.log("Create expression: Count of orders + Count of products");
      cy.findByTestId("metrics-formula-input").click();

      H.MetricsViewer.searchInput().type(", Count of orders");
      H.MetricsViewer.searchResults().findByText("Count of orders").click();
      cy.wait("@getMetric");

      H.MetricsViewer.searchInput().type(" + Count of products");
      H.MetricsViewer.searchResults().findByText("Count of products").click();
      cy.wait("@getMetric");

      cy.findByTestId("run-expression-button").click();
      cy.wait("@dataset");

      cy.log(
        "Dimension pill bar should contain an expression dimension pill with a selected dimension",
      );
      H.MetricsViewer.getDimensionPillContainer().within(() => {
        cy.findByTestId("expression-dimension-pill").should("exist");
        cy.findByTestId("expression-dimension-pill").should(
          "not.contain.text",
          "Select dimensions",
        );
      });

      cy.log("Click the expression dimension pill to open the popover");
      H.MetricsViewer.getDimensionPillContainer()
        .findByTestId("expression-dimension-pill")
        .click();

      cy.log(
        "Popover should show accordion sections for each metric in the expression",
      );
      H.popover().within(() => {
        cy.findAllByTestId("expression-metric-section").should(
          "have.length",
          2,
        );
        cy.findAllByTestId("expression-metric-header")
          .eq(0)
          .should("contain.text", "Count of orders");
        cy.findAllByTestId("expression-metric-header")
          .eq(1)
          .should("contain.text", "Count of products");
      });

      cy.log(
        "Expand the second metric section and verify dimension options are shown",
      );
      H.popover().findAllByTestId("expression-metric-header").eq(1).click();

      H.popover().within(() => {
        cy.findByText("Birth Date").click();
      });

      cy.wait("@dataset");

      cy.log("Expression dimension pill should now show 'Multiple dimensions'");
      H.MetricsViewer.getDimensionPillContainer()
        .findByTestId("expression-dimension-pill")
        .should("contain.text", "Multiple dimensions");
    });

    it("should preserve non-default expression dimensions after page reload", () => {
      cy.log(
        "Create expression with only expression entity: Count of orders + Count of products",
      );

      cy.findByTestId("metrics-formula-input").click();

      H.MetricsViewer.searchInput().type(" + Count of products");
      H.MetricsViewer.searchResults().findByText("Count of products").click();
      cy.wait("@getMetric");

      cy.findByTestId("run-expression-button").click();
      cy.wait("@dataset");

      cy.log(
        "Open the expression dimension pill and pick a non-default dimension for the second metric",
      );
      H.MetricsViewer.getDimensionPillContainer()
        .findByTestId("expression-dimension-pill")
        .click();

      // Expand the second metric accordion section
      H.popover().findAllByTestId("expression-metric-header").eq(1).click();

      // Pick a non-default dimension (e.g. "Created At" for Products)
      H.popover().within(() => {
        cy.findByText("Birth Date").click();
      });

      cy.wait("@dataset");

      cy.log("Verify the pill shows 'Multiple dimensions' (non-default state)");
      H.MetricsViewer.getDimensionPillContainer()
        .findByTestId("expression-dimension-pill")
        .should("contain.text", "Multiple dimensions");

      cy.log(
        "Remember the selected dimension index for the first metric before reload",
      );
      H.MetricsViewer.getDimensionPillContainer()
        .findByTestId("expression-dimension-pill")
        .click();

      H.popover()
        .find("[data-element-id=list-item]")
        .then(($items) => {
          const selectedIndex = $items
            .toArray()
            .findIndex((el) => el.getAttribute("aria-selected") === "true");
          expect(selectedIndex).to.be.gte(0);
          cy.wrap(selectedIndex).as("firstMetricDimensionIndex");
        });

      // Close the popover
      cy.realPress("Escape");

      cy.log("Reload the page and verify the dimension choice persists");
      cy.reload();
      cy.wait("@getMetric");
      cy.wait("@dataset");

      H.MetricsViewer.getDimensionPillContainer()
        .findByTestId("expression-dimension-pill")
        .should("contain.text", "Multiple dimensions")
        .click();

      cy.log(
        "Verify the first metric still has the same selected dimension after reload",
      );

      cy.get<number>("@firstMetricDimensionIndex").then((expectedIndex) => {
        // eslint-disable-next-line metabase/no-unsafe-element-filtering
        H.popover()
          .find("[data-element-id=list-item]")
          .eq(expectedIndex)
          .should("have.attr", "aria-selected", "true");
      });
    });
  });

  // ============================================================================
  // Tabs
  // ============================================================================

  describe("Tabs", () => {
    beforeEach(() => {
      interceptDatasetQuery();
      H.MetricsViewer.goToViewer();
      addMetric("Count of orders");
      cy.wait("@dataset");
    });

    it("should switch between tabs", () => {
      //should work with metric math as well
      addMetricMath([
        { metricName: "Count of orders" },
        "+",
        { metricName: "Test Measure" },
      ]);
      cy.wait("@dataset");

      H.MetricsViewer.tabsShouldBe([
        "Created At",
        "State",
        "Title",
        "Category",
        "Totals",
      ]);
      H.MetricsViewer.assertVizType("Line");

      switchToTab("State");
      H.expectUnstructuredSnowplowEvent({
        event: "metrics_viewer_dimension_tab_switched",
      });
      H.MetricsViewer.assertAllVizTypes("Map", 2);

      switchToTab("Category");
      H.MetricsViewer.assertVizType("Bar");

      cy.log("should allow changing display types");
      H.MetricsViewer.changeVizType("line");
      H.MetricsViewer.assertVizType("Line");

      switchToTab("Totals");
      H.MetricsViewer.assertAllVizTypes("Number", 2);
    });

    it("should not show dimensions that are already in tabs in the dimension picker", () => {
      addMetricMath([
        { metricName: "Count of orders" },
        "+",
        { metricName: "Count of products" },
      ]);
      cy.wait("@dataset");
      H.MetricsViewer.tabsShouldBe([
        "Created At",
        "State",
        "Title",
        "Category",
      ]);

      H.MetricsViewer.getAddDimensionButton().click();
      H.popover().within(() => {
        cy.findByText("Rating").should("exist");
        // Created At exists on the users table so would be a false positive
        // testing the other tabs is sufficent
        cy.findByText("State").should("not.exist");
        cy.findByText("Title").should("not.exist");
        cy.findByText("Category").should("not.exist");

        // metric math should not cause dimensions to be repeated
        cy.findAllByText("Birth Date").should("have.length", 1);

        cy.findByText("Rating").click();
      });

      H.MetricsViewer.getDimensionPillContainer().within(() => {
        cy.findAllByText("Product → Rating").should("exist");
        cy.findAllByText("Multiple dimensions").should("not.exist");
      });
    });

    it("should auto-assign dimensions for a newly added metric after running the formula", () => {
      cy.log(
        "After adding a second metric, all dimension pills should have a selected dimension",
      );

      cy.findByTestId("metrics-formula-input").click();
      addMetric("Count of products");
      cy.wait("@dataset");

      H.MetricsViewer.getDimensionPillContainer().within(() => {
        cy.findAllByText("Select a dimension").should("not.exist");
      });

      cy.log(
        "Switch to another tab and verify dimensions are assigned there too",
      );
      switchToTab("Category");
      H.MetricsViewer.getDimensionPillContainer().within(() => {
        cy.findAllByText("Select a dimension").should("not.exist");
      });
    });

    it("should map shared dimensions to all metrics when adding a tab from the picker", () => {
      addMetric("Count of products");
      cy.wait("@dataset");

      H.MetricsViewer.getAddDimensionButton().click();
      H.popover().within(() => {
        cy.findByText("Shared").should("exist");
        cy.findByText("Rating").click();
      });
      cy.wait("@dataset");

      H.MetricsViewer.tablist()
        .findByRole("tab", { name: "Rating" })
        .should("have.attr", "aria-selected", "true");

      H.MetricsViewer.getDimensionPillContainer().within(() => {
        cy.findAllByText("Select a dimension").should("not.exist");
      });
    });

    it("should remove then re-add the totals tab", () => {
      //should work with metric math as well
      addMetricMath([
        { metricName: "Count of orders" },
        "+",
        { metricName: "Test Measure" },
      ]);
      cy.wait("@dataset");

      // Need to hover the tab so that the remove button is accessible
      H.MetricsViewer.tablist()
        .findByRole("tab", { name: "Totals" })
        .realHover();
      H.MetricsViewer.getRemoveTabButton("Totals").click();
      H.MetricsViewer.tablist()
        .findByRole("tab", { name: "Totals" })
        .should("not.exist");

      H.MetricsViewer.getAddDimensionButton().click();
      H.popover().within(() => {
        cy.findAllByText("Totals").click();
      });
      cy.wait("@dataset");

      cy.log("totals tab should be selected and show correct viz type");
      H.MetricsViewer.tablist()
        .findByRole("tab", { name: "Totals" })
        .should("have.attr", "aria-selected", "true");
      H.MetricsViewer.assertAllVizTypes("Number", 2);
    });

    it("should add a dimension tab and remove it", () => {
      addMetric("Count of feedback");
      H.MetricsViewer.tabsShouldBe([
        "Created At",
        "State",
        "Title",
        "Category",
      ]);

      cy.log("assert that both feedback and order dimensions are available");
      H.MetricsViewer.getAddDimensionButton().click();
      H.popover().within(() => {
        cy.findAllByText(/count of orders/i).should("have.length", 3);
        cy.findAllByText(/count of feedback/i).should("have.length", 2);
        cy.log("add a new dimension tab");

        cy.findByPlaceholderText(/Find/).should("be.visible");
        cy.findAllByText("Source").should("have.length", 2).eq(0).click();
      });
      cy.wait("@dataset");

      H.MetricsViewer.tabsShouldBe([
        "Created At",
        "State",
        "Title",
        "Category",
        "Source",
      ]);

      H.expectUnstructuredSnowplowEvent({
        event: "metrics_viewer_dimension_tab_added",
      });

      cy.log("new tab should be selected and show correct viz type");
      H.MetricsViewer.tablist()
        .findByRole("tab", { name: "Source" })
        .should("have.attr", "aria-selected", "true");
      H.MetricsViewer.assertVizType("Bar");

      cy.log("should only show me metrics that share the dimension of the tab");
      H.MetricsViewer.getMetricVisualization().within(() => {
        cy.findByText("Affiliate").should("exist");
        cy.findByText("Facebook").should("exist");
        cy.findByText("Google").should("exist");
        cy.findByText("Organic").should("exist");
        cy.findByText("Twitter").should("exist");
        cy.findByText("Basic").should("not.exist");
        cy.findByText("Business").should("not.exist");
        cy.findByText("Premium").should("not.exist");
      });
      H.MetricsViewer.getDimensionPillContainer().within(() => {
        cy.findByText("User → Source").should("exist");
        cy.findByText("Account → Source").click();
      });

      H.popover().findByText("Plan").click();

      H.MetricsViewer.getMetricVisualization().within(() => {
        cy.findByText("Affiliate").should("exist");
        cy.findByText("Facebook").should("exist");
        cy.findByText("Google").should("exist");
        cy.findByText("Organic").should("exist");
        cy.findByText("Twitter").should("exist");
        cy.findByText("Basic").should("exist");
        cy.findByText("Business").should("exist");
        cy.findByText("Premium").should("exist");
      });

      cy.log("shared dimensions should automatically be added to tabs");
      switchToTab("Created At");

      H.MetricsViewer.getDimensionPillContainer().within(() => {
        cy.findByText("Created At").should("exist");
        cy.findByText("Account → Created At").click();
      });

      H.popover().findByText("Canceled At").click();
      H.MetricsViewer.getDimensionPillContainer()
        .findByText("Account → Canceled At")
        .should("exist");

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
        "Created At",
        "State",
        "Title",
        "Category",
      ]);

      H.expectUnstructuredSnowplowEvent({
        event: "metrics_viewer_dimension_tab_removed",
      });

      cy.log("navigating back should undo changes");

      cy.go("back");
      H.MetricsViewer.tabsShouldBe([
        "Created At",
        "State",
        "Title",
        "Category",
        "Source",
      ]);
      cy.go("back");
      H.MetricsViewer.getDimensionPillContainer().within(() => {
        cy.findByText("Created At").should("exist");
        cy.findByText("Account → Created At").should("exist");
      });
    });
  });

  // ============================================================================
  // Automatic Split View
  // ============================================================================

  describe("Automatic split view", () => {
    beforeEach(() => {
      interceptDatasetQuery();
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

    it("should stack series into panels when the stack series button is toggled", () => {
      addMetric("Count of products");
      cy.wait("@dataset");

      cy.log("line chart with multiple series should show chart layout picker");
      H.MetricsViewer.assertVizType("Line");
      cy.findByTestId("chart-layout-picker").should("be.visible");
      cy.findByLabelText("Stack layout").click();
      H.expectUnstructuredSnowplowEvent({
        event: "stack_series_enabled",
        triggered_from: "metrics_viewer",
      });

      cy.log("should split the chart into separate panels");
      H.splitPanelAxisLines().should("have.length", 2);

      cy.log("toggling off should return to unified view");
      cy.findByLabelText("Default layout").click();
      H.splitPanelAxisLines().should("have.length", 0);

      cy.log("button should not be visible for non-line/area/bar charts");
      switchToTab("State");
      H.MetricsViewer.assertVizType("Map");
      cy.findByTestId("chart-layout-picker").should("not.exist");
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
      interceptDatasetQuery();
      H.MetricsViewer.goToViewer();
      addMetric("Count of orders");
      cy.wait("@dataset");
    });

    it("should apply a categorical filter to a metric", () => {
      selectBreakout("Count of orders", "Category");
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

      H.expectUnstructuredSnowplowEvent({
        event: "metrics_viewer_filter_added",
        triggered_from: "metric_filter",
      });

      cy.log("edit the filter to change the selection");
      H.MetricsViewer.getAllFilterPills().eq(0).click();
      H.popover().findByText("Gizmo").click();
      H.popover().findByRole("button", { name: "Update filter" }).click();

      H.expectUnstructuredSnowplowEvent({
        event: "metrics_viewer_filter_edited",
        triggered_from: "metric_filter",
      });

      H.MetricsViewer.breakoutLegend()
        .should("contain.text", "Doohickey")
        .should("contain.text", "Gadget")
        .should("contain.text", "Gizmo");

      switchToTab("Category");
      H.MetricsViewer.getMetricVisualization().should(
        "contain.text",
        "Doohickey",
      );
      H.MetricsViewer.getMetricVisualization().should("contain.text", "Gizmo");

      cy.log("filter on a per tab level");

      H.MetricsViewer.getMerticControls()
        .findByRole("button", { name: /All values/ })
        .click();

      H.popover().findByText("Doohickey").click();

      H.popover().findByRole("button", { name: "Add filter" }).click();
      H.MetricsViewer.getMerticControls().findByRole("button", {
        name: /is Doohickey/,
      });
      H.MetricsViewer.getMetricVisualization().should(
        "contain.text",
        "Doohickey",
      );
      H.MetricsViewer.getMetricVisualization().should(
        "not.contain.text",
        "Gizmo",
      );

      H.expectUnstructuredSnowplowEvent({
        event: "metrics_viewer_filter_added",
        triggered_from: "dimension_filter",
      });

      cy.log("remove filter");
      switchToTab("State");
      H.MetricsViewer.getAllMetricVisualizations().should("have.length", 3);

      H.MetricsViewer.getAllFilterPills()
        .should("have.length", 1)
        .eq(0)
        .findByRole("button", { name: "Remove" })
        .click();
      H.MetricsViewer.getAllMetricVisualizations().should("have.length", 4);
      H.MetricsViewer.getAllFilterPills().should("have.length", 0);

      H.expectUnstructuredSnowplowEvent({
        event: "metrics_viewer_filter_removed",
        triggered_from: "metric_filter",
      });

      cy.log("navigating back should undo changes");

      // re-apply global filter
      cy.go("back");

      H.MetricsViewer.getAllMetricVisualizations().should("have.length", 3);
      H.MetricsViewer.getAllFilterPills().should("have.length", 1);

      // switch back to category tab
      cy.go("back");
      H.MetricsViewer.getTab("Category").should(
        "have.attr",
        "aria-selected",
        "true",
      );

      // Remove tab filter
      cy.go("back");
      H.MetricsViewer.getMetricVisualization().should(
        "contain.text",
        "Doohickey",
      );
      H.MetricsViewer.getMetricVisualization().should("contain.text", "Gizmo");
      H.MetricsViewer.getMerticControls()
        .findByRole("button", { name: /All values/ })
        .should("exist");

      cy.log("navigating forward should re-apply changes");
      // re-apply tab filter
      cy.go("forward");

      H.MetricsViewer.getMerticControls()
        .findByRole("button", { name: /is Doohickey/ })
        .should("exist");
      H.MetricsViewer.getMetricVisualization().should(
        "contain.text",
        "Doohickey",
      );
      H.MetricsViewer.getMetricVisualization().should(
        "not.contain.text",
        "Gizmo",
      );
      // change tab back to state
      cy.go("forward");
      H.MetricsViewer.getTab("State").should(
        "have.attr",
        "aria-selected",
        "true",
      );
      H.MetricsViewer.getAllMetricVisualizations().should("have.length", 3);
      // remove global filter
      cy.go("forward");
      H.MetricsViewer.getAllMetricVisualizations().should("have.length", 4);
      H.MetricsViewer.getAllFilterPills().should("have.length", 0);
    });

    it("Should allow me to apply filters to each metric individually", () => {
      addMetric("Count of products");
      switchToTab("Category");
      H.MetricsViewer.changeVizType("line");
      H.MetricsViewer.getMetricVisualizationDataPoints().should(
        "have.length",
        8,
      );

      H.MetricsViewer.getFilterButton().click();
      H.popover().within(() => {
        cy.button(/count of orders/i).should("be.visible");
        cy.button(/count of products/i).click();
        cy.findByText("Category").click();
      });
      H.popover().within(() => {
        cy.findByText("Doohickey").click();
        cy.findByText("Gadget").click();
        cy.button("Add filter").click();
      });

      H.MetricsViewer.getMetricVisualizationDataPoints().should(
        "have.length",
        6,
      );

      cy.log(
        "Should allow me to change time granularity and range on time based tabs",
      );
      switchToTab("Created At");

      H.MetricsViewer.getMetricVisualizationDataPoints().should(
        "have.length",
        85,
      );
      H.MetricsViewer.getMerticControls()
        .findByRole("button", { name: /by month/i })
        .click();
      H.popover().findByText("Year").click();
      H.MetricsViewer.getMetricVisualizationDataPoints().should(
        "have.length",
        9,
      );
      H.MetricsViewer.getMerticControls()
        .findByRole("button", { name: /by year/i })
        .click();
      H.popover().findByText("Month").click();

      H.MetricsViewer.getMerticControls()
        .findByRole("button", { name: /All time/i })
        .click();

      H.popover()
        .findByText(/Fixed date/)
        .click();
      H.popover().within(() => {
        cy.findByRole("textbox", { name: "Start date" })
          .clear()
          .type("February 7, 2027");
        cy.findByRole("textbox", { name: "End date" })
          .clear()
          .type("July 7, 2027");
        cy.button("Add filter").click();
      });

      H.MetricsViewer.getMetricVisualizationDataPoints().should(
        "have.length",
        10,
      );

      cy.log("edit the dimension filter to change the date range");
      H.MetricsViewer.getMerticControls()
        .findByRole("button", { name: /February/i })
        .click();
      H.popover().within(() => {
        cy.findByRole("textbox", { name: "Start date" })
          .clear()
          .type("January 1, 2027");
        cy.button("Update filter").click();
      });

      H.expectUnstructuredSnowplowEvent({
        event: "metrics_viewer_filter_edited",
        triggered_from: "dimension_filter",
      });

      H.MetricsViewer.getMerticControls()
        .findByRole("button", { name: /January/i })
        .click();
      H.popover().findByRole("button", { name: "Clear" }).click();
      H.MetricsViewer.getMetricVisualizationDataPoints().should(
        "have.length",
        85,
      );

      H.expectUnstructuredSnowplowEvent({
        event: "metrics_viewer_filter_removed",
        triggered_from: "dimension_filter",
      });
    });

    it("should preserve breakout colors when a dimension filter hides some values", () => {
      selectBreakout("Count of orders", "Quantity");
      cy.wait("@dataset");

      const colorsBefore: Record<string, string> = {};

      H.MetricsViewer.breakoutLegend()
        .findAllByTestId("breakout-legend-dot")
        .each(($dot) => {
          const color = $dot.css("background-color");
          const label = $dot.next().text();
          colorsBefore[label] = color;
        })
        .then(() => {
          expect(Object.keys(colorsBefore).length).to.be.greaterThan(0);
        });

      H.MetricsViewer.getMerticControls()
        .findByRole("button", { name: /All time/i })
        .click();
      H.popover()
        .findByText(/Fixed date/)
        .click();
      H.popover().within(() => {
        cy.findByRole("textbox", { name: "Start date" })
          .clear()
          .type("February 1, 2027");
        cy.findByRole("textbox", { name: "End date" })
          .clear()
          .type("February 7, 2027");
        cy.button("Add filter").click();
      });

      cy.wait("@dataset");

      H.MetricsViewer.breakoutLegend()
        .findAllByTestId("breakout-legend-dot")
        .then(($dots) => {
          expect($dots.length).to.be.lessThan(
            Object.keys(colorsBefore).length,
            "Filtering should reduce the number of legend items",
          );

          const legendHexColors: string[] = [];

          $dots.each((_i, dot) => {
            const $dot = Cypress.$(dot);
            const color = $dot.css("background-color");
            const label = $dot.next().text();
            expect(colorsBefore[label]).to.equal(
              color,
              `Color for "${label}" should be stable after filtering`,
            );
            legendHexColors.push(Color(color).hex());
          });

          cy.log("Chart series colors should match legend colors");
          for (const hex of legendHexColors) {
            H.echartsContainer().find(`path[stroke="${hex}"]`).should("exist");
          }

          cy.log("Search pill color indicator should match legend count");
          H.MetricsViewer.searchBarPills()
            .contains(
              "[data-testid=metrics-viewer-search-pill]",
              "Count of orders",
            )
            .findByTestId("color-indicator-container")
            .children()
            .should("have.length", legendHexColors.length);
        });
    });
  });

  // ============================================================================
  // Drill Through
  // ============================================================================

  describe("Drill through", () => {
    beforeEach(() => {
      interceptDatasetQuery();
      H.MetricsViewer.goToViewer();
      addMetric("Count of orders");
      cy.wait("@dataset");
      //should work with metric math as well
      addMetricMath([
        { metricName: "Count of orders" },
        "+",
        { metricName: "Test Measure" },
      ]);
      cy.wait("@dataset");
    });

    it("should drill into more granular time dimensions on timeseries chart", () => {
      H.MetricsViewer.getMerticControls()
        .findByRole("button", { name: /by month/ })
        .should("exist");
      // this is messy, but adding the metric math expression causes the viz to unmount and dispose the ECharts instance
      // if you click on the chart while it's being disposed, the click isn't handled properly
      cy.wait(1000);
      H.MetricsViewer.getMetricVisualization()
        .get("path[stroke='#EF8C8C']")
        .eq(4)
        .click();
      H.popover().findByText("See this month by week").click();

      H.MetricsViewer.getMerticControls()
        .findByRole("button", { name: /by week/ })
        .should("exist");
      H.MetricsViewer.getMetricVisualizationDataPoints().should(
        "have.length",
        10,
      );
    });

    it("should allow me to do brush style time range filtering", () => {
      H.applyBrush(100, 250);
      H.MetricsViewer.getMetricVisualization().within(() => {
        cy.findByText(/June/).should("be.visible");
        cy.findByText(/July/).should("be.visible");
        cy.findByText(/August/).should("be.visible");
        cy.findByText(/September/).should("be.visible");
        cy.findByText(/October/).should("be.visible");
        cy.findByText(/November/).should("be.visible");
      });
    });
  });

  describe("Dimension filters", () => {
    beforeEach(() => {
      interceptDatasetQuery();
      H.MetricsViewer.goToViewer();
    });

    it("should not show 'No compatible dimensions' after deleting and retyping an expression with metrics in a different order (UXW-3748)", () => {
      cy.log("Create expression: Count of orders + Count of products");
      addMetricMath([
        { metricName: "Count of orders" },
        "+",
        { metricName: "Count of products" },
      ]);
      cy.wait("@dataset");
      H.MetricsViewer.getMetricVisualization().should("be.visible");

      cy.log(
        "Re-enter the formula editor, delete the whole expression, retype with metrics in the opposite order",
      );
      H.MetricsViewer.searchInput().clear();
      addMetricMath([
        { metricName: "Count of products" },
        "+",
        { metricName: "Count of orders" },
      ]);
      cy.wait("@dataset");

      cy.log("Expression should run without 'No compatible dimensions' error");
      H.MetricsViewer.getMetricVisualization().should("be.visible");
    });
  });

  describe("metric math", () => {
    beforeEach(() => {
      interceptDatasetQuery();
      H.MetricsViewer.goToViewer();
      addMetric("Count of orders");
      cy.wait("@dataset");
    });
    it("should apply filters and dimensions to individual metric instances within expressions", () => {
      selectBreakout("Count of orders", "Category");
      cy.wait("@dataset");
      addMetricMath([
        { metricName: "Count of orders" },
        "+",
        { metricName: "Count of orders" },
      ]);
      cy.wait("@dataset");

      H.MetricsViewer.getFilterButton().click();
      H.popover().within(() => {
        cy.findAllByText("Count of orders")
          .should("have.length", 3)
          .eq(1)
          .click();
        cy.findByText("Category").click();
        cy.findByText("Doohickey").click();
        cy.button("Add filter").click();
      });
      H.MetricsViewer.getFilterButton().click();
      H.popover().within(() => {
        cy.findAllByText("Count of orders").eq(2).click();
        cy.findByText("Category").click();
        cy.findByText("Gadget").click();
        cy.button("Add filter").click();
      });
      H.MetricsViewer.getMerticControls()
        .findByRole("button", { name: /All time/i })
        .click();
      H.popover().findByText("Previous 12 months").click();

      function assertMetricMath() {
        cy.log("breakout is applied");
        H.MetricsViewer.searchBarPills()
          .contains(
            "[data-testid=metrics-viewer-search-pill]",
            "Count of orders",
          )
          .findByTestId("color-indicator-container")
          .children()
          .should("have.length", 4);
        cy.log(
          "filter pills are in place and show the badge indicating the unique metric instance",
        );
        const filterPills = H.MetricsViewer.getAllFilterPills();
        filterPills.should("have.length", 2);
        H.MetricsViewer.getAllFilterPills()
          .eq(0)
          .findByText("2")
          .should("not.exist");
        H.MetricsViewer.getAllFilterPills()
          .eq(1)
          .findByText("2")
          .should("exist");

        cy.log("dimension filter is applied");
        H.MetricsViewer.getMetricVisualizationDataPoints().should(
          "have.length.of.at.most",
          60,
        );
        switchToTab("Totals");
        cy.log("correct value is calculated from metric math expression");
        H.MetricsViewer.getAllMetricVisualizations()
          .should("have.length", 5)
          .eq(4)
          .contains("8,915");
        switchToTab("Created At");
      }
      assertMetricMath();

      cy.log("refresh and assert again");
      cy.reload();
      assertMetricMath();

      cy.log("edit formula and assert again");
      H.MetricsViewer.searchInput().type("{end} + 0", { delay: 100 });
      H.MetricsViewer.runButton().click();
      assertMetricMath();
    });

    it("should handle metrics with numeric names in expressions", () => {
      const NUMERIC_METRIC_NAME = "123";
      H.createQuestion({
        name: NUMERIC_METRIC_NAME,
        type: "metric",
        description: "A metric with a numeric name",
        query: {
          "source-table": ORDERS_ID,
          aggregation: [["count"]],
        },
        display: "scalar",
      });

      cy.log("Add numeric metric '123' as standalone");
      cy.findByTestId("metrics-formula-input").click();
      H.MetricsViewer.searchInput().type(`, ${NUMERIC_METRIC_NAME}`);
      H.MetricsViewer.searchResults().findByText(NUMERIC_METRIC_NAME).click();
      H.MetricsViewer.runButton().click();
      cy.wait("@dataset");

      cy.log("Sum metric '123' with itself — both selected from dropdown");
      cy.findByTestId("metrics-formula-input").click();
      H.MetricsViewer.searchInput().type(`+ ${NUMERIC_METRIC_NAME}`);
      H.MetricsViewer.searchResults().findByText(NUMERIC_METRIC_NAME).click();
      H.MetricsViewer.runButton().click();
      cy.wait("@dataset");
      H.MetricsViewer.getMetricVisualization().should("exist");

      cy.log(
        "Append literal number 123 — typed without selecting from dropdown",
      );
      cy.findByTestId("metrics-formula-input").click();
      H.MetricsViewer.searchInput().type("+ 123");
      H.MetricsViewer.runButton().click();
      cy.wait("@dataset");
      H.MetricsViewer.getMetricVisualization().should("exist");

      cy.log("Append metric '123' as standalone — selected from dropdown");
      cy.findByTestId("metrics-formula-input").click();
      H.MetricsViewer.searchInput().type(`, ${NUMERIC_METRIC_NAME}`);
      H.MetricsViewer.searchResults().findByText(NUMERIC_METRIC_NAME).click();
      H.MetricsViewer.runButton().click();
      cy.wait("@dataset");
      H.MetricsViewer.getMetricVisualization().should("exist");

      cy.log("Verify final pill layout");
      H.MetricsViewer.searchBarPills().should("have.length", 3);
      H.MetricsViewer.searchBarPills()
        .eq(0)
        .should("contain", "Count of orders");
      H.MetricsViewer.searchBarPills().eq(1).should("contain", "123 + 123");
      H.MetricsViewer.searchBarPills().eq(2).should("contain", "123");
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
      addMetric(METRIC_NAME);
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

function createMetrics(metrics: StructuredQuestionDetailsWithName[]) {
  metrics.forEach((metric) => H.createQuestion(metric));
}

function createTestMeasure(
  opts: {
    name?: string;
    description?: string;
    tableId?: number;
    aggregation?: unknown[];
  } = {},
) {
  const {
    name = "Test Measure",
    description,
    tableId = ORDERS_ID,
    aggregation = ["sum", ["field", ORDERS.TOTAL, null]],
  } = opts;

  H.createMeasure({
    name,
    description,
    table_id: tableId,
    definition: {
      type: "query",
      database: SAMPLE_DB_ID,
      query: {
        "source-table": tableId,
        aggregation: [aggregation],
      },
    },
  }).then(({ body }) => {
    cy.wrap(body.id).as("measureId");
  });
}
