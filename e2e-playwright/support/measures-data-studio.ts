/**
 * Helpers for the data-studio measures spec port
 * (e2e/test/scenarios/data-studio/measures/measures-data-studio.cy.spec.ts).
 *
 * Measures management inside the data-studio data-model surface: the
 * `table-measures-page` list, the `new-measure-page` / `measure-detail-page`
 * editor, and the `measure-revision-history-page`. These are a Playwright port
 * of the H.DataModel.MeasureList / MeasureEditor / MeasureRevisionHistory
 * helper surface (e2e/support/helpers/e2e-datamodel-helpers.ts) plus
 * H.createMeasure (e2e-table-metadata-helpers.js).
 *
 * NOTE the sibling module `support/measures-queries.ts` also carries a
 * `MeasureEditor` — but that one targets the *library* measure route
 * (`/data-studio/library/tables/:id/measures/new`) and exposes only the subset
 * that spec needs. This module is the data-model surface's fuller
 * MeasureEditor (description, actions menu, breadcrumb, the three pane tabs).
 * Consolidating the two is consolidation debt, noted in the findings file —
 * measures-queries.ts is not edited here (parallel agents; PORTING rule 9).
 *
 * Snowplow helpers → no-op stubs (PORTING rule 6; no snowplow-micro in the
 * spike harness). The UI actions still fire, only the assertions are stubbed.
 */
import type { Locator, Page } from "@playwright/test";

import type { MetabaseApi } from "./api";
import { SAMPLE_DB_SCHEMA_ID } from "./data-model";
import { SAMPLE_DB_ID } from "./sample-data";

// === Snowplow stubs (PORTING rule 6) ================================
export const resetSnowplow = async () => {};
export const enableTracking = async () => {};
export const expectNoBadSnowplowEvents = async () => {};
export const expectUnstructuredSnowplowEvent = async (
  _event: Record<string, unknown>,
  _count?: number,
) => {};

// === Navigation =====================================================

export function getMeasuresBaseUrl(tableId: number): string {
  return `/data-studio/data/database/${SAMPLE_DB_ID}/schema/${SAMPLE_DB_SCHEMA_ID}/table/${tableId}/measures`;
}

/** GET /api/table/:id/query_metadata — the `@metadata` alias predicate. */
export function waitForMetadata(page: Page) {
  return page.waitForResponse(
    (response) =>
      response.request().method() === "GET" &&
      /^\/api\/table\/\d+\/query_metadata/.test(
        new URL(response.url()).pathname,
      ),
  );
}

/** POST /api/measure — the `@createMeasure` alias predicate. */
export function waitForCreateMeasure(page: Page) {
  return page.waitForResponse(
    (response) =>
      response.request().method() === "POST" &&
      new URL(response.url()).pathname === "/api/measure",
  );
}

/** PUT /api/measure/:id — the `@updateMeasure` alias predicate. */
export function waitForUpdateMeasure(page: Page) {
  return page.waitForResponse(
    (response) =>
      response.request().method() === "PUT" &&
      /^\/api\/measure\/\d+$/.test(new URL(response.url()).pathname),
  );
}

/**
 * Port of H.DataModel.visitDataStudioMeasures — navigate to a table's measures
 * tab and wait for its query_metadata fetch (registered before goto).
 */
export async function visitDataStudioMeasures(page: Page, tableId: number) {
  const metadata = waitForMetadata(page);
  await page.goto(getMeasuresBaseUrl(tableId));
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
 * Port of the spec-local visitDataModelMeasure: navigate straight to a
 * measure's detail page. Cypress issued a bare cy.visit with no wait.
 */
export async function visitDataModelMeasure(
  page: Page,
  tableId: number,
  measureId: number,
) {
  await page.goto(`${getMeasuresBaseUrl(tableId)}/${measureId}`);
}

// === Measure list ===================================================

export const MeasureList = {
  get: (page: Page): Locator => page.getByTestId("table-measures-page"),
  getEmptyState: (page: Page): Locator =>
    MeasureList.get(page).getByText("No measures yet", { exact: true }),
  getNewMeasureLink: (page: Page): Locator =>
    MeasureList.get(page).getByRole("link", { name: /New measure/i }),
  getMeasure: (page: Page, name: string): Locator =>
    MeasureList.get(page).getByRole("listitem", { name, exact: true }),
  getMeasures: (page: Page): Locator =>
    MeasureList.get(page).getByRole("listitem"),
};

// === Measure editor =================================================

export const MeasureEditor = {
  get: (page: Page): Locator =>
    page.locator(
      "[data-testid='new-measure-page'], [data-testid='measure-detail-page']",
    ),
  getNameInput: (page: Page): Locator =>
    MeasureEditor.get(page).getByPlaceholder("New measure", { exact: true }),
  getDescriptionInput: (page: Page): Locator =>
    MeasureEditor.get(page).getByLabel("Give it a description", {
      exact: true,
    }),
  getAggregationPlaceholder: (page: Page): Locator =>
    MeasureEditor.get(page).getByText("Pick an aggregation function", {
      exact: true,
    }),
  getPreviewLink: (page: Page): Locator =>
    MeasureEditor.get(page).getByRole("link", { name: /Preview/i }),
  getSaveButton: (page: Page): Locator =>
    MeasureEditor.get(page).getByRole("button", { name: "Save", exact: true }),
  getCancelButton: (page: Page): Locator =>
    MeasureEditor.get(page).getByRole("button", {
      name: "Cancel",
      exact: true,
    }),
  getActionsButton: (page: Page): Locator =>
    page.getByLabel("Measure actions", { exact: true }),
  // Cypress used a bare cy.findByText(tableName). The breadcrumb is the only
  // place the table name renders as clickable text on the editor page.
  getBreadcrumb: (page: Page, tableName: string): Locator =>
    page.getByText(tableName, { exact: true }),
  getDefinitionTab: (page: Page): Locator =>
    page.getByTestId("measure-pane-header").getByText("Definition", {
      exact: true,
    }),
  getRevisionHistoryTab: (page: Page): Locator =>
    page.getByTestId("measure-pane-header").getByText("Revision history", {
      exact: true,
    }),
  getDependenciesTab: (page: Page): Locator =>
    page.getByTestId("measure-pane-header").getByText("Dependencies", {
      exact: true,
    }),
};

export const MeasureRevisionHistory = {
  get: (page: Page): Locator =>
    page.getByTestId("measure-revision-history-page"),
};

// === API ============================================================

/** Port of H.createMeasure (e2e-table-metadata-helpers.js): POST /api/measure. */
export async function createMeasure(
  api: MetabaseApi,
  {
    name,
    definition,
    description = null,
  }: {
    name: string;
    definition: Record<string, unknown>;
    description?: string | null;
  },
): Promise<{ id: number; [key: string]: unknown }> {
  const response = await api.post("/api/measure", {
    name,
    description,
    definition,
  });
  return response.json() as Promise<{ id: number; [key: string]: unknown }>;
}
