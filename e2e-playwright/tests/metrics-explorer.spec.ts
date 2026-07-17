/**
 * Playwright port of e2e/test/scenarios/metrics/metrics-explorer.cy.spec.ts
 *
 * - Snowplow helpers are no-op stubs (no snowplow-micro container in the
 *   spike harness); the UI flows in those tests are ported for real.
 * - The Cypress before() builds a seeded snapshot once per spec run; here
 *   the snapshot is built once per worker (module-level flag — each worker
 *   owns its backend) and restored in beforeEach, same as upstream.
 * - Never-awaited intercepts dropped: @search, @getMeasure, @breakoutValues.
 * - The BigInt describe needs the writable postgres QA container and the
 *   postgres-writable snapshot → gated on QA_DB_ENABLED per the playbook.
 */
import type { Locator, Page } from "@playwright/test";

import type { MetabaseApi } from "../support/api";
import { echartsContainer } from "../support/charts";
import { pickEntity } from "../support/dashboard";
import { createSegment } from "../support/filter-bulk";
import { test, expect } from "../support/fixtures";
import { miniPickerBrowseAll } from "../support/joins";
import { cartesianChartCircles } from "../support/metrics";
import {
  MetricsViewer,
  applyBrush,
  createMeasure,
  createMetric,
  echartsTooltip,
  ensureChartIsActive,
  getPillColors,
  readLegendEntries,
  resetDecimalPkTable,
  splitPanelAxisLines,
  waitForGetMetric,
  waitForMetricDataset,
  type MetricDetails,
} from "../support/metrics-explorer";
import { entityPickerModal, miniPicker } from "../support/notebook";
import { signInWithCachedSession } from "../support/permissions";
import { entityPickerModalItem } from "../support/question-new";
import { FIRST_COLLECTION_ID, SAMPLE_DATABASE, SAMPLE_DB_ID } from "../support/sample-data";
import { ORDERS_MODEL_ID } from "../support/organization";
import { WRITABLE_DB_ID, getTableId, resyncDatabase } from "../support/schema-viewer";
import { popover } from "../support/ui";

const { ORDERS_ID, ORDERS, PRODUCTS_ID, PRODUCTS, ACCOUNTS_ID, FEEDBACK_ID } =
  SAMPLE_DATABASE;

// TODO: no snowplow-micro container in the spike harness.
const resetSnowplow = async () => {};
const enableTracking = async () => {};
const expectNoBadSnowplowEvents = async () => {};
const expectUnstructuredSnowplowEvent = async (_event: unknown) => {};

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

const ORDERS_SCALAR_METRIC: MetricDetails = {
  name: "Count of orders",
  type: "metric",
  description: "A metric",
  query: {
    "source-table": ORDERS_ID,
    aggregation: [["count"]],
  },
  display: "scalar",
};

const ACCOUNTS_SCALAR_METRIC: MetricDetails = {
  name: "Count of accounts",
  type: "metric",
  description: "A metric",
  query: {
    "source-table": ACCOUNTS_ID,
    aggregation: [["count"]],
  },
  display: "scalar",
};

const FEEDBACK_SCALAR_METRIC: MetricDetails = {
  name: "Count of feedback",
  type: "metric",
  description: "A metric",
  query: {
    "source-table": FEEDBACK_ID,
    aggregation: [["count"]],
  },
  display: "scalar",
};

const ORDERS_SCALAR_MODEL_METRIC: MetricDetails = {
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

const ORDERS_TIMESERIES_METRIC: MetricDetails = {
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

const PRODUCTS_SCALAR_METRIC: MetricDetails = {
  name: "Count of products",
  type: "metric",
  description: "A metric",
  query: {
    "source-table": PRODUCTS_ID,
    aggregation: [["count"]],
  },
  display: "scalar",
};

const NON_NUMERIC_METRIC: MetricDetails = {
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

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** cy.contains(str): case-sensitive substring. */
function containsText(value: string): RegExp {
  return new RegExp(escapeRegExp(value));
}

const pillColorIndicators = (pill: Locator): Locator =>
  pill.locator("[data-testid='color-indicator-container'] > *");

async function selectEntityPickerItem(page: Page, path: string | string[]) {
  if (typeof path === "string") {
    // Escape special regex characters and match exact text. The menuitem's
    // full text also carries the collection path ("Count of products …
    // Our analytics"), so match the inner name element — same target as the
    // upstream findAllByRole("menuitem").contains(regex).
    await miniPicker(page)
      .getByRole("menuitem")
      .getByText(new RegExp(`^${escapeRegExp(path)}$`))
      .first()
      .click();
  } else {
    await miniPickerBrowseAll(page).click();
    await pickEntity(page, { path });
  }
}

async function addMetricInputSequence(
  page: Page,
  sequence: InputToken[],
  {
    runExpression = true,
    clearInput = false,
    skipRunCompletionWait = false,
  } = {},
) {
  const input = await MetricsViewer.searchInput(page);
  if (clearInput) {
    // cy.clear() on the CodeMirror content: select-all + delete.
    await page.keyboard.press("ControlOrMeta+A");
    await page.keyboard.press("Backspace");
  } else {
    const currentText = ((await input.textContent()) ?? "").trim();
    if (
      currentText !== INPUT_PLACEHOLDER_TEXT &&
      currentText !== "" &&
      typeof sequence[0] !== "string"
    ) {
      await page.keyboard.press("End");
      await page.keyboard.type(", ");
    }
  }

  for (const item of sequence) {
    if (typeof item !== "object") {
      await MetricsViewer.searchInput(page);
      await page.keyboard.press("End");
      await page.keyboard.type(item, { delay: 20 });
    } else {
      await selectEntityPickerItem(page, item.nameOrPath);
    }
  }

  if (runExpression) {
    await runFormula(page);
    if (!skipRunCompletionWait) {
      // It is expected that the elements below do not exist after the expression ran successfully
      await expect(
        page.getByTestId("metrics-viewer-search-input"),
      ).toHaveCount(0);
      await expect(page.getByTestId("run-expression-button")).toHaveCount(0);
      await expect(page.getByTestId("loading-indicator")).toHaveCount(0);
    }
  }
}

/**
 * Add a metric or measure to the explorer via the search panel
 */
async function addMetric(
  page: Page,
  nameOrPath: string | string[],
  {
    runExpression = true,
    clearInput = false,
    skipRunCompletionWait = false,
  } = {},
) {
  await addMetricInputSequence(page, [{ nameOrPath }], {
    runExpression,
    clearInput,
    skipRunCompletionWait,
  });
}

async function runFormula(page: Page) {
  // Make sure mini picker is closed before clicking Run
  await expect(MetricsViewer.runButton(page)).toBeVisible();
  if ((await miniPicker(page).count()) > 0) {
    await page.keyboard.press("Escape");
    await expect(miniPicker(page)).toHaveCount(0);
  }

  await expect(MetricsViewer.runButton(page)).toBeEnabled();
  await MetricsViewer.runButton(page).click();
}

async function runFormulaWithKeyboard(page: Page) {
  await expect(MetricsViewer.runButton(page)).toBeEnabled();
  await MetricsViewer.searchInput(page);
  await page.keyboard.press("Enter");
}

/**
 * Select a breakout dimension
 */
async function selectBreakout(
  page: Page,
  cardName: string,
  dimensionName: string,
  index = 0,
  binning?: string,
) {
  await MetricsViewer.searchBarPills(page)
    .filter({ hasText: containsText(cardName) })
    .first()
    .click();
  await popover(page).getByText("Add a series breakout", { exact: true }).click();
  const breakout = popover(page)
    .getByText(dimensionName, { exact: true })
    .nth(index)
    .locator("xpath=ancestor-or-self::*[@role='option'][1]");

  const dataset = waitForMetricDataset(page);
  if (binning) {
    await breakout.hover();
    await breakout.getByTestId("dimension-list-item-binning").click();
    await popover(page).getByRole("menuitem", { name: binning, exact: true }).click();
  } else {
    await breakout.click();
  }
  await dataset;
}

/**
 * Verify the grid displays the correct number of metric cards
 */
async function verifyMetricCount(page: Page, count: number) {
  await expect(MetricsViewer.searchBarPills(page)).toHaveCount(count);
}

/**
 * Open the rename flow on an expression pill by clicking it and then the
 * "Rename" menu item that appears in the action menu.
 */
async function openExpressionRename(page: Page, pillIndex: number) {
  const pill = MetricsViewer.searchBarPills(page).nth(pillIndex);
  await expect(pill).toBeVisible();
  await pill.click();

  await popover(page)
    .getByRole("menuitem", { name: "rename icon Rename", exact: true })
    .click();
}

/** Clear the (focused) expression-name input and type a new name + Enter. */
async function typeExpressionName(page: Page, name: string) {
  await page.getByTestId("expression-name-input").click();
  await page.keyboard.press("ControlOrMeta+A");
  await page.keyboard.press("Backspace");
  if (name) {
    await page.keyboard.type(name, { delay: 10 });
  }
  await page.keyboard.press("Enter");
}

/**
 * Select a dimension breakout from the sidebar and close it.
 */
async function selectDimensionBreakout(
  page: Page,
  dimensionName: string,
  { seeAll = false, waitForDataset = true } = {},
) {
  await MetricsViewer.openDimensionPickerSidebar(page);
  const sidebar = MetricsViewer.dimensionPickerSidebar(page);
  if (seeAll) {
    await sidebar.getByRole("button", { name: "See all", exact: true }).click();
  }
  const dataset = waitForDataset ? waitForMetricDataset(page) : null;
  await sidebar
    .getByRole("button", { name: dimensionName, exact: true })
    .click();
  await MetricsViewer.closeDimensionPickerSidebar(page);

  if (dataset) {
    await dataset;
  }
}

async function showColumnLabels(page: Page) {
  await MetricsViewer.getMetricControls(page)
    .getByLabel("Column label options", { exact: true })
    .click();
  await page
    .getByRole("switch", { name: "Show column labels", exact: true })
    .click({ force: true });
}

function decodeMetricsViewerUrlHash(
  hash: string,
): CompactMetricsViewerUrlState {
  const encodedHash = hash.replace(/^#/, "");
  const base64 = encodedHash.replace(/-/g, "+").replace(/_/g, "/");
  const paddedBase64 = base64.padEnd(Math.ceil(base64.length / 4) * 4, "=");

  return JSON.parse(
    Buffer.from(paddedBase64, "base64").toString("utf8"),
  ) as CompactMetricsViewerUrlState;
}

function getMetricsViewerUrlState(page: Page): CompactMetricsViewerUrlState {
  return decodeMetricsViewerUrlHash(new URL(page.url()).hash);
}

async function waitForSerializedDimensionBreakout(page: Page) {
  // Retried like the upstream cy.location("hash").should(...)
  await expect(() => {
    const state = getMetricsViewerUrlState(page);
    const [dimensionBreakout] = state.t ?? [];

    expect(state.t).toHaveLength(1);
    expect(state.a).toEqual(dimensionBreakout?.i);
    expect(dimensionBreakout?.D).toHaveLength(2);
  }).toPass();
}

async function addOrdersProductsExpression(page: Page) {
  await addMetricInputSequence(
    page,
    [
      { nameOrPath: "Count of orders" },
      "+",
      { nameOrPath: "Count of products" },
    ],
    { runExpression: false },
  );
  const dataset = waitForMetricDataset(page);
  await runFormulaWithKeyboard(page);
  await dataset;
}

async function assertMetricControlsDoNotOverflowViewport(page: Page) {
  const rect = await MetricsViewer.getMetricControls(page).boundingBox();
  const viewportWidth = page.viewportSize()?.width ?? 0;

  expect(rect).not.toBeNull();
  expect(Math.floor(rect!.x)).toBeGreaterThanOrEqual(0);
  expect(Math.ceil(rect!.x + rect!.width)).toBeLessThanOrEqual(viewportWidth);
}

async function openTimeDimensionConfiguration(page: Page) {
  await MetricsViewer.dimensionPickerSidebar(page)
    .getByRole("button", { name: "Time", exact: true })
    .hover();

  await MetricsViewer.dimensionPickerSidebar(page)
    .getByRole("button", { name: "Configure Time", exact: true })
    .click();
}

/**
 * Assert that every color in a pill's indicator appears somewhere on the
 * chart (as a `fill` or `stroke` attribute on an SVG `path`).
 */
async function assertPillColorsInChart(page: Page, pillIndex: number) {
  const colors = await getPillColors(page, pillIndex);
  for (const color of colors) {
    await expect(
      echartsContainer(page)
        .locator(`path[fill="${color}"], path[stroke="${color}"]`)
        .first(),
    ).toBeVisible();
  }
}

/**
 * Assert that the breakout legend dot colors match the pill colors for the
 * given pill index.
 */
async function assertLegendColorsMatchPill(page: Page, pillIndex: number) {
  const pillColors = await getPillColors(page, pillIndex);
  const legendColors = (await readLegendEntries(page)).map(
    (entry) => entry.color,
  );

  // Every pill color should appear in the legend
  for (const color of pillColors) {
    expect(legendColors).toContain(color);
  }
}

/** Clear a (date) textbox and type a new value with real keystrokes. */
async function replaceTextboxValue(
  scope: Locator,
  name: string,
  value: string,
) {
  const textbox = scope.getByRole("textbox", { name, exact: true });
  await textbox.click();
  await textbox.press("ControlOrMeta+A");
  await textbox.press("Backspace");
  await textbox.pressSequentially(value);
}

async function createMetrics(api: MetabaseApi, metrics: MetricDetails[]) {
  for (const metric of metrics) {
    await createMetric(api, metric);
  }
}

async function createTestMeasure(
  api: MetabaseApi,
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

  return createMeasure(api, {
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

/**
 * The mini-picker search is backed by the search index, which rebuilds
 * asynchronously after restore(); the harness readiness poll only covers
 * tables, so wait for the seeded metrics/measure to be searchable too.
 */
async function waitForSeededSearchIndex(api: MetabaseApi) {
  for (const query of [
    "q=Count%20of%20orders&models=metric",
    "q=Test%20Measure&models=measure",
  ]) {
    await expect
      .poll(
        async () => {
          const response = await api.get(`/api/search?${query}&limit=1`, {
            failOnStatusCode: false,
          });
          if (!response.ok()) {
            return 0;
          }
          const body = await response.json().catch(() => ({ data: [] }));
          return (body.data ?? []).length;
        },
        { timeout: 30_000 },
      )
      .toBeGreaterThan(0);
  }
}

const testMeasurePath = [
  "Databases",
  "Sample Database",
  "Orders",
  "Test Measure",
];

// The seeded snapshot is built once per worker (each worker owns its own
// backend under PW_PER_WORKER_BACKEND) — the port of the Cypress before().
let snapshotReady = false;

test.describe("scenarios > metrics > explorer", () => {
  test.beforeEach(async ({ mb }) => {
    if (!snapshotReady) {
      await mb.restore();
      await mb.signInAsAdmin();
      await createMetrics(mb.api, ALL_MODELS);
      await createTestMeasure(mb.api);
      await mb.api.snapshot(SNAPSHOT_NAME);
      snapshotReady = true;
    }

    await mb.restore(SNAPSHOT_NAME);
    await mb.signInAsAdmin();
    await waitForSeededSearchIndex(mb.api);

    await resetSnowplow();
    await enableTracking();
  });

  test.afterEach(async () => {
    await expectNoBadSnowplowEvents();
  });

  test.describe("Entry points", () => {
    test("should show empty state on first load", async ({ page }) => {
      await MetricsViewer.goToViewer(page);
      await expect(page).toHaveURL(/\/explore/);
      await expect(
        page.getByRole("heading", { name: "Start exploring", exact: true }),
      ).toBeVisible();

      await addMetric(page, "Count of products");

      await expect(echartsContainer(page)).toBeVisible();

      // should persist state in url
      await page.reload();
      await verifyMetricCount(page, 1);
    });

    test("should not show Edit in Data Studio for users without data studio access", async ({
      page,
      mb,
    }) => {
      await mb.signInAsNormalUser();
      await MetricsViewer.goToViewer(page);
      await addMetric(page, "Count of orders");

      await MetricsViewer.searchBarPills(page)
        .filter({ hasText: containsText("Count of orders") })
        .first()
        .click();
      await expect(popover(page)).not.toContainText("Edit in Data Studio");
    });

    test("should handle breakout with no results gracefully", async ({
      page,
      mb,
    }) => {
      await createMetrics(mb.api, [
        {
          name: "Empty Metric",
          display: "table",
          query: {
            "source-table": 1,
            aggregation: [["count"]],
            filter: ["=", ["field", 2, null], null],
          },
          type: "metric",
        },
      ]);
      await MetricsViewer.goToViewer(page);
      await addMetric(page, "Empty Metric");

      await expect(
        page.getByRole("heading", { name: "No results", exact: true }),
      ).toBeVisible();
    });
  });

  test.describe("Adding metrics and measures", () => {
    test("should add multiple metrics", async ({ page }) => {
      await MetricsViewer.goToViewer(page);

      await addMetric(page, "Count of products");

      await expectUnstructuredSnowplowEvent({
        event: "metrics_viewer_metric_added",
        event_detail: "metric",
      });

      await addMetric(page, "Count of orders");
      await verifyMetricCount(page, 2);

      // allows duplicates
      await addMetric(page, "Count of products");

      // Should allow me to add measures
      await addMetricInputSequence(page, [{ nameOrPath: testMeasurePath }]);
      await expectUnstructuredSnowplowEvent({
        event: "metrics_viewer_metric_added",
        event_detail: "measure",
      });

      // no results
      await MetricsViewer.searchInput(page);
      await page.keyboard.press("End");
      await page.keyboard.type("xyznonexistent", { delay: 20 });
      await expect(miniPicker(page)).toContainText("No search results");
    });

    test("should disable tables without measures when browsing database measures", async ({
      page,
    }) => {
      await MetricsViewer.goToViewer(page);

      await MetricsViewer.searchInput(page);
      await page.keyboard.type("Sample", { delay: 20 });
      await miniPickerBrowseAll(page).click();
      await expect(page.getByTestId("nested-item-picker")).toBeVisible();
      await pickEntity(page, { path: ["Databases", "Sample Database"] });

      await expect(entityPickerModalItem(page, 2, "People")).toHaveAttribute(
        "data-disabled",
        "true",
      );
      await expect(
        entityPickerModalItem(page, 2, "Orders"),
      ).not.toHaveAttribute("data-disabled");

      await entityPickerModal(page)
        .getByPlaceholder("Search…", { exact: true })
        .pressSequentially("Test");
      await expect(entityPickerModalItem(page, 1, "Test Measure")).toBeVisible();
    });

    test("should add multiple metrics one by one using metrics dropdown", async ({
      page,
    }) => {
      await MetricsViewer.goToViewer(page);
      await addMetricInputSequence(page, [
        { nameOrPath: "Count of products" },
        { nameOrPath: "Count of orders" },
        { nameOrPath: "Count of orders over time" },
        { nameOrPath: "Orders model metric" },
      ]);
      await verifyMetricCount(page, 4);
    });

    test("should not show me metrics that live in collections I do not have permissions to see", async ({
      page,
      context,
    }) => {
      await signInWithCachedSession(context, "nocollection");
      await MetricsViewer.goToViewer(page);
      await MetricsViewer.searchInput(page);
      await page.keyboard.type("Count of", { delay: 20 });
      await expect(miniPicker(page)).toContainText("No search results");

      await MetricsViewer.searchInput(page);
      await page.keyboard.press("ControlOrMeta+A");
      await page.keyboard.press("Backspace");
      await page.keyboard.type("Test Measure", { delay: 20 });
      await expect(miniPicker(page)).toContainText("Test Measure");
    });

    test("should not show me measures that live in tables I do not have permissions to see", async ({
      page,
      mb,
    }) => {
      await mb.signIn("nodata");
      await MetricsViewer.goToViewer(page);
      await MetricsViewer.searchInput(page);
      await page.keyboard.type("Test Measure", { delay: 20 });
      await expect(miniPicker(page)).toContainText("No search results");

      await addMetric(page, "Count of orders", { clearInput: true });
      // even though we can see the metric, we don't have permissions to run
      // the query
      await expect(
        page.getByRole("heading", {
          name: /You do not have permissions to run this query/i,
        }),
      ).toBeVisible();
    });
  });

  test.describe("Breakouts", () => {
    test.beforeEach(async ({ page }) => {
      await MetricsViewer.goToViewer(page);
      await addMetric(page, "Count of orders");
    });

    test("should add a temporal breakout dimension", async ({ page }) => {
      await selectBreakout(page, "Count of orders", "Created At", 0, "Year");
      const legend = MetricsViewer.breakoutLegend(page);
      await expect(
        legend.getByRole("heading", { name: "Created At", exact: true }),
      ).toBeVisible();
      const currentYear = new Date().getFullYear();
      for (let year = 2025; year <= currentYear; year++) {
        await expect(
          legend.getByText(String(year), { exact: true }),
        ).toBeVisible();
      }

      await expect(
        pillColorIndicators(
          page
            .getByTestId("metrics-viewer-pill")
            .filter({ hasText: containsText("Count of orders") })
            .first(),
        ),
      ).toHaveCount(5);

      await MetricsViewer.searchBarPills(page)
        .filter({ hasText: containsText("Count of orders") })
        .first()
        .click();
      await popover(page)
        .getByText("Change series breakout", { exact: true })
        .click();
      await popover(page).getByText("Category", { exact: true }).click();

      await expect(
        legend.getByRole("heading", { name: /Category/ }),
      ).toBeVisible();

      await MetricsViewer.searchBarPills(page)
        .filter({ hasText: containsText("Count of orders") })
        .first()
        .click();
      await popover(page)
        .getByText("Remove series breakout", { exact: true })
        .click();
      await expect(MetricsViewer.breakoutLegend(page)).toHaveCount(0);
    });

    test("should add a categorical breakout dimension", async ({ page }) => {
      await selectBreakout(page, "Count of orders", "Source");
      const legend = MetricsViewer.breakoutLegend(page);
      await expect(legend.getByRole("heading", { name: /Source/ })).toBeVisible();

      await expect(legend.getByText("Twitter", { exact: true })).toBeVisible();
      await expect(legend.getByText("Facebook", { exact: true })).toBeVisible();
      await expect(legend.getByText("Organic", { exact: true })).toBeVisible();
      await expect(legend.getByText("Google", { exact: true })).toBeVisible();
      await expect(legend.getByText("Affiliate", { exact: true })).toBeVisible();
    });

    test("should add a numeric breakout dimension with default binning", async ({
      page,
    }) => {
      await selectBreakout(page, "Count of orders", "Total");
      const legend = MetricsViewer.breakoutLegend(page);
      await expect(
        legend.getByRole("heading", { name: "Total", exact: true }),
      ).toBeVisible();

      for (const bin of [
        "-60 – -40",
        "0 – 20",
        "20 – 40",
        "40 – 60",
        "60 – 80",
        "80 – 100",
        "100 – 120",
        "120 – 140",
        "140 – 160",
      ]) {
        await expect(legend.getByText(bin, { exact: true })).toBeVisible();
      }

      // Search pill should cap at 6 color indicators
      await expect(
        pillColorIndicators(
          page
            .getByTestId("metrics-viewer-pill")
            .filter({ hasText: containsText("Count of orders") })
            .first(),
        ),
      ).toHaveCount(6);
    });

    test("should handle breakout independently for multiple instances of the same metric", async ({
      page,
    }) => {
      // Expand formula editor and create expression with second metric
      // instance
      await addMetricInputSequence(page, [
        { nameOrPath: "Count of orders" },
        "+",
        { nameOrPath: "Count of products" },
        { nameOrPath: "Count of orders" },
      ]);

      // Should have 2 metric pills (expression pill is separate)
      await expect(MetricsViewer.searchBarPills(page)).toHaveCount(3);

      // Two standalone instances of the same metric should have different
      // pill colors
      const pill0Colors = await getPillColors(page, 0);
      const pill2Colors = await getPillColors(page, 2);
      expect(pill0Colors[0]).not.toEqual(pill2Colors[0]);

      // Each standalone pill color should appear on the chart
      await assertPillColorsInChart(page, 0);
      await assertPillColorsInChart(page, 2);

      // Apply breakout to first instance of Count of orders
      await MetricsViewer.searchBarPills(page).nth(0).click();
      await popover(page)
        .getByText("Add a series breakout", { exact: true })
        .click();
      await popover(page).getByText("Source", { exact: true }).click();

      // Breakout legend should be visible with Source values
      const legend = MetricsViewer.breakoutLegend(page);
      await expect(legend).toBeVisible();
      await expect(
        legend.getByRole("heading", { name: "User → Source", exact: true }),
      ).toBeVisible();
      for (const source of [
        "Twitter",
        "Facebook",
        "Organic",
        "Google",
        "Affiliate",
      ]) {
        await expect(legend.getByText(source, { exact: true })).toBeVisible();
      }

      // First pill should show multiple color indicators (breakout)
      await expect
        .poll(() =>
          pillColorIndicators(MetricsViewer.searchBarPills(page).nth(0)).count(),
        )
        .toBeGreaterThan(1);

      // Second pill should have single color (no breakout yet)
      await expect(
        pillColorIndicators(MetricsViewer.searchBarPills(page).nth(2)),
      ).toHaveCount(1);

      // Breakout pill colors should appear on the chart
      await assertPillColorsInChart(page, 0);

      // Non-breakout pill color should appear on the chart
      await assertPillColorsInChart(page, 2);

      // Legend dot colors should match pill colors for breakout instance
      await assertLegendColorsMatchPill(page, 0);

      // Apply breakout to second instance of Count of orders
      await MetricsViewer.searchBarPills(page).nth(2).click();
      await popover(page)
        .getByText("Add a series breakout", { exact: true })
        .click();
      const dataset = waitForMetricDataset(page);
      await popover(page).getByText("Source", { exact: true }).click();
      await dataset;

      // Both pills should now have multiple color indicators
      await expect
        .poll(() =>
          pillColorIndicators(MetricsViewer.searchBarPills(page).nth(0)).count(),
        )
        .toBeGreaterThan(1);
      await expect
        .poll(() =>
          pillColorIndicators(MetricsViewer.searchBarPills(page).nth(2)).count(),
        )
        .toBeGreaterThan(1);

      // Both breakout pills' colors should appear on the chart
      await assertPillColorsInChart(page, 0);
      await assertPillColorsInChart(page, 2);

      // The two breakout pills should have different color sets
      const breakoutPill0Colors = await getPillColors(page, 0);
      const breakoutPill2Colors = await getPillColors(page, 2);
      expect(breakoutPill0Colors[0]).not.toEqual(breakoutPill2Colors[0]);

      // Remove breakout from first instance
      await MetricsViewer.searchBarPills(page).nth(0).click();
      await popover(page)
        .getByText("Remove series breakout", { exact: true })
        .click();

      // Legend should still be visible because second instance has breakout
      await expect(legend).toBeVisible();
      await expect(
        legend.getByRole("heading", { name: "User → Source", exact: true }),
      ).toBeVisible();

      // First pill should have single color (breakout removed)
      await expect(
        pillColorIndicators(MetricsViewer.searchBarPills(page).nth(0)),
      ).toHaveCount(1);

      // Second pill should still have multiple colors
      await expect
        .poll(() =>
          pillColorIndicators(MetricsViewer.searchBarPills(page).nth(2)).count(),
        )
        .toBeGreaterThan(1);

      // After removing breakout, pill colors should still match chart
      await assertPillColorsInChart(page, 0);
      await assertPillColorsInChart(page, 2);
    });

    test("should preserve breakout state when editing formula and re-running", async ({
      page,
    }) => {
      // Set up: two instances of Count of orders with an expression
      await addMetric(page, "Count of orders");

      await expect(MetricsViewer.searchBarPills(page)).toHaveCount(2);

      // Apply breakout to first instance of Count of orders
      await MetricsViewer.searchBarPills(page).nth(0).click();
      await popover(page)
        .getByText("Add a series breakout", { exact: true })
        .click();
      const dataset = waitForMetricDataset(page);
      await popover(page).getByText("Source", { exact: true }).click();
      await dataset;

      // Verify breakout is applied — first pill has multiple colors
      await expect
        .poll(() =>
          pillColorIndicators(MetricsViewer.searchBarPills(page).nth(0)).count(),
        )
        .toBeGreaterThan(1);

      await expect(MetricsViewer.breakoutLegend(page)).toBeVisible();

      // Enter formula edit mode and append a new metric
      await MetricsViewer.formulaInput(page).click();
      await expect(miniPicker(page)).toBeVisible();
      await MetricsViewer.searchInput(page);
      await page.keyboard.type(", Count of products", { delay: 20 });
      const getMetric = waitForGetMetric(page);
      await selectEntityPickerItem(page, "Count of products");
      await getMetric;
      const rerunDataset = waitForMetricDataset(page);
      await runFormula(page);
      await rerunDataset;

      // Should now have 3 metric pills
      await expect(MetricsViewer.searchBarPills(page)).toHaveCount(3);

      // First pill should still have breakout — multiple colors preserved
      await expect
        .poll(() =>
          pillColorIndicators(MetricsViewer.searchBarPills(page).nth(0)).count(),
        )
        .toBeGreaterThan(1);

      // Breakout legend should still be visible
      const legend = MetricsViewer.breakoutLegend(page);
      await expect(legend).toBeVisible();
      await expect(
        legend.getByRole("heading", { name: "User → Source", exact: true }),
      ).toBeVisible();

      // Newly added third pill should have single color (no breakout)
      await expect(
        pillColorIndicators(MetricsViewer.searchBarPills(page).nth(2)),
      ).toHaveCount(1);

      // Second pill (standalone Count of orders) should still be single
      await expect(
        pillColorIndicators(MetricsViewer.searchBarPills(page).nth(1)),
      ).toHaveCount(1);

      // Remove second pill (standalone Count of orders)
      await MetricsViewer.searchBarPills(page)
        .nth(1)
        .getByLabel("Remove Count of orders", { exact: true })
        .click();

      // First pill should still have breakout — multiple colors preserved
      await expect
        .poll(() =>
          pillColorIndicators(MetricsViewer.searchBarPills(page).nth(0)).count(),
        )
        .toBeGreaterThan(1);
    });

    test("cannot breakout a metric math expression", async ({ page }) => {
      await addMetricInputSequence(page, [
        { nameOrPath: "Count of orders" },
        "+",
        { nameOrPath: testMeasurePath },
      ]);

      // Expression pill menu only offers Rename, no breakout options
      await MetricsViewer.searchBarPills(page).nth(1).click();
      const menu = popover(page);
      await expect(
        menu.getByRole("menuitem", { name: "rename icon Rename", exact: true }),
      ).toBeVisible();
      await expect(menu.getByText(/Add a series breakout/)).toHaveCount(0);
      await expect(menu.getByText(/Change series breakout/)).toHaveCount(0);
      await expect(menu.getByText(/Remove series breakout/)).toHaveCount(0);
    });
  });

  test.describe("Expression custom names", () => {
    test.beforeEach(async ({ page }) => {
      await MetricsViewer.goToViewer(page);
      await addMetric(page, "Count of orders");
      await expect(MetricsViewer.getMetricVisualization(page)).toBeVisible();
    });

    test("should allow setting a custom name on an expression pill", async ({
      page,
    }) => {
      await addMetricInputSequence(page, [
        { nameOrPath: "Count of orders" },
        "+",
        { nameOrPath: testMeasurePath },
      ]);

      // Click the expression pill to open name editor
      await expect(MetricsViewer.searchBarPills(page)).toHaveCount(2);
      await expect(MetricsViewer.searchBarPills(page).nth(1)).toContainText(
        "Count of orders",
      );
      await openExpressionRename(page, 1);

      // Type a custom name
      await expect(page.getByTestId("expression-name-input")).toBeFocused();
      await typeExpressionName(page, "My Custom Expression");

      // Pill should display the custom name
      await expect(MetricsViewer.searchBarPills(page)).toHaveCount(2);
      await expect(MetricsViewer.searchBarPills(page).nth(1)).toContainText(
        "My Custom Expression",
      );

      // Add breakout on the first metric to trigger the legend
      await selectBreakout(page, "Count of orders", "Source");

      // Legend should display the custom expression name
      const legend = MetricsViewer.breakoutLegend(page);
      await expect(
        legend.getByText("My Custom Expression", { exact: true }),
      ).toHaveCount(2);
      await expect(legend.getByText(/Test Measure/)).toHaveCount(0);

      // Chart tooltip should display the custom name
      await cartesianChartCircles(page).nth(4).hover({ force: true });
      const chartTooltip = echartsTooltip(page);
      await expect(
        chartTooltip.getByText("My Custom Expression", { exact: true }),
      ).toBeVisible();
      await expect(chartTooltip.getByText(/Test Measure/)).toHaveCount(0);
    });

    test("should revert to formula text when custom name is cleared", async ({
      page,
    }) => {
      await addMetricInputSequence(page, [
        { nameOrPath: "Count of orders" },
        "+",
        {
          nameOrPath: testMeasurePath,
        },
      ]);

      // Set a custom name
      await expect(MetricsViewer.searchBarPills(page)).toHaveCount(2);
      await openExpressionRename(page, 1);
      await typeExpressionName(page, "Temporary Name");

      await expect(MetricsViewer.searchBarPills(page)).toHaveCount(2);
      await expect(MetricsViewer.searchBarPills(page).nth(1)).toContainText(
        "Temporary Name",
      );

      // Clear the custom name
      await openExpressionRename(page, 1);
      await typeExpressionName(page, "");

      // Pill should revert to formula-derived text (contains metric names)
      await expect(MetricsViewer.searchBarPills(page)).toHaveCount(2);
      await expect(MetricsViewer.searchBarPills(page).nth(1)).not.toContainText(
        "Temporary Name",
      );
      await expect(MetricsViewer.searchBarPills(page).nth(1)).toContainText(
        "Count of orders",
      );

      // Add breakout on the first metric to trigger the legend
      await selectBreakout(page, "Count of orders", "Source");

      // Legend should use the formula-derived name, not the old custom name
      const legend = MetricsViewer.breakoutLegend(page);
      await expect(legend.getByText("Temporary Name", { exact: true })).toHaveCount(
        0,
      );
      await expect(
        legend.getByText("Count of orders + Test Measure", { exact: true }),
      ).toHaveCount(2);

      // Tooltip should use the formula-derived name, not the old custom name
      await cartesianChartCircles(page).nth(4).hover({ force: true });
      const chartTooltip = echartsTooltip(page);
      await expect(
        chartTooltip.getByText("Temporary Name", { exact: true }),
      ).toHaveCount(0);
      await expect(
        chartTooltip.getByText("Count of orders + Test Measure", {
          exact: true,
        }),
      ).toBeVisible();
    });

    test("should preserve custom name when re-running with the same expression", async ({
      page,
    }) => {
      await addMetricInputSequence(page, [
        { nameOrPath: "Count of orders" },
        "+",
        { nameOrPath: testMeasurePath },
      ]);

      // Set a custom name on the expression pill
      await expect(MetricsViewer.searchBarPills(page)).toHaveCount(2);
      await openExpressionRename(page, 1);
      await typeExpressionName(page, "My Stable Name");

      await expect(MetricsViewer.searchBarPills(page)).toHaveCount(2);
      await expect(MetricsViewer.searchBarPills(page).nth(1)).toContainText(
        "My Stable Name",
      );

      // Enter formula mode and re-run the expression
      await addMetric(page, "Count of products");

      // Custom name should still be preserved
      await expect(MetricsViewer.searchBarPills(page)).toHaveCount(3);
      await expect(MetricsViewer.searchBarPills(page).nth(1)).toContainText(
        "My Stable Name",
      );

      // Tooltip should display the preserved custom name
      await cartesianChartCircles(page).nth(4).hover({ force: true });
      const chartTooltip = echartsTooltip(page);
      await expect(
        chartTooltip.getByText("My Stable Name", { exact: true }),
      ).toBeVisible();
      await expect(chartTooltip.getByText(/Test Measure/)).toHaveCount(0);
    });

    test("should not change expression pill color when renaming", async ({
      page,
    }) => {
      await addMetricInputSequence(page, [
        { nameOrPath: "Count of orders" },
        "+",
        { nameOrPath: testMeasurePath },
      ]);

      // Capture the expression pill color before renaming
      const expressionPillIndex = 1;
      const colorsBefore = await getPillColors(page, expressionPillIndex);

      // Set a custom name on the expression pill
      await expect(MetricsViewer.searchBarPills(page)).toHaveCount(2);
      await openExpressionRename(page, 1);
      await typeExpressionName(page, "Renamed Expression");

      await expect(MetricsViewer.searchBarPills(page)).toHaveCount(2);
      await expect(MetricsViewer.searchBarPills(page).nth(1)).toContainText(
        "Renamed Expression",
      );

      // Verify the pill color has not changed after renaming
      const colorsAfter = await getPillColors(page, expressionPillIndex);
      expect(colorsAfter).toEqual(colorsBefore);
    });

    test("should preserve custom name when the expression is edited in place but keeps at least one original metric", async ({
      page,
    }) => {
      await addMetricInputSequence(page, [
        { nameOrPath: "Count of orders" },
        "+",
        { nameOrPath: testMeasurePath },
      ]);

      // Set a custom name on the expression pill
      await expect(MetricsViewer.searchBarPills(page)).toHaveCount(2);
      await openExpressionRename(page, 1);
      await typeExpressionName(page, "Preserved Name");

      await expect(MetricsViewer.searchBarPills(page)).toHaveCount(2);
      await expect(MetricsViewer.searchBarPills(page).nth(1)).toContainText(
        "Preserved Name",
      );

      // Edit in place: delete '+ Test Measure' from the end of the expression
      // while keeping the 'Count of orders' token intact, then append a new
      // operand. The surviving identity carries the custom name.
      await MetricsViewer.formulaInput(page).click();
      // One {backspace} deletes the atomic "Test Measure" token, then three
      // delete " + " char-by-char. The first metric token in the expression
      // ("Count of orders") is untouched and its MetricIdentity (with
      // customName) survives.
      await MetricsViewer.searchInput(page);
      await page.keyboard.press("End");
      for (let i = 0; i < 4; i++) {
        await page.keyboard.press("Backspace");
      }
      await addMetricInputSequence(page, [
        "*",
        { nameOrPath: "Count of products" },
      ]);

      // The expression now reads 'Count of orders * Count of products' and
      // keeps the user-assigned name because one identity survived.
      await expect(MetricsViewer.searchBarPills(page)).toHaveCount(2);
      await expect(MetricsViewer.searchBarPills(page).nth(1)).toContainText(
        "Preserved Name",
      );
    });

    test("should keep each expression's own name when an earlier expression is removed", async ({
      page,
    }) => {
      // Regression: names used to shift up by ordinal position, so deleting
      // the first expression made the second one inherit "First Name".
      // Now names are bound to identities — the surviving expression keeps
      // its own "Second Name".

      // Build two separately-named expressions
      await addMetricInputSequence(
        page,
        [
          { nameOrPath: "Count of orders" },
          "+",
          { nameOrPath: testMeasurePath },
        ],
        { clearInput: true },
      );

      await expect(MetricsViewer.searchBarPills(page)).toHaveCount(1);
      await openExpressionRename(page, 0);
      await typeExpressionName(page, "First Name");
      await expect(MetricsViewer.searchBarPills(page).nth(0)).toContainText(
        "First Name",
      );

      await addMetricInputSequence(page, [
        ",",
        { nameOrPath: "Count of orders" },
        "+",
        { nameOrPath: testMeasurePath },
      ]);

      await expect(MetricsViewer.searchBarPills(page)).toHaveCount(2);
      await openExpressionRename(page, 1);
      await typeExpressionName(page, "Second Name");
      await expect(MetricsViewer.searchBarPills(page).nth(0)).toContainText(
        "First Name",
      );
      await expect(MetricsViewer.searchBarPills(page).nth(1)).toContainText(
        "Second Name",
      );

      // Delete the first expression in place (atomic-range-aware {del}
      // sequence). The second expression's identities — and therefore its
      // custom name — are preserved by CodeMirror's range tracking.
      await MetricsViewer.formulaInput(page).click();
      // text: "Count of orders + Test Measure, Count of orders + Test Measure"
      // cursor at {home} = 0. Seven forward-deletes remove, in order:
      // "Count of orders" (atomic), " ", "+", " ", "Test Measure" (atomic),
      // ",", " ". What remains is exactly the second expression.
      await MetricsViewer.searchInput(page);
      await page.keyboard.press("Home");
      for (let i = 0; i < 7; i++) {
        await page.keyboard.press("Delete");
      }
      await runFormula(page);

      // The surviving expression must keep its own 'Second Name' and must
      // NOT inherit 'First Name' from the removed expression.
      await expect(MetricsViewer.searchBarPills(page)).toHaveCount(1);
      await expect(MetricsViewer.searchBarPills(page).nth(0)).toContainText(
        "Second Name",
      );
      await expect(MetricsViewer.searchBarPills(page).nth(0)).not.toContainText(
        "First Name",
      );
    });
  });

  test.describe("Dimension picker sidebar", () => {
    test.describe("Regular metric pills", () => {
      test.beforeEach(async ({ page }) => {
        await MetricsViewer.goToViewer(page);
        await addMetric(page, "Count of orders");
        await expect(MetricsViewer.getMetricVisualization(page)).toBeVisible();
      });

      test("should open and close from the viewer controls", async ({
        page,
      }) => {
        await expect(MetricsViewer.getMetricVisualization(page)).toBeVisible();

        const sidebar = await MetricsViewer.openDimensionPickerSidebar(page);
        await expect(
          sidebar.getByRole("heading", { name: "Break out", exact: true }),
        ).toBeVisible();
        await expect(
          sidebar.getByLabel("Search fields", { exact: true }),
        ).toBeVisible();
        await expect(
          sidebar.getByRole("button", { name: "Time", exact: true }),
        ).toBeVisible();
        await expect(
          sidebar.getByRole("button", { name: "Category", exact: true }),
        ).toBeVisible();
        await expect(
          sidebar.getByRole("button", { name: "Totals", exact: true }),
        ).toHaveCount(0);

        await MetricsViewer.closeDimensionPickerSidebar(page);
        await expect(MetricsViewer.dimensionPickerSidebar(page)).toHaveCount(0);
        await expect(MetricsViewer.getMetricVisualization(page)).toBeVisible();
      });

      test("should select and reopen the No breakout state from the viewer controls", async ({
        page,
      }) => {
        const sidebar = await MetricsViewer.openDimensionPickerSidebar(page);
        const noBreakout = sidebar.getByRole("button", {
          name: "No breakout",
          exact: true,
        });
        await expect(noBreakout).toBeVisible();
        await expect(noBreakout).toHaveAttribute("aria-pressed", "false");
        const dataset = waitForMetricDataset(page);
        await noBreakout.click();
        await dataset;

        await expect(noBreakout).toHaveAttribute("aria-pressed", "true");
        await MetricsViewer.assertVizType(page, "Number");
        await expect(MetricsViewer.breakoutLegend(page)).toHaveCount(0);

        await MetricsViewer.closeDimensionPickerSidebar(page);
        await expect(MetricsViewer.dimensionPickerSidebar(page)).toHaveCount(0);

        const controlsNoBreakout = MetricsViewer.getMetricControls(page)
          .getByRole("button", { name: "No breakout", exact: true });
        await expect(controlsNoBreakout).toBeVisible();
        await controlsNoBreakout.click();

        const reopened = MetricsViewer.dimensionPickerSidebar(page);
        await expect(
          reopened.getByRole("heading", { name: "Break out", exact: true }),
        ).toBeVisible();
        await expect(
          reopened.getByRole("button", { name: "No breakout", exact: true }),
        ).toHaveAttribute("aria-pressed", "true");
      });

      test("should select dimension categories from the sidebar", async ({
        page,
      }) => {
        await addMetricInputSequence(page, [
          { nameOrPath: "Count of orders" },
          "+",
          { nameOrPath: testMeasurePath },
        ]);

        await MetricsViewer.assertVizType(page, "Line");

        await selectDimensionBreakout(page, "State", { seeAll: true });
        await expectUnstructuredSnowplowEvent({
          event: "metrics_viewer_dimension_selected",
        });
        await MetricsViewer.assertAllVizTypes(page, "Map", 2);

        await selectDimensionBreakout(page, "Category");
        await MetricsViewer.assertVizType(page, "Bar");

        // should allow changing display types
        await MetricsViewer.changeVizType(page, "line");
        await MetricsViewer.assertVizType(page, "Line");
      });

      test("should keep all fields available while selecting dimensions from See all", async ({
        page,
      }) => {
        const sidebar = await MetricsViewer.openDimensionPickerSidebar(page);
        await sidebar
          .getByRole("button", { name: "See all", exact: true })
          .click();
        await expect(
          sidebar.getByRole("heading", { name: "All fields", exact: true }),
        ).toBeVisible();
        await expect(
          sidebar.getByRole("button", { name: "Address", exact: true }),
        ).toBeVisible();
        await expect(
          sidebar.getByRole("button", { name: "City", exact: true }),
        ).toBeVisible();
        const addressDataset = waitForMetricDataset(page);
        await sidebar
          .getByRole("button", { name: "Address", exact: true })
          .click();
        await addressDataset;

        const address = sidebar.getByRole("button", {
          name: "Address",
          exact: true,
        });
        const city = sidebar.getByRole("button", { name: "City", exact: true });
        await address.scrollIntoViewIfNeeded();
        await expect(address).toBeVisible();
        await city.scrollIntoViewIfNeeded();
        await expect(city).toBeVisible();
        const cityDataset = waitForMetricDataset(page);
        await city.click();
        await cityDataset;

        await address.scrollIntoViewIfNeeded();
        await expect(address).toBeVisible();
        await city.scrollIntoViewIfNeeded();
        await expect(city).toBeVisible();
      });

      test("should only show shared dimensions by default for multiple metric sources", async ({
        page,
      }) => {
        await addMetric(page, ["Our analytics", "Count of feedback"]);
        await verifyMetricCount(page, 2);

        const sidebar = await MetricsViewer.openDimensionPickerSidebar(page);
        await expect(sidebar).toContainText("Shared dimensions");
        await expect(sidebar).toContainText("Time");
        await expect(sidebar).not.toContainText("Rating");

        await sidebar
          .getByRole("button", { name: "See all", exact: true })
          .click();

        await expect(
          sidebar.getByRole("heading", { name: "All fields", exact: true }),
        ).toBeVisible();
        await expect(
          sidebar.getByRole("button", { name: "Rating", exact: true }).first(),
        ).toBeVisible();
      });

      test("should configure per-metric dimensions for a shared category", async ({
        page,
      }) => {
        await addMetric(page, "Count of products");

        const sidebar = await MetricsViewer.openDimensionPickerSidebar(page);
        await sidebar
          .getByRole("button", { name: "Time", exact: true })
          .hover();

        await sidebar
          .getByRole("button", { name: "Configure Time", exact: true })
          .click();

        await sidebar
          .getByLabel("Select dimension for Count of orders", { exact: true })
          .click();
        const dataset = waitForMetricDataset(page);
        await page.getByRole("option", { name: /Birth Date/ }).click();
        await dataset;

        await expect(
          sidebar.getByLabel("Select dimension for Count of orders", {
            exact: true,
          }),
        ).toHaveValue("Birth Date");
        await expect(
          sidebar.getByLabel("Select dimension for Count of products", {
            exact: true,
          }),
        ).toHaveValue("Created At");
      });

      test("should render column labels as static text", async ({ page }) => {
        await showColumnLabels(page);

        const pillBar = MetricsViewer.getDimensionPillBarContainer(page);
        const label = pillBar.getByText("Created At", { exact: true });
        await expect(label).toBeVisible();
        await label.click();
        await expect(pillBar.getByRole("button")).toHaveCount(0);
        await expect(MetricsViewer.dimensionPickerSidebar(page)).toHaveCount(0);
      });

      test("should auto-assign dimensions for a newly added metric after running the formula", async ({
        page,
      }) => {
        // After adding a second metric, all dimension labels should have a
        // selected dimension
        await addMetric(page, "Count of products");

        await expect(
          MetricsViewer.getColumnPickerButton(page),
        ).not.toContainText("Select a dimension");

        await selectDimensionBreakout(page, "Category");
        await expect(
          MetricsViewer.getColumnPickerButton(page),
        ).not.toContainText("Select a dimension");
      });

      test("should preserve a selected dimension after page reload", async ({
        page,
      }) => {
        await addMetricInputSequence(page, [
          { nameOrPath: "Count of orders" },
          "+",
          { nameOrPath: "Count of products" },
        ]);

        await selectDimensionBreakout(page, "Category");
        await expect(MetricsViewer.getColumnPickerButton(page)).toContainText(
          "Category",
        );

        const dataset = waitForMetricDataset(page);
        await page.reload();
        await dataset;
        await expect(MetricsViewer.getColumnPickerButton(page)).toContainText(
          "Category",
        );
      });

      test("should serialize only the selected dimension breakout in the URL", async ({
        page,
      }) => {
        await selectDimensionBreakout(page, "State", { seeAll: true });
        await selectDimensionBreakout(page, "Category");

        await expect(() => {
          const state = getMetricsViewerUrlState(page);
          expect(state.t).toHaveLength(1);
          const [breakout] = state.t ?? [];
          if (!breakout) {
            throw new Error("Expected one serialized dimension breakout");
          }
          expect(breakout).toMatchObject({ t: "category", l: "Category" });
          expect(state.a).toEqual(breakout.i);
        }).toPass();

        const dataset = waitForMetricDataset(page);
        await page.reload();
        await dataset;
        await expect(MetricsViewer.getColumnPickerButton(page)).toContainText(
          "Category",
        );
      });
    });

    test.describe("Expression pills", () => {
      test("should show an expression dimension pill with per-metric accordion", async ({
        page,
      }) => {
        await MetricsViewer.goToViewer(page);
        // Create expression: Count of orders + Count of products
        await addOrdersProductsExpression(page);

        // Dimension pill bar should contain a selected expression dimension
        // label
        await showColumnLabels(page);
        await expect(
          MetricsViewer.getDimensionPillBarContainer(page),
        ).toBeVisible();
        await expect(
          MetricsViewer.getDimensionPillBarContainer(page),
        ).not.toContainText("Select dimensions");

        // Open the sidebar dimension picker
        await MetricsViewer.openDimensionPickerSidebar(page);

        // All fields should show accordion sections for each metric in the
        // expression
        const sidebar = MetricsViewer.dimensionPickerSidebar(page);
        await sidebar
          .getByRole("button", { name: "See all", exact: true })
          .click();
        await expect(
          sidebar.getByRole("heading", { name: "All fields", exact: true }),
        ).toBeVisible();
        const ordersSection = sidebar.getByRole("button", {
          name: "Count of orders",
          exact: true,
        });
        await expect(ordersSection).toBeVisible();
        await expect(ordersSection).toHaveAttribute("aria-expanded", "true");
        const productsSection = sidebar.getByRole("button", {
          name: "Count of products",
          exact: true,
        });
        await productsSection.scrollIntoViewIfNeeded();
        await expect(productsSection).toBeVisible();
        await expect(productsSection).toHaveAttribute("aria-expanded", "false");
        await productsSection.click();
        await expect(
          sidebar.getByRole("button", { name: "Category", exact: true }).first(),
        ).toBeVisible();

        // Configure the shared Time category and select a non-default
        // dimension
        await sidebar.getByRole("button", { name: "Back", exact: true }).click();
        await openTimeDimensionConfiguration(page);
        await sidebar
          .getByLabel("Select dimension for Count of orders", { exact: true })
          .click();
        const dataset = waitForMetricDataset(page);
        await page.getByRole("option", { name: /Birth Date/ }).click();
        await dataset;

        // Expression dimension pill should now show 'Multiple dimensions'
        await expect(
          MetricsViewer.getDimensionPillBarContainer(page),
        ).toContainText("Multiple dimensions");
      });

      test("should preserve non-default expression dimensions after page reload", async ({
        page,
      }) => {
        await MetricsViewer.goToViewer(page);
        // Create expression with only expression entity:
        // Count of orders + Count of products
        await addOrdersProductsExpression(page);
        await showColumnLabels(page);

        // Pick a non-default dimension for one metric in the expression
        await MetricsViewer.openDimensionPickerSidebar(page);
        await openTimeDimensionConfiguration(page);
        const sidebar = MetricsViewer.dimensionPickerSidebar(page);
        await sidebar
          .getByLabel("Select dimension for Count of orders", { exact: true })
          .click();
        const dataset = waitForMetricDataset(page);
        await page.getByRole("option", { name: /Birth Date/ }).click();
        await dataset;

        // Verify the pill shows 'Multiple dimensions' (non-default state)
        await expect(
          MetricsViewer.getDimensionPillBarContainer(page),
        ).toContainText("Multiple dimensions");
        await waitForSerializedDimensionBreakout(page);

        // Reload the page and verify the dimension choice persists
        const reloadGetMetric = waitForGetMetric(page);
        const reloadDataset = waitForMetricDataset(page);
        await page.reload();
        await reloadGetMetric;
        await reloadDataset;

        // Verify the per-metric dimension selections are restored
        await MetricsViewer.openDimensionPickerSidebar(page);
        await openTimeDimensionConfiguration(page);
        await expect(
          sidebar.getByLabel("Select dimension for Count of orders", {
            exact: true,
          }),
        ).toHaveValue("Birth Date");
        await expect(
          sidebar.getByLabel("Select dimension for Count of products", {
            exact: true,
          }),
        ).toHaveValue("Created At");
      });
    });
  });

  test.describe("Automatic split view", () => {
    test.beforeEach(async ({ page }) => {
      await MetricsViewer.goToViewer(page);
      await addMetric(page, "Count of orders");
    });

    test("should show unified view for display types that support multiple series", async ({
      page,
    }) => {
      await addMetric(page, "Count of products");

      // line charts support multiple series, so should be unified
      await MetricsViewer.assertVizType(page, "Line");
      await expect(
        MetricsViewer.getAllMetricVisualizations(page),
      ).toHaveCount(1);

      // bar charts also support multiple series
      await selectDimensionBreakout(page, "Category");
      await MetricsViewer.assertVizType(page, "Bar");
      await expect(
        MetricsViewer.getAllMetricVisualizations(page),
      ).toHaveCount(1);
    });

    test("should stack series into panels when the stack series button is toggled", async ({
      page,
    }) => {
      await addMetric(page, "Count of products");

      // line chart with multiple series should show chart layout picker
      await MetricsViewer.assertVizType(page, "Line");
      await expect(page.getByTestId("chart-layout-picker")).toBeVisible();
      await page.getByLabel("Stack layout", { exact: true }).click();
      await expectUnstructuredSnowplowEvent({
        event: "stack_series_enabled",
        triggered_from: "metrics_viewer",
      });

      // should split the chart into separate panels
      await expect(splitPanelAxisLines(page)).toHaveCount(2);

      // toggling off should return to unified view
      await page.getByLabel("Default layout", { exact: true }).click();
      await expect(splitPanelAxisLines(page)).toHaveCount(0);

      // button should not be visible for non-line/area/bar charts
      await selectDimensionBreakout(page, "State", { seeAll: true });
      await MetricsViewer.assertVizType(page, "Map");
      await expect(page.getByTestId("chart-layout-picker")).toHaveCount(0);
    });

    test("should automatically split for display types that do not support multiple series", async ({
      page,
    }) => {
      // with a single series, map shows one visualization
      await selectDimensionBreakout(page, "State");
      await MetricsViewer.assertVizType(page, "Map");
      await expect(
        MetricsViewer.getAllMetricVisualizations(page),
      ).toHaveCount(1);

      // add a breakout to create multiple series
      await selectDimensionBreakout(page, "Time", { waitForDataset: false });
      await selectBreakout(page, "Count of orders", "Source");

      // line supports multiple series, so should remain unified
      await expect(
        MetricsViewer.getAllMetricVisualizations(page),
      ).toHaveCount(1);

      // map does not support multiple series, so should auto-split
      await selectDimensionBreakout(page, "State");
      await expect
        .poll(() => MetricsViewer.getAllMetricVisualizations(page).count())
        .toBeGreaterThan(1);
    });
  });

  test.describe("Filters", () => {
    test.beforeEach(async ({ page }) => {
      await MetricsViewer.goToViewer(page);
      await addMetric(page, "Count of orders");
    });

    test("should apply a categorical filter to a metric", async ({ page }) => {
      await selectBreakout(page, "Count of orders", "Category");
      const legend = MetricsViewer.breakoutLegend(page);
      await expect(legend).toContainText("Doohickey");
      await expect(legend).toContainText("Gadget");
      await expect(legend).toContainText("Gizmo");
      await expect(legend).toContainText("Widget");

      await MetricsViewer.getFilterButton(page).click();
      await popover(page).getByText("Category", { exact: true }).click();

      await popover(page).getByText("Doohickey", { exact: true }).click();
      await popover(page).getByText("Gadget", { exact: true }).click();
      await popover(page)
        .getByRole("button", { name: "Add filter", exact: true })
        .click();

      const filterPills = MetricsViewer.getAllFilterPills(page);
      await expect(filterPills).toHaveCount(1);
      await expect(filterPills.first()).toContainText("Doohickey");
      await expect(filterPills.first()).toContainText("Gadget");
      await expect(filterPills.first()).toContainText("Category");

      await expectUnstructuredSnowplowEvent({
        event: "metrics_viewer_filter_added",
        triggered_from: "metric_filter",
      });

      // edit the filter to change the selection
      await MetricsViewer.getAllFilterPills(page).nth(0).click();
      await popover(page).getByText("Gizmo", { exact: true }).click();
      await popover(page)
        .getByRole("button", { name: "Update filter", exact: true })
        .click();

      await expectUnstructuredSnowplowEvent({
        event: "metrics_viewer_filter_edited",
        triggered_from: "metric_filter",
      });

      await expect(legend).toContainText("Doohickey");
      await expect(legend).toContainText("Gadget");
      await expect(legend).toContainText("Gizmo");

      await selectDimensionBreakout(page, "Category");
      await expect(MetricsViewer.getMetricVisualization(page)).toContainText(
        "Doohickey",
      );
      await expect(MetricsViewer.getMetricVisualization(page)).toContainText(
        "Gizmo",
      );

      // filter on a per tab level
      await MetricsViewer.getMetricControls(page)
        .getByRole("button", { name: /All values/ })
        .click();

      await popover(page).getByText("Doohickey", { exact: true }).click();

      await popover(page)
        .getByRole("button", { name: "Add filter", exact: true })
        .click();
      await expect(
        MetricsViewer.getMetricControls(page).getByRole("button", {
          name: /is Doohickey/,
        }),
      ).toBeVisible();
      await expect(MetricsViewer.getMetricVisualization(page)).toContainText(
        "Doohickey",
      );
      await expect(
        MetricsViewer.getMetricVisualization(page),
      ).not.toContainText("Gizmo");

      await expectUnstructuredSnowplowEvent({
        event: "metrics_viewer_filter_added",
        triggered_from: "dimension_filter",
      });

      // remove filter
      await selectDimensionBreakout(page, "State");
      await expect(
        MetricsViewer.getAllMetricVisualizations(page),
      ).toHaveCount(3);

      await expect(MetricsViewer.getAllFilterPills(page)).toHaveCount(1);
      await MetricsViewer.getAllFilterPills(page)
        .nth(0)
        .getByRole("button", { name: "Remove", exact: true })
        .click();
      await expect(
        MetricsViewer.getAllMetricVisualizations(page),
      ).toHaveCount(4);
      await expect(MetricsViewer.getAllFilterPills(page)).toHaveCount(0);

      await expectUnstructuredSnowplowEvent({
        event: "metrics_viewer_filter_removed",
        triggered_from: "metric_filter",
      });

      // navigating back should undo changes

      // re-apply global filter
      await page.goBack();

      await expect(
        MetricsViewer.getAllMetricVisualizations(page),
      ).toHaveCount(3);
      await expect(MetricsViewer.getAllFilterPills(page)).toHaveCount(1);

      // navigate back to the category dimension
      await page.goBack();
      await expect(MetricsViewer.getColumnPickerButton(page)).toContainText(
        "Category",
      );

      // remove the dimension filter
      await page.goBack();
      await expect(MetricsViewer.getMetricVisualization(page)).toContainText(
        "Doohickey",
      );
      await expect(MetricsViewer.getMetricVisualization(page)).toContainText(
        "Gizmo",
      );
      await expect(
        MetricsViewer.getMetricControls(page).getByRole("button", {
          name: /All values/,
        }),
      ).toBeVisible();

      // navigating forward should re-apply changes
      // re-apply the dimension filter
      await page.goForward();

      await expect(
        MetricsViewer.getMetricControls(page).getByRole("button", {
          name: /is Doohickey/,
        }),
      ).toBeVisible();
      await expect(MetricsViewer.getMetricVisualization(page)).toContainText(
        "Doohickey",
      );
      await expect(
        MetricsViewer.getMetricVisualization(page),
      ).not.toContainText("Gizmo");

      // change dimension back to State
      await page.goForward();
      await expect(MetricsViewer.getColumnPickerButton(page)).toContainText(
        "State",
      );
      await expect(
        MetricsViewer.getAllMetricVisualizations(page),
      ).toHaveCount(3);

      // remove global filter
      await page.goForward();
      await expect(
        MetricsViewer.getAllMetricVisualizations(page),
      ).toHaveCount(4);
      await expect(MetricsViewer.getAllFilterPills(page)).toHaveCount(0);
    });

    test("should allow me to apply filters to each metric individually", async ({
      page,
    }) => {
      await addMetric(page, "Count of products");
      await selectDimensionBreakout(page, "Category");
      await MetricsViewer.changeVizType(page, "line");
      await expect(
        MetricsViewer.getMetricVisualizationDataPoints(page),
      ).toHaveCount(8);

      await MetricsViewer.getFilterButton(page).click();
      await expect(
        popover(page).getByRole("button", { name: /count of orders/i }),
      ).toBeVisible();
      await popover(page)
        .getByRole("button", { name: /count of products/i })
        .click();
      await popover(page).getByText("Category", { exact: true }).click();
      await popover(page).getByText("Doohickey", { exact: true }).click();
      await popover(page).getByText("Gadget", { exact: true }).click();
      await popover(page)
        .getByRole("button", { name: "Add filter", exact: true })
        .click();

      await expect(
        MetricsViewer.getMetricVisualizationDataPoints(page),
      ).toHaveCount(6);

      // Should allow me to change time granularity and range on time based
      // dimensions
      await selectDimensionBreakout(page, "Time");

      await expect(
        MetricsViewer.getMetricVisualizationDataPoints(page),
      ).toHaveCount(85);
      await MetricsViewer.getMetricControls(page)
        .getByRole("button", { name: /by month/i })
        .click();
      await popover(page).getByText("Year", { exact: true }).click();
      await expect(
        MetricsViewer.getMetricVisualizationDataPoints(page),
      ).toHaveCount(9);
      await MetricsViewer.getMetricControls(page)
        .getByRole("button", { name: /by year/i })
        .click();
      await popover(page).getByText("Month", { exact: true }).click();

      await MetricsViewer.getMetricControls(page)
        .getByRole("button", { name: /All time/i })
        .click();

      await popover(page).getByText(/Fixed date/).click();
      await replaceTextboxValue(popover(page), "Start date", "February 7, 2027");
      await replaceTextboxValue(popover(page), "End date", "July 7, 2027");
      await popover(page)
        .getByRole("button", { name: "Add filter", exact: true })
        .click();

      await expect(
        MetricsViewer.getMetricVisualizationDataPoints(page),
      ).toHaveCount(10);

      // edit the dimension filter to change the date range
      await MetricsViewer.getMetricControls(page)
        .getByRole("button", { name: /February/i })
        .click();
      await replaceTextboxValue(popover(page), "Start date", "January 1, 2027");
      await popover(page)
        .getByRole("button", { name: "Update filter", exact: true })
        .click();

      await expectUnstructuredSnowplowEvent({
        event: "metrics_viewer_filter_edited",
        triggered_from: "dimension_filter",
      });

      await MetricsViewer.getMetricControls(page)
        .getByRole("button", { name: /January/i })
        .click();
      await popover(page)
        .getByRole("button", { name: "Clear", exact: true })
        .click();
      await expect(
        MetricsViewer.getMetricVisualizationDataPoints(page),
      ).toHaveCount(85);

      await expectUnstructuredSnowplowEvent({
        event: "metrics_viewer_filter_removed",
        triggered_from: "dimension_filter",
      });
    });

    test("should preserve breakout colors when a dimension filter hides some values", async ({
      page,
    }) => {
      await selectBreakout(page, "Count of orders", "Quantity");

      const entriesBefore = await readLegendEntries(page);
      const colorsBefore: Record<string, string> = {};
      for (const { label, color } of entriesBefore) {
        colorsBefore[label] = color;
      }
      expect(Object.keys(colorsBefore).length).toBeGreaterThan(0);

      await MetricsViewer.getMetricControls(page)
        .getByRole("button", { name: /All time/i })
        .click();
      await popover(page).getByText(/Fixed date/).click();
      await replaceTextboxValue(popover(page), "Start date", "February 1, 2027");
      await replaceTextboxValue(popover(page), "End date", "February 7, 2027");
      const dataset = waitForMetricDataset(page);
      await popover(page)
        .getByRole("button", { name: "Add filter", exact: true })
        .click();
      await dataset;

      await expect
        .poll(async () => (await readLegendEntries(page)).length)
        .toBeLessThan(Object.keys(colorsBefore).length);

      const entriesAfter = await readLegendEntries(page);
      for (const { label, color } of entriesAfter) {
        // Color for each label should be stable after filtering
        expect(colorsBefore[label]).toEqual(color);
      }

      // Chart series colors should match legend colors.
      //
      // The Cypress original asserts `.find(path[stroke=hex]).should("be.visible")`
      // over the whole matched set, and chai-jquery's `visible` resolves to
      // `$el.is(":visible")` — jQuery `.is()` is true when ANY element matches, so
      // upstream passes if at least one path of that color is visible. ECharts
      // renders two paths per series here: the line path and the symbol marker.
      // The date filter narrows each series to a single point, so the line path is
      // a lone moveto (`d="M480.31 68.1"`, 0x0) — genuinely not visible — while the
      // 6x6 marker is. A bare `.first()` would assert on the zero-extent line path,
      // which is stricter than upstream and fails; scope to the visible matches.
      for (const { color } of entriesAfter) {
        await expect(
          echartsContainer(page)
            .locator(`path[stroke="${color}"]`)
            .filter({ visible: true })
            .first(),
        ).toBeVisible();
      }

      // Search pill color indicator should match legend count
      await expect(
        pillColorIndicators(
          page
            .getByTestId("metrics-viewer-pill")
            .filter({ hasText: containsText("Count of orders") })
            .first(),
        ),
      ).toHaveCount(entriesAfter.length);
    });
  });

  test.describe("Segments", () => {
    test.beforeEach(async ({ page }) => {
      await MetricsViewer.goToViewer(page);
    });

    test("should apply a segment as a filter to a metric", async ({
      page,
      mb,
    }) => {
      const SEGMENT_NAME = "Big orders";

      await createSegment(mb.api, {
        name: SEGMENT_NAME,
        description: "Orders with a total over $100",
        definition: {
          "source-table": ORDERS_ID,
          filter: [">", ["field", ORDERS.TOTAL, null], 100],
        },
      });

      await addMetric(page, "Count of orders");

      await MetricsViewer.getFilterButton(page).click();

      // segment should appear alongside dimensions in the filter popover
      await expect(
        popover(page).getByText(SEGMENT_NAME, { exact: true }),
      ).toBeVisible();

      // search should match segment names
      await popover(page)
        .getByPlaceholder("Search dimensions...", { exact: true })
        .pressSequentially("big");
      await expect(
        popover(page).getByText(SEGMENT_NAME, { exact: true }),
      ).toBeVisible();
      await popover(page)
        .getByPlaceholder("Search dimensions...", { exact: true })
        .fill("");

      // clicking a segment applies it directly as a filter
      await popover(page).getByText(SEGMENT_NAME, { exact: true }).click();

      const filterPills = MetricsViewer.getAllFilterPills(page);
      await expect(filterPills).toHaveCount(1);
      await expect(filterPills.first()).toContainText(SEGMENT_NAME);

      await expectUnstructuredSnowplowEvent({
        event: "metrics_viewer_filter_added",
        triggered_from: "metric_filter",
      });

      // removing the segment pill removes the filter
      await MetricsViewer.getAllFilterPills(page)
        .nth(0)
        .getByLabel("Remove", { exact: true })
        .click();

      await expect(MetricsViewer.getAllFilterPills(page)).toHaveCount(0);

      await expectUnstructuredSnowplowEvent({
        event: "metrics_viewer_filter_removed",
        triggered_from: "metric_filter",
      });
    });
  });

  test.describe("Drill through", () => {
    test.beforeEach(async ({ page }) => {
      await MetricsViewer.goToViewer(page);
      await addMetricInputSequence(page, [{ nameOrPath: "Count of orders" }]);
      await addMetricInputSequence(page, [
        ",",
        { nameOrPath: "Count of orders" },
        "+",
        { nameOrPath: testMeasurePath },
      ]);
    });

    test("should drill into more granular time dimensions on timeseries chart", async ({
      page,
    }) => {
      await expect(
        MetricsViewer.getMetricControls(page).getByRole("button", {
          name: /by month/,
        }),
      ).toBeVisible();
      await ensureChartIsActive(page);
      const circle = cartesianChartCircles(page).nth(4);
      await expect(circle).toBeVisible();
      await circle.click({ force: true });
      const drill = popover(page).getByText("See this month by week", {
        exact: true,
      });
      await expect(drill).toBeVisible();
      await drill.click({ force: true });

      await expect(
        MetricsViewer.getMetricControls(page).getByRole("button", {
          name: /by week/,
        }),
      ).toBeVisible();
      await expect
        .poll(() => MetricsViewer.getMetricVisualizationDataPoints(page).count())
        .toBeGreaterThanOrEqual(10);
    });

    test("should allow me to do brush style time range filtering", async ({
      page,
    }) => {
      await ensureChartIsActive(page);
      await applyBrush(page, 100, 250);
      const visualization = MetricsViewer.getMetricVisualization(page);
      await expect(visualization.getByText(/June/)).toBeVisible();
      await expect(visualization.getByText(/July/)).toBeVisible();
      await expect(visualization.getByText(/August/)).toBeVisible();
      await expect(visualization.getByText(/September/)).toBeVisible();
      await expect(visualization.getByText(/October/)).toBeVisible();
      await expect(visualization.getByText(/November/)).toBeVisible();
    });
  });

  test.describe("Dimension filters", () => {
    test.beforeEach(async ({ page }) => {
      await MetricsViewer.goToViewer(page);
    });

    test("should not show 'No compatible dimensions' after deleting and retyping an expression with metrics in a different order (UXW-3748)", async ({
      page,
    }) => {
      // Create expression: Count of orders + Count of products
      await addMetricInputSequence(page, [
        { nameOrPath: "Count of orders" },
        "+",
        { nameOrPath: "Count of products" },
      ]);
      await expect(MetricsViewer.getMetricVisualization(page)).toBeVisible();

      // Re-enter the formula editor, delete the whole expression, retype
      // with metrics in the opposite order
      await addMetricInputSequence(
        page,
        [
          { nameOrPath: "Count of products" },
          "+",
          { nameOrPath: "Count of orders" },
        ],
        { clearInput: true },
      );

      // Expression should run without 'No compatible dimensions' error
      await expect(MetricsViewer.getMetricVisualization(page)).toBeVisible();
    });
  });

  test.describe("Responsive viewer controls", () => {
    const setupTimeControls = async (page: Page, width: number) => {
      await page.setViewportSize({ width: 1280, height: 900 });
      await MetricsViewer.goToViewer(page);
      await MetricsViewer.searchInput(page);
      await page.keyboard.press("End");
      await page.keyboard.type(", Count of orders", { delay: 20 });
      await miniPicker(page)
        .getByRole("menuitem")
        .getByText(/^Count of orders$/)
        .first()
        .click();
      const dataset = waitForMetricDataset(page);
      await runFormula(page);
      await dataset;
      await page.setViewportSize({ width, height: 900 });
    };

    test("shows compact controls at phone widths and keeps them interactive", async ({
      page,
    }) => {
      await setupTimeControls(page, 480);

      const controls = MetricsViewer.getMetricControls(page);
      await expect(
        controls.getByTestId("metrics-viewer-compact-chart-controls"),
      ).toBeVisible();
      await expect(
        controls.getByTestId("metrics-viewer-x-axis-controls"),
      ).toBeVisible();

      await controls
        .getByTestId("metrics-viewer-compact-chart-controls")
        .click();
      await expect(
        popover(page).getByText("Visualization", { exact: true }),
      ).toBeVisible();
      await popover(page)
        .getByRole("menuitem", { name: "Bar chart", exact: true })
        .click();
      await MetricsViewer.assertVizType(page, "Bar");

      await controls.getByTestId("metrics-viewer-x-axis-controls").click();
      const changeColumn = popover(page).getByRole("button", {
        name: "Change column",
        exact: true,
      });
      await expect(changeColumn).toBeVisible();
      await expect(changeColumn).toContainText("Time");
      await expect(
        popover(page).getByRole("button", { name: /by month/i }),
      ).toBeVisible();
      await changeColumn.click();
      await expect(MetricsViewer.dimensionPickerSidebar(page)).toBeVisible();
      await expect(popover(page)).toHaveCount(0);
      await assertMetricControlsDoNotOverflowViewport(page);
    });
  });

  test.describe("Metric math", () => {
    test.beforeEach(async ({ page }) => {
      await MetricsViewer.goToViewer(page);
      await addMetric(page, "Count of orders");
    });

    test("should apply filters and dimensions to individual metric instances within expressions", async ({
      page,
    }) => {
      await addMetricInputSequence(
        page,
        [
          { nameOrPath: "Count of orders" },
          "+",
          { nameOrPath: "Count of orders" },
        ],
        { clearInput: true },
      );

      await selectDimensionBreakout(page, "Category");

      await MetricsViewer.getFilterButton(page).click();
      await expect(
        popover(page).getByRole("button", { name: /Count of orders/ }),
      ).toHaveCount(2);
      await popover(page)
        .getByRole("button", { name: /Count of orders/ })
        .nth(0)
        .click();
      await popover(page).getByText("Category", { exact: true }).click();
      await popover(page).getByText("Doohickey", { exact: true }).click();
      const firstFilterDataset = waitForMetricDataset(page);
      await popover(page)
        .getByRole("button", { name: "Add filter", exact: true })
        .click();
      await firstFilterDataset;

      await MetricsViewer.getFilterButton(page).click();
      await popover(page)
        .getByRole("button", { name: /Count of orders/ })
        .nth(1)
        .click();
      await popover(page).getByText("Category", { exact: true }).click();
      await popover(page).getByText("Doohickey", { exact: true }).click();
      const secondFilterDataset = waitForMetricDataset(page);
      await popover(page)
        .getByRole("button", { name: "Add filter", exact: true })
        .click();
      await secondFilterDataset;

      const assertMetricMath = async () => {
        // breakout is applied
        await expect(MetricsViewer.getColumnPickerButton(page)).toContainText(
          "Category",
        );
        // filter pills are in place and show the badge indicating the unique
        // metric instance
        await expect(MetricsViewer.getAllFilterPills(page)).toHaveCount(2);
        await expect(
          MetricsViewer.getAllFilterPills(page)
            .nth(0)
            .getByText("2", { exact: true }),
        ).toHaveCount(0);
        await expect(
          MetricsViewer.getAllFilterPills(page)
            .nth(1)
            .getByText("2", { exact: true }),
        ).toBeVisible();

        // dimension filter is applied
        await expect
          .poll(() =>
            MetricsViewer.getMetricVisualizationDataPoints(page).count(),
          )
          .toBeLessThanOrEqual(60);
        // metric math expression still renders with the applied state
        await expect(MetricsViewer.getMetricVisualization(page)).toBeVisible();
      };
      await assertMetricMath();

      // refresh and assert again
      const reloadDataset = waitForMetricDataset(page);
      await page.reload();
      await reloadDataset;
      await assertMetricMath();

      // edit formula and assert again
      await MetricsViewer.searchInput(page);
      await page.keyboard.press("End");
      await page.keyboard.type(" + 0", { delay: 20 });
      const editDataset = waitForMetricDataset(page);
      await runFormula(page);
      await editDataset;
      await assertMetricMath();
    });

    test("should handle metrics with numeric names in expressions", async ({
      page,
      mb,
    }) => {
      const NUMERIC_METRIC_NAME = "123";
      await createMetric(mb.api, {
        name: NUMERIC_METRIC_NAME,
        type: "metric",
        description: "A metric with a numeric name",
        query: {
          "source-table": ORDERS_ID,
          aggregation: [["count"]],
        },
        display: "scalar",
      });

      // Sum metric '123' with itself — both selected from dropdown
      await addMetricInputSequence(
        page,
        [
          { nameOrPath: ["Our analytics", NUMERIC_METRIC_NAME] },
          "+",
          { nameOrPath: ["Our analytics", NUMERIC_METRIC_NAME] },
        ],
        { clearInput: true },
      );
      await expect(MetricsViewer.getMetricVisualization(page)).toBeVisible();

      // Append literal number 123 — typed without selecting from dropdown
      await addMetricInputSequence(page, [
        "+",
        { nameOrPath: ["Our analytics", NUMERIC_METRIC_NAME] },
      ]);

      await expect(MetricsViewer.getMetricVisualization(page)).toBeVisible();

      // Append metric '123' as standalone — selected from dropdown
      await addMetricInputSequence(page, [
        ",",
        { nameOrPath: ["Our analytics", NUMERIC_METRIC_NAME] },
      ]);
      await expect(
        MetricsViewer.getAllMetricVisualizations(page),
      ).toHaveCount(2);

      // Verify final pill layout
      await expect(MetricsViewer.searchBarPills(page)).toHaveCount(2);
      await expect(MetricsViewer.searchBarPills(page).nth(0)).toContainText(
        "123 + 123",
      );
      await expect(MetricsViewer.searchBarPills(page).nth(1)).toContainText(
        "123",
      );
    });
  });
});

test.describe("scenarios > metrics > explorer > BigInt filters", () => {
  test("should filter on BigInt values", async ({ page, mb }) => {
    // Needs the writable postgres QA container and the postgres-writable
    // snapshot.
    test.skip(
      !process.env.QA_DB_ENABLED && !process.env.PW_QA_DB_ENABLED,
      "Requires the writable postgres QA database and its postgres-writable snapshot (set QA_DB_ENABLED)",
    );

    const DECIMAL_PK_TABLE_NAME = "decimal_pk_table";
    const METRIC_NAME = "Count of decimal_pk_table";

    await mb.restore("postgres-writable");
    await mb.signInAsAdmin();
    await resetDecimalPkTable();
    await resyncDatabase(mb.api, {
      dbId: WRITABLE_DB_ID,
      tables: [DECIMAL_PK_TABLE_NAME],
    });

    const tableId = await getTableId(mb.api, { name: DECIMAL_PK_TABLE_NAME });
    await createMetric(mb.api, {
      name: METRIC_NAME,
      type: "metric",
      description: "A metric",
      query: {
        "source-table": tableId,
        aggregation: [["count"]],
      },
      database: WRITABLE_DB_ID,
      display: "scalar",
    });
    await MetricsViewer.goToViewer(page);
    await addMetric(page, METRIC_NAME);
    await MetricsViewer.getFilterButton(page).click();
    await popover(page).getByText("ID", { exact: true }).click();
    await popover(page)
      .getByPlaceholder("Enter an ID", { exact: true })
      .pressSequentially("9223372036854775808");
    await popover(page)
      .getByRole("button", { name: "Add filter", exact: true })
      .click();
    const visualization = MetricsViewer.getMetricVisualization(page);
    await expect(visualization).toContainText("Positive");
    await expect(visualization).not.toContainText("Negative");
    await expect(visualization).not.toContainText("Zero");
  });
});
