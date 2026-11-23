import Color from "color";

const { H } = cy;

import { SAMPLE_DB_ID, WRITABLE_DB_ID } from "e2e/support/cypress_data";
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import {
  FIRST_COLLECTION_ID,
  ORDERS_MODEL_ID,
} from "e2e/support/cypress_sample_instance_data";
import type { StructuredQuestionDetails } from "e2e/support/helpers";
import type { ListMetricDimensionsResponse } from "metabase-types/api";

const { ORDERS_ID, ORDERS, PRODUCTS_ID, PRODUCTS, ACCOUNTS_ID, FEEDBACK_ID } =
  SAMPLE_DATABASE;

type StructuredQuestionDetailsWithName = StructuredQuestionDetails & {
  name: string;
};

type CompactMetricsViewerUrlState = {
  t?: Array<{
    i?: string;
    t?: string;
    l?: string;
    D?: Array<{
      i?: number;
      d?: string;
    }>;
  }>;
  a?: string | null;
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
  collection_id: FIRST_COLLECTION_ID,
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
const INPUT_PLACEHOLDER_TEXT = "Search for metrics...";

// ============================================================================
// Test Helpers
// ============================================================================

type InputToken =
  | { nameOrPath: string | string[] }
  | "+"
  | "-"
  | "*"
  | "/"
  | ",";

const selectEntityPickerItem = (path: string | string[]) => {
  if (typeof path === "string") {
    // Escape special regex characters and match exact text
    const escapedPath = path.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    H.miniPicker()
      .findAllByRole("menuitem")
      .contains(new RegExp(`^${escapedPath}$`))
      .click();
  } else {
    H.miniPickerBrowseAll().click();
    H.pickEntity({ path });
  }
};

const addMetricInputSequence = (
  sequence: InputToken[],
  { runExpression = true, clearInput = false } = {},
) => {
  H.MetricsViewer.searchInput()
    .should(($input) => {
      expect(
        $input.text().trim(),
        "editor session is initialized",
      ).not.to.equal("");
    })
    .then(($input) => {
      if (clearInput) {
        cy.wrap($input).clear({ waitForAnimations: true });
        return;
      }

      const currentText = $input.text().trim();

      if (
        currentText !== INPUT_PLACEHOLDER_TEXT &&
        typeof sequence[0] !== "string"
      ) {
        cy.wrap($input).type("{end}, ", {
          waitForAnimations: true,
        });
      }
    });

  for (let i = 0; i < sequence.length; i++) {
    const item = sequence[i];

    if (typeof item !== "object") {
      H.MetricsViewer.searchInput().type(`{end}${item}`, {
        waitForAnimations: true,
      });
    } else {
      selectEntityPickerItem(item.nameOrPath);
    }
  }

  if (runExpression) {
    runFormula();
    // It is expected that the elements below do not exist after the expression ran successfully
    cy.findByTestId("metrics-viewer-search-input").should("not.exist");
    cy.findByTestId("run-expression-button").should("not.exist");
    cy.findByTestId("loading-indicator").should("not.exist");
  }
};

/**
 * Add a metric or measure to the explorer via the search panel
 */
const addMetric = (
  nameOrPath: string | string[],
  { runExpression = true, clearInput = false } = {},
) => {
  addMetricInputSequence([{ nameOrPath }], {
    runExpression,
    clearInput,
  });
};

const runFormula = () => {
  H.MetricsViewer.runButton().should("not.be.disabled").click();
};

/**
 * Select a breakout dimension
 */
const selectBreakout = (
  cardName: string,
  dimensionName: string,
  index = 0,
  binning?: string,
) => {
  H.MetricsViewer.searchBarPills().contains(cardName).click();
  H.popover().findByText("Add a series breakout").click();
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
  cy.wait("@dataset");
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
 * Select a dimension breakout from the sidebar and close it.
 */
const selectDimensionBreakout = (
  dimensionName: string,
  { seeAll = false, waitForDataset = true } = {},
) => {
  H.MetricsViewer.openDimensionPickerSidebar();
  if (seeAll) {
    H.MetricsViewer.dimensionPickerSidebar()
      .findByRole("button", { name: "See all" })
      .click();
  }
  H.MetricsViewer.dimensionPickerSidebar()
    .findByRole("button", { name: dimensionName })
    .click();
  H.MetricsViewer.closeDimensionPickerSidebar();

  if (waitForDataset) {
    cy.wait("@dataset");
  }
};

const decodeMetricsViewerUrlHash = (
  hash: string,
): CompactMetricsViewerUrlState => {
  const encodedHash = hash.replace(/^#/, "");
  const base64 = encodedHash.replace(/-/g, "+").replace(/_/g, "/");
  const paddedBase64 = base64.padEnd(Math.ceil(base64.length / 4) * 4, "=");
  const bytes = Uint8Array.from(atob(paddedBase64), (char) =>
    char.charCodeAt(0),
  );

  // Unjustified type cast. FIXME
  return JSON.parse(
    new TextDecoder().decode(bytes),
  ) as CompactMetricsViewerUrlState;
};

const assertMetricControlsDoNotOverflowViewport = () => {
  H.MetricsViewer.getMetricControls().then(($controls) => {
    const rect = $controls[0].getBoundingClientRect();
    const viewportWidth = Cypress.config("viewportWidth");

    expect(Math.floor(rect.left)).to.be.at.least(0);
    expect(Math.ceil(rect.right)).to.be.at.most(viewportWidth);
  });
};

const testMeasurePath = [
  "Databases",
  "Sample Database",
  "Orders",
  "Test Measure",
];

describe("scenarios > metrics > explorer", () => {
  before(() => {
    H.restore();
    cy.signInAsAdmin();
    createMetrics(ALL_MODELS);
    createTestMeasure();
    cy.then(() => {
      const ordersMetricId = createdMetricIds[ORDERS_SCALAR_METRIC.name];
      seedMetricDimensions(ordersMetricId);
      addConnectionDimension(ordersMetricId, "Product", "Category");
      addConnectionDimension(ordersMetricId, "User", "Source");
      addConnectionDimension(ordersMetricId, "User", "State");
      addConnectionDimension(ordersMetricId, "User", "Birth Date");
    });
    H.snapshot(SNAPSHOT_NAME);
  });

  beforeEach(() => {
    // Unjustified type cast. FIXME
    H.restore(SNAPSHOT_NAME as any);
    cy.signInAsAdmin();

    interceptDatasetQuery();
    cy.intercept("GET", "/api/metric/*").as("getMetric");
    H.resetSnowplow();
    H.enableTracking();
  });

  afterEach(() => {
    H.expectNoBadSnowplowEvents();
  });

  describe("Adding metrics and measures", () => {
    it("should add metrics, duplicates, and measures, persist them in the URL, and show no search results for unknown names", () => {
      H.MetricsViewer.goToViewer();
      cy.url().should("include", "/explore");
      cy.findByRole("heading", { name: "Start exploring" }).should(
        "be.visible",
      );

      addMetric("Count of products");

      H.expectUnstructuredSnowplowEvent({
        event: "metrics_viewer_metric_added",
        event_detail: "metric",
      });

      H.echartsContainer().should("be.visible");

      cy.log("should persist state in url");
      cy.reload();
      verifyMetricCount(1);

      addMetric("Count of orders");
      verifyMetricCount(2);

      cy.log("allows duplicates");
      addMetric("Count of products");
      verifyMetricCount(3);

      cy.log("Should allow me to add measures");
      addMetricInputSequence([{ nameOrPath: testMeasurePath }]);
      verifyMetricCount(4);
      H.MetricsViewer.searchBarPills().should("contain.text", "Test Measure");
      H.expectUnstructuredSnowplowEvent({
        event: "metrics_viewer_metric_added",
        event_detail: "measure",
      });

      cy.log("no results");
      H.MetricsViewer.searchInput().type("{end}xyznonexistent", {
        waitForAnimations: true,
      });
      H.miniPicker().should("contain.text", "No search results");
    });

    it("should not show me metrics that live in collections I do not have permissions to see", () => {
      cy.signIn("nocollection");
      H.MetricsViewer.goToViewer();
      H.MetricsViewer.searchInput().type("Count of", {
        waitForAnimations: true,
      });
      H.miniPicker().should("contain.text", "No search results");

      H.MetricsViewer.searchInput().clear().type("Test Measure");
      H.miniPicker().should("contain.text", "Test Measure");
    });

    it("should hide measures without data permissions and run readable metrics", () => {
      cy.signIn("nodata");
      H.MetricsViewer.goToViewer();
      H.MetricsViewer.searchInput().type("Test Measure", {
        waitForAnimations: true,
      });
      H.miniPicker().should("contain.text", "No search results");

      addMetric("Count of orders", { clearInput: true });
      H.cartesianChartCircle().should("have.length.at.least", 1);
    });
  });

  describe("Breakouts", () => {
    beforeEach(() => {
      H.MetricsViewer.goToViewer();
      addMetric("Count of orders");
    });

    it("should add, change, and remove a temporal series breakout, then add a numeric breakout with default binning", () => {
      cy.log("temporal breakout with year binning");
      selectBreakout("Count of orders", "Created At", 0, "Year");
      H.MetricsViewer.breakoutLegend().within(() => {
        cy.findByRole("heading", { name: "Created At" }).should("be.visible");
        ["2025", "2026", "2027", "2028", "2029"].forEach((year) => {
          cy.findByText(year).should("be.visible");
        });
      });

      cy.log("each breakout color reaches the real chart");
      H.MetricsViewer.breakoutLegend()
        .findAllByTestId("breakout-legend-dot")
        .should("have.length", 5)
        .each(($dot) => {
          const hex = Color($dot.css("background-color")).hex();
          H.echartsContainer().find(`path[stroke="${hex}"]`).should("exist");
        });

      H.MetricsViewer.searchBarPills()
        .contains("[data-testid=metrics-viewer-pill]", "Count of orders")
        .findByTestId("color-indicator-container")
        .children()
        .should("have.length", 5);

      cy.log("change the series breakout");
      H.MetricsViewer.searchBarPills().contains("Count of orders").click();
      H.popover().findByText("Change series breakout").click();
      H.popover().findByText("Category").click();

      H.MetricsViewer.breakoutLegend()
        .findByRole("heading", { name: /Category/ })
        .should("be.visible");

      cy.log("remove the series breakout");
      H.MetricsViewer.searchBarPills().contains("Count of orders").click();
      H.popover().findByText("Remove series breakout").click();
      H.MetricsViewer.breakoutLegend().should("not.exist");

      cy.log("numeric breakout with default binning");
      selectBreakout("Count of orders", "Total");
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
        .contains("[data-testid=metrics-viewer-pill]", "Count of orders")
        .findByTestId("color-indicator-container")
        .children()
        .should("have.length", 6);
    });
  });

  describe("Filters", () => {
    beforeEach(() => {
      H.MetricsViewer.goToViewer();
      addMetric("Count of orders");
    });

    it("should apply filters to each metric individually, and change time granularity and date range (UXW-4849)", () => {
      addMetric("Count of products");
      selectDimensionBreakout("Category");
      H.MetricsViewer.assertVizType("Bar");
      H.MetricsViewer.getAllMetricVisualizations().should("have.length", 1);
      H.MetricsViewer.changeVizType("line");
      H.MetricsViewer.getMetricVisualizationDataPoints().should(
        "have.length",
        8,
      );

      H.MetricsViewer.getFilterButton().click();
      H.popover().within(() => {
        cy.button(/count of orders/i)
          .should("be.visible")
          .click();
        cy.findByText("Category").should("be.visible");
        cy.findByText("Orders").should("not.exist");
        cy.findByText("Product").should("not.exist");
        cy.findByText("User").should("not.exist");
        cy.button(/count of orders/i).click();
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
        "Should allow me to change time granularity and range on time based dimensions",
      );
      selectDimensionBreakout("Time");

      H.MetricsViewer.getMetricVisualizationDataPoints().should(
        "have.length",
        85,
      );
      H.MetricsViewer.getMetricControls()
        .findByRole("button", { name: /by month/i })
        .click();
      H.popover().findByText("Year").click();
      H.MetricsViewer.getMetricVisualizationDataPoints().should(
        "have.length",
        9,
      );
      H.MetricsViewer.getMetricControls()
        .findByRole("button", { name: /by year/i })
        .click();
      H.popover().findByText("Month").click();

      H.MetricsViewer.getMetricControls()
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
      H.MetricsViewer.getMetricControls()
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

      H.MetricsViewer.getMetricControls()
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
  });

  describe("Segments", () => {
    beforeEach(() => {
      H.MetricsViewer.goToViewer();
    });

    it("should apply a segment as a filter to a metric", () => {
      const SEGMENT_NAME = "Big orders";

      H.createSegment({
        name: SEGMENT_NAME,
        description: "Orders with a total over $100",
        definition: {
          database: SAMPLE_DB_ID,
          type: "query",
          query: {
            "source-table": ORDERS_ID,
            filter: [">", ["field", ORDERS.TOTAL, null], 100],
          },
        },
      });

      addMetric("Count of orders");

      H.MetricsViewer.getFilterButton().click();

      cy.log(
        "segment should appear alongside dimensions in the filter popover",
      );
      H.popover().findByText(SEGMENT_NAME).should("be.visible");

      cy.log("search should match segment names");
      H.popover().findByPlaceholderText("Search dimensions...").type("big");
      H.popover().findByText(SEGMENT_NAME).should("be.visible");
      H.popover().findByPlaceholderText("Search dimensions...").clear();

      cy.log("clicking a segment applies it directly as a filter");
      H.popover().findByText(SEGMENT_NAME).click();

      H.MetricsViewer.getAllFilterPills()
        .should("have.length", 1)
        .should("contain.text", SEGMENT_NAME);

      H.expectUnstructuredSnowplowEvent({
        event: "metrics_viewer_filter_added",
        triggered_from: "metric_filter",
      });

      cy.log("removing the segment pill removes the filter");
      H.MetricsViewer.getAllFilterPills()
        .eq(0)
        .findByLabelText("Remove")
        .click();

      H.MetricsViewer.getAllFilterPills().should("have.length", 0);

      H.expectUnstructuredSnowplowEvent({
        event: "metrics_viewer_filter_removed",
        triggered_from: "metric_filter",
      });
    });
  });

  describe("Drill through", () => {
    beforeEach(() => {
      H.MetricsViewer.goToViewer();
      addMetricInputSequence([{ nameOrPath: "Count of orders" }]);
      cy.wait("@dataset");
      addMetricInputSequence([
        ",",
        { nameOrPath: "Count of orders" },
        "+",
        { nameOrPath: testMeasurePath },
      ]);
      // The second run re-renders the chart once the measure's dataset
      // arrives; brushing during that re-render is swallowed because ECharts
      // resets the brush cursor on setOption. Wait for the data first —
      // ensureChartIsActive alone passes on the still-single-series chart.
      cy.wait("@dataset");
    });

    it("should drill into more granular time dimensions on timeseries chart", () => {
      H.MetricsViewer.getMetricControls()
        .findByRole("button", { name: /by month/ })
        .should("be.visible");
      H.ensureChartIsActive();
      H.cartesianChartCircles()
        .eq(4)
        .should("be.visible")
        .click({ force: true });
      H.popover()
        .findByText("See this month by week")
        .should("be.visible")
        .click({ force: true });

      H.MetricsViewer.getMetricControls()
        .findByRole("button", { name: /by week/ })
        .should("be.visible");
      H.MetricsViewer.getMetricVisualizationDataPoints().should(
        "have.length.at.least",
        10,
      );
    });

    it("should allow me to do brush style time range filtering", () => {
      H.MetricsViewer.getMetricControls()
        .findByRole("button", { name: /All time/i })
        .should("be.visible");
      H.ensureChartIsActive();
      H.applyBrush(100, 250);
      H.MetricsViewer.getMetricControls()
        .findByRole("button", { name: /All time/i })
        .should("not.exist");
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

  describe("Responsive viewer controls", () => {
    const setupTimeControls = (width: number) => {
      cy.viewport(1280, 900);
      H.MetricsViewer.goToViewer();
      H.MetricsViewer.searchInput().type("{end}, Count of orders", {
        waitForAnimations: true,
      });
      H.miniPicker()
        .findByText("Count of orders")
        .closest("[role='menuitem']")
        .click();
      runFormula();
      cy.wait("@dataset");
      cy.viewport(width, 900);
    };

    it("shows compact controls at phone widths and keeps them interactive", () => {
      setupTimeControls(480);

      H.MetricsViewer.getMetricControls()
        .findByTestId("metrics-viewer-compact-chart-controls")
        .should("be.visible");
      H.MetricsViewer.getMetricControls()
        .findByTestId("metrics-viewer-x-axis-controls")
        .should("be.visible");

      H.MetricsViewer.getMetricControls()
        .findByTestId("metrics-viewer-compact-chart-controls")
        .click();
      H.popover().findByText("Visualization").should("be.visible");
      H.popover().findByRole("menuitem", { name: "Bar chart" }).click();
      H.MetricsViewer.assertVizType("Bar");

      H.MetricsViewer.getMetricControls()
        .findByTestId("metrics-viewer-x-axis-controls")
        .click();
      H.popover()
        .findByRole("button", { name: "Change column" })
        .should("be.visible")
        .should("contain.text", "Time");
      H.popover()
        .findByRole("button", { name: /by month/i })
        .should("be.visible");
      H.popover().findByRole("button", { name: "Change column" }).click();
      H.MetricsViewer.dimensionPickerSidebar().should("be.visible");
      cy.get(H.POPOVER_ELEMENT).should("not.exist");
      assertMetricControlsDoNotOverflowViewport();
    });
  });

  describe("Metric math", () => {
    beforeEach(() => {
      H.MetricsViewer.goToViewer();
      addMetric("Count of orders");
    });

    it("should apply filters and dimensions to individual metric instances within expressions", () => {
      addMetricInputSequence(
        [
          { nameOrPath: "Count of orders" },
          "+",
          { nameOrPath: "Count of orders" },
        ],
        { clearInput: true },
      );

      selectDimensionBreakout("Category");

      H.MetricsViewer.getFilterButton().click();
      H.popover().within(() => {
        cy.findAllByRole("button", { name: /Count of orders/ })
          .should("have.length", 2)
          .eq(0)
          .click();
        cy.findByText("Category").click();
        cy.findByText("Doohickey").click();
        cy.button("Add filter").click();
      });
      cy.wait("@dataset");
      H.MetricsViewer.getFilterButton().click();
      H.popover().within(() => {
        cy.findAllByRole("button", { name: /Count of orders/ })
          .eq(1)
          .click();
        cy.findByText("Category").click();
        cy.findByText("Doohickey").click();
        cy.button("Add filter").click();
      });
      cy.wait("@dataset");
      function assertMetricMath() {
        cy.log("breakout is applied");
        H.MetricsViewer.getColumnPickerButton().should(
          "contain.text",
          "Category",
        );
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
          .should("be.visible");

        cy.log("metric math expression still renders with the applied state");
        H.MetricsViewer.getMetricVisualization().should("be.visible");

        cy.log("the Category filters are applied");
        H.echartsContainer().within(() => {
          cy.findByText("Doohickey").should("be.visible");
          cy.findByText("Gadget").should("not.exist");
          cy.findByText("Gizmo").should("not.exist");
          cy.findByText("Widget").should("not.exist");
        });
      }
      assertMetricMath();

      cy.log("refresh and assert again");
      cy.reload();
      cy.wait("@dataset");
      assertMetricMath();

      cy.log("edit formula and assert again");
      H.MetricsViewer.searchInput().type("{end} + 0", {
        waitForAnimations: true,
      });
      runFormula();
      cy.wait("@dataset");
      assertMetricMath();
    });
  });
});

describe("scenarios > metrics > explorer > BigInt filters", () => {
  beforeEach(() => {
    interceptDatasetQuery();
  });

  it("should filter on BigInt values", () => {
    const DECIMAL_PK_TABLE_NAME = "decimal_pk_table";
    const METRIC_NAME = "Count of decimal_pk_table";

    H.restore("postgres-writable");
    cy.signInAsAdmin();
    H.resetTestTable({ type: "postgres", table: DECIMAL_PK_TABLE_NAME });
    H.resyncDatabase({ dbId: WRITABLE_DB_ID, tables: [DECIMAL_PK_TABLE_NAME] });

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

describe("scenarios > metrics > explorer > shared dimensions", () => {
  const SHARED_DIMENSIONS_SNAPSHOT = "shared-dimensions-snapshot";

  const createSeededMetric = (details: StructuredQuestionDetailsWithName) =>
    H.createQuestion(details).then(({ body }) => {
      expect(body.id).to.be.a("number");
      if (typeof body.id === "number") {
        return seedMetricDimensions(body.id);
      }
    });

  const assertSerializedDimensionBreakout = (
    check: (
      dimensionBreakout: NonNullable<CompactMetricsViewerUrlState["t"]>[0],
    ) => void,
  ) => {
    cy.location("hash").should((hash) => {
      const [dimensionBreakout] = decodeMetricsViewerUrlHash(hash).t ?? [];
      expect(dimensionBreakout, "a serialized dimension breakout").to.exist;
      if (dimensionBreakout) {
        check(dimensionBreakout);
      }
    });
  };

  const metricIds: Record<string, number> = {};

  const createFixtureMetric = (
    name: string,
    details: StructuredQuestionDetailsWithName,
    curate?: (metricId: number) => void,
  ) =>
    createSeededMetric({ ...details, name }).then((metricId) => {
      metricIds[name] = metricId;
      curate?.(metricId);
    });

  // The formula is built through the URL state instead of the search picker:
  // fixture metrics share the app db with the sample content, so the picker's
  // top suggestions are not guaranteed to include them.
  let viewerVisitCount = 0;

  const visitViewerWithMetrics = (names: string[]) => {
    const state = JSON.stringify({
      f: names.map((name) => ({ t: "metric", i: metricIds[name] })),
    });
    const hash = btoa(state)
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");
    // A unique query string forces a full document load; visiting only with a
    // changed hash would hand the new state to the previous test's stale app.
    viewerVisitCount += 1;
    cy.visit(`/explore?visit=${viewerVisitCount}#${hash}`);
    H.MetricsViewer.searchBarPills().should("have.length", names.length);
    H.MetricsViewer.getAllMetricVisualizations().should(
      "have.length.at.least",
      1,
    );
  };

  before(() => {
    H.restore();
    cy.signInAsAdmin();

    createFixtureMetric(
      "Orders with product category",
      ORDERS_SCALAR_METRIC,
      (metricId) =>
        addConnectionDimension(
          metricId,
          "Product",
          "Category",
          "Product Category",
        ),
    );
    createFixtureMetric("Plain products", PRODUCTS_SCALAR_METRIC);
    createFixtureMetric(
      "Orders with default category",
      ORDERS_SCALAR_METRIC,
      (metricId) => {
        addConnectionDimension(
          metricId,
          "Product",
          "Category",
          "Product Category",
        );
        setDefaultCuratedDimension(metricId, "Product Category");
      },
    );

    H.snapshot(SHARED_DIMENSIONS_SNAPSHOT);
  });

  beforeEach(() => {
    H.restore(SHARED_DIMENSIONS_SNAPSHOT);
    cy.signInAsAdmin();
    interceptDatasetQuery();
  });

  describe("Shared dimension matching", () => {
    it("shares dimensions with the same source column under the first metric's dimension name", () => {
      visitViewerWithMetrics([
        "Orders with product category",
        "Plain products",
      ]);

      H.MetricsViewer.openDimensionPickerSidebar().within(() => {
        cy.findByText("Shared dimensions").should("be.visible");
        cy.findByRole("button", { name: "Time" }).should("be.visible");
        cy.log(
          "Orders' added connection dimension and Products' own Category read the same column, so they merge into one option",
        );
        cy.findByRole("button", { name: "Category" }).should("not.exist");
        cy.findByRole("button", { name: "Product Category" }).click();
      });
      cy.wait(["@dataset", "@dataset"]);

      assertSerializedDimensionBreakout((dimensionBreakout) => {
        expect(dimensionBreakout.t).to.equal("category");
        expect(dimensionBreakout.D).to.have.length(2);
        expect(
          dimensionBreakout.D?.every((entry) => entry.d != null),
          "every metric mapped",
        ).to.be.true;
      });
    });
  });

  describe("Initial dimension breakout", () => {
    it("selects the curated default dimension when landing from the metric's Explore button", () => {
      getCuratedDimensionId(
        metricIds["Orders with default category"],
        "Product Category",
      ).as("defaultDimensionId");

      H.visitMetric(metricIds["Orders with default category"]);
      H.MetricPage.exploreLink().click();
      H.MetricsViewer.searchBarPills().should("have.length", 1);
      cy.wait("@dataset");

      cy.log("the curated default wins over the usual time-first breakout");
      H.echartsContainer().findByText("Doohickey").should("be.visible");
      cy.then(function () {
        assertSerializedDimensionBreakout((dimensionBreakout) => {
          expect(dimensionBreakout.t).to.equal("category");
          expect(
            dimensionBreakout.D?.find((entry) => entry.i === 0)?.d,
          ).to.equal(this.defaultDimensionId);
        });
      });
    });
  });
});

const createdMetricIds: Record<string, number> = {};

function createMetrics(metrics: StructuredQuestionDetailsWithName[]) {
  metrics.forEach((metric) =>
    H.createQuestion(metric).then(({ body }) => {
      createdMetricIds[metric.name] = body.id;
    }),
  );
}

// Reading a metric seeds its curated dimension list with the self-table
// columns.
function seedMetricDimensions(metricId: number) {
  return cy.request("GET", `/api/metric/${metricId}`).then(() => metricId);
}

function addConnectionDimension(
  metricId: number,
  groupName: string,
  dimensionName: string,
  displayName = dimensionName,
) {
  return cy
    .request<ListMetricDimensionsResponse>(
      "GET",
      `/api/metric/${metricId}/dimension?with-addable=true`,
    )
    .then(({ body }) => {
      const group = body.addable.find(
        (addableGroup) => addableGroup.group.display_name === groupName,
      );
      const dimension = group?.dimensions.find(
        (addableDimension) => addableDimension.display_name === dimensionName,
      );
      expect(dimension, `addable dimension ${groupName} → ${dimensionName}`).to
        .exist;
      cy.request("POST", `/api/metric/${metricId}/dimension/add`, {
        dimensions: [{ ...dimension, display_name: displayName }],
      });
    });
}

function getCuratedDimensionId(metricId: number, dimensionName: string) {
  return cy
    .request<ListMetricDimensionsResponse>(
      "GET",
      `/api/metric/${metricId}/dimension`,
    )
    .then(
      ({ body }) =>
        body.added.find(
          (addedDimension) => addedDimension.display_name === dimensionName,
        )?.id,
    );
}

function setDefaultCuratedDimension(metricId: number, dimensionName: string) {
  return getCuratedDimensionId(metricId, dimensionName).then((dimensionId) => {
    expect(dimensionId, `curated dimension ${dimensionName}`).to.exist;
    cy.request("POST", `/api/metric/${metricId}/dimension/set-default`, {
      dimension_id: dimensionId,
    });
  });
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
    definition: {
      type: "query",
      database: SAMPLE_DB_ID,
      query: {
        "source-table": tableId,
        aggregation: [aggregation],
      },
    },
  });
}
