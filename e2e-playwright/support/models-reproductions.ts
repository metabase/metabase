/**
 * Helpers for the models/reproductions spec port — the two module-level
 * functions the Cypress spec defines outside its describes
 * (mapModelColumnToDatabase / selectModelColumn), used by the model-column
 * mapping repros (issues 29517 and 53556).
 *
 * Kept in its own module (parallel porting agents don't touch shared files);
 * fold into models.ts on the consolidation pass. Everything else the spec needs
 * is imported read-only from the shared support modules.
 */
import type { Page } from "@playwright/test";

import { findByDisplayValue } from "./filters-repros";
import { expect } from "./fixtures";
import { popover } from "./ui";

/**
 * Port of the spec-local mapModelColumnToDatabase: open the "Database column
 * this maps to" select, pick the table then the field, and assert the mapping
 * label, the field's display value, and a non-empty description.
 */
export async function mapModelColumnToDatabase(
  page: Page,
  { table, field }: { table: string; field: string },
) {
  // cy.findByText("Database column this maps to").parent().findByTestId("select-button")
  await page
    .getByText("Database column this maps to", { exact: true })
    .locator("..")
    .getByTestId("select-button")
    .click();
  await popover(page).getByRole("option", { name: table, exact: true }).click();
  await popover(page).getByRole("option", { name: field, exact: true }).click();

  // cy.contains(`${table} → ${field}`) — case-sensitive substring, first match.
  await expect(page.getByText(`${table} → ${field}`).first()).toBeVisible();

  // cy.findAllByDisplayValue(field) — an existence check.
  await findByDisplayValue(page.locator("body"), field);

  // cy.findByLabelText("Description").should("not.be.empty") — the description
  // auto-populates from the mapped DB column.
  await expect(page.getByLabel("Description", { exact: true })).not.toHaveValue(
    "",
  );
}

/**
 * Port of the spec-local selectModelColumn: click the metadata-editor header
 * cell for `column`. cy.contains is a case-sensitive substring, first match.
 */
export async function selectModelColumn(page: Page, column: string) {
  await page
    .getByTestId("header-cell")
    .filter({ hasText: column })
    .first()
    .click();
}
