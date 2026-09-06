/**
 * Playwright port of
 * e2e/test/scenarios/binning/binning-reproductions.cy.spec.js
 *
 * A grab-bag of binning-related bug reproductions. Each test preserves its
 * upstream issue number:
 *  - metabase#16327 — no double binning options on a saved native question
 *  - metabase#16770 — change bucket size on a sorted field
 *  - metabase#17975 — order-by survives a breakout-field change (SQL question)
 *  - metabase#18646 — binning options when joining on a saved native question
 *  - metabase#10441, metabase#11439 — date granularity on Summarize
 *  - metabase#22382 — no duplicate breakout field
 *
 * Notes:
 *  - The Cypress `H.createNativeQuestion(..., { loadMetadata: true })` and
 *    `H.createQuestion(..., { visitQuestion: true })` options are ported via
 *    the shared visitQuestion port (see support/binning-reproductions.ts).
 *  - `cy.wait("@dataset")` → waitForDataset registered before the triggering
 *    action (PORTING rule 2).
 *  - Several tests assert date labels ("2027", "June 2025"). CI runs with
 *    TZ=US/Pacific process-wide; run these locally with the same TZ to match.
 */
import {
  changeBinningForDimension,
  openTable,
} from "../support/binning";
import {
  clickBreakoutOptionLeft,
  createNativeQuestionWithMetadata,
  openTemporalBucketFromGroupBy,
  pickSavedQuestion,
} from "../support/binning-reproductions";
import { openVizTypeSidebar } from "../support/charts-extras";
import { createNativeQuestion, createQuestion } from "../support/factories";
import { test, expect } from "../support/fixtures";
import { cartesianChartCircles } from "../support/metrics";
import { summarize, waitForDataset } from "../support/models";
import {
  getNotebookStep,
  miniPicker,
  startNewQuestion,
  visualize,
} from "../support/notebook";
import { visitQuestionAdhoc } from "../support/permissions";
import { rightSidebar } from "../support/question-saved";
import { SAMPLE_DATABASE, SAMPLE_DB_ID } from "../support/sample-data";
import { icon, popover, visitQuestion } from "../support/ui";

const { ORDERS, ORDERS_ID } = SAMPLE_DATABASE;

test.describe("binning related reproductions", () => {
  test.beforeEach(async ({ mb }) => {
    await mb.restore();
    await mb.signInAsAdmin();
  });

  test("shouldn't render double binning options when question is based on the saved native question (metabase#16327)", async ({
    page,
    mb,
  }) => {
    await createNativeQuestion(mb.api, {
      name: "16327",
      native: { query: "select * from products limit 5" },
    });

    await startNewQuestion(page);
    await pickSavedQuestion(page, "16327");

    await page
      .getByText("Pick a function or metric", { exact: true })
      .click();
    await popover(page).getByText("Count of rows", { exact: true }).click();

    await page.getByText("Pick a column to group by", { exact: true }).click();
    await openTemporalBucketFromGroupBy(page, /CREATED_AT/i);

    // Implicit assertion — fails (strict-mode violation) if "Day" is rendered
    // more than once, which is exactly the repro.
    await expect(page.getByText("Day", { exact: true })).toBeVisible();
  });

  test("should be able to update the bucket size / granularity on a field that has sorting applied to it (metabase#16770)", async ({
    page,
  }) => {
    await visitQuestionAdhoc(page, {
      dataset_query: {
        database: SAMPLE_DB_ID,
        query: {
          "source-table": ORDERS_ID,
          aggregation: [["count"]],
          breakout: [["field", ORDERS.CREATED_AT, { "temporal-unit": "month" }]],
          "order-by": [
            ["asc", ["field", ORDERS.CREATED_AT, { "temporal-unit": "month" }]],
          ],
        },
        type: "query",
      },
      display: "line",
    });

    await summarize(page);

    const dataset = waitForDataset(page);
    await changeBinningForDimension(page, {
      name: "Created At",
      fromBinning: "by month",
      toBinning: "Year",
      isSelected: true,
    });
    const response = await dataset;
    expect((await response.json()).error).toBeUndefined();

    await expect(
      page.getByText("Count by Created At: Year", { exact: true }),
    ).toBeVisible();
    await expect(page.getByText("2027", { exact: true }).first()).toBeVisible();
  });

  test("should not remove order-by (sort) when changing the breakout field on an SQL saved question (metabase#17975)", async ({
    page,
    mb,
  }) => {
    await createNativeQuestionWithMetadata(page, mb.api, {
      name: "17975",
      native: { query: "SELECT * FROM ORDERS" },
    });

    await startNewQuestion(page);
    await pickSavedQuestion(page, "17975");

    await getNotebookStep(page, "summarize")
      .getByText("Pick a function or metric", { exact: true })
      .click();
    await popover(page).getByText("Count of rows", { exact: true }).click();
    await getNotebookStep(page, "summarize")
      .getByText("Pick a column to group by", { exact: true })
      .click();
    await popover(page).getByText("CREATED_AT", { exact: true }).click();

    await page.getByRole("button", { name: "Sort", exact: true }).click();
    await popover(page).getByText("CREATED_AT: Month", { exact: true }).click();

    await getNotebookStep(page, "summarize")
      .getByText("CREATED_AT: Month", { exact: true })
      .click();
    const option = popover(page).getByRole("option", {
      name: "CREATED_AT",
      exact: true,
    });
    // The temporal-bucket button is opacity-gated on row hover — hover the row
    // first to reveal it (mirrors getBinningButtonForDimension), then click.
    await option.hover();
    await option.getByLabel("Temporal bucket").click({ force: true });
    await popover(page).last().getByText("Quarter", { exact: true }).click();

    await expect(
      getNotebookStep(page, "sort").getByText("CREATED_AT: Quarter", {
        exact: true,
      }),
    ).toBeVisible();
  });

  test("should render binning options when joining on the saved native question (metabase#18646)", async ({
    page,
    mb,
  }) => {
    await createNativeQuestionWithMetadata(page, mb.api, {
      name: "18646",
      native: { query: "select * from products" },
    });

    await openTable(page, { table: ORDERS_ID, mode: "notebook" });

    await icon(page, "join_left_outer").click();

    await pickSavedQuestion(page, "18646");

    await popover(page).getByText("Product ID", { exact: true }).click();
    await popover(page).getByText("ID", { exact: true }).click();

    await page.getByText("Summarize", { exact: true }).click();
    await popover(page).getByText("Count of rows", { exact: true }).click();

    await getNotebookStep(page, "summarize")
      .getByText("Pick a column to group by", { exact: true })
      .click();
    await popover(page).getByText("18646", { exact: true }).click();

    const createdAtOption = popover(page).getByRole("option", {
      name: /CREATED_AT/,
    });
    await expect(
      createdAtOption.getByText("by month", { exact: true }),
    ).toBeVisible();
    await clickBreakoutOptionLeft(createdAtOption);

    await expect(
      getNotebookStep(page, "summarize").getByText(
        "18646 - Product → CREATED_AT: Month",
        { exact: true },
      ),
    ).toBeVisible();

    await visualize(page);
    await expect(cartesianChartCircles(page).first()).toBeVisible();
  });

  test("should display date granularity on Summarize when opened from saved question (metabase#10441, metabase#11439)", async ({
    page,
    mb,
  }) => {
    await createQuestion(mb.api, {
      name: "11439",
      query: { "source-table": ORDERS_ID },
    });

    // It is essential for this repro to find the question following these exact
    // steps (e.g. visiting /collection/root would yield a different result).
    await startNewQuestion(page);
    await pickSavedQuestion(page, "11439");

    await visualize(page);
    await summarize(page);

    const createdAt = rightSidebar(page)
      .getByRole("listitem", { name: "Created At", exact: true })
      .first();
    // The temporal-bucket button is opacity-gated on row hover — reveal it by
    // hovering the row, then click.
    await createdAt.hover();
    await createdAt.getByLabel("Temporal bucket").click({ force: true });

    await popover(page).getByRole("button", { name: "More…" }).click();
    await expect(
      popover(page).getByText("Hour of day", { exact: true }),
    ).toBeVisible();
  });

  test("shouldn't duplicate the breakout field (metabase#22382)", async ({
    page,
    mb,
  }) => {
    const questionDetails = {
      name: "22382",
      query: {
        "source-table": ORDERS_ID,
        aggregation: [["count"]],
        breakout: [["field", ORDERS.CREATED_AT, { "temporal-unit": "month" }]],
      },
    };

    const { id } = await createQuestion(mb.api, questionDetails);
    await visitQuestion(page, id);

    // Open settings through viz type picker to ensure "Table Options" is in the
    // sidebar.
    await openVizTypeSidebar(page);
    const sidebarLeft = page.getByTestId("sidebar-left");
    await sidebarLeft.getByTestId("Table-button").click();
    await expect(sidebarLeft.getByText("Table options")).toBeVisible();
    await expect(
      sidebarLeft
        .getByTestId("draggable-item-Created At: Month")
        .getByText("Created At: Month", { exact: true }),
    ).toBeVisible();
    await icon(
      sidebarLeft.getByTestId("draggable-item-Created At: Month"),
      "eye_outline",
    ).click({ force: true });
    await sidebarLeft.getByRole("button", { name: "Done" }).click();

    await summarize(page);

    const removeDataset = waitForDataset(page);
    const pinnedDimensions = page.getByTestId("pinned-dimensions");
    await expect(pinnedDimensions).toContainText("Created At");
    await icon(pinnedDimensions, "close").click();
    await removeDataset;

    await expect(
      page.getByTestId("query-visualization-root").getByText("Count", {
        exact: true,
      }),
    ).toBeVisible();

    const addDataset = waitForDataset(page);
    await page
      .getByTestId("sidebar-right")
      .getByText("Created At", { exact: true })
      .first()
      .click();
    await addDataset;

    const vizRoot = page.getByTestId("query-visualization-root");
    // All implicit assertions — strict mode fails if a string appears twice.
    await expect(vizRoot.getByText("Count", { exact: true })).toBeVisible();
    await expect(
      vizRoot.getByText("Created At: Month", { exact: true }),
    ).toBeVisible();
    await expect(
      vizRoot.getByText("June 2025", { exact: true }),
    ).toBeVisible();
  });
});
