/**
 * Helpers for offset.spec.ts — ports of the spec-local functions from
 * e2e/test/scenarios/question/offset.cy.spec.ts (addCustomAggregation,
 * addBreakout, saveQuestion, verifyLineChart, verifyTableContent,
 * verifyNoQuestionError, verifyInvalidColumnName, createOffsetOptions).
 *
 * Lives in its own file so the shared support modules stay untouched; it
 * imports the notebook / ui / charts / table ports read-only.
 *
 * Notes:
 * - `saveQuestion` folds in the `cy.intercept("POST","/api/card").as(...)` +
 *   `cy.wait("@saveQuestion")` pair: the waitForResponse is registered before
 *   the modal Save click and the /api/card response is returned (PORTING
 *   rule 2).
 * - ECharts axis/title `<text>` can carry leading/trailing spaces (wave-11
 *   gotcha), so verifyLineChart matches its text as a case-sensitive substring
 *   regex (+ `.first()`) rather than an exact getByText.
 */
import type { Locator, Page } from "@playwright/test";

import { echartsContainer } from "./charts";
import { expect } from "./fixtures";
import {
  enterCustomColumnDetails,
  expressionEditorWidget,
  getNotebookStep,
  queryBuilderMain,
} from "./notebook";
import { tableInteractiveBody } from "./question-new";
import { caseSensitiveSubstring } from "./text";
import { modal, popover } from "./ui";

/** Port of the spec-local addCustomAggregation. */
export async function addCustomAggregation(
  page: Page,
  {
    formula,
    name,
    isFirst,
    isOpened,
  }: {
    formula: string;
    name: string;
    isFirst?: boolean;
    isOpened?: boolean;
  },
) {
  if (!isOpened) {
    if (isFirst) {
      await getNotebookStep(page, "summarize")
        .getByText("Pick a function or metric", { exact: true })
        .click();
    } else {
      await getNotebookStep(page, "summarize")
        .locator(".Icon-add")
        .first()
        .click();
    }
  }

  await popover(page).getByText("Custom Expression", { exact: true }).click();
  await enterCustomColumnDetails(page, { formula, name });
  await popover(page).getByRole("button", { name: "Done", exact: true }).click();
}

/** Port of the spec-local addBreakout. */
export async function addBreakout(page: Page, name: string) {
  await getNotebookStep(page, "summarize")
    .getByText("Pick a column to group by", { exact: true })
    .click();
  await popover(page).getByText(name, { exact: true }).click();
}

/**
 * Port of the spec-local saveQuestion. Registers the POST /api/card wait
 * before clicking the modal Save (upstream's cy.intercept + cy.wait), and
 * returns the /api/card response for the caller to read the new card id.
 */
export async function saveQuestion(page: Page) {
  const saved = page.waitForResponse(
    (response) =>
      response.request().method() === "POST" &&
      new URL(response.url()).pathname === "/api/card",
  );
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await modal(page).getByRole("button", { name: "Save", exact: true }).click();
  return saved;
}

/** Port of the spec-local verifyLineChart. */
export async function verifyLineChart(
  page: Page,
  {
    xAxis,
    yAxis,
    legendItems,
  }: { xAxis: string; yAxis?: string; legendItems?: string[] },
) {
  await expectEchartsText(echartsContainer(page), xAxis);
  if (yAxis) {
    await expectEchartsText(echartsContainer(page), yAxis);
  }

  if (legendItems) {
    for (const legendItem of legendItems) {
      await expect(
        page
          .getByTestId("legend-item")
          .filter({ hasText: caseSensitiveSubstring(legendItem) })
          .first(),
      ).toBeAttached();
    }
  }
}

async function expectEchartsText(container: Locator, text: string) {
  await expect(
    container.getByText(caseSensitiveSubstring(text)).first(),
  ).toBeVisible();
}

/** Port of the spec-local verifyTableContent. */
export async function verifyTableContent(page: Page, dataRows: string[][]) {
  const columnsCount = dataRows[0].length;
  const pairs = dataRows.flatMap((row, rowIndex) =>
    row.map((text, cellIndex) => ({
      index: rowIndex * columnsCount + cellIndex,
      text,
    })),
  );

  for (const { index, text } of pairs) {
    await verifyTableCellContent(page, index, text);
  }
}

async function verifyTableCellContent(page: Page, index: number, text: string) {
  await expect(
    tableInteractiveBody(page)
      .getByTestId("center-center-quadrant")
      .getByRole("gridcell")
      .nth(index),
  ).toHaveText(text);
}

/** Port of the spec-local verifyNoQuestionError. */
export async function verifyNoQuestionError(page: Page) {
  const main = queryBuilderMain(page);
  await expect(
    main.getByText("There was a problem with your question", { exact: true }),
  ).toHaveCount(0);
  await expect(
    main.getByText("Show error details", { exact: true }),
  ).toHaveCount(0);
}

/** Port of the spec-local verifyInvalidColumnName. */
export async function verifyInvalidColumnName(
  page: Page,
  columnName: string,
  prefix: string,
  expression: string,
) {
  await enterCustomColumnDetails(page, { formula: prefix });
  await expect(
    page.getByTestId("expression-suggestions-list-item"),
  ).toHaveCount(0);

  await enterCustomColumnDetails(page, { formula: expression });
  await page.keyboard.press("Tab");
  await expect(
    popover(page).getByText(`Unknown Field: ${columnName}`, { exact: true }),
  ).toBeVisible();
  await expect(
    popover(page).getByRole("button", { name: "Done", exact: true }),
  ).toBeDisabled();
}

/** Port of the spec-local createOffsetOptions. */
export function createOffsetOptions(name = "offset") {
  return {
    "lib/uuid": crypto.randomUUID(),
    name,
    "display-name": name,
  };
}
