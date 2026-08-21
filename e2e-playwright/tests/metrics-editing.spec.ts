/**
 * Playwright port of e2e/test/scenarios/metrics/metrics-editing.cy.spec.js
 *
 * Create/edit a metric in the notebook editor: aggregation + filter + breakout,
 * save, verify the metric question.
 */
import { ORDERS_MODEL_ID } from "../support/organization";

import { hovercard } from "../support/filter-bulk";
import { test, expect } from "../support/fixtures";
import {
  MetricEditor,
  addBreakout,
  addStringCategoryFilter,
  getActionButton,
  runButtonInOverlay,
  saveNewMetric,
  startNewAggregation,
  startNewCustomColumn,
  startNewFilter,
  startNewJoin,
  startNewMetric,
  startNewMetricWithSavedItem,
  startNewMetricWithTable,
  verifyLineAreaBarChart,
  verifyScalarValue,
} from "../support/metrics-editing";
import { visitMetric } from "../support/metrics";
import {
  enterCustomColumnDetails,
  getNotebookStep,
  miniPicker,
  entityPickerModal,
  startNewQuestion,
  visualize,
} from "../support/notebook";
import { miniPickerBrowseAll } from "../support/joins";
import { SAMPLE_DATABASE } from "../support/sample-data";
import { modal, popover } from "../support/ui";
import { findDisplayValue } from "../support/pivot-tables";
import {
  expectUnstructuredSnowplowEvent,
  resetSnowplow,
} from "../support/snowplow";

const { ORDERS_ID, ORDERS, PRODUCTS_ID } = SAMPLE_DATABASE;

const ORDERS_SCALAR_METRIC = {
  name: "Orders metric",
  type: "metric",
  query: {
    "source-table": ORDERS_ID,
    aggregation: [["count"]],
  },
  display: "scalar",
};

const ORDERS_SCALAR_MODEL_METRIC = {
  name: "Orders model metric",
  type: "metric",
  query: {
    "source-table": `card__${ORDERS_MODEL_ID}`,
    aggregation: [["count"]],
  },
  display: "scalar",
};

const ORDERS_SCALAR_FILTER_METRIC = {
  name: "Orders metric with filter",
  type: "metric",
  description: "This is a description _with markdown_",
  query: {
    "source-table": ORDERS_ID,
    filter: [">", ["field", ORDERS.TOTAL, null], 100],
    aggregation: [["count"]],
  },
  display: "scalar",
};

const PRODUCTS_SCALAR_METRIC = {
  name: "Products metric",
  type: "metric",
  query: {
    "source-table": PRODUCTS_ID,
    aggregation: [["count"]],
  },
  display: "scalar",
};

test.describe("scenarios > metrics > editing", () => {
  test.beforeEach(async ({ mb }) => {
    await mb.restore();
    await resetSnowplow(mb);
    await mb.signInAsNormalUser();
  });

  test.describe("organization", () => {
    test("should be able to rename a metric", async ({ page, mb }) => {
      const card = await mb.api.createQuestion(ORDERS_SCALAR_METRIC);
      await visitMetric(page, card.id);

      const updateCard = page.waitForResponse(
        (response) =>
          response.request().method() === "PUT" &&
          /^\/api\/card\/[^/]+$/.test(new URL(response.url()).pathname),
      );
      const nameInput = await findDisplayValue(
        page.getByTestId("metric-about-page"),
        ORDERS_SCALAR_METRIC.name,
      );
      await nameInput.click();
      await page.keyboard.press("ControlOrMeta+A");
      await page.keyboard.press("Backspace");
      await nameInput.pressSequentially("New metric name");
      await nameInput.press("Enter");
      await updateCard;

      await expect(
        await findDisplayValue(
          page.getByTestId("metric-about-page"),
          "New metric name",
        ),
      ).toBeVisible();
    });

    test("should be able to change the query definition of a metric", async ({
      page,
      mb,
    }) => {
      const card = await mb.api.createQuestion(ORDERS_SCALAR_METRIC);
      await page.goto(`/metric/${card.id}/query`);
      await expect(MetricEditor.queryEditor(page)).toBeVisible();
      await addBreakout(page, {
        tableName: "Product",
        columnName: "Created At",
      });
      await MetricEditor.saveButton(page).click();
      await expect(MetricEditor.saveButton(page)).toHaveCount(0);
      await MetricEditor.aboutTab(page).click();
      await verifyLineAreaBarChart(page, {
        xAxis: "Product → Created At: Month",
        yAxis: "Count",
      });
    });

    test("should pin new metrics automatically", async ({ page, mb }) => {
      await page.goto("/browse/metrics");
      await page
        .getByTestId("browse-metrics-header")
        .getByLabel("Create a new metric")
        .click();

      await expectUnstructuredSnowplowEvent(mb, {
        event: "metric_create_started",
        triggered_from: "browse_metrics",
      });

      await expect(MetricEditor.queryEditor(page)).toBeVisible();
      await miniPicker(page).getByText("Sample Database", { exact: true }).click();
      await miniPicker(page).getByText("Orders", { exact: true }).click();
      await saveNewMetric(page);

      await expectUnstructuredSnowplowEvent(mb, {
        event: "metric_created",
        triggered_from: "main_app",
        result: "success",
      });

      await expect(page.getByTestId("metric-about-page")).toBeVisible();
      await page
        .getByTestId("metric-header")
        .getByText("Our analytics", { exact: true })
        .click();

      const pinned = page.getByTestId("pinned-items");
      await expect(
        pinned.getByRole("heading", { name: "Metrics", exact: true }),
      ).toBeVisible();
      await expect(pinned.getByTestId("scalar-value")).toHaveText("18,760");
    });

    test("should not crash when cancelling creation or editing of a metric (metabase#48024)", async ({
      page,
      mb,
    }) => {
      // cancel new metric creation
      await startNewMetricWithTable(page, "Sample Database", "Orders");
      await MetricEditor.cancelButton(page).click();

      // cancel editing an existing metric
      const card = await mb.api.createQuestion(ORDERS_SCALAR_METRIC);
      await page.goto(`/metric/${card.id}/query`);
      await expect(MetricEditor.queryEditor(page)).toBeVisible();
      await addBreakout(page, {
        tableName: "Product",
        columnName: "Created At",
      });
      await MetricEditor.cancelButton(page).click();
      await expect(
        getNotebookStep(page, "summarize").getByText("Count", { exact: true }),
      ).toBeVisible();
    });
  });

  test.describe("data source", () => {
    test("should create a metric based on a table", async ({ page }) => {
      await startNewMetricWithTable(page, "Sample Database", "Orders");
      await addStringCategoryFilter(page, {
        tableName: "Product",
        columnName: "Category",
        values: ["Gadget"],
      });
      await saveNewMetric(page);
      await verifyScalarValue(page, "4,939");
    });

    test("should not allow to create a multi-stage metric", async ({ page }) => {
      await startNewMetricWithSavedItem(page, "Our analytics", "Orders Model");
      await expect(getActionButton(page, "Summarize")).toHaveCount(0);
    });

    test("should allow to run the query from the metric empty state", async ({
      page,
    }) => {
      await startNewMetricWithTable(page, "Sample Database", "Orders");
      const dataset = page.waitForResponse(
        (response) =>
          response.request().method() === "POST" &&
          new URL(response.url()).pathname === "/api/dataset",
      );
      await runButtonInOverlay(page).click();
      await dataset;
      await verifyScalarValue(page, "18,760");
    });
  });

  test.describe("joins", () => {
    test("should join a table", async ({ page }) => {
      await startNewMetricWithTable(page, "Sample Database", "Products");
      await startNewJoin(page);
      await miniPicker(page)
        .getByText("Sample Database", { exact: true })
        .click();
      await miniPicker(page).getByText("Orders", { exact: true }).click();
      await startNewFilter(page);
      {
        const pop = popover(page);
        await pop.getByText("User", { exact: true }).click();
        await pop.getByText("State", { exact: true }).click();
        await pop.getByText("CA", { exact: true }).click();
        await pop.getByRole("button", { name: "Add filter", exact: true }).click();
      }
      await saveNewMetric(page);
      await verifyScalarValue(page, "613");
    });

    test("should not be possible to join a metric", async ({ page, mb }) => {
      await mb.api.createQuestion(ORDERS_SCALAR_METRIC);
      await startNewMetricWithTable(page, "Sample Database", "Orders");
      await startNewJoin(page);
      await miniPicker(page).getByText("Our analytics", { exact: true }).click();
      await expect(
        miniPicker(page).getByText("Orders", { exact: true }),
      ).toBeVisible();
      await expect(
        miniPicker(page).getByText(ORDERS_SCALAR_METRIC.name, { exact: true }),
      ).toHaveCount(0);
      await miniPicker(page).getByText("Our analytics", { exact: true }).click();

      await miniPickerBrowseAll(page).click();
      await entityPickerModal(page)
        .getByText("Sample Database", { exact: true })
        .click();
      await expect(
        entityPickerModal(page).getByText("Orders", { exact: true }),
      ).toBeVisible();
      await expect(
        entityPickerModal(page).getByText(ORDERS_SCALAR_METRIC.name, {
          exact: true,
        }),
      ).toHaveCount(0);
    });

    test("should be possible to join data on the first stage of a metric-based query", async ({
      page,
      mb,
    }) => {
      await mb.api.createQuestion(ORDERS_SCALAR_METRIC);
      await startNewQuestion(page);
      await miniPicker(page).getByText("Our analytics", { exact: true }).click();
      await miniPicker(page)
        .getByText(ORDERS_SCALAR_METRIC.name, { exact: true })
        .click();
      const dataStep = getNotebookStep(page, "data");
      await expect(getActionButton(dataStep, "Custom column")).toBeVisible();
      await expect(getActionButton(dataStep, "Join data")).toBeVisible();
    });
  });

  test.describe("custom columns", () => {
    test("should be able to use custom columns and implicitly joinable columns in metric queries (metabase#42360)", async ({
      page,
    }) => {
      // custom column from same table
      await startNewMetricWithTable(page, "Sample Database", "Orders");
      await startNewCustomColumn(page);
      await enterCustomColumnDetails(page, {
        formula: "[Total] / 2",
        name: "Total2",
      });
      await popover(page).getByRole("button", { name: "Done", exact: true }).click();
      await getNotebookStep(page, "summarize")
        .getByText("Count", { exact: true })
        .click();
      await popover(page).getByText("Sum of ...", { exact: true }).click();
      await popover(page).getByText("Total2", { exact: true }).click();
      await saveNewMetric(page);
      await verifyScalarValue(page, "755,310.84");

      // custom column from implicitly joined table
      await startNewMetricWithTable(page, "Sample Database", "Orders");
      await startNewCustomColumn(page);
      await enterCustomColumnDetails(page, {
        formula: "[Product → Price] * 2",
        name: "Price2",
      });
      await popover(page).getByRole("button", { name: "Done", exact: true }).click();
      await getNotebookStep(page, "summarize")
        .getByText("Count", { exact: true })
        .click();
      await popover(page).getByText("Average of ...", { exact: true }).click();
      await popover(page).getByText("Price2", { exact: true }).click();
      await saveNewMetric(page);
      await verifyScalarValue(page, "111.38");
    });
  });

  test.describe("breakouts", () => {
    test("should create a timeseries metric", async ({ page }) => {
      await startNewMetricWithTable(page, "Sample Database", "Orders");
      await getNotebookStep(page, "summarize")
        .getByText("Count", { exact: true })
        .click();
      await popover(page).getByText("Sum of ...", { exact: true }).click();
      await popover(page).getByText("Total", { exact: true }).click();
      await addBreakout(page, { columnName: "Created At" });
      await saveNewMetric(page);
      await verifyLineAreaBarChart(page, {
        xAxis: "Created At: Month",
        yAxis: "Sum of Total",
      });
    });
  });

  test.describe("aggregations", () => {
    test("should create a metric with a custom aggregation expression based on 1 metric", async ({
      page,
      mb,
    }) => {
      await mb.api.createQuestion(ORDERS_SCALAR_METRIC);
      await startNewMetric(page);
      await expect(MetricEditor.queryEditor(page)).toBeVisible();
      const metadata = page.waitForResponse(
        (response) =>
          response.request().method() === "POST" &&
          new URL(response.url()).pathname === "/api/dataset/query_metadata",
      );
      // UPSTREAM DRIFT (re-ported): the metric used to be selectable directly
      // in the mini picker. "Hide existing metrics from the metric mini
      // picker" (#78054, a492c1091b0) removed metrics from that list, so
      // upstream now goes through "Browse all" into the entity picker modal.
      // Without this the metric name is never clickable and the
      // query_metadata wait below times out.
      await miniPickerBrowseAll(page).click();
      await entityPickerModal(page)
        .getByText("Our analytics", { exact: true })
        .click();
      await entityPickerModal(page)
        .getByText(ORDERS_SCALAR_METRIC.name, { exact: true })
        .click();
      await metadata;
      await getNotebookStep(page, "summarize")
        .getByText(ORDERS_SCALAR_METRIC.name, { exact: true })
        .click();
      await enterCustomColumnDetails(page, {
        formula: `[${ORDERS_SCALAR_METRIC.name}] / 2`,
        name: "",
        blur: true,
      });
      const update = popover(page).getByRole("button", {
        name: "Update",
        exact: true,
      });
      await expect(update).toBeEnabled();
      await update.click();
      await saveNewMetric(page);
      await verifyScalarValue(page, "9,380");
    });

    test("should have metric-specific summarize step copy", async ({
      page,
      mb,
    }) => {
      const card = await mb.api.createQuestion(ORDERS_SCALAR_METRIC);
      await page.goto(`/metric/${card.id}/query`);
      await expect(MetricEditor.queryEditor(page)).toBeVisible();

      const summarize = getNotebookStep(page, "summarize");
      await expect(summarize.getByText("Formula", { exact: true })).toBeVisible();
      await expect(
        summarize
          .getByText("Default time dimension", { exact: true })
          .filter({ visible: true }),
      ).toHaveCount(1);

      await page.setViewportSize({ width: 800, height: 600 });
      const summarizeAfter = getNotebookStep(page, "summarize");
      const formula = summarizeAfter.getByText("Formula", { exact: true });
      await expect(formula).toBeVisible();
      await formula.scrollIntoViewIfNeeded();
      await expect(
        summarizeAfter
          .getByText("Default time dimension", { exact: true })
          .filter({ visible: true }),
      ).toHaveCount(1);
    });
  });

  test.describe("compatible metrics", () => {
    test("should allow adding an aggregation based on a compatible metric for the same table in questions (metabase#42470)", async ({
      page,
      mb,
    }) => {
      await mb.api.createQuestion(ORDERS_SCALAR_METRIC);
      await mb.api.createQuestion(ORDERS_SCALAR_FILTER_METRIC);
      await mb.api.createQuestion(PRODUCTS_SCALAR_METRIC);
      await startNewQuestion(page);
      await miniPicker(page).getByText("Sample Database", { exact: true }).click();
      await miniPicker(page).getByText("Orders", { exact: true }).click();
      await startNewAggregation(page);
      const pop = popover(page);
      await pop.getByText("Metrics", { exact: true }).click();
      await expect(
        pop.getByText(ORDERS_SCALAR_METRIC.name, { exact: true }),
      ).toBeVisible();
      await expect(
        pop.getByText(ORDERS_SCALAR_FILTER_METRIC.name, { exact: true }),
      ).toBeVisible();
      await expect(
        pop.getByText(PRODUCTS_SCALAR_METRIC.name, { exact: true }),
      ).toHaveCount(0);
      await expect(
        pop.getByText(ORDERS_SCALAR_MODEL_METRIC.name, { exact: true }),
      ).toHaveCount(0);
      await pop.getByText(ORDERS_SCALAR_METRIC.name, { exact: true }).click();
      await visualize(page);
      await verifyScalarValue(page, "18,760");
    });

    test("should for searching for metrics", async ({ page, mb }) => {
      await mb.api.createQuestion(ORDERS_SCALAR_METRIC);
      await mb.api.createQuestion(ORDERS_SCALAR_FILTER_METRIC);
      await mb.api.createQuestion(PRODUCTS_SCALAR_METRIC);
      await startNewQuestion(page);
      await miniPicker(page).getByText("Sample Database", { exact: true }).click();
      await miniPicker(page).getByText("Orders", { exact: true }).click();
      await startNewAggregation(page);
      const pop = popover(page);
      await pop.getByPlaceholder("Find...").pressSequentially("with filter");
      await expect(pop.getByText("Metrics", { exact: true })).toBeVisible();
      await expect(
        pop.getByText(ORDERS_SCALAR_METRIC.name, { exact: true }),
      ).toHaveCount(0);
      await expect(
        pop.getByText(PRODUCTS_SCALAR_METRIC.name, { exact: true }),
      ).toHaveCount(0);
      await expect(
        pop.getByText(ORDERS_SCALAR_MODEL_METRIC.name, { exact: true }),
      ).toHaveCount(0);
      await expect(
        pop.getByText(ORDERS_SCALAR_FILTER_METRIC.name, { exact: true }),
      ).toBeVisible();
    });

    test("should show the description for metrics", async ({ page, mb }) => {
      await mb.api.createQuestion(ORDERS_SCALAR_FILTER_METRIC);
      await startNewQuestion(page);
      await miniPicker(page).getByText("Sample Database", { exact: true }).click();
      await miniPicker(page).getByText("Orders", { exact: true }).click();
      await startNewAggregation(page);
      const pop = popover(page);
      await pop.getByText("Metrics", { exact: true }).click();
      await expect(
        pop.getByText(ORDERS_SCALAR_FILTER_METRIC.name, { exact: true }),
      ).toBeVisible();
      await pop.getByText(ORDERS_SCALAR_FILTER_METRIC.name, { exact: true }).hover();
      const moreInfo = pop.getByLabel("More info", { exact: true });
      await expect(moreInfo).toBeAttached();
      await moreInfo.hover();

      // cy.contains is case-sensitive substring → regex, not exact getByText.
      await expect(
        hovercard(page).getByText(/This is a description/),
      ).toBeVisible();
      await expect(hovercard(page).getByText(/with markdown/)).toBeVisible();
    });
  });
});
