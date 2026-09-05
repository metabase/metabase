/**
 * Playwright port of
 * e2e/test/scenarios/question/notebook-link-to-data-source.cy.spec.ts
 *
 * In the notebook editor the data-source row (and each join's "Right table")
 * links to the underlying table/model/question: a plain click opens the entity
 * picker, a ctrl/cmd-click opens the source in a new tab. The app opens the new
 * tab via window.open(url, "_blank"); like the Cypress original, we override
 * window.open to navigate the current page instead (openDataSourceInSameTab) so
 * the resulting page can be asserted on.
 *
 * Notes on the port:
 * - H.holdMetaKey → metaClick (click with the "ControlOrMeta" modifier).
 * - cy.wait("@dataset") that follows visualize() is re-registered as a fresh
 *   waitForResponse before the meta-click that actually fires it (Cypress reuses
 *   the persistent intercept; Playwright waits must be armed before the action).
 * - cy.location("pathname").should("eq", …) → expect.poll on the URL pathname
 *   (one-shot checks race the client-side navigation).
 * - The sandboxing describe is gated on the pro-self-hosted token like the other
 *   EE ports; the jar activates it.
 */
import type { Page, Response } from "@playwright/test";

import { resolveToken } from "../support/api";
import { openProductsTable, openReviewsTable } from "../support/ad-hoc-question";
import { sandboxTable, updatePermissionsGraph } from "../support/dashboard-repros";
import {
  createNativeQuestion,
  createQuestion,
} from "../support/factories";
import { test, expect } from "../support/fixtures";
import { join, visitQuestionAdhocNotebook } from "../support/joins";
import { visitModel, tableInteractive, waitForDataset } from "../support/models";
import {
  getNotebookStep,
  miniPicker,
  openNotebook,
  visualize,
} from "../support/notebook";
import {
  METAKEY,
  SANDBOXED_ATTR_UID,
  assertDatasetReqIsSandboxed,
  metaClick,
  openDataSourceInSameTab,
} from "../support/notebook-link-to-data-source";
import { ORDERS_COUNT_QUESTION_ID, ORDERS_MODEL_ID } from "../support/organization";
import { ADMIN_PERSONAL_COLLECTION_ID } from "../support/permissions";
import { SAMPLE_DATABASE, SAMPLE_DB_ID } from "../support/sample-data";
import { tableInteractiveBody } from "../support/table-column-settings";
import { main, popover, visitQuestion } from "../support/ui";

const { ORDERS, ORDERS_ID, PRODUCTS_ID, REVIEWS, REVIEWS_ID, PEOPLE_ID, PRODUCTS } =
  SAMPLE_DATABASE;

/** ALL_USERS group id (cypress_sample_instance_data.js). */
const ALL_USERS_GROUP_ID = 1;

/** POST /api/dataset response — the wait behind the Cypress "@dataset" alias. */
function waitForDatasetResponse(page: Page): Promise<Response> {
  return waitForDataset(page);
}

function dataSource(page: Page, name: string) {
  return getNotebookStep(page, "data").getByText(name, { exact: true });
}

async function expectPathname(page: Page, pathname: string) {
  await expect
    .poll(() => new URL(page.url()).pathname)
    .toBe(pathname);
}

test.describe("scenarios > notebook > link to data source", () => {
  test.beforeEach(async ({ page, mb }) => {
    await mb.restore();
    await mb.signInAsAdmin();
    await openDataSourceInSameTab(page);
  });

  test("smoke test", async ({ page }) => {
    await openReviewsTable(page, { mode: "notebook" });

    // Normal click on the data source still opens the entity picker
    await dataSource(page, "Reviews").click();
    await expect(miniPicker(page)).toBeVisible();
    // close miniPicker
    await miniPicker(page).getByText("Reviews", { exact: true }).first().click();

    // Meta/Ctrl click on the fields picker behaves as a regular click
    await metaClick(
      getNotebookStep(page, "data").getByTestId("fields-picker"),
    );
    await popover(page).getByText("Select all", { exact: true }).click();
    // Regular click on the fields picker again to close the popover
    await getNotebookStep(page, "data").getByTestId("fields-picker").click();

    // Mid-test sanity-check assertion
    await visualize(page);
    await expect(page.getByTestId("header-cell")).toHaveCount(1);
    await expect(page.getByTestId("header-cell")).toHaveText("ID");

    // Deselecting columns should have no effect on the linked data source in a
    // new tab/window
    await openNotebook(page);

    // Make sure tooltip is being shown on hover
    await expect(dataSource(page, "Reviews")).toBeVisible();
    await dataSource(page, "Reviews").hover();
    await expect(page.getByRole("tooltip").first()).toHaveText(
      `${METAKEY}+click to open in new tab`,
    );

    const dataset = waitForDatasetResponse(page);
    await metaClick(dataSource(page, "Reviews"));
    await dataset; // already intercepted in `visualize()`

    // Make sure Reviews table is rendered in a simple mode
    await expect(
      page.getByTestId("header-cell").filter({ hasText: "Reviewer" }).first(),
    ).toBeVisible();
    await expect(tableInteractive(page)).toContainText("xavier");
    await expect(page.getByTestId("question-row-count")).toHaveText(
      "Showing 1,112 rows",
    );

    await expect(page.getByTestId("qb-save-button")).toBeEnabled();
  });

  test.describe("questions", () => {
    test("should open the source table from a simple question", async ({
      page,
    }) => {
      await visitQuestion(page, ORDERS_COUNT_QUESTION_ID);
      await openNotebook(page);
      await metaClick(dataSource(page, "Orders"));

      // Make sure Orders table is rendered in a simple mode
      await expect(
        page.getByTestId("header-cell").filter({ hasText: "Subtotal" }).first(),
      ).toBeVisible();
      await expect(tableInteractive(page)).toContainText("37.65");
      await expect(page.getByTestId("question-row-count")).toHaveText(
        "Showing first 2,000 rows",
      );

      await expect(page.getByTestId("qb-save-button")).toBeEnabled();
    });

    test("should open the source question from a nested question", async ({
      page,
      mb,
    }) => {
      const card = await createQuestion(mb.api, {
        name: "Nested question based on a question",
        query: { "source-table": `card__${ORDERS_COUNT_QUESTION_ID}` },
      });
      await visitQuestion(page, card.id);

      await openNotebook(page);
      await metaClick(dataSource(page, "Orders, Count"));

      // Make sure the source question rendered in a simple mode
      await expectPathname(
        page,
        `/question/${ORDERS_COUNT_QUESTION_ID}-orders-count`,
      );
      await expect(page.getByTestId("header-cell")).toHaveCount(1);
      await expect(page.getByTestId("header-cell")).toHaveText("Count");
      await expect(tableInteractive(page)).toContainText("18,760");
      await expect(page.getByTestId("question-row-count")).toHaveText(
        "Showing 1 row",
      );

      // Question is not dirty
      await expect(page.getByTestId("qb-save-button")).toHaveCount(0);
    });

    test("should open the source question from a nested question where the source is native question", async ({
      page,
      mb,
    }) => {
      const source = {
        name: "Native source",
        native: { query: "select 1 as foo", "template-tags": {} },
      };
      const sourceQuestion = await createNativeQuestion(mb.api, source);
      const card = await createQuestion(mb.api, {
        name: "Nested question based on a native question",
        query: { "source-table": `card__${sourceQuestion.id}` },
      });
      await visitQuestion(page, card.id);

      await openNotebook(page);
      await metaClick(dataSource(page, source.name));

      // Make sure the source question rendered in a simple mode
      await expectPathname(page, `/question/${sourceQuestion.id}-native-source`);

      await expect(page.getByTestId("header-cell")).toHaveCount(1);
      await expect(page.getByTestId("header-cell")).toHaveText("FOO");
      await expect(
        tableInteractiveBody(page).getByTestId("cell-data").first(),
      ).toHaveText("1");
      await expect(page.getByTestId("question-row-count")).toHaveText(
        "Showing 1 row",
      );

      // Question is not dirty
      await expect(page.getByTestId("qb-save-button")).toHaveCount(0);
    });

    test("should open the source model from a nested question", async ({
      page,
      mb,
    }) => {
      const card = await createQuestion(mb.api, {
        name: "Nested question based on a model",
        query: { "source-table": `card__${ORDERS_MODEL_ID}` },
      });
      await visitQuestion(page, card.id);

      await openNotebook(page);
      await metaClick(dataSource(page, "Orders Model"));

      // Make sure the source model is rendered in a simple mode
      await expectPathname(page, `/model/${ORDERS_MODEL_ID}-orders-model`);
      await expect(
        page.getByTestId("header-cell").filter({ hasText: "Subtotal" }).first(),
      ).toBeVisible();
      await expect(tableInteractive(page)).toContainText("37.65");
      await expect(page.getByTestId("question-row-count")).toHaveText(
        "Showing first 2,000 rows",
      );

      // Model is not dirty
      await expect(page.getByTestId("qb-save-button")).toHaveCount(0);
    });

    test("should open the source model from a nested question where the source is native model", async ({
      page,
      mb,
    }) => {
      const source = {
        name: "Native source",
        native: { query: "select 1 as foo", "template-tags": {} },
        type: "model",
      };
      const sourceQuestion = await createNativeQuestion(mb.api, source);
      const card = await createQuestion(mb.api, {
        name: "Nested question based on a native question",
        query: { "source-table": `card__${sourceQuestion.id}` },
      });
      await visitQuestion(page, card.id);

      await openNotebook(page);
      await metaClick(dataSource(page, sourceQuestion.name as string));

      // Make sure the source model rendered in a simple mode
      await expectPathname(page, `/model/${sourceQuestion.id}-native-source`);

      await expect(page.getByTestId("scalar-value")).toHaveText("1");
      await expect(page.getByTestId("question-row-count")).toHaveText(
        "Showing 1 row",
      );

      // Model is not dirty
      await expect(page.getByTestId("qb-save-button")).toHaveCount(0);
    });

    test('should open the "trash" if the source question has been archived', async ({
      page,
      mb,
    }) => {
      const nestedQuestion = await createQuestion(mb.api, {
        name: "Nested question based on a question",
        query: { "source-table": `card__${ORDERS_COUNT_QUESTION_ID}` },
      });
      // Move the source question to the trash
      await mb.api.put(`/api/card/${ORDERS_COUNT_QUESTION_ID}`, {
        archived: true,
      });
      await visitQuestion(page, nestedQuestion.id);

      await openNotebook(page);
      await metaClick(dataSource(page, "Orders, Count"));

      // Make sure the source question opens in the "trash"
      await expectPathname(
        page,
        `/question/${ORDERS_COUNT_QUESTION_ID}-orders-count`,
      );
      await expect(page.getByTestId("archive-banner")).toContainText(
        "This question is in the trash",
      );
    });
  });

  test.describe("models", () => {
    test("should open the underlying model", async ({ page }) => {
      await visitModel(page, ORDERS_MODEL_ID);
      await openNotebook(page);
      await metaClick(dataSource(page, "Orders Model"));

      // Make sure the source model is rendered in a simple mode
      await expectPathname(page, `/model/${ORDERS_MODEL_ID}-orders-model`);
      await expect(
        page.getByTestId("header-cell").filter({ hasText: "Subtotal" }).first(),
      ).toBeVisible();
      await expect(tableInteractive(page)).toContainText("37.65");
      await expect(page.getByTestId("question-row-count")).toHaveText(
        "Showing first 2,000 rows",
      );

      // Model is not dirty
      await expect(page.getByTestId("qb-save-button")).toHaveCount(0);
    });

    test("should open the underlying native model", async ({ page, mb }) => {
      const model = {
        name: "Native model",
        native: { query: "select 1 as foo", "template-tags": {} },
        type: "model",
      };
      const { id, name } = await createNativeQuestion(mb.api, model);
      await visitModel(page, id);

      await openNotebook(page);
      await metaClick(dataSource(page, name as string));

      // Make sure the source model rendered in a simple mode
      await expectPathname(page, `/model/${id}-native-model`);

      await expect(page.getByTestId("scalar-value")).toHaveText("1");
      await expect(page.getByTestId("question-row-count")).toHaveText(
        "Showing 1 row",
      );

      // Model is not dirty
      await expect(page.getByTestId("qb-save-button")).toHaveCount(0);
    });

    test("should open the nested model (based on a question) as the data source", async ({
      page,
      mb,
    }) => {
      const nestedModel = await createQuestion(mb.api, {
        name: "Nested model based on a question",
        query: { "source-table": `card__${ORDERS_COUNT_QUESTION_ID}` },
        type: "model",
      });
      await visitModel(page, nestedModel.id);

      await openNotebook(page);
      await metaClick(dataSource(page, "Nested model based on a question"));

      // Make sure the source model is rendered in a simple mode
      await expectPathname(
        page,
        `/model/${nestedModel.id}-nested-model-based-on-a-question`,
      );
      await expect(page.getByTestId("scalar-value")).toHaveText("18,760");
      await expect(page.getByTestId("question-row-count")).toHaveText(
        "Showing 1 row",
      );

      // Model is not dirty
      await expect(page.getByTestId("qb-save-button")).toHaveCount(0);
    });

    test("should open the nested model (based on a model) as the data source", async ({
      page,
      mb,
    }) => {
      const nestedModel = await createQuestion(mb.api, {
        name: "Nested model based on a model",
        query: { "source-table": `card__${ORDERS_MODEL_ID}` },
        type: "model",
      });
      await visitModel(page, nestedModel.id);

      await openNotebook(page);
      await metaClick(dataSource(page, "Nested model based on a model"));

      // Make sure the source model is rendered in a simple mode
      await expectPathname(
        page,
        `/model/${nestedModel.id}-nested-model-based-on-a-model`,
      );
      await expect(
        page.getByTestId("header-cell").filter({ hasText: "Subtotal" }).first(),
      ).toBeVisible();
      await expect(tableInteractive(page)).toContainText("37.65");
      await expect(page.getByTestId("question-row-count")).toHaveText(
        "Showing first 2,000 rows",
      );

      // Model is not dirty
      await expect(page.getByTestId("qb-save-button")).toHaveCount(0);
    });
  });

  test.describe("permissions", () => {
    test("shouldn't show the source question if it lives in a collection that user can't see", async ({
      page,
      mb,
    }) => {
      const nestedQuestion = await createQuestion(mb.api, {
        name: "Nested question based on a question",
        query: { "source-table": `card__${ORDERS_COUNT_QUESTION_ID}` },
      });
      // Move the source question to admin's personal collection
      await mb.api.put(`/api/card/${ORDERS_COUNT_QUESTION_ID}`, {
        collection_id: ADMIN_PERSONAL_COLLECTION_ID,
      });

      await mb.signInAsNormalUser();
      await visitQuestion(page, nestedQuestion.id);

      // We should not even show the notebook icon
      await expect(
        page.getByTestId("qb-header-action-panel").locator(".Icon-notebook"),
      ).toHaveCount(0);

      // Even if user opens the notebook link directly, they should not see the
      // source question. We open the entity picker instead
      await page.goto(`/question/${nestedQuestion.id}/notebook`);

      await expect(
        getNotebookStep(page, "data").getByPlaceholder(
          "Search for tables and more...",
          { exact: true },
        ),
      ).toBeVisible();
      await expect(miniPicker(page)).toBeVisible();

      // The same should be true for a user that additionally doesn't have write
      // query permissions
      await mb.signIn("nodata");
      await visitQuestion(page, nestedQuestion.id);
      await expect(
        page.getByTestId("qb-header-action-panel").locator(".Icon-notebook"),
      ).toHaveCount(0);

      await page.goto(`/question/${nestedQuestion.id}/notebook`);
      await expect.poll(() => page.url()).toContain("/unauthorized");
      await expect(
        main(page).getByText("Sorry, you don’t have permission to see that.", {
          exact: true,
        }),
      ).toBeVisible();
    });

    test("user with the curate collection permissions but without write query permissions shouldn't be able to see/open the source question", async ({
      page,
      mb,
    }) => {
      const nestedQuestion = await createQuestion(mb.api, {
        name: "Nested question based on a question",
        query: { "source-table": `card__${ORDERS_COUNT_QUESTION_ID}` },
      });
      await mb.signIn("nodata");
      await visitQuestion(page, nestedQuestion.id);

      // We should not even show the notebook icon
      await expect(
        page.getByTestId("qb-header-action-panel").locator(".Icon-notebook"),
      ).toHaveCount(0);

      // TODO update the following once metabase#46398 is fixed
      // await page.goto(`/question/${nestedQuestion.id}/notebook`);
    });

    test.describe("sandboxing", () => {
      test.skip(
        !resolveToken("pro-self-hosted"),
        "needs the pro-self-hosted token (sandboxing)",
      );

      test.beforeEach(async ({ mb }) => {
        await mb.api.activateToken("pro-self-hosted");

        await updatePermissionsGraph(mb.api, {
          [ALL_USERS_GROUP_ID]: {
            [SAMPLE_DB_ID]: {
              "view-data": "blocked",
            },
          },
        });

        await sandboxTable(mb.api, {
          table_id: ORDERS_ID,
          attribute_remappings: {
            attr_uid: [
              "dimension",
              ["field", ORDERS.USER_ID, { "base-type": "type/Integer" }],
            ],
          },
        });

        await mb.signInAsSandboxedUser();
      });

      test("should work for sandboxed users when opening a table/question/model", async ({
        page,
      }) => {
        await visitModel(page, ORDERS_MODEL_ID);
        await expect(page.getByTestId("question-row-count")).toHaveText(
          "Showing 11 rows",
        );
        await openNotebook(page);

        const dataset = waitForDatasetResponse(page);
        await metaClick(dataSource(page, "Orders Model"));
        const response = await dataset;

        await expect(page.getByTestId("question-row-count")).toHaveText(
          "Showing 11 rows",
        );
        await assertDatasetReqIsSandboxed(response);
      });

      test("should work for sandboxed users when joined table is sandboxed", async ({
        page,
      }) => {
        await openProductsTable(page, { mode: "notebook" });
        await join(page);
        await miniPicker(page)
          .getByText("Sample Database", { exact: true })
          .click();
        await miniPicker(page).getByText("Orders", { exact: true }).click();

        const rightTable = getNotebookStep(page, "join").getByLabel(
          "Right table",
          { exact: true },
        );
        await expect(rightTable).toHaveText("Orders");

        const dataset = waitForDatasetResponse(page);
        await metaClick(rightTable);
        const response = await dataset;

        await expect(page.getByTestId("question-row-count")).toHaveText(
          "Showing 11 rows",
        );
        await assertDatasetReqIsSandboxed(response, {
          columnId: ORDERS.USER_ID,
          columnAssertion: SANDBOXED_ATTR_UID,
        });
      });
    });
  });

  test.describe("joins", () => {
    const getQuery = (id: number) => ({
      dataset_query: {
        database: SAMPLE_DB_ID,
        type: "query" as const,
        query: {
          "source-table": PRODUCTS_ID,
          joins: [
            {
              fields: "all",
              strategy: "left-join",
              alias: "Orders Model",
              condition: [
                "=",
                ["field", PRODUCTS.ID, { "base-type": "type/BigInteger" }],
                [
                  "field",
                  "PRODUCT_ID",
                  { "base-type": "type/Integer", "join-alias": "Orders Model" },
                ],
              ],
              "source-table": `card__${ORDERS_MODEL_ID}`,
            },
            {
              fields: "all",
              strategy: "right-join",
              alias: "People - User",
              condition: [
                "=",
                [
                  "field",
                  ORDERS.USER_ID,
                  { "base-type": "type/Integer", "join-alias": "Orders Model" },
                ],
                [
                  "field",
                  "ID",
                  {
                    "base-type": "type/BigInteger",
                    "join-alias": "People - User",
                  },
                ],
              ],
              "source-table": `card__${id}`,
            },
            {
              fields: "all",
              strategy: "inner-join",
              alias: "Reviews",
              condition: [
                "=",
                ["field", PRODUCTS.ID, { "base-type": "type/BigInteger" }],
                [
                  "field",
                  REVIEWS.PRODUCT_ID,
                  { "base-type": "type/Integer", "join-alias": "Reviews" },
                ],
              ],
              "source-table": REVIEWS_ID,
            },
          ],
        },
        parameters: [],
      },
    });

    test("rhs joined data sources should open in a new tab on the meta/ctrl click", async ({
      page,
      mb,
    }) => {
      const savedQuestion = await createQuestion(mb.api, {
        name: "People - Saved Question",
        query: { "source-table": PEOPLE_ID },
      });
      const queryWithMultipleJoins = getQuery(savedQuestion.id);
      await visitQuestionAdhocNotebook(page, queryWithMultipleJoins);

      // Model should open in a new tab
      await expect(
        getNotebookStep(page, "join", { stage: 0, index: 0 }).getByLabel(
          "Right table",
          { exact: true },
        ),
      ).toHaveText("Orders Model");
      await metaClick(
        getNotebookStep(page, "join", { stage: 0, index: 0 }).getByLabel(
          "Right table",
          { exact: true },
        ),
      );

      await expectPathname(page, `/model/${ORDERS_MODEL_ID}-orders-model`);
      await expect(
        page.getByTestId("header-cell").filter({ hasText: "Subtotal" }).first(),
      ).toBeVisible();
      await expect(tableInteractive(page)).toContainText("37.65");
      await expect(page.getByTestId("question-row-count")).toHaveText(
        "Showing first 2,000 rows",
      );
      // Model is not dirty
      await expect(page.getByTestId("qb-save-button")).toHaveCount(0);
      await page.goBack();

      // Saved question should open in a new tab
      await expect(
        getNotebookStep(page, "join", { stage: 0, index: 1 }).getByLabel(
          "Right table",
          { exact: true },
        ),
      ).toHaveText(savedQuestion.name as string);
      await metaClick(
        getNotebookStep(page, "join", { stage: 0, index: 1 }).getByLabel(
          "Right table",
          { exact: true },
        ),
      );

      await expectPathname(
        page,
        `/question/${savedQuestion.id}-people-saved-question`,
      );
      await expect(
        page.getByTestId("header-cell").filter({ hasText: "City" }).first(),
      ).toBeVisible();
      await expect(tableInteractive(page)).toContainText("Beaver Dams");
      await expect(page.getByTestId("question-row-count")).toHaveText(
        "Showing first 2,000 rows",
      );
      // Question is not dirty
      await expect(page.getByTestId("qb-save-button")).toHaveCount(0);
      await page.goBack();

      // Raw table should open in a new tab
      await expect(
        getNotebookStep(page, "join", { stage: 0, index: 2 }).getByLabel(
          "Right table",
          { exact: true },
        ),
      ).toHaveText("Reviews");
      await metaClick(
        getNotebookStep(page, "join", { stage: 0, index: 2 }).getByLabel(
          "Right table",
          { exact: true },
        ),
      );

      await expect(
        page.getByTestId("header-cell").filter({ hasText: "Reviewer" }).first(),
      ).toBeVisible();
      await expect(tableInteractive(page)).toContainText("xavier");
      await expect(page.getByTestId("question-row-count")).toHaveText(
        "Showing 1,112 rows",
      );
      // Raw table is dirty by default
      await expect(page.getByTestId("qb-save-button")).toBeEnabled();
      await page.goBack();

      // Join type selector behaves the same regardless of the click keyboard
      // modifiers
      await metaClick(
        getNotebookStep(page, "join").getByLabel("Change join type", {
          exact: true,
        }),
      );
      await expect(popover(page).getByText("Inner join").first()).toBeVisible();

      // Pick columns selector behaves the same regardless of the click keyboard
      // modifiers
      await metaClick(
        getNotebookStep(page, "join").getByLabel("Pick columns", {
          exact: true,
        }),
      );
      await expect(popover(page).getByText("Discount").first()).toBeVisible();

      // Left column join condition selector behaves the same regardless of the
      // click keyboard modifiers
      await metaClick(
        getNotebookStep(page, "join").getByLabel("Left column", {
          exact: true,
        }),
      );
      await expect(popover(page).getByText("Vendor").first()).toBeVisible();

      // Operator selector behaves the same regardless of the click keyboard
      // modifiers
      await metaClick(
        getNotebookStep(page, "join").getByLabel("Change operator", {
          exact: true,
        }),
      );
      await expect(popover(page).getByText(">=").first()).toBeVisible();

      // Right column join condition selector behaves the same regardless of the
      // click keyboard modifiers
      await metaClick(
        getNotebookStep(page, "join").getByLabel("Right column", {
          exact: true,
        }),
      );
      await expect(popover(page).getByText("Discount").first()).toBeVisible();

      // New join condition button behaves the same regardless of the click
      // keyboard modifiers
      await metaClick(
        getNotebookStep(page, "join").getByLabel("Add condition", {
          exact: true,
        }),
      );
      await expect(page.getByTestId("new-join-condition")).toBeVisible();
    });
  });
});

