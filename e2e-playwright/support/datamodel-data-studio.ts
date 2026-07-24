/**
 * Per-spec helpers for the datamodel-data-studio port
 * (e2e/test/scenarios/data-studio/data-model/datamodel-data-studio.cy.spec.ts).
 *
 * `support/data-model.ts` already carries the bulk of the `cy.H.DataModel`
 * surface (TablePicker/TableSection/FieldSection/PreviewSection basics,
 * visitDataModel, verifyAndCloseToast, assertTableData, resetTestTableMultiSchema).
 * Only the pieces that spec did not need live here, plus this spec's own
 * module-level helper functions. Shared support modules are imported read-only
 * (PORTING rule 9).
 */
import type { Locator, Page, Response } from "@playwright/test";

import type { MetabaseApi } from "./api";
import { TablePicker, TableSection } from "./data-model";
import { expect } from "./fixtures";
import { undoToast } from "./metrics";
import { icon, popover } from "./ui";

// === H.DataModel pieces not present in support/data-model.ts ===

/** Port of DataModel.TablePicker.getFilterForm(). */
export function getFilterForm(page: Page): Locator {
  return page.getByTestId("table-picker-filter");
}

/** Port of DataModel.TablePicker.openFilterPopover(). */
export async function openFilterPopover(page: Page) {
  await page.getByRole("button", { name: "Filter", exact: true }).click();
  await expect(popover(page)).toBeVisible();
}

/**
 * Port of DataModel.TablePicker.selectFilterOption(fieldLabel, optionLabel).
 *
 * Upstream is `popover().contains(optionLabel).click()`. All three selects in
 * the filter form are rendered `withinPortal: false`, so their dropdowns live
 * inside the filter form — scoping there (rule 3: prefer scoping) resolves the
 * same node set as the popover scope did. The option row is picked by role
 * because a Mantine `Select` option's inner text div is not the click target
 * (PORTING, wave 10).
 */
export async function selectFilterOption(
  page: Page,
  fieldLabel: string,
  optionLabel: string,
) {
  await page.getByRole("textbox", { name: fieldLabel, exact: true }).click();
  await getFilterForm(page)
    .getByRole("option", { name: new RegExp(escapeRegExp(optionLabel)) })
    .click();
}

/**
 * Click an option in the open Mantine `Select` dropdown.
 *
 * Upstream is `H.popover().findByText(label).click()` / `.contains(label)`.
 * Two things force a non-literal port:
 *  - The option's TEXT div is not the click target for a Mantine `Select`
 *    (PORTING, wave 10) — the `role="option"` row is.
 *  - The row's accessible name is NOT the label: `renderOption` puts an
 *    `Icon` (which renders `role="img"` + `aria-label`) and, for FK targets,
 *    the column description inside the row, so `{ name, exact: true }`
 *    matches NOTHING (measured: 0 vs 1). Matching a substring is also what
 *    `cy.contains` did.
 */
export async function clickPopoverOption(page: Page, label: string) {
  await popover(page)
    .getByRole("option", { name: new RegExp(escapeRegExp(label)) })
    .click();
}

/**
 * Port of DataModel.TablePicker.applyFilters(): click Apply and wait on the
 * `@listTables` alias (`GET /api/table?*`). Registered before the click
 * (PORTING rule 2).
 */
export async function applyFilters(page: Page) {
  const listTables = waitForListTables(page);
  await page.getByRole("button", { name: "Apply", exact: true }).click();
  await listTables;
}

/** The spec's `cy.intercept("GET", "/api/table?*").as("listTables")`. */
export function waitForListTables(page: Page): Promise<Response> {
  return page.waitForResponse((response) => {
    const url = new URL(response.url());
    return (
      response.request().method() === "GET" &&
      url.pathname === "/api/table" &&
      url.search.length > 0
    );
  });
}

/** Port of DataModel.TableSection.clickDetailsTab(). */
export async function clickDetailsTab(page: Page) {
  await page.getByRole("tab", { name: /Details/ }).click();
}

/** Port of DataModel.TableSection.getDependencyGraphLink(). */
export function getDependencyGraphLink(page: Page): Locator {
  return TableSection.get(page).getByRole("link", {
    name: "Dependency graph",
    exact: true,
  });
}

/** Port of DataModel.TableSection.getSortOrderInput() (a SegmentedControl with
 * `aria-label="Column order"`, which computes as a radiogroup). */
export function getSortOrderInput(page: Page): Locator {
  return TableSection.get(page).getByRole("radiogroup", {
    name: "Column order",
    exact: true,
  });
}

/**
 * Port of `TableSection.getSortOrderInput().findByDisplayValue(value)` — the
 * SegmentedControl's radio input carrying that value. `getByDisplayValue` is
 * missing from this Playwright install's types (PORTING), and for a radio the
 * display value is just the `value` attribute.
 */
export function getSortOrderRadio(page: Page, value: string): Locator {
  return getSortOrderInput(page).locator(`input[value="${value}"]`);
}

/**
 * Port of `TableSection.getSortOrderInput().findByLabelText(label)`. The label
 * is an `aria-label` on the visible Flex inside the SegmentedControl's
 * `<label>` — click that, never the sr-only radio input (PORTING).
 */
export function getSortOrderOption(page: Page, label: string): Locator {
  return getSortOrderInput(page).getByLabel(label, { exact: true });
}

/** Port of DataModel.TableSection.getActionsMenuButton(). */
export function getActionsMenuButton(page: Page): Locator {
  return TableSection.get(page).getByRole("button", {
    name: "More actions",
    exact: true,
  });
}

/** Port of DataModel.TableSection.getSortableField(name) — same locator as
 * getField, kept separate to mirror the helper the spec calls. */
export function getSortableField(page: Page, name: string): Locator {
  return TableSection.get(page).getByRole("listitem", { name, exact: true });
}

/** Port of DataModel.TableSection.getSortableFields(). */
export function getSortableFields(page: Page): Locator {
  return TableSection.get(page).getByRole("listitem");
}

/** Port of DataModel.TableSection.getVisibilityTypeInput(). */
export function getVisibilityTypeInput(page: Page): Locator {
  return TableSection.get(page).getByRole("textbox", {
    name: "Visibility layer",
    exact: true,
  });
}

/** Port of DataModel.TableSection.getCloseButton(). */
export function getTableSectionCloseButton(page: Page): Locator {
  return page.getByTestId("table-section-header").getByRole("link", {
    name: /close/,
  });
}

/** Port of DataModel.FieldSection.getCloseButton(). */
export function getFieldSectionCloseButton(page: Page): Locator {
  return page.getByTestId("field-section-header").getByRole("link", {
    name: /close/,
  });
}

/** Port of DataModel.FieldSection.getFieldValuesButton(). */
export function getFieldValuesButton(page: Page): Locator {
  return page
    .getByTestId("field-section")
    .getByRole("button", { name: /Field values/ });
}

/** Port of DataModel.FieldSection.getFilteringInput(). */
export function getFilteringInput(page: Page): Locator {
  return page
    .getByTestId("field-section")
    .getByPlaceholder("Select field filtering", { exact: true });
}

/** Port of DataModel.FieldSection.getDisplayValuesInput(). */
export function getDisplayValuesInput(page: Page): Locator {
  return page
    .getByTestId("field-section")
    .getByPlaceholder("Select display values", { exact: true });
}

/** Port of DataModel.FieldSection.getDisplayValuesFkTargetInput(). */
export function getDisplayValuesFkTargetInput(page: Page): Locator {
  return page
    .getByTestId("field-section")
    .getByPlaceholder("Choose a field", { exact: true });
}

// === spec-local helpers ===

type TableSummary = {
  id: number;
  db_id: number;
  display_name: string;
  name: string;
};

export type TableLookup = {
  databaseId: number;
  displayName?: string;
  name?: string;
};

/** Port of the spec-local getTableId (matches on display_name OR name). */
export async function getTableId(
  api: MetabaseApi,
  { databaseId, displayName, name }: TableLookup,
): Promise<number> {
  if (!displayName && !name) {
    throw new Error("displayName or name must be provided");
  }

  const response = await api.get("/api/table");
  const tables = (await response.json()) as TableSummary[];
  const table = tables.find((candidate) => {
    if (candidate.db_id !== databaseId) {
      return false;
    }
    if (displayName && candidate.display_name === displayName) {
      return true;
    }
    if (name && candidate.name === name) {
      return true;
    }
    return false;
  });

  if (!table) {
    throw new Error(
      `Table not found for database ${databaseId} (${displayName ?? name})`,
    );
  }

  return table.id;
}

/** Port of the spec-local updateTableAttributes. */
export async function updateTableAttributes(
  api: MetabaseApi,
  {
    databaseId,
    displayName,
    name,
    attributes,
  }: TableLookup & { attributes: Record<string, unknown> },
): Promise<number> {
  const tableId = await getTableId(api, { databaseId, displayName, name });
  await api.post("/api/data-studio/table/edit", {
    table_ids: [tableId],
    ...attributes,
  });
  return tableId;
}

/** Port of H.setUserAsAnalyst (e2e-users-helpers.ts). */
export async function setUserAsAnalyst(
  api: MetabaseApi,
  userId: number,
  enabled = true,
) {
  await api.put(`/api/user/${userId}`, { is_data_analyst: enabled });
}

/** Port of the spec-local findSearchResultByTableId. */
export function findSearchResultByTableId(
  page: Page,
  tableId: number,
): Locator {
  return page.locator(`[data-testid="tree-item"][data-table-id="${tableId}"]`);
}

/** Port of the spec-local expectTableVisible (upstream asserts existence). */
export async function expectTableVisible(page: Page, tableId: number) {
  await expect(findSearchResultByTableId(page, tableId)).toHaveCount(1);
}

/** Port of the spec-local expectTableNotVisible. */
export async function expectTableNotVisible(page: Page, tableId: number) {
  await expect(findSearchResultByTableId(page, tableId)).toHaveCount(0);
}

/** Port of the spec-local selectOwnerByName. */
export async function selectOwnerByName(page: Page, ownerLabel: string) {
  await page.getByRole("textbox", { name: "Owner", exact: true }).click();
  await getFilterForm(page)
    .getByRole("option", { name: new RegExp(escapeRegExp(ownerLabel)) })
    .click();
}

/**
 * Port of the spec-local selectOwnerByEmail. `cy.type()` clicks its subject
 * first (PORTING) and the option list is filtered by the search value, so the
 * email must arrive as real keystrokes.
 */
export async function selectOwnerByEmail(page: Page, email: string) {
  const input = page.getByRole("textbox", { name: "Owner", exact: true });
  await input.click();
  await input.press("ControlOrMeta+A");
  await input.press("Backspace");
  await input.pressSequentially(email);
  await getFilterForm(page)
    .getByRole("option", { name: new RegExp(escapeRegExp(email)) })
    .click();
}

/** Port of the spec-local toggleUnusedFilter. */
export async function toggleUnusedFilter(page: Page, checked: boolean) {
  const checkbox = page.getByLabel("Table isn’t referenced by anything", {
    exact: true,
  });
  if (checked) {
    await checkbox.check();
  } else {
    await checkbox.uncheck();
  }
}

/** Port of the spec-local openWritableDomesticSchema. */
export async function openWritableDomesticSchema(
  page: Page,
  visit: () => Promise<void>,
  databaseName: string,
  schemaName: string,
) {
  await visit();
  await TablePicker.getDatabase(page, databaseName).click();
  await TablePicker.getSchema(page, schemaName).click();
}

/**
 * Port of the spec's `cy.intercept` that rewrites `estimated_row_count` on the
 * schema-tables response. Native fetch rather than `route.fetch()` (the latter
 * chokes on the backend's set-cookie headers under bun — same reason
 * support/search-snowplow.ts proxies by hand).
 */
export async function stubEstimatedRowCount(
  page: Page,
  {
    databaseId,
    schemaName,
    tableName,
    rowCount,
  }: {
    databaseId: number;
    schemaName: string;
    tableName: string;
    rowCount: number;
  },
) {
  const pathname = `/api/database/${databaseId}/schema/${schemaName}`;
  await page.route(
    (url) => url.pathname === pathname,
    async (route) => {
      const request = route.request();
      const response = await fetch(request.url(), {
        method: request.method(),
        headers: await request.allHeaders(),
        redirect: "manual",
      });
      const body = (await response.json()) as unknown;
      const patched = Array.isArray(body)
        ? body.map((table: { display_name?: string; name?: string }) =>
            table.display_name === tableName || table.name === tableName
              ? { ...table, estimated_row_count: rowCount }
              : table,
          )
        : body;
      await route.fulfill({
        status: response.status,
        contentType: "application/json",
        body: JSON.stringify(patched),
      });
    },
  );
}

/** The tree-item checkbox helpers the select/deselect test defines inline. */
export function getDatabaseCheckbox(page: Page, databaseName: string): Locator {
  return TablePicker.getDatabase(page, databaseName).locator(
    'input[type="checkbox"]',
  );
}

export function getSchemaCheckbox(page: Page, schemaName: string): Locator {
  return TablePicker.getSchema(page, schemaName).locator(
    'input[type="checkbox"]',
  );
}

export function getTableCheckbox(
  page: Page,
  databaseId: number,
  schemaName: string,
  tableName: string,
): Locator {
  // Upstream filters the tree-item set by ATTRIBUTES on the item itself
  // (`.filter('[data-database-id=…][data-schema-name=…]')`), then by
  // `:contains(name)` — a case-sensitive substring.
  return page
    .locator(
      `[data-testid="tree-item"][data-type="table"][data-database-id="${databaseId}"][data-schema-name="${schemaName}"]`,
    )
    .filter({ hasText: new RegExp(escapeRegExp(tableName)) })
    .locator('input[type="checkbox"]');
}

export function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Local variant of `Shared.verifyAndCloseToast` (support/data-model.ts).
 *
 * Upstream's `H.undoToast()` is a singular `findByTestId`, which is fine in
 * Cypress because its command queue always let the previous toast finish
 * fading. Playwright fires the next action immediately, so a second toast
 * appears while the first is still mounted and the shared helper hits a
 * strict-mode violation (measured on "Table name/description updated" and
 * "Sync/Scan triggered"). Newest toast is FIRST in DOM order, so `.first()`
 * is the one that just appeared. Consolidation candidate: fold the `.first()`
 * into the shared helper.
 */
export async function verifyAndCloseToastFirst(page: Page, message: string) {
  const toast = undoToast(page).first();
  await expect(toast).toContainText(message);
  await closeToast(page);
}

/**
 * Close the newest undo toast.
 *
 * Upstream is `H.undoToast().icon("close").click({ force: true })`. Cypress's
 * force-click DISPATCHES at the resolved element; Playwright's moves the real
 * mouse to that element's coordinates and clicks whatever is topmost there.
 * When a modal is open behind the toast (the custom-mapping remapping modal)
 * the click lands on the modal OVERLAY and closes it — measured: the modal
 * detached ~400ms after opening, and the failure surfaced two steps later on
 * an unrelated "Save" button. `dispatchEvent("click")` is coordinate-free and
 * is the faithful equivalent of Cypress's force-click.
 */
export async function closeToast(page: Page) {
  await icon(undoToast(page).first(), "close").dispatchEvent("click");
}

/**
 * Blur whatever currently holds focus. `cy.type()` targets
 * `document.activeElement`, and `.blur()` is invoked on the same Cypress
 * subject that was typed into — re-resolving the input by its NEW name (the
 * field list's accessible name only updates once the PUT lands) resolves
 * nothing.
 */
export async function blurFocused(page: Page) {
  await page.locator(":focus").blur();
}
