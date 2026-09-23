/**
 * Helpers for the published-tables segments spec port
 * (e2e/test/scenarios/data-studio/published-tables-segments.cy.spec.ts).
 *
 * The `H.DataStudio.Tables.*` members for the *library* (published tables)
 * segments routes — `/data-studio/library/tables/:tableId/segments[/:id]` —
 * plus the `segmentsTab()` tab locator. These are the only pieces of that
 * Cypress surface not already carried by `support/data-studio-library.ts`
 * (tableHeader / tableOverviewPage) or `support/data-studio-tables.ts`
 * (visitTableOverviewPage / tableOverviewTab / tableFieldsTab).
 *
 * The SegmentList / SegmentEditor locator objects are NOT redefined here — the
 * published-tables pages render the same `table-segments-page` /
 * `new-segment-page` / `segment-detail-page` testids as the data-model surface,
 * so the spec imports them read-only from `support/segments-data-studio.ts`.
 *
 * New module per PORTING rule 9 — shared support modules are imported
 * read-only and never edited.
 */
import type { Locator, Page } from "@playwright/test";

import { tableHeader } from "./data-studio-library";

// === Routes =========================================================

/** The published-table segments list route. */
export function publishedTableSegmentsUrl(tableId: number): string {
  return `/data-studio/library/tables/${tableId}/segments`;
}

/** Port of H.DataStudio.Tables.visitSegmentsPage(tableId). */
export async function visitPublishedTableSegmentsPage(
  page: Page,
  tableId: number,
) {
  await page.goto(publishedTableSegmentsUrl(tableId));
}

/** Port of H.DataStudio.Tables.visitSegmentPage(tableId, segmentId). */
export async function visitPublishedTableSegmentPage(
  page: Page,
  tableId: number,
  segmentId: number,
) {
  await page.goto(`${publishedTableSegmentsUrl(tableId)}/${segmentId}`);
}

// === Header tabs ====================================================

/** Port of H.DataStudio.Tables.segmentsTab(): header().findByText("Segments"). */
export function tableSegmentsTab(page: Page): Locator {
  return tableHeader(page).getByText("Segments", { exact: true });
}
