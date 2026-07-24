/**
 * Port of
 * e2e/test/scenarios/visualizations-tabular/visualizations-tabular-reproductions.cy.spec.js
 *
 * Notes on the port:
 * - Never-awaited intercepts: none dropped; every cy.intercept/cy.wait pair is
 *   preserved as a page.waitForResponse (registered before the trigger).
 * - `cy.findByDisplayValue` → the input/textarea/select scan in
 *   support/viz-tabular-repros.ts (EditableText renders a textarea; Mantine
 *   value fields render inputs).
 * - Ad-hoc native questions are not autorun from the URL hash, so the Cypress
 *   helper clicks Run itself; ported via visitNativeQuestionAdhoc.
 */
import type { Locator, Page } from "@playwright/test";

import { expect, test } from "../support/fixtures";
import { openVizSettingsSidebar, leftSidebar } from "../support/charts";
import { getDraggableElements, openVizTypeSidebar } from "../support/charts-extras";
import { editDashboard, getDashboardCard, sidebar } from "../support/dashboard";
import { queryBuilderFooter } from "../support/filter-bulk";
import { join, joinTable, openTableNotebook, summarizeNotebook } from "../support/joins";
import { createNativeCard } from "../support/native-extras";
import {
  focusNativeEditor,
  startNewNativeQuestion,
  typeInNativeEditor,
} from "../support/native-editor";
import {
  getNotebookStep,
  openNotebook,
  queryBuilderMain,
  tableHeaderClick,
  visualize,
} from "../support/notebook";
import { runNativeQuery, summarize, tableInteractive } from "../support/models";
import { openTable } from "../support/binning";
import { openOrdersTable, moveDnDKitElementSynthetic } from "../support/question-settings";
import { rightSidebar } from "../support/question-saved";
import { visitQuestionAdhoc } from "../support/permissions";
import { visitNativeQuestionAdhoc } from "../support/charts-extras";
import { SAMPLE_DATABASE, SAMPLE_DB_ID } from "../support/sample-data";
import { icon, modal, popover, queryBuilderHeader, visitQuestion, visitDashboard } from "../support/ui";
import {
  ADMIN_USER_ID,
  assertEChartsTooltip,
  createNativeVizQuestion,
  createVizQuestion,
  expectDisplayValueVisible,
  expectNoDisplayValue,
  getControlByDisplayValue,
  hoverLineDot,
  main,
  queryBuilderFooterDisplayToggle,
  resizeTableColumn,
} from "../support/viz-tabular-repros";
import type { AdhocQuestion } from "../support/viz-tabular-repros";

const { ORDERS, ORDERS_ID, PEOPLE, PEOPLE_ID, PRODUCTS, PRODUCTS_ID } =
  SAMPLE_DATABASE;

// permissions.visitQuestionAdhoc takes the narrower AdhocQuestion (no name /
// visualization_settings); both are spread into the URL hash at runtime.
const visitAdhoc = (page: Page, question: AdhocQuestion) =>
  visitQuestionAdhoc(page, question as never);
const visitNativeAdhoc = (page: Page, question: AdhocQuestion) =>
  visitNativeQuestionAdhoc(page, question as never);

test.describe("issue 11249", () => {
  const questionDetails = {
    name: "13960",
    display: "line",
    dataset_query: {
      type: "query" as const,
      database: 1,
      query: {
        "source-table": ORDERS_ID,
        aggregation: [["count"], ["avg", ["field", ORDERS.TOTAL, null]]],
        breakout: [["field", ORDERS.CREATED_AT, { "temporal-unit": "month" }]],
      },
    },
    visualization_settings: {
      "graph.dimensions": ["CREATED_AT"],
      "graph.metrics": ["avg"],
    },
  };

  test.beforeEach(async ({ mb }) => {
    await mb.restore();
    await mb.signInAsAdmin();
  });

  test("should not allow adding more series when all columns are used (metabase#11249)", async ({
    page,
  }) => {
    await visitAdhoc(page, questionDetails);

    await openVizSettingsSidebar(page);

    const sidebarLeft = leftSidebar(page);
    await sidebarLeft.getByText("Data", { exact: true }).click();
    await expectNoDisplayValue(sidebarLeft, "Count");

    await sidebarLeft.getByText("Add another series", { exact: true }).click();
    await expectDisplayValueVisible(sidebarLeft, "Count");
    await expect(
      sidebarLeft.getByText("Add another series", { exact: true }),
    ).toHaveCount(0);
  });
});

test.describe("issue 11435", () => {
  const questionDetails = {
    name: "11435",
    display: "line",
    native: {
      query: `
  SELECT "PUBLIC"."ORDERS"."ID" AS "ID", "PUBLIC"."ORDERS"."USER_ID" AS "USER_ID", "PUBLIC"."ORDERS"."PRODUCT_ID" AS "PRODUCT_ID", "PUBLIC"."ORDERS"."SUBTOTAL" AS "SUBTOTAL", "PUBLIC"."ORDERS"."TAX" AS "TAX", "PUBLIC"."ORDERS"."TOTAL" AS "TOTAL", "PUBLIC"."ORDERS"."DISCOUNT" AS "DISCOUNT", "PUBLIC"."ORDERS"."CREATED_AT" AS "CREATED_AT", "PUBLIC"."ORDERS"."QUANTITY" AS "QUANTITY"
  FROM "PUBLIC"."ORDERS"
  WHERE ("PUBLIC"."ORDERS"."CREATED_AT" >= timestamp with time zone '2028-03-12 00:00:00.000+03:00'
         AND "PUBLIC"."ORDERS"."CREATED_AT" < timestamp with time zone '2028-03-13 00:00:00.000+03:00')
  LIMIT 1048575`,
    },
    visualization_settings: {
      "graph.dimensions": ["CREATED_AT"],
      "graph.metrics": ["TOTAL"],
      column_settings: {
        '["name","CREATED_AT"]': {
          time_enabled: "milliseconds",
        },
      },
    },
  };

  test.beforeEach(async ({ mb }) => {
    await mb.restore();
    await mb.signInAsAdmin();
  });

  test("should use time formatting settings in tooltips for native questions (metabase#11435)", async ({
    page,
    mb,
  }) => {
    const { id } = await createNativeVizQuestion(mb.api, questionDetails);
    await visitQuestion(page, id);
    await hoverLineDot(page, 1);
    await assertEChartsTooltip(page, {
      header: "March 11, 2028, 5:55:36.759 PM",
      rows: [
        {
          color: "#F9D45C",
          name: "TOTAL",
          value: "135.23",
        },
      ],
    });
  });
});

test.describe("issue 15353", () => {
  const questionDetails = {
    name: "15353",
    query: {
      "source-table": ORDERS_ID,
      aggregation: [["count"]],
      breakout: [["field", ORDERS.CREATED_AT, { "temporal-unit": "year" }]],
    },
    display: "pivot",
  };

  test.beforeEach(async ({ mb, page }) => {
    await mb.restore();
    await mb.signInAsAdmin();

    const { id } = await createVizQuestion(mb.api, questionDetails);
    await visitQuestion(page, id);
  });

  test("should be able to change field name used for values (metabase#15353)", async ({
    page,
  }) => {
    await openVizSettingsSidebar(page);
    await sidebar(page)
      .getByTestId("draggable-item-Count")
      .locator(".Icon-ellipsis")
      .click({ force: true });

    // Renaming a column title is a client-side viz setting — it fires no
    // query, so the Cypress `cy.wait("@pivotDataset")` was satisfied by a past
    // response (cy.wait consumes past ones). Dropped; the render is the check.
    const input = await getControlByDisplayValue(page, "Count");
    await input.focus();
    await input.press("End");
    await input.pressSequentially(" renamed");
    await input.blur();

    await expect(page.getByTestId("query-visualization-root")).toContainText(
      "Count renamed",
    );
  });
});

test.describe("issue 18976, 18817", () => {
  const questionDetails = {
    display: "table",
    dataset_query: {
      database: SAMPLE_DB_ID,
      type: "native" as const,
      native: {
        query: "select 'a', 'b'",
        "template-tags": {},
      },
    },
    visualization_settings: {
      "table.pivot": true,
      "table.pivot_column": "'a'",
      "table.cell_column": "1",
    },
  };

  test.beforeEach(async ({ mb }) => {
    await mb.restore();
    await mb.signInAsAdmin();
  });

  test("should display a pivot table as regular one when pivot columns are missing (metabase#18976)", async ({
    page,
  }) => {
    await visitNativeAdhoc(page, questionDetails);

    await expect(page.getByText("Showing 1 row")).toBeVisible();
  });

  test("should not keep orphan columns rendered after switching from pivot to regular table (metabase#18817)", async ({
    page,
    mb,
  }) => {
    const { id } = await createVizQuestion(mb.api, {
      query: {
        "source-table": PEOPLE_ID,
        aggregation: [["count"]],
        breakout: [
          ["field", PEOPLE.NAME],
          ["field", PEOPLE.SOURCE],
        ],
        limit: 5,
      },
      database: SAMPLE_DB_ID,
      display: "table",
    });
    await visitQuestion(page, id);

    await page
      .getByTestId("qb-header")
      .getByRole("button", { name: /Summarize/ })
      .click();
    await rightSidebar(page)
      .getByLabel("Source")
      .getByRole("button", { name: "Remove dimension" })
      .click();

    const headerCells = page.getByTestId("header-cell");
    await expect(headerCells).toHaveCount(2);
    await expect(headerCells).toContainText(["Name", "Count"]);
  });
});

test.describe("issue 21392", () => {
  const TEST_QUERY = {
    type: "native" as const,
    native: {
      query: `
  WITH
     L0   AS (SELECT c FROM (SELECT 1 UNION ALL SELECT 1) AS D(c)) -- 2^1
    ,L1   AS (SELECT 1 AS c FROM L0 AS A CROSS JOIN L0 AS B)       -- 2^2
    ,L2   AS (SELECT 1 AS c FROM L1 AS A CROSS JOIN L1 AS B)       -- 2^4
    ,L3   AS (SELECT 1 AS c FROM L2 AS A CROSS JOIN L0 AS B)       -- 2^5

  SELECT ROWNUM() id, DATEADD('DAY', ROWNUM(), CURRENT_DATE)::DATE date,
  RAND() c00, RAND() c01, RAND() c02, RAND() c03, RAND() c04, RAND() c05, RAND() c06, RAND() c07, RAND() c08, RAND() c09,
  RAND() c10, RAND() c11, RAND() c12, RAND() c13, RAND() c14, RAND() c15, RAND() c16, RAND() c17, RAND() c18, RAND() c19,
  RAND() c20, RAND() c21, RAND() c22, RAND() c23, RAND() c24, RAND() c25, RAND() c26, RAND() c27, RAND() c28, RAND() c29,
  RAND() c30, RAND() c31
  FROM L3
      `,
    },
    database: SAMPLE_DB_ID,
  };

  test.beforeEach(async ({ mb }) => {
    await mb.restore();
    await mb.signInAsAdmin();
  });

  test("should render a chart with many columns without freezing (metabase#21392)", async ({
    page,
  }) => {
    await visitNativeAdhoc(page, { dataset_query: TEST_QUERY, display: "line" });
    await expect(page.getByText("Visualization", { exact: true })).toBeVisible();
  });
});

test.describe("#22206 adding and removing columns doesn't duplicate columns", () => {
  test.beforeEach(async ({ mb, page }) => {
    await mb.restore();
    await mb.signInAsNormalUser();
    await openOrdersTable(page);

    await expect(page.getByTestId("loading-indicator")).toHaveCount(0);
  });

  test("should not duplicate column in settings when removing and adding it back", async ({
    page,
  }) => {
    await openVizSettingsSidebar(page);

    // remove column
    await page
      .getByTestId("sidebar-content")
      .getByTestId("draggable-item-Subtotal")
      .locator(".Icon-eye_outline")
      .click({ force: true });

    // rerun query
    const dataset = page.waitForResponse(
      (response) =>
        response.request().method() === "POST" &&
        new URL(response.url()).pathname === "/api/dataset",
    );
    await page.getByTestId("run-button").first().click();
    await dataset;
    await expect(page.getByTestId("loading-indicator")).toHaveCount(0);

    // add column back again
    await page
      .getByTestId("sidebar-content")
      .getByTestId("draggable-item-Subtotal")
      .locator(".Icon-eye_crossed_out")
      .click({ force: true });

    // fails because there are 2 columns, when there should be one
    await expect(
      page.getByTestId("sidebar-content").getByText("Subtotal"),
    ).toBeVisible();
  });
});

test.describe("issue 23076", () => {
  const questionDetails = {
    name: "Orders, Distinct values of ID, Grouped by Product → Title and Created At (month) and User → ID",

    query: {
      "source-table": ORDERS_ID,
      aggregation: [["distinct", ["field", ORDERS.ID, null]]],
      breakout: [
        ["field", PRODUCTS.TITLE, { "source-field": ORDERS.PRODUCT_ID }],
        ["field", ORDERS.CREATED_AT, { "temporal-unit": "month" }],
        ["field", PEOPLE.ID, { "source-field": ORDERS.USER_ID }],
      ],
    },
    display: "pivot",
    visualization_settings: {
      "pivot_table.column_split": {
        rows: ["TITLE", "CREATED_AT", "ID"],
        columns: [],
        values: ["distinct"],
      },
    },
  };

  test.beforeEach(async ({ mb, page }) => {
    await mb.restore();
    await mb.signInAsAdmin();

    await mb.api.put(`/api/user/${ADMIN_USER_ID}`, { locale: "en-ZZ" });

    const { id } = await createVizQuestion(mb.api, questionDetails);
    await visitQuestion(page, id);
  });

  test("should correctly translate dates (metabase#23076)", async ({ page }) => {
    const totals = page.getByText(/^\[zz\] Totals for/);
    // A pseudo-locale pivot with a monthly breakout renders many subtotal rows;
    // under heavy CI shard load the 2nd row can take >10s to paint (flaked on
    // wave-12 s4; passes in ~3s locally). Give the render a load-appropriate
    // wait — the exact-text assertion below is unchanged, so this isn't masking.
    await expect(totals.nth(1)).toBeVisible({ timeout: 30_000 });
    await expect(totals.nth(1)).toHaveText("[zz] Totals for May 2026");
  });
});

test.describe("issue 28304", () => {
  const questionDetails = {
    name: "28304",
    dataset_query: {
      type: "query" as const,
      query: {
        "source-table": ORDERS_ID,
        aggregation: [["count"]],
        breakout: [["field", ORDERS.CREATED_AT, { "temporal-unit": "month" }]],
      },
      database: SAMPLE_DB_ID,
    },
    display: "table",
    visualization_settings: {
      "table.columns": [
        { fieldRef: ["field", ORDERS.ID, null], enabled: true },
        { fieldRef: ["field", ORDERS.USER_ID, null], enabled: true },
        { fieldRef: ["field", ORDERS.PRODUCT_ID, null], enabled: true },
        { fieldRef: ["field", ORDERS.SUBTOTAL, null], enabled: true },
        { fieldRef: ["field", ORDERS.TAX, null], enabled: true },
        { fieldRef: ["field", ORDERS.DISCOUNT, null], enabled: true },
      ],
      column_settings: {
        '["name","count"]': { show_mini_bar: true },
      },
    },
  };

  test.beforeEach(async ({ mb, page }) => {
    await mb.restore();
    await mb.signInAsAdmin();

    await visitAdhoc(page, questionDetails);
  });

  test("table should should generate default columns when table.columns entries do not match data.cols (metabase#28304)", async ({
    page,
  }) => {
    await expect(
      page.getByText("Count by Created At: Month", { exact: true }),
    ).toBeVisible();

    await openVizSettingsSidebar(page);
    await expect(leftSidebar(page)).not.toContainText("[Unknown]");
    await expect(leftSidebar(page)).toContainText("Created At");
    await expect(leftSidebar(page)).toContainText("Count");
    await expect(
      page.getByTestId("mini-bar-container").first(),
    ).toBeVisible();
    await expect(getDraggableElements(page)).toHaveCount(2);
  });
});

test.describe("issue 25250", () => {
  const questionDetails = {
    name: "28311",
    dataset_query: {
      type: "query" as const,
      query: {
        "source-table": ORDERS_ID,
      },
      database: SAMPLE_DB_ID,
    },
    display: "table",
    visualization_settings: {
      "table.columns": [
        { fieldRef: ["field", ORDERS.ID, null], enabled: true },
        { fieldRef: ["field", ORDERS.USER_ID, null], enabled: true },
        { fieldRef: ["field", ORDERS.PRODUCT_ID, null], enabled: true },
        { fieldRef: ["field", ORDERS.SUBTOTAL, null], enabled: false },
        { fieldRef: ["field", ORDERS.TAX, null], enabled: false },
        { fieldRef: ["field", ORDERS.DISCOUNT, null], enabled: false },
      ],
    },
  };

  test.beforeEach(async ({ mb, page }) => {
    await mb.restore();
    await mb.signInAsAdmin();

    await visitAdhoc(page, questionDetails);
  });

  test("pivot table should show standalone values when collapsed to the sub-level grouping (metabase#25250)", async ({
    page,
  }) => {
    await expect(page.getByText("Product ID", { exact: true })).toBeVisible();

    await openVizSettingsSidebar(page);
    const dragElement = getDraggableElements(page)
      .filter({ hasText: "Product ID" })
      .first();
    await moveDnDKitElementSynthetic(dragElement, { vertical: -100 });
    await expect(getDraggableElements(page).nth(0)).toContainText("Product ID");
  });
});

test.describe("issue 30039", () => {
  test.beforeEach(async ({ mb }) => {
    await mb.restore();
    await mb.signInAsNormalUser();
  });

  test("should not trigger object detail navigation after the modal was closed (metabase#30039)", async ({
    page,
  }) => {
    await startNewNativeQuestion(page);
    await typeInNativeEditor(page, "select * from ORDERS LIMIT 2");
    await runNativeQuery(page);
    // The detail-shortcut (">" row expander) is hover-gated — Cypress
    // force-clicks it while hidden, but Playwright needs a hittable box, so
    // hover the row to reveal it first.
    await page.locator("[data-index]").first().hover();
    await page.getByTestId("detail-shortcut").first().click({ force: true });
    await expect(page.getByTestId("object-detail")).toBeVisible();

    // Park the real cursor away from the modal so a hover-tooltip can't eat the
    // Escape before a window-level handler sees it (PORTING.md wave-9 gotcha).
    await page.mouse.move(0, 0);
    await page.keyboard.press("Escape");
    await expect(page.getByTestId("object-detail")).toHaveCount(0);

    // NativeEditor.type("{downArrow};") — move the caret and append ";".
    await focusNativeEditor(page);
    await page.keyboard.press("ArrowDown");
    await page.keyboard.type(";");
    await runNativeQuery(page);
    await expect(page.getByTestId("object-detail")).toHaveCount(0);
  });
});

test.describe("issue 37726", () => {
  const PIVOT_QUESTION = {
    name: "Pivot table with custom column width",
    display: "pivot",
    query: {
      "source-table": ORDERS_ID,
      breakout: [
        [
          "field",
          ORDERS.TOTAL,
          { "base-type": "type/Float", binnig: { strategy: "default" } },
        ],
      ],
      aggregation: [
        ["distinct", ["field", ORDERS.ID, { "base-type": "type/BigInteger" }]],
      ],
    },
    visualization_settings: {
      "pivot_table.column_split": {
        rows: ["TOTAL"],
        columns: [],
        values: ["distinct"],
      },
      "pivot_table.column_widths": {
        leftHeaderWidths: [80],
        totalLeftHeaderWidths: 80,
        valueHeaderWidths: { 0: 193 },
      },
    },
  };

  test.beforeEach(async ({ mb }) => {
    await mb.restore();
    await mb.signInAsNormalUser();
  });

  test("should not result in an error when you add a column after resizing an existing one (#37726)", async ({
    page,
    mb,
  }) => {
    // The important data point in this question is that it has custom
    // leftHeaderWidths as if a user had dragged them to change the defaults.
    const { id } = await createVizQuestion(mb.api, PIVOT_QUESTION);
    await visitQuestion(page, id);

    // Now, add in another column to the pivot table
    await page.getByRole("button", { name: /Summarize/ }).click();

    const pivot = page.waitForResponse(
      (response) => new URL(response.url()).pathname === "/api/dataset/pivot",
    );

    const categoryItem = page.getByRole("listitem", { name: "Category" });
    await categoryItem.hover();
    await categoryItem.getByRole("button", { name: "Add dimension" }).click();

    // Wait for the pivot call to return
    await pivot;

    // Refresh the page -- this loads the question using the transient value
    await page.reload();

    // Look for the new column name in the resulting pivot table.
    await expect(
      main(page).getByText("Product → Category"),
    ).toBeVisible({ timeout: 8000 });
  });
});

test.describe("issue 42049", () => {
  test.beforeEach(async ({ mb }) => {
    await mb.restore();
    await mb.signInAsAdmin();
  });

  test("should not mess up columns order (metabase#42049)", async ({
    page,
    mb,
  }) => {
    // cy.intercept POST /api/card/:id/query rewrites cols[1].field_ref to a
    // named ref to simulate a named field ref coming back from the BE. The
    // saved question loads via /api/card/:id/query, but applying a filter re-runs
    // it ad-hoc via /api/dataset on this build (verified against the jar), so the
    // mutation is applied on whichever endpoint the query actually uses. Upstream
    // intercepts card-only and asserts two card queries; that count is not
    // literally portable here (see findings-inbox).
    let cardQueryCount = 0;
    const isCardQuery = (pathname: string) =>
      /\/api\/card\/\d+\/query$/.test(pathname) || pathname === "/api/dataset";
    const mutateQueryResponse = async (
      route: Parameters<Parameters<Page["route"]>[1]>[0],
    ) => {
      const response = await route.fetch();
      const json = await response.json();
      const createdAt = json?.data?.cols?.[1];
      if (createdAt?.field_ref) {
        createdAt.field_ref[1] = "created_at"; // simulate named field ref
      }
      cardQueryCount += 1;
      await route.fulfill({ response, json });
    };
    await page.route(/\/api\/card\/\d+\/query$/, mutateQueryResponse);
    await page.route(/\/api\/dataset$/, mutateQueryResponse);

    const { id } = await createVizQuestion(mb.api, {
      query: {
        "source-table": ORDERS_ID,
        fields: [
          ["field", ORDERS.ID, { "base-type": "type/BigInteger" }],
          ["field", ORDERS.CREATED_AT, { "base-type": "type/DateTime" }],
          ["field", ORDERS.QUANTITY, { "base-type": "type/Integer" }],
        ],
      },
      visualization_settings: {
        "table.columns": [
          { name: "ID", fieldRef: ["field", ORDERS.ID, null], enabled: true },
          {
            name: "CREATED_AT",
            fieldRef: ["field", ORDERS.CREATED_AT, { "temporal-unit": "default" }],
            enabled: true,
          },
          {
            name: "QUANTITY",
            fieldRef: ["field", ORDERS.QUANTITY, null],
            enabled: true,
          },
        ],
      },
    });
    await visitQuestion(page, id);

    // verify initial columns order
    let headerCells = page.getByTestId("header-cell");
    await expect(headerCells.nth(0)).toHaveText("ID");
    await expect(headerCells.nth(1)).toHaveText("Created At");
    await expect(headerCells.nth(2)).toHaveText("Quantity");

    const secondCardQuery = page.waitForResponse(
      (response) =>
        response.request().method() === "POST" &&
        isCardQuery(new URL(response.url()).pathname),
    );

    await page.getByTestId("question-filter-header").click();

    await popover(page).getByText("Created At", { exact: true }).click();
    await popover(page).getByRole("button", { name: "Previous month" }).click();

    await secondCardQuery;
    expect(cardQueryCount).toBe(2);

    // verify columns order after applying the filter
    headerCells = page.getByTestId("header-cell");
    await expect(headerCells.nth(0)).toHaveText("ID");
    await expect(headerCells.nth(1)).toHaveText("Created At");
    await expect(headerCells.nth(2)).toHaveText("Quantity");
  });
});

test.describe("issue 42697", () => {
  const PIVOT_QUESTION = {
    display: "pivot",
    query: {
      "source-table": ORDERS_ID,
      aggregation: [
        ["count"],
        ["sum", ["field", ORDERS.TOTAL, { "base-type": "type/Float" }]],
      ],
      breakout: [
        [
          "field",
          PEOPLE.STATE,
          { "base-type": "type/Text", "source-field": ORDERS.USER_ID },
        ],
        [
          "field",
          ORDERS.CREATED_AT,
          { "base-type": "type/DateTime", "temporal-unit": "year" },
        ],
      ],
    },
    visualization_settings: {
      "pivot_table.column_split": {
        rows: ["CREATED_AT"],
        columns: ["STATE"],
        values: ["count", "sum"],
      },
      "pivot_table.column_widths": {
        leftHeaderWidths: [156],
        totalLeftHeaderWidths: 156,
        valueHeaderWidths: {},
      },
    },
  };

  test.beforeEach(async ({ mb }) => {
    await mb.restore();
    await mb.signInAsNormalUser();
  });

  test("should display a pivot table when a new breakout is added to the query (metabase#42697)", async ({
    page,
    mb,
  }) => {
    const { id } = await createVizQuestion(mb.api, PIVOT_QUESTION);
    await visitQuestion(page, id);
    await openNotebook(page);
    await getNotebookStep(page, "summarize")
      .getByTestId("breakout-step")
      .locator(".Icon-add")
      .click();
    await popover(page).getByText("Product", { exact: true }).click();
    await popover(page).getByText("Category", { exact: true }).click();

    const updateCard = page.waitForResponse(
      (response) =>
        response.request().method() === "PUT" &&
        /\/api\/card\/\d+$/.test(new URL(response.url()).pathname),
    );
    await queryBuilderHeader(page).getByText("Save", { exact: true }).click();
    await modal(page).getByRole("button", { name: "Save", exact: true }).click();
    await updateCard;

    await page.getByRole("button", { name: "Visualize", exact: true }).click();
    await expect(
      page.getByTestId("pivot-table").getByText("Product → Category"),
    ).toBeVisible();
  });
});

test.describe("issue 7884", () => {
  const oldSourceQuestionDetails = {
    native: {
      query: "SELECT 1 AS C1, 2 AS C2, 3 AS C3",
    },
  };

  const newSourceQuestionDetails = {
    native: {
      query: "SELECT 1 AS C1, 3 AS C3",
    },
  };

  const getNestedQuestionDetails = (sourceQuestionId: number) => ({
    query: {
      "source-table": `card__${sourceQuestionId}`,
    },
    display: "table",
    visualization_settings: {
      "table.columns": [
        { name: "C3", enabled: true },
        { name: "C1", enabled: true },
        { name: "C2", enabled: true },
      ],
    },
  });

  test.beforeEach(async ({ mb }) => {
    await mb.restore();
    await mb.signInAsNormalUser();
  });

  test("should not reset the column order after one of the columns is removed from data source (metabase#7884)", async ({
    page,
    mb,
  }) => {
    const sourceQuestion = await createNativeCard(mb.api, oldSourceQuestionDetails);
    const nestedQuestion = await createVizQuestion(
      mb.api,
      getNestedQuestionDetails(sourceQuestion.id),
    );
    await mb.api.put(`/api/card/${sourceQuestion.id}`, {
      dataset_query: {
        type: "native",
        database: SAMPLE_DB_ID,
        native: newSourceQuestionDetails.native,
      },
    });
    await visitQuestion(page, nestedQuestion.id);

    // verify column order in the table
    const headerCells = page.getByTestId("header-cell");
    await expect(headerCells.nth(0)).toContainText("C3");
    await expect(headerCells.nth(1)).toContainText("C1");

    // verify column order in viz settings
    await openVizSettingsSidebar(page);
    await expect(getDraggableElements(page).nth(0)).toContainText("C3");
    await expect(getDraggableElements(page).nth(1)).toContainText("C1");
  });
});

test.describe("issue 45481", () => {
  test.beforeEach(async ({ mb }) => {
    await mb.restore();
    await mb.signInAsNormalUser();
  });

  test("should not crash when the table viz gets automatically pivoted (metabase#45481)", async ({
    page,
  }) => {
    await openTableNotebook(page, ORDERS_ID);
    await summarizeNotebook(page);
    await popover(page).getByText("Count of rows", { exact: true }).click();
    await getNotebookStep(page, "summarize")
      .getByText("Pick a column to group by", { exact: true })
      .click();
    await popover(page).getByText("User ID", { exact: true }).click();
    await getNotebookStep(page, "summarize")
      .getByTestId("breakout-step")
      .locator(".Icon-add")
      .click();
    await popover(page).getByText("Product", { exact: true }).click();
    await popover(page).getByText("Category", { exact: true }).click();
    await visualize(page);
    await expect(tableInteractive(page)).toBeVisible();
  });
});

test.describe("issue 12368", () => {
  const questionDetails = {
    type: "question",
    query: {
      "source-table": PRODUCTS_ID,
      aggregation: [["count"]],
      breakout: [
        ["field", PRODUCTS.VENDOR, { "base-type": "type/Text" }],
        ["field", PRODUCTS.CATEGORY, { "base-type": "type/Text" }],
      ],
    },
    visualization_settings: {
      "table.pivot": true,
      "table.pivot_column": "CATEGORY",
      "table.cell_column": "count",
      column_settings: {
        [`["ref",["field",${PRODUCTS.VENDOR},null]]`]: {
          column_title: "Vendor2",
        },
      },
    },
  };

  test.beforeEach(async ({ mb }) => {
    await mb.restore();
    await mb.signInAsNormalUser();
  });

  test("should clear pivot settings when doing underlying records drill from a pivot table (metabase#12368)", async ({
    page,
    mb,
  }) => {
    // drill thru from a pivot table
    const { id } = await createVizQuestion(mb.api, questionDetails);
    await visitQuestion(page, id);
    await page.getByTestId("cell-data").filter({ hasText: "1" }).first().click();
    await popover(page).getByText("See this Product", { exact: true }).click();

    // pivot flag should be cleared but other viz settings are preserved
    await expect(tableInteractive(page).getByText("Ean", { exact: true })).toBeVisible();
    await expect(
      tableInteractive(page).getByText("Vendor2", { exact: true }),
    ).toBeVisible();
    await openVizSettingsSidebar(page);
    const chartSettings = page.getByTestId("chartsettings-sidebar");
    await expect(
      chartSettings.getByRole("button", { name: "Add or remove columns" }),
    ).toBeVisible();
    await expect(
      chartSettings.getByText("Pivot column", { exact: true }),
    ).toHaveCount(0);
    await expect(
      chartSettings.getByText("Cell column", { exact: true }),
    ).toHaveCount(0);
  });
});

test.describe("issue 32718", () => {
  const questionDetails = {
    display: "table",
    query: {
      "source-table": PRODUCTS_ID,
      fields: [
        ["field", PRODUCTS.ID, { "base-type": "type/BigInteger" }],
        ["field", PRODUCTS.EAN, { "base-type": "type/Text" }],
        ["field", PRODUCTS.CATEGORY, { "base-type": "type/Text" }],
        ["field", PRODUCTS.CREATED_AT, { "base-type": "type/DateTime" }],
      ],
      limit: 1,
    },
    visualization_settings: {
      "table.columns": [
        { name: "ID", enabled: true },
        { name: "EAN", enabled: false },
        { name: "CATEGORY", enabled: true },
        { name: "CREATED_AT", enabled: true },
      ],
    },
  };

  test.beforeEach(async ({ mb }) => {
    await mb.restore();
    await mb.signInAsAdmin();
    await mb.api.put(`/api/field/${PRODUCTS.CATEGORY}`, {
      visibility_type: "details-only",
    });
  });

  test("should honor visibility_type of the field when the question has viz settings (metabase#32718)", async ({
    page,
    mb,
  }) => {
    const { id } = await createVizQuestion(mb.api, questionDetails);
    await visitQuestion(page, id);
    await expect(tableInteractive(page).getByText("ID", { exact: true })).toBeVisible();
    await expect(tableInteractive(page).getByText("Ean", { exact: true })).toHaveCount(0);
    await expect(
      tableInteractive(page).getByText("Category", { exact: true }),
    ).toHaveCount(0);
    await expect(
      tableInteractive(page).getByText("Created At", { exact: true }),
    ).toBeVisible();

    await openVizTypeSidebar(page);
    await page.getByTestId("Detail-button").click();
    const objectDetail = page.getByTestId("object-detail");
    await expect(objectDetail.getByText("ID", { exact: true })).toBeVisible();
    await expect(objectDetail.getByText("Ean", { exact: true })).toHaveCount(0);
    await expect(objectDetail.getByText("Category", { exact: true })).toBeVisible();
    await expect(objectDetail.getByText("Created At", { exact: true })).toBeVisible();
  });
});

test.describe("issue 50346", () => {
  const questionDetails = {
    query: {
      "source-table": ORDERS_ID,
      aggregation: [
        ["count"],
        ["sum", ["field", ORDERS.TOTAL, { "base-type": "type/Float" }]],
      ],
      breakout: [
        [
          "field",
          PRODUCTS.CATEGORY,
          { "base-type": "type/Text", "source-field": ORDERS.PRODUCT_ID },
        ],
        [
          "field",
          PRODUCTS.VENDOR,
          { "base-type": "type/Text", "source-field": ORDERS.PRODUCT_ID },
        ],
        [
          "field",
          PEOPLE.SOURCE,
          { "base-type": "type/Text", "source-field": ORDERS.USER_ID },
        ],
      ],
    },
    display: "pivot",
    visualization_settings: {
      "pivot_table.column_split": {
        // mix field refs with and without `base-type` to make sure we support both cases
        rows: [
          ["field", PRODUCTS.CATEGORY, { "source-field": ORDERS.PRODUCT_ID }],
          [
            "field",
            PRODUCTS.VENDOR,
            { "base-type": "type/Text", "source-field": ORDERS.PRODUCT_ID },
          ],
          [
            "field",
            PEOPLE.SOURCE,
            { "base-type": "type/Text", "source-field": ORDERS.USER_ID },
          ],
        ],
        columns: [],
        values: [
          ["aggregation", 0],
          ["aggregation", 1],
        ],
      },
      "pivot_table.column_widths": {
        leftHeaderWidths: [150, 214, 120],
        totalLeftHeaderWidths: 484,
        valueHeaderWidths: {},
      },
    },
  };

  const groupValue = "Annetta Wyman and Sons";
  const totalValue = "1,217.76";

  test.beforeEach(async ({ mb }) => {
    await mb.restore();
    await mb.signInAsNormalUser();
  });

  test("should be able to collapse rows for questions with legacy pivot settings (metabase#50346)", async ({
    page,
    mb,
  }) => {
    const { id } = await createVizQuestion(mb.api, questionDetails);
    await visitQuestion(page, id);

    // collapse one of the sections
    const pivotTable = page.getByTestId("pivot-table");
    await expect(pivotTable.getByText(totalValue, { exact: true })).toBeVisible();
    await pivotTable.getByTestId(`${groupValue}-toggle-button`).click();
    await expect(pivotTable.getByText(totalValue, { exact: true })).toHaveCount(0);

    // save and make sure the setting is preserved on reload
    const updateCard = page.waitForResponse(
      (response) =>
        response.request().method() === "PUT" &&
        /\/api\/card\/\d+$/.test(new URL(response.url()).pathname),
    );
    await queryBuilderHeader(page).getByRole("button", { name: "Save", exact: true }).click();
    await modal(page).getByRole("button", { name: "Save", exact: true }).click();
    await updateCard;
    await visitQuestion(page, id);
    await expect(
      page.getByTestId("pivot-table").getByText(totalValue, { exact: true }),
    ).toHaveCount(0);

    // expand the section
    await page
      .getByTestId("pivot-table")
      .getByTestId(`${groupValue}-toggle-button`)
      .click();
    await expect(
      page.getByTestId("pivot-table").getByText(totalValue, { exact: true }),
    ).toBeVisible();
  });
});

test.describe("issue 50686", () => {
  const questionDetails = {
    name: "50686",
    display: "smartscalar",
    native: {
      query: "select 100 as total, 110 as forecast, 80 as last_year, now() as now",
    },
  };

  test.beforeEach(async ({ mb }) => {
    await mb.restore();
    await mb.signInAsAdmin();
  });

  test("should allow selecting more than 1 comparison (metabase#50686)", async ({
    page,
    mb,
  }) => {
    const { id } = await createNativeVizQuestion(mb.api, questionDetails);
    await visitQuestion(page, id);
    // Default comparison
    await expect(queryBuilderMain(page).getByText("N/A")).toBeVisible();

    // Add another comparison
    await openVizSettingsSidebar(page);
    await page.getByRole("button", { name: "Add comparison" }).click();
    await popover(page).getByText("Value from another column…", { exact: true }).click();
    await popover(page).getByText("FORECAST", { exact: true }).click();
    await popover(page).getByRole("button", { name: "Done" }).click();

    // First comparison still exists
    await expect(queryBuilderMain(page).getByText("N/A")).toBeVisible();
    // New comparison has been added
    await expect(queryBuilderMain(page).getByText("9.09%")).toBeVisible();
    await expect(queryBuilderMain(page).getByText("vs. FORECAST")).toBeVisible();
  });
});

test.describe("issue 52339", () => {
  test.beforeEach(async ({ mb }) => {
    await mb.restore();
    await mb.signInAsAdmin();
  });

  test("should allow mapping pivot table dashcard fields to click behavior targets (metabase#52339)", async ({
    page,
    mb,
  }) => {
    const questionDetails = {
      name: "Orders, Distinct values of ID, Grouped by Product → Title and Created At (month) and User → ID",

      query: {
        "source-table": ORDERS_ID,
        aggregation: [["distinct", ["field", ORDERS.ID, null]]],
        breakout: [
          ["field", PRODUCTS.TITLE, { "source-field": ORDERS.PRODUCT_ID }],
          ["field", PEOPLE.SOURCE, { "source-field": ORDERS.USER_ID }],
        ],
      },
      display: "pivot",
      visualization_settings: {
        "pivot_table.column_split": {
          rows: ["TITLE", "SOURCE"],
          columns: [],
          values: ["distinct"],
        },
      },
    };

    const sourceParam = {
      name: "Source",
      slug: "filter-text",
      id: "1b9cd9f1",
      type: "string/=",
      sectionId: "string",
    };

    const {
      questionId,
      dashboardId,
      dashcards: [{ id: dashcardId, card_id }],
    } = await mb.api.createQuestionAndDashboard({
      dashboardDetails: {
        parameters: [sourceParam],
      } as never,
      questionDetails,
      cardDetails: {
        size_x: 16,
        size_y: 8,
      },
    });
    void questionId;

    await mb.api.put(`/api/dashboard/${dashboardId}`, {
      dashcards: [
        {
          id: dashcardId,
          card_id,
          row: 0,
          col: 0,
          size_x: 16,
          size_y: 8,
          series: [],
          visualization_settings: {},
          parameter_mappings: [
            {
              parameter_id: sourceParam.id,
              card_id,
              target: [
                "dimension",
                ["field", PEOPLE.SOURCE, { "source-field": ORDERS.USER_ID }],
              ],
            },
          ],
        },
      ],
    });

    await visitDashboard(page, mb.api, dashboardId);

    await editDashboard(page);
    const card = getDashboardCard(page, 0);
    await card.scrollIntoViewIfNeeded();
    await card.hover();
    await card.getByLabel("Click behavior").click();

    await sidebar(page).getByText("Go to a custom destination", { exact: true }).click();
    await sidebar(page).getByText("Dashboard", { exact: true }).click();

    await modal(page).getByText("Test Dashboard", { exact: true }).click();

    await page.getByTestId("click-mappings").getByText("Source", { exact: true }).click();

    await expect(popover(page).getByText("Product → Title")).toBeVisible();
    await expect(popover(page).getByText("User → Source")).toBeVisible();
    await expect(popover(page).getByText("Distinct values of ID")).toBeVisible();
  });
});

test.describe("issue 56771", () => {
  test.beforeEach(async ({ mb }) => {
    await mb.restore();
    await mb.signInAsAdmin();
  });

  test("should apply correct column widths after changing query (metabase#56771)", async ({
    page,
  }) => {
    await openOrdersTable(page);
    // Resize a column first to make width stored in the visualization settings
    await resizeTableColumn(page, "ID", 100);

    await openNotebook(page);
    await join(page);
    await joinTable(page, "Products");
    await visualize(page);

    await page.waitForTimeout(100); // wait for the column to be resized

    // The table may render the header cell twice (a zero-width measurement clone
    // plus the real cell); take the widest match — the rendered column width the
    // test is about. Poll: the width settles a beat after visualize (a one-shot
    // read can catch it mid-render at 0).
    const headerCells = page
      .getByTestId("header-cell")
      .filter({ hasText: "Products → Category" });
    await expect(headerCells.first()).toBeVisible();
    await expect
      .poll(async () => {
        const widths = await headerCells.evaluateAll((els) =>
          els.map((el) => el.getBoundingClientRect().width),
        );
        return widths.length ? Math.max(...widths) : 0;
      })
      .toBeGreaterThan(160);
  });
});

test.describe("issue 52333", () => {
  const baseQuery = `
SELECT *
FROM (
  SELECT
    category,
    source,
    state,
    SUM(orders.discount) AS discount,
    SUM(orders.total) AS total,
    SUM(orders.quantity) AS quantity
  FROM
    orders
    LEFT JOIN products ON orders.product_id = products.id
    LEFT JOIN people ON orders.user_id = people.id
  GROUP BY category, source, state
) AS filtered_orders
WHERE NOT (
  category = 'Gizmo'
  AND (
    source IN ('Facebook', 'Google', 'Organic', 'Twitter')
    OR state NOT IN ('AK')
  )
);`;

  const baseQuestionDetails = {
    name: "52333",
    display: "table",
    native: {
      query: baseQuery,
    },
  };

  test.beforeEach(async ({ mb }) => {
    await mb.restore();
    await mb.signInAsAdmin();
  });

  test("pivot table should show subtotals for a group of a single value (metabase#52333)", async ({
    page,
    mb,
  }) => {
    const baseQuestion = await createNativeCard(mb.api, baseQuestionDetails);

    const questionDetails = {
      query: {
        "source-table": `card__${baseQuestion.id}`,
        aggregation: [["count"]],
        breakout: [
          ["field", "CATEGORY", { "base-type": "type/Text" }],
          ["field", "SOURCE", { "base-type": "type/Text" }],
          ["field", "STATE", { "base-type": "type/Text" }],
        ],
      },
      display: "pivot",
      visualization_settings: {
        "pivot_table.column_split": {
          rows: ["CATEGORY", "SOURCE", "STATE"],
          columns: [],
          values: ["count", "avg"],
        },
        "pivot_table.column_widths": {
          leftHeaderWidths: [104, 92, 80],
          totalLeftHeaderWidths: 276,
          valueHeaderWidths: {},
        },
        "pivot_table.collapsed_rows": {
          value: ['["Doohickey"]', '["Gadget"]', '["Widget"]'],
          rows: ["CATEGORY", "SOURCE", "STATE"],
        },
      },
    };

    const { id } = await createVizQuestion(mb.api, questionDetails);
    await visitQuestion(page, id);

    await expect(queryBuilderMain(page).getByText("Affiliate")).toBeVisible();
    await expect(queryBuilderMain(page).getByText("AK")).toBeVisible();

    // Ensure it does not show subtotals for the single value by default
    await expect(
      queryBuilderMain(page).getByText("Totals for Affiliate"),
    ).toHaveCount(0);

    await openVizSettingsSidebar(page);

    await sidebar(page).getByText("Condense duplicate totals", { exact: true }).click();

    // Ensure it shows subtotals for the single value
    await expect(
      queryBuilderMain(page).getByText("Totals for Affiliate"),
    ).toBeVisible();
  });
});

test.describe("issue 55673", () => {
  test.beforeEach(async ({ mb, page }) => {
    await mb.restore();
    await mb.signInAsNormalUser();
    await openOrdersTable(page);
  });

  test("should be able to close a header popover using Escape (metabase#55673)", async ({
    page,
  }) => {
    await tableHeaderClick(page, "Product ID");
    await expect(page.getByTestId("click-actions-view")).toBeVisible();

    await expect(
      page.getByTestId("click-actions-sort-control-sort.ascending"),
    ).toBeFocused();
    // Park the mouse away from the header so a hover-tooltip can't swallow the
    // Escape before the popover's window-level handler sees it.
    await page.mouse.move(0, 0);
    await page.keyboard.press("Escape");
    await expect(page.getByTestId("click-actions-view")).toHaveCount(0);
  });
});

test.describe("issue 63745", () => {
  test.beforeEach(async ({ mb }) => {
    await mb.restore();
    await mb.signInAsAdmin();
  });

  test("should display correct data when toggling columns (metabase#63745)", async ({
    page,
  }) => {
    await visitAdhoc(page, {
      name: "63745",
      display: "object",
      dataset_query: {
        type: "query",
        database: SAMPLE_DB_ID,
        query: {
          "source-table": ORDERS_ID,
          limit: 5,
        },
      },
    });

    await openVizSettingsSidebar(page);
    await page
      .getByTestId("chartsettings-sidebar")
      .getByRole("button", { name: "Add or remove columns" })
      .click();

    await expectUserIdCellIsOne(page);

    await page
      .getByTestId("orders-table-columns")
      .getByLabel("ID", { exact: true })
      .click();

    await expectUserIdCellIsOne(page);
  });
});

async function expectUserIdCellIsOne(page: Page) {
  await expect(async () => {
    const cells = page.getByTestId("object-details-table-cell");
    const texts = await cells.allTextContents();
    const map = new Map<string, string>();
    for (let i = 0; i + 1 < texts.length; i += 2) {
      map.set(texts[i], texts[i + 1]);
    }
    expect(map.get("User ID")).toBe("1");
  }).toPass();
}

test.describe("issue 56094", () => {
  test.beforeEach(async ({ mb }) => {
    await mb.restore();
    await mb.signInAsAdmin();
  });

  test("should allow to switch between automatic pivot table and usual table visualization (metabase#56094)", async ({
    page,
  }) => {
    await visitAdhoc(page, {
      name: "56094",
      dataset_query: {
        type: "query",
        database: SAMPLE_DB_ID,
        query: {
          "source-table": PRODUCTS_ID,
          aggregation: [["count"]],
          breakout: [
            ["field", PRODUCTS.CATEGORY, { "base-type": "type/Text" }],
            ["field", PRODUCTS.RATING, { binning: { strategy: "default" } }],
          ],
          limit: 20,
        },
      },
    });

    // The SegmentedControl marks both options `disabled` and toggles via the
    // root onClick, so the label is a disabled descendant — force the click
    // (the app's intent; Cypress clicks through it too).
    await queryBuilderFooter(page)
      .getByLabel("Switch to data")
      .click({ force: true });

    await expect(queryBuilderFooterDisplayToggle(page)).toBeVisible();

    await queryBuilderFooter(page)
      .getByLabel("Switch to visualization")
      .click({ force: true });

    await expect(queryBuilderFooterDisplayToggle(page)).toBeVisible();
  });
});

test.describe("issue 57685", () => {
  test.beforeEach(async ({ mb, page }) => {
    await mb.restore();
    await mb.signInAsNormalUser();
    const { id } = await createNativeCard(mb.api, {
      display: "table",
      native: {
        query: 'SELECT id as "" FROM PRODUCTS',
      },
    });
    await visitQuestion(page, id);
  });

  test("should handle empty column names without error (metabase#57685)", async ({
    page,
  }) => {
    await expect(
      icon(page.getByTestId("visualization-root"), "warning"),
    ).toHaveCount(0);

    await page
      .getByTestId("qb-header-action-panel")
      .getByText("Explore results", { exact: true })
      .click();

    await expect(tableInteractive(page)).toBeVisible();
  });
});
