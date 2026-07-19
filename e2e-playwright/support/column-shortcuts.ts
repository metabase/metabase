/**
 * Helpers for the column-shortcuts spec port
 * (e2e/test/scenarios/visualizations-tabular/column-shortcuts.cy.spec.ts):
 * the table-header "Add column" shortcuts — Extract part of column, Combine
 * columns. These are the spec-local `extractColumnAndCheck` / `combineColumns`
 * / `selectColumn`, plus `openOrdersTable` with a limit (the shared
 * question-settings.ts port is simple-mode only, no limit).
 *
 * Kept in its own module per PORTING.md rule 9 (parallel agents never edit
 * shared support files — import from them read-only).
 */
import type { Page } from "@playwright/test";
import { expect } from "@playwright/test";

import { popover } from "./ui";

/** Register a wait for the next ad-hoc POST /api/dataset (the `cy.intercept(...)
 * .as(alias)` + `cy.wait("@alias")` pattern — register before the trigger). */
function waitForDataset(page: Page) {
  return page.waitForResponse(
    (response) =>
      response.request().method() === "POST" &&
      new URL(response.url()).pathname === "/api/dataset",
  );
}

// openOrdersTable is now canonical in ./ad-hoc-question; re-exported so this
// module's consumers keep their import unchanged.
export { openOrdersTable } from "./ad-hoc-question";

/** Port of the spec-local extractColumnAndCheck. */
export async function extractColumnAndCheck(
  page: Page,
  {
    column,
    option,
    newColumn = option,
    value,
    example,
  }: {
    column: string;
    option: string;
    value?: string;
    example?: string;
    newColumn?: string;
  },
) {
  const dataset = waitForDataset(page);

  // cy.findByLabelText("Add column").click()
  await page.getByRole("button", { name: "Add column", exact: true }).click();

  const pop = popover(page);
  await pop.getByText("Extract part of column", { exact: true }).click();
  // findAllByText(column).first() — exact, first match (rule 1).
  await pop.getByText(column, { exact: true }).first().click();

  if (example) {
    // H.popover().findByText(option).parent().should("contain", example)
    await expect(pop.getByText(option, { exact: true }).locator("..")).toContainText(
      example,
    );
  }

  await pop.getByText(option, { exact: true }).click();

  await dataset;

  // eslint-disable-next-line metabase/no-unsafe-element-filtering — the last
  // column header is the newly extracted column.
  const lastHeader = page.getByRole("columnheader").last();
  await expect(lastHeader).toHaveText(newColumn);
  await expect(lastHeader).toBeVisible();

  if (value) {
    await expect(
      page.getByRole("gridcell", { name: value, exact: true }),
    ).toBeVisible();
  }
}

async function selectColumn(page: Page, index: number, name: string) {
  // H.popover().findAllByTestId("column-input").eq(index).click()
  await popover(page).getByTestId("column-input").nth(index).click();
  // H.popover().last().findByText(name).click() — a fresh dropdown popover opens.
  await popover(page).last().getByText(name, { exact: true }).click();
}

/** Port of the spec-local combineColumns. */
export async function combineColumns(
  page: Page,
  {
    columns,
    example,
    newColumn,
    newValue,
  }: {
    columns: string[];
    example: string;
    newColumn: string;
    newValue?: string;
  },
) {
  const dataset = waitForDataset(page);

  await page.getByRole("button", { name: "Add column", exact: true }).click();

  const pop = popover(page);
  await pop.getByText("Combine columns", { exact: true }).click();

  for (const [index, column] of columns.entries()) {
    await selectColumn(page, index, column);
  }

  if (example) {
    await expect(pop.getByTestId("combine-example")).toHaveText(example);
  }

  await pop.getByRole("button", { name: "Done", exact: true }).click();

  await dataset;

  // eslint-disable-next-line metabase/no-unsafe-element-filtering
  const lastHeader = page.getByRole("columnheader").last();
  await expect(lastHeader).toHaveText(newColumn);
  await expect(lastHeader).toBeVisible();

  if (newValue) {
    await expect(
      page.getByRole("gridcell", { name: newValue, exact: true }),
    ).toBeVisible();
  }
}
