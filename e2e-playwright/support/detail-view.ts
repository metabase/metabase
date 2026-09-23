/**
 * Ports of the Cypress DetailView helpers
 * (e2e/support/helpers/e2e-detail-view-helpers.ts), plus two helpers the
 * detail-view spec needs that no support module exports yet:
 * - remapDisplayValueToFK (e2e/support/helpers/api/remapDisplayValueToFK.ts)
 * - queryBuilderFiltersPanel (e2e/support/helpers/e2e-ui-elements-helpers.js)
 */
import { Locator, Page, expect } from "@playwright/test";

import type { MetabaseApi } from "./api";

export interface RowOptions {
  index: number;
  rowsCount: number;
}

/**
 * Port of DetailView.visitTable: navigate and wait for the table
 * query_metadata response (registered before the navigation).
 */
export async function visitTable(
  page: Page,
  tableId: number | string,
  rowId: number | string,
) {
  const metadataResponse = page.waitForResponse(
    (response) =>
      response.request().method() === "GET" &&
      /^\/api\/table\/[^/]+\/query_metadata$/.test(
        new URL(response.url()).pathname,
      ),
  );
  await page.goto(`/table/${tableId}/detail/${rowId}`);
  await metadataResponse;
}

/**
 * Port of DetailView.visitModel: navigate and wait for the card
 * query_metadata response (registered before the navigation).
 */
export async function visitModel(
  page: Page,
  modelIdOrSlug: number | string,
  rowId: number | string,
) {
  const metadataResponse = page.waitForResponse(
    (response) =>
      response.request().method() === "GET" &&
      /^\/api\/card\/[^/]+\/query_metadata$/.test(
        new URL(response.url()).pathname,
      ),
  );
  await page.goto(`/model/${modelIdOrSlug}/detail/${rowId}`);
  await metadataResponse;
}

export function getHeader(page: Page): Locator {
  return page.getByTestId("detail-view-header");
}

export function getDetails(page: Page): Locator {
  return page.getByTestId("object-details");
}

/**
 * Port of DetailView.getDetailsRow: asserts the total row count (like the
 * Cypress `.should("have.length", rowsCount)`) before returning the row.
 */
export async function getDetailsRow(
  page: Page,
  { index, rowsCount }: RowOptions,
): Promise<Locator> {
  const rows = getDetails(page).getByTestId("object-details-row");
  await expect(rows).toHaveCount(rowsCount);
  return rows.nth(index);
}

export async function getDetailsRowColumnName(
  page: Page,
  options: RowOptions,
): Promise<Locator> {
  return (await getDetailsRow(page, options)).getByTestId("column-name");
}

export async function getDetailsRowValue(
  page: Page,
  options: RowOptions,
): Promise<Locator> {
  return (await getDetailsRow(page, options)).getByTestId("value");
}

export function getRelationships(page: Page): Locator {
  return page.getByTestId("relationships");
}

/** Port of DetailView.verifyDetails. */
export async function verifyDetails(page: Page, rows: [string, string][]) {
  const detailsRows = getDetails(page).getByTestId("object-details-row");
  await expect(detailsRows).toHaveCount(rows.length);

  for (const [index, [column, value]] of rows.entries()) {
    await expect(
      detailsRows.nth(index).getByTestId("column-name"),
    ).toHaveText(column);
    await expect(detailsRows.nth(index).getByTestId("value")).toHaveText(
      value,
    );
  }
}

/** Port of H.queryBuilderFiltersPanel. */
export function queryBuilderFiltersPanel(page: Page): Locator {
  return page.getByTestId("qb-filters-panel");
}

/**
 * Port of H.remapDisplayValueToFK: remap a field display value to a foreign
 * key. Both `display_value` and `fk` are field ids.
 */
export async function remapDisplayValueToFK(
  api: MetabaseApi,
  {
    display_value,
    name,
    fk,
  }: { display_value: number; name: string; fk: number },
) {
  await api.post(`/api/field/${display_value}/dimension`, {
    field_id: display_value,
    name,
    human_readable_field_id: fk,
    type: "external",
  });
}
