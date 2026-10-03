/**
 * Helpers for the published-tables measures spec port
 * (e2e/test/scenarios/data-studio/measures/measures-published-tables.cy.spec.ts).
 *
 * The `H.DataStudio.Tables.*` members for the *library* (published tables)
 * measures routes — `/data-studio/library/tables/:tableId/measures[/:id|/new]` —
 * plus the `measuresTab()` tab locator. These are the only pieces of that
 * Cypress surface not already carried by `support/data-studio-library.ts`
 * (tableHeader / tableOverviewPage) or `support/data-studio-tables.ts`
 * (visitTableOverviewPage / tableOverviewTab / tableFieldsTab). Exactly the
 * shape `support/published-tables-segments.ts` takes for the segments routes.
 *
 * The MeasureList / MeasureEditor locator objects are NOT redefined here — the
 * published-table pages render the same `table-measures-page` /
 * `new-measure-page` / `measure-detail-page` testids as the data-model surface,
 * so the spec imports them read-only from `support/measures-data-studio.ts`
 * (the fuller of the two existing MeasureEditor objects — it already carries
 * getActionsButton / getBreadcrumb, which `support/measures-queries.ts` does
 * not). No third MeasureEditor is added.
 *
 * New module per PORTING rule 9 — shared support modules are imported
 * read-only and never edited.
 */
import type { Locator, Page } from "@playwright/test";

import { tableHeader } from "./data-studio-library";

// === Routes =========================================================

/** The published-table measures list route. */
export function publishedTableMeasuresUrl(tableId: number): string {
  return `/data-studio/library/tables/${tableId}/measures`;
}

/** Port of H.DataStudio.Tables.visitMeasuresPage(tableId). */
export async function visitPublishedTableMeasuresPage(
  page: Page,
  tableId: number,
) {
  await page.goto(publishedTableMeasuresUrl(tableId));
}

/** Port of H.DataStudio.Tables.visitMeasurePage(tableId, measureId). */
export async function visitPublishedTableMeasurePage(
  page: Page,
  tableId: number,
  measureId: number,
) {
  await page.goto(`${publishedTableMeasuresUrl(tableId)}/${measureId}`);
}

// === Header tabs ====================================================

/** Port of H.DataStudio.Tables.measuresTab(): header().findByText("Measures"). */
export function tableMeasuresTab(page: Page): Locator {
  return tableHeader(page).getByText("Measures", { exact: true });
}
