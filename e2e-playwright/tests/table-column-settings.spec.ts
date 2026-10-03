/**
 * Port of
 * e2e/test/scenarios/visualizations-tabular/table-column-settings.cy.spec.js
 *
 * Notes on the port:
 * - The `beforeEach`'s `cy.intercept("POST","/api/dataset").as("dataset")` is
 *   replaced by a `page.waitForResponse` registered immediately before each
 *   action that re-runs the query (add/remove a column, "Add all"/"Remove all").
 * - Several fixtures carried a top-level `limit: 5` sibling of `query` (not
 *   inside it). That key is not part of the card create payload — the backend
 *   ignores it — so it is a no-op and is dropped here. `limit` *inside* a query
 *   is preserved.
 * - Column reorder uses dnd-kit's PointerSensor; the drag originates on the
 *   header's inner text element (where the SortableHeader listeners live) via
 *   the synthetic-pointer helper moveDnDKitColumnHeader (support/table-column-
 *   settings.ts). Column resize is H.resizeTableColumn (real-mouse delta,
 *   reused from support/viz-tabular-repros.ts).
 * - `cy.findByDisplayValue` (the rename popover) → getControlByDisplayValue.
 */
import type { Page } from "@playwright/test";

import { expect, test } from "../support/fixtures";
import { openTable } from "../support/binning";
import { leftSidebar, openVizSettingsSidebar } from "../support/charts";
import { tableInteractive } from "../support/models";
import { openNotebook, tableHeaderClick, visualize } from "../support/notebook";
import { SAMPLE_DATABASE } from "../support/sample-data";
import { icon, popover, visitQuestion } from "../support/ui";
import {
  createNativeVizQuestion,
  createVizQuestion,
  getControlByDisplayValue,
  resizeTableColumn,
} from "../support/viz-tabular-repros";
import {
  assertColumnEnabled,
  assertColumnHidden,
  assertRowHeight,
  columnHeaderDragHandle,
  getColumn,
  hideColumn,
  moveDnDKitColumnHeader,
  openColumnOptions,
  scrollVisualizationRight,
  showColumn,
  tableInteractiveBody,
  tableInteractiveScrollContainer,
  visibleColumns,
} from "../support/table-column-settings";
import type { MetabaseApi } from "../support/api";

const { ORDERS_ID, ORDERS, PRODUCTS_ID, PRODUCTS, REVIEWS_ID } = SAMPLE_DATABASE;

// ── Fixtures (top-level no-op `limit` dropped; in-query `limit` kept) ────────

const tableQuestion = {
  display: "table",
  query: { "source-table": ORDERS_ID },
};

const tableQuestionWithJoin = {
  display: "table",
  query: {
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
    limit: 5,
  },
};

const tableQuestionWithJoinOnQuestion = (cardId: number) => ({
  display: "table",
  query: {
    "source-table": ORDERS_ID,
    fields: [
      ["field", ORDERS.ID, null],
      ["field", ORDERS.TAX, null],
    ],
    joins: [
      {
        fields: "all",
        "source-table": `card__${cardId}`,
        condition: [
          "=",
          ["field", ORDERS.ID, null],
          ["field", ORDERS.ID, { "join-alias": `Question ${cardId}` }],
        ],
        alias: `Question ${cardId}`,
      },
    ],
    limit: 5,
  },
});

const tableQuestionWithJoinAndFields = {
  display: "table",
  query: {
    "source-table": ORDERS_ID,
    joins: [
      {
        "source-table": PRODUCTS_ID,
        fields: [["field", PRODUCTS.CATEGORY, { "join-alias": "Products" }]],
        condition: [
          "=",
          ["field", ORDERS.PRODUCT_ID, null],
          ["field", PRODUCTS.ID, { "join-alias": "Products" }],
        ],
        alias: "Products",
      },
    ],
  },
};

const tableQuestionWithSelfJoinAndFields = {
  display: "table",
  query: {
    "source-table": ORDERS_ID,
    fields: [
      ["field", ORDERS.ID, null],
      ["field", ORDERS.TAX, null],
    ],
    joins: [
      {
        "source-table": ORDERS_ID,
        fields: [
          ["field", ORDERS.ID, { "join-alias": "Orders" }],
          ["field", ORDERS.TAX, { "join-alias": "Orders" }],
        ],
        condition: [
          "=",
          ["field", ORDERS.USER_ID, null],
          ["field", ORDERS.ID, { "join-alias": "Orders" }],
        ],
        alias: "Orders",
      },
    ],
    limit: 5,
  },
};

const tableQuestionWithExpression = {
  display: "table",
  query: {
    "source-table": ORDERS_ID,
    fields: [
      ["field", ORDERS.ID, null],
      ["expression", "Math"],
    ],
    expressions: {
      Math: ["+", 1, 1],
    },
    limit: 5,
  },
};

const tableQuestionWithExpressionAndFields = {
  display: "table",
  query: {
    "source-table": ORDERS_ID,
    expressions: {
      Math: ["+", 1, 1],
    },
    fields: [
      ["field", ORDERS.ID, { "base-type": "type/BigInteger" }],
      ["expression", "Math", { "base-type": "type/Integer" }],
    ],
  },
};

const tableWithAggregations = {
  display: "table",
  query: {
    "source-table": ORDERS_ID,
    aggregation: [
      ["count"],
      ["sum", ["field", ORDERS.QUANTITY, { "base-type": "type/Integer" }]],
    ],
    limit: 5,
  },
};

const multiStageQuestion = {
  query: {
    "source-query": {
      "source-table": ORDERS_ID,
      aggregation: [["count"]],
      breakout: [["field", ORDERS.PRODUCT_ID, { "base-type": "type/Integer" }]],
    },
    filter: [">", ["field", "count", { "base-type": "type/Integer" }], 0],
    limit: 5,
  },
};

const nativeQuestion = {
  display: "table",
  native: {
    query: "SELECT * FROM ORDERS",
  },
};

const nestedQuestion = (cardId: number) => ({
  display: "table",
  query: {
    "source-table": `card__${cardId}`,
  },
});

const nestedQuestionWithJoinOnTable = (cardId: number) => ({
  display: "table",
  query: {
    "source-table": `card__${cardId}`,
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
    limit: 5,
  },
});

const nestedQuestionWithJoinOnQuestion = (cardId: number) => ({
  display: "table",
  query: {
    "source-table": `card__${cardId}`,
    joins: [
      {
        fields: "all",
        "source-table": `card__${cardId}`,
        condition: [
          "=",
          ["field", ORDERS.ID, null],
          ["field", ORDERS.ID, { "join-alias": `Question ${cardId}` }],
        ],
        alias: `Question ${cardId}`,
      },
    ],
    limit: 5,
  },
});

// ── Local helpers (spec-local orchestration) ────────────────────────────────

const visualization = (page: Page) => tableInteractive(page);
const openSettings = (page: Page) => openVizSettingsSidebar(page);

/** The next POST /api/dataset response — the "@dataset" alias. Register before
 * the action that re-runs the query, await after. */
function datasetResponse(page: Page) {
  return page.waitForResponse(
    (response) =>
      response.request().method() === "POST" &&
      new URL(response.url()).pathname === "/api/dataset",
  );
}

/** Create a question through the API (with visualization_settings support) and
 * visit it — the `H.createQuestion(details, { visitQuestion: true })` shape. */
async function createAndVisit(
  api: MetabaseApi,
  page: Page,
  details: Parameters<typeof createVizQuestion>[1],
): Promise<number> {
  const { id } = await createVizQuestion(api, details);
  await visitQuestion(page, id);
  return id;
}

type ColumnTestData = {
  column: string;
  columnName: string;
  table?: string;
  sanityCheck?: string;
  needsScroll?: boolean;
  scrollTimes?: number;
};

async function scrollTimes(page: Page, count: number) {
  for (let i = 0; i < count; i++) {
    await scrollVisualizationRight(page);
    await page.waitForTimeout(200);
  }
}

async function _hideColumn(
  page: Page,
  {
    column,
    columnName,
    table,
    sanityCheck,
    needsScroll = true,
    scrollTimes: times = 1,
  }: ColumnTestData,
) {
  await hideColumn(page, columnName);
  await assertColumnHidden(getColumn(page, columnName));
  if (sanityCheck) {
    await assertColumnEnabled(getColumn(page, sanityCheck));
  }
  if (needsScroll) {
    await scrollTimes(page, times);
  }
  await expect(
    visualization(page).getByText(columnName, { exact: true }),
  ).toHaveCount(0);

  await page.getByRole("button", { name: /Add or remove columns/ }).click();
  await expect(
    page.getByTestId(`${table}-table-columns`).getByLabel(column, { exact: true }),
  ).toBeChecked();
  await page.getByRole("button", { name: /Done picking columns/ }).click();
}

async function _showColumn(
  page: Page,
  {
    columnName,
    sanityCheck,
    needsScroll = true,
    scrollTimes: times = 1,
  }: ColumnTestData,
) {
  await showColumn(page, columnName);
  await assertColumnEnabled(getColumn(page, columnName));
  if (sanityCheck) {
    await assertColumnEnabled(getColumn(page, sanityCheck));
  }
  if (needsScroll) {
    await scrollTimes(page, times);
  }
  await expect(
    visualization(page)
      .getByText(columnName, { exact: true })
      .filter({ visible: true })
      .first(),
  ).toBeVisible();
}

async function _removeColumn(
  page: Page,
  {
    column,
    columnName,
    table,
    sanityCheck,
    needsScroll = true,
    scrollTimes: times = 1,
  }: ColumnTestData,
) {
  await page.getByRole("button", { name: /Add or remove columns/ }).click();
  const checkbox = page
    .getByTestId(`${table}-table-columns`)
    .getByLabel(column, { exact: true });
  await expect(checkbox).toBeChecked();
  const dataset = datasetResponse(page);
  await checkbox.click();
  await dataset;
  await expect(
    page.getByText("Doing science...", { exact: true }),
  ).toHaveCount(0);
  if (needsScroll) {
    await scrollTimes(page, times);
  }
  await expect(
    visualization(page).getByText(columnName, { exact: true }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: /Done picking columns/ }).click();
  await expect(getColumn(page, columnName)).toHaveCount(0);
  if (sanityCheck) {
    await assertColumnEnabled(getColumn(page, sanityCheck));
  }
}

async function _addColumn(
  page: Page,
  {
    column,
    columnName,
    table,
    sanityCheck,
    needsScroll = true,
    scrollTimes: times = 1,
  }: ColumnTestData,
) {
  await page.getByRole("button", { name: /Add or remove columns/ }).click();
  const checkbox = page
    .getByTestId(`${table}-table-columns`)
    .getByLabel(column, { exact: true });
  await expect(checkbox).not.toBeChecked();
  const dataset = datasetResponse(page);
  await checkbox.click();
  await dataset;
  await expect(
    page.getByText("Doing science...", { exact: true }),
  ).toHaveCount(0);
  if (needsScroll) {
    await scrollTimes(page, times);
  }
  await expect(
    visualization(page)
      .getByText(columnName, { exact: true })
      .filter({ visible: true })
      .first(),
  ).toBeVisible();
  await page.getByRole("button", { name: /Done picking columns/ }).click();
  await assertColumnEnabled(getColumn(page, columnName));
  if (sanityCheck) {
    await assertColumnEnabled(getColumn(page, sanityCheck));
  }
}

test.describe("scenarios > visualizations > table column settings", () => {
  test.beforeEach(async ({ mb }) => {
    await mb.restore();
    await mb.signInAsNormalUser();
  });

  test.describe("tables", () => {
    test("should be able to show and hide table fields", async ({ mb, page }) => {
      await createAndVisit(mb.api, page, tableQuestion);
      await openSettings(page);

      const testData = {
        column: "Tax",
        columnName: "Tax",
        sanityCheck: "ID",
        table: "orders",
      };

      await _hideColumn(page, testData);
      await _showColumn(page, testData);
      await _removeColumn(page, testData);
      await _addColumn(page, testData);
    });

    test("should be able to rename table columns via popover", async ({
      mb,
      page,
    }) => {
      await createAndVisit(mb.api, page, tableQuestion);

      await tableHeaderClick(page, "Product ID");

      await icon(popover(page), "gear").click();
      const input = await getControlByDisplayValue(popover(page), "Product ID");
      await input.fill("prod_id");

      // clicking outside of the popover to close it
      await page.getByTestId("app-bar").click();

      await expect(
        tableInteractive(page).getByText("prod_id", { exact: true }),
      ).toBeVisible();
    });

    test("should be able to show and hide table fields with in a join", async ({
      mb,
      page,
    }) => {
      await createAndVisit(mb.api, page, tableQuestionWithJoin);
      await openSettings(page);

      const testData = {
        column: "Category",
        columnName: "Products → Category",
        sanityCheck: "Products → Ean",
        table: "products",
      };

      await _hideColumn(page, testData);
      await _showColumn(page, testData);
      await _removeColumn(page, testData);
      await _addColumn(page, testData);
    });

    test("should be able to show and hide all table fields with a single click", async ({
      mb,
      page,
    }) => {
      await createAndVisit(mb.api, page, tableQuestionWithJoin);
      await openSettings(page);

      await page.getByRole("button", { name: /Add or remove columns/ }).click();

      const productsColumns = page.getByTestId("products-table-columns");
      // The "Remove all"/"Add all" group toggle is one Mantine Checkbox whose
      // visible label text flips, but whose accessible name is the group
      // displayName ("Products"). Cypress's findByLabelText matched the label
      // text; Playwright's getByLabel uses the accessible name, so target the
      // stable group toggle. (The label text swaps between Remove all / Add all
      // — same physical control both times.)
      const groupToggle = productsColumns.getByLabel("Products", {
        exact: true,
      });

      let dataset = datasetResponse(page);
      // "Remove all"
      await groupToggle.click();
      await dataset;
      await expect(
        page.getByTestId("query-builder-main").getByText("Doing science...", {
          exact: true,
        }),
      ).toHaveCount(0);

      // Check a few columns as a sanity check
      await expect(
        productsColumns.getByLabel("Title", { exact: true }),
      ).not.toBeChecked();
      await expect(
        productsColumns.getByLabel("Category", { exact: true }),
      ).not.toBeChecked();
      await expect(
        productsColumns.getByLabel("Price", { exact: true }),
      ).not.toBeChecked();

      // Enable all columns ("Add all")
      await expect(groupToggle).not.toBeChecked();
      dataset = datasetResponse(page);
      await groupToggle.click();
      await dataset;
      await expect(
        page.getByTestId("query-builder-main").getByText("Doing science...", {
          exact: true,
        }),
      ).toHaveCount(0);

      await expect(
        productsColumns.getByLabel("Title", { exact: true }),
      ).toBeChecked();
      await expect(
        productsColumns.getByLabel("Category", { exact: true }),
      ).toBeChecked();
      await expect(
        productsColumns.getByLabel("Price", { exact: true }),
      ).toBeChecked();
    });

    test("should be able to show and hide table fields with a join with fields", async ({
      mb,
      page,
    }) => {
      await createAndVisit(mb.api, page, tableQuestionWithJoinAndFields);
      await openSettings(page);

      const firstColumn = {
        column: "Category",
        columnName: "Products → Category",
        table: "products",
      };

      const secondColumn = {
        column: "Ean",
        columnName: "Products → Ean",
        table: "products",
      };

      await _hideColumn(page, firstColumn);
      await _removeColumn(page, firstColumn);

      await _addColumn(page, secondColumn);
    });

    test("should be able to show and hide table fields with a self join with fields", async ({
      mb,
      page,
    }) => {
      await createAndVisit(mb.api, page, tableQuestionWithSelfJoinAndFields);
      await openSettings(page);

      const testData = {
        column: "Tax",
        columnName: "Orders → Tax",
        table: "orders 2",
        needsScroll: false,
      };

      await _hideColumn(page, testData);
      await _showColumn(page, testData);
      await _removeColumn(page, testData);
      await _addColumn(page, testData);
    });

    test("should be able to show and hide implicitly joinable fields for a table", async ({
      mb,
      page,
    }) => {
      await createAndVisit(mb.api, page, tableQuestion);
      await openSettings(page);

      const testData = {
        column: "Category",
        columnName: "Product → Category",
        table: "product",
      };

      await _addColumn(page, testData);
      await _hideColumn(page, testData);
      await _showColumn(page, testData);
      await _removeColumn(page, testData);
    });

    test("should be able to show and hide custom expressions for a table", async ({
      mb,
      page,
    }) => {
      await createAndVisit(mb.api, page, tableQuestionWithExpression);
      await openSettings(page);

      const testData = {
        column: "Math",
        columnName: "Math",
        table: "orders",
        needsScroll: false,
      };

      await _hideColumn(page, testData);
      await _showColumn(page, testData);
    });

    test("should be able to show and hide custom expressions for a table with selected fields", async ({
      mb,
      page,
    }) => {
      await createAndVisit(mb.api, page, tableQuestionWithExpressionAndFields);
      await openSettings(page);

      const testData = {
        column: "Math",
        columnName: "Math",
        table: "orders",
        needsScroll: false,
      };

      await _hideColumn(page, testData);
      await _showColumn(page, testData);
    });

    test("should be able to show and hide columns from aggregations", async ({
      mb,
      page,
    }) => {
      await createAndVisit(mb.api, page, tableWithAggregations);
      await openSettings(page);

      const testData = {
        column: "Count",
        columnName: "Count",
        table: "orders",
        sanityCheck: "Sum of Quantity",
        needsScroll: false,
      };

      const testData2 = {
        column: "Sum of Quantity",
        columnName: "Sum of Quantity",
        table: "orders",
        sanityCheck: "Count",
        needsScroll: false,
      };

      await _hideColumn(page, testData);
      await _showColumn(page, testData);
      await _hideColumn(page, testData2);
      await _showColumn(page, testData2);
    });

    test("should allow enabling text wrapping", async ({ page }) => {
      await openTable(page, { table: REVIEWS_ID });
      await openColumnOptions(page, "Body");

      await assertRowHeight(page, 0, 36);

      await icon(popover(page), "gear").click();
      await popover(page).getByText("Wrap text", { exact: true }).click();

      await assertRowHeight(page, 0, 53);

      await popover(page).getByText("Wrap text", { exact: true }).click();

      await assertRowHeight(page, 0, 36);
    });
  });

  test.describe("multi-stage questions", () => {
    test("should be able to show and hide table fields in a multi-stage query", async ({
      mb,
      page,
    }) => {
      await createAndVisit(mb.api, page, multiStageQuestion);
      await openSettings(page);

      const testData = {
        column: "Count",
        columnName: "Count",
        table: "summaries",
        sanityCheck: "Product ID",
        needsScroll: false,
      };

      const testData2 = {
        column: "Product ID",
        columnName: "Product ID",
        table: "summaries",
        sanityCheck: "Count",
        needsScroll: false,
      };

      await _hideColumn(page, testData);
      await _showColumn(page, testData);
      await _hideColumn(page, testData2);
      await _showColumn(page, testData2);
    });

    test("should be able to show and hide columns in a multi-stage query with custom columns (metabase#35067)", async ({
      mb,
      page,
    }) => {
      await createAndVisit(mb.api, page, {
        query: {
          "source-query": {
            "source-table": ORDERS_ID,
            aggregation: [["count"]],
            breakout: [
              [
                "field",
                PRODUCTS.ID,
                {
                  "base-type": "type/Integer",
                  "source-field": ORDERS.PRODUCT_ID,
                },
              ],
            ],
          },
          expressions: {
            CC: ["*", 2, ["field", "count", { "base-type": "type/Integer" }]],
          },
          limit: 5,
        },
      });
      await openSettings(page);

      const countColumn = {
        column: "Count",
        columnName: "Count",
        table: "summaries",
        sanityCheck: "CC",
        needsScroll: false,
      };

      const productIdColumn = {
        column: "Product → ID",
        columnName: "Product → ID",
        table: "summaries",
        sanityCheck: "Count",
        needsScroll: false,
      };

      const customColumn = {
        column: "CC",
        columnName: "CC",
        table: "summaries",
        sanityCheck: "Count",
        needsScroll: false,
      };

      await _hideColumn(page, countColumn);
      await _showColumn(page, countColumn);
      await _removeColumn(page, countColumn);
      await _addColumn(page, countColumn);
      await _hideColumn(page, productIdColumn);
      await _showColumn(page, productIdColumn);
      await _removeColumn(page, productIdColumn);
      await _addColumn(page, productIdColumn);
      await _hideColumn(page, customColumn);
      await _showColumn(page, customColumn);
    });
  });

  test.describe("nested structured questions", () => {
    test("should be able to show and hide fields from a nested query", async ({
      mb,
      page,
    }) => {
      const { id } = await createVizQuestion(mb.api, tableQuestion);
      await createAndVisit(mb.api, page, nestedQuestion(id));
      await openSettings(page);

      const testData = {
        column: "Tax",
        columnName: "Tax",
        table: "test question",
      };

      await _hideColumn(page, testData);
      await _showColumn(page, testData);
      await _removeColumn(page, testData);
      await _addColumn(page, testData);
    });

    test("should be able to show and hide fields from a nested query with joins (metabase#32373)", async ({
      mb,
      page,
    }) => {
      const { id } = await createVizQuestion(mb.api, tableQuestionWithJoin);
      await createAndVisit(mb.api, page, nestedQuestion(id));
      await openSettings(page);

      const testData = {
        column: "Products → Category",
        columnName: "Products → Category",
        table: "test question",
      };

      await _hideColumn(page, testData);
      await _showColumn(page, testData);
      await _removeColumn(page, testData);
      await _addColumn(page, testData);
    });

    test("should be able to show and hide fields from a nested query with joins and fields (metabase#32373)", async ({
      mb,
      page,
    }) => {
      const { id } = await createVizQuestion(
        mb.api,
        tableQuestionWithJoinAndFields,
      );
      await createAndVisit(mb.api, page, nestedQuestion(id));
      await openSettings(page);

      const testData = {
        column: "Products → Category",
        columnName: "Products → Category",
        table: "test question",
        scrollTimes: 3,
      };

      const testData2 = {
        column: "Ean",
        columnName: "Product → Ean",
        table: "product",
        scrollTimes: 3,
      };

      await _hideColumn(page, testData);
      await _removeColumn(page, testData);

      await _addColumn(page, testData2);

      await _addColumn(page, testData);
    });

    test("should be able to show and hide implicitly joinable fields for a nested query with joins and fields", async ({
      mb,
      page,
    }) => {
      const { id } = await createVizQuestion(mb.api, tableQuestion);
      await createAndVisit(mb.api, page, nestedQuestionWithJoinOnTable(id));
      await openSettings(page);

      const newColumn = {
        column: "ID",
        columnName: "User → ID",
        table: "user",
        scrollTimes: 3,
      };

      await _addColumn(page, newColumn);
      await _hideColumn(page, newColumn);
      await _removeColumn(page, newColumn);
    });

    test("should be able to show and hide implicitly joinable fields for a nested query", async ({
      mb,
      page,
    }) => {
      const { id } = await createVizQuestion(mb.api, tableQuestion);
      await createAndVisit(mb.api, page, nestedQuestion(id));
      await openSettings(page);

      const newColumn = {
        column: "Category",
        columnName: "Product → Category",
        table: "product",
      };

      await _addColumn(page, newColumn);
      await _hideColumn(page, newColumn);
      await _removeColumn(page, newColumn);
    });

    test("should be able to show and hide custom expressions from a nested query", async ({
      mb,
      page,
    }) => {
      const { id } = await createVizQuestion(
        mb.api,
        tableQuestionWithExpression,
      );
      await createAndVisit(mb.api, page, nestedQuestion(id));
      await openSettings(page);

      const mathColumn = {
        column: "Math",
        columnName: "Math",
        table: "test question",
        needsScroll: false,
      };

      await _hideColumn(page, mathColumn);
      await _showColumn(page, mathColumn);
      await _removeColumn(page, mathColumn);
      await _addColumn(page, mathColumn);
    });

    test("should be able to show and hide columns from aggregations from a nested query", async ({
      mb,
      page,
    }) => {
      const { id } = await createVizQuestion(mb.api, tableWithAggregations);
      await createAndVisit(mb.api, page, nestedQuestion(id));
      await openSettings(page);

      const countColumn = {
        column: "Count",
        columnName: "Count",
        table: "test question",
        needsScroll: false,
      };

      const sumColumn = {
        column: "Sum of Quantity",
        columnName: "Sum of Quantity",
        table: "test question",
        needsScroll: false,
      };

      await _hideColumn(page, countColumn);
      await _showColumn(page, countColumn);
      await _hideColumn(page, sumColumn);
      await _showColumn(page, sumColumn);
    });

    test("should be able to show and hide columns from a nested query with a self join", async ({
      mb,
      page,
    }) => {
      const { id } = await createVizQuestion(mb.api, tableQuestion);
      await createAndVisit(mb.api, page, nestedQuestionWithJoinOnQuestion(id));
      await openSettings(page);

      const taxColumn = {
        column: `Question ${id} → Tax`,
        columnName: `Question ${id} → Tax`,
        table: "test question 2",
        scrollTimes: 3,
      };

      await _hideColumn(page, taxColumn);
      await _showColumn(page, taxColumn);
      await _removeColumn(page, taxColumn);
      await _addColumn(page, taxColumn);
    });

    test("should be able to show and hide custom expressions from a joined question", async ({
      mb,
      page,
    }) => {
      const { id } = await createVizQuestion(
        mb.api,
        tableQuestionWithExpression,
      );
      await createAndVisit(mb.api, page, tableQuestionWithJoinOnQuestion(id));
      await openSettings(page);

      const mathColumn = {
        column: `Question ${id} → Math`,
        columnName: `Question ${id} → Math`,
        table: "test question",
        needsScroll: false,
      };

      await _hideColumn(page, mathColumn);
      await _showColumn(page, mathColumn);
      await _removeColumn(page, mathColumn);
      await _addColumn(page, mathColumn);
    });

    test("should be able to show a column from a nested query when it was hidden in the notebook editor", async ({
      mb,
      page,
    }) => {
      const { id } = await createVizQuestion(mb.api, tableQuestion);
      await createAndVisit(mb.api, page, nestedQuestion(id));

      await openNotebook(page);
      await page.getByTestId("fields-picker").click();
      await popover(page).getByText("Tax", { exact: true }).click();
      await visualize(page);

      await openSettings(page);

      const taxColumn = {
        column: "Tax",
        columnName: "Tax",
        table: "test question",
      };

      await _addColumn(page, taxColumn);
    });
  });

  test.describe("nested native questions", () => {
    test("should be able to show and hide fields from a nested native query", async ({
      mb,
      page,
    }) => {
      const { id } = await createNativeVizQuestion(mb.api, nativeQuestion);
      await createAndVisit(mb.api, page, nestedQuestion(id));
      await openSettings(page);

      const taxColumn = {
        column: "TAX",
        columnName: "TAX",
        table: "test question",
      };

      await _hideColumn(page, taxColumn);
      await _showColumn(page, taxColumn);
      await _removeColumn(page, taxColumn);
      await _addColumn(page, taxColumn);
    });
  });

  test("should handle duplicated values in table.columns viz settings (metabase#62053)", async ({
    mb,
    page,
  }) => {
    const nativeQuestionWithDuplicatedColumns = {
      display: "table",
      native: {
        query: "SELECT ID, TAX FROM ORDERS LIMIT 5",
      },
      visualization_settings: {
        "table.columns": [
          { name: "ID", enabled: true },
          // Duplicate ID column entry
          { name: "ID", enabled: true },
          { name: "TAX", enabled: true },
        ],
      },
    };

    const { id } = await createNativeVizQuestion(
      mb.api,
      nativeQuestionWithDuplicatedColumns,
    );
    await visitQuestion(page, id);

    // Verify the table renders correctly despite duplicated viz settings
    await expect(visualization(page)).toBeVisible();

    // Verify expected columns are visible
    await expect(
      visualization(page).getByText("ID", { exact: true }),
    ).toHaveCount(1);
    await expect(
      visualization(page).getByText("TAX", { exact: true }),
    ).toBeVisible();

    // Open settings to verify column settings work
    await openSettings(page);

    // Verify that column controls are displayed correctly
    const vc = visibleColumns(page);
    await expect(vc).toBeVisible();
    await expect(vc.getByText("ID", { exact: true })).toBeVisible();
    await expect(vc.getByTestId("ID-hide-button")).toBeVisible();
    await expect(vc.getByText("TAX", { exact: true })).toBeVisible();
    await expect(vc.getByTestId("TAX-hide-button")).toBeVisible();
  });

  test.describe("column pinning", () => {
    test.describe("column reordering between pinned and unpinned sections", () => {
      test("should allow reordering a column from the unpinned section into the pinned section", async ({
        mb,
        page,
      }) => {
        await createAndVisit(mb.api, page, {
          query: { "source-table": ORDERS_ID },
          visualization_settings: {
            "table.freeze_columns": true,
            "table.freeze_columns_count": 1,
          },
        });

        const pinnedCells = page
          .getByTestId("header-pinned-quadrant")
          .getByTestId("header-cell");
        await expect(pinnedCells).toHaveCount(1);
        await expect(pinnedCells.first()).toContainText("ID");

        await moveDnDKitColumnHeader(columnHeaderDragHandle(page, "User ID"), {
          horizontal: -50,
        });

        await expect(pinnedCells).toHaveCount(1);
        await expect(pinnedCells.first()).toContainText("User ID");
      });

      test("should allow reordering a column from the pinned section into the unpinned section", async ({
        mb,
        page,
      }) => {
        await createAndVisit(mb.api, page, {
          query: { "source-table": ORDERS_ID },
          visualization_settings: {
            "table.freeze_columns": true,
            "table.freeze_columns_count": 2,
          },
        });

        const pinnedCells = page
          .getByTestId("header-pinned-quadrant")
          .getByTestId("header-cell");
        await expect(pinnedCells).toHaveCount(2);
        await expect(pinnedCells.nth(0)).toContainText("ID");
        await expect(pinnedCells.nth(1)).toContainText("User ID");

        await moveDnDKitColumnHeader(columnHeaderDragHandle(page, "ID"), {
          horizontal: 400,
        });

        await expect(pinnedCells.nth(0)).toContainText("User ID");
        await expect(pinnedCells.nth(1)).toContainText("Product ID");
      });
    });

    test.describe("column resizing with pinning limits", () => {
      test("should unpin/re-pin the last pinned column when resizing exceeds/fits 90% of container width", async ({
        mb,
        page,
      }) => {
        await createAndVisit(mb.api, page, {
          query: { "source-table": ORDERS_ID },
          visualization_settings: {
            "table.freeze_columns": true,
            "table.freeze_columns_count": 4,
          },
        });

        const pinnedCells = page
          .getByTestId("header-pinned-quadrant")
          .getByTestId("header-cell");
        await expect(pinnedCells).toHaveCount(4);

        const containerWidth = await tableInteractiveScrollContainer(
          page,
        ).evaluate((el) => el.clientWidth);
        const moveX = containerWidth * 0.7;

        await resizeTableColumn(page, "ID", moveX);
        await expect(pinnedCells).toHaveCount(2);

        await resizeTableColumn(page, "ID", -moveX);
        await expect(pinnedCells).toHaveCount(4);

        // allow resizing columns in the pinned section without affecting
        // pinning when within limits
        await resizeTableColumn(page, "ID", 30);
        await expect(pinnedCells).toHaveCount(4);
      });
    });
  });

  test("should respect date_style column setting for week temporal unit", async ({
    mb,
    page,
  }) => {
    const questionWithWeekBreakout = {
      display: "table",
      query: {
        "source-table": ORDERS_ID,
        aggregation: [["count"]],
        breakout: [["field", ORDERS.CREATED_AT, { "temporal-unit": "week" }]],
        limit: 5,
      },
    };

    await createAndVisit(mb.api, page, questionWithWeekBreakout);

    // Open visualization settings
    await openVizSettingsSidebar(page);

    // Click on the "Created At: Week" column to open its settings
    await leftSidebar(page)
      .getByTestId("Created At: Week-settings-button")
      .click();

    // Change date style to M/D/YYYY
    await popover(page).getByText("Date style", { exact: true }).click();
    await popover(page)
      .getByText(/^1\/31\/2018/)
      .click();

    // Verify the formatting changed to numeric style. Format like
    // "1/1/2025 - 1/7/2025"
    await expectFirstCellText(page, /\d+\/\d+\/\d{4} – \d+\/\d+\/\d{4}/);

    // Change date style to YYYY/M/D
    await popover(page).getByText("Date style", { exact: true }).click();
    await popover(page)
      .getByText(/^2018\/1\/31/)
      .click();

    // Verify the formatting changed to day-first numeric style. Format like
    // "2025/1/1 - 2025/1/7"
    await expectFirstCellText(page, /\d{4}\/\d+\/\d+ – \d{4}\/\d+\/\d+/);

    await popover(page).getByText("YYYY.M.D", { exact: true }).click();
    // Verify separator formatting changed. Format like "2025.1.1 - 2025.1.7"
    await expectFirstCellText(page, /\d{4}\.\d+\.\d+ – \d{4}\.\d+\.\d+/);
  });
});

async function expectFirstCellText(page: Page, regex: RegExp) {
  await expect
    .poll(async () =>
      tableInteractiveBody(page).getByTestId("cell-data").first().textContent(),
    )
    .toMatch(regex);
}
