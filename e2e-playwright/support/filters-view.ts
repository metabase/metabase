/**
 * Helpers for the filters/view spec port (tests/filters-view.spec.ts). Lives in
 * its own file so the shared support modules stay untouched; it imports the
 * consolidated helpers read-only.
 *
 * Covers the spec-local flows repeated across the "apply filters without data
 * permissions" tests: granting the root collection View access from the admin
 * permissions UI, and applying the VENDOR (search) / CATEGORY (widget) field
 * filters from the QB field-filter popovers.
 */
import { expect } from "@playwright/test";
import type { Page } from "@playwright/test";

import { icon, popover } from "./ui";

/**
 * Port of the describe's beforeEach permission grant: upgrade All Users to
 * "View" collection access on the root collection, then save + confirm.
 * `cy.icon("close").first()` is the current-access cell's remove icon;
 * `cy.findAllByRole("option").contains("View")` is a case-sensitive substring
 * pick from the access dropdown.
 */
export async function grantRootCollectionViewAccess(page: Page) {
  await page.goto("/admin/permissions/collections/root");
  await icon(page, "close").first().click();
  await page.getByRole("option").filter({ hasText: "View" }).first().click();
  await page.getByText("Save changes", { exact: true }).click();
  await page.getByText("Yes", { exact: true }).click();
}

/**
 * Apply the VENDOR field filter by searching for a single value. Mirrors the
 * Cypress block: open the VENDOR widget, type into the "Search the list"
 * typeahead (real keystrokes — it debounces), pick the value, add the filter.
 */
export async function applyVendorSearchFilter(page: Page, value: string) {
  await page.getByText("VENDOR", { exact: true }).first().click();
  const pop = popover(page);
  await pop
    .getByPlaceholder("Search the list", { exact: true })
    .pressSequentially(value);
  await pop.getByText(value, { exact: true }).click();
  await pop.getByText("Add filter", { exact: true }).click();
}

/**
 * Apply the CATEGORY field filter by picking a value from the widget list.
 * Mirrors the Cypress block: open the CATEGORY widget, click the value, add.
 */
export async function applyCategoryWidgetFilter(page: Page, value: string) {
  await page.getByText("CATEGORY", { exact: true }).first().click();
  const pop = popover(page);
  await pop.getByText(value, { exact: true }).click();
  await pop.getByText("Add filter", { exact: true }).click();
}

/** Assert the QB reflects a saved native (SQL) question. */
export async function expectWrittenInSql(page: Page) {
  await expect(
    page.getByText("This question is written in SQL.", { exact: true }),
  ).toBeVisible();
}
