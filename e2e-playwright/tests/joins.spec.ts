/**
 * Playwright port of e2e/test/scenarios/joins/joins.cy.spec.js
 *
 * Intercepts the Cypress original registers but never waits on are dropped:
 * the query_metadata alias in "should join structured questions" and the
 * dataset alias in "should allow joins with multiple conditions" (visualize()
 * owns that wait).
 */
import type { Page } from "@playwright/test";

import { icon } from "../support/dashboard-cards";
import { pickEntity } from "../support/dashboard";
import { test, expect } from "../support/fixtures";
import {
  addCustomColumn,
  addSummaryField,
  addSummaryGroupingField,
  assertJoinValid,
  filterNotebook,
  join,
  joinTable,
  openTableNotebook,
  selectFilterOperator,
  selectSavedQuestionsToJoin,
  summarizeNotebook,
  visitQuestionAdhocNotebook,
} from "../support/joins";
import {
  assertQueryBuilderRowCount,
  enterCustomColumnDetails,
  entityPickerModal,
  getNotebookStep,
  miniPicker,
  openNotebook,
  queryBuilderMain,
  startNewQuestion,
  visualize,
} from "../support/notebook";
import { createNativeQuestion } from "../support/sharing";
import { SAMPLE_DATABASE, SAMPLE_DB_ID } from "../support/sample-data";
import { popover } from "../support/ui";

const { ORDERS, ORDERS_ID, PRODUCTS, PRODUCTS_ID } = SAMPLE_DATABASE;

test.describe("scenarios > question > joined questions", () => {
  test.beforeEach(async ({ mb }) => {
    await mb.restore();
    await mb.signInAsAdmin();
  });

  test("should join raw tables (metabase#11452, metabase#12221, metabase#13468, metabase#15570)", async ({
    page,
  }) => {
    await openTableNotebook(page, ORDERS_ID);

    await join(page);
    await joinTable(page, "Reviews", "Product ID", "Product ID");

    await visualize(page);
    await assertJoinValid(page, {
      lhsTable: "Orders",
      rhsTable: "Reviews",
      lhsSampleColumn: "Product ID",
      rhsSampleColumn: "Reviews - Product → ID",
    });

    await openNotebook(page);
    await icon(getNotebookStep(page, "join"), "chevrondown").click();
    await popover(page).getByText("Product ID", { exact: true }).click();
    await popover(page).getByText("Body", { exact: true }).click();
    await popover(page).getByText("Created At", { exact: true }).click();
    await visualize(page);

    await assertJoinValid(page, {
      lhsTable: "Orders",
      rhsTable: "Reviews",
      lhsSampleColumn: "Product ID",
      rhsSampleColumn: "Reviews - Product → Reviewer",
    });
    await expect(
      queryBuilderMain(page).getByText("Body", { exact: true }),
    ).toHaveCount(0);

    // Post-join filters on the joined table (metabase#12221, metabase#15570)
    await openNotebook(page);
    await filterNotebook(page);
    await popover(page).getByText("Reviews", { exact: true }).click();
    await popover(page).getByText("Rating", { exact: true }).click();
    await selectFilterOperator(page, "Equal to");
    await popover(page).getByLabel("2", { exact: true }).click();
    await popover(page)
      .getByRole("button", { name: "Add filter", exact: true })
      .click();

    // Post-join aggregation (metabase#11452):
    await summarizeNotebook(page);
    await addSummaryField(page, {
      metric: "Average of ...",
      table: "Reviews",
      field: "Rating",
    });
    await addSummaryGroupingField(page, { table: "Reviews", field: "Reviewer" });

    await visualize(page);

    await expect(
      page
        .getByTestId("qb-filters-panel")
        .getByText("Reviews - Product → Rating is equal to 2", { exact: true }),
    ).toBeVisible();
    await assertQueryBuilderRowCount(page, 89);

    // Make sure UI overlay doesn't obstruct viewing results after we save this question (metabase#13468)
    await page
      .getByTestId("qb-header")
      .getByRole("button", { name: "Save", exact: true })
      .click();
    await page
      .getByTestId("save-question-modal")
      .getByLabel(/Where do you want to save this/)
      .click();
    await pickEntity(page, { path: ["Our analytics"] });
    await entityPickerModal(page)
      .getByRole("button", { name: "Select this collection", exact: true })
      .click();
    await page
      .getByTestId("save-question-modal")
      .getByRole("button", { name: "Save", exact: true })
      .click();

    await expect(
      page
        .getByTestId("qb-filters-panel")
        .getByText("Reviews - Product → Rating is equal to 2", { exact: true }),
    ).toBeVisible();
    await assertQueryBuilderRowCount(page, 89);
  });

  test("should join a native question (metabase#37100)", async ({
    page,
    mb,
  }) => {
    await createNativeQuestion(mb.api, {
      name: "question a",
      native: { query: "select ID, PRODUCT_ID, TOTAL from orders" },
    });

    await createNativeQuestion(mb.api, {
      name: "question b",
      native: { query: "select * from products" },
    });

    await page.goto("/");
    await startNewQuestion(page);
    await selectSavedQuestionsToJoin(page, "question a", "question b");
    await popover(page).getByText("PRODUCT_ID", { exact: true }).click();
    await popover(page).getByText("ID", { exact: true }).click();
    await page.keyboard.press("Escape");
    await visualize(page);
    await assertJoinValid(page, {
      lhsTable: "question a",
      rhsTable: "question b",
      lhsSampleColumn: "TOTAL",
      rhsSampleColumn: "question b - PRODUCT_ID → ID",
    });

    await openNotebook(page);
    await icon(getNotebookStep(page, "join"), "chevrondown").click();
    await popover(page)
      .getByText("question b - PRODUCT_ID → EAN", { exact: true })
      .click();
    await popover(page)
      .getByText("question b - PRODUCT_ID → VENDOR", { exact: true })
      .click();
    await popover(page)
      .getByText("question b - PRODUCT_ID → PRICE", { exact: true })
      .click();
    await popover(page)
      .getByText("question b - PRODUCT_ID → CATEGORY", { exact: true })
      .click();
    await popover(page)
      .getByText("question b - PRODUCT_ID → CREATED_AT", { exact: true })
      .click();
    await page.keyboard.press("Escape");
    await visualize(page);
    await assertJoinValid(page, {
      lhsTable: "question a",
      rhsTable: "question b",
      lhsSampleColumn: "TOTAL",
      rhsSampleColumn: "question b - PRODUCT_ID → RATING",
    });
    await expect(
      queryBuilderMain(page).getByText("EAN", { exact: true }),
    ).toHaveCount(0);

    await openNotebook(page);
    await filterNotebook(page);
    await popover(page).getByText("question b", { exact: true }).click();
    await popover(page)
      .getByText("question b - PRODUCT_ID → CATEGORY", { exact: true })
      .click();
    await selectFilterOperator(page, "Is");
    await popover(page)
      .getByPlaceholder("Enter some text", { exact: true })
      .pressSequentially("Gadget");
    await popover(page)
      .getByRole("button", { name: "Add filter", exact: true })
      .click();

    await summarizeNotebook(page);
    await addSummaryGroupingField(page, {
      table: "question b",
      field: "question b - PRODUCT_ID → CATEGORY",
    });
    await visualize(page);

    await expect(
      page
        .getByTestId("qb-filters-panel")
        .getByText("question b - PRODUCT_ID → CATEGORY is Gadget", {
          exact: true,
        }),
    ).toBeVisible();
    await expect(
      page.getByTestId("scalar-value").getByText(/Gadget/),
    ).toBeVisible();
  });

  test("should join structured questions (metabase#13000, metabase#13649, metabase#13744)", async ({
    page,
    mb,
  }) => {
    await mb.api.createQuestion({
      name: "Q1",
      query: {
        aggregation: ["sum", ["field", ORDERS.TOTAL, null]],
        breakout: [["field", ORDERS.PRODUCT_ID, null]],
        // Make sure it works if a question has sorted metric (metabase#13744)
        "order-by": [["asc", ["aggregation", 0]]],
        "source-table": ORDERS_ID,
      },
    });

    await mb.api.createQuestion({
      name: "Q2",
      query: {
        aggregation: ["sum", ["field", PRODUCTS.RATING, null]],
        breakout: [["field", PRODUCTS.ID, null]],
        "source-table": PRODUCTS_ID,
      },
    });

    await page.goto("/");
    await startNewQuestion(page);
    await selectSavedQuestionsToJoin(page, "Q1", "Q2");
    await visualize(page);

    await assertJoinValid(page, {
      lhsTable: "Q1",
      rhsTable: "Q2",
      lhsSampleColumn: "Product ID",
      rhsSampleColumn: "Q2 - Product → ID",
    });

    await openNotebook(page);
    await icon(getNotebookStep(page, "join"), "chevrondown").click();
    await popover(page).getByText("Q2 - Product → ID", { exact: true }).click();
    await visualize(page);

    await assertJoinValid(page, {
      lhsTable: "Q1",
      rhsTable: "Q2",
      lhsSampleColumn: "Product ID",
      rhsSampleColumn: "Q2 - Product → Sum of Rating",
    });
    await expect(
      queryBuilderMain(page).getByText("Q2 → ID", { exact: true }),
    ).toHaveCount(0);

    await openNotebook(page);
    // add a custom column on top of the steps from the #13000 repro which was simply asserting
    // that a question could be made by joining two previously saved questions
    await addCustomColumn(page);
    await enterCustomColumnDetails(page, {
      formula: "[Q2 - Product → Sum of Rating] / [Sum of Total]",
      name: "Sum Divide",
    });
    await popover(page)
      .getByRole("button", { name: "Done", exact: true })
      .click();

    await filterNotebook(page);
    await popover(page).getByText("Q2", { exact: true }).click();
    await popover(page).getByText("Q2 - Product → ID", { exact: true }).click();
    await popover(page)
      .getByPlaceholder("Enter an ID", { exact: true })
      .pressSequentially("12");
    await popover(page)
      .getByRole("button", { name: "Add filter", exact: true })
      .click();

    await visualize(page);
    await expect(
      queryBuilderMain(page).getByText("Sum Divide", { exact: true }),
    ).toBeVisible();

    await expect(
      page
        .getByTestId("qb-filters-panel")
        .getByText("Q2 - Product → ID is 12", { exact: true }),
    ).toBeVisible();
  });

  test("should handle joins on different stages", async ({ page }) => {
    await openTableNotebook(page, ORDERS_ID);

    await join(page);
    await joinTable(page, "Products");

    await summarizeNotebook(page);
    await addSummaryField(page, { metric: "Count of rows" });
    await addSummaryGroupingField(page, { table: "Products", field: "ID" });

    await page
      .getByTestId("action-buttons")
      .last()
      .getByRole("button", { name: "Join data", exact: true })
      .click();
    await joinTable(page, "Reviews");
    await visualize(page);

    await assertJoinValid(page, {
      lhsSampleColumn: "Count",
      rhsSampleColumn: "Reviews → ID",
    });
    await assertQueryBuilderRowCount(page, 1136);
  });

  test("should allow joins with multiple conditions", async ({ page }) => {
    await openTableNotebook(page, ORDERS_ID);

    await join(page);
    await joinTable(page, "Products");
    await selectJoinStrategy(page, "Inner join");

    await icon(getNotebookStep(page, "join"), "add").click();
    await popover(page).getByText("Created At", { exact: true }).click();
    await popover(page).getByText("Created At", { exact: true }).click();

    await visualize(page);

    await assertJoinValid(page, {
      lhsTable: "Orders",
      rhsTable: "Products",
      lhsSampleColumn: "Product ID",
      rhsSampleColumn: "Products → ID",
    });
    await assertQueryBuilderRowCount(page, 415);
  });

  test("should sync join condition's date-time column units", async ({
    page,
  }) => {
    await openTableNotebook(page, ORDERS_ID);

    await join(page);
    await joinTable(page, "Products");
    await selectJoinStrategy(page, "Inner join");

    // Test LHS column infers RHS column's temporal unit

    await page.getByLabel("Left column", { exact: true }).click();
    await popover(page).getByText("Created At", { exact: true }).click();

    await page.getByLabel("Right column", { exact: true }).click();
    await popover(page)
      .getByText("by month", { exact: true })
      .click({ force: true });
    await popover(page).last().getByText("Week", { exact: true }).click();

    await assertJoinColumnName(page, "left", "Created At: Week");
    await assertJoinColumnName(page, "right", "Created At: Week");

    // Test changing a temporal unit on one column would update a second one

    await page.getByLabel("Right column", { exact: true }).click();
    await popover(page)
      .getByText("by week", { exact: true })
      .click({ force: true });
    await popover(page).last().getByText("Day", { exact: true }).click();

    await assertJoinColumnName(page, "left", "Created At: Day");
    await assertJoinColumnName(page, "right", "Created At: Day");

    await summarizeNotebook(page);
    await addSummaryField(page, { metric: "Count of rows" });

    await visualize(page);

    await expect(
      page.getByTestId("scalar-value").getByText(/2,087/),
    ).toBeVisible();
  });

  test("should remove a join when changing the source table", async ({
    page,
  }) => {
    await visitQuestionAdhocNotebook(page, {
      dataset_query: {
        type: "query",
        database: SAMPLE_DB_ID,
        query: {
          "source-table": ORDERS_ID,
          joins: [
            {
              alias: "Products",
              condition: [
                "=",
                ["field", ORDERS.PRODUCT_ID, null],
                ["field", PRODUCTS.ID, { "join-alias": "Products" }],
              ],
              fields: "all",
              "source-table": PRODUCTS_ID,
            },
          ],
        },
      },
    });

    await getNotebookStep(page, "data").getByTestId("data-step-cell").click();
    await miniPicker(page).getByText("People", { exact: true }).click();

    await expect(getNotebookStep(page, "join")).toHaveCount(0);

    await visualize(page);
    await expect(queryBuilderMain(page).getByText(/Product/)).toHaveCount(0);
  });
});

async function selectJoinStrategy(page: Page, strategy: string) {
  await page.getByLabel("Change join type", { exact: true }).click();
  await popover(page).getByText(strategy, { exact: true }).click();
}

async function assertJoinColumnName(
  page: Page,
  side: "left" | "right",
  name: string,
) {
  const label = side === "left" ? "Left column" : "Right column";
  await expect(
    page.getByLabel(label, { exact: true }).getByText(name, { exact: true }),
  ).toBeVisible();
}
