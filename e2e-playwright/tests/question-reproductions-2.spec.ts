/**
 * Playwright port of
 * e2e/test/scenarios/question-reproductions/reproductions-2.cy.spec.js
 *
 * A grab-bag of independent question-builder bug reproductions. Porting notes:
 * - `H.visitQuestionAdhoc(details)` (simple mode) → visitQuestionAdhoc
 *   (permissions.ts); `{ mode: "notebook" }` → visitQuestionAdhocNotebook
 *   (joins.ts).
 * - Cypress `@dataset` / `@cardQuery` "never fired" assertions (issue 30165)
 *   become response counters attached at the start of the test
 *   (countResponses in support/question-reproductions-2.ts); `@updateCard` /
 *   `@updateQuestion` / `@queryMetadata` / `@searchSource` waits become
 *   waitForResponse promises registered before the triggering action.
 * - `cy.button(name)` → getByRole("button", { name, exact }); `cy.icon(name)`
 *   → the .Icon-<name> locator (ui.ts icon).
 * - `H.createQuestion(..., { visitQuestion: true })` → API create + visitQuestion.
 * - New/spec-local helpers (EXPRESSION_NAME, goToExpressionSidebarVisualization
 *   Settings, saveModifiedQuestion, the response counters/waits) live in
 *   support/question-reproductions-2.ts.
 */
import { test, expect } from "../support/fixtures";
import { createQuestion, createNativeQuestion } from "../support/factories";
import {
  selectFilterOperator,
  visitQuestionAdhocNotebook,
} from "../support/joins";
import { chartPathWithFillColor } from "../support/binning";
import { openVizSettingsSidebar } from "../support/charts";
import {
  commandPalette,
  commandPaletteButton,
  commandPaletteInput,
} from "../support/command-palette";
import { findByDisplayValue } from "../support/filters-repros";
import { openQuestionActions } from "../support/models";
import {
  getNotebookStep,
  openNotebook,
  queryBuilderMain,
  tableHeaderClick,
  visualize,
} from "../support/notebook";
import { focusNativeEditor, typeInNativeEditor } from "../support/native-editor";
import { startNewNativeQuestion } from "../support/native-editor";
import { visitQuestionAdhoc } from "../support/permissions";
import { SAMPLE_DATABASE, SAMPLE_DB_ID } from "../support/sample-data";
import { saveQuestion } from "../support/sharing";
import { saveSavedQuestion } from "../support/viz-charts-repros";
import {
  icon,
  modal,
  newButton,
  popover,
  visitQuestion,
} from "../support/ui";
import {
  EXPRESSION_NAME,
  countResponses,
  goToExpressionSidebarVisualizationSettings,
  isCardQueryResponse,
  isDatasetResponse,
  saveModifiedQuestion,
  waitForCardQueryMetadata,
  waitForSearchContaining,
} from "../support/question-reproductions-2";

const { ORDERS, ORDERS_ID, PRODUCTS, PRODUCTS_ID, PEOPLE } = SAMPLE_DATABASE;

test.describe("issue 23023", () => {
  const questionDetails = {
    display: "table",
    dataset_query: {
      database: SAMPLE_DB_ID,
      query: {
        "source-table": ORDERS_ID,
        joins: [
          {
            fields: [["field", PRODUCTS.CATEGORY, { "join-alias": "Products" }]],
            "source-table": PRODUCTS_ID,
            condition: [
              "=",
              ["field", ORDERS.PRODUCT_ID, null],
              ["field", PRODUCTS.ID, { "join-alias": "Products" }],
            ],
            alias: "Products",
          },
        ],
        fields: [
          ["field", ORDERS.ID, null],
          ["field", ORDERS.PRODUCT_ID, null],
        ],
      },
      type: "query" as const,
    },
  };

  test.beforeEach(async ({ mb }) => {
    await mb.restore();
    await mb.signInAsAdmin();
  });

  test("should show only selected columns in a step preview (metabase#23023)", async ({
    page,
  }) => {
    await visitQuestionAdhoc(page, questionDetails);

    await openNotebook(page);

    await icon(page, "play").nth(1).click();

    await expect(
      page
        .getByTestId("header-cell")
        .filter({ hasText: "Products → Category" })
        .first(),
    ).toBeVisible();
    await expect(
      page.getByTestId("header-cell").filter({ hasText: /Tax/ }),
    ).toHaveCount(0);
  });
});

test.describe("issue 27104", () => {
  const questionDetails = {
    dataset_query: {
      database: SAMPLE_DB_ID,
      query: {
        "source-table": ORDERS_ID,
        aggregation: [["count"]],
        breakout: [["field", PEOPLE.SOURCE, { "source-field": ORDERS.USER_ID }]],
      },
      type: "query" as const,
    },
    display: "bar",
  };

  test.beforeEach(async ({ mb, page }) => {
    await mb.restore();
    await mb.signInAsAdmin();

    await visitQuestionAdhocNotebook(page, questionDetails);
  });

  test("should correctly format the filter operator after the aggregation (metabase#27104)", async ({
    page,
  }) => {
    await page
      .getByTestId("action-buttons")
      .last()
      .getByText("Filter", { exact: true })
      .click();
    await popover(page).getByText("Count", { exact: true }).click();
    // The following line is the main assertion.
    await expect(popover(page).getByRole("button", { name: "Back" })).toHaveText(
      "Count",
    );
    // The rest of the test is not really needed for this reproduction.
    await selectFilterOperator(page, "Greater than");
    const numberInput = popover(page).getByPlaceholder("Enter a number", {
      exact: true,
    });
    await numberInput.fill("0");
    await numberInput.blur();
    await popover(page).getByRole("button", { name: "Add filter" }).click();

    await visualize(page);

    await expect(
      page.getByTestId("qb-filters-panel").getByText("Count is greater than 0"),
    ).toBeVisible();
    // Check bars count
    await expect(chartPathWithFillColor(page, "#509EE3")).toHaveCount(5);
  });
});

test.describe("issue 27462", () => {
  test.beforeEach(async ({ mb }) => {
    await mb.restore();
    await mb.signInAsAdmin();
  });

  test("should be able to select field when double aggregating metabase#27462", async ({
    page,
  }) => {
    const questionDetails = {
      dataset_query: {
        database: SAMPLE_DB_ID,
        type: "query" as const,
        query: {
          "source-table": PRODUCTS_ID,
          aggregation: [["count"]],
          breakout: [["field", PRODUCTS.CATEGORY, null]],
        },
      },
      display: "table",
      visualization_settings: {},
    };

    await visitQuestionAdhocNotebook(page, questionDetails);

    await page.getByRole("button", { name: "Summarize", exact: true }).click();

    await page.getByRole("option", { name: "Sum of ...", exact: true }).click();

    await popover(page).getByRole("option", { name: "Count", exact: true }).click();

    await visualize(page);

    await expect(page.getByText("200", { exact: true })).toBeVisible();
  });
});

test.describe("issue 28221", () => {
  test.beforeEach(async ({ mb }) => {
    await mb.restore();
    await mb.signInAsAdmin();
  });

  test("should be able to select see notebook view even if a question custom field metadata is missing#27462", async ({
    mb,
    page,
  }) => {
    const questionName = "Reproduce 28221";
    const customFieldName = "Non-existing field";
    const questionDetails = {
      name: questionName,
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
        expressions: {
          [customFieldName]: ["field", 9999, null],
        },
      },
    };

    const { id: questionId } = await createQuestion(mb.api, questionDetails);
    await page.goto(`/question/${questionId}/notebook`);

    // The saved-question-header-title data-testid is on the EditableText
    // <textarea> itself, so cy.findByDisplayValue maps to a value assertion.
    const title = page.getByTestId("saved-question-header-title");
    await expect(title).toHaveValue(questionName);
    await expect(title).toBeVisible();

    await expect(page.getByText(customFieldName, { exact: true })).toBeVisible();
  });
});

test.describe("issue 28599", () => {
  test.beforeEach(async ({ mb }) => {
    await mb.restore();
    await mb.signInAsNormalUser();
  });

  test("should not show time granularity footer after question conversion to a model (metabase#28599)", async ({
    mb,
    page,
  }) => {
    const { id } = await createQuestion(mb.api, {
      name: "28599",
      query: {
        "source-table": ORDERS_ID,
        aggregation: [["count"]],
        breakout: [
          [
            "field",
            ORDERS.CREATED_AT,
            { "base-type": "type/DateTime", "temporal-unit": "year" },
          ],
        ],
      },
    });
    await visitQuestion(page, id);

    const updateCard = page.waitForResponse(
      (response) =>
        response.request().method() === "PUT" &&
        /^\/api\/card\/\d+$/.test(new URL(response.url()).pathname),
    );

    const timeseriesChrome = page.getByTestId("timeseries-chrome");
    await expect(timeseriesChrome.getByText("View", { exact: true })).toBeVisible();
    await expect(
      timeseriesChrome.getByText("All time", { exact: true }),
    ).toBeVisible();
    await expect(timeseriesChrome.getByText("by", { exact: true })).toBeVisible();
    await expect(timeseriesChrome.getByText("Year", { exact: true })).toBeVisible();

    await openQuestionActions(page);
    await popover(page).getByText("Turn into a model", { exact: true }).click();
    await modal(page).getByText("Turn this into a model", { exact: true }).click();

    await updateCard;

    await expect(page.getByTestId("time-series-mode-bar")).toHaveCount(0);
  });
});

test.describe("issue 28874", () => {
  const questionDetails = {
    name: "28874",
    display: "pivot",
    dataset_query: {
      database: SAMPLE_DB_ID,
      type: "query" as const,
      query: {
        "source-table": ORDERS_ID,
        aggregation: [["count"]],
        breakout: [
          ["field", ORDERS.CREATED_AT, { "temporal-unit": "year" }],
          ["field", ORDERS.PRODUCT_ID, null],
        ],
      },
    },
  };

  test.beforeEach(async ({ mb }) => {
    await mb.restore();
    await mb.signInAsNormalUser();
  });

  test("should allow to modify a pivot question in the notebook (metabase#28874)", async ({
    page,
  }) => {
    await visitQuestionAdhocNotebook(page, questionDetails);

    await page
      .getByText("Product ID", { exact: true })
      .locator("..")
      .locator(".Icon-close")
      .click();

    await expect(page.getByText("Product ID", { exact: true })).toHaveCount(0);
  });
});

test.describe("issue 30165", () => {
  test.beforeEach(async ({ mb }) => {
    await mb.restore();
    await mb.signInAsAdmin();
  });

  test("should not autorun native queries after updating a question (metabase#30165)", async ({
    page,
  }) => {
    const datasetCount = countResponses(page, isDatasetResponse);
    const cardQueryCount = countResponses(page, isCardQueryResponse);

    const saveModal = page.getByTestId("save-question-modal");

    await startNewNativeQuestion(page);
    await typeInNativeEditor(page, "SELECT * FROM ORDERS");
    // H.saveQuestionToCollection("Q1") — explicitly pick a collection so the
    // save doesn't land in the default dashboard target.
    await saveQuestion(page, "Q1", { path: ["Our analytics"] });
    // The save modal is a portal that overlays the native editor while it
    // animates closed; wait it out before editing again (Cypress's inter-
    // command latency covered this window).
    await expect(saveModal).toHaveCount(0);

    await typeInNativeEditor(page, " WHERE TOTAL < 20");
    await saveSavedQuestion(page);
    await expect(saveModal).toHaveCount(0);

    await typeInNativeEditor(page, " LIMIT 10");
    await saveSavedQuestion(page);
    await expect(saveModal).toHaveCount(0);

    expect(datasetCount()).toBe(0);
    expect(cardQueryCount()).toBe(0);
    await expect(
      queryBuilderMain(page).getByText("Here's where your results will appear", {
        exact: true,
      }),
    ).toBeVisible();
  });
});

test.describe("issue 35290", () => {
  test.beforeEach(async ({ mb }) => {
    await mb.restore();
    await mb.signInAsNormalUser();
  });

  test("should render column settings when source query is a table joined on itself (metabase#35290)", async ({
    mb,
    page,
  }) => {
    const { id: sourceId } = await createQuestion(mb.api, {
      name: "Orders + Orders",
      query: {
        "source-table": ORDERS_ID,
        joins: [
          {
            "source-table": ORDERS_ID,
            condition: [
              "=",
              ["field", ORDERS.ID, null],
              ["field", ORDERS.ID, null],
            ],
            alias: "Orders",
          },
        ],
        limit: 5,
      },
    });

    const { id: questionId } = await createQuestion(mb.api, {
      name: "35290",
      query: { "source-table": `card__${sourceId}` },
    });
    await visitQuestion(page, questionId);

    await openVizSettingsSidebar(page);
    const sidebar = page.getByTestId("chartsettings-sidebar");
    // verify panel is shown and column name is shown
    await expect(sidebar).toContainText("Add or remove columns");
    await expect(sidebar).toContainText("Created At");

    await expect(icon(sidebar, "warning")).toHaveCount(0);
  });
});

test.describe("issue 43216", () => {
  test.beforeEach(async ({ mb }) => {
    await mb.restore();
    await mb.signInAsNormalUser();

    await createNativeQuestion(mb.api, {
      name: "Source question",
      native: { query: "select 1 as A, 2 as B, 3 as C" },
    });
  });

  test("should update source question metadata when it changes (metabase#43216)", async ({
    page,
  }) => {
    await page.goto("/");

    // Create target question
    await newButton(page).click();
    await popover(page).getByText("Question", { exact: true }).click();
    await page
      .getByTestId("mini-picker")
      .getByText("Our analytics", { exact: true })
      .click();
    await page
      .getByTestId("mini-picker")
      .getByText("Source question", { exact: true })
      .click();

    const queryMetadata1 = waitForCardQueryMetadata(page);
    await saveQuestion(page, "Target question");
    await queryMetadata1;

    // Update source question
    const searchSource = waitForSearchContaining(page, "source");
    await commandPaletteButton(page).click();
    await commandPaletteInput(page).pressSequentially("source");
    await searchSource;

    const queryMetadata2 = waitForCardQueryMetadata(page);
    await commandPalette(page)
      .getByText("Source question", { exact: true })
      .click();
    await queryMetadata2;

    await page
      .getByTestId("native-query-editor-container")
      .getByText("Open Editor", { exact: true })
      .click();
    await focusNativeEditor(page);
    await typeInNativeEditor(page, " , 4 as D;", { focus: false });

    const queryMetadata3 = waitForCardQueryMetadata(page);
    await saveSavedQuestion(page);
    await queryMetadata3;
    await page.waitForTimeout(450); // let react process things (flaky test)

    // Assert updated metadata in target question
    const searchTarget = waitForSearchContaining(page, "target");
    await commandPaletteButton(page).click();
    await commandPaletteInput(page).pressSequentially("target");
    await searchTarget;

    const queryMetadata4 = waitForCardQueryMetadata(page);
    await commandPalette(page)
      .getByText("Target question", { exact: true })
      .click();
    await queryMetadata4;

    await expect(page.getByTestId("header-cell").nth(3)).toHaveText("D");
    await openNotebook(page);
    await getNotebookStep(page, "data")
      .getByRole("button", { name: "Pick columns" })
      .click();
    await expect(popover(page).getByText("D", { exact: true })).toBeVisible();
  });
});

test.describe("Custom columns visualization settings", () => {
  const question = {
    name: "30905",
    query: {
      "source-table": ORDERS_ID,
      expressions: {
        [EXPRESSION_NAME]: ["+", 1, 1],
      },
    },
    enable_embedding: true,
  };

  test.beforeEach(async ({ mb, page }) => {
    await mb.restore();
    await mb.signInAsAdmin();
    const { id } = await createQuestion(mb.api, question);
    await visitQuestion(page, id);
  });

  test("should not show 'Save' after modifying minibar settings for a custom column", async ({
    page,
  }) => {
    await goToExpressionSidebarVisualizationSettings(page);
    const miniBar = popover(page).getByLabel("Show a mini bar chart");
    await miniBar.click({ force: true });
    await expect(miniBar).toBeChecked();
    await saveModifiedQuestion(page);
  });

  test("should not show 'Save' after text formatting visualization settings", async ({
    page,
  }) => {
    await goToExpressionSidebarVisualizationSettings(page);

    await popover(page).getByLabel("Display as").click();

    await page.getByRole("option", { name: "Email link" }).first().click();

    const displayValue = await findByDisplayValue(popover(page), "Email link");
    await expect(displayValue).toBeVisible();

    await saveModifiedQuestion(page);
  });

  test("should not show 'Save' after saving viz settings from the custom column dropdown", async ({
    page,
  }) => {
    await tableHeaderClick(page, EXPRESSION_NAME);
    await popover(page)
      .last()
      .getByRole("button", { name: /gear icon/i })
      .click();
    const miniBar = popover(page).last().getByLabel("Show a mini bar chart");
    await miniBar.click({ force: true });
    await expect(miniBar).toBeChecked();

    await saveModifiedQuestion(page);
  });
});
