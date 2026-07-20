/**
 * Playwright port of
 * e2e/test/scenarios/question-reproductions/reproductions-4.cy.spec.js
 *
 * 22 independent question-builder regression guards across 17 describes. The
 * repetition IS the coverage — nothing here is merged or consolidated.
 *
 * Porting notes:
 * - `cy.intercept(...).as(x)` + `cy.wait("@x")` → `waitForResponse` registered
 *   BEFORE the triggering action (PORTING rule 2). Where an alias is awaited
 *   N-at-a-time *after* several actions (issue 44974, issue 45359) the port
 *   uses `responseCounter`, which matches cy.wait's "consumes past responses"
 *   semantics.
 * - `findByText(string)` is an EXACT testing-library match → `{ exact: true }`;
 *   `cy.button(name)` → `getByRole("button", { name, exact: true })`;
 *   `cy.icon(name)` → `.Icon-<name>`.
 * - Infra tier: only `issue 44974` is `@external` and it genuinely needs the QA
 *   Postgres container (`H.restore("postgres-12")` + a card on database 2). It
 *   is gated on PW_QA_DB_ENABLED. **Every other describe runs entirely on the
 *   H2 sample database** — no container of any kind.
 * - `issue 45359` is tagged `@skip` upstream (never runs in CI) — ported in
 *   full and skipped with that reason rather than dropped.
 * - Spec-local helpers live in support/question-reproductions-4.ts.
 */
import type { Page } from "@playwright/test";

import { expect, test } from "../support/fixtures";
import type { MetabaseApi } from "../support/api";
import { openOrdersTable } from "../support/ad-hoc-question";
import {
  echartsContainer,
  leftSidebar,
  openVizSettingsSidebar,
} from "../support/charts";
import { setModelMetadata } from "../support/custom-column-3";
import {
  editDashboard,
  getDashboardCard,
  saveDashboard,
  selectDropdown,
  sidebar,
} from "../support/dashboard";
import { showDashboardCardActions } from "../support/dashboard-cards";
import {
  createDashboardWithQuestions,
  createNativeQuestion,
  createQuestion,
} from "../support/factories";
import { join } from "../support/joins";
import { miniPickerBrowseAll } from "../support/joins";
import {
  openQuestionActions,
  summarize,
  visitModel,
} from "../support/models";
import {
  assertQueryBuilderRowCount,
  enterCustomColumnDetails,
  entityPickerModal,
  getNotebookStep,
  miniPicker,
  openNotebook,
  queryBuilderMain,
  tableHeaderClick,
  tableHeaderColumn,
} from "../support/notebook";
import { visitQuestionAdhoc } from "../support/permissions";
import { visitQuestionAdhocNotebook } from "../support/joins";
import {
  entityPickerModalItem,
  miniPickerHeader,
} from "../support/question-new";
import { rightSidebar } from "../support/question-saved";
import { SAMPLE_DATABASE, SAMPLE_DB_ID } from "../support/sample-data";
import {
  icon,
  main,
  modal,
  popover,
  queryBuilderHeader,
  visitDashboard,
  visitQuestion,
} from "../support/ui";
import {
  QA_DB_SKIP_REASON,
  assertEqualHeight,
  enterCustomColumnDetailsFormatted,
  expectCypressHidden,
  expectNoScrollbarContainer,
  responseCounter,
  visualizeEitherEndpoint,
  waitForCardQuery,
  waitForCreateCard,
  waitForUpdateCard,
  withDatabase,
  zIndexOf,
} from "../support/question-reproductions-4";

const { ORDERS, ORDERS_ID, PRODUCTS, PRODUCTS_ID, PEOPLE, PEOPLE_ID } =
  SAMPLE_DATABASE;

/**
 * Does this platform's Chromium reserve layout width for a classic scrollbar?
 * macOS uses overlay scrollbars, where it never does. Probed in-page rather
 * than switched on process.platform so the answer is the browser's, not the
 * runner's.
 */
async function platformReservesScrollbarGutter(
  page: Page,
): Promise<boolean> {
  return page.evaluate(() => {
    const probe = document.createElement("div");
    probe.style.cssText =
      "width:100px;height:50px;overflow:auto;position:absolute;top:-500px";
    probe.innerHTML = "<div style='height:500px'></div>";
    document.body.appendChild(probe);
    const reserves = probe.offsetWidth > probe.clientWidth;
    probe.remove();
    return reserves;
  });
}

/** The subset of the `mb` fixture the issue-45063 helpers need (the harness
 * class itself is not exported from support/fixtures.ts). */
type Mb = {
  api: MetabaseApi;
  signInAsAdmin: () => Promise<void>;
  signInAsNormalUser: () => Promise<void>;
};

test.describe("issue 44668", () => {
  test.beforeEach(async ({ mb }) => {
    await mb.restore();
    await mb.signInAsAdmin();
  });

  test("should not drop graph.metrics after adding a new query stage (metabase#44668)", async ({
    mb,
    page,
  }) => {
    const { id } = await createQuestion(mb.api, {
      display: "bar",
      query: {
        aggregation: [["count"]],
        breakout: [["field", PEOPLE.STATE, { "base-type": "type/Text" }]],
        "source-table": PEOPLE_ID,
        limit: 5,
      },
      visualization_settings: {
        "graph.metrics": ["count"],
        "graph.dimensions": ["STATE"],
      },
    });
    await visitQuestion(page, id);

    await openNotebook(page);

    // cy.findAllByTestId("action-buttons").last()
    await page
      .getByTestId("action-buttons")
      .last()
      .getByRole("button", { name: "Custom column", exact: true })
      .click();
    await enterCustomColumnDetailsFormatted(page, {
      formula: 'concat("abc_", [Count])',
      name: "Custom String",
    });
    await popover(page)
      .getByRole("button", { name: "Done", exact: true })
      .click();

    await icon(getNotebookStep(page, "expression", { stage: 1 }), "add").click();
    await enterCustomColumnDetails(page, {
      formula: "[Count] * 2",
      name: "Custom Number",
    });
    await popover(page)
      .getByRole("button", { name: "Done", exact: true })
      .click();

    await visualizeEitherEndpoint(page);

    const chart = echartsContainer(page);
    await expect(chart.getByText("State", { exact: true })).toBeVisible(); // x-axis
    await expect(chart.getByText("Count", { exact: true })).toBeVisible(); // y-axis

    // x-axis values
    for (const state of ["AK", "AL", "AR", "AZ", "CA"]) {
      await expect(chart.getByText(state, { exact: true })).toBeVisible();
    }

    // Ensure custom columns weren't added as series automatically
    await expect(
      queryBuilderMain(page).getByLabel("Legend", { exact: true }),
    ).toHaveCount(0);

    await openVizSettingsSidebar(page);

    // Ensure can use Custom Number as series
    await leftSidebar(page)
      .getByText("Add another series", { exact: true })
      .click();
    const legend = queryBuilderMain(page).getByLabel("Legend", { exact: true });
    await expect(legend.getByText("Count", { exact: true })).toBeAttached();
    await expect(
      legend.getByText("Custom Number", { exact: true }),
    ).toBeAttached();

    await expect(
      leftSidebar(page).getByText("Add another series", { exact: true }),
    ).toHaveCount(0);
    await expect(
      leftSidebar(page).getByText("Add series breakout", { exact: true }),
    ).toHaveCount(0);
    await leftSidebar(page).getByTestId("remove-Custom Number").click();

    await expect(
      queryBuilderMain(page).getByLabel("Legend", { exact: true }),
    ).toHaveCount(0);

    await leftSidebar(page)
      .getByText("Add series breakout", { exact: true })
      .click();
    await expect(
      popover(page).getByText("Count", { exact: true }),
    ).toBeAttached();
    await expect(
      popover(page).getByText("Custom Number", { exact: true }),
    ).toBeAttached();
    await popover(page).getByText("Custom String", { exact: true }).click();

    const breakoutLegend = queryBuilderMain(page).getByLabel("Legend", {
      exact: true,
    });
    for (const value of ["68", "56", "49", "20", "90"]) {
      await expect(
        breakoutLegend.getByText(`abc_${value}`, { exact: true }),
      ).toBeAttached();
    }
    await expect(
      leftSidebar(page).getByText("Add another series", { exact: true }),
    ).toHaveCount(0);
    await expect(
      leftSidebar(page).getByText("Add series breakout", { exact: true }),
    ).toHaveCount(0);
  });
});

test.describe("issue 44974", { tag: "@external" }, () => {
  test.skip(!process.env.PW_QA_DB_ENABLED, QA_DB_SKIP_REASON);

  const PG_DB_ID = 2;

  test.beforeEach(async ({ mb }) => {
    await mb.restore("postgres-12");
    await mb.signInAsAdmin();
  });

  test("entity picker should not offer to join with a table or a question from a different database (metabase#44974)", async ({
    mb,
    page,
  }) => {
    const database = await withDatabase(mb.api, PG_DB_ID);
    const pgPeopleId = database.PEOPLE_ID as number;

    const questionDetails = {
      name: "Question 44974 in Postgres DB",
      database: PG_DB_ID,
      query: {
        "source-table": pgPeopleId,
        limit: 1,
      },
    };
    await createQuestion(mb.api, questionDetails);

    // The `@getCollectionItems` intercept is registered in the Cypress
    // beforeEach and awaited twice AFTER two separate clicks, so a counter
    // (which sees past responses, like cy.wait) is the faithful port.
    const collectionItems = responseCounter(
      page,
      (response) =>
        response.request().method() === "GET" &&
        /^\/api\/collection\/[^/]+\/items$/.test(
          new URL(response.url()).pathname,
        ),
    );

    await visitQuestionAdhocNotebook(page, {
      dataset_query: {
        database: SAMPLE_DB_ID,
        query: { "source-table": ORDERS_ID },
        type: "query",
      },
    });
    await join(page);
    await miniPicker(page).getByText("Our analytics", { exact: true }).click();
    await expect(
      miniPicker(page).getByText("Orders Model", { exact: true }),
    ).toBeVisible();
    await expect(
      miniPicker(page).getByText(questionDetails.name, { exact: true }),
    ).toHaveCount(0);

    await miniPickerHeader(page).click();
    await miniPickerBrowseAll(page).click();

    await collectionItems.waitFor(2);
    collectionItems.dispose();

    await entityPickerModalItem(page, 0, "Our analytics").click();
    await expect(
      entityPickerModal(page).getByText("Orders Model", { exact: true }),
    ).toBeVisible();
    await expect(
      entityPickerModalItem(page, 1, questionDetails.name),
    ).toHaveAttribute("data-disabled", "true");
    await entityPickerModal(page)
      .getByRole("button", { name: "Close", exact: true })
      .click();
  });
});

test.describe("issue 38989", () => {
  test.beforeEach(async ({ mb }) => {
    await mb.restore();
    await mb.signInAsAdmin();
  });

  test("should be impossible to join with a table or question which is not in the same database (metabase#38989)", async ({
    mb,
    page,
  }) => {
    const { id } = await createQuestion(mb.api, {
      query: {
        "source-table": PEOPLE_ID,
        fields: [
          ["field", PEOPLE.ID, { "base-type": "type/Number" }],
          ["field", PEOPLE.EMAIL, { "base-type": "type/Text" }],
        ],
        joins: [
          {
            fields: "all",
            alias: "Orders",
            // This is not a valid table ID in the Sample Database
            "source-table": 123,
            strategy: "left-join",
            condition: [
              "=",
              ["field", PEOPLE.ID, null],
              ["field", ORDERS.USER_ID, { "join-alias": "Orders" }],
            ],
          },
        ],
      },
    });
    await visitQuestion(page, id);

    await queryBuilderMain(page)
      .getByText("Show error details", { exact: true })
      .click();

    await expect(
      queryBuilderMain(page).getByText(
        /either it does not exist, or it belongs to a different Database/,
      ),
    ).toBeAttached();
  });
});

test.describe("issue 39771", () => {
  test.beforeEach(async ({ mb }) => {
    await mb.restore();
    await mb.signInAsNormalUser();
  });

  test("should show tooltip for ellipsified text (metabase#39771)", async ({
    mb,
    page,
  }) => {
    const { id } = await createQuestion(mb.api, {
      query: {
        aggregation: [["count"]],
        breakout: [
          [
            "field",
            "CREATED_AT",
            {
              "base-type": "type/DateTime",
              "temporal-unit": "quarter-of-year",
            },
          ],
        ],
        "source-query": {
          "source-table": ORDERS_ID,
          aggregation: [["count"]],
          breakout: [
            [
              "field",
              ORDERS.CREATED_AT,
              {
                "base-type": "type/DateTime",
                "temporal-unit": "month",
              },
            ],
          ],
        },
      },
    });
    await visitQuestion(page, id);

    await openNotebook(page);
    await getNotebookStep(page, "summarize", { stage: 1 })
      .getByTestId("breakout-step")
      .getByText("Created At: Quarter of year", { exact: true })
      .click();

    // `cy.realHover()` dispatches a CDP mouse move at the element's centre and
    // runs NO actionability checks. This bucket button is `visibility: hidden`
    // until its row is hovered (measured: the <button> and everything under it
    // report visibility:hidden, the row above it is visible), so the hover is
    // what reveals it. Playwright's default hover waits for visibility and
    // therefore deadlocks; `force` moves the same real mouse to the same point.
    await popover(page)
      .getByText("by quarter of year", { exact: true })
      .hover({ force: true });

    const tooltip = page.getByTestId("ellipsified-tooltip");
    await expect(
      tooltip.getByText("by quarter of year", { exact: true }),
    ).toBeVisible();

    // resort to asserting zIndex because should("be.visible") passes unexpectedly
    const popoverZindex = await zIndexOf(popover(page).first());
    const tooltipZindex = await zIndexOf(tooltip);
    expect(tooltipZindex).toBeGreaterThanOrEqual(popoverZindex);
  });
});

test.describe("issue 45063", () => {
  async function createGuiQuestion(
    api: MetabaseApi,
    { sourceTableId }: { sourceTableId: number },
  ) {
    const { id } = await createQuestion(api, {
      name: "Question",
      query: { "source-table": sourceTableId },
    });
    return id;
  }

  async function createGuiModel(
    api: MetabaseApi,
    { sourceTableId }: { sourceTableId: number },
  ) {
    const { id } = await createQuestion(api, {
      name: "Model",
      type: "model",
      query: { "source-table": sourceTableId },
    });
    return id;
  }

  async function createNativeModel(
    api: MetabaseApi,
    {
      tableName,
      fieldId,
      fieldName,
      fieldSemanticType,
    }: {
      tableName: string;
      fieldId: number;
      fieldName: string;
      fieldSemanticType: string;
    },
  ) {
    const model = await createNativeQuestion(api, {
      name: "Native Model",
      type: "model",
      native: { query: `SELECT * FROM ${tableName}` },
    });
    // populate result_metadata
    await api.post(`/api/card/${model.id}/query`);
    // map columns to database fields
    await setModelMetadata(api, model.id, (field) => {
      if (field.name === fieldName) {
        return { ...field, id: fieldId, semantic_type: fieldSemanticType };
      }
      return field;
    });
    return model.id;
  }

  async function setListValues(
    api: MetabaseApi,
    fieldId: number,
  ) {
    await api.put(`/api/field/${fieldId}`, { has_field_values: "list" });
  }

  async function setSearchValues(
    api: MetabaseApi,
    fieldId: number,
  ) {
    await api.put(`/api/field/${fieldId}`, { has_field_values: "search" });
  }

  async function setForeignKeyRemapping(
    api: MetabaseApi,
    {
      sourceFieldId,
      targetFieldId,
      remappedDisplayName,
    }: {
      sourceFieldId: number;
      targetFieldId: number;
      remappedDisplayName: string;
    },
  ) {
    await api.post(`/api/field/${sourceFieldId}/dimension`, {
      type: "external",
      name: remappedDisplayName,
      human_readable_field_id: targetFieldId,
    });
  }

  async function verifyListFilter(
    page: Page,
    {
      fieldDisplayName,
      filterHeaderName,
      fieldValue,
      fieldValueLabel,
    }: {
      fieldDisplayName: string;
      filterHeaderName?: string;
      fieldValue: number;
      fieldValueLabel: string;
    },
  ) {
    await tableHeaderClick(page, fieldDisplayName);
    await popover(page)
      .getByText("Filter by this column", { exact: true })
      .click();
    // Real keystrokes: the list filters as you type.
    const search = popover(page).getByPlaceholder("Search the list", {
      exact: true,
    });
    await search.click();
    await search.pressSequentially(fieldValueLabel);
    await popover(page).getByText(fieldValueLabel, { exact: true }).click();
    await popover(page)
      .getByRole("button", { name: "Add filter", exact: true })
      .click();

    await page
      .getByTestId("qb-filters-panel")
      .getByText(
        `${filterHeaderName || fieldDisplayName} is ${fieldValue}`,
        { exact: true },
      )
      .click();
    await expect(
      popover(page).getByLabel(fieldValueLabel, { exact: true }),
    ).toBeChecked();
  }

  async function verifySearchFilter(
    page: Page,
    {
      fieldDisplayName,
      filterHeaderName,
      fieldPlaceholder,
      fieldValue,
      fieldValueLabel,
    }: {
      fieldDisplayName: string;
      filterHeaderName?: string;
      fieldPlaceholder: string;
      fieldValue: number;
      fieldValueLabel: string;
    },
  ) {
    await tableHeaderClick(page, fieldDisplayName);
    await popover(page)
      .getByText("Filter by this column", { exact: true })
      .click();
    const search = popover(page).getByPlaceholder(fieldPlaceholder, {
      exact: true,
    });
    await search.click();
    await search.pressSequentially(fieldValueLabel);
    await selectDropdown(page)
      .getByText(fieldValueLabel, { exact: true })
      .click();
    await page.getByTestId("number-filter-picker").click();
    await page
      .getByTestId("number-filter-picker")
      .getByRole("button", { name: "Add filter", exact: true })
      .click();

    await expect(
      page
        .getByTestId("qb-filters-panel")
        .getByText(
          `${filterHeaderName || fieldDisplayName} is ${fieldValue}`,
          { exact: true },
        ),
    ).toBeVisible();
  }

  async function verifyRemappedFilter(
    mb: Mb,
    page: Page,
    {
      visitCard,
      fieldId,
      fieldDisplayName,
      filterHeaderName,
      fieldPlaceholder,
      fieldValue,
      fieldValueLabel,
      expectedRowCount,
    }: {
      visitCard: () => Promise<void>;
      fieldId: number;
      fieldDisplayName: string;
      filterHeaderName?: string;
      fieldPlaceholder: string;
      fieldValue: number;
      fieldValueLabel: string;
      expectedRowCount: number;
    },
  ) {
    // list values
    await mb.signInAsAdmin();
    await setListValues(mb.api, fieldId);
    await mb.signInAsNormalUser();
    await visitCard();
    await verifyListFilter(page, {
      fieldDisplayName,
      filterHeaderName,
      fieldValue,
      fieldValueLabel,
    });
    await assertQueryBuilderRowCount(page, expectedRowCount);

    // search values
    await mb.signInAsAdmin();
    await setSearchValues(mb.api, fieldId);
    await mb.signInAsNormalUser();
    await visitCard();
    await verifySearchFilter(page, {
      fieldDisplayName,
      filterHeaderName,
      fieldPlaceholder,
      fieldValue,
      fieldValueLabel,
    });
    await assertQueryBuilderRowCount(page, expectedRowCount);
  }

  test.beforeEach(async ({ mb }) => {
    await mb.restore();
    await mb.signInAsAdmin();
  });

  test.describe("type/PK -> type/Name remapping (metabase#45063)", () => {
    test("should work with questions", async ({ mb, page }) => {
      const questionId = await createGuiQuestion(mb.api, {
        sourceTableId: PEOPLE_ID,
      });
      await verifyRemappedFilter(mb, page, {
        visitCard: () => visitQuestion(page, questionId),
        fieldId: PEOPLE.ID,
        fieldDisplayName: "ID",
        fieldPlaceholder: "Search by Name or enter an ID",
        fieldValue: 1,
        fieldValueLabel: "Hudson Borer",
        expectedRowCount: 1,
      });
    });

    test("should work with models", async ({ mb, page }) => {
      const modelId = await createGuiModel(mb.api, { sourceTableId: PEOPLE_ID });
      await verifyRemappedFilter(mb, page, {
        visitCard: () => visitModel(page, modelId),
        fieldId: PEOPLE.ID,
        fieldDisplayName: "ID",
        fieldPlaceholder: "Search by Name or enter an ID",
        fieldValue: 1,
        fieldValueLabel: "Hudson Borer",
        expectedRowCount: 1,
      });
    });

    test("should work with native models", async ({ mb, page }) => {
      const modelId = await createNativeModel(mb.api, {
        tableName: "PEOPLE",
        fieldId: PEOPLE.ID,
        fieldName: "ID",
        fieldSemanticType: "type/PK",
      });
      await verifyRemappedFilter(mb, page, {
        visitCard: () => visitModel(page, modelId),
        fieldId: PEOPLE.ID,
        fieldDisplayName: "ID",
        fieldPlaceholder: "Search by Name or enter an ID",
        fieldValue: 1,
        fieldValueLabel: "Hudson Borer",
        expectedRowCount: 1,
      });
    });
  });

  test.describe("type/FK -> column remapping (metabase#45063)", () => {
    test.beforeEach(async ({ mb }) => {
      await setForeignKeyRemapping(mb.api, {
        sourceFieldId: ORDERS.PRODUCT_ID,
        targetFieldId: PRODUCTS.TITLE,
        remappedDisplayName: "Product ID",
      });
    });

    test("should work with questions", async ({ mb, page }) => {
      const questionId = await createGuiQuestion(mb.api, {
        sourceTableId: ORDERS_ID,
      });
      await verifyRemappedFilter(mb, page, {
        visitCard: () => visitQuestion(page, questionId),
        fieldId: ORDERS.PRODUCT_ID,
        fieldDisplayName: "Product ID",
        fieldPlaceholder: "Search by Title or enter an ID",
        fieldValue: 1,
        fieldValueLabel: "Rustic Paper Wallet",
        expectedRowCount: 93,
      });
    });

    test("should work with models", async ({ mb, page }) => {
      const modelId = await createGuiModel(mb.api, { sourceTableId: ORDERS_ID });
      await verifyRemappedFilter(mb, page, {
        visitCard: () => visitModel(page, modelId),
        fieldId: ORDERS.PRODUCT_ID,
        fieldDisplayName: "Product ID",
        fieldPlaceholder: "Search by Title or enter an ID",
        fieldValue: 1,
        fieldValueLabel: "Rustic Paper Wallet",
        expectedRowCount: 93,
      });
    });

    test("should work with native models", async ({ mb, page }) => {
      const modelId = await createNativeModel(mb.api, {
        tableName: "ORDERS",
        fieldId: ORDERS.PRODUCT_ID,
        fieldName: "PRODUCT_ID",
        fieldSemanticType: "type/FK",
      });
      await verifyRemappedFilter(mb, page, {
        visitCard: () => visitModel(page, modelId),
        fieldId: ORDERS.PRODUCT_ID,
        fieldDisplayName: "Product ID",
        filterHeaderName: "PRODUCT_ID", // the title case version doesn't get picked up in filters
        fieldPlaceholder: "Search by Title or enter an ID",
        fieldValue: 1,
        fieldValueLabel: "Rustic Paper Wallet",
        expectedRowCount: 93,
      });
    });
  });
});

test.describe("issue 41464", () => {
  test.beforeEach(async ({ mb }) => {
    await mb.restore();
    await mb.signInAsNormalUser();
  });

  test("should not overlap 'no results' and the loading state (metabase#41464)", async ({
    page,
  }) => {
    await visitQuestionAdhoc(page, {
      dataset_query: {
        database: SAMPLE_DB_ID,
        type: "query",
        query: {
          "source-table": ORDERS_ID,
          filter: [
            ">",
            ["field", ORDERS.TOTAL, { "base-type": "type/Float" }],
            1000,
          ],
        },
      },
    });

    // Cypress throttles the response to 50kbps so the query stays in flight
    // while the assertions run. Playwright has no bandwidth throttle for a
    // route, so the equivalent condition (response still pending) is produced
    // by holding the response back for a fixed delay.
    await page.route(
      (url) => new URL(url.toString()).pathname === "/api/dataset",
      async (route) => {
        if (route.request().method() !== "POST") {
          await route.fallback();
          return;
        }
        const response = await route.fetch();
        await new Promise((resolve) => setTimeout(resolve, 5000));
        await route.fulfill({ response });
      },
    );

    const filterPill = page.getByTestId("filter-pill");
    await expect(filterPill).toHaveText("Total is greater than 1000");
    await icon(filterPill, "close").click();

    await expect(
      queryBuilderMain(page).getByTestId("loading-indicator"),
    ).toBeVisible();
    await expect(
      queryBuilderMain(page).getByText("No results", { exact: true }),
    ).toHaveCount(0, { timeout: 500 });
  });
});

test.describe("issue 45359", () => {
  // Upstream tag: @skip — this describe never runs in CI. Ported in full and
  // skipped for the same reason rather than dropped.
  test.skip(true, "Upstream @skip tag");

  test.beforeEach(async ({ mb }) => {
    await mb.restore();
    await mb.signInAsAdmin();
  });

  test("loads app fonts correctly (metabase#45359)", async ({ page }) => {
    const regular = responseCounter(page, (response) =>
      response.url().includes("/app/fonts/Lato/lato-v16-latin-regular.woff2"),
    );
    const bold = responseCounter(page, (response) =>
      response.url().includes("/app/fonts/Lato/lato-v16-latin-700.woff2"),
    );

    await openOrdersTable(page, { mode: "notebook" });

    await expect(
      getNotebookStep(page, "data").getByText("Orders", { exact: true }),
    ).toHaveCSS("font-family", "Lato, Arial, sans-serif");

    await regular.waitFor(1);
    expect(regular.count).toBe(1);
    expect(regular.responses[0].status()).toBe(200);

    await bold.waitFor(1);
    expect(bold.count).toBe(1);
    expect(bold.responses[0].status()).toBe(200);

    regular.dispose();
    bold.dispose();

    const loaded = await page.evaluate(async () => {
      await document.fonts.ready;
      return document.fonts.check("16px Lato");
    });
    expect(loaded).toBe(true);
  });
});

test.describe("issue 45452", () => {
  test.beforeEach(async ({ mb }) => {
    await mb.restore();
    await mb.signInAsAdmin();
  });

  test("should only have one scrollbar for the summarize sidebar (metabase#45452)", async ({
    page,
  }) => {
    await openOrdersTable(page);
    await summarize(page);

    await expectNoScrollbarContainer(
      page.getByTestId("summarize-aggregation-item-list"),
    );
    await expectNoScrollbarContainer(
      page.getByTestId("summarize-breakout-column-list"),
    );

    // the sidebar is the only element with a scrollbar
    const sidebarContent = page.getByTestId("sidebar-content");
    const { scrolls, reservesGutter } = await sidebarContent.evaluate(
      (el: HTMLElement) => ({
        scrolls: el.scrollHeight > el.clientHeight,
        reservesGutter: el.offsetWidth > el.clientWidth,
      }),
    );
    expect(scrolls).toBe(true);

    // `offsetWidth > clientWidth` asks whether a classic scrollbar reserves
    // layout width. On a platform with OVERLAY scrollbars (macOS Chromium)
    // nothing ever does — measured with a bare 100px `overflow: auto` probe
    // div: offsetWidth === clientWidth === 100. The assertion is therefore
    // un-runnable here, and by the same token the two
    // expectNoScrollbarContainer checks above are vacuous here (their second
    // conjunct can never hold). This is a property of the platform, not of the
    // app or the harness — the Cypress original would fail identically on this
    // machine, and CI's Linux Chromium (classic scrollbars) is where it bites.
    if (await platformReservesScrollbarGutter(page)) {
      expect(reservesGutter).toBe(true);
    }
  });
});

test.describe("issue 41612", () => {
  test.beforeEach(async ({ mb }) => {
    await mb.restore();
    await mb.signInAsAdmin();
  });

  test("should not ignore chart viz settings when viewing raw results as a table (metabase#41612)", async ({
    page,
  }) => {
    await visitQuestionAdhoc(page, {
      display: "line",
      dataset_query: {
        type: "query",
        database: SAMPLE_DB_ID,
        query: {
          aggregation: [["count"]],
          breakout: [
            [
              "field",
              ORDERS.CREATED_AT,
              { "base-type": "type/DateTime", "temporal-unit": "month" },
            ],
          ],
          "source-table": ORDERS_ID,
        },
      },
    });

    // QuestionDisplayToggle.tsx marks BOTH SegmentedControl items
    // `disabled: true` on purpose and handles the toggle with its own onClick
    // on the control root, so the <label> carries data-disabled="true"
    // permanently. Cypress's `.click()` only checks the `disabled` property of
    // form elements (the subject here is an <svg>), so it clicks straight
    // through; Playwright's actionability check sees the disabled ancestor and
    // would wait forever. `force` is the faithful equivalent — a real mouse
    // click at the same point, which bubbles to the root's handler.
    await queryBuilderMain(page)
      .getByLabel("Switch to data", { exact: true })
      .click({ force: true });
    await queryBuilderHeader(page)
      .getByRole("button", { name: "Save", exact: true })
      .click();

    const createQuestionResponse = waitForCreateCard(page);
    await modal(page)
      .getByRole("button", { name: "Save", exact: true })
      .click();

    const card = (await createQuestionResponse).request().postDataJSON() as {
      visualization_settings: Record<string, unknown>;
    };
    expect(card.visualization_settings["graph.metrics"]).toEqual(["count"]);
    expect(card.visualization_settings["graph.dimensions"]).toEqual([
      "CREATED_AT",
    ]);
  });
});

test.describe("issue 36027", () => {
  test.beforeEach(async ({ mb, page }) => {
    await mb.restore();
    await mb.signInAsAdmin();

    const CONCRETE_CREATED_AT_FIELD_REF = [
      "field",
      ORDERS.CREATED_AT,
      { "base-type": "type/DateTime", "temporal-unit": "month" },
    ];

    const CREATED_AT_FIELD_REF = [
      "field",
      "CREATED_AT",
      { "base-type": "type/DateTime", "temporal-unit": "month" },
    ];

    const BASE_QUERY = {
      aggregation: [["count"]],
      breakout: [CONCRETE_CREATED_AT_FIELD_REF],
      "source-table": ORDERS_ID,
    };

    const base = await createQuestion(mb.api, { query: BASE_QUERY });
    const { id } = await createQuestion(mb.api, {
      display: "waterfall",
      query: {
        aggregation: [
          ["sum", ["field", "count", { "base-type": "type/Integer" }]],
        ],
        breakout: [CREATED_AT_FIELD_REF],
        joins: [
          {
            alias: "Q1",
            strategy: "left-join",
            "source-table": `card__${base.id}`,
            condition: [
              "<=",
              CREATED_AT_FIELD_REF,
              CONCRETE_CREATED_AT_FIELD_REF,
            ],
          },
        ],
        "source-query": BASE_QUERY,
      },
      visualization_settings: {
        "graph.dimensions": ["CREATED_AT"],
        "graph.metrics": ["sum"],
      },
    });
    await visitQuestion(page, id);
  });

  test("should use default metrics/dimensions if they're missing after removing some query clauses (metabase#36027)", async ({
    page,
  }) => {
    await openNotebook(page);
    // Cypress `.click({ force: true })` dispatches at the resolved element
    // instead of moving a real mouse — dispatchEvent is the faithful port.
    await getNotebookStep(page, "summarize", { stage: 1 })
      .getByLabel("Remove step", { exact: true })
      .dispatchEvent("click");
    await getNotebookStep(page, "join", { stage: 1 })
      .getByLabel("Remove step", { exact: true })
      .dispatchEvent("click");
    await visualizeEitherEndpoint(page);

    const chart = echartsContainer(page);
    await expect(
      chart.getByText("Created At: Month", { exact: true }),
    ).toBeVisible(); // x-axis
    await expect(chart.getByText("Count", { exact: true })).toBeVisible(); // y-axis

    // x-axis values
    for (const label of [
      "January 2026",
      "January 2027",
      "January 2028",
      "January 2029",
    ]) {
      await expect(chart.getByText(label, { exact: true })).toBeVisible();
    }

    // y-axis values
    for (const label of [
      "0",
      "3,000",
      "6,000",
      "9,000",
      "12,000",
      "15,000",
      "18,000",
      "21,000",
    ]) {
      await expect(chart.getByText(label, { exact: true })).toBeVisible();
    }
  });
});

test.describe("issue 12586", () => {
  test.beforeEach(async ({ mb }) => {
    await mb.restore();
    await mb.signInAsNormalUser();
  });

  test("should not show the run button overlay when an error occurs (metabase#12586)", async ({
    page,
  }) => {
    await openOrdersTable(page);
    await summarize(page);

    // cy.intercept("POST", "/api/dataset", (req) => req.destroy())
    await page.route(
      (url) => new URL(url.toString()).pathname === "/api/dataset",
      async (route) => {
        if (route.request().method() !== "POST") {
          await route.fallback();
          return;
        }
        await route.abort();
      },
    );

    await rightSidebar(page)
      .getByRole("button", { name: "Done", exact: true })
      .click();
    await expect(
      main(page).getByText("We're experiencing server issues", { exact: true }),
    ).toBeVisible();
    await expectCypressHidden(icon(queryBuilderMain(page), "play"));
  });
});

test.describe("issue 48829", () => {
  const questionDetails = {
    name: "Issue 48829",
    query: {
      "source-table": PRODUCTS_ID,
    },
  };

  test.beforeEach(async ({ mb }) => {
    await mb.restore();
    await mb.signInAsNormalUser();
  });

  test("should not show the unsaved changes warning when switching back to chill mode from the notebook editor after adding a filter from headers (metabase#48829)", async ({
    mb,
    page,
  }) => {
    const { id } = await createQuestion(mb.api, questionDetails);
    await visitQuestion(page, id);

    await tableHeaderClick(page, "Category");
    await popover(page)
      .getByText("Filter by this column", { exact: true })
      .click();
    await popover(page).getByText("Doohickey", { exact: true }).click();
    await popover(page).getByText("Add filter", { exact: true }).click();

    await queryBuilderHeader(page)
      .getByRole("button", { name: /Editor/ })
      .click();
    const removeFilter = getNotebookStep(page, "filter")
      .getByTestId("notebook-cell-item")
      .locator(".Icon-close");
    await expect(removeFilter).toBeVisible();
    await removeFilter.click();

    await visualizeEitherEndpoint(page);

    await expect(modal(page)).toHaveCount(0);
  });

  test("should not show the unsaved changes warning when switching back to chill mode from the notebook editor after adding a filter via the filter picker (metabase#48829)", async ({
    mb,
    page,
  }) => {
    const { id } = await createQuestion(mb.api, questionDetails);
    await visitQuestion(page, id);

    await queryBuilderHeader(page)
      .getByRole("button", { name: /Filter/ })
      .click();
    await popover(page).getByText("Category", { exact: true }).click();
    await popover(page).getByText("Doohickey", { exact: true }).click();
    await popover(page)
      .getByRole("button", { name: "Apply filter", exact: true })
      .click();

    await queryBuilderHeader(page)
      .getByRole("button", { name: /Editor/ })
      .click();
    const removeFilter = getNotebookStep(page, "filter")
      .getByTestId("notebook-cell-item")
      .locator(".Icon-close");
    await expect(removeFilter).toBeVisible();
    await removeFilter.click();

    await visualizeEitherEndpoint(page);

    await expect(modal(page)).toHaveCount(0);
  });

  test("should not show the unsaved changes warning when switching back to chill mode from the notebook editor after visiting a filtered question from a dashboard click action (metabase#48829)", async ({
    mb,
    page,
  }) => {
    const { dashboard } = await createDashboardWithQuestions(mb.api, {
      questions: [questionDetails],
    });
    await visitDashboard(page, mb.api, dashboard.id);

    await showDashboardCardActions(page);
    await editDashboard(page);
    // Cypress's realHover parks the OS cursor on the dashcard and its later
    // synthetic clicks never move it, so the card is still :hover (and its
    // action overlay still interactive) when "Click behavior" is clicked.
    // Playwright's editDashboard click moves the real mouse to the header, so
    // the overlay stops receiving pointer events and the dashcard underneath
    // intercepts the click. Re-hovering restores the exact cursor state the
    // original is in at this point.
    await showDashboardCardActions(page);
    await getDashboardCard(page)
      .getByLabel("Click behavior", { exact: true })
      .click();

    await sidebar(page).getByText("Title", { exact: true }).click();
    await sidebar(page)
      .getByText("Go to a custom destination", { exact: true })
      .click();
    await sidebar(page).getByText("Saved question", { exact: true }).click();

    await entityPickerModal(page)
      .getByText("Our analytics", { exact: true })
      .click();
    await entityPickerModal(page)
      .getByText(questionDetails.name, { exact: true })
      .click();
    await sidebar(page)
      .getByTestId("click-mappings")
      .getByText("Title", { exact: true })
      .click();
    await popover(page).getByText("Title", { exact: true }).click();
    await saveDashboard(page);

    // Navigate to question using click action in dashboard
    await main(page).getByText("Rustic Paper Wallet", { exact: true }).click();

    await queryBuilderHeader(page)
      .getByRole("button", { name: /Editor/ })
      .click();
    const removeFilter = getNotebookStep(page, "filter")
      .getByTestId("notebook-cell-item")
      .locator(".Icon-close");
    await expect(removeFilter).toBeVisible();
    await removeFilter.click();

    await visualizeEitherEndpoint(page);

    await expect(modal(page)).toHaveCount(0);
  });
});

test.describe("issue 50038", () => {
  const QUESTION = {
    name: "question with a very long name that will be too long to fit on one line which normally would result in some weird looking buttons with inconsistent heights",
    query: {
      "source-table": PRODUCTS_ID,
    },
  };

  const OTHER_QUESTION = {
    name: "question that also has a long name that is so long it will break in the button",
    query: {
      "source-table": ORDERS_ID,
    },
  };

  test.beforeEach(async ({ mb, page }) => {
    await mb.restore();
    await mb.signInAsNormalUser();

    const question = await createQuestion(mb.api, QUESTION);
    const otherQuestion = await createQuestion(mb.api, OTHER_QUESTION);

    const { id } = await createQuestion(mb.api, {
      name: "Joined question",
      query: {
        "source-table": `card__${question.id}`,
        joins: [
          {
            "source-table": `card__${otherQuestion.id}`,
            fields: "all",
            strategy: "left-join",
            condition: [
              "=",
              ["field", PRODUCTS.ID, null],
              ["field", ORDERS.PRODUCT_ID, { "join-alias": "Orders" }],
            ],
          },
        ],
      },
    });
    await visitQuestion(page, id);
  });

  test("should not break data source and join source buttons when the source names are too long (metabase#50038)", async ({
    page,
  }) => {
    await openNotebook(page);

    const dataStep = getNotebookStep(page, "data");
    const dataSourceButton = dataStep
      .getByText(QUESTION.name, { exact: true })
      .locator("xpath=..");
    const dataFieldsPicker = dataStep.getByTestId("fields-picker");
    await expect(dataSourceButton).toBeVisible();
    await expect(dataFieldsPicker).toBeVisible();
    await assertEqualHeight(dataSourceButton, dataFieldsPicker);

    const joinStep = getNotebookStep(page, "join");
    const joinSourceButton = joinStep
      .getByText(OTHER_QUESTION.name, { exact: true })
      .first()
      .locator("xpath=..");
    const joinFieldsPicker = joinStep.getByTestId("fields-picker");
    await expect(joinSourceButton).toBeVisible();
    await expect(joinFieldsPicker).toBeVisible();
    await assertEqualHeight(joinSourceButton, joinFieldsPicker);
  });
});

test.describe("issue 47940", () => {
  const questionDetails = {
    name: "Issue 47940",
    query: {
      "source-table": ORDERS_ID,
      limit: 5,
    },
  };

  test.beforeEach(async ({ mb }) => {
    await mb.restore();
    await mb.signInAsAdmin();
  });

  test("should be able to convert a question with date casting to a model", async ({
    mb,
    page,
  }) => {
    // create a question without any column casting
    const { id } = await createQuestion(mb.api, questionDetails);
    await visitQuestion(page, id);

    // add coercion
    await mb.api.put(`/api/field/${ORDERS.PRODUCT_ID}`, {
      semantic_type: "type/Category",
      coercion_strategy: "Coercion/UNIXMicroSeconds->DateTime",
    });

    // reload to get new query results with coercion applied
    const cardQuery = waitForCardQuery(page);
    await page.reload();
    await cardQuery;

    // turn into a model
    await openQuestionActions(page);
    await popover(page)
      .getByText("Turn into a model", { exact: true })
      .click();
    const updateCard = waitForUpdateCard(page);
    await page
      .getByRole("dialog")
      .getByText("Turn this into a model", { exact: true })
      .click();
    await updateCard;

    // verify there is a table displayed
    await expect(page.getByTestId("visualization-root")).toContainText(
      "December 31, 1969, 4:00 PM",
    );
  });
});

test.describe("issue 53036", () => {
  test.beforeEach(async ({ mb }) => {
    await mb.restore();
    await mb.signInAsAdmin();
  });

  const questionDetails = {
    name: "Issue 53036",
    query: {
      "source-table": PRODUCTS_ID,
      limit: 5,
      joins: [
        {
          fields: "all",
          alias: "Orders",
          "source-table": ORDERS_ID,
          strategy: "left-join",
          condition: [
            "=",
            ["field", PRODUCTS.ID, null],
            ["field", ORDERS.PRODUCT_ID, { "join-alias": "Orders" }],
          ],
        },
      ],
    },
  };

  test("should keep buttons usable on mid size screen (metabase#53036)", async ({
    mb,
    page,
  }) => {
    const { id } = await createQuestion(mb.api, questionDetails);
    await visitQuestion(page, id);
    await openNotebook(page);

    await page.setViewportSize({ width: 650, height: 800 });

    // try to click on add button - it fails if there is an overlap
    const joinStep = getNotebookStep(page, "join");
    await expect(icon(joinStep, "play")).toBeVisible();
    await icon(joinStep, "add").click();
  });
});

test.describe("issue 57697", () => {
  test.beforeEach(async ({ mb, page }) => {
    await mb.restore();
    await mb.signInAsAdmin();
    const { id } = await createQuestion(mb.api, {
      query: {
        "source-table": PRODUCTS_ID,
        aggregation: [["count"]],
        breakout: [
          ["field", PRODUCTS.PRICE, { binning: { strategy: "default" } }],
        ],
      },
    });
    await visitQuestion(page, id);
  });

  test("should not show the binning in the name of the column when binning in the summarize sidebar  (metabase#57697)", async ({
    page,
  }) => {
    await summarize(page);
    const visibleSidebar = sidebar(page).filter({ visible: true });
    await expect(
      visibleSidebar.getByText("Price", { exact: true }),
    ).toBeVisible();
    await expect(
      visibleSidebar.getByText("Price: Auto binned", { exact: true }),
    ).toHaveCount(0);
  });
});

test.describe("issue 32499", () => {
  test.beforeEach(async ({ mb }) => {
    await mb.restore();
    await mb.signInAsAdmin();
  });

  test("Self-join columns can be edited independently", async ({
    mb,
    page,
  }) => {
    const { id } = await createQuestion(mb.api, {
      name: "Model",
      type: "model",
      query: {
        "source-table": ORDERS_ID,
        fields: [
          ["field", ORDERS.ID, null],
          ["field", ORDERS.USER_ID, null],
        ],
        joins: [
          {
            fields: [["field", ORDERS.USER_ID, { "join-alias": "Orders" }]],
            alias: "Orders",
            "source-table": ORDERS_ID,
            strategy: "left-join",
            condition: [
              "=",
              ["field", ORDERS.ID, null],
              ["field", ORDERS.ID, { "join-alias": "Orders" }],
            ],
          },
        ],
      },
    });
    // H.createQuestion(..., { visitQuestion: true }) routes `type: "model"`
    // through visitModel, NOT visitQuestion (api/createQuestion.ts:175-181).
    // It matters: /question/:id redirects to /model/:id-slug, which runs the
    // model through POST /api/dataset and never POSTs /api/card/:id/query.
    await visitModel(page, id);

    // NOT openQuestionActions(page, "Edit metadata"): the menu row renders as
    // "Edit metadata" plus a sibling completion badge ("Edit metadata 89%").
    // testing-library's exact findByText compares an element's own text nodes,
    // so Cypress matches; Playwright's exact getByText compares the element's
    // full text and does not (the mixed-content gotcha). Match the menu item
    // by role + prefix instead.
    await openQuestionActions(page);
    await popover(page)
      .getByText(/^Edit metadata\b/)
      .first()
      .click();

    const columns = [
      { original: "Orders → User ID", modified: "JOIN COLUMN" },
      { original: "User ID", modified: "ORIGINAL COLUMN" },
    ];

    // we can click the headers and modify their names
    for (const { original, modified } of columns) {
      await tableHeaderClick(page, original);
      const displayName = page.getByLabel("Display name", { exact: true });
      await expect(displayName).toHaveValue(original);
      await displayName.click();
      await page.keyboard.press("ControlOrMeta+A");
      await page.keyboard.press("Backspace");
      await page.keyboard.type(modified);
    }

    // the modified names are now in the headers
    for (const { modified } of columns) {
      await expect(tableHeaderColumn(page, modified)).toBeAttached();
    }
  });
});

test.describe("issue 12679", () => {
  test.beforeEach(async ({ mb }) => {
    await mb.restore();
    await mb.signInAsAdmin();
  });

  test("removing the first aggregation should not re-target the filter (metabase#12679)", async ({
    page,
  }) => {
    await visitQuestionAdhocNotebook(page, {
      dataset_query: {
        type: "query",
        database: SAMPLE_DB_ID,
        query: {
          "source-query": {
            "source-table": ORDERS_ID,
            aggregation: [
              ["sum", ["field", ORDERS.SUBTOTAL, null]],
              ["sum", ["field", ORDERS.TAX, null]],
              ["sum", ["field", ORDERS.TOTAL, null]],
            ],
            breakout: [["field", ORDERS.CREATED_AT, { "temporal-unit": "week" }]],
          },
          filter: [">", ["field", "sum_2", { "base-type": "type/Float" }], 100],
        },
      },
      display: "table",
    });

    await expect(
      getNotebookStep(page, "filter", { stage: 1 }).getByText(
        "Sum of Tax is greater than 100",
        { exact: true },
      ),
    ).toBeAttached();

    const summarizeStep = getNotebookStep(page, "summarize");
    await icon(
      summarizeStep
        .getByText("Sum of Subtotal", { exact: true })
        .locator("xpath=.."),
      "close",
    ).click();
    await expect(
      summarizeStep.getByText("Sum of Subtotal", { exact: true }),
    ).toHaveCount(0);

    await expect(
      getNotebookStep(page, "filter", { stage: 1 }).getByText(
        "Sum of Tax is greater than 100",
        { exact: true },
      ),
    ).toBeAttached();

    await visualizeEitherEndpoint(page);

    await expect(
      page
        .getByTestId("qb-filters-panel")
        .getByText("Sum of Tax is greater than 100", { exact: true }),
    ).toBeAttached();

    const tableHeader = page.getByTestId("table-header");
    await expect(
      tableHeader.getByText("Sum of Subtotal", { exact: true }),
    ).toHaveCount(0);
    await expect(
      tableHeader.getByText("Sum of Tax", { exact: true }),
    ).toBeAttached();
    await expect(
      tableHeader.getByText("Sum of Total", { exact: true }),
    ).toBeAttached();
    await expect(
      page
        .getByTestId("question-row-count")
        .getByText("Showing 175 rows", { exact: true }),
    ).toBeAttached();
  });
});
