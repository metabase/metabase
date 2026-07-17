/**
 * Playwright port of e2e/test/scenarios/question/nested.cy.spec.js
 *
 * The Cypress console.warn spy (cy.spy(win.console, "warn")) becomes a
 * page.on("console") listener registered before the first navigation.
 */
import type { Page } from "@playwright/test";

import type { MetabaseApi } from "../support/api";
import { icon } from "../support/dashboard-cards";
import { test, expect } from "../support/fixtures";
import {
  miniPicker,
  openNotebook,
  startNewQuestion,
  tableHeaderClick,
  visualize,
} from "../support/notebook";
import {
  filter,
  getDimensionByName,
  saveQuestionToCollection,
  selectFilterOperator,
  summarize,
  waitForDataset,
} from "../support/nested-questions";
import { SAMPLE_DATABASE } from "../support/sample-data";
import { createNativeQuestion } from "../support/sharing";
import { popover, visitQuestion } from "../support/ui";

const { ORDERS, ORDERS_ID, PRODUCTS, PRODUCTS_ID } = SAMPLE_DATABASE;

const ordersJoinProductsQuery = {
  "source-table": ORDERS_ID,
  joins: [
    {
      fields: "all",
      "source-table": PRODUCTS_ID,
      condition: [
        "=",
        ["field", ORDERS.PRODUCT_ID, null],
        ["field", PRODUCTS.ID, { "join-alias": "Products" }],
      ],
      alias: "Products",
    },
  ],
};

test.describe("scenarios > question > nested", () => {
  test.beforeEach(async ({ mb }) => {
    await mb.restore();
    await mb.signInAsAdmin();
  });

  test("'distribution' should work on a joined table from a saved question (metabase#14787)", async ({
    page,
    mb,
  }) => {
    // Set the display really wide and really tall to avoid any scrolling
    await page.setViewportSize({ width: 1600, height: 1200 });

    const baseQuestionDetails = {
      name: "14787",
      query: { ...ordersJoinProductsQuery, limit: 5 },
    };

    await createNestedQuestion(page, mb.api, { baseQuestionDetails });

    // The column title
    const dataset = waitForDataset(page);
    await tableHeaderClick(page, "Products → Category");
    await page.getByText("Distribution", { exact: true }).click();
    await dataset;

    await summarize(page);

    // Regression that worked on 0.37.9
    const groupBySection = page
      .getByText("Group by", { exact: true })
      .locator("..");
    await isSelected(groupBySection, "Products → Category");

    // Although the test will fail on the previous step, we're including additional safeguards against regressions once the issue is fixed
    // It can potentially fail at two more places. See [1] and [2]
    await openNotebook(page);
    await page
      .getByTestId("notebook-cell-item")
      .filter({ hasText: /^Products → Category$/ }) /* [1] */
      .click();
    await isSelected(popover(page), "Products → Category"); /* [2] */

    /**
     * Helper function related to this test only
     * TODO:
     *  Extract it if we have the need for it anywhere else
     */
    async function isSelected(scope: Parameters<typeof getDimensionByName>[0], text: string) {
      await expect(getDimensionByName(scope, { name: text })).toHaveAttribute(
        "aria-selected",
        "true",
      );
    }
  });

  test.describe("should not remove user defined metric when summarizing based on saved question (metabase#15725)", () => {
    let consoleWarnings: string[];

    test.beforeEach(async ({ page, mb }) => {
      consoleWarnings = [];
      await createNativeQuestion(mb.api, {
        name: "15725",
        native: { query: "select 'A' as cat, 5 as val" },
      });
      // Port of cy.spy(win.console, "warn"): collect console warnings from
      // the first navigation onwards.
      page.on("console", (message) => {
        if (message.type() === "warning") {
          consoleWarnings.push(message.text());
        }
      });
      await page.goto("/");
      await startNewQuestion(page);
      await miniPicker(page).getByText("Our analytics", { exact: true }).click();
      await miniPicker(page).getByText("15725", { exact: true }).click();
      await page
        .getByText("Pick a function or metric", { exact: true })
        .click();
      await page.getByText("Count of rows", { exact: true }).click();
    });

    test("Count of rows AND Sum of VAL by CAT (metabase#15725-1)", async ({
      page,
    }) => {
      await icon(page, "add").last().click();
      await page.getByText(/^Sum of/).click();
      await page.getByText("VAL", { exact: true }).click();
      await expect(page.getByText("Sum of VAL", { exact: true }).first()).toBeVisible();
      await page
        .getByText("Pick a column to group by", { exact: true })
        .click();
      await page.getByText("CAT", { exact: true }).click();

      await visualize(page);

      expect(removingInvalidClauseWarnings()).toEqual([]);
      await expect(page.getByText("Sum of VAL", { exact: true }).first()).toBeVisible();
    });

    test("Count of rows by CAT + add sum of VAL later from the sidebar (metabase#15725-2)", async ({
      page,
    }) => {
      await page
        .getByText("Pick a column to group by", { exact: true })
        .click();
      await page.getByText("CAT", { exact: true }).click();

      await visualize(page);

      await summarize(page);
      await page.getByTestId("add-aggregation-button").click();
      await page.getByText(/^Sum of/).click();
      const dataset = waitForDataset(page);
      await popover(page).getByText("VAL", { exact: true }).click();
      const response = await dataset;
      const body = (await response.json()) as { error?: unknown };
      expect(body.error).toBeUndefined();
      expect(removingInvalidClauseWarnings()).toEqual([]);
    });

    function removingInvalidClauseWarnings() {
      return consoleWarnings.filter((text) =>
        text.includes("Removing invalid MBQL clause"),
      );
    }
  });

  test("should properly work with native questions (metabase#15808, metabase#16938, metabase#18364)", async ({
    page,
    mb,
  }) => {
    const questionDetails = {
      name: "15808",
      native: { query: "select * from products limit 3" },
    };

    const { id } = await createNativeQuestion(mb.api, questionDetails);
    await visitQuestion(page, id);
    await expect(
      page
        .getByTestId("cell-data")
        .filter({ hasText: /Swaniawski, Casper and Hilll/ })
        .first(),
    ).toBeVisible();

    const dataset = waitForDataset(page);
    await page
      .getByTestId("qb-header-action-panel")
      .getByText("Explore results", { exact: true })
      .click();
    await dataset;

    // Should allow to browse object details when exploring native query
    // results (metabase#16938)
    const primaryKeys = page.locator(".test-Table-ID");
    await expect(primaryKeys).toHaveCount(3);
    await primaryKeys.first().click();

    await expect(page.getByTestId("object-detail")).toContainText(
      "Swaniawski, Casper and Hilll",
    );
    await page.getByLabel("Close", { exact: true }).click();

    // Should be able to save a nested question (metabase#18364)
    await saveQuestion(page);

    // Should be able to use integer filter on a nested query based on a saved
    // native question (metabase#15808)
    await filter(page);
    await popover(page).getByText("RATING", { exact: true }).click();
    await selectFilterOperator(page, "Equal to");
    await popover(page).getByLabel("Filter value", { exact: true }).fill("4");
    await popover(page)
      .getByRole("button", { name: "Apply filter", exact: true })
      .click();

    await expect(
      page
        .getByTestId("cell-data")
        .filter({ hasText: /Murray, Watsica and Wunsch/ })
        .first(),
    ).toBeVisible();
    await expect(
      page
        .getByTestId("cell-data")
        .filter({ hasText: /Swaniawski, Casper and Hilll/ }),
    ).toHaveCount(0);

    async function saveQuestion(page: Page) {
      // saveQuestionToCollection resolves with the POST /api/card body
      // (the Cypress spec's @cardCreated intercept).
      const body = await saveQuestionToCollection(page);
      expect(body.error).toBeUndefined();
      await expect(
        page.getByRole("button", { name: "Failed", exact: true }),
      ).toHaveCount(0);
    }
  });
});

async function createNestedQuestion(
  page: Page,
  api: MetabaseApi,
  {
    baseQuestionDetails,
    nestedQuestionDetails = {},
  }: {
    baseQuestionDetails: {
      name?: string;
      native?: Record<string, unknown>;
      query?: Record<string, unknown>;
    };
    nestedQuestionDetails?: {
      name?: string;
      query?: Record<string, unknown>;
    };
  },
  {
    loadBaseQuestionMetadata = false,
    visitNestedQuestion = true,
  }: { loadBaseQuestionMetadata?: boolean; visitNestedQuestion?: boolean } = {},
): Promise<number> {
  if (!baseQuestionDetails) {
    throw new Error("Please provide the base question details");
  }

  const { id } = await createBaseQuestion(api, baseQuestionDetails);

  if (loadBaseQuestionMetadata) {
    await visitQuestion(page, id);
  }

  const { query: nestedQuery, ...details } = nestedQuestionDetails;

  const { id: nestedQuestionId } = await api.createQuestion({
    name: "Nested Question",
    ...details,
    query: {
      ...nestedQuery,
      "source-table": `card__${id}`,
    },
  });

  if (visitNestedQuestion) {
    await visitQuestion(page, nestedQuestionId);
  }

  return nestedQuestionId;
}

function createBaseQuestion(
  api: MetabaseApi,
  details: {
    name?: string;
    native?: Record<string, unknown>;
    query?: Record<string, unknown>;
  },
): Promise<{ id: number }> {
  return details.native
    ? createNativeQuestion(api, {
        ...details,
        native: details.native,
      })
    : api.createQuestion({ ...details, query: details.query ?? {} });
}
