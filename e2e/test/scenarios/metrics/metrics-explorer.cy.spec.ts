import Color from "color";

const { H } = cy;

import { SAMPLE_DB_ID, WRITABLE_DB_ID } from "e2e/support/cypress_data";
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import {
  FIRST_COLLECTION_ID,
  ORDERS_MODEL_ID,
} from "e2e/support/cypress_sample_instance_data";
import type { StructuredQuestionDetails } from "e2e/support/helpers";

const {
  ORDERS_ID,
  ORDERS,
  PRODUCTS_ID,
  PRODUCTS,
  ACCOUNTS_ID,
  FEEDBACK_ID,
  PEOPLE_ID,
} = SAMPLE_DATABASE;

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
  {
    runExpression = true,
    clearInput = false,
    skipRunCompletionWait = false,
  } = {},
) => {
  H.MetricsViewer.searchInput().then(($input) => {
    if (clearInput) {
      cy.wrap($input).clear({ waitForAnimations: true });
      return;
    }

    const currentText = $input.text().trim();

    if (
      currentText !== INPUT_PLACEHOLDER_TEXT &&
      currentText !== "" &&
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
    if (!skipRunCompletionWait) {
      // It is expected that the elements below do not exist after the expression ran successfully
      cy.findByTestId("metrics-viewer-search-input").should("not.exist");
      cy.findByTestId("run-expression-button").should("not.exist");
      cy.findByTestId("loading-indicator").should("not.exist");
    }
  }
};

/**
 * Add a metric or measure to the explorer via the search panel
 */
const addMetric = (
  nameOrPath: string | string[],
  {
    runExpression = true,
    clearInput = false,
    skipRunCompletionWait = false,
  } = {},
) => {
  addMetricInputSequence([{ nameOrPath }], {
    runExpression,
    clearInput,
    skipRunCompletionWait,
  });
};

const runFormula = () => {
  cy.log("Make sure mini picker is closed before clicking Run");
  H.MetricsViewer.runButton().should("be.visible");
  cy.get("body").then(($body) => {
    if ($body.find('[data-testid="mini-picker"]').length > 0) {
      cy.realPress("Escape");
      cy.get('[data-testid="mini-picker"]').should("not.exist");
    }
  });

  H.MetricsViewer.runButton().should("not.be.disabled").click();
};

const runFormulaWithKeyboard = () => {
  H.MetricsViewer.runButton().should("not.be.disabled");
  H.MetricsViewer.searchInput().type("{enter}");
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
  cy.intercept("POST", "/api/metric/breakout-values").as("breakoutValues");
};

/**
 * Verify the grid displays the correct number of metric cards
 */
const verifyMetricCount = (count: number) => {
  H.MetricsViewer.searchBarPills().should("have.length", count);
};

/**
 * Open the rename flow on an expression pill by clicking it and then the
 * "Rename" menu item that appears in the action menu.
 */
const openExpressionRename = (pillIndex: number) => {
  H.MetricsViewer.searchBarPills()
    .should("have.length.at.least", pillIndex + 1)
    .eq(pillIndex)
    .click();

  H.popover().findByRole("menuitem", { name: "rename icon Rename" }).click();
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

const showColumnLabels = () => {
  H.MetricsViewer.getMetricControls()
    .findByLabelText("Column label options")
    .click();
  cy.findByRole("switch", { name: "Show column labels" }).click();
};

const getMetricsViewerUrlState =
  (): Cypress.Chainable<CompactMetricsViewerUrlState> => {
    return cy.location("hash").then((hash) => {
      return decodeMetricsViewerUrlHash(hash);
    });
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

const waitForSerializedDimensionBreakout = () => {
  cy.location("hash").should((hash) => {
    const state = decodeMetricsViewerUrlHash(hash);
    const [dimensionBreakout] = state.t ?? [];

    expect(state.t).to.have.length(1);
    expect(state.a).to.equal(dimensionBreakout?.i);
    expect(dimensionBreakout?.D).to.have.length(2);
  });
};

const addOrdersProductsExpression = () => {
  addMetricInputSequence(
    [
      { nameOrPath: "Count of orders" },
      "+",
      { nameOrPath: "Count of products" },
    ],
    { runExpression: false },
  );
  runFormulaWithKeyboard();
  cy.wait("@dataset");
};

const assertMetricControlsDoNotOverflowViewport = () => {
  H.MetricsViewer.getMetricControls().then(($controls) => {
    const rect = $controls[0].getBoundingClientRect();
    const viewportWidth = Cypress.config("viewportWidth");

    expect(Math.floor(rect.left)).to.be.at.least(0);
    expect(Math.ceil(rect.right)).to.be.at.most(viewportWidth);
  });
};

const openTimeDimensionConfiguration = () => {
  H.MetricsViewer.dimensionPickerSidebar()
    .findByRole("button", { name: "Time" })
    .realHover();

  H.MetricsViewer.dimensionPickerSidebar()
    .findByRole("button", { name: "Configure Time" })
    .click();
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
const DEFAULT_PLACEHOLDER_COLOR = "#071722";

const readColorsFromIndicator = ($pill: JQuery): string[] => {
  const colors: string[] = [];
  $pill
    .find("[data-testid='color-indicator-container']")
    .children()
    .each((_i, el) => {
      const $el = Cypress.$(el);
      // Multi-dot: backgroundColor is set; single icon: color is set
      const bg = $el.css("background-color");
      const fg = $el.css("color");
      const raw =
        bg && bg !== "rgba(0, 0, 0, 0)" && bg !== "transparent" ? bg : fg;
      colors.push(rgbToHex(raw));
    });
  return colors;
};

const getPillColors = (pillIndex: number): Cypress.Chainable<string[]> => {
  // eslint-disable-next-line metabase/no-unsafe-element-filtering
  return H.MetricsViewer.searchBarPills()
    .should("have.length.greaterThan", pillIndex)
    .eq(pillIndex)
    .should(($pill) => {
      const colors = readColorsFromIndicator($pill);
      expect(colors.length, "pill should have at least one color").to.be.gt(0);
      expect(
        colors.every((c) => c === DEFAULT_PLACEHOLDER_COLOR),
        "pill colors should not all be the default placeholder color",
      ).to.be.false;
    })
    .then(($pill) => readColorsFromIndicator($pill));
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
        .should("be.visible");
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
    cy.intercept("GET", "/api/measure/*").as("getMeasure");
    cy.intercept("GET", "/api/search*").as("search");
    H.resetSnowplow();
    H.enableTracking();
  });

  afterEach(() => {
    H.expectNoBadSnowplowEvents();
  });

  describe("Entry points", () => {
    it("should show empty state on first load", () => {
      H.MetricsViewer.goToViewer();
      cy.url().should("include", "/explore");
      cy.findByRole("heading", { name: "Start exploring" }).should(
        "be.visible",
      );

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

      H.MetricsViewer.searchBarPills().contains("Count of orders").click();
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

      cy.findByRole("heading", { name: "No results" }).should("be.visible");
    });
  });

  describe("Adding metrics and measures", () => {
    it("should add multiple metrics", () => {
      H.MetricsViewer.goToViewer();

      addMetric("Count of products");

      H.expectUnstructuredSnowplowEvent({
        event: "metrics_viewer_metric_added",
        event_detail: "metric",
      });

      addMetric("Count of orders");
      verifyMetricCount(2);

      cy.log("allows duplicates");
      addMetric("Count of products");

      cy.log("Should allow me to add measures");
      addMetricInputSequence([{ nameOrPath: testMeasurePath }]);
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

    it("should disable tables without measures when browsing database measures", () => {
      H.MetricsViewer.goToViewer();

      H.MetricsViewer.searchInput().type("Sample", { waitForAnimations: true });
      H.miniPickerBrowseAll().click();
      cy.findByTestId("nested-item-picker").should("be.visible");
      H.pickEntity({ path: ["Databases", "Sample Database"] });

      H.entityPickerModalItem(2, "People").should(
        "have.attr",
        "data-disabled",
        "true",
      );
      H.entityPickerModalItem(2, "Orders").should(
        "not.have.attr",
        "data-disabled",
      );

      H.entityPickerModal().within(() => {
        cy.findByPlaceholderText("Search…").type("Test");
        H.entityPickerModalItem(1, "Test Measure").should("be.visible");
      });
    });

    it("should add multiple metrics one by one using metrics dropdown", () => {
      H.MetricsViewer.goToViewer();
      addMetricInputSequence([
        { nameOrPath: "Count of products" },
        { nameOrPath: "Count of orders" },
        { nameOrPath: "Count of orders over time" },
        { nameOrPath: "Orders model metric" },
      ]);
      verifyMetricCount(4);
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

    it("should not show me measures that live in tables I do not have permissions to see", () => {
      cy.signIn("nodata");
      H.MetricsViewer.goToViewer();
      H.MetricsViewer.searchInput().type("Test Measure", {
        waitForAnimations: true,
      });
      H.miniPicker().should("contain.text", "No search results");

      addMetric("Count of orders", { clearInput: true });
      cy.log(
        "even though we can see the metric, we don't have permissions to run the query",
      );
      cy.findByRole("heading", {
        name: /You do not have permissions to run this query/i,
      }).should("be.visible");
    });
  });

  describe("Breakouts", () => {
    beforeEach(() => {
      H.MetricsViewer.goToViewer();
      addMetric("Count of orders");
    });

    it("should add a temporal breakout dimension", () => {
      selectBreakout("Count of orders", "Created At", 0, "Year");
      H.MetricsViewer.breakoutLegend().within(() => {
        cy.findByRole("heading", { name: "Created At" }).should("be.visible");
        const currentYear = new Date().getFullYear();
        for (let year = 2025; year <= currentYear; year++) {
          cy.findByText(String(year)).should("be.visible");
        }
      });

      H.MetricsViewer.searchBarPills()
        .contains("[data-testid=metrics-viewer-pill]", "Count of orders")
        .findByTestId("color-indicator-container")
        .children()
        .should("have.length", 5);

      H.MetricsViewer.searchBarPills().contains("Count of orders").click();
      H.popover().findByText("Change series breakout").click();
      H.popover().findByText("Category").click();

      H.MetricsViewer.breakoutLegend()
        .findByRole("heading", { name: /Category/ })
        .should("be.visible");

      H.MetricsViewer.searchBarPills().contains("Count of orders").click();
      H.popover().findByText("Remove series breakout").click();
      H.MetricsViewer.breakoutLegend().should("not.exist");
    });

    it("should add a categorical breakout dimension", () => {
      selectBreakout("Count of orders", "Source");
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

    it("should handle breakout independently for multiple instances of the same metric", () => {
      cy.log(
        "Expand formula editor and create expression with second metric instance",
      );
      addMetricInputSequence([
        { nameOrPath: "Count of orders" },
        "+",
        { nameOrPath: "Count of products" },
        { nameOrPath: "Count of orders" },
      ]);

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
      H.MetricsViewer.searchBarPills().eq(0).click();
      H.popover().findByText("Add a series breakout").click();
      H.popover().findByText("Source").click();

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
      H.MetricsViewer.searchBarPills().eq(2).click();
      H.popover().findByText("Add a series breakout").click();
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
      H.MetricsViewer.searchBarPills().eq(0).click();
      H.popover().findByText("Remove series breakout").click();

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
      addMetric("Count of orders");

      H.MetricsViewer.searchBarPills().should("have.length", 2);

      cy.log("Apply breakout to first instance of Count of orders");
      H.MetricsViewer.searchBarPills().eq(0).click();
      H.popover().findByText("Add a series breakout").click();
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
      cy.findByTestId("mini-picker").should("be.visible");
      H.MetricsViewer.searchInput().type(", Count of products", {
        waitForAnimations: true,
      });
      selectEntityPickerItem("Count of products");
      cy.wait("@getMetric");
      runFormula();
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
      addMetricInputSequence([
        { nameOrPath: "Count of orders" },
        "+",
        { nameOrPath: testMeasurePath },
      ]);

      cy.log("Expression pill menu only offers Rename, no breakout options");
      H.MetricsViewer.searchBarPills().eq(1).click();
      H.popover().within(() => {
        cy.findByRole("menuitem", { name: "rename icon Rename" }).should(
          "exist",
        );
        cy.findByText(/Add a series breakout/).should("not.exist");
        cy.findByText(/Change series breakout/).should("not.exist");
        cy.findByText(/Remove series breakout/).should("not.exist");
      });
    });
  });

  describe("Expression custom names", () => {
    beforeEach(() => {
      H.MetricsViewer.goToViewer();
      addMetric("Count of orders");
      H.MetricsViewer.getMetricVisualization().should("be.visible");
    });

    it("should allow setting a custom name on an expression pill", () => {
      addMetricInputSequence([
        { nameOrPath: "Count of orders" },
        "+",
        { nameOrPath: testMeasurePath },
      ]);

      cy.log("Click the expression pill to open name editor");
      H.MetricsViewer.searchBarPills()
        .should("have.length", 2)
        .eq(1)
        .should("contain.text", "Count of orders");
      openExpressionRename(1);

      cy.log("Type a custom name");
      cy.findByTestId("expression-name-input")
        .should("be.focused")
        .clear()
        .type("My Custom Expression{enter}");

      cy.log("Pill should display the custom name");
      H.MetricsViewer.searchBarPills()
        .should("have.length", 2)
        .eq(1)
        .should("contain.text", "My Custom Expression");

      cy.log("Add breakout on the first metric to trigger the legend");
      selectBreakout("Count of orders", "Source");

      cy.log("Legend should display the custom expression name");
      H.MetricsViewer.breakoutLegend().within(() => {
        cy.findAllByText("My Custom Expression")
          .should("be.visible")
          .should("have.length", 2);
        cy.findByText(/Test Measure/).should("not.exist");
      });

      cy.log("Chart tooltip should display the custom name");
      H.cartesianChartCircle()
        .should("have.length.at.least", 4)
        .eq(4)
        .trigger("mousemove", { force: true });
      H.echartsTooltip().within(() => {
        cy.findByText("My Custom Expression").should("be.visible");
        cy.findByText(/Test Measure/).should("not.exist");
      });
    });

    it("should revert to formula text when custom name is cleared", () => {
      addMetricInputSequence([
        { nameOrPath: "Count of orders" },
        "+",
        {
          nameOrPath: testMeasurePath,
        },
      ]);

      cy.log("Set a custom name");
      H.MetricsViewer.searchBarPills().should("have.length", 2);
      openExpressionRename(1);
      cy.findByTestId("expression-name-input")
        .clear()
        .type("Temporary Name{enter}");

      H.MetricsViewer.searchBarPills()
        .should("have.length", 2)
        .eq(1)
        .should("contain.text", "Temporary Name");

      cy.log("Clear the custom name");
      H.MetricsViewer.searchBarPills().should("have.length", 2);
      openExpressionRename(1);
      cy.findByTestId("expression-name-input").clear().type("{enter}");

      cy.log(
        "Pill should revert to formula-derived text (contains metric names)",
      );
      H.MetricsViewer.searchBarPills()
        .should("have.length", 2)
        .eq(1)
        .should("not.contain.text", "Temporary Name")
        .should("contain.text", "Count of orders");

      cy.log("Add breakout on the first metric to trigger the legend");
      selectBreakout("Count of orders", "Source");

      cy.log(
        "Legend should use the formula-derived name, not the old custom name",
      );
      H.MetricsViewer.breakoutLegend().within(() => {
        cy.findByText("Temporary Name").should("not.exist");
        cy.findAllByText("Count of orders + Test Measure")
          .should("be.visible")
          .should("have.length", 2);
      });

      cy.log(
        "Tooltip should use the formula-derived name, not the old custom name",
      );
      H.cartesianChartCircle()
        .should("have.length.at.least", 4)
        .eq(4)
        .trigger("mousemove", { force: true });
      H.echartsTooltip().within(() => {
        cy.findByText("Temporary Name").should("not.exist");
        cy.findByText("Count of orders + Test Measure").should("be.visible");
      });
    });

    it("should preserve custom name when re-running with the same expression", () => {
      addMetricInputSequence([
        { nameOrPath: "Count of orders" },
        "+",
        { nameOrPath: testMeasurePath },
      ]);

      cy.log("Set a custom name on the expression pill");
      H.MetricsViewer.searchBarPills().should("have.length", 2);
      openExpressionRename(1);
      cy.findByTestId("expression-name-input")
        .clear()
        .type("My Stable Name{enter}");

      H.MetricsViewer.searchBarPills()
        .should("have.length", 2)
        .eq(1)
        .should("contain.text", "My Stable Name");

      cy.log("Enter formula mode and re-run the expression");
      addMetric("Count of products");

      cy.log("Custom name should still be preserved");
      H.MetricsViewer.searchBarPills()
        .should("have.length", 3)
        .eq(1)
        .should("contain.text", "My Stable Name");

      cy.log("Tooltip should display the preserved custom name");
      H.cartesianChartCircle()
        .should("have.length.at.least", 4)
        .eq(4)
        .trigger("mousemove", { force: true });
      H.echartsTooltip().within(() => {
        cy.findByText("My Stable Name").should("be.visible");
        cy.findByText(/Test Measure/).should("not.exist");
      });
    });

    it("should not change expression pill color when renaming", () => {
      addMetricInputSequence([
        { nameOrPath: "Count of orders" },
        "+",
        { nameOrPath: testMeasurePath },
      ]);

      cy.log("Capture the expression pill color before renaming");
      const expressionPillIndex = 1;
      getPillColors(expressionPillIndex).then((colorsBefore) => {
        cy.log("Set a custom name on the expression pill");
        H.MetricsViewer.searchBarPills().should("have.length", 2);
        openExpressionRename(1);
        cy.findByTestId("expression-name-input")
          .clear()
          .type("Renamed Expression{enter}", { waitForAnimations: true });

        H.MetricsViewer.searchBarPills()
          .should("have.length", 2)
          .eq(1)
          .should("contain.text", "Renamed Expression");

        cy.log("Verify the pill color has not changed after renaming");
        getPillColors(expressionPillIndex).then((colorsAfter) => {
          expect(colorsAfter).to.deep.equal(colorsBefore);
        });
      });
    });

    it("should preserve custom name when the expression is edited in place but keeps at least one original metric", () => {
      addMetricInputSequence([
        { nameOrPath: "Count of orders" },
        "+",
        { nameOrPath: testMeasurePath },
      ]);

      cy.log("Set a custom name on the expression pill");
      H.MetricsViewer.searchBarPills().should("have.length", 2);
      openExpressionRename(1);
      cy.findByTestId("expression-name-input")
        .clear()
        .type("Preserved Name{enter}");

      H.MetricsViewer.searchBarPills()
        .should("have.length", 2)
        .eq(1)
        .should("contain.text", "Preserved Name");

      cy.log(
        "Edit in place: delete '+ Test Measure' from the end of the expression " +
          "while keeping the 'Count of orders' token intact, then append a new operand. " +
          "The surviving identity carries the custom name.",
      );
      cy.findByTestId("metrics-formula-input").click();
      // One {backspace} deletes the atomic "Test Measure" token, then three
      // delete " + " char-by-char. The first metric token in the expression
      // ("Count of orders") is untouched and its MetricIdentity (with
      // customName) survives.
      H.MetricsViewer.searchInput().type(
        "{end}{backspace}{backspace}{backspace}{backspace}",
        { waitForAnimations: true },
      );
      addMetricInputSequence(["*", { nameOrPath: "Count of products" }]);

      cy.log(
        "The expression now reads 'Count of orders * Count of products' " +
          "and keeps the user-assigned name because one identity survived.",
      );
      H.MetricsViewer.searchBarPills()
        .should("have.length", 2)
        .eq(1)
        .should("contain.text", "Preserved Name");
    });

    it("should keep each expression's own name when an earlier expression is removed", () => {
      // Regression: names used to shift up by ordinal position, so deleting
      // the first expression made the second one inherit "First Name".
      // Now names are bound to identities — the surviving expression keeps
      // its own "Second Name".
      cy.log("Build two separately-named expressions");
      addMetricInputSequence(
        [
          { nameOrPath: "Count of orders" },
          "+",
          { nameOrPath: testMeasurePath },
        ],
        { clearInput: true },
      );

      H.MetricsViewer.searchBarPills().should("have.length", 1);
      openExpressionRename(0);
      cy.findByTestId("expression-name-input")
        .clear()
        .type("First Name{enter}");
      H.MetricsViewer.searchBarPills()
        .eq(0)
        .should("contain.text", "First Name");

      addMetricInputSequence([
        ",",
        { nameOrPath: "Count of orders" },
        "+",
        { nameOrPath: testMeasurePath },
      ]);

      H.MetricsViewer.searchBarPills().should("have.length", 2);
      openExpressionRename(1);
      cy.findByTestId("expression-name-input")
        .clear()
        .type("Second Name{enter}");
      H.MetricsViewer.searchBarPills()
        .eq(0)
        .should("contain.text", "First Name");
      H.MetricsViewer.searchBarPills()
        .eq(1)
        .should("contain.text", "Second Name");

      cy.log(
        "Delete the first expression in place (atomic-range-aware {del} " +
          "sequence). The second expression's identities — and therefore " +
          "its custom name — are preserved by CodeMirror's range tracking.",
      );
      cy.findByTestId("metrics-formula-input").click();
      // text: "Count of orders + Test Measure, Count of orders + Test Measure"
      // cursor at {home} = 0. Seven forward-deletes remove, in order:
      // "Count of orders" (atomic), " ", "+", " ", "Test Measure" (atomic),
      // ",", " ". What remains is exactly the second expression.
      H.MetricsViewer.searchInput().type(
        "{home}{del}{del}{del}{del}{del}{del}{del}",
        { waitForAnimations: true },
      );
      runFormula();

      cy.log(
        "The surviving expression must keep its own 'Second Name' and " +
          "must NOT inherit 'First Name' from the removed expression.",
      );
      H.MetricsViewer.searchBarPills()
        .should("have.length", 1)
        .eq(0)
        .should("contain.text", "Second Name")
        .should("not.contain.text", "First Name");
    });
  });

  describe("Dimension picker sidebar", () => {
    describe("Regular metric pills", () => {
      beforeEach(() => {
        H.MetricsViewer.goToViewer();
        addMetric("Count of orders");
        H.MetricsViewer.getMetricVisualization().should("be.visible");
      });

      it("should show all curated dimensions for a standalone metric", () => {
        H.MetricsViewer.getMetricVisualization().should("be.visible");
        H.MetricsViewer.getColumnPickerButton()
          .should("contain.text", "Created At")
          .and("not.contain.text", "Time");

        H.MetricsViewer.openDimensionPickerSidebar().within(() => {
          cy.findByRole("heading", { name: "Break out" }).should("be.visible");
          cy.findByLabelText("Search fields").should("be.visible");
          cy.findByText("Dimensions").should("be.visible");
          cy.findByRole("button", { name: "See all" }).should("not.exist");
          cy.findByRole("button", { name: "Created At" }).should("be.visible");
          cy.findByRole("button", { name: "Category" }).should("be.visible");
          cy.findByRole("button", { name: "Source" })
            .scrollIntoView()
            .should("be.visible");
          cy.findByRole("button", { name: "No breakout" }).should("be.visible");
          cy.findByRole("button", { name: "Totals" }).should("not.exist");
        });

        H.MetricsViewer.closeDimensionPickerSidebar();
        H.MetricsViewer.dimensionPickerSidebar().should("not.exist");
        H.MetricsViewer.getMetricVisualization().should("be.visible");
      });

      it("should select and reopen the No breakout state from the viewer controls", () => {
        H.MetricsViewer.openDimensionPickerSidebar().within(() => {
          cy.findByRole("button", { name: "No breakout" })
            .should("be.visible")
            .and("have.attr", "aria-pressed", "false")
            .click();
        });
        cy.wait("@dataset");

        H.MetricsViewer.dimensionPickerSidebar().within(() => {
          cy.findByRole("button", { name: "No breakout" }).should(
            "have.attr",
            "aria-pressed",
            "true",
          );
        });
        H.MetricsViewer.assertVizType("Number");
        H.MetricsViewer.breakoutLegend().should("not.exist");

        H.MetricsViewer.closeDimensionPickerSidebar();
        H.MetricsViewer.dimensionPickerSidebar().should("not.exist");

        H.MetricsViewer.getMetricControls()
          .findByRole("button", { name: "No breakout" })
          .should("be.visible")
          .click();

        H.MetricsViewer.dimensionPickerSidebar().within(() => {
          cy.findByRole("heading", { name: "Break out" }).should("be.visible");
          cy.findByRole("button", { name: "No breakout" }).should(
            "have.attr",
            "aria-pressed",
            "true",
          );
        });
      });

      it("should select dimension categories from the sidebar", () => {
        addMetricInputSequence([
          { nameOrPath: "Count of orders" },
          "+",
          { nameOrPath: testMeasurePath },
        ]);

        H.MetricsViewer.assertVizType("Line");

        selectDimensionBreakout("State", { seeAll: true });
        H.expectUnstructuredSnowplowEvent({
          event: "metrics_viewer_dimension_selected",
        });
        H.MetricsViewer.assertAllVizTypes("Map", 2);

        selectDimensionBreakout("Category");
        H.MetricsViewer.assertVizType("Bar");

        cy.log("should allow changing display types");
        H.MetricsViewer.changeVizType("line");
        H.MetricsViewer.assertVizType("Line");
      });

      it("should replace the selected curated dimension", () => {
        H.MetricsViewer.openDimensionPickerSidebar().within(() => {
          cy.findByRole("button", { name: "Category" }).should("be.visible");
          cy.findByRole("button", { name: "Source" }).should("be.visible");
          cy.findByRole("button", { name: "Category" }).click();
        });
        cy.wait("@dataset");

        H.MetricsViewer.dimensionPickerSidebar().within(() => {
          cy.findByRole("button", { name: "Category" })
            .scrollIntoView()
            .should("be.visible")
            .and("have.attr", "aria-pressed", "true");
          cy.findByRole("button", { name: "Source" })
            .scrollIntoView()
            .should("be.visible")
            .and("have.attr", "aria-pressed", "false");
          cy.findByRole("button", { name: "Source" }).click();
        });
        cy.wait("@dataset");
        H.MetricsViewer.getColumnPickerButton()
          .should("contain.text", "Source")
          .and("not.contain.text", "Category");

        H.MetricsViewer.dimensionPickerSidebar().within(() => {
          cy.findByRole("button", { name: "Category" })
            .scrollIntoView()
            .should("be.visible")
            .and("have.attr", "aria-pressed", "false");
          cy.findByRole("button", { name: "Source" })
            .scrollIntoView()
            .should("be.visible")
            .and("have.attr", "aria-pressed", "true");
        });
      });

      it("should only show shared dimensions by default for multiple metric sources", () => {
        addMetric(["Our analytics", "Count of feedback"]);
        verifyMetricCount(2);

        H.MetricsViewer.openDimensionPickerSidebar()
          .should("contain.text", "Shared dimensions")
          .and("contain.text", "Time")
          .and("not.contain.text", "Rating");

        H.MetricsViewer.dimensionPickerSidebar()
          .findByRole("button", { name: "See all" })
          .click();

        H.MetricsViewer.dimensionPickerSidebar().within(() => {
          cy.findByRole("heading", { name: "All fields" }).should("be.visible");
          cy.log("unshared fields live in the collapsed per-metric accordion");
          cy.findByRole("button", { name: "Count of feedback" }).click();
          cy.findAllByRole("button", { name: "Rating" }).should(
            "have.length.at.least",
            1,
          );
        });
      });

      it("should configure per-metric dimensions for a shared category", () => {
        addMetric("Count of products");

        H.MetricsViewer.openDimensionPickerSidebar()
          .findByRole("button", { name: "Time" })
          .realHover();

        H.MetricsViewer.dimensionPickerSidebar()
          .findByRole("button", { name: "Configure Time" })
          .click();

        H.MetricsViewer.dimensionPickerSidebar()
          .findByLabelText("Select dimension for Count of orders")
          .click();
        cy.findByRole("option", { name: /Birth Date/ }).click();
        cy.wait("@dataset");

        H.MetricsViewer.dimensionPickerSidebar()
          .findByLabelText("Select dimension for Count of orders")
          .should("have.value", "Birth Date");
        H.MetricsViewer.dimensionPickerSidebar()
          .findByLabelText("Select dimension for Count of products")
          .should("have.value", "Created At");
      });

      it("should render column labels as static text", () => {
        H.MetricsViewer.getMetricControls()
          .findByLabelText("Column label options")
          .click();
        cy.findByRole("switch", { name: "Show column labels" }).click();

        H.MetricsViewer.getDimensionPillBarContainer().within(() => {
          cy.findByText("Created At").should("be.visible").click();
          cy.findByRole("button").should("not.exist");
        });
        H.MetricsViewer.dimensionPickerSidebar().should("not.exist");
      });

      it("should auto-assign dimensions for a newly added metric after running the formula", () => {
        cy.log(
          "After adding a second metric, all dimension labels should have a selected dimension",
        );

        addMetric("Count of products");

        H.MetricsViewer.getColumnPickerButton().should(
          "not.contain.text",
          "Select a dimension",
        );

        selectDimensionBreakout("Category");
        H.MetricsViewer.getColumnPickerButton().should(
          "not.contain.text",
          "Select a dimension",
        );
      });

      it("should preserve a selected dimension after page reload", () => {
        addMetricInputSequence([
          { nameOrPath: "Count of orders" },
          "+",
          { nameOrPath: "Count of products" },
        ]);

        selectDimensionBreakout("Category");
        H.MetricsViewer.getColumnPickerButton().should(
          "contain.text",
          "Category",
        );

        cy.reload();
        cy.wait("@dataset");
        H.MetricsViewer.getColumnPickerButton().should(
          "contain.text",
          "Category",
        );
      });

      it("should serialize only the selected dimension breakout in the URL", () => {
        selectDimensionBreakout("State");
        selectDimensionBreakout("Category");

        getMetricsViewerUrlState().then((state) => {
          expect(state.t).to.have.length(1);
          const [breakout] = state.t ?? [];
          if (!breakout) {
            throw new Error("Expected one serialized dimension breakout");
          }
          expect(breakout).to.include({ t: "category", l: "Category" });
          expect(state.a).to.equal(breakout.i);
        });

        cy.reload();
        cy.wait("@dataset");
        H.MetricsViewer.getColumnPickerButton().should(
          "contain.text",
          "Category",
        );
      });
    });

    describe("Expression pills", () => {
      it("should show an expression dimension pill with per-metric accordion", () => {
        H.MetricsViewer.goToViewer();
        cy.log("Create expression: Count of orders + Count of products");
        addOrdersProductsExpression();

        cy.log(
          "Dimension pill bar should contain a selected expression dimension label",
        );
        showColumnLabels();
        H.MetricsViewer.getDimensionPillBarContainer()
          .should("be.visible")
          .and("not.contain.text", "Select dimensions");

        cy.log("Open the sidebar dimension picker");
        H.MetricsViewer.openDimensionPickerSidebar();

        cy.log(
          "All fields should show accordion sections for each metric in the expression",
        );
        H.MetricsViewer.dimensionPickerSidebar().within(() => {
          cy.findByRole("button", { name: "See all" }).click();
          cy.findByRole("heading", { name: "All fields" }).should("be.visible");
          cy.findByRole("button", { name: "Count of orders" })
            .should("be.visible")
            .and("have.attr", "aria-expanded", "true");
          cy.findByRole("button", { name: "Count of products" })
            .scrollIntoView()
            .should("be.visible")
            .and("have.attr", "aria-expanded", "false")
            .click();
          cy.findAllByRole("button", { name: "Category" }).should(
            "have.length.at.least",
            1,
          );
        });

        cy.log(
          "Configure the shared Time category and select a non-default dimension",
        );
        H.MetricsViewer.dimensionPickerSidebar()
          .findByRole("button", { name: "Back" })
          .click();
        openTimeDimensionConfiguration();
        H.MetricsViewer.dimensionPickerSidebar()
          .findByLabelText("Select dimension for Count of orders")
          .click();
        cy.findByRole("option", { name: /Birth Date/ }).click();

        cy.wait("@dataset");

        cy.log(
          "Expression dimension pill should now show 'Multiple dimensions'",
        );
        H.MetricsViewer.getDimensionPillBarContainer().should(
          "contain.text",
          "Multiple dimensions",
        );
      });

      it("should preserve non-default expression dimensions after page reload", () => {
        H.MetricsViewer.goToViewer();
        cy.log(
          "Create expression with only expression entity: Count of orders + Count of products",
        );
        addOrdersProductsExpression();
        showColumnLabels();

        cy.log("Pick a non-default dimension for one metric in the expression");
        H.MetricsViewer.openDimensionPickerSidebar();
        openTimeDimensionConfiguration();
        H.MetricsViewer.dimensionPickerSidebar()
          .findByLabelText("Select dimension for Count of orders")
          .click();
        cy.findByRole("option", { name: /Birth Date/ }).click();

        cy.wait("@dataset");

        cy.log(
          "Verify the pill shows 'Multiple dimensions' (non-default state)",
        );
        H.MetricsViewer.getDimensionPillBarContainer().should(
          "contain.text",
          "Multiple dimensions",
        );
        waitForSerializedDimensionBreakout();

        cy.log("Reload the page and verify the dimension choice persists");
        cy.reload();
        cy.wait("@getMetric");
        cy.wait("@dataset");

        cy.log(
          "Verify the per-metric dimension selections are restored after reload",
        );
        H.MetricsViewer.openDimensionPickerSidebar();
        openTimeDimensionConfiguration();
        H.MetricsViewer.dimensionPickerSidebar().within(() => {
          cy.findByLabelText("Select dimension for Count of orders").should(
            "have.value",
            "Birth Date",
          );
          cy.findByLabelText("Select dimension for Count of products").should(
            "have.value",
            "Created At",
          );
        });
      });
    });
  });

  describe("Automatic split view", () => {
    beforeEach(() => {
      H.MetricsViewer.goToViewer();
      addMetric("Count of orders");
    });

    it("should show unified view for display types that support multiple series", () => {
      addMetric("Count of products");

      cy.log("line charts support multiple series, so should be unified");
      H.MetricsViewer.assertVizType("Line");
      H.MetricsViewer.getAllMetricVisualizations().should("have.length", 1);

      cy.log("bar charts also support multiple series");
      selectDimensionBreakout("Category");
      H.MetricsViewer.assertVizType("Bar");
      H.MetricsViewer.getAllMetricVisualizations().should("have.length", 1);
    });

    it("should stack series into panels when the stack series button is toggled", () => {
      addMetric("Count of products");

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
      selectDimensionBreakout("State", { seeAll: true });
      H.MetricsViewer.assertVizType("Map");
      cy.findByTestId("chart-layout-picker").should("not.exist");
    });

    it("should automatically split for display types that do not support multiple series", () => {
      cy.log("with a single series, map shows one visualization");
      selectDimensionBreakout("State");
      H.MetricsViewer.assertVizType("Map");
      H.MetricsViewer.getAllMetricVisualizations().should("have.length", 1);

      cy.log("add a breakout to create multiple series");
      selectDimensionBreakout("Created At", { waitForDataset: false });
      selectBreakout("Count of orders", "Source");

      cy.log("line supports multiple series, so should remain unified");
      H.MetricsViewer.getAllMetricVisualizations().should("have.length", 1);

      cy.log("map does not support multiple series, so should auto-split");
      selectDimensionBreakout("State");
      H.MetricsViewer.getAllMetricVisualizations().should(
        "have.length.greaterThan",
        1,
      );
    });
  });

  describe("Filters", () => {
    beforeEach(() => {
      H.MetricsViewer.goToViewer();
      addMetric("Count of orders");
    });

    it("should apply a categorical filter to a metric (UXW-4849)", () => {
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
        .should("contain.text", "Category is:")
        .should("not.contain.text", "Product")
        .should("not.contain.text", "→");

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

      selectDimensionBreakout("Category");
      H.MetricsViewer.getMetricVisualization().should(
        "contain.text",
        "Doohickey",
      );
      H.MetricsViewer.getMetricVisualization().should("contain.text", "Gizmo");

      cy.log("filter on a per tab level");

      H.MetricsViewer.getMetricControls()
        .findByRole("button", { name: /All values/ })
        .click();

      H.popover().findByText("Doohickey").click();

      H.popover().findByRole("button", { name: "Add filter" }).click();
      H.MetricsViewer.getMetricControls().findByRole("button", {
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
      selectDimensionBreakout("State");
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

      cy.log("navigate back to the category dimension");
      cy.go("back");
      H.MetricsViewer.getColumnPickerButton().should(
        "contain.text",
        "Category",
      );

      cy.log("remove the dimension filter");
      cy.go("back");
      H.MetricsViewer.getMetricVisualization().should(
        "contain.text",
        "Doohickey",
      );
      H.MetricsViewer.getMetricVisualization().should("contain.text", "Gizmo");
      H.MetricsViewer.getMetricControls()
        .findByRole("button", { name: /All values/ })
        .should("be.visible");

      cy.log("navigating forward should re-apply changes");
      cy.log("re-apply the dimension filter");
      cy.go("forward");

      H.MetricsViewer.getMetricControls()
        .findByRole("button", { name: /is Doohickey/ })
        .should("be.visible");
      H.MetricsViewer.getMetricVisualization().should(
        "contain.text",
        "Doohickey",
      );
      H.MetricsViewer.getMetricVisualization().should(
        "not.contain.text",
        "Gizmo",
      );
      cy.log("change dimension back to State");
      cy.go("forward");
      H.MetricsViewer.getColumnPickerButton().should("contain.text", "State");
      H.MetricsViewer.getAllMetricVisualizations().should("have.length", 3);
      cy.log("remove global filter");
      cy.go("forward");
      H.MetricsViewer.getAllMetricVisualizations().should("have.length", 4);
      H.MetricsViewer.getAllFilterPills().should("have.length", 0);
    });

    it("should allow me to apply filters to each metric individually (UXW-4849)", () => {
      addMetric("Count of products");
      selectDimensionBreakout("Category");
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

    it("should preserve breakout colors when a dimension filter hides some values", () => {
      selectBreakout("Count of orders", "Quantity");

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

      H.MetricsViewer.getMetricControls()
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
            H.echartsContainer()
              .find(`path[stroke="${hex}"]`)
              .should("be.visible");
          }

          cy.log("Search pill color indicator should match legend count");
          H.MetricsViewer.searchBarPills()
            .contains("[data-testid=metrics-viewer-pill]", "Count of orders")
            .findByTestId("color-indicator-container")
            .children()
            .should("have.length", legendHexColors.length);
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
          "source-table": ORDERS_ID,
          filter: [">", ["field", ORDERS.TOTAL, null], 100],
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
      addMetricInputSequence([
        ",",
        { nameOrPath: "Count of orders" },
        "+",
        { nameOrPath: testMeasurePath },
      ]);
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
      H.ensureChartIsActive();
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
      addMetricInputSequence([
        { nameOrPath: "Count of orders" },
        "+",
        { nameOrPath: "Count of products" },
      ]);
      H.MetricsViewer.getMetricVisualization().should("be.visible");

      cy.log(
        "Re-enter the formula editor, delete the whole expression, retype with metrics in the opposite order",
      );
      addMetricInputSequence(
        [
          { nameOrPath: "Count of products" },
          "+",
          { nameOrPath: "Count of orders" },
        ],
        { clearInput: true },
      );

      cy.log("Expression should run without 'No compatible dimensions' error");
      H.MetricsViewer.getMetricVisualization().should("be.visible");
    });
  });

  describe("Responsive viewer controls", () => {
    const setupTimeControls = (width: number) => {
      cy.viewport(1280, 900);
      interceptDatasetQuery();
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
      interceptDatasetQuery();
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

        cy.log("dimension filter is applied");
        H.MetricsViewer.getMetricVisualizationDataPoints().should(
          "have.length.of.at.most",
          60,
        );
        cy.log("metric math expression still renders with the applied state");
        H.MetricsViewer.getMetricVisualization().should("be.visible");
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

      cy.log("Sum metric '123' with itself — both selected from dropdown");
      addMetricInputSequence(
        [
          { nameOrPath: ["Our analytics", NUMERIC_METRIC_NAME] },
          "+",
          { nameOrPath: ["Our analytics", NUMERIC_METRIC_NAME] },
        ],
        { clearInput: true },
      );
      H.MetricsViewer.getMetricVisualization().should("be.visible");

      cy.log(
        "Append literal number 123 — typed without selecting from dropdown",
      );
      addMetricInputSequence([
        "+",
        { nameOrPath: ["Our analytics", NUMERIC_METRIC_NAME] },
      ]);

      H.MetricsViewer.getMetricVisualization().should("be.visible");

      cy.log("Append metric '123' as standalone — selected from dropdown");
      addMetricInputSequence([
        ",",
        { nameOrPath: ["Our analytics", NUMERIC_METRIC_NAME] },
      ]);
      H.MetricsViewer.getAllMetricVisualizations().should("have.length", 2);

      cy.log("Verify final pill layout");
      H.MetricsViewer.searchBarPills().should("have.length", 2);
      H.MetricsViewer.searchBarPills().eq(0).should("contain", "123 + 123");
      H.MetricsViewer.searchBarPills().eq(1).should("contain", "123");
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

  const PEOPLE_SCALAR_METRIC: StructuredQuestionDetailsWithName = {
    name: "Count of people",
    type: "metric",
    description: "A metric",
    query: {
      "source-table": PEOPLE_ID,
      aggregation: [["count"]],
    },
    display: "scalar",
  };

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
      "People with renamed source",
      PEOPLE_SCALAR_METRIC,
      (metricId) => renameCuratedDimension(metricId, "Source", "Category"),
    );
    createFixtureMetric("Accounts by country", ACCOUNTS_SCALAR_METRIC);
    createFixtureMetric("People by state", PEOPLE_SCALAR_METRIC);
    createFixtureMetric(
      "Orders with user state",
      ORDERS_SCALAR_METRIC,
      (metricId) => addConnectionDimension(metricId, "User", "State"),
    );
    createFixtureMetric(
      "Orders with user source",
      ORDERS_SCALAR_METRIC,
      (metricId) =>
        addConnectionDimension(metricId, "User", "Source", "Category"),
    );
    createFixtureMetric("Plain orders", ORDERS_SCALAR_METRIC);
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

    it("does not share same-named dimensions from different source columns", () => {
      visitViewerWithMetrics(["People with renamed source", "Plain products"]);

      H.MetricsViewer.openDimensionPickerSidebar().within(() => {
        cy.findByRole("button", { name: "Time" }).should("be.visible");
        cy.log(
          "People's renamed Source and Products' Category share a name but not a source column",
        );
        cy.findByRole("button", { name: "Category" }).should("not.exist");
      });
    });

    it("does not mix country and state geo dimensions", () => {
      visitViewerWithMetrics(["Accounts by country", "People by state"]);

      H.MetricsViewer.openDimensionPickerSidebar().within(() => {
        cy.findByRole("button", { name: "Time" }).should("be.visible");
        cy.findByRole("button", { name: "Country" }).should("not.exist");
        cy.findByRole("button", { name: "State" }).should("not.exist");
      });
    });

    it("offers a State option when every metric has a state dimension", () => {
      visitViewerWithMetrics(["People by state", "Orders with user state"]);

      selectDimensionBreakout("State");

      H.MetricsViewer.assertAllVizTypes("Map", 2);
      assertSerializedDimensionBreakout((dimensionBreakout) => {
        expect(dimensionBreakout.t).to.equal("geo");
        expect(dimensionBreakout.D).to.have.length(2);
      });
    });

    it("re-maps other metrics by dimension name when switching breakout type from All fields", () => {
      visitViewerWithMetrics(["Orders with user source", "Plain products"]);

      getCuratedDimensionId(
        metricIds["Orders with user source"],
        "Category",
      ).as("ordersCategoryId");
      getCuratedDimensionId(metricIds["Plain products"], "Category").as(
        "productsCategoryId",
      );
      getCuratedDimensionId(metricIds["Plain products"], "Vendor").as(
        "productsVendorId",
      );

      cy.log("switch from the default Time breakout to a category dimension");
      H.MetricsViewer.openDimensionPickerSidebar();
      H.MetricsViewer.dimensionPickerSidebar()
        .findByRole("button", { name: "See all" })
        .click();
      H.MetricsViewer.dimensionPickerSidebar()
        .findByRole("button", { name: "Category" })
        .click();
      cy.wait(["@dataset", "@dataset"]);

      cy.log(
        "Products maps to its own Category by name, even though Title comes first in its curated list",
      );
      cy.then(function () {
        assertSerializedDimensionBreakout((dimensionBreakout) => {
          expect(dimensionBreakout.t).to.equal("category");
          expect(
            dimensionBreakout.D?.find((entry) => entry.i === 0)?.d,
          ).to.equal(this.ordersCategoryId);
          expect(
            dimensionBreakout.D?.find((entry) => entry.i === 1)?.d,
          ).to.equal(this.productsCategoryId);
        });
      });

      cy.log("a same-type pick under one metric changes only that metric");
      H.MetricsViewer.dimensionPickerSidebar()
        .findByRole("button", { name: "Plain products" })
        .click();
      H.MetricsViewer.dimensionPickerSidebar()
        .findByRole("button", { name: "Vendor" })
        .click();
      cy.wait("@dataset");

      cy.then(function () {
        assertSerializedDimensionBreakout((dimensionBreakout) => {
          expect(
            dimensionBreakout.D?.find((entry) => entry.i === 0)?.d,
          ).to.equal(this.ordersCategoryId);
          expect(
            dimensionBreakout.D?.find((entry) => entry.i === 1)?.d,
          ).to.equal(this.productsVendorId);
        });
      });
    });

    it("disables metrics without a dimension of the picked type", () => {
      visitViewerWithMetrics(["Plain orders", "Plain products"]);

      H.MetricsViewer.openDimensionPickerSidebar();
      H.MetricsViewer.dimensionPickerSidebar()
        .findByRole("button", { name: "See all" })
        .click();
      H.MetricsViewer.dimensionPickerSidebar()
        .findByRole("button", { name: "Plain products" })
        .click();
      H.MetricsViewer.dimensionPickerSidebar()
        .findByRole("button", { name: "Category" })
        .click();
      cy.wait("@dataset");

      cy.log("Orders has no category dimensions, so it is excluded");
      assertSerializedDimensionBreakout((dimensionBreakout) => {
        expect(dimensionBreakout.t).to.equal("category");
        expect(dimensionBreakout.D?.find((entry) => entry.i === 0)?.d).to.be
          .undefined;
        expect(dimensionBreakout.D?.find((entry) => entry.i === 1)?.d).to.not.be
          .undefined;
      });
      verifyMetricCount(2);
      H.echartsContainer().should("be.visible");
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

type CuratedDimension = {
  id: string;
  display_name: string;
};

type CuratedDimensionsResponse = {
  added: CuratedDimension[];
  addable: Array<{
    group: { display_name: string; type: string };
    dimensions: CuratedDimension[];
  }>;
};

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
    .request<CuratedDimensionsResponse>(
      "GET",
      `/api/metric/${metricId}/dimension?with_addable=true`,
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

function renameCuratedDimension(
  metricId: number,
  dimensionName: string,
  displayName: string,
) {
  return cy
    .request<CuratedDimensionsResponse>(
      "GET",
      `/api/metric/${metricId}/dimension`,
    )
    .then(({ body }) => {
      const dimension = body.added.find(
        (addedDimension) => addedDimension.display_name === dimensionName,
      );
      expect(dimension, `curated dimension ${dimensionName}`).to.exist;
      cy.request("POST", `/api/metric/${metricId}/dimension/${dimension?.id}`, {
        display_name: displayName,
      });
    });
}

function getCuratedDimensionId(metricId: number, dimensionName: string) {
  return cy
    .request<CuratedDimensionsResponse>(
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
  }).then(({ body }) => {
    cy.wrap(body.id).as("measureId");
  });
}
