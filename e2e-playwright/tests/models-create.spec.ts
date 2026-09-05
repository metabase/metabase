/**
 * Port of e2e/test/scenarios/models/create.cy.spec.js.
 *
 * Covers creating a model: from a native query (via /model/new and via the
 * browse page), from the notebook editor on the browse page, naming, landing
 * on the model, and the native-permissions gate.
 *
 * Porting notes:
 * - `cy.intercept("POST", "/api/dataset").as("dataset")` (beforeEach) +
 *   `cy.wait("@dataset")` → waitForDataset registered before each play/run
 *   click (PORTING rule 2). Same for the per-test /api/card ("createModel")
 *   and /api/dataset ("previewModel") aliases.
 * - `cy.signIn("nocollection"|"nosql")` → signInWithCachedSession (these users
 *   have cached snapshot sessions but aren't in the typed USERS map).
 * - `H.getPersonalCollectionName(USERS["nocollection"])` →
 *   NOCOLLECTION_PERSONAL_COLLECTION_NAME (support/question-new).
 * - `cy.location("pathname").should("match", …)` → expect.poll (Cypress
 *   retried these).
 */
import { test, expect } from "../support/fixtures";
import {
  checkIfPinned,
  navigateToNewModelPage,
  waitForCreateModel,
} from "../support/models-create";
import { waitForDataset } from "../support/models";
import { typeInNativeEditor } from "../support/native-editor";
import { miniPicker } from "../support/notebook";
import { signInWithCachedSession } from "../support/permissions";
import { NOCOLLECTION_PERSONAL_COLLECTION_NAME } from "../support/question-new";
import { modal } from "../support/ui";

const MODEL_PATH = /^\/model\/\d+-.*$/;

test.describe("scenarios > models > create", () => {
  test.beforeEach(async ({ mb }) => {
    await mb.restore();
    await mb.signInAsAdmin();
  });

  test("creates a native query model", async ({ page }) => {
    const modelName = "m42";

    await navigateToNewModelPage(page);

    // Cancel creation with confirmation modal
    await page
      .getByTestId("dataset-edit-bar")
      .getByRole("button", { name: "Cancel", exact: true })
      .click();
    await modal(page)
      .getByRole("button", { name: "Discard changes", exact: true })
      .click();

    // Now we will create a model
    await navigateToNewModelPage(page);

    // Clicking on metadata should not work until we run a query
    await expect(page.getByTestId("editor-tabs-columns")).toBeDisabled();

    await typeInNativeEditor(page, "select 42");
    const dataset = waitForDataset(page);
    await page
      .getByTestId("native-query-editor-container")
      .locator(".Icon-play")
      .click();
    await dataset;

    await page
      .getByTestId("dataset-edit-bar")
      .getByRole("button", { name: "Save", exact: true })
      .click();
    const saveModal = page.getByTestId("save-question-modal");
    await saveModal.getByLabel("Name", { exact: true }).fill(modelName);
    await saveModal.getByRole("button", { name: "Save", exact: true }).click();

    // After saving, we land on view mode for the model
    await expect.poll(() => new URL(page.url()).pathname).toMatch(MODEL_PATH);
    await expect(page.getByTestId("question-row-count")).toHaveText(
      "Showing 1 row",
    );

    await checkIfPinned(page, modelName);
  });

  // This covers creating a GUI model from the browse page + nocollection
  // permissions (2 in 1)
  test("user without a collection access should still be able to create and save a model in his own personal collection", async ({
    page,
    context,
  }) => {
    await signInWithCachedSession(context, "nocollection");
    await page.goto("/browse/models");

    await page.getByLabel("Create a new model", { exact: true }).click();
    await page
      .getByTestId("new-model-options")
      .getByText("Use the notebook editor", { exact: true })
      .click();
    await miniPicker(page).getByText("Sample Database", { exact: true }).click();
    await miniPicker(page).getByText("People", { exact: true }).click();
    await page
      .getByTestId("dataset-edit-bar")
      .getByRole("button", { name: "Save", exact: true })
      .click();

    const saveModal = page.getByTestId("save-question-modal");
    await expect(saveModal).toContainText("Save model");
    await expect(saveModal).toContainText(NOCOLLECTION_PERSONAL_COLLECTION_NAME);
    const createModel = waitForCreateModel(page);
    await saveModal.getByRole("button", { name: "Save", exact: true }).click();
    await createModel;

    await expect.poll(() => new URL(page.url()).pathname).toMatch(MODEL_PATH);
  });

  test("should be able to create a new native model from the browse page", async ({
    page,
  }) => {
    await page.goto("/browse/models");
    await page.getByLabel("Create a new model", { exact: true }).click();
    await page
      .getByTestId("new-model-options")
      .getByText("Use a native query", { exact: true })
      .click();

    await typeInNativeEditor(page, "select 42");
    const previewModel = waitForDataset(page);
    await page
      .getByTestId("native-query-editor-container")
      .getByLabel("Get Answer", { exact: true })
      .click();
    await previewModel;
    await expect(page.getByTestId("visualization-root")).toContainText("42");

    await page
      .getByTestId("dataset-edit-bar")
      .getByRole("button", { name: "Save", exact: true })
      .click();
    const saveModal = page.getByTestId("save-question-modal");
    await saveModal.getByLabel("Name", { exact: true }).fill("m42");
    const createModel = waitForCreateModel(page);
    await saveModal.getByRole("button", { name: "Save", exact: true }).click();
    await createModel;

    await expect.poll(() => new URL(page.url()).pathname).toMatch(MODEL_PATH);
  });

  test("should not be possible to initiate a new model creation without native permissions", async ({
    page,
    context,
  }) => {
    await signInWithCachedSession(context, "nosql");
    await page.goto("/browse/models");

    const header = page.getByTestId("browse-models-header");
    await expect(header.getByRole("heading")).toContainText("Models");
    await expect(header.getByRole("heading")).toBeVisible();
    await expect(
      header.getByLabel("Create a new model", { exact: true }),
    ).toHaveCount(0);
  });
});
