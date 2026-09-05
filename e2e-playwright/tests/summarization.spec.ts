/**
 * Playwright port of
 * e2e/test/scenarios/question/summarization.cy.spec.js
 *
 * Summarize a question: removing aggregations, pinning/unpinning group-by
 * dimensions, binning, custom-expression aggregations, distinct + temporal
 * bucketing, and removing sorted metrics from the summarize sidebar.
 *
 * Issues covered: metabase#12899, #13306, #13469, #13098, #12625, #19454.
 *
 * The Cypress beforeEach registered a POST /api/dataset intercept ("@dataset");
 * it is only awaited inside removeMetricFromSidebar, where the wait is
 * re-registered before the triggering click per PORTING.md rule 2.
 */
import { openOrdersTable, openReviewsTable } from "../support/ad-hoc-question";
import { changeBinningForDimension } from "../support/binning";
import {
  customExpressionCompletion,
  expectCustomExpressionValue,
  formatExpression,
} from "../support/custom-column-3";
import { test, expect } from "../support/fixtures";
import { summarize } from "../support/models";
import { getDimensionByName } from "../support/nested-questions";
import {
  enterCustomColumnDetails,
  expressionEditorWidget,
  tableHeaderColumn,
  visualize,
} from "../support/notebook";
import {
  ORDERS_QUESTION_ID,
  SAMPLE_DATABASE,
  SAMPLE_DB_ID,
} from "../support/sample-data";
import {
  clickDimensionLeft,
  createCard,
  createTestQuery,
  getRemoveDimensionButton,
  removeMetricFromSidebar,
} from "../support/summarization";
import { tableInteractiveHeader } from "../support/table-column-settings";
import { icon, popover, visitQuestion } from "../support/ui";

const { ORDERS_ID } = SAMPLE_DATABASE;

test.describe("scenarios > question > summarize sidebar", () => {
  test.beforeEach(async ({ mb, page }) => {
    await mb.restore();
    await mb.signInAsAdmin();

    await visitQuestion(page, ORDERS_QUESTION_ID);
    await summarize(page);
  });

  test("removing all aggregations should show add aggregation button with label", async ({
    page,
  }) => {
    await icon(page.getByTestId("aggregation-item"), "close").click();

    await expect(page.getByTestId("add-aggregation-button")).toHaveText(
      "Add a function or metric",
    );
  });

  test("selected dimensions becomes pinned to the top of the dimensions list", async ({
    page,
  }) => {
    const total = getDimensionByName(page, { name: "Total" });
    await expect(total).toHaveAttribute("aria-selected", "false");
    await clickDimensionLeft(total);

    await expect(getDimensionByName(page, { name: "Total" })).toHaveAttribute(
      "aria-selected",
      "true",
    );

    await page.getByRole("button", { name: "Done", exact: true }).click();

    await summarize(page);

    // Removed from the unpinned list
    const unpinnedDimensions = page.getByTestId("unpinned-dimensions");
    await expect(
      unpinnedDimensions.getByText("Total", { exact: true }),
    ).toHaveCount(0);

    // Displayed in the pinned list
    const pinnedDimensions = page.getByTestId("pinned-dimensions");
    await expect(
      pinnedDimensions.getByText("Orders → Total", { exact: true }),
    ).toHaveCount(0);
    await expect(
      getDimensionByName(pinnedDimensions, { name: "Total" }),
    ).toHaveAttribute("aria-selected", "true");

    (await getRemoveDimensionButton(page, { name: "Total" })).click();

    // Becomes visible in the unpinned list again
    await expect(
      unpinnedDimensions.getByText("Total", { exact: true }),
    ).toBeVisible();
  });

  test("selected dimensions from another table includes the table alias when becomes pinned to the top", async ({
    page,
  }) => {
    await getDimensionByName(page, { name: "State" }).click();

    await page.getByRole("button", { name: "Done", exact: true }).click();

    await summarize(page);

    const pinnedDimensions = page.getByTestId("pinned-dimensions");
    await expect(
      getDimensionByName(pinnedDimensions, { name: "User → State" }),
    ).toHaveAttribute("aria-selected", "true");

    (await getRemoveDimensionButton(page, { name: "User → State" })).click();

    await expect(
      page.getByText("User → State", { exact: true }),
    ).toHaveCount(0);
  });

  test("selecting a binning adds a dimension", async ({ page }) => {
    await clickDimensionLeft(getDimensionByName(page, { name: "Total" }));

    await changeBinningForDimension(page, {
      name: "Quantity",
      toBinning: "10 bins",
    });

    const total = getDimensionByName(page, { name: "Total" });
    await total.scrollIntoViewIfNeeded();
    await expect(total).toHaveAttribute("aria-selected", "true");
    await expect(
      total.getByLabel("Binning strategy", { exact: true }),
    ).toBeVisible();

    const quantity = getDimensionByName(page, { name: "Quantity" });
    await expect(quantity).toHaveAttribute("aria-selected", "true");
    await expect(
      quantity.getByLabel("Binning strategy", { exact: true }),
    ).toBeVisible();

    const discount = getDimensionByName(page, { name: "Discount" });
    await discount.getByRole("button", { name: "Add dimension" }).hover();
    await expect(
      discount.getByLabel("Binning strategy", { exact: true }),
    ).toBeVisible();
  });

  test("should allow using `Custom Expression` in orders metrics (metabase#12899)", async ({
    page,
  }) => {
    await openOrdersTable(page, { mode: "notebook" });
    await summarize(page, { mode: "notebook" });
    await popover(page).getByText("Custom Expression", { exact: true }).click();

    await enterCustomColumnDetails(page, {
      formula: "2 * Max([Total])",
      name: "twice max total",
    });

    await expressionEditorWidget(page)
      .getByRole("button", { name: "Done", exact: true })
      .click();
    await expect(
      page.getByTestId("aggregate-step").getByText("twice max total"),
    ).toBeVisible();

    await visualize(page);

    await expect(page.getByText("318.7", { exact: true })).toBeVisible();
  });

  test("should keep manually entered parenthesis intact if they affect the result (metabase#13306)", async ({
    page,
  }) => {
    await openOrdersTable(page, { mode: "notebook" });
    await summarize(page, { mode: "notebook" });

    await popover(page).getByText("Custom Expression", { exact: true }).click();
    await enterCustomColumnDetails(page, {
      formula: "sum([Total]) / (sum([Product → Price]) * average([Quantity]))",
    });
    await formatExpression(page);

    await expectCustomExpressionValue(
      page,
      "Sum([Total]) /\n  (Sum([Product → Price]) * Average([Quantity]))",
    );
  });

  test("distinct inside custom expression should suggest non-numeric types (metabase#13469)", async ({
    page,
  }) => {
    await openReviewsTable(page, { mode: "notebook" });
    await summarize(page, { mode: "notebook" });
    await popover(page).getByText("Custom Expression", { exact: true }).click();

    await enterCustomColumnDetails(page, {
      formula: "Distinct([R",
      blur: false,
    });

    // The point of failure for ANY non-numeric value reported in v0.36.4.
    // The default type for "Reviewer" is "No semantic type".
    await expect(customExpressionCompletion(page, "Reviewer")).toBeVisible();
  });

  test("summarizing by distinct datetime should allow granular selection (metabase#13098)", async ({
    page,
  }) => {
    await openOrdersTable(page, { mode: "notebook" });

    await summarize(page, { mode: "notebook" });
    await popover(page)
      .getByText("Number of distinct values of ...", { exact: true })
      .click();
    // The Temporal bucket button is revealed on hover of its column row (the
    // Cypress helper realHovers it) — hover the "Created At" option first.
    const createdAtOption = popover(page).getByRole("option", {
      name: "Created At",
    });
    await createdAtOption.hover();
    await createdAtOption
      .getByLabel("Temporal bucket", { exact: true })
      .click();

    await popover(page).last().getByRole("button", { name: "More…" }).click();
    await popover(page)
      .last()
      .getByText("Hour of day", { exact: true })
      .click();
  });

  test("should handle (removing) multiple metrics when one is sorted (metabase#12625)", async ({
    page,
    mb,
  }) => {
    const dataset_query = await createTestQuery(mb.api, {
      database: SAMPLE_DB_ID,
      stages: [
        {
          source: { type: "table", id: ORDERS_ID },
          aggregations: [
            { type: "operator", operator: "count" },
            {
              type: "operator",
              operator: "sum",
              args: [{ type: "column", name: "SUBTOTAL" }],
            },
            {
              type: "operator",
              operator: "sum",
              args: [{ type: "column", name: "TOTAL" }],
            },
          ],
          breakouts: [
            {
              type: "column",
              name: "CREATED_AT",
              sourceName: "ORDERS",
              unit: "year",
            },
          ],
          orderBys: [
            {
              direction: "desc",
              type: "column",
              name: "sum",
              displayName: "Sum of Subtotal",
            },
          ],
        },
      ],
    });
    const card = await createCard(mb.api, { name: "12625", dataset_query });
    await visitQuestion(page, card.id);

    await summarize(page);

    await expect(page.getByTestId("header-cell")).toHaveCount(4);
    await expect(
      tableHeaderColumn(page, "Sum of Subtotal").getByLabel("chevrondown icon", {
        exact: true,
      }),
    ).toBeVisible();

    // At this point only "Sum of Subtotal" should be sorted.
    await expect(
      tableInteractiveHeader(page).getByTestId("header-sort-indicator"),
    ).toHaveCount(1);

    // Remove the sorted metric.
    await removeMetricFromSidebar(page, "Sum of Subtotal");

    // "Sum of Total" should not be sorted, nor any other header cell.
    await expect(
      tableInteractiveHeader(page).getByTestId("header-sort-indicator"),
    ).toHaveCount(0);

    await expect(page.getByTestId("header-cell")).toHaveCount(3);
    await expect(
      page.getByTestId("header-cell").filter({ hasText: "Sum of Subtotal" }),
    ).toHaveCount(0);

    await removeMetricFromSidebar(page, "Sum of Total");

    await expect(page.getByTestId("header-cell")).toHaveCount(2);
    // `Count` for year 2025.
    await expect(
      page.getByTestId("cell-data").filter({ hasText: "744" }).first(),
    ).toBeVisible();
  });

  // flaky test (#19454)
  test.skip("should show an info popover when hovering over summarize dimension options", async ({
    page,
  }) => {
    await openReviewsTable(page);

    await summarize(page);
    await page
      .getByText("Group by", { exact: true })
      .locator("..")
      .getByText("Title", { exact: true })
      .dispatchEvent("mouseenter");

    await expect(popover(page).getByText("Title")).toBeVisible();
    await expect(popover(page).getByText("199 distinct values")).toBeVisible();
  });
});
