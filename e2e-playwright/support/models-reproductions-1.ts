/**
 * Helpers for the models/reproductions-1 spec port — spec-local `H` helpers
 * shared across its describes that aren't in the shared modules.
 *
 * Kept in its own module (parallel porting agents don't touch shared files);
 * fold into models.ts on the consolidation pass.
 */
import type { Locator, Page } from "@playwright/test";

import { expect } from "./fixtures";
import { tableHeaderColumn } from "./notebook";

/**
 * Port of the issue-29943 spec-local getHeaderCell: assert the columnIndex-th
 * header cell has exactly `name`, then return that table-header column locator
 * (H.tableHeaderColumn(name)).
 */
export async function getHeaderCell(
  page: Page,
  columnIndex: number,
  name: string,
): Promise<Locator> {
  // Cypress: cy.findAllByTestId("header-cell").eq(columnIndex).should("have.text", name)
  await expect(page.getByTestId("header-cell").nth(columnIndex)).toHaveText(
    name,
  );
  return tableHeaderColumn(page, name);
}

/**
 * Port of the issue-29943 spec-local assertColumnSelected: the header cell's
 * enclosing model-column-header-content is highlighted (selected background),
 * and the Display name input shows the column's name.
 */
export async function assertColumnSelected(
  page: Page,
  columnIndex: number,
  name: string,
) {
  await getHeaderCell(page, columnIndex, name);
  // The metadata editor renders `<div header-cell><Flex
  // model-column-header-content><span>NAME</span></Flex></div>`, so the
  // highlighted element (H's `.closest("model-column-header-content")` from the
  // name text) is a DESCENDANT of the header cell, not an ancestor — locate it
  // directly by its exact column-name text (has-locator built from page).
  const container = page
    .getByTestId("model-column-header-content")
    .filter({ has: page.getByText(name, { exact: true }) });
  await expect(container).toHaveCSS("background-color", "rgb(80, 158, 226)");
  await expect(page.getByLabel("Display name")).toHaveValue(name);
}

/**
 * Port of the issue-35840 `cy.findByDisplayValue("Category, Category")
 * .should("not.exist")`: no input/textarea/select in `scope` has `value`.
 */
export async function expectNoDisplayValue(scope: Locator, value: string) {
  const controls = scope.locator("input, textarea, select");
  await expect(async () => {
    const count = await controls.count();
    for (let index = 0; index < count; index++) {
      expect(await controls.nth(index).inputValue()).not.toBe(value);
    }
  }).toPass();
}

/**
 * Port of the `cy.intercept("POST", "/api/dataset").as("dataset")` +
 * `cy.get("@dataset.all").should("have.length", n)` pattern in issue 34514:
 * count every POST /api/dataset request over the page's lifetime.
 */
export function countDatasetRequests(page: Page): () => number {
  let count = 0;
  page.on("request", (request) => {
    if (
      request.method() === "POST" &&
      new URL(request.url()).pathname === "/api/dataset"
    ) {
      count += 1;
    }
  });
  return () => count;
}
