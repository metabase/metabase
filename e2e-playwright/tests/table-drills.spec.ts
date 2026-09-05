/**
 * Playwright port of
 * e2e/test/scenarios/visualizations-tabular/drillthroughs/table_drills.cy.spec.js
 *
 * Table drill-through: click a cell → drill menu, or click a column header →
 * click-actions popover (sort / filter / summarize / breakout / distinct etc.).
 *
 * Notes:
 * - H.createQuestion / H.createNativeQuestion(details, { visitQuestion: true })
 *   → factory create* + visitQuestion(page, id).
 * - cy.get("[data-testid=cell-data]").contains(str) is a case-sensitive
 *   substring returning the FIRST hit → getByTestId("cell-data")
 *   .filter({ hasText: <case-sensitive regex> }).first().
 * - cy.icon(name).should("be.visible") is an ANY-match (PORTING.md rule 3) →
 *   expectIconVisible (.filter({ visible: true }).first()).
 * - The dev-mode intercept overwrites token-features.development_mode on
 *   /api/session/properties (mockDevelopmentMode).
 */
import { test, expect } from "../support/fixtures";
import { createNativeQuestion, createQuestion } from "../support/factories";
import { visitQuestionAdhoc } from "../support/permissions";
import { SAMPLE_DATABASE, SAMPLE_DB_ID } from "../support/sample-data";
import {
  expectIconVisible,
  mockDevelopmentMode,
  openReviewsTable,
  openTable,
} from "../support/table-drills";
import { tableHeaderClick } from "../support/notebook";
import { tableInteractive } from "../support/models";
import { tableInteractiveBody } from "../support/question-new";
import { popover, visitQuestion } from "../support/ui";

const {
  ORDERS,
  ORDERS_ID,
  PRODUCTS,
  PRODUCTS_ID,
  REVIEWS,
  REVIEWS_ID,
  ACCOUNTS_ID,
} = SAMPLE_DATABASE;

/** Assert every text is visible (exact) inside the single open popover. */
async function expectPopoverTexts(
  page: import("@playwright/test").Page,
  texts: string[],
) {
  for (const text of texts) {
    await expect(popover(page).getByText(text, { exact: true })).toBeVisible();
  }
}

/** Click the first cell-data cell whose text contains `text` (case-sensitive
 * substring, cy.contains semantics). */
function cellDataContaining(
  page: import("@playwright/test").Page,
  text: string,
) {
  return page
    .getByTestId("cell-data")
    .filter({ hasText: new RegExp(escapeRegExp(text)) })
    .first();
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

test.describe("scenarios > visualizations > drillthroughs > table_drills", () => {
  test.beforeEach(async ({ page, mb }) => {
    await mb.restore();
    await mb.signInAsAdmin();
    await page.setViewportSize({ width: 1500, height: 800 });
  });

  for (const devMode of [false, true]) {
    test(`should display proper drills on cell click for unaggregated query - development-mode: ${devMode}`, async ({
      page,
    }) => {
      await mockDevelopmentMode(page, devMode);
      await openReviewsTable(page, { limit: 3 });

      // FK cell drills
      await page.locator(".test-Table-FK").getByText("1", { exact: true }).first().click();
      await expectPopoverTexts(page, [
        "View this Product's Reviews",
        "View details",
      ]);

      // Short text cell drills
      await cellDataContaining(page, "christ").click();
      await expectPopoverTexts(page, ["Is christ", "Is not christ", "View details"]);

      // Number cell drills
      await cellDataContaining(page, "5").click();
      await expectPopoverTexts(page, [">", "<", "=", "≠", "View details"]);

      await cellDataContaining(page, "Ad perspiciatis quis").click();
      await expectPopoverTexts(page, [
        "Contains…",
        "Does not contain…",
        "View details",
      ]);

      await cellDataContaining(page, "May 15, 20").click();
      await expectPopoverTexts(page, [
        "Before",
        "After",
        "On",
        "Not on",
        "View details",
      ]);

      await tableHeaderClick(page, "ID");
      await expectIconVisible(page, "click-actions-popover-content-for-ID", "arrow_down");
      await expectIconVisible(page, "click-actions-popover-content-for-ID", "arrow_up");
      await expectIconVisible(page, "click-actions-popover-content-for-ID", "gear");
      {
        const content = page.getByTestId("click-actions-popover-content-for-ID");
        await expect(content.getByText("Filter by this column", { exact: true })).toBeVisible();
        await expect(content.getByText("Distinct values", { exact: true })).toBeVisible();
      }

      await tableHeaderClick(page, "Reviewer");
      await expectIconVisible(page, "click-actions-popover-content-for-Reviewer", "arrow_down");
      await expectIconVisible(page, "click-actions-popover-content-for-Reviewer", "arrow_up");
      await expectIconVisible(page, "click-actions-popover-content-for-Reviewer", "gear");
      {
        const content = page.getByTestId(
          "click-actions-popover-content-for-Reviewer",
        );
        await expect(content.getByText("Filter by this column", { exact: true })).toBeVisible();
        await expect(content.getByText("Distribution", { exact: true })).toBeVisible();
        await expect(content.getByText("Distinct values", { exact: true })).toBeVisible();
      }

      await tableHeaderClick(page, "Rating");
      await expectIconVisible(page, "click-actions-popover-content-for-Rating", "arrow_down");
      await expectIconVisible(page, "click-actions-popover-content-for-Rating", "arrow_up");
      await expectIconVisible(page, "click-actions-popover-content-for-Rating", "gear");
      {
        const content = page.getByTestId(
          "click-actions-popover-content-for-Rating",
        );
        await expect(content.getByText("Filter by this column", { exact: true })).toBeVisible();
        await expect(content.getByText("Sum over time", { exact: true })).toBeVisible();
        await expect(content.getByText("Distribution", { exact: true })).toBeVisible();
        await expect(content.getByText("Sum", { exact: true })).toBeVisible();
        await expect(content.getByText("Avg", { exact: true })).toBeVisible();
        await expect(content.getByText("Distinct values", { exact: true })).toBeVisible();
      }
    });
  }

  test("should display proper drills on cell click for query aggregated by category", async ({
    page,
    mb,
  }) => {
    const { id } = await createQuestion(mb.api, {
      query: {
        "source-table": REVIEWS_ID,
        aggregation: [["count"]],
        breakout: [["field", REVIEWS.REVIEWER, null]],
        limit: 10,
      },
    });
    await visitQuestion(page, id);

    await tableInteractive(page).getByText("abbey-heidenreich", { exact: true }).click();
    await expectPopoverTexts(page, [
      "Is abbey-heidenreich",
      "Is not abbey-heidenreich",
    ]);

    await cellDataContaining(page, "1").click();
    await expectPopoverTexts(page, [
      "See this Review",
      "Automatic insights…",
      ">",
      "<",
      "=",
      "≠",
    ]);

    await tableHeaderClick(page, "Reviewer");
    await expectIconVisible(page, "click-actions-popover-content-for-Reviewer", "arrow_down");
    await expectIconVisible(page, "click-actions-popover-content-for-Reviewer", "arrow_up");
    await expectIconVisible(page, "click-actions-popover-content-for-Reviewer", "gear");
    await expect(
      page
        .getByTestId("click-actions-popover-content-for-Reviewer")
        .getByText("Filter by this column", { exact: true }),
    ).toBeVisible();

    await tableHeaderClick(page, "Count");
    await expectIconVisible(page, "click-actions-popover-content-for-Count", "arrow_down");
    await expectIconVisible(page, "click-actions-popover-content-for-Count", "arrow_up");
    await expectIconVisible(page, "click-actions-popover-content-for-Count", "gear");
    await expect(
      page
        .getByTestId("click-actions-popover-content-for-Count")
        .getByText("Filter by this column", { exact: true }),
    ).toBeVisible();
  });

  test("should display proper drills on cell click for query aggregated by date", async ({
    page,
    mb,
  }) => {
    const { id } = await createQuestion(mb.api, {
      query: {
        "source-table": REVIEWS_ID,
        aggregation: [["count"]],
        breakout: [["field", REVIEWS.CREATED_AT, { "temporal-unit": "month" }]],
        limit: 10,
      },
    });
    await visitQuestion(page, id);

    await cellDataContaining(page, "June").click();
    await expectPopoverTexts(page, ["Before", "After", "On", "Not on"]);

    await cellDataContaining(page, "4").click();
    await expectPopoverTexts(page, [
      "See this month by week",
      "Break out by…",
      "Automatic insights…",
      ">",
      "<",
      "=",
      "≠",
    ]);

    const chrome = page.getByTestId("timeseries-chrome");
    await expect(chrome.getByText("View", { exact: true })).toBeVisible();
    await expect(chrome.getByText("All time", { exact: true })).toBeVisible();
    await expect(chrome.getByText("by", { exact: true })).toBeVisible();
    await expect(chrome.getByText("Month", { exact: true })).toBeVisible();
  });

  test.describe("pivot drill", () => {
    const queryWithJoin = {
      "source-table": ORDERS_ID,
      aggregation: [["count"]],
      breakout: [["field", PRODUCTS.CATEGORY, { "join-alias": "Products" }]],
      joins: [
        {
          alias: "Products",
          condition: [
            "=",
            ["field", ORDERS.PRODUCT_ID, null],
            ["field", PRODUCTS.ID, { "join-alias": "Products" }],
          ],
          fields: "all",
          "source-table": PRODUCTS_ID,
        },
      ],
    };

    async function pivotDrillTest(
      page: import("@playwright/test").Page,
      {
        query,
        drillCellText,
        menuItems,
        filterText,
        resultText,
      }: {
        query: Record<string, unknown>;
        drillCellText: string;
        menuItems: string[];
        filterText: string;
        resultText: string;
      },
    ) {
      await visitQuestionAdhoc(page, {
        display: "table",
        dataset_query: {
          database: SAMPLE_DB_ID,
          query,
          type: "query",
        },
      });
      await cellDataContaining(page, drillCellText).click();
      await popover(page).getByText("Break out by…", { exact: true }).click();
      for (const item of menuItems) {
        await popover(page).getByText(item, { exact: true }).last().click();
      }
      await expect(page.getByTestId("filter-pill").first()).toHaveText(filterText);
      await expect(cellDataContaining(page, resultText)).toBeVisible();
    }

    test("should allow category pivot drills on single-stage queries (metabase#52236)", async ({
      page,
    }) => {
      await pivotDrillTest(page, {
        query: queryWithJoin,
        drillCellText: "4,939",
        menuItems: ["Category", "Vendor"],
        filterText: "Products → Category is Gadget",
        resultText: "Barrows-Johns",
      });
    });

    test("should allow timeseries pivot drills on single-stage queries (metabase#52236)", async ({
      page,
    }) => {
      await pivotDrillTest(page, {
        query: queryWithJoin,
        drillCellText: "3,976",
        menuItems: ["Time", "Products", "Created At"],
        filterText: "Products → Category is Doohickey",
        resultText: "July 31, 2025",
      });
    });
  });

  test.describe("native query", () => {
    test("should display proper drills on cell click for unaggregated query", async ({
      page,
      mb,
    }) => {
      const { id } = await createNativeQuestion(mb.api, {
        name: "table_drills",
        native: { query: "select * from reviews limit 3" },
      });
      await visitQuestion(page, id);

      // FK cell drills
      await page
        .getByTestId("cell-data")
        .filter({ hasText: /1/ })
        .nth(1)
        .click();
      await expectPopoverTexts(page, ["Filter by this value"]);

      // Short text cell drills
      await cellDataContaining(page, "christ").click();
      await expectPopoverTexts(page, ["Is christ", "Is not christ"]);

      // Number cell drills
      await cellDataContaining(page, "5").click();
      await expectPopoverTexts(page, [">", "<", "=", "≠"]);

      await cellDataContaining(page, "Ad perspiciatis quis").click();
      await expectPopoverTexts(page, ["Is this", "Is not this"]);

      await cellDataContaining(page, "May 15, 20").click();
      await expectPopoverTexts(page, ["Before", "After", "On", "Not on"]);

      await tableHeaderClick(page, "ID");
      await expectIconVisible(page, "click-actions-popover-content-for-ID", "arrow_down");
      await expectIconVisible(page, "click-actions-popover-content-for-ID", "arrow_up");
      await expectIconVisible(page, "click-actions-popover-content-for-ID", "gear");
      {
        const content = page.getByTestId("click-actions-popover-content-for-ID");
        await expect(content.getByText("Filter by this column", { exact: true })).toBeVisible();
        await expect(content.getByText("Distinct values", { exact: true })).toBeVisible();
      }

      await tableHeaderClick(page, "REVIEWER");
      await expectIconVisible(page, "click-actions-popover-content-for-REVIEWER", "arrow_down");
      await expectIconVisible(page, "click-actions-popover-content-for-REVIEWER", "arrow_up");
      await expectIconVisible(page, "click-actions-popover-content-for-REVIEWER", "gear");
      {
        const content = page.getByTestId(
          "click-actions-popover-content-for-REVIEWER",
        );
        await expect(content.getByText("Filter by this column", { exact: true })).toBeVisible();
        await expect(content.getByText("Distribution", { exact: true })).toBeVisible();
        await expect(content.getByText("Distinct values", { exact: true })).toBeVisible();
      }

      await tableHeaderClick(page, "RATING");
      await expectIconVisible(page, "click-actions-popover-content-for-RATING", "arrow_down");
      await expectIconVisible(page, "click-actions-popover-content-for-RATING", "arrow_up");
      await expectIconVisible(page, "click-actions-popover-content-for-RATING", "gear");
      {
        const content = page.getByTestId(
          "click-actions-popover-content-for-RATING",
        );
        await expect(content.getByText("Filter by this column", { exact: true })).toBeVisible();
        await expect(content.getByText("Sum over time", { exact: true })).toBeVisible();
        await expect(content.getByText("Distribution", { exact: true })).toBeVisible();
        await expect(content.getByText("Sum", { exact: true })).toBeVisible();
        await expect(content.getByText("Avg", { exact: true })).toBeVisible();
        await expect(content.getByText("Distinct values", { exact: true })).toBeVisible();
      }
    });

    test("should display proper drills on cell click for query aggregated by category", async ({
      page,
      mb,
    }) => {
      const { id } = await createNativeQuestion(mb.api, {
        name: "table_drills",
        native: {
          query: `
                  SELECT
                    REVIEWS.REVIEWER AS REVIEWER,
                    COUNT(*) AS count
                  FROM
                    REVIEWS
                  GROUP BY
                    REVIEWS.REVIEWER
                  LIMIT
                    10
                  `,
        },
      });
      await visitQuestion(page, id);

      await tableInteractive(page).getByText("abbey-heidenreich", { exact: true }).click();
      await expectPopoverTexts(page, [
        "Is abbey-heidenreich",
        "Is not abbey-heidenreich",
      ]);

      await cellDataContaining(page, "1").click();
      await expectPopoverTexts(page, [">", "<", "=", "≠"]);

      await tableHeaderClick(page, "REVIEWER");
      await expectIconVisible(page, "click-actions-popover-content-for-REVIEWER", "arrow_down");
      await expectIconVisible(page, "click-actions-popover-content-for-REVIEWER", "arrow_up");
      await expectIconVisible(page, "click-actions-popover-content-for-REVIEWER", "gear");
      await expect(
        page
          .getByTestId("click-actions-popover-content-for-REVIEWER")
          .getByText("Filter by this column", { exact: true }),
      ).toBeVisible();

      await tableHeaderClick(page, "COUNT");
      await expectIconVisible(page, "click-actions-popover-content-for-COUNT", "arrow_down");
      await expectIconVisible(page, "click-actions-popover-content-for-COUNT", "arrow_up");
      await expectIconVisible(page, "click-actions-popover-content-for-COUNT", "gear");
      await expect(
        page
          .getByTestId("click-actions-popover-content-for-COUNT")
          .getByText("Filter by this column", { exact: true }),
      ).toBeVisible();
    });

    test("should display proper drills on cell click for query aggregated by date", async ({
      page,
      mb,
    }) => {
      const { id } = await createNativeQuestion(mb.api, {
        name: "table_drills",
        native: {
          query: `
            SELECT
              DATE_TRUNC('month', REVIEWS.CREATED_AT) AS "Created At",
              COUNT(*) AS "count"
            FROM
              REVIEWS
            GROUP BY
              DATE_TRUNC('month', REVIEWS.CREATED_AT)
            LIMIT
              10
                  `,
        },
      });
      await visitQuestion(page, id);

      await cellDataContaining(page, "June").click();
      await expectPopoverTexts(page, ["Before", "After", "On", "Not on"]);

      await cellDataContaining(page, "4").click();
      await expectPopoverTexts(page, [">", "<", "=", "≠"]);
    });
  });
});

test.describe("scenarios > visualizations > drillthroughs > table_drills > nulls", () => {
  test.beforeEach(async ({ page, mb }) => {
    // It's important to restore to the "setup" to have access to "Accounts" table
    await mb.restore("setup");
    await mb.signInAsAdmin();
    await page.setViewportSize({ width: 1500, height: 800 });
  });

  test("should display proper drills on a datetime cell click when there is no value (metabase#44101)", async ({
    page,
  }) => {
    const CANCELLED_AT_INDEX = 10;

    await openTable(page, { table: ACCOUNTS_ID, limit: 1 });

    const cancelledAtCell = page.getByRole("gridcell").nth(CANCELLED_AT_INDEX);
    await expect(cancelledAtCell).toHaveText("");
    await cancelledAtCell.click({ force: true });

    await expect(
      popover(page).getByText("Filter by this date and time", { exact: true }),
    ).toBeVisible();
    await expect(popover(page).getByText("Is empty", { exact: true })).toBeVisible();
    await expect(popover(page).getByText("Not empty", { exact: true })).toBeVisible();
    await popover(page).getByText("Not empty", { exact: true }).click();

    await expect(page.getByTestId("filter-pill")).toHaveText(
      "Canceled At is not empty",
    );
    await expect(
      page.getByRole("gridcell").nth(CANCELLED_AT_INDEX),
    ).not.toHaveText("");
  });
});

test.describe("Issue 58247", () => {
  const text =
    "Omnis pariatur autem adipisci eligendi. Eos aut accusantium dolorem et. Numquam vero debitis id provident odit doloremque enim.";

  test.beforeEach(async ({ page, mb }) => {
    await mb.restore();
    await mb.signInAsNormalUser();
    await openTable(page, { table: REVIEWS_ID, limit: 10 });
  });

  test("should properly preselect filter when clicking a string 'Contains...' filter (metabase#58247)", async ({
    page,
  }) => {
    await tableInteractiveBody(page).getByText(text, { exact: true }).click();
    await popover(page).getByText("Contains…", { exact: true }).click();

    await expect(popover(page).getByText("Contains", { exact: true })).toBeVisible();
  });

  test("should properly preselect filter when clicking a string 'Does not contain...' filter (metabase#58247)", async ({
    page,
  }) => {
    await tableInteractiveBody(page).getByText(text, { exact: true }).click();
    await popover(page).getByText("Does not contain…", { exact: true }).click();

    await expect(
      popover(page).getByText("Does not contain", { exact: true }),
    ).toBeVisible();
  });
});

test.describe("Issue 40061", () => {
  const questionDetails = {
    display: "table",
    dataset_query: {
      type: "query" as const,
      database: SAMPLE_DB_ID,
      query: {
        "source-table": ORDERS_ID,
        expressions: {
          "Created At 2": [
            "field",
            ORDERS.CREATED_AT,
            { "base-type": "type/DateTime" },
          ],
        },
        aggregation: [["count"]],
        breakout: [
          ["expression", "Created At 2", { "base-type": "type/DateTime" }],
        ],
      },
    },
  };

  test.beforeEach(async ({ mb }) => {
    await mb.restore();
    await mb.signInAsNormalUser();
  });

  test("should be able extract dates based on a custom column (metabase#40061)", async ({
    page,
  }) => {
    await visitQuestionAdhoc(page, questionDetails);
    await page
      .getByTestId("table-header")
      .getByText("Created At 2: Day", { exact: true })
      .click();
    await popover(page).getByText("Extract day, month…", { exact: true }).click();
    // The extraction option renders its title ("Year") as a bare text node
    // beside a sibling example (<div>"2026, 2027"</div>) in one label, so the
    // element's text is "Year2026, 2027" — exact getByText can't match it
    // (PORTING.md mixed-content-text-nodes). Case-sensitive substring regex
    // ("Year" won't hit the lowercase "year" in "Quarter of year" etc.).
    await popover(page).getByText(/Year/).click();
    await expect(
      page.getByTestId("table-header").getByText("Year", { exact: true }),
    ).toBeVisible();
    await expect(
      page
        .getByTestId("question-row-count")
        .getByText("Showing 1,421 rows", { exact: true }),
    ).toBeVisible();
  });
});
