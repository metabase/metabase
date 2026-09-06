/**
 * Playwright port of
 * e2e/test/scenarios/custom-column/custom-column-reproductions-1.cy.spec.js
 *
 * A reproductions file: every describe is an independent regression guard, so
 * nothing is merged or dropped.
 *
 * Gating, as upstream tags it:
 * - `@external` describes (13751, 27745) drive the QA Postgres containers and
 *   are gated on the deliberate PW_QA_DB_ENABLED (bare QA_DB_ENABLED leaks
 *   truthy from cypress.env.json on dev machines).
 * - `@skip` describes (12445, 14517, 25189, 42949, and 49882-3) are ported in
 *   full but declared with `test.skip(true, ...)`, matching upstream's tag.
 *   12445 and 14517 carry BOTH tags.
 *
 * The custom-column expression editor is CodeMirror, driven with real
 * keystrokes (page.keyboard IS CDP input, the equivalent of the upstream
 * cy.realType), with editor focus asserted before typing.
 *
 * Notable port decisions, recorded rather than hidden:
 * - 27745's `cy.wait("@dataset")` after clicking Sum is satisfied
 *   RETROACTIVELY by the alias `H.visualize()` registered earlier (cy.wait
 *   consumes past responses); it enforces nothing, so it is dropped and the
 *   retrying scalar assertion gates instead.
 * - `click({ force: true })` in Cypress DISPATCHES at the resolved element;
 *   Playwright's moves the real mouse. Those are ported as
 *   `dispatchEvent("click")`.
 */
import type { Page } from "@playwright/test";

import { openOrdersTable, openProductsTable } from "../support/ad-hoc-question";
import type { MetabaseApi } from "../support/api";
import { openVizSettingsSidebar } from "../support/charts";
import {
  dashboardParametersPopover,
  verifyNotebookQuery,
} from "../support/click-behavior";
import {
  customExpressionCompletion,
  customExpressionCompletions,
  customExpressionName,
  expectCustomExpressionValue,
  focusCustomExpressionEditor,
} from "../support/custom-column-3";
import {
  acceptCompletionWith,
  blurExpressionEditor,
  enterCustomColumnDetails,
  focusedElement,
  pasteIntoExpressionEditor,
  previewExpressionStep,
  resetColorsTable,
  selectedCompletion,
  syncWritableDbAndWaitForTable,
  typeInEditor,
  unselectFieldsPickerColumn,
} from "../support/custom-column-reproductions-1";
import {
  editDashboard,
  filterWidget,
  getDashboardCard,
  saveDashboard,
  selectDashboardFilter,
  setFilter,
} from "../support/dashboard";
import {
  createNativeQuestion,
  createQuestion,
  createQuestionAndDashboard,
} from "../support/factories";
import { createSegment } from "../support/filter-bulk";
import { clauseStepPopover } from "../support/filters";
import { test, expect } from "../support/fixtures";
import {
  addCustomColumn,
  selectFilterOperator,
  visitQuestionAdhocNotebook,
} from "../support/joins";
import { tableInteractive } from "../support/models";
import { assertTableData } from "../support/multiple-column-breakouts";
import {
  fieldValuesCombobox,
  multiAutocompleteInput,
} from "../support/native-filters";
import {
  expressionEditorWidget,
  getNotebookStep,
  miniPicker,
  openNotebook,
  queryBuilderMain,
  startNewQuestion,
  tableHeaderClick,
  tableHeaderColumn,
  visualize,
} from "../support/notebook";
import { visitQuestionAdhoc } from "../support/permissions";
import { tableInteractiveBody } from "../support/question-new";
import { SAMPLE_DATABASE, SAMPLE_DB_ID } from "../support/sample-data";
import { saveQuestion } from "../support/sharing";
import { icon, modal, newButton, popover, visitDashboard, visitQuestion } from "../support/ui";

const { PEOPLE, PEOPLE_ID, PRODUCTS, PRODUCTS_ID, ORDERS, ORDERS_ID } =
  SAMPLE_DATABASE;

// Mirrors WRITABLE_DB_ID in e2e/support/cypress_data.js.
const WRITABLE_DB_ID = 2;

const QA_DB_SKIP_REASON =
  "Requires the QA Postgres database + its snapshot (set PW_QA_DB_ENABLED)";

/** Port of the "Done" button inside the expression-editor popover. */
function doneButton(page: Page) {
  return expressionEditorWidget(page).getByRole("button", {
    name: "Done",
    exact: true,
  });
}

test.describe("issue 12445", () => {
  // Upstream tags: ["@external", "@skip"] — skipped there, skipped here.
  const CC_NAME = "Abbr";

  test.beforeEach(async ({ mb }) => {
    test.skip(true, "Upstream @skip tag (also @external, mysql-8)");
    await mb.restore("mysql-8");
    await mb.signInAsAdmin();
  });

  test("should correctly apply substring for a custom column (metabase#12445)", async ({
    page,
    mb,
  }) => {
    // H.withDatabase(2, ...) resolves the QA MySQL8 database's PEOPLE ids.
    const response = await mb.api.get("/api/database/2/metadata");
    const metadata = (await response.json()) as {
      tables: { name: string; id: number; fields: { name: string; id: number }[] }[];
    };
    const peopleTable = metadata.tables.find((table) => table.name === "PEOPLE");
    if (!peopleTable) {
      throw new Error("PEOPLE table not found on database 2");
    }
    const sourceField = peopleTable.fields.find(
      (field) => field.name === "SOURCE",
    );

    const { id } = await createQuestion(mb.api, {
      name: "12445",
      database: 2,
      query: {
        "source-table": peopleTable.id,
        breakout: [["expression", CC_NAME]],
        expressions: {
          // 4 letter abbreviation
          [CC_NAME]: ["substring", ["field", sourceField?.id, null], 1, 4],
        },
      },
    });
    await visitQuestion(page, id);

    await expect(page.getByText(CC_NAME, { exact: true })).toBeVisible();
    await expect(page.getByText("Goog", { exact: true })).toBeVisible();
  });
});

test.describe("issue 13751", () => {
  // Upstream tag: "@external" (QA Postgres12).
  const CC_NAME = "C-States";
  const PG_DB_NAME = "QA Postgres12";

  test.beforeEach(async ({ mb, page }) => {
    test.skip(!process.env.PW_QA_DB_ENABLED, QA_DB_SKIP_REASON);
    await mb.restore("postgres-12");
    await mb.signInAsAdmin();

    await startNewQuestion(page);
    const picker = miniPicker(page);
    await expect(picker.getByText(PG_DB_NAME, { exact: true })).toBeVisible();
    await picker.getByText(PG_DB_NAME, { exact: true }).click();
    await picker.getByText("People", { exact: true }).click();
  });

  test("should allow using strings in filter based on a custom column (metabase#13751)", async ({
    page,
  }) => {
    await addCustomColumn(page);
    await enterCustomColumnDetails(page, {
      formula: 'regexExtract([State], "^C[A-Z]")',
      name: CC_NAME,
    });
    await expect(doneButton(page)).toBeEnabled();
    await doneButton(page).click();

    await getNotebookStep(page, "filter").getByText(/Add filter/).click();
    await popover(page).getByText(CC_NAME, { exact: true }).click();
    await selectFilterOperator(page, "Is");

    const clausePopover = clauseStepPopover(page);
    const textInput = clausePopover.getByPlaceholder("Enter some text", {
      exact: true,
    });
    await textInput.click();
    await page.keyboard.type("CO");
    // Submitting while a MultiAutocomplete/PillsInput holds focus silently
    // does nothing (the blur handler re-renders the form under the mouseup).
    await textInput.blur();
    await clausePopover
      .getByRole("button", { name: "Add filter", exact: true })
      .click();

    await visualize(page);

    await expect(
      queryBuilderMain(page).getByText("Arnold Adams", { exact: true }),
    ).toBeVisible();
  });
});

test.describe("postgres > question > custom columns", () => {
  // Upstream tags: ["@external", "@skip"] — skipped there, skipped here.
  const PG_DB_NAME = "QA Postgres12";

  // The literal string under test is `(?<=\/\/)[^\/]*`; upstream escapes the
  // escapes so Prettier/Cypress don't eat them.
  const ESCAPED_REGEX = "(?<=\\/\\/)[^\\/]*";

  test.beforeEach(async ({ mb, page }) => {
    test.skip(true, "Upstream @skip tag (also @external, postgres-12)");
    await mb.restore("postgres-12");
    await mb.signInAsAdmin();

    await startNewQuestion(page);
    await page.getByText(PG_DB_NAME, { exact: true }).click();
    await page.getByText("People", { exact: true }).click();
  });

  test("should not remove regex escape characters (metabase#14517)", async ({
    page,
  }) => {
    await page.getByLabel("Custom Column", { exact: true }).click();
    const scope = popover(page);
    await scope.locator("[contenteditable='true']").click();
    await page.keyboard.type(`regexExtract([State], "${ESCAPED_REGEX}")`);
    await scope.locator("[contenteditable='true']").blur();

    // It removes escaped characters already on blur. Reported failing on v0.36.4.
    await expect(scope.getByText(ESCAPED_REGEX, { exact: false })).toBeVisible();
  });
});

test.describe("issue 14843", () => {
  const CC_NAME = "City Length";

  const questionDetails = {
    name: "14843",
    query: {
      "source-table": PEOPLE_ID,
      expressions: { [CC_NAME]: ["length", ["field", PEOPLE.CITY, null]] },
    },
  };

  test.beforeEach(async ({ mb }) => {
    await mb.restore();
    await mb.signInAsAdmin();
  });

  test("should correctly filter custom column by 'Not equal to' (metabase#14843)", async ({
    page,
    mb,
  }) => {
    const { id } = await createQuestion(mb.api, questionDetails);
    await visitQuestion(page, id);
    await openNotebook(page);

    // H.filter({ mode: "notebook" })
    await page.getByTestId("action-buttons").locator(".Icon-filter").click();
    await popover(page).getByText(CC_NAME, { exact: true }).click();
    await selectFilterOperator(page, "Not equal to");

    const clausePopover = clauseStepPopover(page);
    const valueInput = multiAutocompleteInput(clausePopover);
    await valueInput.click();
    await page.keyboard.type("3");
    await valueInput.blur();
    await clausePopover
      .getByRole("button", { name: "Add filter", exact: true })
      .click();

    await visualize(page);

    await expect(
      page.getByText(`${CC_NAME} is not equal to 3`, { exact: true }),
    ).toBeVisible();
    await expect(page.getByText("Rye", { exact: true })).toHaveCount(0);
  });
});

test.describe("issue 18069", () => {
  const questionDetails = {
    name: "18069",
    query: {
      "source-table": PRODUCTS_ID,
      expressions: {
        CC_Category: ["field", PRODUCTS.CATEGORY, null],
        CC_LowerVendor: ["lower", ["field", PRODUCTS.VENDOR, null]],
        CC_UpperTitle: ["upper", ["field", PRODUCTS.TITLE, null]],
        CC_HalfPrice: ["/", ["field", PRODUCTS.PRICE, null], 2],
        CC_ScaledRating: ["*", 1.5, ["field", PRODUCTS.RATING, null]],
      },
    },
  };

  test.beforeEach(async ({ mb, page }) => {
    await mb.restore();
    await mb.signInAsAdmin();

    const { id } = await createQuestion(mb.api, questionDetails);
    await page.goto(`/question/${id}/notebook`);
  });

  test("should not allow choosing text fields for SUM (metabase#18069)", async ({
    page,
  }) => {
    // H.summarize({ mode: "notebook" })
    await page.getByTestId("action-buttons").locator(".Icon-sum").click();
    await page.getByText("Sum of ...", { exact: true }).click();

    const scope = popover(page);
    // regular fields
    await expect(scope.getByText("Price", { exact: true })).toBeVisible();
    await expect(scope.getByText("Rating", { exact: true })).toBeVisible();

    // custom columns not suitable for SUM
    await expect(scope.getByText("CC_Category", { exact: true })).toHaveCount(0);
    await expect(scope.getByText("CC_LowerVendor", { exact: true })).toHaveCount(
      0,
    );
    await expect(scope.getByText("CC_UpperTitle", { exact: true })).toHaveCount(
      0,
    );

    // custom columns suitable for SUM
    await expect(scope.getByText("CC_HalfPrice", { exact: true })).toBeVisible();
    await scope.getByText("CC_ScaledRating", { exact: true }).click();

    await visualize(page);

    await expect(page.getByText("1,041.45", { exact: true })).toBeVisible();
  });
});

test.describe("issue 18747", () => {
  const questionDetails = {
    name: "18747",
    query: {
      "source-table": ORDERS_ID,
      expressions: { Quantity_2: ["field", ORDERS.QUANTITY, null] },
    },
  };

  test.beforeEach(async ({ mb, page }) => {
    await mb.restore();
    await mb.signInAsAdmin();

    const { dashboardId, dashcardId, questionId } =
      await createQuestionAndDashboard(mb.api, { questionDetails });
    // Ported literally, including the legacy `cards` key the current API
    // ignores (upstream's PUT is effectively a no-op resize).
    await mb.api.put(`/api/dashboard/${dashboardId}`, {
      cards: [
        {
          id: dashcardId,
          card_id: questionId,
          row: 0,
          col: 0,
          size_x: 16,
          size_y: 8,
        },
      ],
    });
    await visitDashboard(page, mb.api, dashboardId);
  });

  test("should correctly filter the table with a number parameter mapped to the custom column Quantity_2", async ({
    page,
  }) => {
    await editDashboard(page);
    await setFilter(page, "Number", "Equal to");

    // mapParameterToCustomColumn
    await page.getByTestId("dashcard-container").getByText(/Select…/).click();
    await popover(page)
      .getByText(/Quantity_2/)
      .first()
      .dispatchEvent("click");

    await saveDashboard(page);
    await expect(
      page.getByText("You're editing this dashboard.", { exact: true }),
    ).toHaveCount(0);

    // addValueToParameterFilter
    await filterWidget(page).click();
    const parametersPopover = dashboardParametersPopover(page);
    const combobox = fieldValuesCombobox(parametersPopover);
    await combobox.click();
    await page.keyboard.type("14");
    await combobox.blur();
    await parametersPopover
      .getByRole("button", { name: "Add filter", exact: true })
      .click();

    await expect(tableInteractiveBody(page).getByRole("row")).toHaveCount(1);

    // check that the parameter value is parsed correctly on page load
    await page.reload();
    await expect(page.locator(".LoadingSpinner")).toHaveCount(0);

    await expect(tableInteractiveBody(page).getByRole("row")).toHaveCount(1);
  });
});

test.describe("issue 18814", () => {
  const ccName = "Custom Created At";

  const questionDetails = {
    name: "18814",
    query: {
      "source-query": {
        "source-table": ORDERS_ID,
        aggregation: [["count"]],
        breakout: [["field", ORDERS.CREATED_AT, { "temporal-unit": "year" }]],
      },
      expressions: {
        [ccName]: ["field", "CREATED_AT", { "base-type": "type/DateTime" }],
      },
    },
  };

  test.beforeEach(async ({ mb, page }) => {
    await mb.restore();
    await mb.signInAsAdmin();

    const { id } = await createQuestion(mb.api, questionDetails);
    await visitQuestion(page, id);
  });

  test("should be able to use a custom column in aggregation for a nested query (metabase#18814)", async ({
    page,
  }) => {
    await openNotebook(page);

    await icon(page, "sum").click();
    await page.getByText("Count of rows", { exact: true }).click();

    await page.getByText("Pick a column to group by", { exact: true }).click();
    await popover(page)
      .getByText(new RegExp(escapeRegExp(ccName)))
      .first()
      .click();

    await visualize(page);

    await expect(page.getByTestId("query-visualization-root")).toContainText(
      "2025",
    );
  });
});

test.describe("issue 19744", () => {
  const questionDetails = {
    dataset_query: {
      type: "query" as const,
      query: {
        "source-query": {
          "source-table": PRODUCTS_ID,
          aggregation: [
            ["count"],
            ["sum", ["field", PRODUCTS.PRICE, null]],
            ["sum", ["field", PRODUCTS.RATING, null]],
          ],
          breakout: [["field", PRODUCTS.CATEGORY, null]],
        },
        expressions: { Math: ["+", 1, 1] },
      },
      database: SAMPLE_DB_ID,
    },
    display: "bar",
  };

  test.beforeEach(async ({ mb }) => {
    await mb.restore();
    await mb.signInAsAdmin();
  });

  test("custom column after aggregation shouldn't limit or change the behavior of dashboard filters (metabase#19744)", async ({
    page,
  }) => {
    // For this specific repro, it's crucial to first visit the question in
    // order to load the `results_metadata`...
    await visitQuestionAdhoc(page, questionDetails);
    // ...and then to save it using the UI.
    await saveQuestion(page, "19744");

    await setFilter(page, "Date picker", "All Options");

    await getDashboardCard(page, 1).getByText(/Select…/).click();
    await expect(
      popover(page)
        .getByText(/Created At/)
        .first(),
    ).toBeVisible();
  });
});

test.describe("issue 19745", () => {
  const questionDetails = {
    display: "table",
    query: {
      "source-query": {
        "source-table": PRODUCTS_ID,
        aggregation: [
          ["count"],
          ["sum", ["field", PRODUCTS.PRICE, { "base-type": "type/Float" }]],
        ],
        breakout: [["field", PRODUCTS.CATEGORY, { "base-type": "type/Text" }]],
      },
      fields: [
        ["field", PRODUCTS.CATEGORY, { "base-type": "type/Text" }],
        ["field", "sum", { "base-type": "type/Float" }],
        ["expression", "Custom Column"],
      ],
      expressions: { "Custom Column": ["+", 1, 1] },
    },
  };

  const filterDetails = {
    id: "b6f1865b",
    name: "Date filter",
    slug: "date",
    type: "date/month-year",
    sectionId: "date",
  };

  const dashboardDetails = { name: "Filters", parameters: [filterDetails] };

  async function updateQuestion(page: Page) {
    const updated = page.waitForResponse(
      (response) =>
        response.request().method() === "PUT" &&
        /^\/api\/card\/[^/]+$/.test(new URL(response.url()).pathname),
    );
    await page.getByText("Save", { exact: true }).first().click();
    await page
      .getByTestId("save-question-modal")
      .getByText("Save", { exact: true })
      .click();
    await updated;
  }

  async function updateQuestionAndSelectFilter(
    page: Page,
    api: MetabaseApi,
    updateExpressions: () => Promise<void>,
  ) {
    const { questionId, dashboardId } = await createQuestionAndDashboard(api, {
      questionDetails,
      dashboardDetails,
    });
    await visitQuestion(page, questionId);

    // this should modify the query and remove the second stage
    await openNotebook(page);
    await updateExpressions();
    await visualize(page);
    await openVizSettingsSidebar(page);
    await page
      .getByRole("button", { name: "Add or remove columns", exact: true })
      .click();
    const countCheckbox = page.getByLabel("Count", { exact: true });
    await expect(countCheckbox).not.toBeChecked();
    await countCheckbox.click();
    await updateQuestion(page);

    // as we select all columns in the first stage of the query, it should be
    // possible to map a filter to a selected column
    await visitDashboard(page, api, dashboardId);
    await editDashboard(page);
    await page.getByText("Date filter", { exact: true }).click();
    await selectDashboardFilter(getDashboardCard(page), "Created At");
    await saveDashboard(page);
  }

  async function removeExpression(page: Page, name: string) {
    await getNotebookStep(page, "expression", { stage: 1 })
      .getByText(name, { exact: true })
      .locator(".Icon-close")
      .click();
  }

  async function removeAllExpressions(page: Page) {
    await getNotebookStep(page, "expression", { stage: 1 })
      .getByLabel("Remove step", { exact: true })
      .dispatchEvent("click");
  }

  test.beforeEach(async ({ mb }) => {
    await mb.restore();
    await mb.signInAsAdmin();
  });

  test("should unwrap the nested query when removing the last expression (metabase#19745)", async ({
    page,
    mb,
  }) => {
    await updateQuestionAndSelectFilter(page, mb.api, () =>
      removeExpression(page, "Custom Column"),
    );
  });

  test("should unwrap the nested query when removing all expressions (metabase#19745)", async ({
    page,
    mb,
  }) => {
    await updateQuestionAndSelectFilter(page, mb.api, () =>
      removeAllExpressions(page),
    );
  });
});

test.describe("issue 20229", () => {
  const questionDetails = {
    name: "20229",
    query: {
      "source-table": ORDERS_ID,
      expressions: {
        Adjective: [
          "case",
          [[[">", ["field", ORDERS.TOTAL, null], 100], "expensive"]],
          { default: "cheap" },
        ],
      },
      limit: 10,
    },
  };

  async function ccAssertion(page: Page) {
    // Scoped to the rendered table header rather than the whole page:
    // useMeasureColumnWidths renders a hidden (visibility:hidden, off-screen)
    // clone of every header cell into a detached container on document.body
    // while it sizes the columns. Playwright locators match hidden nodes, so a
    // page-wide getByText("Adjective") hits 2 elements and dies on strict mode
    // before the clone is torn down. Cypress never saw this because it retries
    // findByText until the clone is gone.
    await expect(tableHeaderColumn(page, "Adjective")).toBeVisible();
    await expect(page.getByText(/expensive/).first()).toBeVisible();
    await expect(page.getByText(/cheap/).first()).toBeVisible();
  }

  test.beforeEach(async ({ mb, page }) => {
    await mb.restore();
    await mb.signInAsAdmin();

    const { id } = await createQuestion(mb.api, questionDetails);
    await visitQuestion(page, id);
  });

  test("should display custom column regardless of how many columns are selected (metabase#20229)", async ({
    page,
  }) => {
    await ccAssertion(page);

    // Switch to the notebook view to deselect at least one column
    await openNotebook(page);

    await page.getByTestId("fields-picker").click();
    await unselectFieldsPickerColumn(popover(page), "Tax");

    await visualize(page);

    await ccAssertion(page);
  });
});

test.describe("issue 21135", () => {
  const questionDetails = {
    name: "21135",
    query: {
      "source-table": PRODUCTS_ID,
      limit: 5,
      expressions: { Price: ["+", ["field", PRODUCTS.PRICE, null], 2] },
    },
  };

  test.beforeEach(async ({ mb, page }) => {
    await mb.restore();
    await mb.signInAsAdmin();
    const { id } = await createQuestion(mb.api, questionDetails);
    await visitQuestion(page, id);
    await openNotebook(page);
  });

  test("should handle cc with the same name as the table column (metabase#21135)", async ({
    page,
  }) => {
    await page
      .getByTestId("notebook-cell-item")
      .filter({ hasText: /Price/ })
      .first()
      .click();
    await page.getByRole("button", { name: "Update", exact: true }).click();

    await previewExpressionStep(page);

    // Narrow the results to the preview area to avoid a false positive.
    const preview = page.getByTestId("preview-root");
    await expect(
      preview.getByText("Rustic Paper Wallet", { exact: true }),
    ).toBeVisible();
    await expect(preview.getByText("Price", { exact: true })).toHaveCount(2);
    await expect(preview.getByText("29.46", { exact: true })).toBeVisible(); // actual Price column
    await expect(preview.getByText("31.46", { exact: true })).toBeVisible(); // custom column
  });
});

test.describe("issue 21513", () => {
  test.beforeEach(async ({ mb }) => {
    await mb.restore();
    await mb.signInAsAdmin();
  });

  test("should handle cc with the same name as an aggregation function (metabase#21513)", async ({
    page,
  }) => {
    await openProductsTable(page, { mode: "notebook" });
    await page.getByTestId("action-buttons").locator(".Icon-sum").click();
    await popover(page).getByText("Count of rows", { exact: true }).click();

    await page.getByText("Pick a column to group by", { exact: true }).click();
    await popover(page).getByText("Category", { exact: true }).click();

    await page.getByText("Custom column", { exact: true }).click();
    await enterCustomColumnDetails(page, {
      formula: "[Count] * 2",
      name: "Double Count",
    });
    await expect(doneButton(page)).toBeEnabled();
  });
});

test.describe("issue 23862", () => {
  const questionDetails = {
    name: "23862",
    query: {
      "source-table": ORDERS_ID,
      expressions: {
        CC: [
          "case",
          [[[">", ["field", ORDERS.TOTAL, null], 10], "Large"]],
          { default: "Small" },
        ],
      },
      aggregation: [["sum", ["field", ORDERS.TOTAL, null]]],
      breakout: [["expression", "CC"]],
    },
  };

  test.beforeEach(async ({ mb }) => {
    await mb.restore();
    await mb.signInAsAdmin();
  });

  test("should group by a custom column and work in a nested question (metabase#23862)", async ({
    page,
    mb,
  }) => {
    const { id } = await createQuestion(mb.api, questionDetails);

    // Port of visitQuestionAdhoc's `callback` option: the dataset response
    // must carry no error. Registered before the navigation.
    const dataset = page.waitForResponse(
      (response) =>
        response.request().method() === "POST" &&
        new URL(response.url()).pathname === "/api/dataset",
    );
    await visitQuestionAdhoc(page, {
      dataset_query: {
        type: "query",
        query: { "source-table": `card__${id}` },
        database: SAMPLE_DB_ID,
      },
      display: "table",
    });
    const body = (await (await dataset).json()) as { error?: unknown };
    expect(body.error).toBeUndefined();

    await expect(page.getByText("Small", { exact: true })).toBeVisible();
    await expect(page.getByText("-36.53", { exact: true })).toBeVisible();
  });
});

test.describe("issue 24922", () => {
  const segmentDetails = {
    name: "OrdersSegment",
    description: "All orders with a total under $100.",
    definition: {
      "source-table": ORDERS_ID,
      aggregation: [["count"]],
      filter: ["<", ["field", ORDERS.TOTAL, null], 100],
    },
  };

  const customColumnDetails = {
    name: "CustomColumn",
    formula: 'case([OrdersSegment], "Segment", "Other")',
  };

  test.beforeEach(async ({ mb }) => {
    await mb.restore();
    await mb.signInAsAdmin();
    await createSegment(mb.api, segmentDetails);
  });

  test("should allow segments in case custom expressions (metabase#24922)", async ({
    page,
  }) => {
    await openOrdersTable(page, { mode: "notebook" });

    await page.getByText("Custom column", { exact: true }).click();
    await enterCustomColumnDetails(page, customColumnDetails);
    await doneButton(page).click();

    await visualize(page);
    await expect(
      page.getByText("CustomColumn", { exact: true }).first(),
    ).toBeVisible();
  });
});

test.describe("issue 25189", () => {
  // Upstream tag: "@skip".
  const ccTable = "Custom Created";
  const ccFunction = "Custom Total";

  const questionDetails = {
    name: "25189",
    query: {
      "source-table": ORDERS_ID,
      limit: 5,
      expressions: {
        [ccTable]: ["field", ORDERS.CREATED_AT, null],
        [ccFunction]: [
          "case",
          [[[">", ["field", ORDERS.TOTAL, null], 100], "Yay"]],
          { default: "Nay" },
        ],
      },
    },
  };

  test.beforeEach(async ({ mb, page }) => {
    test.skip(true, "Upstream @skip tag");
    await mb.restore();
    await mb.signInAsAdmin();

    const { id: baseQuestionId } = await createQuestion(mb.api, questionDetails);
    const { id } = await createQuestion(mb.api, {
      name: "Nested 25189",
      query: { "source-table": `card__${baseQuestionId}` },
    });
    await visitQuestion(page, id);
  });

  test("custom column referencing only a single column should not be dropped in a nested question (metabase#25189)", async ({
    page,
  }) => {
    // 1. Column should not be dropped
    const headerCells = page.getByTestId("header-cell");
    await expect(headerCells.filter({ hasText: ccFunction })).not.toHaveCount(0);
    await expect(headerCells.filter({ hasText: ccTable })).not.toHaveCount(0);

    // 2. We shouldn't see duplication in the bulk filter modal
    const dataset = page.waitForResponse(
      (response) =>
        response.request().method() === "POST" &&
        new URL(response.url()).pathname === "/api/dataset",
    );
    await page
      .getByTestId("qb-header-action-panel")
      .getByText(/Filter/)
      .click();
    const filterModal = modal(page);
    // Implicit assertions — these fail if more than one element is found.
    await expect(
      filterModal.getByText(ccFunction, { exact: true }),
    ).toHaveCount(1);
    await expect(filterModal.getByText(ccTable, { exact: true })).toHaveCount(1);

    await filterModal.getByText("Today", { exact: true }).click();
    await filterModal
      .getByRole("button", { name: "Apply Filters", exact: true })
      .click();

    await dataset;
    await expect(page.getByText("No results", { exact: true })).toBeVisible();

    // 3. We shouldn't see duplication in the breakout fields
    await page
      .getByTestId("qb-header-action-panel")
      .getByText(/Summarize/)
      .click();
    const sidebar = page.getByTestId("sidebar-content");
    await expect(sidebar.getByText(ccFunction, { exact: true })).toHaveCount(1);
    await expect(sidebar.getByText(ccTable, { exact: true })).toHaveCount(1);
  });
});

test.describe("issue 27745 (postgres)", () => {
  // Upstream tag: "@external". The dialect loop has mysql commented out.
  const tableName = "colors27745";

  test.beforeEach(async ({ mb }) => {
    test.skip(!process.env.PW_QA_DB_ENABLED, QA_DB_SKIP_REASON);
    await mb.restore("postgres-writable");
    await mb.signInAsAdmin();

    await resetColorsTable();
    await syncWritableDbAndWaitForTable(mb.api, WRITABLE_DB_ID, tableName);
  });

  test("should display all summarize options if the only numeric field is a custom column (metabase#27745)", async ({
    page,
  }) => {
    await startNewQuestion(page);

    const picker = miniPicker(page);
    await expect(picker).toBeVisible();
    // cy.realType types at document.activeElement; the data step's own search
    // input is autofocused when the picker opens and lives OUTSIDE the
    // mini-picker dropdown, so the upstream `.within()` scope is decorative.
    await expect(
      page.getByPlaceholder("Search for tables and more..."),
    ).toBeFocused();
    const search = page.waitForResponse((response) =>
      new URL(response.url()).pathname.startsWith("/api/search"),
    );
    await page.keyboard.type("colors", { delay: 20 });
    await search;
    await picker
      .getByText(/colors/i)
      .first()
      .click();

    await page.getByLabel("Custom column", { exact: true }).click();
    await enterCustomColumnDetails(page, {
      formula: "case([ID] > 1, 25, 5)",
      name: "Numeric",
    });
    await doneButton(page).click();

    await visualize(page);

    await tableHeaderClick(page, "Numeric");
    await popover(page)
      .getByText(/^Sum$/)
      .click();

    // Upstream's `cy.wait("@dataset")` here is satisfied retroactively by
    // H.visualize()'s alias, so it enforces nothing — the retrying assertion
    // below is the real gate.
    await expect(page.getByTestId("scalar-value")).toHaveText("55");

    const rightSidebar = page.getByTestId("sidebar-right");
    await expect(rightSidebar).toBeVisible();
    await expect(rightSidebar.getByTestId("aggregation-item")).toContainText(
      "Sum of Numeric",
    );
  });
});

// broken. see https://github.com/metabase/metabase/issues/55673
test.describe("issue 42949", () => {
  // Upstream tag: "@skip".
  test.beforeEach(async ({ mb }) => {
    test.skip(true, "Upstream @skip tag (metabase#55673)");
    await mb.restore();
    await mb.signInAsAdmin();
  });

  test("should correctly show available shortcuts for date and number columns (metabase#42949)", async ({
    page,
    mb,
  }) => {
    const { id } = await createNativeQuestion(mb.api, {
      native: {
        query: `
            SELECT DATE '2024-05-21' AS created_at, null as v
            UNION ALL SELECT DATE '2024-05-20', 1
            UNION ALL SELECT DATE '2024-05-19', 2
            ORDER BY created_at
          `,
      },
    });
    await visitQuestion(page, id);
    await page
      .getByTestId("qb-header")
      .getByText("Explore results", { exact: true })
      .click();

    // Verify header drills - CREATED_AT
    await tableHeaderClick(page, "CREATED_AT");
    await expect(
      popover(page).getByText("Extract day, month…", { exact: true }),
    ).toBeVisible();
    await expect(
      popover(page).getByText("Combine columns", { exact: true }),
    ).toHaveCount(0);
    await page.keyboard.press("Escape");
    await expect(popover(page)).toHaveCount(0);

    // Verify header drills - V
    await tableHeaderClick(page, "V");
    await expect(
      popover(page).getByText("Extract part of column", { exact: true }),
    ).toHaveCount(0);
    await expect(
      popover(page).getByText("Combine columns", { exact: true }),
    ).toHaveCount(0);
    await page.keyboard.press("Escape");
    await expect(popover(page)).toHaveCount(0);

    // Verify plus button - extract column
    await page.getByRole("button", { name: "Add column", exact: true }).click();
    await popover(page)
      .getByText("Extract part of column", { exact: true })
      .click();
    await popover(page).getByText("CREATED_AT", { exact: true }).click();
    const extractPopover = popover(page);
    await expect(
      extractPopover.getByText("Day of month", { exact: true }),
    ).toBeVisible();
    await expect(
      extractPopover.getByText("Day of week", { exact: true }),
    ).toBeVisible();
    await expect(
      extractPopover.getByText("Month of year", { exact: true }),
    ).toBeVisible();
    await expect(
      extractPopover.getByText("Quarter of year", { exact: true }),
    ).toBeVisible();
    await expect(extractPopover.getByText("Year", { exact: true })).toBeVisible();
    await extractPopover.getByText("Year", { exact: true }).click();

    await expect(page.getByTestId("header-cell").nth(2)).toHaveText("Year");

    // Verify plus button - combine columns
    await page.getByRole("button", { name: "Add column", exact: true }).click();
    await popover(page).getByText("Combine columns", { exact: true }).click();
    await popover(page).getByTestId("column-input").first().click();
    const columnPopover = popover(page).last();
    await expect(
      columnPopover.getByText("CREATED_AT", { exact: true }),
    ).toBeVisible();
    await expect(columnPopover.getByText("V", { exact: true })).toBeVisible();
    await expect(columnPopover.getByText("Year", { exact: true })).toBeVisible();
    await columnPopover.getByText("Year", { exact: true }).click();
    await popover(page)
      .getByRole("button", { name: "Done", exact: true })
      .click();

    await expect(page.getByTestId("header-cell").nth(3)).toHaveText(
      "Combined Year, V",
    );

    const cells = page.getByTestId("cell-data");
    await expect(cells.nth(6)).toHaveText("2,024");
    await expect(cells.nth(7)).toHaveText("2024 2");
    await expect(cells.nth(10)).toHaveText("2,024");
    await expect(cells.nth(11)).toHaveText("2024 1");
    await expect(cells.nth(13)).toHaveText("2,024");
    await expect(cells.nth(14)).toHaveText("2024 ");
  });

  test("should correctly show available shortcuts for a number column (metabase#42949)", async ({
    page,
    mb,
  }) => {
    const { id } = await createNativeQuestion(mb.api, {
      native: { query: "select 1 as n" },
    });
    await visitQuestion(page, id);

    await page
      .getByTestId("qb-header")
      .getByText("Explore results", { exact: true })
      .click();
    await page.getByLabel("Switch to data", { exact: true }).click();

    // Verify header drills
    await tableHeaderClick(page, "N");
    await expect(
      popover(page).getByText("Extract part of column", { exact: true }),
    ).toHaveCount(0);
    await expect(
      popover(page).getByText("Combine columns", { exact: true }),
    ).toHaveCount(0);
    await page.keyboard.press("Escape");
    await expect(popover(page)).toHaveCount(0);

    // Verify plus button
    await page.getByRole("button", { name: "Add column", exact: true }).click();
    await expect(
      popover(page).getByText("Extract part of column", { exact: true }),
    ).toHaveCount(0);
    await popover(page).getByText("Combine columns", { exact: true }).click();
    await popover(page).getByTestId("column-input").first().click();
    await expect(
      popover(page).last().getByText("N", { exact: true }),
    ).toBeVisible();
  });

  test("should correctly show available shortcuts for a string column (metabase#42949)", async ({
    page,
    mb,
  }) => {
    const { id } = await createNativeQuestion(mb.api, {
      native: { query: "select 'abc'" },
    });
    await visitQuestion(page, id);

    await page
      .getByTestId("qb-header")
      .getByText("Explore results", { exact: true })
      .click();
    await page.getByLabel("Switch to data", { exact: true }).click();

    // Verify header drills
    await tableHeaderClick(page, "'abc'");
    await expect(
      popover(page).getByText("Extract part of column", { exact: true }),
    ).toHaveCount(0);
    await expect(
      popover(page).getByText("Combine columns", { exact: true }),
    ).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(popover(page)).toHaveCount(0);

    // Verify plus button
    await page.getByRole("button", { name: "Add column", exact: true }).click();
    await expect(
      popover(page).getByText("Extract part of column", { exact: true }),
    ).toHaveCount(0);
    await popover(page).getByText("Combine columns", { exact: true }).click();
    await popover(page).getByTestId("column-input").first().click();
    await expect(
      popover(page).last().getByText("'abc'", { exact: true }),
    ).toBeVisible();
  });
});

test.describe("issue 49342", () => {
  test.beforeEach(async ({ mb }) => {
    await mb.restore();
    await mb.signInAsNormalUser();
  });

  test("should not be possible to leave the expression input with the Tab key ", async ({
    page,
  }) => {
    // This test used to be a repro for #49342, but the product feature changed
    // so that the expression input can no longer be tabbed out of.

    await openOrdersTable(page, { mode: "notebook" });
    await page.getByLabel("Custom column", { exact: true }).click();
    // The `{Enter}` in upstream's formula IS a completion accept — split out so
    // the 300ms CodeMirror settle applies (see acceptCompletionWith).
    await enterCustomColumnDetails(page, { formula: "[Tot", blur: false });
    await acceptCompletionWith(page, "Enter");
    await page.keyboard.press("Tab");
    await expectCustomExpressionValue(page, "[Total]  ");
    await expect(customExpressionName(page)).not.toBeFocused();

    // Shift-tab from name input should stay within the popover
    await customExpressionName(page).focus();
    await page.keyboard.press("Shift+Tab");
    await page.waitForTimeout(25);
    await page.keyboard.press("Shift+Tab");
    await page.waitForTimeout(25);
    await page.keyboard.press("Shift+Tab");
    await page.waitForTimeout(25);
    await expect(focusedElement(page)).toHaveAttribute("role", "textbox");

    await page.keyboard.press("Shift+Tab");
    await page.waitForTimeout(25);
    await expect(
      page.getByRole("button", { name: "Cancel", exact: true }),
    ).toBeFocused();

    await page.keyboard.press("Shift+Tab");
    await page.waitForTimeout(25);
    await expect(customExpressionName(page)).toBeFocused();
  });
});

test.describe("issue 49882", () => {
  test.beforeEach(async ({ mb, page }) => {
    await mb.restore();
    await mb.signInAsNormalUser();
    await openOrdersTable(page, { mode: "notebook" });
    const crumbs = page.getByTestId("head-crumbs-container");
    await expect(crumbs).toContainText("Sample Database");
    await expect(crumbs).toContainText("Orders");
    await addCustomColumn(page);
  });

  test("should not eat up subsequent characters when applying a suggestion (metabase#49882-1)", async ({
    page,
  }) => {
    const moveCursorTo2ndCaseArgument = "{leftarrow}".repeat(6);
    await enterCustomColumnDetails(page, {
      formula: `case([Total] > 200, , "X")${moveCursorTo2ndCaseArgument}[tot`,
      blur: false,
    });

    await acceptCompletionWith(page, "Enter");

    await expectCustomExpressionValue(
      page,
      'case([Total] > 200, [Total], "X")',
    );
    await expect(
      popover(page).getByText("Expecting a closing parenthesis", {
        exact: true,
      }),
    ).toHaveCount(0);
  });

  test("does not clear expression input when expression is invalid (metabase#49882-2, metabase#15892)", async ({
    page,
  }) => {
    // This test used to use keyboard shortcuts to cut and paste but that seems
    // impossible to emulate with CodeMirror, so it uses a synthetic paste
    // event instead. Copy is impossible to emulate so far, but it's not
    // crucial to test the issue.
    await enterCustomColumnDetails(page, {
      formula: 'case([Tax] > 1, case([Total] > 200, [Total], "Nothing"), [Tax])',
      blur: false,
    });

    // "Cut" [Tax]
    await typeInEditor(page, "{end}{leftarrow}", { focus: false });
    for (let i = 0; i < 5; i++) {
      await page.keyboard.press("Shift+ArrowLeft");
      await page.waitForTimeout(25);
    }
    await page.keyboard.press("Backspace");
    await page.waitForTimeout(25);

    await typeInEditor(page, "{leftarrow}".repeat(42), { focus: false });

    // Paste [Tax] before case
    await pasteIntoExpressionEditor(page, "[Tax]");

    await expectCustomExpressionValue(
      page,
      'case([Tax] > 1,[Tax] case([Total] > 200, [Total], "Nothing"), )',
    );

    await expect(
      popover(page).getByText("Expecting operator but got case instead", {
        exact: true,
      }),
    ).toBeVisible();
  });

  // TODO (upstream): we no longer have wrapped lines (for now)
  test("should allow moving cursor between wrapped lines with arrow up and arrow down keys (metabase#49882-3)", async ({
    page,
  }) => {
    test.skip(true, "Upstream @skip tag");
    await enterCustomColumnDetails(page, {
      formula:
        'case([Tax] > 1, case([Total] > 200, [Total], "Nothing"), [Tax]){leftarrow}{leftarrow}{uparrow}x{downarrow}y',
    });

    await expectCustomExpressionValue(
      page,
      'case([Tax] > 1, xcase([Total] > 200, [Total], "Nothing"), [Tax]y)',
    );
  });

  test("should update currently selected suggestion when suggestions list is updated (metabase#49882-4)", async ({
    page,
  }) => {
    const selectProductRating = "{downarrow}".repeat(5);

    await enterCustomColumnDetails(page, { formula: "[Produ", blur: false });
    // The completion source is recomputed asynchronously shortly after the
    // popup first paints, and CodeMirror RESETS the selection to index 0 when
    // it lands. Measured by dumping aria-selected after every ArrowDown with a
    // 300ms settle: 0 → 1 → 0 → 1 → 2 → 3 (the reset fires mid-sequence, 3/3
    // runs), so Tab accepted "[Product ID]" / "[Product → Ean]". Cypress's
    // per-command cadence is slow enough that all five presses land after the
    // recompute. With a 1s settle the sequence is 0 → 5 deterministically
    // (5/5 runs), which is the state upstream actually measures.
    await expect(customExpressionCompletions(page)).toBeVisible();
    await page.waitForTimeout(1000);
    await typeInEditor(page, selectProductRating, { focus: false });

    await expect(
      customExpressionCompletion(page, "Product → Rating"),
    ).toBeVisible();
    // Upstream asserts the option is *present*; the accept below takes the
    // *selected* one, so gate on the selection too.
    await expect(selectedCompletion(page)).toContainText("Product → Rating");
    await acceptCompletionWith(page, "Tab");

    await expectCustomExpressionValue(page, "[Product → Rating]");
  });
});

test.describe("issue 49304", () => {
  const questionDetails = { query: { "source-table": PRODUCTS_ID } };

  test.beforeEach(async ({ mb }) => {
    await mb.restore();
    await mb.signInAsNormalUser();
  });

  test("should be possible to switch between filter widgets and the expression editor for multi-argument operators (metabase#49304)", async ({
    page,
    mb,
  }) => {
    const { id } = await createQuestion(mb.api, questionDetails);
    await visitQuestion(page, id);
    await openNotebook(page);

    // add a filter using a filter widget and check that it is rendered in the
    // expression editor
    await getNotebookStep(page, "data")
      .getByRole("button", { name: "Filter", exact: true })
      .click();
    await popover(page).getByText("Category", { exact: true }).click();
    await selectFilterOperator(page, "Contains");
    {
      const clausePopover = clauseStepPopover(page);
      const textInput = clausePopover.getByPlaceholder("Enter some text", {
        exact: true,
      });
      await textInput.click();
      await page.keyboard.type("gadget,widget");
      await textInput.blur();
      await clausePopover
        .getByRole("button", { name: "Add filter", exact: true })
        .click();
    }
    await getNotebookStep(page, "filter")
      .getByText("Category contains 2 selections", { exact: true })
      .click();
    {
      const clausePopover = clauseStepPopover(page);
      await clausePopover
        .getByRole("button", { name: "Back", exact: true })
        .click();
      await clausePopover
        .getByText("Custom Expression", { exact: true })
        .click();
      await expectCustomExpressionValue(
        page,
        [
          "contains(",
          "  [Category],",
          '  "gadget",',
          '  "widget",',
          '  "case-insensitive"',
          ")",
        ].join("\n"),
      );
    }

    // modify the expression in the expression editor and make sure it is
    // rendered correctly in the filter widget
    await enterCustomColumnDetails(page, {
      formula:
        'contains([Category], "gadget", "widget", "gizmo", "case-insensitive")',
    });
    await popover(page)
      .getByRole("button", { name: "Update", exact: true })
      .click();

    await getNotebookStep(page, "filter")
      .getByText("Category contains 3 selections", { exact: true })
      .click();
    {
      const scope = popover(page);
      await expect(scope.getByText("gadget", { exact: true })).toBeVisible();
      await expect(scope.getByText("widget", { exact: true })).toBeVisible();
      await expect(scope.getByText("gizmo", { exact: true })).toBeVisible();
      await expect(
        scope.getByLabel("Case sensitive", { exact: true }),
      ).not.toBeChecked();
    }

    // change options in the filter widget and make sure they get reflected in
    // the expression editor
    {
      const scope = popover(page);
      await scope.getByLabel("Case sensitive", { exact: true }).click();
      await scope
        .getByRole("button", { name: "Update filter", exact: true })
        .click();
    }
    await getNotebookStep(page, "filter")
      .getByText("Category contains 3 selections", { exact: true })
      .click();
    {
      const scope = popover(page);
      await scope.getByRole("button", { name: "Back", exact: true }).click();
      await scope.getByText("Custom Expression", { exact: true }).click();
      await expectCustomExpressionValue(
        page,
        'contains([Category], "gadget", "widget", "gizmo")',
      );
    }

    // remove options from the expression in the expression editor and make
    // sure it is rendered correctly in the filter widget
    await enterCustomColumnDetails(page, {
      formula: 'contains([Category], "gadget", "widget", "gizmo")',
    });
    await popover(page)
      .getByRole("button", { name: "Update", exact: true })
      .click();

    await getNotebookStep(page, "filter")
      .getByText("Category contains 3 selections", { exact: true })
      .click();
    {
      const scope = popover(page);
      await expect(scope.getByText("gadget", { exact: true })).toBeVisible();
      await expect(scope.getByText("widget", { exact: true })).toBeVisible();
      await expect(scope.getByText("gizmo", { exact: true })).toBeVisible();
      await expect(
        scope.getByLabel("Case sensitive", { exact: true }),
      ).toBeChecked();
    }
  });
});

test.describe("issue 41305", () => {
  test.beforeEach(async ({ mb }) => {
    await mb.restore();
    await mb.signInAsNormalUser();
  });

  test("should allow to right click in the suggestion popover without closing it (metabase#41305)", async ({
    page,
  }) => {
    await openProductsTable(page, { mode: "notebook" });
    await addCustomColumn(page);
    await enterCustomColumnDetails(page, { formula: "contains(", blur: false });

    await expect(popover(page)).toHaveCount(2);
    await popover(page)
      .last()
      .getByText("The column or text to check.", { exact: true })
      .click({ button: "right" });
    await expect(popover(page)).toHaveCount(2);
  });
});

test.describe("issue 49305", () => {
  test.beforeEach(async ({ mb }) => {
    await mb.restore();
    await mb.signInAsAdmin();
  });

  test("should be able to use a custom column in sort for a nested query (metabase#49305)", async ({
    page,
  }) => {
    const ccName = "CC Title";

    // This bug does not reproduce if the base question is created via the API,
    // so create it manually in the UI.
    await page.goto("/");
    await newButton(page).click();
    await popover(page).getByText("Question", { exact: true }).click();
    const picker = miniPicker(page);
    await picker.getByText("Sample Database", { exact: true }).click();
    await picker.getByText("Products", { exact: true }).click();

    await getNotebookStep(page, "data")
      .getByRole("button", { name: "Custom column", exact: true })
      .click();
    await enterCustomColumnDetails(page, {
      formula: 'concat("49305 ", [Title])',
      name: ccName,
    });
    await doneButton(page).click();
    const questionId = await saveQuestion(page, "49305 Base question", {
      path: ["Our analytics"],
    });

    await visitQuestionAdhocNotebook(page, {
      dataset_query: {
        database: SAMPLE_DB_ID,
        query: {
          "source-table": `card__${questionId}`,
          aggregation: [["count"]],
          breakout: [["field", ccName, { "base-type": "type/Text" }]],
          limit: 2,
        },
        type: "query",
      },
    });

    // Verify that a sort step can be added via the UI. This is the bug we are
    // validating.
    await page.getByRole("button", { name: "Sort", exact: true }).click();
    await popover(page)
      .getByText(new RegExp(escapeRegExp(ccName)))
      .first()
      .click();
    await getNotebookStep(page, "sort")
      .getByText(new RegExp(escapeRegExp(ccName)))
      .first()
      .click();

    await verifyNotebookQuery(page, "49305 Base question", [
      {
        aggregations: ["Count"],
        breakouts: [ccName],
        limit: 2,
        sort: [{ column: ccName, order: "desc" }],
      },
    ]);

    await visualize(page);
    // Both SegmentedControl options are `disabled: true` BY DESIGN
    // (QuestionDisplayToggle.tsx) — the component handles the toggle on the
    // root's onClick and disables the radios so native radio behaviour can't
    // interfere. Cypress clicks the label's <svg> and the event bubbles;
    // Playwright's actionability sees the disabled input, so force past it.
    await page
      .getByLabel("Switch to data", { exact: true })
      .click({ force: true });
    await assertTableData(page, {
      columns: ["CC Title", "Count"],
      firstRows: [
        ["49305 Synergistic Wool Coat", "1"],
        ["49305 Synergistic Steel Chair", "1"],
      ],
    });
  });
});

test.describe("issue 50925", () => {
  const questionDetails = {
    query: {
      "source-table": PRODUCTS_ID,
      expressions: {
        Custom: [
          "case",
          [
            [
              ["=", ["field", PRODUCTS.ID, { "base-type": "type/BigInteger" }], 1],
              [
                "*",
                ["field", PRODUCTS.PRICE, { "base-type": "type/Float" }],
                1.21,
              ],
            ],
          ],
          {
            default: ["field", PRODUCTS.PRICE, { "base-type": "type/Float" }],
          },
        ],
      },
    },
  };

  test.beforeEach(async ({ mb }) => {
    await mb.restore();
    await mb.signInAsNormalUser();
  });

  test("should not remove existing characters when applying autocomplete suggestion (metabase#50925)", async ({
    page,
    mb,
  }) => {
    const { id } = await createQuestion(mb.api, questionDetails);
    await visitQuestion(page, id);
    await openNotebook(page);

    // incomplete bracket identifier is followed by whitespace
    await getNotebookStep(page, "expression")
      .getByText("Custom", { exact: true })
      .click();

    await focusCustomExpressionEditor(page);
    await typeInEditor(page, "{leftarrow}".repeat(9), { focus: false });
    await typeInEditor(page, " [Pr", { focus: false });

    await acceptCompletionWith(page, "Enter");

    await blurExpressionEditor(page);
    await expectCustomExpressionValue(
      page,
      "case([ID] = 1, [Price] * 1.21, [Price] [Price])",
    );

    // incomplete bracket identifier is followed by bracket identifier
    await popover(page)
      .getByRole("button", { name: "Cancel", exact: true })
      .click();
    await getNotebookStep(page, "expression")
      .getByText("Custom", { exact: true })
      .click();

    await focusCustomExpressionEditor(page);
    await typeInEditor(page, "{leftarrow}".repeat(9), { focus: false });
    await typeInEditor(page, " [Pr", { focus: false });

    await page.waitForTimeout(300);
    await acceptCompletionWith(page, "Enter");

    await blurExpressionEditor(page);
    await expectCustomExpressionValue(
      page,
      "case([ID] = 1, [Price] * 1.21, [Price] [Price])",
    );
  });
});

test.describe("issue 53682", () => {
  test.beforeEach(async ({ mb }) => {
    await mb.restore();
    await mb.signInAsNormalUser();
  });

  test("should show an error message when trying to use a multi-arg expression function with not enough arguments (metabase#53682)", async ({
    page,
  }) => {
    await openProductsTable(page, { mode: "notebook" });
    await getNotebookStep(page, "data")
      .getByRole("button", { name: "Custom column", exact: true })
      .click();
    await enterCustomColumnDetails(page, {
      formula: "contains([Category])",
    });
    const scope = popover(page);
    await expect(
      scope.getByText("Function contains expects at least 2 arguments", {
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      scope.getByRole("button", { name: "Done", exact: true }),
    ).toBeDisabled();
  });
});

test.describe("issue 53527", () => {
  const nativeQuestionDetails = {
    name: "Quotes SQL",
    native: { query: "SELECT 'a\"b' AS TEXT", "template-tags": {} },
  };

  test.beforeEach(async ({ mb }) => {
    await mb.restore();
    await mb.signInAsNormalUser();
  });

  test("should properly unescape quotes in the expression editor (metabase#53527)", async ({
    page,
    mb,
  }) => {
    const card = await createNativeQuestion(mb.api, nativeQuestionDetails);
    const { id } = await createQuestion(mb.api, {
      name: "Quotes MBQL",
      query: { "source-table": `card__${card.id}` },
    });
    await visitQuestion(page, id);

    await openNotebook(page);
    await getNotebookStep(page, "data")
      .getByRole("button", { name: "Custom column", exact: true })
      .click();
    await enterCustomColumnDetails(page, {
      formula: 'replace([TEXT], "\\"", "")',
      name: "CustomColumn",
    });
    await doneButton(page).click();
    await visualize(page);
    await expect(
      tableInteractive(page).getByText("ab", { exact: true }),
    ).toBeVisible();
  });
});

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
