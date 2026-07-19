/**
 * Helpers for the models/reproductions-2 spec port — `H` helpers not yet in
 * the shared modules:
 * - e2e-ui-elements-helpers.js (main, waitForLoaderToBeRemoved)
 * - e2e-models-metadata-helpers.js (datasetEditBar, saveMetadataChanges)
 * - e2e-misc-helpers.js (runButtonInOverlay, visitModel hasDataAccess: false)
 * - e2e-ad-hoc-question-helpers.js (startNewModel, startNewNativeModel)
 *
 * Kept in its own module (parallel porting agents don't touch shared files);
 * fold into models.ts / ui.ts on the consolidation pass.
 */
import type { Locator, Page, Response } from "@playwright/test";

import { expect } from "./fixtures";
import { adhocQuestionHash } from "./native-editor";
import { SAMPLE_DB_ID } from "./sample-data";
import { icon, popover } from "./ui";

/**
 * Open the question-actions ellipsis menu and click a menu item by accessible
 * name. Unlike the shared openQuestionActions (exact text match), this matches
 * on the menuitem role so it tolerates the metadata-completeness badge the app
 * appends to "Edit metadata" (e.g. "Edit metadata 33%") — an exact getByText
 * never hits that node.
 */
export async function openQuestionActionsItem(
  page: Page,
  name: string | RegExp,
) {
  await icon(page.getByTestId("qb-header-action-panel"), "ellipsis").click();
  await popover(page).getByRole("menuitem", { name }).click();
}

/** Port of H.main() (e2e-ui-elements-helpers.js): cy.get("main"). */
export function main(page: Page): Locator {
  return page.locator("main");
}

/** Port of H.waitForLoaderToBeRemoved: the loading-indicator is gone. */
export async function waitForLoaderToBeRemoved(page: Page) {
  await expect(page.getByTestId("loading-indicator")).toHaveCount(0);
}

/** Port of H.datasetEditBar (e2e-models-metadata-helpers.js). */
export function datasetEditBar(page: Page): Locator {
  return page.getByTestId("dataset-edit-bar");
}

/** Port of H.runButtonInOverlay: the run button inside the run-button-overlay. */
export function runButtonInOverlay(page: Page): Locator {
  return page.getByTestId("run-button-overlay").getByTestId("run-button");
}

/**
 * Port of H.saveMetadataChanges: click "Save changes" in the dataset edit bar,
 * wait for the model-metadata PUT and the resulting dataset re-run, and assert
 * the edit bar closed.
 */
export async function saveMetadataChanges(page: Page) {
  const updateModelMetadata = page.waitForResponse(
    (response) =>
      response.request().method() === "PUT" &&
      /^\/api\/card\/\d+$/.test(new URL(response.url()).pathname),
  );
  const dataset = page.waitForResponse(
    (response) =>
      response.request().method() === "POST" &&
      new URL(response.url()).pathname === "/api/dataset",
  );
  await datasetEditBar(page)
    .getByRole("button", { name: "Save changes", exact: true })
    .click();
  await updateModelMetadata;
  await expect(datasetEditBar(page)).toHaveCount(0);
  await dataset;
}

/**
 * Port of H.startNewModel: visit the ad-hoc URL that clicking "New" > "Model" >
 * "Use the notebook editor" generates.
 */
export async function startNewModel(page: Page) {
  const card = {
    type: "model",
    creationType: "custom_question",
    dataset_query: {
      database: null,
      query: { "source-table": null },
      type: "query",
    },
    visualization_settings: {},
  };
  await page.goto(`/model/query#${adhocQuestionHash(card)}`);
}

/**
 * Port of H.startNewNativeModel: visit the ad-hoc URL that clicking "New" >
 * "Model" > "Use a native query" generates.
 */
export async function startNewNativeModel(
  page: Page,
  {
    database = SAMPLE_DB_ID,
    query = "",
    collection_id = null,
    display = "scalar",
    visualization_settings = {},
  }: {
    database?: number;
    query?: string;
    collection_id?: number | null;
    display?: string;
    visualization_settings?: Record<string, unknown>;
  } = {},
) {
  const card = {
    collection_id,
    dataset_query: {
      database,
      native: { query, "template-tags": {} },
      type: "native",
    },
    display,
    parameters: [],
    visualization_settings,
    type: "model",
  };
  await page.goto(`/model/query#${adhocQuestionHash(card)}`);
}

/**
 * Port of H.visitModel(id, { hasDataAccess: false }): visit a model whose
 * viewer lacks data permissions, so the model runs via the card-query endpoint
 * (POST /api/card/:id/query) rather than /api/dataset.
 */
export async function visitModelNoDataAccess(
  page: Page,
  id: number,
): Promise<void> {
  const cardQuery = page.waitForResponse(
    (response) =>
      response.request().method() === "POST" &&
      new RegExp(`/${id}/query$`).test(new URL(response.url()).pathname),
  );
  await page.goto(`/model/${id}`);
  await cardQuery;
}
