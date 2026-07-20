/**
 * Per-spec helpers for the data-studio bulk-table port
 * (e2e/test/scenarios/data-studio/data-model/data-studio-bulk-table.cy.spec.ts).
 *
 * New module per PORTING rule 9; every shared support module below is imported
 * READ-ONLY. `support/data-model.ts` already carries the TablePicker /
 * visitDataModel surface; only what that module lacks lives here.
 *
 * Vantage note (snowplow): every event this spec asserts is emitted by an FE
 * `trackSimpleEvent` call site in
 * `frontend/src/metabase/common/data-studio/analytics.ts`, so the browser
 * boundary (`installSnowplowCapture`, support/search-snowplow.ts) is the
 * correct seam — the per-slot collector would never see them, because
 * `installSnowplowCapture`'s `page.route` fulfils the tracker POST before it
 * leaves the browser. The upstream assertions are exact counts, which is the
 * second reason to prefer the boundary (the collector accumulates across the
 * whole worker lifetime).
 */
import type { Locator, Page, Response } from "@playwright/test";

import { expect } from "./fixtures";
import { queryWritableDB } from "./schema-viewer";
import { escapeRegExp } from "./text";
import { popover } from "./ui";

/** Port of `DataModel.TablePicker.getDatabaseToggle(name)`:
 * `getTablePickerDatabase(name).find("[aria-expanded]")`. */
export function getDatabaseToggle(database: Locator): Locator {
  return database.locator("[aria-expanded]");
}

/**
 * Port of `H.selectHasValue(label, value)` (e2e/support/helpers/e2e-ui-select.ts):
 * `cy.findByRole("textbox", { name: label }).should("have.value", value)`.
 *
 * Kept as a real assertion — `toHaveValue("")` on a Mantine `Select` input is
 * NOT the vacuous `should("not.have.value")` / `be.empty` shape flagged in
 * PORTING: it asserts the select is genuinely unset before we open it.
 *
 * Returns the input so callers can chain `.click()` like upstream does.
 */
export async function selectHasValue(
  page: Page,
  label: string,
  value: string,
): Promise<Locator> {
  const input = page.getByRole("textbox", { name: label, exact: true });
  await expect(input).toHaveValue(value);
  return input;
}

/**
 * Port of `H.selectDropdown()` — `popover().findByRole("listbox")`.
 */
export function selectDropdown(page: Page): Locator {
  return popover(page).getByRole("listbox");
}

/**
 * Port of `H.selectDropdown().contains(label).click()`.
 *
 * Two deviations forced by Playwright/Mantine, both documented in PORTING:
 *  - a Mantine `Select` option's inner text div is not the click target, so the
 *    `role="option"` row is clicked instead (wave 10);
 *  - `cy.contains` is a case-sensitive substring returning the FIRST hit, so
 *    the name is matched as an escaped substring regex and `.first()` mirrors
 *    Cypress's first-match semantics (rule 3).
 */
export async function clickSelectOption(page: Page, label: string) {
  await selectDropdown(page)
    .getByRole("option", { name: new RegExp(escapeRegExp(label)) })
    .first()
    .click();
}

/** Open a bulk-attribute select (asserting it is unset) and pick an option —
 * the `selectHasValue(...).click()` + `selectDropdown().contains(...).click()`
 * pair the spec repeats eight times. */
export async function setBulkAttribute(
  page: Page,
  label: string,
  option: string,
) {
  const input = await selectHasValue(page, label, "");
  await input.click();
  await clickSelectOption(page, option);
}

/** Port of `H.undoToastList()` — `cy.findAllByTestId("toast-undo")`. */
export function undoToastList(page: Page): Locator {
  return page.getByTestId("toast-undo");
}

/** Port of `H.undoToastListContainer()` — `cy.findByTestId("undo-list")`. */
export function undoToastListContainer(page: Page): Locator {
  return page.getByTestId("undo-list");
}

/**
 * A picker table row disambiguated by the tree-item's OWN attributes.
 *
 * Upstream uses the bare `TablePicker.getTable(name)`
 * (`:contains("<name>")` over every `data-type="table"` tree-item). That is
 * unambiguous while only one schema is expanded, but NOT in the search view:
 * measured on this box, the app DB holds **28** tables named `Animals`
 * (`Domestic`, `Wild`, and `Schema A`…`Schema Z` — the FINDINGS #85 debris the
 * `many_schemas` fixture leaves in the shared writable container), of which the
 * virtualized results grid rendered 6 at assertion time. Even on a pristine
 * container the describe's own `multi_schema` fixture creates TWO `Animals`
 * (`Domestic` and `Wild`), so the upstream selector is latently ambiguous by
 * construction — the contamination only widened it.
 *
 * The attribute-filter shape mirrors the established precedent in
 * `support/datamodel-data-studio.ts getTableCheckbox`.
 */
export function getTableInSchema(
  page: Page,
  {
    databaseId,
    schemaName,
    tableName,
  }: { databaseId: number; schemaName: string; tableName: string },
): Locator {
  return page
    .locator(
      `[data-testid="tree-item"][data-type="table"][data-database-id="${databaseId}"][data-schema-name="${schemaName}"]`,
    )
    .filter({ hasText: new RegExp(escapeRegExp(tableName)) });
}

/** All rendered table rows in the picker tree (`data-type="table"` tree-items). */
export function treeTableItems(page: Page): Locator {
  return page.locator('[data-testid="tree-item"][data-type="table"]');
}

// === response waits (PORTING rule 2: register before the trigger) ==========

function byMethodAndPath(
  method: string,
  pathname: string,
): (response: Response) => boolean {
  return (response) =>
    response.request().method() === method &&
    new URL(response.url()).pathname === pathname;
}

/** The spec's `@getSchema`:
 * `GET /api/database/:id/schema/public?include_hidden=true`. Matched on
 * pathname + the `include_hidden` param, like the Cypress glob did. */
export function waitForSchema(
  page: Page,
  databaseId: number,
  schemaName = "public",
): Promise<Response> {
  return page.waitForResponse((response) => {
    const url = new URL(response.url());
    return (
      response.request().method() === "GET" &&
      url.pathname === `/api/database/${databaseId}/schema/${schemaName}` &&
      url.searchParams.get("include_hidden") === "true"
    );
  });
}

/** `@syncSchema` — `POST /api/data-studio/table/sync-schema`. */
export function waitForSyncSchema(page: Page): Promise<Response> {
  return page.waitForResponse(
    byMethodAndPath("POST", "/api/data-studio/table/sync-schema"),
  );
}

/** `@rescanValues` — `POST /api/data-studio/table/rescan-values`. */
export function waitForRescanValues(page: Page): Promise<Response> {
  return page.waitForResponse(
    byMethodAndPath("POST", "/api/data-studio/table/rescan-values"),
  );
}

/** `@discardValues` — `POST /api/data-studio/table/discard-values`. */
export function waitForDiscardValues(page: Page): Promise<Response> {
  return page.waitForResponse(
    byMethodAndPath("POST", "/api/data-studio/table/discard-values"),
  );
}

/** `@publishTables` — `POST /api/ee/data-studio/table/publish-tables`. */
export function waitForPublishTables(page: Page): Promise<Response> {
  return page.waitForResponse(
    byMethodAndPath("POST", "/api/ee/data-studio/table/publish-tables"),
  );
}

/** `@unpublishTables` — `POST /api/ee/data-studio/table/unpublish-tables`. */
export function waitForUnpublishTables(page: Page): Promise<Response> {
  return page.waitForResponse(
    byMethodAndPath("POST", "/api/ee/data-studio/table/unpublish-tables"),
  );
}

/**
 * Assert a bulk table action posted exactly `tableIds` and answered 204 — the
 * spec's `expect(request.body.table_ids).to.deep.eq(tableIds)` +
 * `expect(response?.statusCode).to.eq(204)`. Array order is significant
 * upstream (`deep.eq`), so it is here too.
 */
export async function expectTableAction(
  response: Response,
  tableIds: (number | undefined)[],
) {
  const body = response.request().postDataJSON() as { table_ids?: number[] };
  expect(body.table_ids).toEqual(tableIds);
  expect(response.status()).toBe(204);
}

// === spec-local helpers ===================================================

export type Table = { display_name: string; id: number };

/** Port of the spec-local `getTableId(tables, tableName)`. */
export function getTableId(
  tables: Table[],
  tableName: string,
): number | undefined {
  return tables.find((table) => table.display_name === tableName)?.id;
}

/**
 * Port of `H.resetTestTable({ type: "postgres", table: "many_schemas" })`
 * (cy.task("resetTable") -> e2e/support/test_tables.js `many_schemas`),
 * transcribed to plain SQL against the shared writable postgres container.
 *
 * ⚠️ This fixture IS the source of the `Schema A`…`Schema Z` debris described
 * in FINDINGS #85 — it creates 26 schemas in a container shared by every slot
 * and upstream never drops them. Kept faithful (create-if-not-exists +
 * drop/recreate the table), and deliberately NOT cleaned up: sibling slots are
 * live and the schemas pre-date this run.
 */
export async function resetTestTableManySchemas() {
  const letters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");
  const statements = letters
    .map(
      (letter) => `
        CREATE SCHEMA IF NOT EXISTS "Schema ${letter}";
        DROP TABLE IF EXISTS "Schema ${letter}"."Animals";
        CREATE TABLE "Schema ${letter}"."Animals" (name varchar(255), score integer);
        INSERT INTO "Schema ${letter}"."Animals" (name, score)
          VALUES ('Duck', 10), ('Horse', 20), ('Cow', 30);`,
    )
    .join("\n");
  await queryWritableDB(statements);
}
