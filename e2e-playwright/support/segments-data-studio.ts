/**
 * Helpers for the data-studio data-model segments spec port
 * (e2e/test/scenarios/data-studio/data-model/segments-data-studio.cy.spec.ts).
 *
 * Segments management inside the data-studio data-model surface. This is a
 * DIFFERENT UI from the admin segment list (support/datamodel-segments.ts,
 * which targets `segment-list-app`): the data-studio surface renders
 * `table-segments-page` / `new-segment-page` / `segment-detail-page`. The
 * locators here are a Playwright port of the H.DataModel.SegmentList /
 * SegmentEditor / SegmentRevisionHistory helper surface
 * (e2e/support/helpers/e2e-datamodel-helpers.ts).
 *
 * New module per PORTING rule 9 — imports read-only from the shared support
 * modules (data-model.ts, sample-data.ts) and does not edit them.
 */
import type { Locator, Page } from "@playwright/test";

import { SAMPLE_DB_SCHEMA_ID } from "./data-model";
import { SAMPLE_DB_ID } from "./sample-data";

// === Navigation =====================================================

export function getSegmentsBaseUrl(tableId: number): string {
  return `/data-studio/data/database/${SAMPLE_DB_ID}/schema/${SAMPLE_DB_SCHEMA_ID}/table/${tableId}/segments`;
}

/** GET /api/table/:id/query_metadata — the `@metadata` alias predicate. */
function metadataResponse(page: Page) {
  return page.waitForResponse(
    (response) =>
      response.request().method() === "GET" &&
      /^\/api\/table\/\d+\/query_metadata/.test(
        new URL(response.url()).pathname,
      ),
  );
}

/**
 * Port of H.DataModel.visitDataStudioSegments — navigate to a table's segments
 * tab and wait for its query_metadata fetch (registered before goto).
 */
export async function visitDataStudioSegments(page: Page, tableId: number) {
  const metadata = metadataResponse(page);
  await page.goto(getSegmentsBaseUrl(tableId));
  await metadata;
}

/**
 * Port of the spec-local visitDataStudioTable → H.DataModel.visitDataStudio
 * with a tableId — navigate to a table's fields tab.
 */
export async function visitDataStudioTable(page: Page, tableId: number) {
  await page.goto(
    `/data-studio/data/database/${SAMPLE_DB_ID}/schema/${SAMPLE_DB_SCHEMA_ID}/table/${tableId}`,
  );
}

/**
 * Port of the spec-local visitDataModelSegment: navigate straight to a
 * segment's detail page. Cypress issued a bare cy.visit with no wait.
 */
export async function visitDataModelSegment(
  page: Page,
  tableId: number,
  segmentId: number,
) {
  await page.goto(`${getSegmentsBaseUrl(tableId)}/${segmentId}`);
}

// === Segment list ===================================================

export const SegmentList = {
  get: (page: Page): Locator => page.getByTestId("table-segments-page"),
  getEmptyState: (page: Page): Locator =>
    SegmentList.get(page).getByText("No segments yet", { exact: true }),
  getNewSegmentLink: (page: Page): Locator =>
    SegmentList.get(page).getByRole("link", { name: /New segment/i }),
  getSegment: (page: Page, name: string): Locator =>
    SegmentList.get(page).getByRole("listitem", { name, exact: true }),
  getSegments: (page: Page): Locator =>
    SegmentList.get(page).getByRole("listitem"),
};

// === Segment editor =================================================

export const SegmentEditor = {
  get: (page: Page): Locator =>
    page.locator(
      "[data-testid='new-segment-page'], [data-testid='segment-detail-page']",
    ),
  getNameInput: (page: Page): Locator =>
    SegmentEditor.get(page).getByPlaceholder("New segment", { exact: true }),
  getDescriptionInput: (page: Page): Locator =>
    SegmentEditor.get(page).getByLabel("Give it a description", {
      exact: true,
    }),
  getFilterPlaceholder: (page: Page): Locator =>
    SegmentEditor.get(page).getByText("Add filters to narrow your answer", {
      exact: true,
    }),
  getSaveButton: (page: Page): Locator =>
    SegmentEditor.get(page).getByRole("button", { name: "Save", exact: true }),
  getCancelButton: (page: Page): Locator =>
    SegmentEditor.get(page).getByRole("button", {
      name: "Cancel",
      exact: true,
    }),
  getActionsButton: (page: Page): Locator =>
    page.getByLabel("Segment actions", { exact: true }),
  // Cypress used a bare cy.findByText(tableName) — case-insensitive exact via
  // getByText's default. The breadcrumb is the only place the table name shows
  // as clickable text on the editor.
  getBreadcrumb: (page: Page, tableName: string): Locator =>
    page.getByText(tableName, { exact: true }),
  getDefinitionTab: (page: Page): Locator =>
    page.getByTestId("segment-pane-header").getByText("Definition", {
      exact: true,
    }),
  getRevisionHistoryTab: (page: Page): Locator =>
    page.getByTestId("segment-pane-header").getByText("Revision history", {
      exact: true,
    }),
  getDependenciesTab: (page: Page): Locator =>
    page.getByTestId("segment-pane-header").getByText("Dependencies", {
      exact: true,
    }),
};

export const SegmentRevisionHistory = {
  get: (page: Page): Locator =>
    page.getByTestId("segment-revision-history-page"),
};
