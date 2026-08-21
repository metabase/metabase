/**
 * Playwright port of e2e/test/scenarios/models/models-query-editor.cy.spec.js
 *
 * Porting notes:
 * - The Cypress `@dataset` / `@updateCard` / `@cardQuery` intercepts become
 *   waitForResponse promises registered before the triggering action.
 * - H.createNativeQuestion({ type: "model" }, { visitQuestion: true })
 *   expands to createNativeModel + visitModel — that is exactly what the
 *   Cypress factory does for model-type cards (it routes through visitModel,
 *   which waits on /api/dataset, not the card query endpoint).
 * - `cy.get("[data-testid=cell-data]").should("contain", x)` asserts some cell
 *   contains x; ported as filter({ hasText }) + first().toBeVisible(), and
 *   "not.contain" as toHaveCount(0). The positive assertion always runs first
 *   so the count-0 check can't pass vacuously on a still-loading table.
 * - `H.NativeEditor.focus().type("{backspace}...")` becomes focusNativeEditor
 *   (click + End) plus real Backspace keypresses — Playwright's keyboard is
 *   already CDP input, so no realType escape machinery is needed.
 */
import type { Page } from "@playwright/test";

import { test, expect } from "../support/fixtures";
import {
  createNativeModel,
  modal,
  openQuestionActions,
  runNativeQuery,
  selectFromDropdown,
  summarize,
  tableInteractive,
  visitModel,
  waitForDataset,
} from "../support/models";
import { focusNativeEditor } from "../support/native-editor";
import { ORDERS_QUESTION_ID } from "../support/sample-data";
import { popover } from "../support/ui";

const cellData = (page: Page) => page.getByTestId("cell-data");

const waitForUpdateCard = (page: Page) =>
  page.waitForResponse(
    (response) =>
      response.request().method() === "PUT" &&
      /^\/api\/card\/\d+$/.test(new URL(response.url()).pathname),
  );

// After discarding editor changes the model view refetches — depending on
// model persistence state that's either /api/card/:id/query or /api/dataset
// (the same endpoint visitModel waits on), so accept both.
const waitForCardQuery = (page: Page) =>
  page.waitForResponse((response) => {
    const { pathname } = new URL(response.url());
    return (
      response.request().method() === "POST" &&
      (/^\/api\/card\/\d+\/query$/.test(pathname) ||
        pathname === "/api/dataset")
    );
  });

async function expectSomeCellContains(page: Page, text: string) {
  await expect(cellData(page).filter({ hasText: text }).first()).toBeVisible();
}

async function expectNoCellContains(page: Page, text: string) {
  await expect(cellData(page).filter({ hasText: text })).toHaveCount(0);
}

test.describe("scenarios > models query editor", () => {
  test.beforeEach(async ({ mb }) => {
    await mb.restore();
    await mb.signInAsAdmin();
  });

  test.describe("GUI models", () => {
    test.beforeEach(async ({ mb }) => {
      await mb.api.put(`/api/card/${ORDERS_QUESTION_ID}`, {
        name: "Orders Model",
        type: "model",
      });
    });

    test("allows to edit GUI model query", async ({ page }) => {
      await visitModel(page, ORDERS_QUESTION_ID);

      await expectSomeCellContains(page, "37.65");
      await expectSomeCellContains(page, "109.22");

      await openQuestionActions(page);
      await popover(page)
        .getByText("Edit query definition", { exact: true })
        .click();

      await expect(page.getByTestId("data-step-cell")).toContainText("Orders");
      await expect(
        page.getByRole("button", { name: "Save changes", exact: true }),
      ).toBeDisabled();

      await page.getByText("Row limit", { exact: true }).click();
      const limitInput = page.getByPlaceholder("Enter a limit");
      await limitInput.fill("2");
      await limitInput.blur();

      const datasetResponse = waitForDataset(page);
      await page.getByTestId("run-button").click();
      await datasetResponse;

      await expectSomeCellContains(page, "37.65");
      await expectNoCellContains(page, "109.22");

      const updateCardResponse = waitForUpdateCard(page);
      await page
        .getByRole("button", { name: "Save changes", exact: true })
        .click();
      await updateCardResponse;

      // cy.url() include /model/:id, not include /query, empty hash — checked
      // together so the assertion retries across the post-save navigation.
      await expect(page).toHaveURL(
        (url) =>
          url.pathname.includes(`/model/${ORDERS_QUESTION_ID}`) &&
          !url.pathname.includes("/query") &&
          url.hash === "",
      );

      await expectSomeCellContains(page, "37.65");
      await expectNoCellContains(page, "109.22");
    });

    test("allows for canceling changes", async ({ page }) => {
      await visitModel(page, ORDERS_QUESTION_ID);

      await expectSomeCellContains(page, "37.65");
      await expectSomeCellContains(page, "109.22");

      await openQuestionActions(page);
      await popover(page)
        .getByText("Edit query definition", { exact: true })
        .click();

      await page.getByText("Row limit", { exact: true }).click();
      const limitInput = page.getByPlaceholder("Enter a limit");
      await limitInput.fill("2");
      await limitInput.blur();

      const datasetResponse = waitForDataset(page);
      await page.getByTestId("run-button").click();
      await datasetResponse;

      await expectSomeCellContains(page, "37.65");
      await expectNoCellContains(page, "109.22");

      const cardQueryResponse = waitForCardQuery(page);
      await page.getByRole("button", { name: "Cancel", exact: true }).click();
      await modal(page)
        .getByRole("button", { name: "Discard changes", exact: true })
        .click();
      await cardQueryResponse;

      await expect(page).toHaveURL(
        (url) =>
          url.pathname.includes(`/model/${ORDERS_QUESTION_ID}`) &&
          !url.pathname.includes("/query") &&
          url.hash === "",
      );

      await expectSomeCellContains(page, "37.65");
      await expectSomeCellContains(page, "109.22");
    });

    test("locks display to table", async ({ page }) => {
      await page.goto(`/model/${ORDERS_QUESTION_ID}/query`);

      await summarize(page, { mode: "notebook" });

      await selectFromDropdown(page, "Count of rows");

      const datasetResponse = waitForDataset(page);
      await page.getByTestId("run-button").click();
      await datasetResponse;

      // FE chooses the scalar visualization to display count of rows for regular questions
      await expect(tableInteractive(page)).toBeVisible();
      await expect(page.getByTestId("scalar-value")).toHaveCount(0);
    });
  });

  test.describe("native models", () => {
    test("allows to edit native model query", async ({ page, mb }) => {
      const { id } = await createNativeModel(mb.api, {
        name: "Native Model",
        native: { query: "SELECT * FROM orders limit 5" },
      });
      await visitModel(page, id);

      await expectSomeCellContains(page, "37.65");
      await expectSomeCellContains(page, "109.22");

      await openQuestionActions(page);
      await popover(page)
        .getByText("Edit query definition", { exact: true })
        .click();

      await expect(page).toHaveURL(/\/query/);
      await expect(
        page.getByRole("button", { name: "Save changes", exact: true }),
      ).toBeDisabled();

      await focusNativeEditor(page);
      await page.keyboard.press("Backspace");
      await page.keyboard.type("2");

      await runNativeQuery(page);

      await expectSomeCellContains(page, "37.65");
      await expectNoCellContains(page, "109.22");

      const updateCardResponse = waitForUpdateCard(page);
      await page
        .getByRole("button", { name: "Save changes", exact: true })
        .click();
      await updateCardResponse;

      await expectSomeCellContains(page, "37.65");
      await expectNoCellContains(page, "109.22");
    });

    test("allows for canceling changes", async ({ page, mb }) => {
      const { id } = await createNativeModel(mb.api, {
        name: "Native Model",
        native: { query: "SELECT * FROM orders limit 5" },
      });
      await visitModel(page, id);

      await expectSomeCellContains(page, "37.65");
      await expectSomeCellContains(page, "109.22");

      await openQuestionActions(page);
      await popover(page)
        .getByText("Edit query definition", { exact: true })
        .click();

      await expect(page).toHaveURL(/\/query/);
      await expect(
        page.getByRole("button", { name: "Save changes", exact: true }),
      ).toBeDisabled();

      await focusNativeEditor(page);
      await page.keyboard.press("Backspace");
      await page.keyboard.type("2");

      await runNativeQuery(page);

      await expectSomeCellContains(page, "37.65");
      await expectNoCellContains(page, "109.22");

      const cardQueryResponse = waitForCardQuery(page);
      await page.getByRole("button", { name: "Cancel", exact: true }).click();
      await modal(page)
        .getByRole("button", { name: "Discard changes", exact: true })
        .click();
      await cardQueryResponse;

      await expectSomeCellContains(page, "37.65");
      await expectSomeCellContains(page, "109.22");
    });

    test("handles failing queries", async ({ page, mb }) => {
      const { id } = await createNativeModel(mb.api, {
        name: "Erroring Model",
        // Let's use API to type the most of the query, but stil make it invalid
        native: { query: "SELECT 1 FROM" },
      });
      await visitModel(page, id);

      await openQuestionActions(page);
      await popover(page).getByText("Edit metadata", { exact: true }).click();

      await expect(page.getByText(/Syntax error in SQL/)).toBeVisible();

      await page.getByText("Query", { exact: true }).click();

      await expect(page.getByText(/Syntax error in SQL/)).toBeVisible();

      await focusNativeEditor(page);
      for (let i = 0; i < " FROM".length; i++) {
        await page.keyboard.press("Backspace");
      }
      await runNativeQuery(page);

      await expectSomeCellContains(page, "1");
      await expect(page.getByText(/Syntax error in SQL/)).toHaveCount(0);

      const updateCardResponse = waitForUpdateCard(page);
      await page
        .getByRole("button", { name: "Save changes", exact: true })
        .click();
      await updateCardResponse;

      await expectSomeCellContains(page, "1");
      await expect(page.getByText(/Syntax error in SQL/)).toHaveCount(0);
    });
  });
});
