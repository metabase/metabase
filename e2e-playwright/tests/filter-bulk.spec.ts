/**
 * Playwright port of e2e/test/scenarios/filters/filter-bulk.cy.spec.js
 */
import type { Locator } from "@playwright/test";

import { icon } from "../support/dashboard-cards";
import { queryBuilderFiltersPanel } from "../support/detail-view";
import {
  createSegment,
  hovercard,
  queryBuilderFooter,
  setupBooleanQuery,
  trackDatasetRequests,
} from "../support/filter-bulk";
import { containsText } from "../support/filters";
import { test, expect } from "../support/fixtures";
import { tableInteractive, waitForDataset } from "../support/models";
import { filter, selectFilterOperator } from "../support/nested-questions";
import { assertQueryBuilderRowCount } from "../support/notebook";
import { visitQuestionAdhoc } from "../support/permissions";
import { SAMPLE_DATABASE, SAMPLE_DB_ID } from "../support/sample-data";
import { popover } from "../support/ui";

const { ORDERS_ID, ORDERS, PEOPLE_ID, PRODUCTS_ID, PRODUCTS } = SAMPLE_DATABASE;

const rawQuestionDetails = {
  dataset_query: {
    database: SAMPLE_DB_ID,
    type: "query" as const,
    query: {
      "source-table": ORDERS_ID,
    },
  },
};

const peopleQuestion = {
  dataset_query: {
    database: SAMPLE_DB_ID,
    type: "query" as const,
    query: {
      "source-table": PEOPLE_ID,
    },
  },
};

const productsQuestion = {
  dataset_query: {
    database: SAMPLE_DB_ID,
    type: "query" as const,
    query: {
      "source-table": PRODUCTS_ID,
    },
  },
};

const filteredQuestionDetails = {
  dataset_query: {
    database: SAMPLE_DB_ID,
    type: "query" as const,
    query: {
      "source-table": ORDERS_ID,
      filter: [
        "and",
        [">", ["field", ORDERS.QUANTITY, null], 20],
        ["<", ["field", ORDERS.QUANTITY, null], 30],
      ],
    },
  },
};

const aggregatedQuestionDetails = {
  dataset_query: {
    database: SAMPLE_DB_ID,
    type: "query" as const,
    query: {
      "source-table": ORDERS_ID,
      breakout: [["field", ORDERS.CREATED_AT, { "temporal-unit": "month" }]],
      aggregation: [["count"]],
    },
  },
};

const multiStageQuestionDetails = {
  name: "Test question",
  dataset_query: {
    database: SAMPLE_DB_ID,
    type: "query" as const,
    query: {
      "source-query": {
        "source-query": {
          "source-table": PRODUCTS_ID,
          aggregation: [["count"]],
          breakout: [["field", PRODUCTS.CATEGORY, null]],
        },
        aggregation: [["count"]],
        breakout: [["field", PRODUCTS.CATEGORY, null]],
      },
      aggregation: [["count"]],
      breakout: [["field", PRODUCTS.CATEGORY, null]],
    },
  },
};

test.describe("scenarios > filters > bulk filtering", () => {
  test.beforeEach(async ({ mb }) => {
    await mb.restore();
    await mb.signInAsAdmin();
  });

  test("should add a filter for a raw query", async ({ page }) => {
    await visitQuestionAdhoc(page, rawQuestionDetails);
    await filter(page);
    const filterPopover = popover(page);
    await filterPopover.getByText("Quantity", { exact: true }).click();
    await filterPopover.getByText("20", { exact: true }).click();
    const dataset = waitForDataset(page);
    await filterPopover
      .getByRole("button", { name: "Apply filter", exact: true })
      .click();
    await dataset;

    await expect(
      queryBuilderFiltersPanel(page).getByText("Quantity is equal to 20", {
        exact: true,
      }),
    ).toBeVisible();
    await assertQueryBuilderRowCount(page, 4);
  });

  test("should have an info icon on the filter picker filters", async ({
    page,
  }) => {
    await visitQuestionAdhoc(page, rawQuestionDetails);
    await filter(page);
    const columnItem = popover(page).getByLabel("Created At", { exact: true });
    // The info icon only appears while its list item is hovered.
    await columnItem.hover();
    await columnItem.getByLabel("More info", { exact: true }).hover();

    const card = hovercard(page);
    await expect(
      containsText(card, "The date and time an order was submitted"),
    ).toBeVisible();
    await expect(containsText(card, "Creation timestamp")).toBeVisible();
  });

  test("should add a filter for an aggregated query", async ({ page }) => {
    await visitQuestionAdhoc(page, aggregatedQuestionDetails);
    await filter(page);
    const filterPopover = popover(page);
    await filterPopover.getByText("Summaries", { exact: true }).click();
    await filterPopover.getByText("Count", { exact: true }).click();
    await filterPopover
      .getByPlaceholder("Min", { exact: true })
      .pressSequentially("500");
    const dataset = waitForDataset(page);
    await filterPopover
      .getByRole("button", { name: "Apply filter", exact: true })
      .click();
    await dataset;

    await expect(
      queryBuilderFiltersPanel(page).getByText(
        "Count is greater than or equal to 500",
        { exact: true },
      ),
    ).toBeVisible();
    await assertQueryBuilderRowCount(page, 21);
  });

  test("should add a filter for linked tables", async ({ page }) => {
    await visitQuestionAdhoc(page, rawQuestionDetails);
    await filter(page);
    const filterPopover = popover(page);
    await filterPopover.getByText("Product", { exact: true }).click();
    await filterPopover.getByText("Category", { exact: true }).click();
    await filterPopover.getByText("Gadget", { exact: true }).click();
    const dataset = waitForDataset(page);
    await filterPopover
      .getByRole("button", { name: "Apply filter", exact: true })
      .click();
    await dataset;

    await expect(
      queryBuilderFiltersPanel(page).getByText("Product → Category is Gadget", {
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      queryBuilderFooter(page).getByText("Showing first 2,000 rows", {
        exact: true,
      }),
    ).toBeVisible();
  });

  test("should update an existing filter", async ({ page }) => {
    await visitQuestionAdhoc(page, filteredQuestionDetails);
    await queryBuilderFiltersPanel(page)
      .getByText("Quantity is less than 30", { exact: true })
      .click();
    const filterPopover = popover(page);
    const valueInput = filterPopover.getByLabel("Filter value", {
      exact: true,
    });
    // cy.type appends at the end of the existing value ("30").
    await valueInput.click();
    await valueInput.press("End");
    await valueInput.press("Backspace");
    await valueInput.press("Backspace");
    await valueInput.pressSequentially("25");
    const dataset = waitForDataset(page);
    await filterPopover
      .getByRole("button", { name: "Update filter", exact: true })
      .click();
    await dataset;

    const filtersPanel = queryBuilderFiltersPanel(page);
    await expect(
      filtersPanel.getByText("Quantity is greater than 20", { exact: true }),
    ).toBeVisible();
    await expect(
      filtersPanel.getByText("Quantity is less than 25", { exact: true }),
    ).toBeVisible();
    await assertQueryBuilderRowCount(page, 17);
  });

  test("should remove an existing filter", async ({ page }) => {
    await visitQuestionAdhoc(page, filteredQuestionDetails);
    await filter(page);
    const dataset = waitForDataset(page);
    await icon(
      queryBuilderFiltersPanel(page).getByText("Quantity is less than 30", {
        exact: true,
      }),
      "close",
    ).click();
    await dataset;

    const filtersPanel = queryBuilderFiltersPanel(page);
    await expect(
      filtersPanel.getByText("Quantity is greater than 20", { exact: true }),
    ).toBeVisible();
    await expect(
      filtersPanel.getByText("Quantity is less than 30", { exact: true }),
    ).toHaveCount(0);
    await assertQueryBuilderRowCount(page, 138);
  });

  test("should be able to add and remove filters for all query stages", async ({
    page,
  }) => {
    const datasetCount = trackDatasetRequests(page);
    await visitQuestionAdhoc(page, multiStageQuestionDetails);
    expect(datasetCount()).toBe(1);

    // add filters for all stages in the filter modal
    // stage 0
    await filter(page);
    const filterPopover = popover(page);
    await filterPopover.getByText("Category", { exact: true }).click();
    await filterPopover.getByText("Gadget", { exact: true }).click();
    await filterPopover
      .getByRole("button", { name: "Add another filter", exact: true })
      .click();
    expect(datasetCount()).toBe(1);

    // stage 1
    await filterPopover.getByText("Summaries", { exact: true }).click();
    await filterPopover.getByText("Category", { exact: true }).click();
    await filterPopover.getByText("Widget", { exact: true }).click();
    await filterPopover
      .getByRole("button", { name: "Add another filter", exact: true })
      .click();
    expect(datasetCount()).toBe(1);

    // stage 2
    await filterPopover.getByText("Summaries (2)", { exact: true }).click();
    await filterPopover.getByText("Category", { exact: true }).click();
    await filterPopover.getByText("Gizmo", { exact: true }).click();
    await filterPopover
      .getByRole("button", { name: "Add another filter", exact: true })
      .click();
    expect(datasetCount()).toBe(1);

    // stage 3
    await filterPopover.getByText("Summaries (3)", { exact: true }).click();
    await filterPopover.getByText("Category", { exact: true }).click();
    await filterPopover.getByText("Doohickey", { exact: true }).click();
    const dataset = waitForDataset(page);
    await filterPopover
      .getByRole("button", { name: "Apply filter", exact: true })
      .click();
    await dataset;
    expect(datasetCount()).toBe(2);

    // check filters from all stages to be present in the filter panel
    const filtersPanel = queryBuilderFiltersPanel(page);
    await expect(
      filtersPanel.getByText("Category is Gadget", { exact: true }),
    ).toBeVisible();
    await expect(
      filtersPanel.getByText("Category is Widget", { exact: true }),
    ).toBeVisible();
    await expect(
      filtersPanel.getByText("Category is Gizmo", { exact: true }),
    ).toBeVisible();
    await expect(
      filtersPanel.getByText("Category is Doohickey", { exact: true }),
    ).toBeVisible();

    // clear all filters
    for (const filterName of [
      "Category is Gadget",
      "Category is Widget",
      "Category is Gizmo",
      "Category is Doohickey",
    ]) {
      const removeDataset = waitForDataset(page);
      await icon(
        filtersPanel.getByText(filterName, { exact: true }),
        "close",
      ).click();
      await removeDataset;
    }
    await expect(page.getByTestId("qb-filters-panel")).toHaveCount(0);
  });

  test.describe("segment filters", () => {
    const SEGMENT_1_NAME = "Orders < 100";
    const SEGMENT_2_NAME = "Discounted Orders";
    let segment1Id: number;

    test.beforeEach(async ({ mb }) => {
      ({ id: segment1Id } = await createSegment(mb.api, {
        name: SEGMENT_1_NAME,
        description: "All orders with a total under $100.",
        definition: {
          "source-table": ORDERS_ID,
          aggregation: [["count"]],
          filter: ["<", ["field", ORDERS.TOTAL, null], 100],
        },
      }));

      await createSegment(mb.api, {
        name: SEGMENT_2_NAME,
        description: "All orders with a discount",
        definition: {
          "source-table": ORDERS_ID,
          aggregation: [["count"]],
          filter: [">", ["field", ORDERS.DISCOUNT, null], 0],
        },
      });
    });

    test("should apply and remove segment filter (metabase#50734)", async ({
      page,
    }) => {
      await visitQuestionAdhoc(page, rawQuestionDetails);
      await filter(page);

      // Only this block is the repro. The rest is a regular test.
      // segment filter icon should be aligned with other filter icons
      // (metabase#50734)
      const filterPopover = popover(page);
      const segmentsIcon = filterPopover
        .getByLabel(SEGMENT_1_NAME, { exact: true })
        .getByRole("img");
      await expect(segmentsIcon).toBeVisible();
      const discountIcon = filterPopover
        .getByLabel("Discount", { exact: true })
        .getByRole("img");
      const segmentsIconRect = await boundingBox(segmentsIcon);
      const discountIconRect = await boundingBox(discountIcon);
      expect(segmentsIconRect.x).toEqual(discountIconRect.x);
      expect(segmentsIconRect.x + segmentsIconRect.width).toEqual(
        discountIconRect.x + discountIconRect.width,
      );

      const dataset = waitForDataset(page);
      await filterPopover.getByText(SEGMENT_2_NAME, { exact: true }).click();
      await dataset;
      await expect(
        queryBuilderFiltersPanel(page).getByText(SEGMENT_2_NAME, {
          exact: true,
        }),
      ).toBeVisible();
      await assertQueryBuilderRowCount(page, 1915);

      const removeDataset = waitForDataset(page);
      await icon(
        queryBuilderFiltersPanel(page).getByText(SEGMENT_2_NAME, {
          exact: true,
        }),
        "close",
      ).click();
      await removeDataset;
      await expect(queryBuilderFiltersPanel(page)).toHaveCount(0);
      await expect(
        queryBuilderFooter(page).getByText("Showing first 2,000 rows", {
          exact: true,
        }),
      ).toBeVisible();
    });

    test("should load already applied segments", async ({ page }) => {
      const segmentFilterQuestion = {
        dataset_query: {
          database: SAMPLE_DB_ID,
          type: "query" as const,
          query: {
            "source-table": ORDERS_ID,
            filter: ["segment", segment1Id],
          },
        },
      };

      await visitQuestionAdhoc(page, segmentFilterQuestion);
      const filtersPanel = queryBuilderFiltersPanel(page);
      await expect(
        filtersPanel.getByText(SEGMENT_2_NAME, { exact: true }),
      ).toHaveCount(0);
      await filtersPanel.getByText(SEGMENT_1_NAME, { exact: true }).click();

      await expect(
        popover(page).getByLabel(SEGMENT_1_NAME, { exact: true }),
      ).toHaveAttribute("aria-selected", "true");
    });
  });

  test.describe("boolean filters", () => {
    test.beforeEach(async ({ page, mb }) => {
      await setupBooleanQuery(page, mb.api);
      await filter(page);
    });

    test("should apply a boolean filter", async ({ page }) => {
      const filterPopover = popover(page);
      await filterPopover.getByText("boolean", { exact: true }).click();
      await filterPopover.getByText("True", { exact: true }).click();
      const dataset = waitForDataset(page);
      await filterPopover
        .getByRole("button", { name: "Apply filter", exact: true })
        .click();
      await dataset;
      await assertQueryBuilderRowCount(page, 2);
    });

    test("should change a boolean filter", async ({ page }) => {
      const filterPopover = popover(page);
      await filterPopover.getByText("boolean", { exact: true }).click();
      await filterPopover.getByText("True", { exact: true }).click();
      const dataset = waitForDataset(page);
      await filterPopover
        .getByRole("button", { name: "Apply filter", exact: true })
        .click();
      await dataset;
      await assertQueryBuilderRowCount(page, 2);

      await queryBuilderFiltersPanel(page)
        .getByText("boolean is true", { exact: true })
        .click();
      const updatePopover = popover(page);
      await updatePopover.getByText("False", { exact: true }).click();
      const updateDataset = waitForDataset(page);
      await updatePopover
        .getByRole("button", { name: "Update filter", exact: true })
        .click();
      await updateDataset;
      await assertQueryBuilderRowCount(page, 1);
    });

    test("should remove a boolean filter", async ({ page }) => {
      const filterPopover = popover(page);
      await filterPopover.getByText("boolean", { exact: true }).click();
      await filterPopover.getByText("True", { exact: true }).click();
      const dataset = waitForDataset(page);
      await filterPopover
        .getByRole("button", { name: "Apply filter", exact: true })
        .click();
      await dataset;
      await assertQueryBuilderRowCount(page, 2);

      const removeDataset = waitForDataset(page);
      await icon(
        queryBuilderFiltersPanel(page).getByText("boolean is true", {
          exact: true,
        }),
        "close",
      ).click();
      await removeDataset;
      await assertQueryBuilderRowCount(page, 4);
    });
  });

  test.describe("date filters", () => {
    test.beforeEach(async ({ page }) => {
      await visitQuestionAdhoc(page, rawQuestionDetails);
      await filter(page);
    });

    test("can add a date shortcut filter", async ({ page }) => {
      const filterPopover = popover(page);
      await filterPopover.getByText("Created At", { exact: true }).click();
      const dataset = waitForDataset(page);
      await filterPopover.getByText("Today", { exact: true }).click();
      await dataset;

      await expect(
        queryBuilderFiltersPanel(page).getByText("Created At is today", {
          exact: true,
        }),
      ).toBeVisible();
    });

    test("can add a date shortcut filter from the popover", async ({
      page,
    }) => {
      const filterPopover = popover(page);
      await filterPopover.getByText("Created At", { exact: true }).click();
      const dataset = waitForDataset(page);
      await filterPopover
        .getByText("Previous 3 months", { exact: true })
        .click();
      await dataset;

      await expect(
        queryBuilderFiltersPanel(page).getByText(
          "Created At is in the previous 3 months",
          { exact: true },
        ),
      ).toBeVisible();
    });
  });

  test.describe("category filters", () => {
    test.beforeEach(async ({ page }) => {
      await visitQuestionAdhoc(page, peopleQuestion);
      await filter(page);
    });

    test("should show inline category picker for referral source", async ({
      page,
    }) => {
      const filterPopover = popover(page);
      await filterPopover.getByText("Source", { exact: true }).click();
      await filterPopover.getByText("Affiliate", { exact: true }).click();
      const dataset = waitForDataset(page);
      await filterPopover
        .getByRole("button", { name: "Apply filter", exact: true })
        .click();
      await dataset;

      await expect(
        queryBuilderFiltersPanel(page).getByText("Source is Affiliate", {
          exact: true,
        }),
      ).toBeVisible();
      await assertQueryBuilderRowCount(page, 506);
    });

    test("should show value picker for state", async ({ page }) => {
      const filterPopover = popover(page);
      await filterPopover.getByText("State", { exact: true }).click();
      await filterPopover.getByText("AZ", { exact: true }).click();
      const dataset = waitForDataset(page);
      await filterPopover
        .getByRole("button", { name: "Apply filter", exact: true })
        .click();
      await dataset;

      await expect(
        queryBuilderFiltersPanel(page).getByText("State is AZ", {
          exact: true,
        }),
      ).toBeVisible();
      await assertQueryBuilderRowCount(page, 20);
    });
  });

  test.describe("key filters", () => {
    test.beforeEach(async ({ page }) => {
      await visitQuestionAdhoc(page, rawQuestionDetails);
      await filter(page);
    });

    test("filters by primary keys", async ({ page }) => {
      const filterPopover = popover(page);
      await filterPopover.getByText("ID", { exact: true }).click();
      await filterPopover
        .getByLabel("Filter value", { exact: true })
        .pressSequentially("17,18");
      const dataset = waitForDataset(page);
      await filterPopover
        .getByRole("button", { name: "Apply filter", exact: true })
        .click();
      await dataset;

      await assertQueryBuilderRowCount(page, 2);
      const table = tableInteractive(page);
      // total for order id 17
      await expect(table.getByText("131.68", { exact: true })).toBeVisible();
      // total for order id 18
      await expect(table.getByText("123.99", { exact: true })).toBeVisible();
    });

    test("filters by a foreign key", async ({ page }) => {
      const filterPopover = popover(page);
      await filterPopover.getByText("Product ID", { exact: true }).click();
      await filterPopover
        .getByLabel("Filter value", { exact: true })
        .pressSequentially("65");
      const dataset = waitForDataset(page);
      await filterPopover
        .getByRole("button", { name: "Apply filter", exact: true })
        .click();
      await dataset;

      await assertQueryBuilderRowCount(page, 107);
    });
  });

  test.describe("text filters", () => {
    test.beforeEach(async ({ page }) => {
      await visitQuestionAdhoc(page, peopleQuestion);
      await filter(page);
    });

    test("adds a contains text filter", async ({ page }) => {
      await popover(page).getByText("City", { exact: true }).click();
      await selectFilterOperator(page, "Contains");
      const filterPopover = popover(page);
      await filterPopover
        .getByLabel("Filter value", { exact: true })
        .pressSequentially("Indian");
      const dataset = waitForDataset(page);
      await filterPopover
        .getByRole("button", { name: "Apply filter", exact: true })
        .click();
      await dataset;

      await assertQueryBuilderRowCount(page, 5);
    });

    test("adds an ends with text filter", async ({ page }) => {
      await popover(page).getByText("City", { exact: true }).click();
      await selectFilterOperator(page, "Ends with");
      const filterPopover = popover(page);
      await filterPopover
        .getByLabel("Filter value", { exact: true })
        .pressSequentially("Valley");
      const dataset = waitForDataset(page);
      await filterPopover
        .getByRole("button", { name: "Apply filter", exact: true })
        .click();
      await dataset;

      await assertQueryBuilderRowCount(page, 8);
    });

    test("adds multiple is text filters", async ({ page }) => {
      const filterPopover = popover(page);
      await filterPopover.getByText("City", { exact: true }).click();
      const valueInput = filterPopover.getByLabel("Filter value", {
        exact: true,
      });
      await valueInput.pressSequentially("Indiantown,Indian Valley");
      await valueInput.blur();
      const dataset = waitForDataset(page);
      await filterPopover
        .getByRole("button", { name: "Apply filter", exact: true })
        .click();
      await dataset;

      await expect(
        queryBuilderFiltersPanel(page).getByText("City is 2 selections", {
          exact: true,
        }),
      ).toBeVisible();
      await assertQueryBuilderRowCount(page, 3);
    });
  });

  test.describe("number filters", () => {
    test.beforeEach(async ({ page }) => {
      await visitQuestionAdhoc(page, productsQuestion);
      await filter(page);
    });

    test("applies a between filter", async ({ page }) => {
      const filterPopover = popover(page);
      await filterPopover.getByText("Price", { exact: true }).click();
      await filterPopover
        .getByPlaceholder("Min", { exact: true })
        .pressSequentially("50");
      await filterPopover
        .getByPlaceholder("Max", { exact: true })
        .pressSequentially("80");
      const dataset = waitForDataset(page);
      await filterPopover
        .getByRole("button", { name: "Apply filter", exact: true })
        .click();
      await dataset;

      await expect(
        queryBuilderFiltersPanel(page).getByText("Price is between 50 and 80", {
          exact: true,
        }),
      ).toBeVisible();
      await assertQueryBuilderRowCount(page, 72);
    });

    test("applies a greater than filter", async ({ page }) => {
      await popover(page).getByText("Price", { exact: true }).click();
      await selectFilterOperator(page, "Greater than");
      const filterPopover = popover(page);
      await filterPopover
        .getByLabel("Filter value", { exact: true })
        .pressSequentially("50");
      const dataset = waitForDataset(page);
      await filterPopover
        .getByRole("button", { name: "Apply filter", exact: true })
        .click();
      await dataset;

      await expect(
        queryBuilderFiltersPanel(page).getByText("Price is greater than 50", {
          exact: true,
        }),
      ).toBeVisible();
      await assertQueryBuilderRowCount(page, 106);
    });

    test("infers a <= filter from an invalid between filter", async ({
      page,
    }) => {
      const filterPopover = popover(page);
      await filterPopover.getByText("Price", { exact: true }).click();
      await filterPopover
        .getByPlaceholder("Max", { exact: true })
        .pressSequentially("50");
      const dataset = waitForDataset(page);
      await filterPopover
        .getByRole("button", { name: "Apply filter", exact: true })
        .click();
      await dataset;

      await expect(
        queryBuilderFiltersPanel(page).getByText(
          "Price is less than or equal to 50",
          { exact: true },
        ),
      ).toBeVisible();
      await assertQueryBuilderRowCount(page, 94);
    });
  });

  test.describe("column search", () => {
    test.beforeEach(async ({ page }) => {
      await visitQuestionAdhoc(page, productsQuestion);
      await filter(page);
    });

    test("can search for a column", async ({ page }) => {
      const filterPopover = popover(page);
      await expect(
        filterPopover.getByText("Category", { exact: true }),
      ).toBeVisible();
      await expect(
        filterPopover.getByText("Vendor", { exact: true }),
      ).toBeVisible();

      await filterPopover
        .getByPlaceholder("Find...", { exact: true })
        .pressSequentially("vend");
      await expect(
        filterPopover.getByText("Category", { exact: true }),
      ).toHaveCount(0);
      await expect(
        filterPopover.getByText("Vendor", { exact: true }),
      ).toBeVisible();
    });

    test("can apply a filter from a searched column", async ({ page }) => {
      const filterPopover = popover(page);
      await filterPopover
        .getByPlaceholder("Find...", { exact: true })
        .pressSequentially("price");
      await expect(
        filterPopover.getByText("Category", { exact: true }),
      ).toHaveCount(0);
      await filterPopover.getByText("Price", { exact: true }).click();

      await selectFilterOperator(page, "Greater than");
      await filterPopover
        .getByLabel("Filter value", { exact: true })
        .pressSequentially("90");
      const dataset = waitForDataset(page);
      await filterPopover
        .getByRole("button", { name: "Apply filter", exact: true })
        .click();
      await dataset;

      await expect(
        queryBuilderFiltersPanel(page).getByText("Price is greater than 90", {
          exact: true,
        }),
      ).toBeVisible();
      await assertQueryBuilderRowCount(page, 10);
    });
  });
});

async function boundingBox(locator: Locator) {
  const box = await locator.boundingBox();
  if (!box) {
    throw new Error("Element has no bounding box");
  }
  return box;
}
