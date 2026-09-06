/**
 * Helpers for the table-editing spec port
 * (e2e/test/scenarios/table-editing/table-editing.cy.spec.ts).
 *
 * Kept in its own module per the porting rules (never edit shared support
 * files; import from them read-only). The writable-DB primitives
 * (queryWritableDB / resetTestTable) and the sync/table-id helpers are reused
 * from the actions-on-dashboards / schema-viewer modules.
 *
 * The whole upstream spec drives the writable QA postgres database (it restores
 * the `postgres-writable` snapshot in its top-level beforeEach), so every test
 * runs behind the PW_QA_DB_ENABLED gate. With the gate off (the jar/slot
 * verification default) the whole describe skips. Even the "table editing bugs"
 * describe, which pokes the Sample DB, inherits the parent beforeEach's
 * `restore("postgres-writable")` + writable-table reset, so nothing here has a
 * jar-runnable subset.
 */
import type { Locator, Page } from "@playwright/test";
import { expect } from "@playwright/test";

import type { MetabaseApi } from "./api";
import { modal } from "./ui";

/**
 * Port of the spec-local setTableEditingEnabledForDB: PUT the DB's
 * `database-enable-table-editing` setting.
 */
export function setTableEditingEnabledForDB(
  api: MetabaseApi,
  dbId: number,
  enabled = true,
) {
  return api.put(`/api/database/${dbId}`, {
    settings: {
      "database-enable-table-editing": enabled,
    },
  });
}

/**
 * Port of H.getFieldId({ tableId, name }) (e2e-qa-databases-helpers.js):
 * resolve a field id by name from the table's query_metadata.
 */
export async function getFieldId(
  api: MetabaseApi,
  { tableId, name }: { tableId: number; name: string },
): Promise<number> {
  const response = await api.get(`/api/table/${tableId}/query_metadata`);
  const body = (await response.json()) as {
    fields: { id: number; name: string }[];
  };
  const field = body.fields.find((field) => field.name === name);
  if (!field) {
    throw new TypeError(
      `Field with name ${name} cannot be found on table ${tableId}`,
    );
  }
  return field.id;
}

/**
 * Port of the spec-local openTableBrowser: navigate to the database browser
 * and open the given database. The Cypress version waits on the `@getDatabases`
 * intercept; here that GET is awaited around the navigation (rule 2).
 */
export async function openTableBrowser(
  page: Page,
  databaseName = "Writable Postgres12",
) {
  const getDatabases = page.waitForResponse(
    (response) =>
      response.request().method() === "GET" &&
      new URL(response.url()).pathname === "/api/database",
  );
  await page.goto("/browse/databases");
  await getDatabases;
  await page
    .getByTestId("database-browser")
    .getByText(databaseName, { exact: true })
    .click();
}

/**
 * Port of the spec-local getTableEditIcon: the edit-table icon is revealed on
 * hover of the schema row whose text matches the table name (rule 4 — hover
 * the container first). The Cypress version does
 * `findByTestId("browse-schemas").contains(regex).realHover().findByTestId("edit-table-icon")`,
 * i.e. hover the element containing the label and read the icon from within it;
 * we resolve the nearest ancestor of the label that actually contains the icon.
 */
export async function getTableEditIcon(
  page: Page,
  tableName: RegExp,
): Promise<Locator> {
  const row = page
    .getByTestId("browse-schemas")
    .getByText(tableName)
    .first()
    .locator(
      'xpath=ancestor-or-self::*[.//*[@data-testid="edit-table-icon"]][1]',
    );
  await row.hover();
  return row.getByTestId("edit-table-icon");
}

/** Port of the spec-local openTableEdit: hover-reveal the icon and click it. */
export async function openTableEdit(page: Page, tableName: RegExp) {
  const icon = await getTableEditIcon(page, tableName);
  await icon.click();
}

/**
 * Port of the spec-local openEditRowModal. The edit-table grid renders each
 * data row once per horizontal quadrant, so a given `data-dataset-index`
 * matches two `role="row"` sections: the frozen section (eq 0) carries the
 * hover-revealed row-edit-icon, the center section (eq 1) carries the cells.
 * Returns the row's ID cell text (the Cypress `@rowId` alias).
 */
export async function openEditRowModal(
  page: Page,
  rowIndex: number,
): Promise<string> {
  const tableRoot = page.getByTestId("table-root");
  const allRows = tableRoot.getByRole("row");
  await expect(async () => {
    expect(await allRows.count()).toBeGreaterThanOrEqual(4);
  }).toPass();

  const rowSections = tableRoot.locator(
    `[role="row"][data-dataset-index="${rowIndex}"]`,
  );

  const frozenSection = rowSections.nth(0);
  await frozenSection.locator("[data-column-id]").first().hover();
  await frozenSection.getByTestId("row-edit-icon").click();

  const rowId = await rowSections
    .nth(1)
    .getByTestId("cell-data")
    .first()
    .innerText();

  await expect(
    modal(page).getByText("Edit record", { exact: true }),
  ).toBeVisible();

  return rowId;
}
