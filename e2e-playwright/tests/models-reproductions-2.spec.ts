/**
 * Playwright port of e2e/test/scenarios/models/reproductions-2.cy.spec.ts
 *
 * Porting notes:
 * - Cypress `@dataset` / `@updateCard` intercepts become waitForResponse
 *   promises registered before the triggering action (waitForDataset /
 *   waitForCardUpdate / a PUT /api/card wait).
 * - `H.createQuestion` / `H.createNativeQuestion` with `visitQuestion: true`:
 *   models redirect /question/:id → /model/:id and run /api/dataset, so those
 *   beforeEach blocks create via the API then `visitModel`; plain questions
 *   use `visitQuestion` (waits card query).
 * - Model-editing helpers (startNewModel, startNewNativeModel, datasetEditBar,
 *   saveMetadataChanges, runButtonInOverlay, main, waitForLoaderToBeRemoved,
 *   visitModelNoDataAccess) live in support/models-reproductions-2.ts.
 * - `cy.go("back"/"forward")` → page.goBack()/goForward(); `cy.location`
 *   retried assertions → expect(page).toHaveURL(predicate).
 * - issue 56698 signs in as "readonlynosql" (outside the typed USERS map but
 *   present in the login cache) via signInWithCachedSession.
 */
import { test, expect } from "../support/fixtures";
import { openVizTypeSidebar } from "../support/charts-extras";
import { pickEntity } from "../support/dashboard";
import {
  filterNotebook,
  join,
  joinTable,
  miniPickerBrowseAll,
  selectFilterOperator,
} from "../support/joins";
import { createNativeQuestion, createQuestion } from "../support/factories";
import {
  openQuestionActions,
  summarize,
  tableInteractive,
  visitModel,
} from "../support/models";
import {
  main,
  datasetEditBar,
  openQuestionActionsItem,
  runButtonInOverlay,
  saveMetadataChanges,
  startNewModel,
  startNewNativeModel,
  visitModelNoDataAccess,
  waitForLoaderToBeRemoved,
} from "../support/models-reproductions-2";
import { turnIntoModel, waitForCardUpdate } from "../support/models-core";
import {
  assertQueryBuilderRowCount,
  getNotebookStep,
  miniPicker,
  openNotebook,
  queryBuilderMain,
  tableHeaderClick,
  visualize,
} from "../support/notebook";
import {
  focusNativeEditor,
  nativeEditor,
  typeInNativeEditor,
} from "../support/native-editor";
import { ORDERS_MODEL_ID } from "../support/organization";
import { signInWithCachedSession } from "../support/permissions";
import { rightSidebar } from "../support/question-saved";
import {
  FIRST_COLLECTION_ID,
  SAMPLE_DATABASE,
} from "../support/sample-data";
import {
  icon,
  modal,
  popover,
  queryBuilderHeader,
  visitQuestion,
} from "../support/ui";

const { ORDERS_ID, PRODUCTS, PRODUCTS_ID } = SAMPLE_DATABASE;

test.describe("issue 46221", () => {
  const modelDetails = {
    name: "46221",
    native: { query: "select 42" },
    type: "model" as const,
    collection_id: FIRST_COLLECTION_ID,
  };

  test.beforeEach(async ({ page, mb }) => {
    await mb.restore();
    await mb.signInAsAdmin();

    const { id } = await createNativeQuestion(mb.api, modelDetails);
    await visitModel(page, id);
  });

  test("should retain the same collection name between ad-hoc question based on a model and a model itself (metabase#46221)", async ({
    page,
  }) => {
    await expect(page).toHaveURL(/\/model\/\d+/);
    const crumbs = page.getByTestId("head-crumbs-container");
    await expect(crumbs).toContainText("First collection");
    await expect(crumbs).toContainText(modelDetails.name);

    // Change the viz type
    await openVizTypeSidebar(page);
    const sidebar = page.getByTestId("sidebar-left");
    await sidebar.getByTestId("more-charts-toggle").click();
    await sidebar.getByTestId("Table-button").click();

    // Make sure we're now in an ad-hoc question mode
    await expect(page).toHaveURL((url) => url.pathname === "/question");

    await expect(crumbs).toContainText("First collection");
    await expect(crumbs).toContainText(modelDetails.name);
  });
});

test.describe("issue 20624", () => {
  const questionDetails = {
    name: "Question",
    type: "question" as const,
    query: { "source-table": PRODUCTS_ID },
    visualization_settings: {
      column_settings: {
        '["name","VENDOR"]': { column_title: "Retailer" },
      },
    },
  };

  test.beforeEach(async ({ mb }) => {
    await mb.restore();
    await mb.signInAsNormalUser();
  });

  test("should reset the question's viz settings when converting to a model (metabase#20624)", async ({
    page,
    mb,
  }) => {
    // check that a column is renamed via the viz settings
    const { id } = await createQuestion(mb.api, questionDetails);
    await visitQuestion(page, id);
    await expect(
      tableInteractive(page).getByText("Retailer", { exact: true }),
    ).toBeVisible();
    await expect(
      tableInteractive(page).getByText("Vendor", { exact: true }),
    ).toHaveCount(0);

    // check that the viz settings are reset when converting to a model
    await turnIntoModel(page);
    await expect(
      tableInteractive(page).getByText("Vendor", { exact: true }),
    ).toBeVisible();
    await expect(
      tableInteractive(page).getByText("Retailer", { exact: true }),
    ).toHaveCount(0);

    // rename the column using the model's metadata
    await openQuestionActionsItem(page, /Edit metadata/);
    await waitForLoaderToBeRemoved(page);
    await tableHeaderClick(page, "Vendor");
    const displayName = page.getByLabel("Display name");
    await displayName.fill("");
    await displayName.fill("Retailer");
    const cardUpdate = waitForCardUpdate(page);
    const saveChanges = page.getByRole("button", {
      name: "Save changes",
      exact: true,
    });
    await expect(saveChanges).toBeEnabled();
    await saveChanges.click();
    await cardUpdate;
    await expect(
      tableInteractive(page).getByText("Retailer", { exact: true }),
    ).toBeVisible();
    await expect(
      tableInteractive(page).getByText("Vendor", { exact: true }),
    ).toHaveCount(0);
  });
});

test.describe("issue 37300", () => {
  test.beforeEach(async ({ page, mb }) => {
    await mb.restore();
    await mb.signInAsNormalUser();

    const { id } = await createQuestion(mb.api, {
      type: "model",
      query: {
        "source-table": PRODUCTS_ID,
        filter: ["=", ["field", PRODUCTS.ID, null], "999991"],
      },
    });
    await visitModel(page, id);
  });

  test("should show the table headers even when there are no results (metabase/metabase#37300)", async ({
    page,
  }) => {
    await openQuestionActionsItem(page, /Edit metadata/);
    await waitForLoaderToBeRemoved(page);

    await expect(main(page).getByText("ID", { exact: true })).toBeVisible();
    await expect(main(page).getByText("Ean", { exact: true })).toBeVisible();
    await expect(
      main(page).getByText("No results", { exact: true }),
    ).toBeVisible();
  });
});

test.describe("issue 32037", () => {
  let modelPathname: string;

  test.beforeEach(async ({ page, mb }) => {
    await mb.restore();
    await mb.signInAsNormalUser();

    await page.goto("/browse/models");
    await page.getByLabel("Orders Model", { exact: true }).click();
    await expect(tableInteractive(page)).toBeVisible();
    modelPathname = new URL(page.url()).pathname;
  });

  async function verifyDiscardingChanges(page: import("@playwright/test").Page) {
    await expect(
      modal(page).getByText("Discard your changes?", { exact: true }),
    ).toBeVisible();
    await modal(page).getByText("Discard changes", { exact: true }).click();

    await expect(tableInteractive(page)).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Save changes", exact: true }),
    ).toHaveCount(0);
    await expect(page).toHaveURL((url) => url.pathname === modelPathname);
  }

  test("should show unsaved changes modal and allow to discard changes when editing model's query (metabase#32037)", async ({
    page,
  }) => {
    await openQuestionActions(page, "Edit query definition");
    await expect(
      page.getByRole("button", { name: "Save changes", exact: true }),
    ).toBeDisabled();
    await filterNotebook(page);
    await popover(page).getByText("ID", { exact: true }).click();
    await popover(page).getByPlaceholder("Enter an ID").fill("1");
    await popover(page).getByPlaceholder("Enter an ID").blur();
    await popover(page)
      .getByRole("button", { name: "Add filter", exact: true })
      .click();
    await expect(
      page.getByRole("button", { name: "Save changes", exact: true }),
    ).toBeEnabled();
    await page.goBack();

    await verifyDiscardingChanges(page);
  });

  test("should show unsaved changes modal and allow to discard changes when editing model's metadata (metabase#32037)", async ({
    page,
  }) => {
    await openQuestionActionsItem(page, /Edit metadata/);
    await waitForLoaderToBeRemoved(page);
    await expect(
      page.getByRole("button", { name: "Save changes", exact: true }),
    ).toBeDisabled();
    const description = page.getByLabel("Description");
    await description.fill("123");
    await description.blur();
    await expect(
      page.getByRole("button", { name: "Save changes", exact: true }),
    ).toBeEnabled();
    await page.goBack();

    await verifyDiscardingChanges(page);
  });
});

test.describe("issue 51925", () => {
  test.beforeEach(async ({ mb }) => {
    await mb.restore();
    await mb.signInAsAdmin();
  });

  function linkTextInput(page: import("@playwright/test").Page) {
    return page
      .getByTestId("chart-settings-widget-link_text")
      .getByRole("combobox");
  }

  function linkUrlInput(page: import("@playwright/test").Page) {
    return page
      .getByTestId("chart-settings-widget-link_url")
      .getByRole("combobox");
  }

  async function setLinkDisplayType(page: import("@playwright/test").Page) {
    await page
      .getByTestId("chart-settings-widget-view_as")
      .getByText("Link", { exact: true })
      .click();
  }

  // These are Mantine Autocomplete comboboxes. The Cypress original typed into
  // them (parseSpecialCharSequences: false). fill() leaves the autocomplete
  // dropdown open, which then swallows the next column-header click (the sidebar
  // never switches columns); real keystrokes + a blur commit the value and
  // close the dropdown before switching.
  async function typeLinkSetting(input: import("@playwright/test").Locator, value: string) {
    await input.click();
    await input.pressSequentially(value);
    await input.blur();
  }

  test('should allow to set "Display as Link" options independently for each column (metabase#51925)', async ({
    page,
  }) => {
    await visitModel(page, ORDERS_MODEL_ID);
    await openQuestionActionsItem(page, /Edit metadata/);
    await waitForLoaderToBeRemoved(page);

    await tableInteractive(page).getByText("User ID", { exact: true }).click();
    await setLinkDisplayType(page);
    await typeLinkSetting(linkTextInput(page), "User {{USER_ID}}");
    await typeLinkSetting(linkUrlInput(page), "https://example.com/{{USER_ID}}");

    await tableInteractive(page)
      .getByText("Product ID", { exact: true })
      .click();
    await setLinkDisplayType(page);
    await typeLinkSetting(linkTextInput(page), "Product {{PRODUCT_ID}}");
    await typeLinkSetting(
      linkUrlInput(page),
      "https://example.com/{{PRODUCT_ID}}",
    );

    await tableInteractive(page).getByText("User ID", { exact: true }).click();
    await expect(linkTextInput(page)).toHaveValue("User {{USER_ID}}");
    await expect(linkUrlInput(page)).toHaveValue(
      "https://example.com/{{USER_ID}}",
    );

    await saveMetadataChanges(page);

    await expect(
      tableInteractive(page)
        .getByRole("link", { name: "User 1", exact: true })
        .first(),
    ).toHaveAttribute("href", "https://example.com/1");
    await expect(
      tableInteractive(page)
        .getByRole("link", { name: "Product 6", exact: true })
        .first(),
    ).toHaveAttribute("href", "https://example.com/6");
  });
});

test.describe("issue 53649", () => {
  test.beforeEach(async ({ mb }) => {
    await mb.restore();
    await mb.signInAsAdmin();
  });

  test("should not get caught in an infinite loop when opening the native editor (metabase#53649)", async ({
    page,
  }) => {
    await startNewNativeModel(page);

    // If the app freezes, this won't work
    await typeInNativeEditor(page, "select 1");
    await expect(nativeEditor(page)).toContainText("select 1");
  });
});

test.describe("issue 56698", () => {
  test.beforeEach(async ({ mb }) => {
    await mb.restore();
  });

  test("should create an editable ad-hoc query based on a read-only native model (metabase#56698)", async ({
    page,
    mb,
    context,
  }) => {
    // create a native model
    await mb.signInAsNormalUser();
    const { id: modelId } = await createNativeQuestion(mb.api, {
      name: "Native model",
      native: { query: "select 1 union all select 2" },
      type: "model",
    });

    // verify that we create an editable ad-hoc query
    await signInWithCachedSession(context, "readonlynosql");
    await visitModel(page, modelId);
    await assertQueryBuilderRowCount(page, 2);
    await summarize(page);
    await rightSidebar(page)
      .getByRole("button", { name: "Done", exact: true })
      .click();
    await assertQueryBuilderRowCount(page, 1);
  });
});

test.describe("issue 57557", () => {
  test.beforeEach(async ({ mb }) => {
    await mb.restore();
  });

  test("should not allow to see the query definition for a user without data permissions (metabase#57557)", async ({
    page,
    mb,
  }) => {
    // create a native model
    await mb.signInAsNormalUser();
    const { id: modelId } = await createNativeQuestion(mb.api, {
      name: "Native model",
      native: { query: "select 1 union all select 2" },
      type: "model",
    });

    // verify that query editing functionality is hidden
    await mb.signIn("nodata");
    await visitModelNoDataAccess(page, modelId);
    await openQuestionActions(page);
    await expect(
      popover(page).getByRole("menuitem", { name: /Edit metadata/ }),
    ).toBeVisible();
    await expect(
      popover(page).getByText("Edit query definition", { exact: true }),
    ).toHaveCount(0);
    await popover(page).getByRole("menuitem", { name: /Edit metadata/ }).click();
    await waitForLoaderToBeRemoved(page);
    await expect(page.getByTestId("editor-tabs-query")).toBeDisabled();
    await expect(page.getByTestId("editor-tabs-columns")).toBeChecked();
  });
});

test.describe("issue 56775", () => {
  const MODEL_NAME = "Model 56775";

  test.beforeEach(async ({ page, mb }) => {
    await mb.restore();
    await mb.signInAsNormalUser();
    const { id } = await createQuestion(mb.api, {
      type: "model",
      name: MODEL_NAME,
      query: { "source-table": PRODUCTS_ID },
    });
    await visitModel(page, id);
  });

  test("should render the correct query after using the back button in a model (metabase#56775)", async ({
    page,
  }) => {
    await openNotebook(page);
    await page.getByRole("button", { name: "Visualize", exact: true }).click();

    await page.goBack();
    await openQuestionActions(page, "Edit query definition");

    // verify that the model definition is visible
    await expect(
      getNotebookStep(page, "data").getByText(MODEL_NAME, { exact: true }),
    ).toHaveCount(0);
    await expect(
      getNotebookStep(page, "data").getByText("Products", { exact: true }),
    ).toBeVisible();
  });
});

test.describe("issue 55486", () => {
  const MODEL_NAME = "Model 55486";

  test.beforeEach(async ({ page, mb }) => {
    await mb.restore();
    await mb.signInAsNormalUser();
    const { id } = await createQuestion(mb.api, {
      type: "model",
      name: MODEL_NAME,
      query: { "source-table": PRODUCTS_ID, limit: 5 },
    });
    await visitModel(page, id);
  });

  async function checkIsShowingMetadataEditorTab(
    page: import("@playwright/test").Page,
  ) {
    await expect(page.getByTestId("editor-tabs-columns")).toBeChecked();
    await expect(page.getByTestId("visualization-root")).toBeVisible();
  }

  async function checkIsShowingQueryEditorTab(
    page: import("@playwright/test").Page,
  ) {
    await expect(page.getByTestId("editor-tabs-query")).toBeChecked();
    await expect(getNotebookStep(page, "data")).toBeVisible();
  }

  test("should render the correct query after using the back button in a model (metabase#56775)", async ({
    page,
  }) => {
    await openQuestionActions(page, "Edit query definition");

    await datasetEditBar(page).getByText("Columns", { exact: true }).click();
    await checkIsShowingMetadataEditorTab(page);

    await datasetEditBar(page).getByText("Query", { exact: true }).click();
    await checkIsShowingQueryEditorTab(page);

    // Back button should show the metadata editor
    await page.goBack();
    await checkIsShowingMetadataEditorTab(page);

    // Back button should show the query editor
    await page.goBack();
    await checkIsShowingQueryEditorTab(page);

    // Forward button should show the query editor
    await page.goForward();
    await checkIsShowingMetadataEditorTab(page);

    // Forward button should show the query editor
    await page.goForward();
    await checkIsShowingQueryEditorTab(page);
  });
});

test.describe("Issue 30712", () => {
  test.beforeEach(async ({ page, mb }) => {
    await mb.restore();
    await mb.signInAsNormalUser();

    await startNewModel(page);

    await miniPicker(page).getByText("Sample Database", { exact: true }).click();
    await miniPicker(page).getByText("Orders", { exact: true }).click();
    await join(page);
    await joinTable(page, "Products");

    await join(page);
    await joinTable(page, "People");
  });

  test("should not crash the editor when ordering by columns on joined tables (metabase#30712)", async ({
    page,
  }) => {
    await getNotebookStep(page, "summarize")
      .getByLabel("Sort", { exact: true })
      .click();
    await popover(page).getByText("Total", { exact: true }).click();

    // no error should be thrown
    await expect(
      main(page).getByText("Something's gone wrong", { exact: true }),
    ).toHaveCount(0);
    await expect(page.getByTestId("run-button")).toBeVisible();
  });
});

test.describe("Issue 56913", () => {
  test.beforeEach(async ({ page, mb }) => {
    await mb.restore();
    await mb.signInAsNormalUser();

    const { id: questionId } = await createQuestion(mb.api, {
      query: { "source-table": ORDERS_ID },
    });
    await visitQuestion(page, questionId);

    await openQuestionActions(page);
    await popover(page).getByText("Turn into a model", { exact: true }).click();
    await modal(page)
      .getByRole("button", { name: "Turn this into a model", exact: true })
      .click();

    const { id: nativeId } = await createNativeQuestion(mb.api, {
      native: {
        query: "select {{ x }}",
        "template-tags": {
          x: {
            id: "d7f1fb15-c7b8-6051-443d-604b6ed5457b",
            name: "x",
            "display-name": "X",
            type: "text",
            default: null,
          },
        },
      },
    });
    await visitQuestion(page, nativeId);
  });

  test("should show the error modal when converting a native question with variables into a model, even when the 'turn into a model' modal was previously acknowledged (metabase#56913)", async ({
    page,
  }) => {
    await openQuestionActions(page);
    await popover(page).getByText("Turn into a model", { exact: true }).click();
    await expect(
      modal(page).getByText("Variables in models aren't supported yet", {
        exact: true,
      }),
    ).toBeVisible();
  });
});

test.describe("issue 50915", () => {
  test.beforeEach(async ({ mb }) => {
    await mb.restore();
    await mb.signInAsNormalUser();
  });

  test("should use the model for the data source for drills after the model is created (metabase#50915)", async ({
    page,
  }) => {
    // create a model via the UI
    await page.goto("/model/new");
    await main(page)
      .getByText("Use the notebook editor", { exact: true })
      .click();
    await miniPicker(page).getByText("Sample Database", { exact: true }).click();
    await miniPicker(page).getByText("Orders", { exact: true }).click();
    await join(page);
    await miniPicker(page).getByText("Sample Database", { exact: true }).click();
    await miniPicker(page).getByText("People", { exact: true }).click();
    await page
      .getByTestId("dataset-edit-bar")
      .getByRole("button", { name: "Save", exact: true })
      .click();
    await page
      .getByTestId("save-question-modal")
      .getByRole("button", { name: "Save", exact: true })
      .click();
    await expect(queryBuilderHeader(page)).toBeVisible();
    await expect(
      queryBuilderMain(page).getByText("37.65", { exact: true }),
    ).toBeVisible({ timeout: 10000 });

    // immediately after saving, drill-thru
    await tableHeaderClick(page, "Discount ($)");
    await popover(page).getByText("Distinct values", { exact: true }).click();
    await expect(
      queryBuilderMain(page).getByText("1,115", { exact: true }),
    ).toBeVisible({ timeout: 10000 });
    await expect(
      tableInteractive(page).getByText("Distinct values of Discount", {
        exact: true,
      }),
    ).toBeVisible();

    // assert that the model is used for the data source
    await openNotebook(page);
    await expect(
      getNotebookStep(page, "data").getByText("Orders + People", {
        exact: true,
      }),
    ).toBeVisible();
  });
});

test.describe("issue 38747", () => {
  test.beforeEach(async ({ mb }) => {
    await mb.restore();
    await mb.signInAsNormalUser();
  });

  test("should allow you to drill through with entity qualified ids", async ({
    page,
  }) => {
    await page.goto("/model/new");
    await page.getByRole("link", { name: /notebook editor/ }).click();

    await miniPickerBrowseAll(page).click();
    await pickEntity(page, {
      path: ["Databases", "Sample Database", "Products"],
    });
    await runButtonInOverlay(page).click();

    // Wait for the query to run so we can click the columns "button"
    await expect(tableInteractive(page)).toHaveCount(1);

    await datasetEditBar(page).getByText("Columns", { exact: true }).click();
    await page
      .getByTestId("model-column-header-content")
      .filter({ hasText: "Vendor" })
      .click();

    await page.getByPlaceholder("Select a semantic type").click();
    await popover(page).getByText("Entity Key", { exact: true }).click();
    await datasetEditBar(page)
      .getByRole("button", { name: "Save", exact: true })
      .click();

    const createModel = page.waitForResponse(
      (response) =>
        response.request().method() === "POST" &&
        new URL(response.url()).pathname === "/api/card",
    );
    const modelQuery = page.waitForResponse(
      (response) =>
        response.request().method() === "POST" &&
        new URL(response.url()).pathname === "/api/dataset",
    );
    await modal(page).getByRole("button", { name: "Save", exact: true }).click();

    // Wait for the model to be created and its query to resolve before
    // interacting with the table.
    await createModel;
    await modelQuery;
    await expect(tableInteractive(page)).toBeVisible();

    const cell = page.getByRole("gridcell", { name: "Nolan-Wolff" });
    await expect(cell).toBeVisible();
    await cell.click();

    // Assert that we're at an adhoc question with appropriate filters
    await expect(page).toHaveURL((url) => url.pathname === "/question");
    await expect(page.getByTestId("filter-pill")).toContainText(
      "Vendor is Nolan-Wolff",
    );
    await expect(tableInteractive(page)).toHaveAttribute(
      "data-rows-count",
      "1",
    );
  });
});

test.describe("issue 69722", () => {
  test.beforeEach(async ({ page, mb }) => {
    await mb.restore();
    await mb.signInAsNormalUser();
    await page.goto("/model/new");
    await page.getByRole("link", { name: /native query/ }).click();
  });

  test("should not be possible to overflow the native query editor (metabase#69722)", async ({
    page,
  }) => {
    await focusNativeEditor(page);
    for (let i = 0; i < 20; i++) {
      await page.keyboard.press("Enter");
    }

    await expect(
      page
        .getByTestId("native-query-editor-container")
        .getByTestId("run-button"),
    ).toBeVisible();
  });
});
