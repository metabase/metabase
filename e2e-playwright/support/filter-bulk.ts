/**
 * Helpers for the filter-bulk spec port — `H` helpers not yet in the shared
 * modules:
 * - hovercard, queryBuilderFooter (e2e-ui-elements-helpers.js)
 * - createSegment (e2e-table-metadata-helpers.js)
 * - setupBooleanQuery (e2e-boolean-helpers.js)
 *
 * Kept separate from the shared support/*.ts files because those are edited
 * by parallel porting agents; fold into ui.ts/models.ts when consolidating.
 */
import type { Locator, Page } from "@playwright/test";

import type { MetabaseApi } from "./api";
import { waitForDataset } from "./models";
import { SAMPLE_DB_ID } from "./sample-data";
import { visitQuestion } from "./ui";

/** Port of H.hovercard: the visible Mantine HoverCard dropdown. */
export function hovercard(page: Page): Locator {
  return page
    .locator(".mb-mantine-HoverCard-dropdown[role='dialog']")
    .filter({ visible: true });
}

/** Port of H.queryBuilderFooter. */
export function queryBuilderFooter(page: Page): Locator {
  return page.getByTestId("view-footer");
}

/** Port of H.createSegment (POST /api/segment). */
export async function createSegment(
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
): Promise<{ id: number }> {
  const response = await api.post("/api/segment", {
    name,
    description,
    definition,
  });
  return (await response.json()) as { id: number };
}

/**
 * Counter for POST /api/dataset responses — the wait-free side of the
 * Cypress `cy.get("@dataset.all").should("have.length", n)` assertions.
 * Attach BEFORE the navigation/action whose requests should be counted.
 */
export function trackDatasetRequests(page: Page): () => number {
  let count = 0;
  page.on("response", (response) => {
    if (
      response.request().method() === "POST" &&
      new URL(response.url()).pathname === "/api/dataset"
    ) {
      count += 1;
    }
  });
  return () => count;
}

// until we have a test dataset that includes boolean data, we can use this
// question to test booleans (same as the Cypress helper)
const BOOLEAN_QUERY =
  'select 0::integer as "integer", true::boolean AS "boolean" union all \nselect 1::integer as "integer", false::boolean AS "boolean" union all \nselect null as "integer", true::boolean AS "boolean" union all \nselect -1::integer as "integer", null AS "boolean"';

/**
 * Port of H.setupBooleanQuery: create + visit a native question with a
 * boolean column, then explore its results as an ad-hoc query.
 */
export async function setupBooleanQuery(page: Page, api: MetabaseApi) {
  const response = await api.post("/api/card", {
    name: "Boolean Query",
    display: "table",
    visualization_settings: {
      "table.pivot_column": "boolean",
      "table.cell_column": "integer",
    },
    dataset_query: {
      type: "native",
      native: { query: BOOLEAN_QUERY, "template-tags": {} },
      database: SAMPLE_DB_ID,
    },
  });
  const { id } = (await response.json()) as { id: number };
  await visitQuestion(page, id);

  const dataset = waitForDataset(page);
  await page.getByText("Explore results", { exact: true }).click();
  await dataset;
}
