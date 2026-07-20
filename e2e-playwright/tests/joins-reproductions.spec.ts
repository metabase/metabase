/**
 * Playwright port of e2e/test/scenarios/joins/joins-reproductions.cy.spec.js
 *
 * Collision checks (PORTING "before writing"):
 * - The source directory holds `joins-custom-expressions.cy.spec.ts`,
 *   `joins.cy.spec.js` and `joins-reproductions.cy.spec.js`. There is NO
 *   `.js`/`.ts` twin of this file — the basename `joins-reproductions` is
 *   unique there.
 * - `tests/` already holds `joins.spec.ts` and `joins-custom-expressions.spec.ts`
 *   (ports of the other two sources). No prior port of this source exists.
 *
 * Infra tier: MIXED, and here the upstream tags are accurate (checked describe
 * by describe rather than trusted).
 * - `issue 15342` (@external) restores the `mysql-8` snapshot and drives the
 *   "QA MySQL8" database → needs the MySQL QA container.
 * - `issue 42385` (@external) restores `postgres-12` and drives "QA Postgres12"
 *   → needs the Postgres QA container.
 * - Every other describe restores the DEFAULT snapshot and touches only the
 *   Sample Database. No container, no writable DB, no QA dialect. Nothing in
 *   this file writes to `writable_db`, so the #85 shared-writable-container
 *   hazard does not apply (container evidence: n/a).
 *
 * Dropped intercepts (never awaited upstream — PORTING rule 2):
 * - issue 15578's `@dataset`, issue 17710's `@dataset`, issue 18502's
 *   `@dataset` and `@getCollectionContent`, issue 18818's `@dataset`,
 *   issue 27380's beforeEach `@dataset` (the in-test wait is re-registered at
 *   its true trigger).
 *
 * Duplicate test titles: upstream's `issue 46675` declares two `it`s with the
 * IDENTICAL title. Playwright treats duplicate titles as a HARD LOAD ERROR
 * (Cypress tolerates them), so the second is suffixed with its own `cy.log`
 * text. Nothing else about the tests is changed.
 */
import type { Page } from "@playwright/test";

import { openOrdersTable, openProductsTable } from "../support/ad-hoc-question";
import { chartPathWithFillColor } from "../support/binning";
import { echartsContainer, openVizSettingsSidebar } from "../support/charts";
import { icon } from "../support/dashboard-cards";
import { pickEntity } from "../support/dashboard";
import { getDashboardCards } from "../support/dashboard-core";
import { dashboardGrid } from "../support/drillthroughs";
import { createQuestion, createQuestionAndDashboard } from "../support/factories";
import { test, expect } from "../support/fixtures";
import {
  join,
  selectSavedQuestionsToJoin,
  summarizeNotebook,
} from "../support/joins";
import { cartesianChartCircles } from "../support/metrics";
import {
  MYSQL_SKIP_REASON,
  POSTGRES_SKIP_REASON,
  assertTableHeader,
  containsText,
  countDatasetResponses,
  modifyColumn,
  waitForDataset,
  waitForXray,
} from "../support/joins-reproductions";
import { tableInteractive } from "../support/models";
import { filter } from "../support/nested-questions";
import {
  enterCustomColumnDetails,
  entityPickerModal,
  getNotebookStep,
  miniPicker,
  openNotebook,
  queryBuilderMain,
  startNewQuestion,
  visualize,
} from "../support/notebook";
import { visitQuestionAdhoc } from "../support/permissions";
import { miniPickerHeader } from "../support/question-new";
import { SAMPLE_DATABASE, SAMPLE_DB_ID } from "../support/sample-data";
import { saveQuestion } from "../support/sharing";
import {
  newButton,
  popover,
  queryBuilderHeader,
  visitDashboard,
  visitQuestion,
} from "../support/ui";

const {
  ORDERS,
  ORDERS_ID,
  PRODUCTS,
  PRODUCTS_ID,
  PEOPLE,
  PEOPLE_ID,
  REVIEWS,
  REVIEWS_ID,
} = SAMPLE_DATABASE;

/** Port of `H.miniPicker().within(() => { cy.findByText(a).click(); ... })`. */
async function pickInMiniPicker(page: Page, ...names: string[]) {
  for (const name of names) {
    await miniPicker(page).getByText(name, { exact: true }).click();
  }
}

test.describe("issue 14793", () => {
  const XRAY_DATASETS = 11; // enough to load most questions

  const QUESTION_DETAILS = {
    dataset_query: {
      type: "query" as const,
      query: {
        "source-table": REVIEWS_ID,
        joins: [
          {
            fields: "all",
            "source-table": PRODUCTS_ID,
            condition: [
              "=",
              ["field", REVIEWS.PRODUCT_ID, null],
              ["field", PRODUCTS.ID, { "join-alias": "Products" }],
            ],
            alias: "Products",
          },
        ],
        aggregation: [
          ["sum", ["field", PRODUCTS.PRICE, { "join-alias": "Products" }]],
        ],
        breakout: [["field", REVIEWS.CREATED_AT, { "temporal-unit": "year" }]],
      },
      database: SAMPLE_DB_ID,
    },
    display: "line",
  };

  test.beforeEach(async ({ mb }) => {
    await mb.restore();
    await mb.signInAsAdmin();
  });

  test("x-rays should work on explicit joins when metric is for the joined table (metabase#14793)", async ({
    page,
  }) => {
    // Installed before the navigation: see countDatasetResponses' note on why
    // that is the faithful model of upstream's 11 `cy.wait("@postDataset")`.
    const datasetCount = countDatasetResponses(page);

    await visitQuestionAdhoc(page, QUESTION_DETAILS);

    await cartesianChartCircles(page).nth(2).click({ force: true });

    await popover(page)
      .getByText("Automatic insights…", { exact: true })
      .click();

    const xray = waitForXray(page);
    await popover(page).getByText("X-ray", { exact: true }).click();
    const xrayResponse = await xray;

    await expect.poll(datasetCount).toBeGreaterThanOrEqual(XRAY_DATASETS);

    expect(xrayResponse.status()).not.toBe(500);
    expect(
      ((await xrayResponse.json()) as { cause?: unknown }).cause,
    ).toBeUndefined();

    await expect(
      dashboardGrid(page).getByText(
        "How this metric is distributed across different numbers",
        { exact: true },
      ),
    ).toBeAttached();

    await expect(
      page
        .getByTestId("automatic-dashboard-header")
        .getByText(/^A closer look at/),
    ).toBeVisible();

    await expect(getDashboardCards(page)).toHaveCount(35);
  });
});

test.describe("issue 15342", { tag: "@external" }, () => {
  test.skip(!process.env.PW_QA_DB_ENABLED, MYSQL_SKIP_REASON);

  const MYSQL_DB_NAME = "QA MySQL8";

  test.beforeEach(async ({ mb, page }) => {
    await mb.restore("mysql-8");
    await mb.signInAsAdmin();

    // huge width required so three joined tables can fit
    await page.setViewportSize({ width: 4000, height: 1200 });
  });

  test("should correctly order joins for MySQL queries (metabase#15342)", async ({
    page,
  }) => {
    await startNewQuestion(page);
    await pickInMiniPicker(page, MYSQL_DB_NAME, "People");

    await icon(page, "join_left_outer").click();
    await pickInMiniPicker(page, MYSQL_DB_NAME, "Orders");

    await getNotebookStep(page, "join")
      .getByLabel("Right column", { exact: true })
      .click();
    await popover(page).getByText("Product ID", { exact: true }).click();

    // eslint-disable-next-line -- upstream: metabase/no-unsafe-element-filtering
    await icon(page, "join_left_outer").last().click();
    await pickInMiniPicker(page, MYSQL_DB_NAME, "Products");

    await icon(getNotebookStep(page, "join"), "join_left_outer").click();
    await popover(page).getByText("Inner join", { exact: true }).click();

    await visualize(page);

    const vizRoot = page.getByTestId("query-visualization-root");
    // from People table
    await expect(vizRoot.getByText("Email", { exact: true })).toBeAttached();
    // joined Orders table columns
    await expect(
      vizRoot.getByText("Orders → ID", { exact: true }),
    ).toBeAttached();
    // joined Products table columns
    await expect(
      vizRoot.getByText("Products → ID", { exact: true }),
    ).toBeAttached();
  });
});

test.describe("issue 15578", () => {
  const JOINED_QUESTION_NAME = "15578";

  test.beforeEach(async ({ mb }) => {
    await mb.restore();
    await mb.signInAsAdmin();

    // Remap display value
    await mb.api.post(`/api/field/${ORDERS.PRODUCT_ID}/dimension`, {
      name: "Product ID",
      type: "external",
      human_readable_field_id: PRODUCTS.TITLE,
    });

    await createQuestion(mb.api, {
      name: JOINED_QUESTION_NAME,
      query: { "source-table": ORDERS_ID },
    });
  });

  test("joining on a question with remapped values should work (metabase#15578)", async ({
    page,
  }) => {
    await openProductsTable(page, { mode: "notebook" });

    await page
      .getByRole("button", { name: "Join data", exact: true })
      .click();
    await pickInMiniPicker(page, "Our analytics", JOINED_QUESTION_NAME);

    await visualize(page);

    const badges = queryBuilderHeader(page).getByTestId(
      "question-table-badges",
    );
    await expect(badges.getByText("Products", { exact: true })).toBeVisible();
    await expect(
      badges.getByText(JOINED_QUESTION_NAME, { exact: true }),
    ).toBeVisible();

    const main = queryBuilderMain(page);
    await expect(main.getByText("Category", { exact: true })).toBeVisible();
    await expect(
      main.getByText(`${JOINED_QUESTION_NAME} → ID`, { exact: true }),
    ).toBeVisible();
  });
});

test.describe("issue 17710", () => {
  test.beforeEach(async ({ mb }) => {
    await mb.restore();
    await mb.signInAsAdmin();
  });

  test("should remove only invalid join clauses (metabase#17710)", async ({
    page,
  }) => {
    await openOrdersTable(page, { mode: "notebook" });

    await page
      .getByRole("button", { name: "Join data", exact: true })
      .click();
    await pickInMiniPicker(page, "Sample Database", "Products");

    await icon(getNotebookStep(page, "join"), "add").click();

    // Close the LHS column popover that opens automatically
    await getNotebookStep(page, "join").locator("..").click();

    await visualize(page);

    await openNotebook(page);

    const joinStep = page.getByTestId("step-join-0-0");
    await expect(joinStep.getByText("ID", { exact: true })).toBeAttached();
    await expect(
      joinStep.getByText("Product ID", { exact: true }),
    ).toBeAttached();
  });
});

test.describe("issue 17968", () => {
  test.beforeEach(async ({ mb }) => {
    await mb.restore();
    await mb.signInAsAdmin();
  });

  test("should show 'Previous results' instead of a table name for non-field dimensions (metabase#17968)", async ({
    page,
  }) => {
    await openOrdersTable(page, { mode: "notebook" });

    await summarizeNotebook(page);
    await popover(page).getByText("Count of rows", { exact: true }).click();

    await getNotebookStep(page, "summarize")
      .getByText("Pick a column to group by", { exact: true })
      .click();
    await popover(page).getByText("Created At", { exact: true }).click();

    // eslint-disable-next-line -- upstream: metabase/no-unsafe-element-filtering
    await page
      .getByTestId("action-buttons")
      .last()
      .getByRole("button", { name: "Join data", exact: true })
      .click();
    await pickInMiniPicker(page, "Sample Database", "Products");
    await popover(page).getByText("Count", { exact: true }).click();

    await expect(
      getNotebookStep(page, "join", { stage: 1 })
        .getByLabel("Left column", { exact: true })
        .getByText("Previous results", { exact: true }),
    ).toBeAttached();
  });
});

test.describe("issue 18502", () => {
  const getQuestionDetails = (name: string, breakoutColumn: number) => ({
    name,
    query: {
      "source-table": PEOPLE_ID,
      aggregation: [["count"]],
      breakout: [["field", breakoutColumn, { "temporal-unit": "month" }]],
    },
  });

  const question1 = getQuestionDetails("18502#1", PEOPLE.CREATED_AT);
  const question2 = getQuestionDetails("18502#2", PEOPLE.BIRTH_DATE);

  test.beforeEach(async ({ mb }) => {
    await mb.restore();
    await mb.signInAsAdmin();
  });

  test("should be able to join two saved questions based on the same table (metabase#18502)", async ({
    mb,
    page,
  }) => {
    await createQuestion(mb.api, question1);
    await createQuestion(mb.api, question2);

    await startNewQuestion(page);
    await selectSavedQuestionsToJoin(page, "18502#1", "18502#2");

    // upstream: metabase/no-unscoped-text-selectors -- deprecated usage
    await page.getByText("Created At: Month", { exact: true }).click();
    await page.getByText("Birth Date: Month", { exact: true }).click();

    const response = await visualize(page);
    expect(
      ((await response.json()) as { error?: unknown }).error,
    ).toBeUndefined();

    // upstream: metabase/no-unscoped-text-selectors -- deprecated usage
    await expect(
      page.getByText("April 2025", { exact: true }),
    ).toBeAttached();
  });
});

test.describe("issue 18818", () => {
  test.beforeEach(async ({ mb }) => {
    await mb.restore();
    await mb.signInAsAdmin();
  });

  test("should normally open notebook editor for queries joining on custom columns (metabase#18818)", async ({
    mb,
    page,
  }) => {
    const { id } = await createQuestion(mb.api, {
      query: {
        "source-table": REVIEWS_ID,
        expressions: {
          "CC Rating": ["field", REVIEWS.RATING],
        },
        joins: [
          {
            fields: "all",
            "source-table": ORDERS_ID,
            condition: [
              "=",
              ["expression", "CC Rating"],
              ["field", ORDERS.QUANTITY, { "join-alias": "Orders" }],
            ],
          },
        ],
      },
    });
    await visitQuestion(page, id);

    await openNotebook(page);
    // findAllByText: at least one match must exist.
    await expect(
      page.getByText("CC Rating", { exact: true }).first(),
    ).toBeAttached();
  });
});

test.describe("issue 20519", () => {
  const questionDetails = {
    name: "20519",
    query: {
      "source-query": {
        "source-table": ORDERS_ID,
        aggregation: [["count"]],
        breakout: [
          ["field", PRODUCTS.CATEGORY, { "source-field": ORDERS.PRODUCT_ID }],
        ],
      },
      joins: [
        {
          fields: "all",
          "source-table": PRODUCTS_ID,
          condition: [
            "=",
            ["field", "CATEGORY", { "base-type": "type/Text" }],
            ["field", PRODUCTS.CATEGORY, { "join-alias": "Products" }],
          ],
          alias: "Products",
        },
      ],
      limit: 2,
    },
  };

  test.beforeEach(async ({ mb, page }) => {
    await mb.restore();
    await mb.signInAsAdmin();

    const { id } = await createQuestion(mb.api, questionDetails);
    await visitQuestion(page, id);
    await openNotebook(page);
  });

  // Tightly related issue: metabase#17767
  test("should allow subsequent joins and nested query after summarizing on the implicit joins (metabase#20519)", async ({
    page,
  }) => {
    // eslint-disable-next-line -- upstream: metabase/no-unsafe-element-filtering
    await page.getByLabel("Custom column", { exact: true }).last().click();

    await enterCustomColumnDetails(page, {
      formula: "1 + 1",
      name: "Two",
    });

    await page.getByRole("button", { name: "Done", exact: true }).click();

    // `.contains("Two")` is a case-sensitive substring match, first hit.
    await expect(
      containsText(getNotebookStep(page, "expression", { stage: 1 }), "Two"),
    ).toBeAttached();

    const response = await visualize(page);
    expect(
      ((await response.json()) as { error?: unknown }).error,
    ).toBeUndefined();

    // upstream: metabase/no-unscoped-text-selectors -- deprecated usage
    await expect(containsText(page, "Doohickey")).toBeAttached();
    await expect(containsText(page, "Two")).toBeAttached();
  });
});

test.describe("issue 22859 - multiple levels of nesting", () => {
  const questionDetails = {
    name: "22859-Q1",
    query: {
      "source-table": REVIEWS_ID,
      joins: [
        {
          fields: "all",
          "source-table": PRODUCTS_ID,
          condition: [
            "=",
            ["field", REVIEWS.PRODUCT_ID, null],
            ["field", PRODUCTS.ID, { "join-alias": "Products" }],
          ],
          alias: "Products",
        },
      ],
    },
  };

  let q1Id: number;
  let q2Id: number;

  test.beforeEach(async ({ mb }) => {
    await mb.restore();
    await mb.signInAsAdmin();

    ({ id: q1Id } = await createQuestion(mb.api, questionDetails));

    // Join Orders table with the previously saved question and save it again
    ({ id: q2Id } = await createQuestion(mb.api, {
      name: "22859-Q2",
      query: {
        "source-table": ORDERS_ID,
        joins: [
          {
            fields: "all",
            alias: `Question ${q1Id}`,
            condition: [
              "=",
              ["field", ORDERS.PRODUCT_ID, { "base-type": "type/Integer" }],
              [
                "field",
                REVIEWS.PRODUCT_ID,
                {
                  "base-type": "type/Integer",
                  "join-alias": `Question ${q1Id}`,
                },
              ],
            ],
            "source-table": `card__${q1Id}`,
          },
        ],
        limit: 5,
      },
    }));
  });

  test("model based on multi-level nested saved question should work (metabase#22859-1)", async ({
    mb,
    page,
  }) => {
    // Convert the second question to a model
    await mb.api.put(`/api/card/${q2Id}`, { type: "model" });

    const dataset = waitForDataset(page);
    await page.goto(`/model/${q2Id}`);
    await dataset;

    // Port of the spec-local getJoinedTableColumnHeader().
    await expect(
      page.getByText(`Question ${q1Id} → ID`, { exact: true }),
    ).toBeAttached();
  });
});

test.describe("issue 23293", () => {
  test.beforeEach(async ({ mb }) => {
    await mb.restore();
    await mb.signInAsAdmin();
  });

  test("should retain the filter when drilling through the dashboard card with implicitly added column (metabase#23293)", async ({
    mb,
    page,
  }) => {
    await openOrdersTable(page);

    await openVizSettingsSidebar(page);
    // The "@dataset" alias comes from H.visitQuestionAdhoc (which registered
    // AND consumed one); upstream's cy.wait therefore takes the first dataset
    // response fired by these column edits. Registered at that true trigger.
    const dataset = waitForDataset(page);
    await modifyColumn(page, "Product ID", "remove");
    await modifyColumn(page, "Category", "add");
    await dataset;

    const saveResponse = page.waitForResponse(
      (response) =>
        response.request().method() === "POST" &&
        new URL(response.url()).pathname === "/api/card",
    );

    await queryBuilderHeader(page)
      .getByRole("button", { name: "Save", exact: true })
      .click();
    await page
      .getByTestId("save-question-modal")
      .getByLabel(/Where do you want to save this/)
      .click();
    await pickEntity(page, { path: ["Our analytics"] });
    await entityPickerModal(page)
      .getByText("Select this collection", { exact: true })
      .click();
    await page
      .getByTestId("save-question-modal")
      .getByRole("button", { name: "Save", exact: true })
      .click();

    const { id } = (await (await saveResponse).json()) as { id: number };

    const questionDetails = {
      query: {
        "source-table": `card__${id}`,
        aggregation: [["count"]],
        breakout: [
          [
            "field",
            PRODUCTS.CATEGORY,
            {
              "source-field": ORDERS.PRODUCT_ID,
            },
          ],
        ],
      },
      display: "bar",
    };

    const { dashboard_id } = await createQuestionAndDashboard(mb.api, {
      questionDetails,
    });
    await visitDashboard(page, mb.api, dashboard_id);

    // Click on the first bar
    await chartPathWithFillColor(page, "#509EE3").first().click();
    await popover(page)
      .getByText(/^See these/)
      .click();

    await expect(page.getByTestId("qb-filters-panel")).toContainText(
      "Orders → Category is Doohickey",
    );

    // eslint-disable-next-line -- upstream: metabase/no-unsafe-element-filtering
    await expect(page.getByTestId("header-cell").last()).toHaveText(
      "Product → Category",
    );

    // eslint-disable-next-line -- upstream: metabase/no-unsafe-element-filtering
    const tableResults = page.getByRole("grid").last();
    await expect(tableResults).toContainText("Doohickey");
    await expect(tableResults).not.toContainText("Gizmo");
  });
});

test.describe("issue 27380", () => {
  test.beforeEach(async ({ mb }) => {
    await mb.restore();
    await mb.signInAsAdmin();
  });

  test("should not drop fields from joined table on dashboard 'zoom-in' (metabase#27380)", async ({
    mb,
    page,
  }) => {
    const questionDetails = {
      query: {
        "source-table": ORDERS_ID,
        aggregation: [["count"]],
        breakout: [
          [
            "field",
            PRODUCTS.CREATED_AT,
            { "source-field": ORDERS.PRODUCT_ID, "temporal-unit": "month" },
          ],
        ],
      },
      display: "line",
    };
    const { dashboard_id } = await createQuestionAndDashboard(mb.api, {
      questionDetails,
    });
    await visitDashboard(page, mb.api, dashboard_id);

    // Doesn't really matter which 'circle" we click on the graph
    // eslint-disable-next-line -- upstream: metabase/no-unsafe-element-filtering
    await cartesianChartCircles(page).last().click();

    const dataset = waitForDataset(page);
    // upstream: metabase/no-unscoped-text-selectors -- deprecated usage
    await page.getByText("See this month by week", { exact: true }).click();
    await dataset;

    // Graph should still exist
    // Checks the y-axis label
    await expect(
      echartsContainer(page).getByText("Count", { exact: true }),
    ).toBeAttached();

    await openNotebook(page);

    // ANCHOR for the absence assertion below (PORTING: a retrying
    // toHaveCount(0) is satisfied by "nothing has rendered yet"). The
    // summarize step is what carries the group-by cell, so its presence proves
    // the notebook painted before we assert the placeholder is gone.
    await expect(getNotebookStep(page, "summarize")).toBeVisible();

    // upstream: metabase/no-unscoped-text-selectors -- deprecated usage
    await expect(
      page.getByText("Pick a column to group by", { exact: true }),
    ).toHaveCount(0);
    await expect(
      page.getByText("Product → Created At: Week", { exact: true }),
    ).toBeAttached();
  });
});

test.describe("issue 31769", () => {
  const Q1 = {
    "source-table": ORDERS_ID,
    joins: [
      {
        fields: "all",
        alias: "Products",
        "source-table": PRODUCTS_ID,
        condition: [
          "=",
          ["field", ORDERS.PRODUCT_ID, null],
          ["field", PRODUCTS.ID, { "join-alias": "Products" }],
        ],
      },
      {
        fields: "all",
        alias: "People — User",
        "source-table": PEOPLE_ID,
        condition: [
          "=",
          ["field", ORDERS.USER_ID, null],
          ["field", PEOPLE.ID, { "join-alias": "People — User" }],
        ],
      },
    ],
    aggregation: [["count"]],
    breakout: [
      [
        "field",
        PRODUCTS.CATEGORY,
        { "base-type": "type/Text", "join-alias": "Products" },
      ],
    ],
  };

  const Q2 = {
    "source-table": PRODUCTS_ID,
    aggregation: [["count"]],
    breakout: [["field", PRODUCTS.CATEGORY, { "base-type": "type/Text" }]],
  };

  test.beforeEach(async ({ mb, page }) => {
    await mb.restore();
    await mb.signInAsAdmin();

    await createQuestion(mb.api, { name: "Q1", query: Q1 });
    // Upstream wraps Q2's id as "@card_id_q2" but never reads the value (see
    // the assertion below), so nothing is captured here.
    await createQuestion(mb.api, { name: "Q2", query: Q2 });
    await startNewQuestion(page);
  });

  test("shouldn't drop joins using Lib/MBQL 5 (metabase#31769)", async ({
    page,
  }) => {
    await selectSavedQuestionsToJoin(page, "Q1", "Q2");

    await popover(page)
      .getByText("Products → Category", { exact: true })
      .click();
    await popover(page).getByText("Category", { exact: true }).click();

    await visualize(page);

    // Asserting there're two columns from Q1 and two columns from Q2.
    // Page-wide, exactly as upstream's findAllByTestId.
    await expect(page.getByTestId("header-cell")).toHaveCount(4);

    // Upstream wraps this in `cy.get("@card_id_q2").then(cardId => ...)` but
    // never uses `cardId` — the alias round-trip is dead weight.
    await expect(
      tableInteractive(page).getByText(
        "Q2 - Products → Category → Category",
        { exact: true },
      ),
    ).toBeAttached();

    await expect(
      tableInteractive(page).getByText("Products → Category", { exact: true }),
    ).toBeAttached();
  });
});

test.describe("issue 39448", () => {
  test.beforeEach(async ({ mb }) => {
    await mb.restore();
    await mb.signInAsNormalUser();
  });

  test("should load joined table metadata for suggested join conditions (metabase#39448)", async ({
    page,
  }) => {
    await openOrdersTable(page, { mode: "notebook" });
    await page
      .getByTestId("action-buttons")
      .getByRole("button", { name: "Join data", exact: true })
      .click();
    await pickInMiniPicker(page, "Sample Database", "Products");

    const joinStep = getNotebookStep(page, "join");
    await expect(
      joinStep.getByLabel("Right table", { exact: true }),
    ).toHaveText("Products");
    await expect(
      joinStep
        .getByLabel("Left column", { exact: true })
        .getByText("Product ID", { exact: true }),
    ).toBeVisible();
    await expect(
      joinStep
        .getByLabel("Right column", { exact: true })
        .getByText("ID", { exact: true }),
    ).toBeVisible();
    await expect(
      joinStep.getByLabel("Change operator", { exact: true }),
    ).toHaveText("=");
  });
});

// See TODO inside this test when unskipping
test.describe("issue 27521", () => {
  test.beforeEach(async ({ mb }) => {
    await mb.restore();
    await mb.signInAsNormalUser();
  });

  test("correctly displays joined question's column names (metabase#27521)", async ({
    page,
  }) => {
    await page.goto("/");

    // Create Q1
    await openOrdersTable(page, { mode: "notebook" });

    await getNotebookStep(page, "data")
      .getByRole("button", { name: "Pick columns", exact: true })
      .click();
    await popover(page).getByText("Select all", { exact: true }).click();

    // close popover
    await getNotebookStep(page, "data").click();

    await join(page);

    await pickInMiniPicker(page, "Sample Database", "Orders");

    await popover(page).getByText("ID", { exact: true }).click();
    await popover(page).getByText("ID", { exact: true }).click();

    await getNotebookStep(page, "join", { stage: 0, index: 0 })
      .getByRole("button", { name: "Pick columns", exact: true })
      .click();
    await popover(page).getByText("Select all", { exact: true }).click();
    await popover(page).getByText("ID", { exact: true }).click();

    await visualize(page);
    await assertTableHeader(page, 0, "ID");
    await assertTableHeader(page, 1, "Orders_2 → ID");

    await saveQuestion(page, "Q1");

    await assertTableHeader(page, 0, "ID");
    await assertTableHeader(page, 1, "Orders_2 → ID");

    // Create second question (Products + Q1)
    await newButton(page).click();
    await popover(page).getByText("Question", { exact: true }).click();
    await pickInMiniPicker(page, "Sample Database", "People");

    await getNotebookStep(page, "data")
      .getByRole("button", { name: "Pick columns", exact: true })
      .click();
    await popover(page).getByText("Select all", { exact: true }).click();

    await join(page);

    await pickInMiniPicker(page, "Our analytics", "Q1");

    await popover(page).getByText("ID", { exact: true }).click();
    const orders2Id = popover(page).getByText("Orders_2 → ID", {
      exact: true,
    });
    await expect(orders2Id).toBeVisible();
    await orders2Id.click();

    const rightColumnQ1Id = getNotebookStep(page, "join")
      .getByLabel("Right column", { exact: true })
      .getByText("Q1 → ID", { exact: true });
    await expect(rightColumnQ1Id).toBeVisible();
    await rightColumnQ1Id.click();

    const q1IdOptions = popover(page).getByText("Q1 → ID", { exact: true });
    await expect(q1IdOptions).toHaveCount(2);
    await q1IdOptions.first().click();

    await visualize(page);

    await assertTableHeader(page, 0, "ID");
    await assertTableHeader(page, 1, "Q1 → ID");
    await assertTableHeader(page, 2, "Q1 → ID");

    await openVizSettingsSidebar(page);
    const settingsSidebar = page.getByTestId("chartsettings-sidebar");
    await expect(
      settingsSidebar.getByText("ID", { exact: true }),
    ).toHaveCount(1);
    await expect(
      settingsSidebar.getByText("Q1 → ID", { exact: true }),
    ).toHaveCount(2);

    await settingsSidebar
      .getByRole("button", { name: "Add or remove columns", exact: true })
      .click();
    await expect(
      settingsSidebar.getByText("ID", { exact: true }),
    ).toHaveCount(1);
    await expect(
      settingsSidebar.getByText("Q1 → ID", { exact: true }),
    ).toHaveCount(2);

    // TODO: add assertions for what happens when toggling all the columns here
    // See https://github.com/metabase/metabase/issues/27521#issuecomment-1948658757
  });
});

test.describe("issue 42385", { tag: "@external" }, () => {
  test.skip(!process.env.PW_QA_DB_ENABLED, POSTGRES_SKIP_REASON);

  test.beforeEach(async ({ mb }) => {
    await mb.restore("postgres-12");
    await mb.signInAsAdmin();
  });

  test("should remove invalid draft join clause when query database changes (metabase#42385)", async ({
    page,
  }) => {
    await openOrdersTable(page, { mode: "notebook" });
    await join(page);
    await pickInMiniPicker(page, "Sample Database", "Reviews");

    await getNotebookStep(page, "data")
      .getByTestId("data-step-cell")
      .click();
    await miniPickerHeader(page).click();
    await pickInMiniPicker(page, "QA Postgres12", "Reviews");

    const joinStep = getNotebookStep(page, "join");
    // This visibility assertion is upstream's own anchor for the two absence
    // checks that follow it — it only holds once the join step re-rendered
    // into its reset (table-picker) state.
    await expect(
      joinStep.getByPlaceholder("Search for tables and more...", {
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      joinStep.getByLabel("Left column", { exact: true }),
    ).toHaveCount(0);
    await expect(
      joinStep.getByLabel("Right column", { exact: true }),
    ).toHaveCount(0);
  });

  test("should remove invalid join clause in incomplete draft state when query database changes (metabase#42385)", async ({
    page,
  }) => {
    await openOrdersTable(page, { mode: "notebook" });
    await join(page);
    await pickInMiniPicker(page, "Sample Database", "Products");

    await getNotebookStep(page, "join")
      .getByLabel("Right table", { exact: true })
      .getByText("Products", { exact: true })
      .click();

    await miniPicker(page).getByText("Reviews", { exact: true }).click();

    await getNotebookStep(page, "data")
      .getByTestId("data-step-cell")
      .click();
    await miniPickerHeader(page).click();
    await pickInMiniPicker(page, "QA Postgres12", "Reviews");

    // ANCHOR: the data step now names the QA Postgres table ("Reviews", where
    // it read "Orders" before the switch), so the notebook has re-rendered and
    // the join-step absence check below is not sampling a pre-render DOM.
    await expect(
      getNotebookStep(page, "data").getByTestId("data-step-cell"),
    ).toHaveText("Reviews");

    await expect(getNotebookStep(page, "join")).toHaveCount(0);
  });
});

test.describe("issue 45300", () => {
  test.beforeEach(async ({ mb }) => {
    await mb.restore();
    await mb.signInAsNormalUser();
  });

  test("joins using the foreign key only should not break the filter picker (metabase#45300)", async ({
    page,
  }) => {
    await visitQuestionAdhoc(page, {
      dataset_query: {
        database: SAMPLE_DB_ID,
        type: "query" as const,
        query: {
          "source-table": REVIEWS_ID,
          joins: [
            {
              fields: "all",
              strategy: "left-join",
              alias: "Orders - Product",
              condition: [
                "=",
                ["field", REVIEWS.PRODUCT_ID, { "base-type": "type/Integer" }],
                [
                  "field",
                  ORDERS.PRODUCT_ID,
                  {
                    "base-type": "type/Integer",
                    "join-alias": "Orders - Product",
                  },
                ],
              ],
              "source-table": ORDERS_ID,
            },
          ],
        },
        // Upstream also sets `parameters: []` INSIDE dataset_query, where it
        // is inert (the hash serialiser and the QP both ignore it). Dropped:
        // the harness's dataset_query type does not carry the key.
      },
    });

    await filter(page);
    const products = popover(page).getByText("Product", { exact: true });
    await expect(products).toHaveCount(2);
    await products.first().click();
    await popover(page).getByText("Category", { exact: true }).click();
    await popover(page).getByText("Doohickey", { exact: true }).click();

    // The "@dataset" alias was registered AND consumed by visitQuestionAdhoc;
    // this wait belongs to the filter application.
    const dataset = waitForDataset(page);
    await popover(page)
      .getByRole("button", { name: "Apply filter", exact: true })
      .click();
    await dataset;

    await expect(page.getByTestId("filter-pill")).toHaveText(
      "Product → Category is Doohickey",
    );
  });
});

test.describe("issue 46675", () => {
  const questionDetails = {
    query: {
      "source-table": ORDERS_ID,
    },
  };

  test.beforeEach(async ({ mb, page }) => {
    await mb.restore();
    await mb.signInAsNormalUser();

    // create draft state with a rhs table and a lhs column
    const { id } = await createQuestion(mb.api, questionDetails);
    await visitQuestion(page, id);
    await openNotebook(page);
    await getNotebookStep(page, "data")
      .getByLabel("Join data", { exact: true })
      .click();
    await pickInMiniPicker(page, "Sample Database", "Reviews");
    await popover(page).getByText("ID", { exact: true }).click();
  });

  // Upstream declares this title TWICE (see the file header) — suffixed here
  // with the branch each test actually exercises so Playwright can load them.
  test("should reset the draft join state when the source table changes (metabase#46675) — source table", async ({
    page,
  }) => {
    // change the source table and verify that the state was reset
    await getNotebookStep(page, "data")
      .getByText("Orders", { exact: true })
      .click();
    await miniPicker(page).getByText("Products", { exact: true }).click();

    const joinStep = getNotebookStep(page, "join");
    await expect(
      joinStep.getByLabel("Left table", { exact: true }),
    ).toHaveText("Products");
    await expect(
      joinStep.getByPlaceholder("Search for tables and more...", {
        exact: true,
      }),
    ).toBeVisible();

    // complete the join and make sure the query can be executed
    await getNotebookStep(page, "join")
      .getByPlaceholder("Search for tables and more...", { exact: true })
      .click();
    await pickInMiniPicker(page, "Sample Database", "Orders");
    await visualize(page);
    await expect(tableInteractive(page)).toBeVisible();
  });

  test("should reset the draft join state when the source table changes (metabase#46675) — rhs table", async ({
    page,
  }) => {
    // change the rhs table and verify that the state was reset
    await getNotebookStep(page, "join")
      .getByLabel("Right table", { exact: true })
      .getByText("Reviews", { exact: true })
      .click();
    await miniPicker(page).getByText("Orders", { exact: true }).click();

    const joinStep = getNotebookStep(page, "join");
    await expect(
      joinStep.getByLabel("Left table", { exact: true }),
    ).toHaveText("Orders");
    await expect(
      joinStep.getByLabel("Right table", { exact: true }),
    ).toHaveText("Orders");
    await expect(
      joinStep.getByLabel("Left column", { exact: true }),
    ).toContainText("Pick a column…");

    // complete the join and make sure the query can be executed
    await popover(page).getByText("ID", { exact: true }).click();
    await popover(page).getByText("ID", { exact: true }).click();
    await visualize(page);
    await expect(tableInteractive(page)).toBeVisible();
  });
});
