/**
 * Helpers for the metrics-editing spec (create/edit a metric in the notebook
 * editor). Spec-local functions from
 * e2e/test/scenarios/metrics/metrics-editing.cy.spec.js plus the MetricPage
 * query-editor surface (queryEditor / saveButton / cancelButton) that the
 * shared metrics.ts port doesn't cover.
 *
 * New helpers live here (not in the shared support/*.ts files, which parallel
 * porting agents edit); everything else is imported read-only. Fold into
 * metrics.ts at consolidation.
 */
import type { Locator, Page } from "@playwright/test";
import { expect } from "@playwright/test";

import { echartsContainer } from "./charts";
import { MetricPage, changeBinningForDimension } from "./metrics";
import { getNotebookStep } from "./notebook";
import { modal, popover } from "./ui";

/**
 * The metric query-editor surface (e2e-metric-page-helpers.ts MetricPage) not
 * covered by the shared metrics.ts port.
 */
export const MetricEditor = {
  queryEditor: (page: Page): Locator => page.getByTestId("metric-query-editor"),
  saveButton: (page: Page): Locator =>
    MetricEditor.queryEditor(page).getByRole("button", {
      name: "Save",
      exact: true,
    }),
  cancelButton: (page: Page): Locator =>
    MetricEditor.queryEditor(page).getByRole("button", {
      name: "Cancel",
      exact: true,
    }),
  /** MetricPage.aboutTab: MetricPage.header().findByText("About"). */
  aboutTab: (page: Page): Locator =>
    MetricPage.header(page).getByText("About", { exact: true }),
};

/** Port of H.runButtonInOverlay: the run button inside the run-button-overlay. */
export function runButtonInOverlay(page: Page): Locator {
  return page.getByTestId("run-button-overlay").getByTestId("run-button");
}

/**
 * Port of the spec-local getActionButton: the notebook action button by title,
 * within `scope` (default: page). Some call sites wrap this in a notebook step
 * (getNotebookStep("data").within(...)) — pass that step as the scope, since a
 * page-wide match hits the "Custom column" button in both the data and
 * summarize steps.
 */
export function getActionButton(
  scope: Page | Locator,
  title: string,
): Locator {
  return scope
    .getByTestId("action-buttons")
    .getByRole("button", { name: title, exact: true });
}

/**
 * Port of the spec-local getPlusButton: the last notebook-cell-item (the "+"
 * add button) within `scope` (a notebook step or sub-step locator).
 */
function getPlusButton(scope: Page | Locator): Locator {
  return scope.getByTestId("notebook-cell-item").last();
}

/** Port of startNewMetric (e2e-ad-hoc-question-helpers.js): visit /metric/new. */
export async function startNewMetric(page: Page) {
  await page.goto("/metric/new");
}

/** Port of the spec-local startNewMetricWithTable. */
export async function startNewMetricWithTable(
  page: Page,
  database: string,
  table: string,
) {
  await startNewMetric(page);
  await expect(MetricEditor.queryEditor(page)).toBeVisible();
  const picker = page.getByTestId("mini-picker");
  await picker.getByText(database, { exact: true }).click();
  await picker.getByText(table, { exact: true }).click();
}

/** Port of the spec-local startNewMetricWithSavedItem. */
export async function startNewMetricWithSavedItem(
  page: Page,
  collection: string,
  name: string,
) {
  await startNewMetric(page);
  await expect(MetricEditor.queryEditor(page)).toBeVisible();
  const picker = page.getByTestId("mini-picker");
  await picker.getByText(collection, { exact: true }).click();
  await picker.getByText(name, { exact: true }).click();
}

/**
 * Port of the spec-local saveNewMetric: click Save, confirm the modal, wait for
 * POST /api/card. Register the response wait before the click that triggers it.
 */
export async function saveNewMetric(page: Page, { name }: { name?: string } = {}) {
  const createCard = page.waitForResponse(
    (response) =>
      response.request().method() === "POST" &&
      new URL(response.url()).pathname === "/api/card",
  );
  await MetricEditor.saveButton(page).click();
  const dialog = modal(page);
  await expect(dialog.getByText("Save your metric", { exact: true })).toBeVisible();
  if (name) {
    await dialog.getByLabel("Name").fill(name);
  }
  await dialog.getByRole("button", { name: "Save", exact: true }).click();
  await createCard;
}

/** Port of the spec-local startNewJoin. */
export async function startNewJoin(page: Page, { stageIndex }: { stageIndex?: number } = {}) {
  await getNotebookStep(page, "data", { stage: stageIndex })
    .getByRole("button", { name: "Join data", exact: true })
    .click();
}

/** Port of the spec-local startNewCustomColumn. */
export async function startNewCustomColumn(
  page: Page,
  { stageIndex }: { stageIndex?: number } = {},
) {
  await getNotebookStep(page, "data", { stage: stageIndex })
    .getByRole("button", { name: "Custom column", exact: true })
    .click();
}

/** Port of the spec-local startNewFilter. */
export async function startNewFilter(
  page: Page,
  { stageIndex }: { stageIndex?: number } = {},
) {
  await getPlusButton(getNotebookStep(page, "filter", { stage: stageIndex })).click();
}

/** Port of the spec-local startNewAggregation. */
export async function startNewAggregation(
  page: Page,
  { stageIndex }: { stageIndex?: number } = {},
) {
  await getPlusButton(
    getNotebookStep(page, "summarize", { stage: stageIndex }).getByTestId(
      "aggregate-step",
    ),
  ).click();
}

/** Port of the spec-local startNewBreakout. */
export async function startNewBreakout(
  page: Page,
  { stageIndex }: { stageIndex?: number } = {},
) {
  await getPlusButton(
    getNotebookStep(page, "summarize", { stage: stageIndex }).getByTestId(
      "breakout-step",
    ),
  ).click();
}

/** Port of the spec-local addStringCategoryFilter. */
export async function addStringCategoryFilter(
  page: Page,
  {
    tableName,
    columnName,
    values,
  }: { tableName?: string; columnName: string; values: string[] },
) {
  await startNewFilter(page);
  const pop = popover(page);
  if (tableName) {
    await pop.getByText(tableName, { exact: true }).click();
  }
  await pop.getByText(columnName, { exact: true }).click();
  for (const value of values) {
    await pop.getByText(value, { exact: true }).click();
  }
  await pop.getByRole("button", { name: "Add filter", exact: true }).click();
}

/** Port of the spec-local addBreakout. */
export async function addBreakout(
  page: Page,
  {
    tableName,
    columnName,
    bucketName,
    stageIndex,
  }: {
    tableName?: string;
    columnName: string;
    bucketName?: string;
    stageIndex?: number;
  },
) {
  await startNewBreakout(page, { stageIndex });
  if (tableName) {
    await popover(page).getByText(tableName, { exact: true }).click();
  }
  if (bucketName) {
    await changeBinningForDimension(page, {
      name: columnName,
      fromBinning: "by month",
      toBinning: bucketName,
    });
  } else {
    await popover(page).getByText(columnName, { exact: true }).click();
  }
}

/** Port of the spec-local verifyScalarValue. */
export async function verifyScalarValue(page: Page, value: string) {
  const scalar = page.getByTestId("scalar-value");
  await expect(scalar).toHaveText(value);
  await expect(scalar).toBeVisible();
}

/** Port of the spec-local verifyLineAreaBarChart. */
export async function verifyLineAreaBarChart(
  page: Page,
  { xAxis, yAxis }: { xAxis: string; yAxis: string },
) {
  const chart = echartsContainer(page);
  await expect(chart.getByText(yAxis, { exact: true })).toBeVisible();
  await expect(chart.getByText(xAxis, { exact: true })).toBeVisible();
}
