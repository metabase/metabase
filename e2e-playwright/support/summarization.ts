/**
 * Helpers for the summarization spec port — the `H` pieces not yet in the
 * shared support modules:
 *  - api/createTestQuery.ts (POST /api/testing/query)
 *  - api/createCard.ts (POST /api/card, raw dataset_query)
 *  - e2e-dimension-list-helpers.js getRemoveDimensionButton
 *  - the spec-local removeMetricFromSidebar
 *
 * Lives in its own file per PORTING.md rule 9 (shared modules are edited by
 * parallel porting agents). Everything else is imported read-only:
 *  - summarize / waitForDataset from ./models
 *  - getDimensionByName from ./nested-questions
 *  - changeBinningForDimension / openTable from ./binning
 *  - enterCustomColumnDetails / visualize / expressionEditorWidget from ./notebook
 *  - the CustomExpressionEditor assertions from ./custom-column-3
 */
import type { Locator, Page } from "@playwright/test";

import type { MetabaseApi } from "./api";
import { expect } from "./fixtures";
import { waitForDataset } from "./models";
import { getDimensionByName } from "./nested-questions";
import { rightSidebar } from "./question-saved";
import { icon } from "./ui";

/**
 * Port of H.createTestQuery (api/createTestQuery.ts): POST the MBQL5 test-query
 * spec to /api/testing/query and resolve with the compiled dataset_query.
 */
export async function createTestQuery(
  api: MetabaseApi,
  querySpec: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const response = await api.post("/api/testing/query", querySpec);
  return (await response.json()) as Record<string, unknown>;
}

/**
 * Port of H.createCard (api/createCard.ts): POST /api/card with a raw
 * dataset_query (the shared factories.createQuestion derives the query from a
 * `query` object and can't take a pre-compiled dataset_query).
 */
export async function createCard(
  api: MetabaseApi,
  details: {
    name?: string;
    display?: string;
    visualization_settings?: Record<string, unknown>;
    dataset_query: Record<string, unknown>;
    [key: string]: unknown;
  },
): Promise<{ id: number }> {
  const {
    name = "Test card",
    display = "table",
    visualization_settings = {},
    ...rest
  } = details;
  const response = await api.post("/api/card", {
    name,
    display,
    visualization_settings,
    ...rest,
  });
  return (await response.json()) as { id: number };
}

/**
 * Port of H.getRemoveDimensionButton: the "Remove dimension" button only
 * renders on hover, so hover the row first (the Cypress helper realHovers).
 */
export async function getRemoveDimensionButton(
  page: Page,
  { name, index = 0 }: { name: string; index?: number },
): Promise<Locator> {
  const dimension = getDimensionByName(page, { name, index });
  await dimension.hover();
  return dimension.getByLabel("Remove dimension", { exact: true });
}

/**
 * Port of the spec-local `.click({ position: "left" })` on a dimension row —
 * clicking the left edge selects the dimension without hitting the binning /
 * temporal-bucket button on the right. Mirrors binning-reproductions.ts's
 * clickBreakoutOptionLeft coordinate approach.
 */
export async function clickDimensionLeft(dimension: Locator) {
  const box = await dimension.boundingBox();
  if (!box) {
    throw new Error("clickDimensionLeft: dimension has no bounding box");
  }
  await dimension.click({ position: { x: 6, y: box.height / 2 } });
}

/**
 * Port of the spec-local removeMetricFromSidebar: click the close icon on a
 * metric in the summarize right-sidebar, wait for the re-query, and confirm the
 * metric is gone. The Cypress original registers a POST /api/dataset intercept
 * (interceptIfNotPreviouslyDefined) — here we register the wait before the
 * click per PORTING.md rule 2.
 */
export async function removeMetricFromSidebar(page: Page, metricName: string) {
  const sidebar = rightSidebar(page);
  const metric = sidebar.getByLabel(metricName, { exact: true });
  const closeIcon = icon(metric, "close");
  await expect(closeIcon).toBeVisible();

  const dataset = waitForDataset(page);
  await closeIcon.click();
  await dataset;

  await expect(sidebar.getByLabel(metricName, { exact: true })).toHaveCount(0);
}
