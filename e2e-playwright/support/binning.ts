/**
 * Binning helpers for the binning spec ports — ports of
 * e2e-dimension-list-helpers.js (getDimensionByName,
 * getBinningButtonForDimension, changeBinningForDimension),
 * chartPathWithFillColor from e2e-visual-tests-helpers.js, and the
 * simple/notebook dispatch of H.openTable from
 * e2e-ad-hoc-question-helpers.js. Lives in its own file so shared support
 * modules stay untouched (PORTING.md rule 9).
 *
 * NOTE for the consolidation pass: this changeBinningForDimension supersedes
 * the one in support/metrics.ts. That version filters dimension rows with
 * `hasText: name` (case-insensitive substring in Playwright), so "Total"
 * would match the "Subtotal" row — which sorts first in the Orders dimension
 * list. Cypress `:contains` is case-sensitive substring, so the original
 * helper never hit this. Here rows are matched with a case-sensitive regex.
 */
import type { Locator, Page } from "@playwright/test";
import { expect } from "@playwright/test";

import { echartsContainer } from "./charts";
import { openTableNotebook } from "./joins";
import { visitQuestionAdhoc } from "./permissions";
import { SAMPLE_DB_ID } from "./sample-data";
import { popover } from "./ui";

/** Port of H.chartPathWithFillColor. */
export function chartPathWithFillColor(page: Page, color: string): Locator {
  return echartsContainer(page).locator(`path[fill="${color}"]`);
}

/**
 * Port of H.openTable: open a table as an ad-hoc question in simple or
 * notebook mode (dispatches to the existing visitQuestionAdhoc /
 * openTableNotebook ports).
 */
export async function openTable(
  page: Page,
  { table, mode }: { table: number; mode?: "notebook" },
) {
  if (mode === "notebook") {
    await openTableNotebook(page, table);
  } else {
    await visitQuestionAdhoc(page, {
      dataset_query: {
        database: SAMPLE_DB_ID,
        query: { "source-table": table },
        type: "query",
      },
    });
  }
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Port of getDimensionByName: dimension rows filtered by (optionally)
 * aria-selected state and a case-sensitive substring match on the name,
 * first match wins — mirroring `:contains(name).eq(0)`.
 */
export function getDimensionByName(
  page: Page,
  { name, isSelected }: { name: string; isSelected?: boolean },
): Locator {
  const dimensions =
    isSelected === undefined
      ? page.getByTestId("dimension-list-item")
      : page.locator(
          `[data-testid="dimension-list-item"][aria-selected="${isSelected}"]`,
        );
  return dimensions.filter({ hasText: new RegExp(escapeRegExp(name)) }).first();
}

/**
 * Port of H.getBinningButtonForDimension: the binning button only renders on
 * hover, so hover the row first (the Cypress helper realHovers).
 */
export async function getBinningButtonForDimension(
  page: Page,
  options: { name: string; isSelected?: boolean },
): Promise<Locator> {
  const dimension = getDimensionByName(page, options);
  await dimension.hover();
  return dimension.getByTestId("dimension-list-item-binning");
}

/**
 * Port of H.changeBinningForDimension: open the dimension's binning popover
 * and pick the new bucket. The bucket list is in the last open popover — in
 * notebook mode it stacks on top of the group-by column popover.
 */
export async function changeBinningForDimension(
  page: Page,
  {
    name,
    fromBinning,
    toBinning,
    isSelected,
  }: {
    name: string;
    fromBinning?: string;
    toBinning: string;
    isSelected?: boolean;
  },
) {
  const binningButton = await getBinningButtonForDimension(page, {
    name,
    isSelected,
  });
  if (fromBinning) {
    await expect(binningButton).toHaveText(fromBinning);
  }
  await binningButton.click({ force: true });
  await popover(page).last().getByText(toBinning, { exact: true }).click();
}
