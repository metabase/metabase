/**
 * Helpers for the data-model spec ports — a Playwright port of the parts of
 * e2e/support/helpers/e2e-datamodel-helpers.ts (cy.H.DataModel) used by
 * data-model-shared-1.cy.spec.ts, plus its `Shared` area utilities.
 *
 * Lives in its own file so shared support modules stay untouched
 * (PORTING.md rule 9).
 *
 * Port notes:
 * - Cypress `visit()` registered `datamodel/visit/*` intercepts and waited on
 *   an id-dependent subset; here the same subset of `page.waitForResponse`
 *   predicates is registered BEFORE `page.goto` and awaited after. The
 *   `skipWaiting` + manual `cy.wait("@databases")` pattern maps to an
 *   explicit `waitFor` override.
 * - `verifyTablePreview`/`verifyObjectDetailPreview` do NOT wait on
 *   `/api/dataset` after clicking a preview-type tab: the click doesn't fire
 *   a request when that type is already selected (Cypress's cy.wait consumed
 *   the response from opening the preview; waitForResponse would hang — see
 *   the "cy.wait after non-triggering clicks" gotcha). The retrying content
 *   assertions anchor on the post-fetch DOM instead.
 * - `hoverPreviewHeaderCell` keeps the upstream synthetic mouseenter +
 *   mouseover dispatch (Chrome headless ≥133 hit-tests CDP hover events
 *   differently and the Mantine HoverCard wouldn't open); Playwright
 *   locators re-resolve per dispatch, which covers the stale-node re-query
 *   the Cypress helper did by hand.
 */
import type { Locator, Page, Response } from "@playwright/test";

import { expect } from "./fixtures";
import { icon } from "./dashboard-cards";
import { undoToast } from "./metrics";
import { queryWritableDB } from "./schema-viewer";

/** Mirrors e2e/support/cypress_data.js */
export const SAMPLE_DB_SCHEMA_ID = "1:PUBLIC";

export const areas = ["admin", "data studio"] as const;
export type Area = (typeof areas)[number];

export function getBasePath(area: Area): string {
  return area === "admin" ? "/admin/datamodel" : "/data-studio/data";
}

/** Port of Shared.getCheckLocation — pathname equality, retried. */
export async function checkLocation(page: Page, area: Area, path: string) {
  await expect
    .poll(() => new URL(page.url()).pathname)
    .toBe(`${getBasePath(area)}${path}`);
}

/** Port of the `cy.location("pathname").should(startsWith)` call sites. */
export async function expectPathnameStartsWith(page: Page, prefix: string) {
  await expect
    .poll(() => new URL(page.url()).pathname)
    .toMatch(new RegExp(`^${escapeRegExp(prefix)}`));
}

type ResponseKind = "databases" | "database" | "schemas" | "schema" | "metadata";

const RESPONSE_PREDICATES: Record<ResponseKind, (response: Response) => boolean> = {
  // Cypress matched "GET /api/database" ignoring the query string, which
  // covered both the admin (`/api/database?...`) and data-studio
  // (`/api/database`) list requests.
  databases: byPath(/^\/api\/database$/),
  database: byPath(/^\/api\/database\/\d+$/),
  schemas: byPath(/^\/api\/database\/\d+\/schemas$/),
  schema: byPath(/^\/api\/database\/\d+\/schema\//),
  metadata: byPath(/^\/api\/table\/\d+\/query_metadata$/),
};

function byPath(pattern: RegExp) {
  return (response: Response) =>
    response.request().method() === "GET" &&
    pattern.test(new URL(response.url()).pathname);
}

export type VisitOptions = {
  databaseId?: number;
  schemaId?: string;
  tableId?: number;
  fieldId?: number;
  /**
   * Responses to await (registered before navigation). Defaults to the same
   * id-dependent subset the Cypress helper waited on. The upstream
   * `skipWaiting: true` + manual `cy.wait(...)` call sites pass the waited
   * aliases here explicitly.
   */
  waitFor?: ResponseKind[];
};

/** Port of Shared.visitArea(area) / DataModel.visit / visitDataStudio. */
export async function visitDataModel(
  page: Page,
  area: Area,
  { databaseId, schemaId, tableId, fieldId, waitFor }: VisitOptions = {},
) {
  const basePath = getBasePath(area);
  let path = basePath;
  let defaultWaits: ResponseKind[] = ["databases"];

  if (databaseId != null && schemaId != null && tableId != null && fieldId != null) {
    path = `${basePath}/database/${databaseId}/schema/${schemaId}/table/${tableId}/field/${fieldId}`;
    defaultWaits = ["databases", "database", "schemas", "schema", "metadata"];
  } else if (databaseId != null && schemaId != null && tableId != null) {
    path = `${basePath}/database/${databaseId}/schema/${schemaId}/table/${tableId}`;
    defaultWaits = ["databases", "schemas", "schema", "metadata"];
  } else if (databaseId != null && schemaId != null) {
    path = `${basePath}/database/${databaseId}/schema/${schemaId}`;
    defaultWaits = ["databases", "schemas", "schema"];
  } else if (databaseId != null) {
    path = `${basePath}/database/${databaseId}`;
    defaultWaits = ["databases", "schemas", "schema"];
  }

  const waits = (waitFor ?? defaultWaits).map((kind) =>
    page.waitForResponse(RESPONSE_PREDICATES[kind]),
  );
  await page.goto(path);
  await Promise.all(waits);
}

/** PUT /api/table/:id — register before the edit, await after the blur. */
export function waitForTableUpdate(page: Page): Promise<Response> {
  return page.waitForResponse(
    (response) =>
      response.request().method() === "PUT" &&
      /^\/api\/table\/\d+$/.test(new URL(response.url()).pathname),
  );
}

/** PUT /api/field/:id — register before the edit, await after the blur. */
export function waitForFieldUpdate(page: Page): Promise<Response> {
  return page.waitForResponse(
    (response) =>
      response.request().method() === "PUT" &&
      /^\/api\/field\/\d+$/.test(new URL(response.url()).pathname),
  );
}

export const DataModel = {
  get: (page: Page): Locator => page.getByTestId("data-model"),
};

export const TablePicker = {
  getDatabases: (page: Page): Locator =>
    page.locator('[data-testid="tree-item"][data-type="database"]'),
  // Cypress filtered with `:contains(name)` — case-sensitive substring.
  getDatabase: (page: Page, name: string): Locator =>
    TablePicker.getDatabases(page).filter({
      hasText: new RegExp(escapeRegExp(name)),
    }),
  getSchemas: (page: Page): Locator =>
    page.locator('[data-testid="tree-item"][data-type="schema"]'),
  getSchema: (page: Page, name: string): Locator =>
    TablePicker.getSchemas(page).filter({
      hasText: new RegExp(escapeRegExp(name)),
    }),
  getTables: (page: Page): Locator =>
    page.locator('[data-testid="tree-item"][data-type="table"]'),
  getTable: (page: Page, name: string): Locator =>
    TablePicker.getTables(page).filter({
      hasText: new RegExp(escapeRegExp(name)),
    }),
  getSearchInput: (page: Page): Locator =>
    page.getByPlaceholder("Search tables", { exact: true }),
};

export const TableSection = {
  get: (page: Page): Locator => page.getByTestId("table-section"),
  clickFieldsTab: async (page: Page) => {
    await page.getByRole("tab", { name: /Fields/ }).click();
  },
  getNameInput: (page: Page): Locator =>
    TableSection.get(page).getByPlaceholder("Give this table a name", {
      exact: true,
    }),
  getDescriptionInput: (page: Page): Locator =>
    TableSection.get(page).getByPlaceholder("Give this table a description", {
      exact: true,
    }),
  getQueryBuilderLink: (page: Page): Locator =>
    TableSection.get(page).getByLabel("Go to this table", { exact: true }),
  getSortButton: (page: Page): Locator =>
    TableSection.get(page).getByRole("button", {
      name: "Sorting",
      exact: true,
    }),
  getField: (page: Page, name: string): Locator =>
    TableSection.get(page).getByRole("listitem", { name, exact: true }),
  getFieldNameInput: (page: Page, name: string): Locator =>
    TableSection.getField(page, name).getByPlaceholder(
      "Give this field a name",
      { exact: true },
    ),
  getFieldDescriptionInput: (page: Page, name: string): Locator =>
    TableSection.getField(page, name).getByPlaceholder("No description yet", {
      exact: true,
    }),
  /**
   * Port of clickTableSectionField: click the field's icon specifically to
   * avoid the name/description inputs inside the row.
   */
  clickField: async (page: Page, name: string) => {
    await TableSection.getField(page, name).getByRole("img").click();
  },
};

export const FieldSection = {
  get: (page: Page): Locator => page.getByTestId("field-section"),
  getDataType: (page: Page): Locator =>
    FieldSection.get(page).getByLabel("Data type", { exact: true }),
  getSemanticTypeInput: (page: Page): Locator =>
    FieldSection.get(page).getByPlaceholder("Select a semantic type", {
      exact: true,
    }),
  getSemanticTypeFkTarget: (page: Page): Locator =>
    FieldSection.get(page).getByLabel("Foreign key target", { exact: true }),
  getPreviewButton: (page: Page): Locator =>
    FieldSection.get(page).getByRole("button", { name: /Preview/ }),
};

export const PreviewSection = {
  get: (page: Page): Locator => page.getByTestId("preview-section"),
  getPreviewTypeInput: (page: Page): Locator =>
    PreviewSection.get(page).getByLabel("Preview type", { exact: true }),
};

/** Port of H.hovercard() (e2e-ui-elements-helpers.js). */
export function hovercard(page: Page): Locator {
  return page.locator(".mb-mantine-HoverCard-dropdown[role='dialog']");
}

/** Port of Shared.verifyAndCloseToast. */
export async function verifyAndCloseToast(page: Page, message: string) {
  await expect(undoToast(page)).toContainText(message);
  await icon(undoToast(page), "close").click({ force: true });
}

/**
 * Scoped port of H.assertTableData — header cells and first body rows of the
 * table rendered inside `scope`.
 */
export async function assertTableData(
  scope: Locator,
  { columns, firstRows = [] }: { columns: string[]; firstRows?: string[][] },
) {
  const headerCells = scope
    .getByTestId("table-root")
    .getByTestId("header-cell");
  await expect(headerCells).toHaveCount(columns.length);
  for (const [index, column] of columns.entries()) {
    await expect(headerCells.nth(index)).toHaveText(column);
  }

  const bodyCells = scope.getByTestId("table-body").getByTestId("cell-data");
  for (const [rowIndex, row] of firstRows.entries()) {
    for (const [cellIndex, cell] of row.entries()) {
      await expect(
        bodyCells.nth(columns.length * rowIndex + cellIndex),
      ).toHaveText(cell);
    }
  }
}

/**
 * Open the preview's column-description hovercard. Keeps the upstream
 * synthetic-event dispatch (see file header) and retries the whole
 * hover-then-visible sequence, because a dispatch that lands during a
 * re-render is silently lost.
 */
export async function hoverPreviewHeaderCell(page: Page) {
  await expect(async () => {
    const cell = PreviewSection.get(page)
      .getByTestId("header-cell")
      .getByTestId("cell-data");
    await cell.dispatchEvent("mouseenter");
    await cell.dispatchEvent("mouseover");
    await expect(hovercard(page)).toBeVisible({ timeout: 2_000 });
  }).toPass({ timeout: 15_000 });
}

/** Port of Shared.verifyTablePreview (minus the dataset wait — see header). */
export async function verifyTablePreview(
  page: Page,
  {
    column,
    description,
    values,
  }: { column: string; description?: string; values: string[] },
) {
  await PreviewSection.getPreviewTypeInput(page)
    .getByText("Table", { exact: true })
    .click();

  await assertTableData(PreviewSection.get(page), {
    columns: [column],
    firstRows: values.map((value) => [value]),
  });

  if (description != null) {
    await hoverPreviewHeaderCell(page);
    await expect(hovercard(page)).toContainText(description);
  }
}

/**
 * Port of Shared.verifyObjectDetailPreview. The Cypress version located the
 * row by label and asserted its index; asserting that the row AT rowNumber
 * has the label is equivalent and retries as one unit.
 */
export async function verifyObjectDetailPreview(
  page: Page,
  { rowNumber, row }: { rowNumber: number; row: [string, string] },
) {
  const [label, value] = row;

  await PreviewSection.getPreviewTypeInput(page)
    .getByText("Detail", { exact: true })
    .click();

  await expect(page.getByTestId("column-name").nth(rowNumber)).toHaveText(
    label,
  );
  await expect(page.getByTestId("value").nth(rowNumber)).toContainText(value);
}

/**
 * Replace an input's value via real keystrokes (`fill` doesn't mark these
 * metadata inputs dirty — EditableText gotcha in PORTING.md). Callers blur
 * afterwards to commit, mirroring `.clear().type(...).blur()`.
 */
export async function replaceValue(input: Locator, text: string) {
  await input.click();
  await input.press("ControlOrMeta+A");
  await input.press("Backspace");
  if (text.length > 0) {
    await input.pressSequentially(text);
  }
}

/** Port of the spec's admin table-section empty state check. */
export async function verifyAdminTableSectionEmptyState(page: Page) {
  const dataModel = DataModel.get(page);
  await expect(
    dataModel.getByText("Start by selecting data to model", { exact: true }),
  ).toBeVisible();
  await expect(
    dataModel.getByText(
      "Browse your databases to find the table you’d like to edit.",
      { exact: true },
    ),
  ).toBeVisible();
}

/** Port of the spec's admin field-section empty state check. */
export async function verifyFieldSectionEmptyState(page: Page) {
  const dataModel = DataModel.get(page);
  await expect(
    dataModel.getByText("Edit the table and fields", { exact: true }),
  ).toBeVisible();
  await expect(
    dataModel.getByText(
      "Select a field to edit its name, description, formatting, and more.",
      { exact: true },
    ),
  ).toBeVisible();
}

// startNewQuestion is now canonical in notebook.ts (the URL-navigation form
// this module previously carried). Re-exported so consumers of data-model keep
// their import unchanged.
export { startNewQuestion } from "./notebook";

/**
 * Port of H.resetTestTable({ type: "postgres", table: "multi_schema" }) —
 * recreates the Domestic/Wild schemas the knex task builds
 * (e2e/support/test_tables.js `multi_schema`) with plain SQL against the
 * writable postgres container. Only runs behind the PW_QA_DB_ENABLED gate.
 */
export async function resetTestTableMultiSchema() {
  await queryWritableDB(`
    CREATE SCHEMA IF NOT EXISTS "Domestic";
    CREATE SCHEMA IF NOT EXISTS "Wild";
    DROP TABLE IF EXISTS "Domestic"."Animals";
    CREATE TABLE "Domestic"."Animals" (name varchar(255), score integer);
    INSERT INTO "Domestic"."Animals" (name, score)
      VALUES ('Duck', 10), ('Horse', 20), ('Cow', 30);
    DROP TABLE IF EXISTS "Wild"."Animals";
    CREATE TABLE "Wild"."Animals" (name varchar(255), score integer);
    INSERT INTO "Wild"."Animals" (name, score)
      VALUES ('Snake', 10), ('Lion', 20), ('Elephant', 30);
    DROP TABLE IF EXISTS "Wild"."Birds";
    CREATE TABLE "Wild"."Birds" (name varchar(255), score integer);
    INSERT INTO "Wild"."Birds" (name, score) VALUES ('Toucan', 50);
  `);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
