/**
 * Spec-local helpers for the dashboard-filters-with-question-revert port
 * (e2e/test/scenarios/filters-reproductions/dashboard-filters-with-question-revert.cy.spec.js).
 * Only the functions/constants defined inside that spec live here; shared
 * helpers (getDashboardCard, popover, …) are imported read-only.
 */
import { expect } from "@playwright/test";
import type { FrameLocator, Page } from "@playwright/test";

import { getDashboardCard } from "./dashboard";
import { SAMPLE_DATABASE, SAMPLE_DB_ID } from "./sample-data";
import { popover } from "./ui";

const { REVIEWS } = SAMPLE_DATABASE;

type CellScope = Page | FrameLocator;

/**
 * Port of the spec's updatedQuestionDetails: rewrites the GUI question into a
 * native SQL question whose RATING template tag is field-mapped to
 * REVIEWS.RATING with a number/= widget.
 */
export const updatedQuestionDetails = {
  dataset_query: {
    database: SAMPLE_DB_ID,
    type: "native",
    native: {
      "template-tags": {
        RATING: {
          type: "dimension",
          name: "RATING",
          id: "017b9185-c7cc-41ec-ba17-b8b21af879cc",
          "display-name": "Field-mapped Rating",
          default: null,
          dimension: ["field", REVIEWS.RATING, null],
          "widget-type": "number/=",
          options: null,
        },
      },
      query: "SELECT * FROM REVIEWS WHERE {{RATING}} LIMIT 2",
    },
  },
  parameters: [
    {
      id: "017b9185-c7cc-41ec-ba17-b8b21af879cc",
      type: "number/=",
      target: ["dimension", ["template-tag", "RATING"]],
      slug: "RATING",
    },
  ],
  parameter_mappings: [],
};

/**
 * Port of the spec-local connectFilterToColumn: inside the dashcard's filter
 * mapping, open the "Select…" column picker and pick `column`. findAllByText
 * with a string is exact; .eq(index) → .nth(index).
 */
export async function connectFilterToColumn(
  page: Page,
  column: string,
  index = 0,
) {
  const card = getDashboardCard(page);
  await expect(
    card.getByText("Column to filter on", { exact: true }),
  ).toBeVisible();
  await card.getByText("Select…", { exact: true }).click();

  await popover(page).getByText(column, { exact: true }).nth(index).click();
}

/**
 * Port of assertFilterIsDisconnected: the unfiltered first-two reviews are
 * shown. Cypress `should("contain"/"not.contain")` over the cell-data set is a
 * substring check against the elements' combined text → a toPass loop over the
 * joined cell texts (also gives the query time to re-run after a filter change).
 */
export async function assertFilterIsDisconnected(scope: CellScope) {
  await expect(async () => {
    const text = (
      await scope.getByTestId("cell-data").allInnerTexts()
    ).join(" ");
    expect(text).toContain("christ");
    expect(text).toContain("xavier");
    expect(text).not.toContain("kale");
  }).toPass();
}

/** Port of assertFilterIsApplied: only the rating-3 reviews are shown. */
export async function assertFilterIsApplied(scope: CellScope) {
  await expect(async () => {
    const text = (
      await scope.getByTestId("cell-data").allInnerTexts()
    ).join(" ");
    expect(text).toContain("kale");
    expect(text).toContain("pete");
    expect(text).not.toContain("xavier");
  }).toPass();
}
