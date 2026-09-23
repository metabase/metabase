/**
 * Playwright port of e2e/test/scenarios/joins/joins-custom-expressions.cy.spec.ts
 *
 * Custom join conditions via the expression editor: joining on an expression,
 * multiple conditions, and editing the operator / join type / condition columns
 * of an existing custom-expression join.
 *
 * The Cypress original registers no intercepts. All shared-column-picker
 * interactions (mini picker, Custom Expression editor) come from the shared
 * notebook/join helpers; the Custom-Expression join-condition idiom is folded
 * into support/joins-custom-expressions.ts.
 */
import { test } from "../support/fixtures";
import {
  enterCustomColumnDetails,
  getNotebookStep,
  miniPicker,
  openNotebook,
  visualize,
  assertQueryBuilderRowCount,
} from "../support/notebook";
import { join, openTableNotebook } from "../support/joins";
import { filterNotebook } from "../support/joins";
import { addJoinConditionCustomExpression } from "../support/joins-custom-expressions";
import { assertTableRowsCount } from "../support/native-extras";
import { ORDERS_MODEL_ID } from "../support/organization";
import { SAMPLE_DATABASE } from "../support/sample-data";
import { visitModel } from "../support/models";
import { popover } from "../support/ui";

const { ORDERS_ID } = SAMPLE_DATABASE;

test.describe("scenarios > joins > custom expressions", () => {
  test.beforeEach(async ({ mb }) => {
    await mb.restore();
    await mb.signInAsNormalUser();
  });

  test("should support expressions in join conditions referencing model columns", async ({
    page,
  }) => {
    await visitModel(page, ORDERS_MODEL_ID);
    await openNotebook(page);

    await join(page);
    await miniPicker(page).getByText("Our analytics", { exact: true }).click();
    await miniPicker(page).getByText("Orders Model", { exact: true }).click();

    await addJoinConditionCustomExpression(page, "[ID] + [User ID]");
    await addJoinConditionCustomExpression(page, "[ID] + [Product ID]");

    await filterNotebook(page);
    await popover(page).getByText("ID", { exact: true }).click();
    await popover(page).getByPlaceholder("Enter an ID", { exact: true }).fill("1");
    await popover(page).getByRole("button", { name: "Add filter", exact: true }).click();

    await visualize(page);
    await assertQueryBuilderRowCount(page, 9);
  });

  test("should allow to update a join with a join condition with custom expressions", async ({
    page,
  }) => {
    await openTableNotebook(page, ORDERS_ID);

    await join(page);
    await miniPicker(page).getByText("Sample Database", { exact: true }).click();
    await miniPicker(page).getByText("Reviews", { exact: true }).click();

    await addJoinConditionCustomExpression(page, "1");
    await addJoinConditionCustomExpression(page, "1");

    const joinStep = getNotebookStep(page, "join");

    await joinStep.getByLabel("Change operator", { exact: true }).click();
    await popover(page).getByText("=", { exact: true }).click();

    await joinStep.getByLabel("Change join type", { exact: true }).click();
    await popover(page).getByText("Inner join", { exact: true }).click();

    await joinStep
      .getByLabel("Left column", { exact: true })
      .getByText("1", { exact: true })
      .click();
    await enterCustomColumnDetails(page, { formula: "[ID] + 1" });
    await popover(page).getByRole("button", { name: "Update", exact: true }).click();

    await joinStep
      .getByLabel("Right column", { exact: true })
      .getByText("1", { exact: true })
      .click();
    await enterCustomColumnDetails(page, { formula: "[Reviews → ID] + 1" });
    await popover(page).getByRole("button", { name: "Update", exact: true }).click();

    await visualize(page);
    await assertTableRowsCount(page, 1112);
  });
});
