/**
 * Playwright port of e2e/test/scenarios/models/model-indexes.cy.spec.js
 *
 * Model indexed-entities: enable a PK/name index on a model, then a global
 * command-palette search on an indexed value deep-links to the model's
 * object-detail record.
 *
 * Porting notes:
 * - Cypress `@dataset` / `@modelIndexCreate` / `@modelIndexDelete` /
 *   `@cardUpdate` intercepts become waitForResponse promises registered before
 *   the triggering Save click.
 * - `@cardGet.all` length assertion (`expectCardQueries`) → a GET /api/card/:id
 *   response counter (trackCardGets), attached at test start.
 * - `H.sidebar()` = getByTestId("sidebar-right"); the Mantine index toggle is
 *   clicked via getByLabel(...).click({ force: true }) (PORTING rule 4).
 * - `H.commandPaletteSearch(q, false)` → shared commandPaletteSearch (viewAll
 *   branch unused).
 * - Freshly created model indexes populate the indexed-entity search entries
 *   out-of-band from the POST response — waitForIndexedValueSearchable polls
 *   (+force-reindex) before the palette search so it doesn't hit a permanent
 *   empty state.
 * - "Edit metadata" carries a completeness badge in the actions menu, so it's
 *   matched with a regex (substring), not an exact getByText.
 */
import { commandPaletteSearch } from "../support/filters-repros";
import { createQuestion } from "../support/factories";
import { commandPalette } from "../support/command-palette";
import { expect, test } from "../support/fixtures";
import {
  createModelIndex,
  selectModelColumn,
  trackCardGets,
  waitForIndexedValueSearchable,
} from "../support/model-indexes";
import { openQuestionActions, tableInteractive } from "../support/models";
import { waitForLoaderToBeRemoved } from "../support/models-reproductions-2";
import { SAMPLE_DATABASE } from "../support/sample-data";
import { findByDisplayValue } from "../support/filters-repros";
import { popover } from "../support/ui";

import type { Page } from "@playwright/test";

const { PRODUCTS_ID, PEOPLE_ID } = SAMPLE_DATABASE;

function sidebar(page: Page) {
  return page.getByTestId("sidebar-right");
}

/** POST /api/dataset — the "@dataset" alias. */
function waitForDataset(page: Page) {
  return page.waitForResponse(
    (response) =>
      response.request().method() === "POST" &&
      new URL(response.url()).pathname === "/api/dataset",
  );
}

function waitForModelIndexCreate(page: Page) {
  return page.waitForResponse(
    (response) =>
      response.request().method() === "POST" &&
      new URL(response.url()).pathname === "/api/model-index",
  );
}

function waitForModelIndexDelete(page: Page) {
  return page.waitForResponse(
    (response) =>
      response.request().method() === "DELETE" &&
      /^\/api\/model-index\/\d+$/.test(new URL(response.url()).pathname),
  );
}

function waitForCardUpdate(page: Page) {
  return page.waitForResponse(
    (response) =>
      response.request().method() === "PUT" &&
      /^\/api\/card\/\d+$/.test(new URL(response.url()).pathname),
  );
}

/** Port of the spec-local editTitleMetadata(). */
async function editTitleMetadata(page: Page) {
  await openQuestionActions(page);
  await popover(page).getByText(/Edit metadata/).click();
  await expect(page).toHaveURL(/\/columns/);
  await expect(
    tableInteractive(page).getByText("Title", { exact: true }).first(),
  ).toBeVisible();
  // The metadata editor auto-focuses the first column (ID) once the query
  // result lands (DatasetEditorInner focusFirstField). Clicking Title before
  // that effect fires gets silently reverted to ID, so wait it out first.
  await waitForLoaderToBeRemoved(page);
  await selectModelColumn(page, "Title");
}

/** Click the "surface individual records" index toggle in the right sidebar. */
async function toggleSurfaceIndividualRecords(page: Page) {
  await sidebar(page)
    .getByLabel(/surface individual records/i)
    .click({ force: true });
}

async function saveMetadata(page: Page) {
  await page
    .getByTestId("dataset-edit-bar")
    .getByRole("button", { name: "Save changes", exact: true })
    .click();
}

test.describe("scenarios > model indexes", () => {
  let modelId: number;

  test.beforeEach(async ({ mb }) => {
    await mb.restore();
    await mb.signInAsAdmin();

    const { id } = await createQuestion(mb.api, {
      name: "Products Model",
      query: { "source-table": PRODUCTS_ID },
      type: "model",
    });
    modelId = id;
  });

  test("should create, delete, and re-create a model index on product titles", async ({
    page,
  }) => {
    const dataset = waitForDataset(page);
    await page.goto(`/model/${modelId}`);
    await dataset;

    await editTitleMetadata(page);
    await toggleSurfaceIndividualRecords(page);

    let modelIndexCreate = waitForModelIndexCreate(page);
    await saveMetadata(page);
    let createResponse = await modelIndexCreate;
    expect(createResponse.request().postDataJSON().model_id).toBe(modelId);
    // this will likely change when this becomes an async process
    let createBody = await createResponse.json();
    expect(createBody.state).toBe("indexed");
    expect(createBody.id).toBe(1);

    await editTitleMetadata(page);
    await toggleSurfaceIndividualRecords(page);

    const modelIndexDelete = waitForModelIndexDelete(page);
    await saveMetadata(page);
    const deleteResponse = await modelIndexDelete;
    expect(new URL(deleteResponse.url()).pathname).toContain(
      "/api/model-index/1",
    );
    expect(deleteResponse.status()).toBe(200);

    const dataset2 = waitForDataset(page);
    await dataset2;

    await editTitleMetadata(page);
    await toggleSurfaceIndividualRecords(page);

    // this tests redux cache invalidation (#31407)
    modelIndexCreate = waitForModelIndexCreate(page);
    await saveMetadata(page);
    createResponse = await modelIndexCreate;
    expect(createResponse.request().postDataJSON().model_id).toBe(modelId);
    createBody = await createResponse.json();
    expect(createBody.state).toBe("indexed");
    expect(createBody.id).toBe(2);
  });

  test("should not allow indexing when a primary key has been unassigned", async ({
    page,
  }) => {
    const dataset = waitForDataset(page);
    await page.goto(`/model/${modelId}`);
    await dataset;

    await editTitleMetadata(page);
    await toggleSurfaceIndividualRecords(page);

    await selectModelColumn(page, "ID");

    // change the entity key to a foreign key so no key exists
    const entityKey = await findByDisplayValue(sidebar(page), "Entity Key");
    await entityKey.click();
    await popover(page)
      .getByText(/foreign key/i)
      .click();

    const cardUpdate = waitForCardUpdate(page);
    await saveMetadata(page);
    await cardUpdate;

    // search should fail
    await commandPaletteSearch(page, "marble shoes");

    await expect(
      commandPalette(page).getByRole("option", { name: /No results for/ }),
    ).toBeVisible();
  });

  test("should be able to search model index values and visit detail records", async ({
    mb,
    page,
  }) => {
    await createModelIndex(mb.api, { modelId, pkName: "ID", valueName: "TITLE" });
    await waitForIndexedValueSearchable(mb.api, "marble shoes");

    await page.goto("/");

    await commandPaletteSearch(page, "marble shoes");
    const dataset = waitForDataset(page);
    await commandPalette(page)
      .getByRole("option", { name: "Small Marble Shoes" })
      .click();
    await dataset;

    const objectDetail = page.getByTestId("object-detail");
    await expect(
      objectDetail.getByRole("heading", { name: "Small Marble Shoes" }),
    ).toBeVisible();
    await expect(objectDetail.getByText("Small Marble Shoes")).toHaveCount(2);
    await expect(objectDetail.getByText("Doohickey")).toBeVisible();
  });

  // Skipped upstream (it.skip) — kept skipped to preserve fidelity.
  test.skip("should be able to see details of a record outside the first 2000", async ({
    mb,
    page,
  }) => {
    const { id: peopleModelId } = await createQuestion(mb.api, {
      name: "People Model",
      query: { "source-table": PEOPLE_ID },
      type: "model",
    });

    await createModelIndex(mb.api, {
      modelId: peopleModelId,
      pkName: "ID",
      valueName: "NAME",
    });
    await waitForIndexedValueSearchable(mb.api, "anais");

    await page.goto("/");

    await commandPaletteSearch(page, "anais");
    const firstDataset = waitForDataset(page);
    const secondDataset = waitForDataset(page);
    await commandPalette(page)
      .getByRole("option", { name: "Anais Zieme" })
      .click();
    await firstDataset;
    await secondDataset; // second query gets the additional record

    const objectDetail = page.getByTestId("object-detail");
    await expect(objectDetail.getByText(/We're a little lost/i)).toHaveCount(0);
    await expect(
      objectDetail.getByRole("heading", { name: "Anais Zieme" }),
    ).toBeVisible();
    await expect(objectDetail.getByText("Anais Zieme")).toHaveCount(2);
  });

  test("should not reload the model for record in the same model", async ({
    mb,
    page,
  }) => {
    const cardGets = trackCardGets(page);

    await createModelIndex(mb.api, { modelId, pkName: "ID", valueName: "TITLE" });
    await waitForIndexedValueSearchable(mb.api, "marble shoes");

    await page.goto("/");

    await commandPaletteSearch(page, "marble shoes");
    const dataset = waitForDataset(page);
    await commandPalette(page)
      .getByRole("option", { name: "Small Marble Shoes" })
      .click();
    await dataset;

    const objectDetail = page.getByTestId("object-detail");
    await expect(
      objectDetail.getByRole("heading", { name: "Small Marble Shoes" }),
    ).toBeVisible();
    await expect(objectDetail.getByText("Small Marble Shoes")).toHaveCount(2);
    await expect(objectDetail.getByText("Doohickey")).toBeVisible();

    await expect.poll(() => cardGets.count()).toBe(1);

    await page.keyboard.press("Escape");

    await commandPaletteSearch(page, "silk coat");
    await commandPalette(page)
      .getByRole("option", { name: "Ergonomic Silk Coat" })
      .click();

    await expect(
      objectDetail.getByText("Upton, Kovacek and Halvorson"),
    ).toBeVisible();

    await expect.poll(() => cardGets.count()).toBe(1);
  });
});
