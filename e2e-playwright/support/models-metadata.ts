/**
 * Helpers for the models/models-metadata spec port. Ports of the `H` helpers
 * that live in the Cypress model-metadata / models helper files and are not yet
 * in a shared support module:
 * - e2e-models-metadata-helpers.js (openColumnOptions, renameColumn,
 *   setColumnType, mapColumnTo)
 * - e2e/test/scenarios/models/helpers/e2e-models-helpers.js
 *   (startQuestionFromModel)
 *
 * Everything else (createQuestion/createNativeQuestion/createDashboard,
 * setModelMetadata, addOrUpdateDashboardCard, saveMetadataChanges,
 * datasetEditBar, waitForLoaderToBeRemoved, tableInteractive, popover, …) is
 * imported read-only from the existing shared modules.
 */
import type { Page } from "@playwright/test";

import { expect } from "./fixtures";
import { tableInteractive } from "./models";
import { miniPicker } from "./notebook";
import { escapeRegExp } from "./text";
import { appBar, popover } from "./ui";

/**
 * Port of H.openColumnOptions: click a column's header cell in the model
 * metadata editor to open its options in the right sidebar. The Cypress helper
 * re-queries and scroll-checks first to dodge a re-mount race; the anchored
 * Playwright locator does that for us.
 */
export async function openColumnOptions(page: Page, column: string) {
  const cell = tableInteractive(page)
    .getByTestId("header-cell")
    .filter({ hasText: new RegExp(`^${escapeRegExp(column)}$`) })
    .first();
  // The metadata-editor table re-mounts as the model loads (the Cypress helper
  // re-queries for the same reason). toBeVisible re-resolves the locator each
  // poll, and click retries actionability — so neither trips over a detach.
  await expect(cell).toBeVisible();
  await cell.click();
}

/**
 * Port of H.renameColumn: set the "Display name" field in the right sidebar,
 * then confirm the header cell picked up the new name. The field is a plain
 * TextInput (not an EditableText), so `fill` marks it dirty; blur to commit.
 */
export async function renameColumn(
  page: Page,
  oldName: string,
  newName: string,
) {
  const displayName = page.getByLabel("Display name", { exact: true });
  await expect(displayName).toHaveValue(oldName);
  await displayName.fill(newName);
  await displayName.blur();

  const cell = tableInteractive(page)
    .getByTestId("header-cell")
    .filter({ hasText: newName })
    .first();
  await expect(cell).toBeVisible();
}

/**
 * Port of H.setColumnType: the right sidebar's "Column type" select. Assert the
 * current value, open it, pick the new type, confirm it stuck.
 */
export async function setColumnType(
  page: Page,
  oldType: string,
  newType: string,
) {
  const columnType = page
    .getByTestId("sidebar-right")
    .getByLabel("Column type", { exact: true });
  await expect(columnType).toHaveValue(oldType);
  await columnType.click();
  await popover(page).getByText(newType, { exact: true }).click();
  await expect(columnType).toHaveValue(newType);
}

/**
 * Port of H.mapColumnTo: for a native-model column, map it to a real database
 * column via the "Database column this maps to" select. The picker drills from
 * table -> column within one popover; `.last()` grabs the topmost, `.first()`
 * mirrors cy.contains's first-match / case-sensitive-substring semantics.
 */
export async function mapColumnTo(
  page: Page,
  { table, column }: { table: string; column: string },
) {
  const label = page.getByText("Database column this maps to", { exact: true });
  await label.locator("..").getByTestId("select-button").click();

  await popover(page).last().getByText(table).first().click();
  await popover(page).last().getByText(column).first().click();

  await expect(
    label.locator("xpath=following-sibling::*[1]"),
  ).toContainText(`${table} → ${column}`);
}

/**
 * Port of startQuestionFromModel (e2e-models-helpers.js): New -> Question ->
 * Our analytics -> the model, landing in the notebook editor.
 */
export async function startQuestionFromModel(page: Page, modelName: string) {
  await appBar(page).getByText("New", { exact: true }).click();
  await popover(page).getByText("Question", { exact: true }).click();
  await miniPicker(page).getByText("Our analytics", { exact: true }).click();
  await miniPicker(page).getByText(modelName, { exact: true }).click();
}
