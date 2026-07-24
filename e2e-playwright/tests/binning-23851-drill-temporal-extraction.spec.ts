/**
 * Playwright port of
 * e2e/test/scenarios/binning/reproductions/23851-drill-temporal-extraction.cy.spec.js
 *
 * metabase#23851 — drilling through a question whose breakout is a temporal
 * extraction (day-of-week) must work even when the underlying column has no
 * semantic type defined. The test strips ORDERS.CREATED_AT's semantic_type,
 * builds a bar question grouped by day-of-week, clicks a bar, and drills into
 * "See these Orders".
 *
 * Notes:
 *  - H.createQuestion(details, { visitQuestion: true }) → factory createQuestion
 *    + visitQuestion(page, id).
 *  - cy.intercept("POST", "/api/dataset") + cy.wait("@dataset") → waitForDataset
 *    registered BEFORE the drill click (PORTING rule 2).
 *  - cy.findAllByTestId("cell-data").should("contain", "37.65") is an ANY-match
 *    (PORTING rule 3) → the first cell-data whose text contains "37.65".
 *    (The value can change based on the year, per the upstream comment.)
 *  - No new helpers required — everything is in the shared support surface, so
 *    no support/binning-23851.ts was created (PORTING rule 9).
 */
import { chartPathWithFillColor } from "../support/binning";
import { createQuestion } from "../support/factories";
import { test, expect } from "../support/fixtures";
import { waitForDataset } from "../support/models";
import { getNotebookStep, openNotebook } from "../support/notebook";
import { SAMPLE_DATABASE } from "../support/sample-data";
import { popover, visitQuestion } from "../support/ui";

const { ORDERS, ORDERS_ID } = SAMPLE_DATABASE;

const CREATED_AT_BREAKOUT = [
  "field",
  ORDERS.CREATED_AT,
  {
    "base-type": "type/DateTime",
    "temporal-unit": "day-of-week",
  },
];

test.describe("issue 23851", () => {
  test.beforeEach(async ({ mb }) => {
    await mb.restore();
    await mb.signInAsAdmin();
  });

  test("can drill through question with temporal extraction breakout without semantic type defined for the column (metabase#23851)", async ({
    page,
    mb,
  }) => {
    await mb.api.put(`/api/field/${ORDERS.CREATED_AT}`, {
      semantic_type: null,
    });

    const { id } = await createQuestion(mb.api, {
      query: {
        "source-table": ORDERS_ID,
        aggregation: [["count"]],
        breakout: [CREATED_AT_BREAKOUT],
      },
      display: "bar",
    });
    await visitQuestion(page, id);

    await expect(chartPathWithFillColor(page, "#509EE3")).toHaveCount(7);

    const dataset = waitForDataset(page);
    await chartPathWithFillColor(page, "#509EE3").nth(5).click();
    await popover(page).getByText("See these Orders", { exact: true }).click();
    await dataset;

    await expect(page.getByTestId("filter-pill")).toHaveText(
      "Created At: Day of week is equal to 6",
    );
    await expect(
      page.getByTestId("cell-data").filter({ hasText: "37.65" }).first(),
    ).toBeVisible();

    await openNotebook(page);
    await expect(
      getNotebookStep(page, "filter").getByText(
        "Created At: Day of week is equal to 6",
        { exact: true },
      ),
    ).toBeVisible();
  });
});
