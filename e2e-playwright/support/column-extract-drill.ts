/**
 * Helpers for the column-extract-drill spec port
 * (e2e/test/scenarios/visualizations-tabular/drillthroughs/column_extract_drill.cy.spec.js):
 * the extract-column drill launched from a table COLUMN HEADER (distinct from
 * the "Add column" button flavor in column-shortcuts.ts) — date-part extraction
 * (Year, Day of week…), and domain/host/path from a URL/email column. After the
 * chosen extraction a new column is appended to the table.
 *
 * Kept in its own module per PORTING.md rule 9 (parallel agents never edit
 * shared support files — import from them read-only).
 */
import type { Page } from "@playwright/test";
import { expect } from "@playwright/test";

import { tableHeaderClick } from "./notebook";
import { visitQuestionAdhoc } from "./permissions";
import { SAMPLE_DATABASE, SAMPLE_DB_ID } from "./sample-data";
import { popover } from "./ui";

const { PEOPLE_ID } = SAMPLE_DATABASE;

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Register a wait for the next ad-hoc POST /api/dataset (the `cy.intercept(...)
 * .as(alias)` + `cy.wait("@alias")` pattern — register before the trigger). */
function waitForDataset(page: Page) {
  return page.waitForResponse(
    (response) =>
      response.request().method() === "POST" &&
      new URL(response.url()).pathname === "/api/dataset",
  );
}

/**
 * Port of H.openPeopleTable({ limit }) — open the People table as an ad-hoc
 * question (simple mode).
 */
export async function openPeopleTable(
  page: Page,
  { limit }: { limit?: number } = {},
) {
  await visitQuestionAdhoc(page, {
    dataset_query: {
      database: SAMPLE_DB_ID,
      query: {
        "source-table": PEOPLE_ID,
        ...(limit != null ? { limit } : {}),
      },
      type: "query",
    },
  });
}

/**
 * Port of the spec-local extractColumnAndCheck (the column-header drill flavor).
 *
 * Notes:
 * - `H.tableHeaderClick(column)` opens the column click-actions popover.
 * - `H.popover().findByText(extraction)` picks the top-level "Extract …" drill
 *   (title-only horizontal button → exact getByText).
 * - The extraction OPTION buttons render `title` (e.g. "Year") plus a
 *   `subTitle` example ("2026, 2027") inside ONE Mantine label element
 *   (ClickActionControl.tsx). So the element text is "Year2026, 2027" — an exact
 *   getByText can't match it (PORTING.md mixed-content-text-nodes). Match with a
 *   case-sensitive substring regex, which also lets `should("contain", example)`
 *   port to a toContainText on that same element. Case-sensitive "Year" won't
 *   hit the lowercase "year" in "Quarter of year" etc.
 * - `cy.wait(1)` (a 1ms no-op between the two clicks) is dropped.
 */
export async function extractColumnAndCheck(
  page: Page,
  {
    column,
    option,
    newColumn = option,
    extraction,
    value,
    example,
  }: {
    column: string;
    option: string;
    extraction: string;
    newColumn?: string;
    value?: string;
    example?: string;
  },
) {
  const dataset = waitForDataset(page);

  await tableHeaderClick(page, column);

  const pop = popover(page);
  await pop.getByText(extraction, { exact: true }).click();

  const optionRe = new RegExp(escapeRegExp(option));
  if (example) {
    await expect(pop.getByText(optionRe)).toContainText(example);
  }
  await pop.getByText(optionRe).click();

  await dataset;

  // eslint-disable-next-line metabase/no-unsafe-element-filtering — the last
  // column header is the newly extracted column.
  const lastHeader = page.getByRole("columnheader").last();
  await lastHeader.scrollIntoViewIfNeeded();
  await expect(lastHeader).toHaveText(newColumn);
  await expect(lastHeader).toBeVisible();

  if (value) {
    await expect(
      page.getByRole("gridcell", { name: value, exact: true }),
    ).toBeVisible();
  }
}
