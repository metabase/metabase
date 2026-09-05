/**
 * Playwright port of
 * e2e/test/scenarios/custom-column/cc-boolean-functions.cy.spec.ts
 *
 * Boolean custom-column functions (starts-with, not, !=, min/max of a boolean,
 * etc.) typed into the CodeMirror expression editor, then asserted in the QB
 * result table, on filters/aggregations/breakouts/sorts across stages and
 * source cards, and finally through dashboard click behaviors.
 *
 * The `cy.wait("@dataset")` after each H.visualize() is folded into the
 * visualize() helper (it already waits for the POST /api/dataset). The dataset
 * intercept survives only for the dashboard click-behavior drill, where the
 * cell click navigates to an ad-hoc question — waited on explicitly there.
 *
 * `firstRows` values that upstream wrote as the number 1 are ported as the
 * rendered text "1" (assertTableData asserts have.text).
 */
import type { Page } from "@playwright/test";

import {
  EXPRESSION_NAME,
  createDashboardWithQuestion,
  dashboardQuestionDetails,
  parameterDetails,
} from "../support/cc-boolean-functions";
import { createQuestion } from "../support/factories";
import { test, expect } from "../support/fixtures";
import { assertTableData } from "../support/multiple-column-breakouts";
import {
  assertQueryBuilderRowCount,
  enterCustomColumnDetails,
  entityPickerModal,
  getNotebookStep,
  openNotebook,
  tableHeaderClick,
  visualize,
} from "../support/notebook";
import { SAMPLE_DATABASE } from "../support/sample-data";
import {
  editDashboard,
  getDashboardCard,
  saveDashboard,
  sidebar,
} from "../support/dashboard";
import { showDashboardCardActions } from "../support/dashboard-cards";
import { popover, visitDashboard, visitQuestion } from "../support/ui";
import type { StructuredQuestionDetails } from "../support/factories";

const { PRODUCTS_ID, PRODUCTS } = SAMPLE_DATABASE;

const expressionName = EXPRESSION_NAME;

function waitForDataset(page: Page) {
  return page.waitForResponse(
    (response) =>
      response.request().method() === "POST" &&
      new URL(response.url()).pathname === "/api/dataset",
  );
}

test.describe("scenarios > custom column > boolean functions", () => {
  test.beforeEach(async ({ mb }) => {
    await mb.restore();
    await mb.signInAsNormalUser();
  });

  test.describe("query builder", () => {
    test.describe("same stage", () => {
      const questionDetails: StructuredQuestionDetails = {
        query: {
          "source-table": PRODUCTS_ID,
          fields: [
            ["field", PRODUCTS.CATEGORY, null],
            ["expression", expressionName, { "base-type": "type/Boolean" }],
          ],
          expressions: {
            [expressionName]: [
              "starts-with",
              ["field", PRODUCTS.CATEGORY, null],
              "Gi",
            ],
          },
        },
      };

      test("should be able to add a same-stage custom column", async ({
        page,
        mb,
      }) => {
        const { id } = await createQuestion(mb.api, questionDetails);
        await visitQuestion(page, id);
        await openNotebook(page);

        // add an identity column
        await getNotebookStep(page, "expression").locator(".Icon-add").click();
        await enterCustomColumnDetails(page, {
          formula: `[${expressionName}]`,
          name: "Identity column",
        });
        await popover(page)
          .getByRole("button", { name: "Done", exact: true })
          .click();

        // add a simple expression
        await getNotebookStep(page, "expression").locator(".Icon-add").click();
        await enterCustomColumnDetails(page, {
          formula: `[${expressionName}] != True`,
          name: "Simple expression",
        });
        await popover(page)
          .getByRole("button", { name: "Done", exact: true })
          .click();

        // assert query results
        await visualize(page);
        await assertTableData(page, {
          columns: [
            "Category",
            expressionName,
            "Identity column",
            "Simple expression",
          ],
          firstRows: [["Gizmo", "true", "true", "false"]],
        });
      });

      test("should be able to add a same-stage aggregation", async ({
        page,
        mb,
      }) => {
        const { id } = await createQuestion(mb.api, questionDetails);
        await visitQuestion(page, id);
        await openNotebook(page);
        await getNotebookStep(page, "expression")
          .getByRole("button", { name: "Summarize", exact: true })
          .click();
        await popover(page).getByText("Minimum of ...", { exact: true }).click();
        await popover(page).getByText(expressionName, { exact: true }).click();
        await getNotebookStep(page, "summarize")
          .getByTestId("aggregate-step")
          .locator(".Icon-add")
          .click();
        await popover(page).getByText("Maximum of ...", { exact: true }).click();
        await popover(page).getByText(expressionName, { exact: true }).click();
        await visualize(page);
        await assertTableData(page, {
          columns: [`Min of ${expressionName}`, `Max of ${expressionName}`],
          firstRows: [["false", "true"]],
        });
      });

      test("should be able to add a same-stage sorting", async ({
        page,
        mb,
      }) => {
        const { id } = await createQuestion(mb.api, questionDetails);
        await visitQuestion(page, id);
        await openNotebook(page);
        await getNotebookStep(page, "expression")
          .getByRole("button", { name: "Sort", exact: true })
          .click();
        await popover(page).getByText(expressionName, { exact: true }).click();
        await visualize(page);
        await assertTableData(page, {
          columns: ["Category", expressionName],
          firstRows: [["Doohickey", "false"]],
        });
      });
    });

    test.describe("previous stage", () => {
      const questionDetails: StructuredQuestionDetails = {
        query: {
          "source-table": PRODUCTS_ID,
          expressions: {
            [expressionName]: [
              "starts-with",
              ["field", PRODUCTS.CATEGORY, null],
              "Gi",
            ],
          },
          aggregation: [["count"]],
          breakout: [
            ["expression", expressionName, { "base-type": "type/Boolean" }],
          ],
        },
      };

      test("should be able to add a post-aggregation custom column", async ({
        page,
        mb,
      }) => {
        const { id } = await createQuestion(mb.api, questionDetails);
        await visitQuestion(page, id);
        await openNotebook(page);
        await getNotebookStep(page, "summarize")
          .getByRole("button", { name: "Custom column", exact: true })
          .click();
        await enterCustomColumnDetails(page, {
          formula: `not([${expressionName}])`,
          name: "Simple expression",
        });
        await popover(page)
          .getByRole("button", { name: "Done", exact: true })
          .click();
        await visualize(page);
        await assertTableData(page, {
          columns: [expressionName, "Count", "Simple expression"],
          firstRows: [
            ["false", "149", "true"],
            ["true", "51", "false"],
          ],
        });
      });

      test("should be able to add a post-aggregation filter", async ({
        page,
        mb,
      }) => {
        const { id } = await createQuestion(mb.api, questionDetails);
        await visitQuestion(page, id);
        await assertQueryBuilderRowCount(page, 2);
        await tableHeaderClick(page, expressionName);
        await popover(page)
          .getByText("Filter by this column", { exact: true })
          .click();
        await popover(page).getByLabel("True", { exact: true }).click();
        await popover(page).getByText("Add filter", { exact: true }).click();
        await assertQueryBuilderRowCount(page, 1);
      });

      test("should be able to add a post-aggregation aggregation", async ({
        page,
        mb,
      }) => {
        const { id } = await createQuestion(mb.api, questionDetails);
        await visitQuestion(page, id);
        await openNotebook(page);
        await getNotebookStep(page, "summarize")
          .getByRole("button", { name: "Summarize", exact: true })
          .click();
        await popover(page).getByText("Minimum of ...", { exact: true }).click();
        await popover(page).getByText(expressionName, { exact: true }).click();
        await visualize(page);
        await assertTableData(page, {
          columns: [`Min of ${expressionName}`],
          firstRows: [["false"]],
        });
      });

      test("should be able to add a post-aggregation breakout and sorting", async ({
        page,
        mb,
      }) => {
        const { id } = await createQuestion(mb.api, questionDetails);
        await visitQuestion(page, id);

        // add a breakout
        await openNotebook(page);
        await getNotebookStep(page, "summarize")
          .getByRole("button", { name: "Summarize", exact: true })
          .click();
        await popover(page).getByText("Count of rows", { exact: true }).click();
        await getNotebookStep(page, "summarize", { stage: 1 })
          .getByTestId("breakout-step")
          .getByText("Pick a column to group by", { exact: true })
          .click();
        await popover(page).getByText(expressionName, { exact: true }).click();
        await visualize(page);
        await assertTableData(page, {
          columns: [expressionName, "Count"],
          firstRows: [
            ["false", "1"],
            ["true", "1"],
          ],
        });

        // add sorting
        await openNotebook(page);
        await getNotebookStep(page, "summarize", { stage: 1 })
          .getByRole("button", { name: "Sort", exact: true })
          .click();
        await popover(page).getByText(expressionName, { exact: true }).click();
        await getNotebookStep(page, "sort", { stage: 1 })
          .locator(".Icon-arrow_up")
          .click();
        await visualize(page);
        await assertTableData(page, {
          columns: [expressionName, "Count"],
          firstRows: [
            ["true", "1"],
            ["false", "1"],
          ],
        });
      });
    });

    test.describe("source card", () => {
      const questionDetails: StructuredQuestionDetails = {
        name: "Source",
        query: {
          "source-table": PRODUCTS_ID,
          expressions: {
            [expressionName]: [
              "starts-with",
              ["field", PRODUCTS.CATEGORY, null],
              "Gi",
            ],
          },
        },
      };

      function getNestedQuestionDetails(
        cardId: number,
      ): StructuredQuestionDetails {
        return {
          name: "Nested",
          query: {
            "source-table": `card__${cardId}`,
          },
        };
      }

      test("should be able to add a custom column for a boolean column", async ({
        page,
        mb,
      }) => {
        const card = await createQuestion(mb.api, questionDetails);
        const nested = await createQuestion(
          mb.api,
          getNestedQuestionDetails(card.id),
        );
        await visitQuestion(page, nested.id);

        // add a custom column
        await openNotebook(page);
        await getNotebookStep(page, "data")
          .getByRole("button", { name: "Custom column", exact: true })
          .click();
        await enterCustomColumnDetails(page, {
          formula: `[${expressionName}] != True`,
          name: "Simple expression",
        });
        await popover(page)
          .getByRole("button", { name: "Done", exact: true })
          .click();
        await visualize(page);
        await assertQueryBuilderRowCount(page, 200);

        // use the new custom column in a filter
        await tableHeaderClick(page, "Simple expression");
        await popover(page)
          .getByText("Filter by this column", { exact: true })
          .click();
        await popover(page).getByLabel("True", { exact: true }).click();
        await popover(page).getByText("Add filter", { exact: true }).click();
        await assertQueryBuilderRowCount(page, 149);
      });

      test("should be able to add a filter for a boolean column", async ({
        page,
        mb,
      }) => {
        const card = await createQuestion(mb.api, questionDetails);
        const nested = await createQuestion(
          mb.api,
          getNestedQuestionDetails(card.id),
        );
        await visitQuestion(page, nested.id);
        await assertQueryBuilderRowCount(page, 200);
        await tableHeaderClick(page, expressionName);
        await popover(page)
          .getByText("Filter by this column", { exact: true })
          .click();
        await popover(page).getByLabel("True", { exact: true }).click();
        await popover(page).getByText("Add filter", { exact: true }).click();
        await assertQueryBuilderRowCount(page, 51);
      });

      test("should be able to add an aggregation for a boolean column", async ({
        page,
        mb,
      }) => {
        const card = await createQuestion(mb.api, questionDetails);
        const nested = await createQuestion(
          mb.api,
          getNestedQuestionDetails(card.id),
        );
        await visitQuestion(page, nested.id);
        await openNotebook(page);
        await getNotebookStep(page, "data")
          .getByRole("button", { name: "Summarize", exact: true })
          .click();
        await popover(page).getByText("Minimum of ...", { exact: true }).click();
        await popover(page).getByText(expressionName, { exact: true }).click();
        await visualize(page);
        await assertTableData(page, {
          columns: [`Min of ${expressionName}`],
          firstRows: [["false"]],
        });
      });
    });
  });

  test.describe("dashboards", () => {
    test.beforeEach(async ({ mb }) => {
      await mb.signInAsNormalUser();
    });

    test("should be able setup an 'open question' click behavior", async ({
      page,
      mb,
    }) => {
      const dashboard = await createDashboardWithQuestion(mb.api);
      await visitDashboard(page, mb.api, dashboard.id);

      // setup click behavior
      await editDashboard(page);
      await showDashboardCardActions(page);
      await getDashboardCard(page)
        .getByLabel("Click behavior", { exact: true })
        .click();
      await sidebar(page).getByText(expressionName, { exact: true }).click();
      await sidebar(page)
        .getByText("Go to a custom destination", { exact: true })
        .click();
      await sidebar(page).getByText("Saved question", { exact: true }).click();
      await entityPickerModal(page).getByText("Q1", { exact: true }).click();
      await sidebar(page)
        .getByTestId("click-mappings")
        .getByText(expressionName, { exact: true })
        .click();
      await popover(page).getByText(expressionName, { exact: true }).click();
      await saveDashboard(page);

      // verify click behavior
      const dataset = waitForDataset(page);
      await getDashboardCard(page).getByText("false", { exact: true }).first().click();
      await dataset;
      await expect(
        page
          .getByTestId("qb-filters-panel")
          .getByText(`${expressionName} is false`, { exact: true }),
      ).toBeVisible();
    });

    test("should be able setup an 'open dashboard' click behavior for the same dashboard", async ({
      page,
      mb,
    }) => {
      const dashboard = await createDashboardWithQuestion(mb.api);
      await visitDashboard(page, mb.api, dashboard.id);

      // setup click behavior
      await editDashboard(page);
      await showDashboardCardActions(page);
      await getDashboardCard(page)
        .getByLabel("Click behavior", { exact: true })
        .click();
      await sidebar(page).getByText(expressionName, { exact: true }).click();
      await sidebar(page)
        .getByText("Go to a custom destination", { exact: true })
        .click();
      await sidebar(page).getByText("Dashboard", { exact: true }).click();
      await entityPickerModal(page).getByText("D1", { exact: true }).click();
      await sidebar(page)
        .getByTestId("click-mappings")
        .getByText(parameterDetails.name, { exact: true })
        .click();
      await popover(page).getByText(expressionName, { exact: true }).click();
      await saveDashboard(page);

      // verify click behavior
      await expect(
        getDashboardCard(page).getByText("Hudson Borer", { exact: true }),
      ).toBeVisible();
      await expect(
        getDashboardCard(page).getByText("Sydney Rempel", { exact: true }),
      ).toHaveCount(0);
      await getDashboardCard(page).getByText("false", { exact: true }).first().click();
      await expect(
        getDashboardCard(page).getByText("Hudson Borer", { exact: true }),
      ).toHaveCount(0);
      await expect(
        getDashboardCard(page).getByText("Sydney Rempel", { exact: true }),
      ).toBeVisible();
    });

    test("should be able setup an 'open dashboard' click behavior for another dashboard", async ({
      page,
      mb,
    }) => {
      await createDashboardWithQuestion(mb.api, { name: "D2" });
      const dashboard = await createDashboardWithQuestion(mb.api, {
        name: "D1",
      });
      await visitDashboard(page, mb.api, dashboard.id);

      // setup click behavior
      await editDashboard(page);
      await showDashboardCardActions(page);
      await getDashboardCard(page)
        .getByLabel("Click behavior", { exact: true })
        .click();
      await sidebar(page).getByText(expressionName, { exact: true }).click();
      await sidebar(page)
        .getByText("Go to a custom destination", { exact: true })
        .click();
      await sidebar(page).getByText("Dashboard", { exact: true }).click();
      await entityPickerModal(page).getByText("D2", { exact: true }).click();
      await sidebar(page)
        .getByTestId("click-mappings")
        .getByText(parameterDetails.name, { exact: true })
        .click();
      await popover(page).getByText(expressionName, { exact: true }).click();
      await saveDashboard(page);

      // verify click behavior
      await expect(
        getDashboardCard(page).getByText("Hudson Borer", { exact: true }),
      ).toBeVisible();
      await expect(
        getDashboardCard(page).getByText("Sydney Rempel", { exact: true }),
      ).toHaveCount(0);
      await getDashboardCard(page).getByText("false", { exact: true }).first().click();
      await expect(
        page.getByTestId("dashboard-name-heading"),
      ).toHaveValue("D2");
      await expect(
        getDashboardCard(page).getByText("Hudson Borer", { exact: true }),
      ).toHaveCount(0);
      await expect(
        getDashboardCard(page).getByText("Sydney Rempel", { exact: true }),
      ).toBeVisible();
    });
  });
});
