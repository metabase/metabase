/**
 * Playwright port of e2e/test/scenarios/models/models.cy.spec.js
 *
 * Porting notes:
 * - The Cypress `@dataset` / `@cardUpdate` / `@cardQuery` intercepts become
 *   waitForResponse promises registered before the triggering action
 *   (waitForDataset / waitForCardUpdate / a POST /api/card/:id/query wait).
 * - turnIntoModel(), assertIsModel/assertIsQuestion, assertQuestionIsBasedOnModel,
 *   saveQuestionBasedOnModel, selectDimensionOptionFromSidebar and the
 *   getCollectionItem / getResults spec-locals live in support/models-core.ts.
 * - H.startNewQuestion navigates to /question/notebook#<hash> (models-core
 *   startNewQuestion), NOT an app-bar click: the data-picker tests never visit
 *   first, and the nested-queries test needs mockSessionProperty registered
 *   before that navigation.
 * - Dropped never-awaited intercepts (rule 2): the "@schema" intercept in
 *   "allows to create a question based on a model" is registered but never
 *   waited in Cypress, so it's omitted. The "@search" intercept is awaited
 *   only in "transforms the data picker" — inlined there as waitForSearch.
 * - `cy.url().should("not.include", "/question/:id")` / `should("match", ...)`
 *   → expect(page).toHaveURL(predicate|regex), which retries across the
 *   post-save navigation.
 * - EditableText title/description ("can edit model info"): fill() doesn't mark
 *   them dirty, so select-all + type + blur, anchored on the PUT.
 */
import { test, expect } from "../support/fixtures";
import { echartsContainer } from "../support/charts";
import { ORDERS_BY_YEAR_QUESTION_ID } from "../support/command-palette";
import { archiveQuestion } from "../support/collections-trash";
import { mockSessionProperty } from "../support/admin-extras";
import {
  editDashboard,
  getDashboardCard,
  saveDashboard,
  sidebar,
} from "../support/dashboard";
import { undo } from "../support/dashboard-parameters";
import { miniPickerBrowseAll, selectFilterOperator } from "../support/joins";
import { undoToast } from "../support/metrics";
import {
  assertIsModel,
  assertIsQuestion,
  assertQuestionIsBasedOnModel,
  closeQuestionActions,
  createNativeQuestion,
  getCollectionItemCard,
  getCollectionItemRow,
  getResults,
  saveQuestionBasedOnModel,
  selectDimensionOptionFromSidebar,
  startNewQuestion,
  turnIntoModel,
  waitForCardUpdate,
  waitForSearch,
} from "../support/models-core";
import {
  openQuestionActions,
  selectFromDropdown,
  summarize,
  tableInteractive,
  waitForDataset,
} from "../support/models";
import { focusNativeEditor } from "../support/native-editor";
import { filter } from "../support/nested-questions";
import {
  entityPickerModal,
  getNotebookStep,
  tableHeaderClick,
  visualize,
} from "../support/notebook";
import { entityPickerModalItem, visitCollection } from "../support/question-new";
import { openQuestionsSidebar, questionInfoButton } from "../support/revisions";
import {
  ORDERS_QUESTION_ID,
  SAMPLE_DATABASE,
} from "../support/sample-data";
import { icon, modal, popover, visitDashboard, visitQuestion } from "../support/ui";

const { PRODUCTS, ORDERS_ID, PRODUCTS_ID, ACCOUNTS_ID } = SAMPLE_DATABASE;

test.describe("scenarios > models", () => {
  let productsQuestionId: number;

  test.beforeEach(async ({ mb }) => {
    await mb.restore();
    await mb.signInAsAdmin();

    const products = await mb.api.createQuestion({
      name: "Products",
      query: { "source-table": PRODUCTS_ID },
    });
    productsQuestionId = products.id;
  });

  test("allows to turn a GUI question into a model", async ({ page, mb }) => {
    const accounts = await mb.api.createQuestion({
      name: "Accounts Model",
      query: { "source-table": ACCOUNTS_ID },
      type: "model",
    });
    const accountsModelId = accounts.id;

    await mb.api.put(`/api/card/${productsQuestionId}`, {
      name: "Products Model",
    });
    await visitQuestion(page, productsQuestionId);

    await turnIntoModel(page);
    await openQuestionActions(page);
    await assertIsModel(page);

    await filter(page);
    await popover(page).getByText("Vendor", { exact: true }).click();
    await selectFilterOperator(page, "Contains");
    const dataset = waitForDataset(page);
    await popover(page).getByLabel("Filter value").fill("Fisher");
    await popover(page)
      .getByRole("button", { name: "Apply filter", exact: true })
      .click();
    await dataset;

    await assertQuestionIsBasedOnModel(page, {
      model: "Products Model",
      collection: "Our analytics",
      table: "Products",
    });

    await saveQuestionBasedOnModel(page, { name: "Q1" });

    await assertQuestionIsBasedOnModel(page, {
      questionName: "Q1",
      model: "Products Model",
      collection: "Our analytics",
      table: "Products",
    });

    await page
      .getByTestId("qb-header")
      .getByText("Our analytics", { exact: true })
      .first()
      .click();
    // Collection-item icons render twice (item icon + a check icon), so
    // .first() (Cypress cy.icon()'s implicit existence assertion is any-match).
    await expect(
      icon(getCollectionItemCard(page, "Products Model"), "model").first(),
    ).toBeVisible();
    await expect(
      icon(getCollectionItemRow(page, "Q1"), "table2").filter({ visible: true }).first(),
    ).toBeVisible();

    await expect(page).toHaveURL(
      (url) => !url.pathname.includes(`/question/${productsQuestionId}`),
    );

    // Question Lineage should show link to archived models (metabase#52071)
    const accountsQuestion = await mb.api.createQuestion({
      name: "Accounts Model Quest",
      query: { "source-table": `card__${accountsModelId}` },
    });

    await archiveQuestion(mb.api, accountsModelId);

    await visitQuestion(page, accountsQuestion.id);
    const headerLeft = page.getByTestId("qb-header-left-side");
    await expect(icon(headerLeft, "warning")).toBeVisible();
    await expect(
      headerLeft.getByRole("link", { name: /accounts model/i }),
    ).toHaveAttribute("href", `/model/${accountsModelId}-accounts-model`);
  });

  test("allows to turn a native question into a model", async ({
    page,
    mb,
  }) => {
    const { id } = await createNativeQuestion(mb.api, {
      name: "Product Model",
      native: { query: "SELECT * FROM products" },
    });
    await visitQuestion(page, id);

    await turnIntoModel(page);
    await openQuestionActions(page);
    await assertIsModel(page);

    await filter(page);
    await popover(page).getByText("VENDOR", { exact: true }).click();
    await selectFilterOperator(page, "Contains");
    const dataset = waitForDataset(page);
    await popover(page).getByLabel("Filter value").fill("Fisher");
    await popover(page)
      .getByRole("button", { name: "Apply filter", exact: true })
      .click();
    await dataset;

    await assertQuestionIsBasedOnModel(page, {
      model: "Product Model",
      collection: "Our analytics",
      table: "Products",
    });

    // modelId argument is unused by the helper (Cypress passed @questionId).
    await saveQuestionBasedOnModel(page, { name: "Q1" });

    await assertQuestionIsBasedOnModel(page, {
      questionName: "Q1",
      model: "Product Model",
      collection: "Our analytics",
      table: "Products",
    });

    await page
      .getByTestId("qb-header")
      .getByText("Our analytics", { exact: true })
      .first()
      .click();
    await expect(
      icon(getCollectionItemCard(page, "Product Model"), "model").first(),
    ).toBeVisible();
    await expect(
      icon(getCollectionItemRow(page, "Q1"), "table2").filter({ visible: true }).first(),
    ).toBeVisible();

    await expect(page).toHaveURL((url) => url.pathname === "/collection/root");
  });

  test("changes model's display to table", async ({ page }) => {
    await visitQuestion(page, ORDERS_BY_YEAR_QUESTION_ID);

    await expect(echartsContainer(page)).toBeVisible();
    await expect(tableInteractive(page)).toHaveCount(0);

    await turnIntoModel(page);

    await expect(tableInteractive(page)).toBeVisible();
    await expect(echartsContainer(page)).toHaveCount(0);
  });

  test("only shows model info modal once when turning a question into a model", async ({
    page,
  }) => {
    await visitQuestion(page, ORDERS_BY_YEAR_QUESTION_ID);
    await expect(echartsContainer(page)).toBeVisible();

    await turnIntoModel(page);
    await expect(
      undoToast(page).getByText("This is a model now.", { exact: true }),
    ).toBeVisible();
    await undo(page);

    await openQuestionActions(page);
    await icon(popover(page), "model").click();
    await expect(modal(page)).toHaveCount(0);
  });

  test("allows to undo turning a question into a model", async ({ page }) => {
    await visitQuestion(page, ORDERS_BY_YEAR_QUESTION_ID);
    await expect(echartsContainer(page)).toBeVisible();

    await turnIntoModel(page);
    await expect(
      page.getByText("This is a model now.", { exact: true }),
    ).toBeVisible();
    await undo(page);

    await expect(echartsContainer(page)).toBeVisible();
    await openQuestionActions(page);
    await assertIsQuestion(page);
  });

  test("allows to turn a model back into a saved question", async ({
    page,
    mb,
  }) => {
    await mb.api.put(`/api/card/${ORDERS_QUESTION_ID}`, { type: "model" });
    await page.goto(`/model/${ORDERS_QUESTION_ID}`);

    await openQuestionActions(page);
    const backToQuestion = waitForCardUpdate(page, ORDERS_QUESTION_ID);
    await popover(page)
      .getByText("Turn back to saved question", { exact: true })
      .click();
    await backToQuestion;

    await expect(
      page.getByText("This is a question now.", { exact: true }),
    ).toBeVisible();
    await openQuestionActions(page);
    await assertIsQuestion(page);

    const undoUpdate = waitForCardUpdate(page, ORDERS_QUESTION_ID);
    await undo(page);
    await undoUpdate;
    await openQuestionActions(page);
    await assertIsModel(page);
  });

  test("allows duplicating a model", async ({ page, mb }) => {
    await mb.api.put(`/api/card/${ORDERS_QUESTION_ID}`, { type: "model" });
    await page.goto(`/model/${ORDERS_QUESTION_ID}`);

    await openQuestionActions(page);
    await popover(page).getByText("Duplicate", { exact: true }).click();

    await expect(modal(page).getByLabel("Name", { exact: true })).toHaveValue(
      "Orders - Duplicate",
    );
    await modal(page)
      .getByLabel(/Where do you want to save this/)
      .click();

    const picker = entityPickerModal(page);
    // title should not have trailing "or dashboard"
    await expect(picker.getByText(/Select a collection$/)).toBeVisible();
    // this dashboard would be present if dashboards were an allowed save target
    await expect(
      picker.getByText("Orders in a dashboard", { exact: true }),
    ).toHaveCount(0);
    await picker.getByText("First collection", { exact: true }).click();
    await picker
      .getByRole("button", { name: "Select this collection", exact: true })
      .click();

    const cardCreate = page.waitForResponse(
      (response) =>
        response.request().method() === "POST" &&
        new URL(response.url()).pathname === "/api/card",
    );
    await modal(page).getByText("Duplicate", { exact: true }).click();
    await cardCreate;

    await expect(modal(page)).toHaveCount(0);
  });

  test("shows 404 when opening a question with a /dataset URL", async ({
    page,
  }) => {
    await page.goto(`/model/${ORDERS_QUESTION_ID}`);
    await expect(page.getByText(/We're a little lost/i)).toBeVisible();
  });

  test("redirects to /model URL when opening a model with /question URL", async ({
    page,
    mb,
  }) => {
    await mb.api.put(`/api/card/${ORDERS_QUESTION_ID}`, { type: "model" });
    // Important - do not use visitQuestion here! The /question URL redirects to
    // /model and runs /api/dataset, so the card-query endpoint never fires.
    const dataset = waitForDataset(page);
    await page.goto(`/question/${ORDERS_QUESTION_ID}`);
    await dataset;
    await openQuestionActions(page);
    await assertIsModel(page);
    await expect(page).toHaveURL(/\/model/);
  });

  test.describe("data picker", () => {
    test.beforeEach(async ({ mb }) => {
      await mb.api.put(`/api/card/${ORDERS_QUESTION_ID}`, { type: "model" });
    });

    test("transforms the data picker", async ({ page }) => {
      await startNewQuestion(page);
      await miniPickerBrowseAll(page).click();

      const picker = entityPickerModal(page);
      await entityPickerModalItem(page, 0, "Our analytics").click();
      await expect(picker.getByText("Orders", { exact: true })).toBeVisible();
      await expect(
        picker.getByText("Orders Model", { exact: true }),
      ).toBeVisible();
      await expect(
        picker.getByText("Orders, Count", { exact: true }),
      ).toBeVisible();
      await expect(
        picker.getByText("Orders, Count, Grouped by Created At (year)", {
          exact: true,
        }),
      ).toBeVisible();
      await expect(picker.getByText("Products", { exact: true })).toBeVisible();

      await entityPickerModalItem(page, 0, "Databases").click();
      await entityPickerModalItem(page, 1, "Sample Database").click();

      await expect(entityPickerModalItem(page, 2, "Orders")).toBeVisible();
      await expect(entityPickerModalItem(page, 2, "People")).toBeVisible();
      await expect(entityPickerModalItem(page, 2, "Products")).toBeVisible();
      await expect(entityPickerModalItem(page, 2, "Reviews")).toBeVisible();

      await expect(
        picker.getByText("Orders, Count", { exact: true }),
      ).toHaveCount(0);

      const search = waitForSearch(page);
      await picker.getByPlaceholder("Search…").pressSequentially("Ord");
      await search;

      await expect(getResults(picker)).toHaveCount(1);
      await expect(getResults(picker).nth(0)).toHaveAttribute(
        "data-model-type",
        "table",
      );
      await expect(getResults(picker).nth(0)).toContainText("Orders");

      await picker.getByText("Everywhere", { exact: true }).click();
      await expect(getResults(picker)).toHaveCount(5);
      await expect(getResults(picker).nth(0)).toHaveAttribute(
        "data-model-type",
        "dataset",
      );
      await expect(getResults(picker).nth(0)).toContainText("Orders Model");
      await expect(getResults(picker).nth(1)).toHaveAttribute(
        "data-model-type",
        "dataset",
      );
      await expect(getResults(picker).nth(1)).toContainText("Orders");
      await expect(getResults(picker).nth(2)).toHaveAttribute(
        "data-model-type",
        "card",
      );
      await expect(getResults(picker).nth(2)).toContainText(
        "Orders, Count, Grouped by Created At (year)",
      );
      await expect(getResults(picker).nth(3)).toHaveAttribute(
        "data-model-type",
        "card",
      );
      await expect(getResults(picker).nth(3)).toContainText("Orders, Count");
      await expect(getResults(picker).nth(4)).toHaveAttribute(
        "data-model-type",
        "table",
      );
      await expect(getResults(picker).nth(4)).toContainText("Orders");
    });

    test("allows to create a question based on a model", async ({ page }) => {
      await startNewQuestion(page);
      await miniPickerBrowseAll(page).click();
      await entityPickerModalItem(page, 0, "Our analytics").click();
      await entityPickerModal(page).getByText("Orders", { exact: true }).click();

      await icon(page, "join_left_outer").click();
      await miniPickerBrowseAll(page).click();
      await entityPickerModalItem(page, 0, "Databases").click();
      await entityPickerModalItem(page, 1, "Sample Database").click();

      await expect(entityPickerModalItem(page, 2, "Orders")).toBeVisible();
      await expect(entityPickerModalItem(page, 2, "People")).toBeVisible();
      await expect(entityPickerModalItem(page, 2, "Products")).toBeVisible();
      await expect(entityPickerModalItem(page, 2, "Reviews")).toBeVisible();

      await entityPickerModalItem(page, 2, "Products").click();

      await getNotebookStep(page, "filter")
        .getByText("Add filters to narrow your answer")
        .click();
      await popover(page).getByText("Products", { exact: true }).click();
      await popover(page).getByText("Price", { exact: true }).click();
      await selectFilterOperator(page, "Less than");
      await popover(page).getByPlaceholder("Enter a number").fill("50");
      await popover(page)
        .getByRole("button", { name: "Add filter", exact: true })
        .click();

      await page
        .getByText("Pick a function or metric", { exact: true })
        .click();
      await selectFromDropdown(page, "Count of rows");

      await page.getByText("Pick a column to group by", { exact: true }).click();
      await selectFromDropdown(page, "Created At");

      await visualize(page);
      await expect(echartsContainer(page)).toBeVisible();
      await page.getByText("Save", { exact: true }).click();

      const saveModal = page.getByTestId("save-question-modal");
      await expect(
        saveModal.getByLabel("Where do you want to save this?"),
      ).toHaveText("Orders in a dashboard");
      await saveModal.getByText("Save", { exact: true }).click();

      await expect(page).toHaveURL(/\/dashboard\/\d+-[a-z0-9-]*$/);
    });

    test("should not display models if nested queries are disabled", async ({
      page,
    }) => {
      await mockSessionProperty(page, "enable-nested-queries", false);
      await startNewQuestion(page);
      await miniPickerBrowseAll(page).click();
      await entityPickerModalItem(page, 1, "Sample Database").click();
      const picker = entityPickerModal(page);
      await expect(picker.getByText("Orders", { exact: true })).toBeVisible();
      await expect(picker.getByText("People", { exact: true })).toBeVisible();
      await expect(picker.getByText("Products", { exact: true })).toBeVisible();
      await expect(picker.getByText("Reviews", { exact: true })).toBeVisible();
    });
  });

  test.describe("simple mode", () => {
    test.beforeEach(async ({ mb }) => {
      await mb.api.put(`/api/card/${ORDERS_QUESTION_ID}`, {
        name: "Orders Model",
        type: "model",
      });
    });

    test("can create a question by filtering and summarizing a model", async ({
      page,
    }) => {
      const visitDataset = waitForDataset(page);
      await page.goto(`/model/${ORDERS_QUESTION_ID}`);
      await visitDataset;

      await filter(page);
      await popover(page).getByText("Discount", { exact: true }).click();
      await selectFilterOperator(page, "Not empty");
      const applyDataset = waitForDataset(page);
      await popover(page)
        .getByRole("button", { name: "Apply filter", exact: true })
        .click();
      await applyDataset;

      await assertQuestionIsBasedOnModel(page, {
        model: "Orders Model",
        collection: "Our analytics",
        table: "Orders",
      });

      await summarize(page);

      const summarizeDataset = waitForDataset(page);
      await selectDimensionOptionFromSidebar(page, "Created At");
      await summarizeDataset;
      await page.getByRole("button", { name: "Done", exact: true }).click();

      await assertQuestionIsBasedOnModel(page, {
        questionName: "Count by Created At: Month",
        model: "Orders Model",
        collection: "Our analytics",
        table: "Orders",
      });

      await saveQuestionBasedOnModel(page, { name: "Q1" });

      await assertQuestionIsBasedOnModel(page, {
        questionName: "Q1",
        model: "Orders Model",
        collection: "Our analytics",
        table: "Orders",
      });

      await expect(page).toHaveURL(
        (url) => !url.pathname.includes(`/question/${ORDERS_QUESTION_ID}`),
      );
    });

    test("can create a question using table click actions", async ({
      page,
    }) => {
      const visitDataset = waitForDataset(page);
      await page.goto(`/model/${ORDERS_QUESTION_ID}`);
      await visitDataset;

      await tableHeaderClick(page, "Subtotal");
      await selectFromDropdown(page, "Sum over time");

      await assertQuestionIsBasedOnModel(page, {
        questionName: "Sum of Subtotal by Created At: Month",
        model: "Orders Model",
        collection: "Our analytics",
        table: "Orders",
      });

      await saveQuestionBasedOnModel(page, { name: "Q1" });

      await assertQuestionIsBasedOnModel(page, {
        questionName: "Q1",
        model: "Orders Model",
        collection: "Our analytics",
        table: "Orders",
      });

      await expect(page).toHaveURL(
        (url) => !url.pathname.includes(`/question/${ORDERS_QUESTION_ID}`),
      );
    });

    test("can edit model info", async ({ page }) => {
      const visitDataset = waitForDataset(page);
      await page.goto(`/model/${ORDERS_QUESTION_ID}`);
      await visitDataset;

      const title = page.getByTestId("saved-question-header-title");
      const titleUpdate = waitForCardUpdate(page, ORDERS_QUESTION_ID);
      await title.click();
      await page.keyboard.press("ControlOrMeta+A");
      await page.keyboard.press("Backspace");
      await page.keyboard.type("M1");
      await title.blur();
      await titleUpdate;

      await questionInfoButton(page).click();

      const description = page.getByPlaceholder("Add description");
      const descriptionUpdate = waitForCardUpdate(page, ORDERS_QUESTION_ID);
      await description.click();
      await description.pressSequentially("foo");
      await description.blur();
      await descriptionUpdate;

      await expect(title).toHaveValue("M1");
      await expect(page.getByText("foo", { exact: true })).toBeVisible();
    });
  });

  test("shouldn't allow to turn native questions with variables into models", async ({
    page,
    mb,
  }) => {
    const { id } = await createNativeQuestion(mb.api, {
      native: {
        query: "SELECT * FROM products WHERE {{ID}}",
        "template-tags": {
          ID: {
            id: "6b8b10ef-0104-1047-1e1b-2492d5954322",
            name: "ID",
            display_name: "ID",
            type: "dimension",
            dimension: ["field", PRODUCTS.ID, null],
            "widget-type": "category",
            default: null,
          },
        },
      },
    });
    await visitQuestion(page, id);

    await openQuestionActions(page);
    await icon(popover(page), "model").click();
    const infoModal = modal(page);
    await expect(
      infoModal.getByText("Variables in models aren't supported yet", {
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      infoModal.getByRole("button", {
        name: "Turn this into a model",
        exact: true,
      }),
    ).toHaveCount(0);
    await icon(infoModal, "close").click();

    await openQuestionActions(page);
    await assertIsQuestion(page);
    await closeQuestionActions(page);

    // Check card tags are supported by models
    await page.getByText(/Open editor/i).click();
    await focusNativeEditor(page);
    await page.keyboard.press("ArrowLeft");
    await page.keyboard.press("ArrowLeft");
    await page.keyboard.press("Backspace");
    await page.keyboard.press("Backspace");
    await page.keyboard.type("#1-orders");

    await page
      .getByTestId("qb-header")
      .getByRole("button", { name: "Save", exact: true })
      .click();

    await page
      .getByTestId("save-question-modal")
      .getByRole("button", { name: "Save", exact: true })
      .click();

    await turnIntoModel(page);
    await openQuestionActions(page);
    await assertIsModel(page);
  });

  test("shouldn't allow using variables in native models", async ({
    page,
    mb,
  }) => {
    const { id: modelId } = await createNativeQuestion(mb.api, {
      native: { query: "SELECT * FROM products" },
    });
    await mb.api.put(`/api/card/${modelId}`, { type: "model" });
    await page.goto(`/model/${modelId}/query`);

    await focusNativeEditor(page);
    await page.keyboard.type(" WHERE {{F");

    await expect(page.getByTestId("tag-editor-sidebar")).toHaveCount(0);
  });

  test("should correctly show native models for no-data users", async ({
    page,
    mb,
  }) => {
    const { id: modelId } = await createNativeQuestion(mb.api, {
      name: "TEST MODEL",
      type: "model",
      native: { query: "select * from orders" },
    });

    await mb.signIn("nodata");

    const cardQuery = page.waitForResponse(
      (response) =>
        response.request().method() === "POST" &&
        /^\/api\/card\/\d+\/query$/.test(new URL(response.url()).pathname),
    );
    await page.goto(`/model/${modelId}`);
    await cardQuery;

    await expect(
      page.getByText(/This question is written in SQL/i),
    ).toHaveCount(0);
  });

  test("should automatically pin newly created models", async ({ page }) => {
    await visitQuestion(page, ORDERS_QUESTION_ID);
    await turnIntoModel(page);
    await visitCollection(page, "root");
    const pinned = page.getByTestId("pinned-items");
    await expect(pinned.getByText("Models", { exact: true })).toBeVisible();
    await expect(pinned.getByText("A model", { exact: true })).toBeVisible();
  });

  test("should undo pinning a question if turning into a model was undone", async ({
    page,
  }) => {
    await visitQuestion(page, ORDERS_QUESTION_ID);

    await turnIntoModel(page);
    const undoUpdate = waitForCardUpdate(page, ORDERS_QUESTION_ID);
    await undo(page);
    await undoUpdate;

    await visitCollection(page, "root");
    await expect(page.getByText("Useful data", { exact: true })).toHaveCount(0);
    await expect(page.getByText("A model", { exact: true })).toHaveCount(0);
  });

  test.describe("listing", () => {
    const modelDetails = {
      name: "Orders Model 2",
      query: {
        "source-table": ORDERS_ID,
        limit: 5,
      },
      type: "model",
    };

    test.beforeEach(async ({ mb }) => {
      await mb.api.createQuestion(modelDetails);
    });

    test("should allow adding models to dashboards", async ({ page, mb }) => {
      const { id: dashboardId } = await mb.api.createDashboard();
      await visitDashboard(page, mb.api, dashboardId);
      await editDashboard(page);
      await openQuestionsSidebar(page);
      await sidebar(page).getByText(modelDetails.name, { exact: true }).click();

      const card = getDashboardCard(page);
      await expect(card.getByText(modelDetails.name, { exact: true })).toBeVisible();
      await expect(card.getByText("37.65", { exact: true })).toBeVisible();

      await saveDashboard(page);

      await expect(card.getByText(modelDetails.name, { exact: true })).toBeVisible();
      await expect(card.getByText("37.65", { exact: true })).toBeVisible();
    });
  });
});
