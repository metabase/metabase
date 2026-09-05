/**
 * Playwright port of e2e/test/scenarios/question/notebook-data-source.cy.spec.ts
 *
 * (The `question/` directory holds no same-basename `.js` sibling for this
 * spec — `notebook.cy.spec.js` and `notebook-link-to-data-source.cy.spec.ts`
 * are different specs.)
 *
 * Porting notes:
 * - Infra tiers: three `@external` tests (issue 34350 on the `postgres-12`
 *   snapshot; the multi-schema test and issue 28106 on `postgres-writable`)
 *   are gated on PW_QA_DB_ENABLED. The "library table as a source" describe
 *   carries no tag but calls H.activateToken("pro-self-hosted"), so it is
 *   gated on the token resolving.
 * - The `@OSS` tag on "should display databases by default" is not applied as
 *   a skip: the assertions are the plain data picker with no EE chrome and no
 *   upsell CTA, and the test passes on the EE jar (see findings). Tagging it
 *   `@OSS` upstream buys a run on the OSS build; it is not an OSS-only
 *   behaviour.
 * - `cy.realType("a")` types at document.activeElement (the data-step search
 *   input is autofocused and lives OUTSIDE [data-testid=mini-picker], so the
 *   surrounding `.within()` is decorative) → page.keyboard.type("a").
 * - The spec-local moveToCollection registers its /api/collection/tree
 *   intercept before opening the actions menu and waits after clicking Move;
 *   the entity picker fetches the tree when it opens, so the wait can be
 *   satisfied retroactively. Ported as a response recorder registered at the
 *   same point (support/notebook-data-source.ts).
 * - H.resyncDatabase({ dbId }) with no `tables` gates on nothing (PORTING);
 *   both writable-DB describes here depend on tables the reset just created,
 *   so the ported calls pass the `tables` the test goes on to click.
 * - H.saveQuestionToCollection("Beasts") renames the question; the shared
 *   support/nested-questions.ts copy is an explicit no-rename subset, so the
 *   renaming form is ported in support/notebook-data-source.ts.
 * - `cy.findAllByTestId("cell-data").should("contain", "37.65")` is
 *   chai-jquery's ANY-OF case on a multi-element subject (not a
 *   concatenation) — ported as "at least one cell contains it".
 * - The mini picker's item list is virtualized (~20 rows), so the
 *   multi-schema test reaches its schema through `clickMiniPickerItem`, which
 *   scrolls the list until the row enters the DOM. Needed only because the
 *   locally shared writable container carries 26 leftover `Schema A`…`Z`
 *   schemas that push `Wild` out of the initial window; CI's fresh container
 *   has three schemas and would not need it. No assertion is weakened.
 * - `issue 34350` is test.fixme'd for a contaminated shared QA Postgres12
 *   fixture — see the note on the test itself. Environmental, not a product
 *   or port issue.
 */
import type { Page } from "@playwright/test";

import { openReviewsTable, openOrdersTable } from "../support/ad-hoc-question";
import { resetTestTable } from "../support/actions-on-dashboards";
import { resolveToken } from "../support/api";
import { createCollection } from "../support/collections-trash";
import { resetTestTableMultiSchema } from "../support/data-model";
import { test, expect } from "../support/fixtures";
import { join, miniPickerBrowseAll } from "../support/joins";
import {
  entityPickerModal,
  entityPickerModalLevel,
  getNotebookStep,
  miniPicker,
  openNotebook,
  queryBuilderMain,
  startNewQuestion,
  tableHeaderColumn,
  visualize,
} from "../support/notebook";
import {
  ORDERS_COUNT_QUESTION_ID,
  ORDERS_MODEL_ID,
  QA_DB_SKIP_REASON,
  SECOND_COLLECTION_ID,
  TOKEN_SKIP_REASON,
  assertDataPickerEntityNotSelected,
  assertDataPickerEntitySelected,
  clickMiniPickerItem,
  dataStepCell,
  moveToCollection,
  openDataSelector,
  saveQuestionToCollection,
} from "../support/notebook-data-source";
import { miniPickerHeader } from "../support/question-new";
import { SAMPLE_DATABASE } from "../support/sample-data";
import { WRITABLE_DB_ID, resyncDatabase } from "../support/schema-viewer";
import { resetManySchemasTable } from "../support/transforms-codegen";
import { navigationSidebar, popover, visitQuestion } from "../support/ui";
import { visitModel } from "../support/models";

const { ORDERS_ID, PRODUCTS_ID, REVIEWS_ID } = SAMPLE_DATABASE;

test.describe("scenarios > notebook > data source", () => {
  test.describe("empty app db", () => {
    test.beforeEach(async ({ mb }) => {
      await mb.restore("setup");
      await mb.signInAsAdmin();
    });

    // upstream tag: @OSS — see the header note; runs unconditionally here.
    test("should display databases by default", async ({ page }) => {
      await page.goto("/");
      await page
        .getByTestId("app-bar")
        .getByText("New", { exact: true })
        .click();
      // findByTextEnsureVisible = findByText(...).should("be.visible")
      const questionItem = popover(page).getByText("Question", { exact: true });
      await expect(questionItem).toBeVisible();
      await questionItem.click();
      await expect(
        page.getByPlaceholder("Search for tables and more...", { exact: true }),
      ).toBeAttached();

      await miniPickerBrowseAll(page).click();
      await expect(entityPickerModal(page)).toBeVisible();
      // databases is selected already
      await entityPickerModalLevel(page, 1)
        .getByText("Sample Database", { exact: true })
        .click();
      await assertDataPickerEntityNotSelected(page, 2, "Accounts");
      await assertDataPickerEntityNotSelected(page, 2, "Analytic Events");
      await assertDataPickerEntityNotSelected(page, 2, "Feedback");
      await assertDataPickerEntityNotSelected(page, 2, "Invoices");
      await assertDataPickerEntityNotSelected(page, 2, "Orders");
      await assertDataPickerEntityNotSelected(page, 2, "People");
      await assertDataPickerEntityNotSelected(page, 2, "Products");
      await assertDataPickerEntityNotSelected(page, 2, "Reviews");
    });
  });

  test.describe("table as a source", () => {
    test.beforeEach(async ({ mb }) => {
      await mb.restore();
      await mb.signInAsAdmin();
    });

    test("should correctly display the source data for ad-hoc questions", async ({
      page,
    }) => {
      await openReviewsTable(page);
      await openNotebook(page);
      await expect(dataStepCell(page)).toHaveText("Reviews");
      await dataStepCell(page).click();
      await expect(miniPickerHeader(page)).toContainText("Sample Database");
      await expect(
        miniPicker(page).getByText("Reviews", { exact: true }),
      ).toBeAttached();

      await miniPickerHeader(page).click();
      await miniPickerBrowseAll(page).click();
      await assertDataPickerEntitySelected(page, 2, "Reviews");
    });

    test("should correctly display the source data for a simple saved question", async ({
      page,
    }) => {
      await visitQuestion(page, ORDERS_COUNT_QUESTION_ID);
      await openNotebook(page);
      await expect(dataStepCell(page)).toHaveText("Orders");
      await dataStepCell(page).click();
      await expect(miniPickerHeader(page)).toContainText("Sample Database");
      await expect(
        miniPicker(page).getByText("Orders", { exact: true }),
      ).toBeAttached();

      await miniPickerHeader(page).click();
      await miniPickerBrowseAll(page).click();
      await assertDataPickerEntitySelected(page, 2, "Orders");
    });

    test("should correctly display a table from a multi-schema database (metabase#39807,metabase#11958)", async ({
      page,
      mb,
    }) => {
      test.skip(!process.env.PW_QA_DB_ENABLED, QA_DB_SKIP_REASON);
      test.slow();

      const dialect = "postgres" as const;

      const dbName = "Writable Postgres12";
      const schemaName = "Wild";
      const tableName = "Animals";

      await mb.restore(`${dialect}-writable`);
      await resetTestTableMultiSchema();
      await resetTestTable({ type: dialect, table: "many_data_types" });

      await mb.signInAsAdmin();

      // Upstream passes no `tables`, which gates on nothing; the test then
      // clicks these very tables.
      await resyncDatabase(mb.api, {
        dbId: WRITABLE_DB_ID,
        tables: ["Animals", "many_data_types"],
      });

      await startNewQuestion(page);
      await clickMiniPickerItem(page, dbName);
      await clickMiniPickerItem(page, schemaName);
      await clickMiniPickerItem(page, tableName);

      await visualize(page);
      await saveQuestionToCollection(page, "Beasts");

      await openNotebook(page);
      await expect(dataStepCell(page)).toContainText(tableName);
      await dataStepCell(page).click();
      await expect(miniPickerHeader(page)).toContainText(schemaName);
      await expect(
        miniPicker(page).getByText(tableName, { exact: true }),
      ).toBeAttached();

      // start typing to expose mini-picker "Browse all" option. The search
      // input is autofocused and sits outside [data-testid=mini-picker], so
      // this types at document.activeElement exactly as cy.realType did.
      await page.keyboard.type("a");
      await miniPickerBrowseAll(page).click();
      await expect(entityPickerModal(page)).toBeVisible();
      await assertDataPickerEntitySelected(page, 1, dbName);
      await assertDataPickerEntitySelected(page, 2, schemaName);
      await assertDataPickerEntitySelected(page, 3, tableName);
      await entityPickerModal(page)
        .getByText(tableName, { exact: true })
        .first()
        .click();

      // select a table from the second schema
      await join(page);
      await clickMiniPickerItem(page, dbName);
      // the table picker renders the RAW schema name — `public`, not `Public`
      await clickMiniPickerItem(page, "public");
      await clickMiniPickerItem(page, "Many Data Types");
      await popover(page).getByText("Name", { exact: true }).click();
      await popover(page).getByText("Text", { exact: true }).click();

      // select a table from the third schema
      await join(page);
      await clickMiniPickerItem(page, dbName);
      await clickMiniPickerItem(page, "Domestic");
      await clickMiniPickerItem(page, "Animals");
      await popover(page).getByText("Name", { exact: true }).click();
      await popover(page).getByText("Name", { exact: true }).click();
    });

    test("should correctly display a table as the model's source when editing simple model's query", async ({
      page,
    }) => {
      await page.goto(`/model/${ORDERS_MODEL_ID}/query`);

      await expect(dataStepCell(page)).toHaveText("Orders");
      await dataStepCell(page).click();
      await expect(miniPickerHeader(page)).toContainText("Sample Database");
      await expect(
        miniPicker(page).getByText("Orders", { exact: true }),
      ).toBeAttached();
    });
  });

  test.describe("library table as a source", () => {
    // No upstream tag, but the describe activates the pro-self-hosted token
    // and drives the EE library — gate on the token resolving.
    test.skip(!resolveToken("pro-self-hosted"), TOKEN_SKIP_REASON);

    test.beforeEach(async ({ mb }) => {
      await mb.restore();
      await mb.signInAsAdmin();
      await mb.api.activateToken("pro-self-hosted");
      await mb.api.createLibrary();
    });

    test("should allow to pick a published table from the mini picker", async ({
      page,
      mb,
    }) => {
      await mb.api.publishTables({ table_ids: [ORDERS_ID, PRODUCTS_ID] });
      await startNewQuestion(page);

      // verify the picker when nothing is selected
      await popover(page).getByText("Orders", { exact: true }).click();
      await join(page);
      // Anchor on the picker list having SETTLED before resolving the row:
      // React reuses these rows while the published-table list loads, so a
      // click resolved against a partially-loaded list can be swallowed
      // (observed once: the join never applied and "Products → ID" was
      // missing after visualize; not reproduced in 8 stress runs).
      await expect(popover(page).getByText("Orders", { exact: true })).toBeVisible();
      const productsRow = popover(page).getByText("Products", { exact: true });
      await expect(productsRow).toBeVisible();
      await productsRow.click();
      await visualize(page);
      await expect(tableHeaderColumn(page, "User ID")).toBeVisible();
      await expect(tableHeaderColumn(page, "Products → ID")).toBeVisible();

      // verify the picker when there is a selected item
      await openNotebook(page);
      await getNotebookStep(page, "data")
        .getByText("Orders", { exact: true })
        .click();
      await popover(page).getByText("Products", { exact: true }).click();
      await expect(
        getNotebookStep(page, "data").getByText("Products", { exact: true }),
      ).toBeVisible();
    });

    test("should allow to pick a publish table from the data picker", async ({
      page,
      mb,
    }) => {
      await mb.api.publishTables({ table_ids: [ORDERS_ID, PRODUCTS_ID] });
      await startNewQuestion(page);

      // verify the picker when nothing is selected
      await popover(page).getByText("Browse all", { exact: true }).click();
      await expect(entityPickerModal(page)).toBeVisible();
      await entityPickerModalLevel(page, 0)
        .getByText("Library", { exact: true })
        .click();
      await entityPickerModalLevel(page, 1)
        .getByText("Data", { exact: true })
        .click();
      await entityPickerModal(page)
        .getByText("Orders", { exact: true })
        .first()
        .click();

      await join(page);
      await popover(page).getByText("Browse all", { exact: true }).click();
      await expect(entityPickerModal(page)).toBeVisible();
      await entityPickerModalLevel(page, 0)
        .getByText("Library", { exact: true })
        .click();
      await entityPickerModalLevel(page, 1)
        .getByText("Data", { exact: true })
        .click();
      await entityPickerModal(page)
        .getByText("Products", { exact: true })
        .first()
        .click();

      await visualize(page);
      await expect(tableHeaderColumn(page, "User ID")).toBeVisible();
      await expect(tableHeaderColumn(page, "Products → ID")).toBeVisible();

      await openNotebook(page);
      await getNotebookStep(page, "data")
        .getByText("Orders", { exact: true })
        .click();
      await popover(page).getByText("Data", { exact: true }).click();
      await popover(page).getByText("Browse all", { exact: true }).click();

      await expect(entityPickerModal(page)).toBeVisible();
      await assertDataPickerEntitySelected(page, 0, "Library");
      await assertDataPickerEntitySelected(page, 1, "Data");
      await assertDataPickerEntitySelected(page, 2, "Orders");
    });
  });

  test.describe("saved entity as a source (aka the virtual table)", () => {
    const modelDetails = {
      name: "GUI Model",
      query: { "source-table": REVIEWS_ID, limit: 1 },
      display: "table",
      type: "model",
      collection_id: SECOND_COLLECTION_ID,
    };

    test.beforeEach(async ({ mb }) => {
      await mb.restore();
      await mb.signInAsAdmin();
    });

    test("data selector should properly show a model as the source (metabase#39699)", async ({
      page,
      mb,
    }) => {
      const { id } = await mb.api.createQuestion(modelDetails);
      // H.createQuestion(..., { visitQuestion: true }) routes models to
      // visitModel (/model/:id runs POST /api/dataset).
      await visitModel(page, id);
      await openNotebook(page);
      await expect(dataStepCell(page)).toHaveText(modelDetails.name);
      await dataStepCell(page).click();

      const entry = miniPicker(page).getByText(modelDetails.name, {
        exact: true,
      });
      await expect(entry).toBeAttached();
      await expect(entry).toContainText(modelDetails.name);
    });

    test("moving the model to another collection should immediately be reflected in the data selector (metabase#39812-1)", async ({
      page,
    }) => {
      await visitModel(page, ORDERS_MODEL_ID);
      await openNotebook(page);

      await openDataSelector(page);
      await expect(miniPickerHeader(page)).toContainText("Our analytics");
      await expect(
        miniPicker(page).getByText("Orders Model", { exact: true }),
      ).toBeAttached();

      await miniPickerHeader(page).click();
      await miniPickerBrowseAll(page).click();
      await expect(entityPickerModal(page)).toBeVisible();
      await assertDataPickerEntitySelected(page, 0, "Our analytics");
      await assertDataPickerEntitySelected(page, 1, "Orders Model");
      await entityPickerModal(page)
        .getByRole("button", { name: "Close", exact: true })
        .click();

      await moveToCollection(page, "First collection");

      await openDataSelector(page);

      await expect(miniPickerHeader(page)).toContainText("First collection");
      await expect(
        miniPicker(page).getByText("Orders Model", { exact: true }),
      ).toBeAttached();

      await miniPickerHeader(page).click();
      await miniPickerHeader(page).click();
      await miniPickerBrowseAll(page).click();
      await expect(entityPickerModal(page)).toBeVisible();
      await assertDataPickerEntitySelected(page, 0, "Our analytics");
      await assertDataPickerEntitySelected(page, 1, "First collection");
      await assertDataPickerEntitySelected(page, 2, "Orders Model");
    });

    test("moving the source question should immediately reflect in the data selector for the nested question that depends on it (metabase#39812-2)", async ({
      page,
      mb,
    }) => {
      const SOURCE_QUESTION_ID = ORDERS_COUNT_QUESTION_ID;
      // Rename the source question to make assertions more explicit
      const sourceQuestionName = "Source Question";
      await mb.api.put(`/api/card/${ORDERS_COUNT_QUESTION_ID}`, {
        name: sourceQuestionName,
      });

      const { id: nestedQuestionId } = await mb.api.createQuestion({
        name: "Nested Question",
        query: { "source-table": `card__${SOURCE_QUESTION_ID}` },
      });

      // see nested question in our analytics
      await visitQuestion(page, nestedQuestionId);
      await openNotebook(page);
      await openDataSelector(page);
      await expect(miniPickerHeader(page)).toContainText("Our analytics");
      await expect(
        miniPicker(page).getByText(sourceQuestionName, { exact: true }),
      ).toBeAttached();

      await miniPickerHeader(page).click();
      await miniPickerBrowseAll(page).click();
      await expect(entityPickerModal(page)).toBeVisible();
      await assertDataPickerEntitySelected(page, 0, "Our analytics");
      await assertDataPickerEntitySelected(page, 1, sourceQuestionName);
      await entityPickerModal(page)
        .getByRole("button", { name: "Close", exact: true })
        .click();

      // Move the source question to another collection
      await visitQuestion(page, SOURCE_QUESTION_ID);
      await openNotebook(page);
      await moveToCollection(page, "First collection");

      // Make sure the source change is reflected in a nested question
      await visitQuestion(page, nestedQuestionId);
      await openNotebook(page);

      await openDataSelector(page);
      await expect(miniPickerHeader(page)).toContainText("First collection");
      await expect(
        miniPicker(page).getByText(sourceQuestionName, { exact: true }),
      ).toBeAttached();

      await miniPickerHeader(page).click();
      await miniPickerHeader(page).click();
      await miniPickerBrowseAll(page).click();
      await expect(entityPickerModal(page)).toBeVisible();
      await assertDataPickerEntitySelected(page, 0, "Our analytics");
      await assertDataPickerEntitySelected(page, 1, "First collection");
      await assertDataPickerEntitySelected(page, 2, sourceQuestionName);
    });
  });
});

test.describe("issue 34350", () => {
  test.skip(!process.env.PW_QA_DB_ENABLED, QA_DB_SKIP_REASON);

  test.beforeEach(async ({ mb }) => {
    await mb.restore("postgres-12");
    await mb.signInAsAdmin();
  });

  /**
   * FIXME (environmental, NOT a port or product issue — re-enable once the
   * shared QA Postgres12 container is re-seeded).
   *
   * The final assertion needs the Orders row with subtotal 37.65 — id 1 — to
   * be among the ~18 rows the virtualized grid renders, i.e. it needs id 1 to
   * be physically first in an ORDER BY-less `LIMIT 2000`. On the local shared
   * `metabase-e2e-postgres-sample-1` container it is not: measured
   * `select ctid, id from sample.orders where id in (1,2)` returns
   * `(213,21) | 1` and `(0,2) | 2`, so some earlier UPDATE moved row 1 to the
   * end of an 18760-row heap and it falls outside the 2000-row window
   * entirely. The rendered grid starts at id 2 (probed directly:
   * `cell-data` = ["ID",…,"2","1","123","110.93",…]); nothing is scrolled
   * (every div's scrollTop is 0), so this is the result set, not the viewport.
   *
   * That ctid is impossible in a freshly seeded fixture, which is what CI
   * provisions — so this should be green there. The rest of the test (source
   * swap to QA Postgres12, no error banner) passes.
   */
  test.fixme("works after changing question's source table to a one from a different database (metabase#34350)", async ({
    page,
  }) => {
    await openOrdersTable(page, { mode: "notebook" });
    await openDataSelector(page);
    await miniPickerHeader(page).click();
    await miniPicker(page).getByText("QA Postgres12", { exact: true }).click();
    await miniPicker(page).getByText("Orders", { exact: true }).click();

    await visualize(page);

    await expect(
      queryBuilderMain(page).getByText("There was a problem with your question", {
        exact: true,
      }),
    ).toHaveCount(0);
    // bare should("contain", …) on a multi-element subject is ANY-OF
    await expect(
      page.getByTestId("cell-data").filter({ hasText: "37.65" }).first(),
    ).toBeAttached();
  });
});

test.describe("issue 28106", () => {
  test.skip(!process.env.PW_QA_DB_ENABLED, QA_DB_SKIP_REASON);

  test.beforeEach(async ({ mb }) => {
    const dialect = "postgres" as const;

    await mb.restore(`${dialect}-writable`);
    await resetManySchemasTable();
    await mb.signInAsAdmin();

    // Upstream passes no `tables`; this test reads the schema list the reset
    // just created, so gate on one of them.
    await resyncDatabase(mb.api, {
      dbId: WRITABLE_DB_ID,
      tables: ["Animals"],
    });
  });

  test("should not jump to the top of schema list when scrolling (metabase#28106)", async ({
    page,
  }) => {
    test.slow();

    await startNewQuestion(page);

    await miniPickerBrowseAll(page).click();
    const modal = entityPickerModal(page);
    await expect(modal).toBeVisible();
    await modal.getByText("Databases", { exact: true }).click();
    await modal.getByText("Writable Postgres12", { exact: true }).click();
    await modal.getByText("Schema A", { exact: true }).click();

    const schemasList = entityPickerModalLevel(page, 2).getByTestId(
      "scroll-container",
    );

    await expect(entityPickerModalLevel(page, 3)).toContainText("Animals");

    await schemasList.evaluate((element) => {
      element.scrollTop = element.scrollHeight;
    });

    // assert scrolling worked and the last item is visible
    await expect(
      entityPickerModalLevel(page, 2).getByText("Schema Z", { exact: true }),
    ).toBeVisible();

    // simulate scrolling up using mouse wheel 3 times
    await schemasList.hover();
    for (let i = 0; i < 3; ++i) {
      await page.mouse.wheel(0, -50);
      await page.waitForTimeout(100);
    }

    // assert first item does not exist - this means the list has not been scrolled to the top
    await expect(modal.getByText("Schema A", { exact: true })).toHaveCount(0);
    await expect
      .poll(() => schemasList.evaluate((element) => element.scrollTop))
      .toBeGreaterThan(0);
  });
});

test.describe("issue 32252", () => {
  test.beforeEach(async ({ mb }) => {
    await mb.restore("setup");
    await mb.signInAsAdmin();

    const collection = await createCollection(mb.api, { name: "My collection" });
    if (typeof collection.id !== "number") {
      throw new Error("collection.id is not a number");
    }

    await mb.api.createQuestion({
      name: "My question",
      collection_id: collection.id,
      query: { "source-table": ORDERS_ID },
    });
  });

  test("refreshes data picker sources after archiving a collection (metabase#32252)", async ({
    page,
  }) => {
    await page.goto("/");

    await clickNewButtonItem(page, "Question");
    await miniPicker(page).getByText("Our analytics", { exact: true }).click();
    await miniPicker(page).getByText("My collection", { exact: true }).click();
    await expect(
      miniPicker(page).getByText("My question", { exact: true }),
    ).toBeAttached();

    await page.getByTestId("sidebar-toggle").click();
    await navigationSidebar(page)
      .getByText("Our analytics", { exact: true })
      .click();

    await page
      .getByRole("button", { name: "Actions", exact: true })
      .nth(0)
      .click();
    await popover(page).getByText("Move to trash", { exact: true }).click();
    await expect(
      page.getByTestId("toast-undo").getByText("Trashed collection", {
        exact: true,
      }),
    ).toBeVisible();

    await clickNewButtonItem(page, "Question");
    await miniPicker(page).getByText("Our analytics", { exact: true }).click();
    await expect(
      miniPicker(page).getByText("My collection", { exact: true }),
    ).toHaveCount(0);
    await expect(
      miniPicker(page).getByText("My question", { exact: true }),
    ).toHaveCount(0);
  });

  test("refreshes data picker sources after archiving a question (metabase#32252)", async ({
    page,
  }) => {
    await page.goto("/");

    await clickNewButtonItem(page, "Question");
    await miniPicker(page).getByText("Our analytics", { exact: true }).click();
    await miniPicker(page).getByText("My collection", { exact: true }).click();
    await expect(
      miniPicker(page).getByText("My question", { exact: true }),
    ).toBeAttached();

    await page.getByTestId("sidebar-toggle").click();
    await navigationSidebar(page)
      .getByText("Our analytics", { exact: true })
      .click();

    await page
      .getByTestId("collection-entry-name")
      .getByText("My collection", { exact: true })
      .click();
    await page.getByRole("button", { name: "Actions", exact: true }).click();
    await popover(page).getByText("Move to trash", { exact: true }).click();
    await expect(
      page.getByTestId("toast-undo").getByText("Trashed question", {
        exact: true,
      }),
    ).toBeVisible();

    await clickNewButtonItem(page, "Question");
    await miniPicker(page).getByText("Our analytics", { exact: true }).click();
    await expect(
      miniPicker(page).getByText("My collection", { exact: true }),
    ).toHaveCount(0);
    await expect(
      miniPicker(page).getByText("My question", { exact: true }),
    ).toHaveCount(0);
  });
});

/** Port of H.newButton(menuItem).click(): open the app-bar New menu, pick the item. */
async function clickNewButtonItem(page: Page, item: string) {
  await page
    .getByTestId("app-bar")
    .getByRole("button", { name: "New", exact: true })
    .click();
  await popover(page).getByText(item, { exact: true }).click();
}
