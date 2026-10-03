/**
 * Ports of the ad-hoc table helpers from
 * e2e/support/helpers/e2e-ad-hoc-question-helpers.js — the canonical home for
 * H.openTable and its thin wrappers (openProductsTable / openOrdersTable /
 * openPeopleTable / openReviewsTable), which upstream all call openTable(...).
 *
 * Consolidated from the copies that had drifted across binning.ts (openTable,
 * simple/notebook, no limit), table-drills.ts (openTable/openReviewsTable, simple
 * + limit), column-shortcuts.ts (openOrdersTable + limit), column-extract-drill.ts
 * (openPeopleTable + limit), question-settings.ts (openOrdersTable, no limit) and
 * dashboard-core.ts (openProductsTable, no limit). Each of those modules now
 * re-exports from here so consumer imports stay unchanged.
 *
 * openTable is the SUPERSET of every copy: it dispatches simple vs notebook mode
 * (mirroring binning.ts) and accepts an optional `limit` on the simple path
 * (mirroring the table-drills / column-shortcuts / column-extract copies). No
 * current caller opens a table in notebook mode with a limit, so the notebook
 * path preserves binning.ts's exact behaviour (openTableNotebook, no limit).
 */
import type { Page } from "@playwright/test";

import { openTableNotebook } from "./joins";
import { visitQuestionAdhoc } from "./permissions";
import { SAMPLE_DATABASE, SAMPLE_DB_ID } from "./sample-data";

const { ORDERS_ID, PRODUCTS_ID, PEOPLE_ID, REVIEWS_ID } = SAMPLE_DATABASE;

/**
 * Port of H.openTable: open a table as an ad-hoc question in simple or notebook
 * mode, optionally limiting the number of rows (simple mode).
 */
export async function openTable(
  page: Page,
  {
    database = SAMPLE_DB_ID,
    table,
    mode,
    limit,
  }: { database?: number; table: number; mode?: "notebook"; limit?: number },
) {
  if (mode === "notebook") {
    await openTableNotebook(page, table);
  } else {
    await visitQuestionAdhoc(page, {
      dataset_query: {
        database,
        query: {
          "source-table": table,
          ...(limit != null ? { limit } : {}),
        },
        type: "query",
      },
    });
  }
}

/** Port of H.openProductsTable. */
export async function openProductsTable(
  page: Page,
  { mode, limit }: { mode?: "notebook"; limit?: number } = {},
) {
  await openTable(page, { table: PRODUCTS_ID, mode, limit });
}

/** Port of H.openOrdersTable. */
export async function openOrdersTable(
  page: Page,
  { mode, limit }: { mode?: "notebook"; limit?: number } = {},
) {
  await openTable(page, { table: ORDERS_ID, mode, limit });
}

/** Port of H.openPeopleTable. */
export async function openPeopleTable(
  page: Page,
  { mode, limit }: { mode?: "notebook"; limit?: number } = {},
) {
  await openTable(page, { table: PEOPLE_ID, mode, limit });
}

/** Port of H.openReviewsTable. */
export async function openReviewsTable(
  page: Page,
  { mode, limit }: { mode?: "notebook"; limit?: number } = {},
) {
  await openTable(page, { table: REVIEWS_ID, mode, limit });
}
