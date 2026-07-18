/**
 * Helpers for the multiple-column-breakouts spec port
 * (e2e/test/scenarios/question/multiple-column-breakouts.cy.spec.ts).
 *
 * Ports `H` helpers not already in the shared modules, plus the spec-local
 * ones (tableHeaderClick, the breakout-picker interaction, the query-alias
 * waits). New helpers live here only — the shared support/*.ts files are
 * edited by other porting agents.
 *
 * `H.createQuestion(details, { visitQuestion: true })` and
 * `H.createQuestionAndDashboard` are reimplemented rather than reusing
 * api.ts's versions because:
 * - api.createQuestion doesn't type `visualization_settings` (the details in
 *   this spec all set `table.pivot: false`);
 * - api.createQuestionAndDashboard only PUTs the dashcards, dropping the
 *   dashboard's `enable_embedding` / `embedding_params` (POST /api/dashboard
 *   ignores those — see PORTING.md), which the public/embedded assertions need.
 */
import { type Locator, type Page, expect } from "@playwright/test";

import type { MetabaseApi } from "./api";
import { SAMPLE_DB_ID } from "./sample-data";
import { popover, visitQuestion } from "./ui";

export type QuestionDetails = {
  name?: string;
  type?: string;
  display?: string;
  collection_id?: number;
  database?: number;
  query: Record<string, unknown>;
  visualization_settings?: Record<string, unknown>;
};

export type DashboardDetails = {
  name?: string;
  parameters?: Record<string, unknown>[];
  enable_embedding?: boolean;
  embedding_params?: Record<string, string>;
};

/** Port of H.createQuestion (POST /api/card). Returns the created card id. */
export async function createQuestion(
  api: MetabaseApi,
  details: QuestionDetails,
): Promise<{ id: number }> {
  const {
    name = "test question",
    type = "question",
    display = "table",
    database = SAMPLE_DB_ID,
    query,
    visualization_settings = {},
    ...rest
  } = details;
  const response = await api.post("/api/card", {
    name,
    type,
    display,
    visualization_settings,
    ...rest,
    dataset_query: { type: "query", query, database },
  });
  return (await response.json()) as { id: number };
}

/** Port of H.createQuestion(details, { visitQuestion: true }). */
export async function createAndVisitQuestion(
  page: Page,
  api: MetabaseApi,
  details: QuestionDetails,
): Promise<{ id: number }> {
  const card = await createQuestion(api, details);
  await visitQuestion(page, card.id);
  return card;
}

/**
 * Port of H.createQuestionAndDashboard for this spec's shape. Applies the
 * dashboard's embedding settings (POST /api/dashboard ignores them) and the
 * single dashcard in one follow-up PUT.
 */
export async function createQuestionAndDashboard(
  api: MetabaseApi,
  {
    questionDetails,
    dashboardDetails = {},
  }: {
    questionDetails: QuestionDetails;
    dashboardDetails?: DashboardDetails;
  },
): Promise<{ questionId: number; dashboardId: number }> {
  const { id: questionId } = await createQuestion(api, questionDetails);

  const {
    name = "Test Dashboard",
    enable_embedding,
    embedding_params,
    ...rest
  } = dashboardDetails;
  // parameters go through POST /api/dashboard (accepted); embedding does not.
  const dashboardResponse = await api.post("/api/dashboard", { name, ...rest });
  const { id: dashboardId } = (await dashboardResponse.json()) as {
    id: number;
  };

  await api.put(`/api/dashboard/${dashboardId}`, {
    enable_embedding,
    embedding_params,
    dashcards: [
      { id: -1, card_id: questionId, row: 0, col: 0, size_x: 11, size_y: 6 },
    ],
  });

  return { questionId, dashboardId };
}

/**
 * Port of H.assertTableData — header cells and first body rows of the QB's
 * result table. Page-level (unlike data-model.ts's scoped version).
 */
export async function assertTableData(
  page: Page,
  { columns, firstRows = [] }: { columns: string[]; firstRows?: string[][] },
) {
  const table = page.getByTestId("table-root");
  const headerCells = table.getByTestId("header-cell");
  await expect(headerCells).toHaveCount(columns.length);
  for (const [index, column] of columns.entries()) {
    await expect(headerCells.nth(index)).toHaveText(column);
  }

  const bodyCells = table.getByTestId("table-body").getByTestId("cell-data");
  for (const [rowIndex, row] of firstRows.entries()) {
    for (const [cellIndex, cell] of row.entries()) {
      await expect(
        bodyCells.nth(columns.length * rowIndex + cellIndex),
      ).toHaveText(cell);
    }
  }
}

/**
 * Port of H.summarize() (non-notebook mode): guard against the empty-sidebar
 * race, then click Summarize in the QB header.
 */
export async function summarize(page: Page) {
  await expect(page.getByText(/^Doing science/)).toHaveCount(0);
  await page
    .getByTestId("qb-header-action-panel")
    .getByText("Summarize", { exact: true })
    .click();
}

/**
 * Port of the spec-local tableHeaderClick: click a result-table header to open
 * its column menu. Clicks the header text (not the cell center, which can land
 * on the resize gutter). columnIndex mirrors the upstream `.eq(columnIndex)`.
 */
export async function tableHeaderClick(
  page: Page,
  columnName: string,
  { columnIndex = 0 }: { columnIndex?: number } = {},
) {
  await page
    .getByTestId("table-root")
    .getByText(columnName, { exact: true })
    .nth(columnIndex)
    .click();
}

/**
 * Port of the breakout-picker interaction in the "create a query with multiple
 * breakouts" test: in the open group-by popover, hover the column row to reveal
 * its bucket button, click it, then pick a bucket from the follow-up popover.
 */
export async function addBreakoutColumn(
  page: Page,
  {
    columnName,
    bucketLabel,
    bucketName,
  }: { columnName: string; bucketLabel: string; bucketName: string },
) {
  const column = popover(page).getByLabel(columnName, { exact: true });
  await column.hover();
  await column.getByLabel(bucketLabel, { exact: true }).click();
  // The bucket options open in a second popover.
  await popover(page).last().getByText(bucketName, { exact: true }).click();
}

// === query-alias waits (register BEFORE the triggering action, await after) ===

/** POST /api/dataset (the "@dataset" alias). */
export function datasetResponse(page: Page) {
  return page.waitForResponse(
    (response) =>
      response.request().method() === "POST" &&
      new URL(response.url()).pathname === "/api/dataset",
  );
}

/** POST /api/dataset/pivot (the "@pivotDataset" alias). */
export function pivotDatasetResponse(page: Page) {
  return page.waitForResponse(
    (response) =>
      response.request().method() === "POST" &&
      new URL(response.url()).pathname === "/api/dataset/pivot",
  );
}

/** /api/dashboard/*​/dashcard/*​/card/*​/query (the "@dashcardQuery" alias). */
export function dashcardQueryResponse(page: Page) {
  return page.waitForResponse((response) =>
    /^\/api\/dashboard\/(pivot\/)?\d+\/dashcard\/\d+\/card\/\d+\/query$/.test(
      new URL(response.url()).pathname,
    ),
  );
}

/** /api/public/dashboard/*​/dashcard/*​/card/* (the "@publicDashcardQuery"). */
export function publicDashcardQueryResponse(page: Page) {
  return page.waitForResponse((response) =>
    /^\/api\/public\/dashboard\/[^/]+\/dashcard\/\d+\/card\/\d+/.test(
      new URL(response.url()).pathname,
    ),
  );
}

/** /api/embed/dashboard/*​/dashcard/*​/card/* (the "@embedDashcardQuery"). */
export function embedDashcardQueryResponse(page: Page) {
  return page.waitForResponse((response) =>
    /^\/api\/embed\/dashboard\/[^/]+\/dashcard\/\d+\/card\/\d+/.test(
      new URL(response.url()).pathname,
    ),
  );
}

/** The "add or remove columns" checkbox toggle used by the viz-settings tests. */
export async function toggleColumn(
  sidebar: Locator,
  columnName: string,
  isVisible: boolean,
) {
  const checkbox = sidebar.getByLabel(columnName, { exact: true }).first();
  await expect(checkbox).toBeChecked({ checked: !isVisible });
  await checkbox.click();
  await expect(checkbox).toBeChecked({ checked: isVisible });
}
