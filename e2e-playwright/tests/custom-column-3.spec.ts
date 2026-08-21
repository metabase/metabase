/**
 * Playwright port of
 * e2e/test/scenarios/custom-column/custom-column-3.cy.spec.js
 *
 * The custom-column expression editor is CodeMirror — driven with real
 * keystrokes (page.keyboard, the CDP-input equivalent of the upstream
 * realType), asserting editor focus before typing.
 *
 * The "splitPart" and "today()" describes restore the `postgres-12` snapshot
 * and drive the QA Postgres12 database, which isn't in the jar's snapshots and
 * isn't provisioned in this spike — gated on PW_QA_DB_ENABLED (the deliberate
 * gate; PW_QA_DB_ENABLED leaks in from cypress.env.json on dev machines).
 */
import type { Page } from "@playwright/test";

import type { MetabaseApi } from "../support/api";
import {
  addCustomColumnInStep,
  assertLastColumnData,
  clearCustomExpressionEditor,
  customExpressionCompletion,
  customExpressionEditorType,
  customExpressionName,
  expectCustomExpressionValue,
  filterInStep,
  formatExpression,
  functionBrowser,
  joinInStep,
  scrollTableRight,
  setModelMetadata,
  sortInStep,
  summarizeInStep,
} from "../support/custom-column-3";
import { test, expect } from "../support/fixtures";
import {
  addCustomColumn,
  joinTable,
  openTableNotebook,
  summarizeNotebook,
} from "../support/joins";
import { visitModel } from "../support/models";
import { assertTableData } from "../support/multiple-column-breakouts";
import { moveDnDKitElementSynthetic } from "../support/question-settings";
import {
  assertQueryBuilderRowCount,
  enterCustomColumnDetails,
  expressionEditorWidget,
  getNotebookStep,
  miniPicker,
  openNotebook,
  startNewQuestion,
  visualize,
} from "../support/notebook";
import { SAMPLE_DATABASE } from "../support/sample-data";
import { popover, visitQuestion } from "../support/ui";

const { ORDERS, ORDERS_ID, PEOPLE_ID, PEOPLE, PRODUCTS_ID } = SAMPLE_DATABASE;

// H.enterCustomColumnDetails clears then re-fills the name; the direct-type
// tests set it themselves. Blur so validation commits before Done.
async function setExpressionName(page: Page, name: string) {
  const input = customExpressionName(page);
  await input.fill(name);
  await input.blur();
}

// H.getNotebookStep("summarize").icon("add") — the "+" that adds another
// aggregation, scoped to the aggregate-step (the breakout section also carries
// an add affordance).
async function addAggregation(page: Page) {
  await getNotebookStep(page, "summarize")
    .getByTestId("aggregate-step")
    .locator(".Icon-add")
    .click();
}

async function createAndVisitQuestion(
  page: Page,
  api: MetabaseApi,
  details: { name?: string; type?: string; query: Record<string, unknown> },
) {
  const { id } = await api.createQuestion(details);
  await visitQuestion(page, id);
}

test.describe("scenarios > question > custom column > distinctIf", () => {
  test.beforeEach(async ({ mb }) => {
    await mb.restore();
    await mb.signInAsNormalUser();
  });

  test("should allow to use a distinctIf function", async ({ page }) => {
    await openTableNotebook(page, PRODUCTS_ID);

    await getNotebookStep(page, "data")
      .getByRole("button", { name: "Summarize", exact: true })
      .click();
    await popover(page).getByText("Custom Expression", { exact: true }).click();
    await enterCustomColumnDetails(page, {
      formula: "DistinctIf([ID], [Category] = 'Gadget')",
      name: "Distinct",
    });
    await popover(page)
      .getByRole("button", { name: "Done", exact: true })
      .click();
    await visualize(page);
    await expect(page.getByTestId("scalar-value")).toHaveText("53");

    // modify the expression
    await openNotebook(page);
    await getNotebookStep(page, "summarize")
      .getByText("Distinct", { exact: true })
      .click();
    await expectCustomExpressionValue(
      page,
      'DistinctIf([ID], [Category] = "Gadget")',
    );
    await enterCustomColumnDetails(page, {
      formula: "DistinctIf([ID], [Category] != 'Gadget')",
      name: "Distinct",
    });
    await popover(page)
      .getByRole("button", { name: "Update", exact: true })
      .click();
    await visualize(page);
    await expect(page.getByTestId("scalar-value")).toHaveText("147");
  });
});

test.describe("scenarios > question > custom column > path", () => {
  test.beforeEach(async ({ mb }) => {
    await mb.restore();
    await mb.signInAsNormalUser();
  });

  test("should allow to use a path function", async ({ page, mb }) => {
    const CC_NAME = "URL_URL";
    const questionDetails = {
      name: "path from url",
      type: "model",
      query: {
        "source-table": PEOPLE_ID,
        limit: 1,
        expressions: {
          [CC_NAME]: [
            "concat",
            "http://",
            ["domain", ["field", PEOPLE.EMAIL, null]],
            ".com/my/path",
          ],
        },
      },
    };

    const { id: modelId } = await mb.api.createQuestion(questionDetails);

    await setModelMetadata(mb.api, modelId, (field) =>
      field.name === CC_NAME ? { ...field, semantic_type: "type/URL" } : field,
    );

    await visitModel(page, modelId);

    await openNotebook(page);

    await getNotebookStep(page, "data")
      .getByRole("button", { name: "Custom column", exact: true })
      .click();
    await enterCustomColumnDetails(page, {
      formula: `Path([${CC_NAME}])`,
      name: "extracted path",
    });

    await popover(page)
      .getByRole("button", { name: "Done", exact: true })
      .click();
    await visualize(page);
    await scrollTableRight(page);

    await assertLastColumnData(page, {
      title: "extracted path",
      value: "/my/path",
    });
  });
});

test.describe("scenarios > question > custom column > function browser", () => {
  test.beforeEach(async ({ mb, page }) => {
    await mb.restore();
    await mb.signInAsNormalUser();

    await openTableNotebook(page, PRODUCTS_ID);
    await addCustomColumn(page);
  });

  async function openFunctionBrowser(page: Page) {
    await expressionEditorWidget(page)
      .getByRole("button", { name: "Function browser", exact: true })
      .click();
  }

  test("should be possible to insert functions by clicking them in the function browser", async ({
    page,
  }) => {
    await openFunctionBrowser(page);

    await functionBrowser(page)
      .getByText("datetimeAdd", { exact: true })
      .click();
    await expectCustomExpressionValue(page, "datetimeAdd()");

    await functionBrowser(page).getByText("day", { exact: true }).click();
    await expectCustomExpressionValue(page, "datetimeAdd(day())");

    await customExpressionEditorType(page, '"foo"{rightarrow}, ', {
      focus: false,
    });
    await expectCustomExpressionValue(page, 'datetimeAdd(day("foo"), )');

    await functionBrowser(page).getByText("day", { exact: true }).click();
    await expectCustomExpressionValue(page, 'datetimeAdd(day("foo"), day())');
  });

  test("should be possible to replace text when inserting functions", async ({
    page,
  }) => {
    await customExpressionEditorType(page, "foo bar baz");
    await page.keyboard.press("ArrowLeft");
    await page.keyboard.press("ArrowLeft");
    await page.keyboard.press("ArrowLeft");
    await page.keyboard.press("ArrowLeft");
    await page.keyboard.press("Shift+ArrowLeft");
    await page.keyboard.press("Shift+ArrowLeft");
    await page.keyboard.press("Shift+ArrowLeft");

    await openFunctionBrowser(page);
    await functionBrowser(page).getByText("day", { exact: true }).click();
    await expectCustomExpressionValue(page, "foo day() baz");
  });

  test("should be possible to filter functions in the function browser", async ({
    page,
  }) => {
    await openFunctionBrowser(page);

    const fb = functionBrowser(page);
    const search = fb.getByPlaceholder("Search functions…", { exact: true });
    await search.pressSequentially("con");

    await expect(fb.getByText("datetimeAdd", { exact: true })).toHaveCount(0);
    await expect(fb.getByText("concat", { exact: true })).toBeVisible();
    await expect(fb.getByText("second", { exact: true })).toBeVisible();

    await search.fill("");
    await expect(fb.getByText("datetimeAdd", { exact: true })).toHaveCount(1);
  });

  test("should not show functions that are not supported by the current database", async ({
    page,
  }) => {
    await openFunctionBrowser(page);

    const fb = functionBrowser(page);
    await fb
      .getByPlaceholder("Search functions…", { exact: true })
      .pressSequentially("convertTimezone");
    await expect(fb.getByText("convertTimezone", { exact: true })).toHaveCount(
      0,
    );
  });

  test("should not show aggregations unless aggregating", async ({ page }) => {
    await openFunctionBrowser(page);
    await functionBrowser(page)
      .getByPlaceholder("Search functions…", { exact: true })
      .pressSequentially("Count");
    await expect(
      functionBrowser(page).getByText("Count", { exact: true }),
    ).toHaveCount(0);
    await expressionEditorWidget(page)
      .getByRole("button", { name: "Cancel", exact: true })
      .click();

    await summarizeNotebook(page);
    await popover(page).getByText("Custom Expression", { exact: true }).click();

    await openFunctionBrowser(page);
    await functionBrowser(page)
      .getByPlaceholder("Search aggregations…", { exact: true })
      .pressSequentially("Count");
    await expect(
      functionBrowser(page).getByText("Count", { exact: true }),
    ).toBeVisible();
  });

  test("show a message when no functions match the filter", async ({ page }) => {
    await openFunctionBrowser(page);
    await functionBrowser(page)
      .getByPlaceholder("Search functions…", { exact: true })
      .pressSequentially("foobar");
    await expect(
      functionBrowser(page).getByText("Didn't find any results", {
        exact: true,
      }),
    ).toBeVisible();
  });

  test("should insert parens even when the clause has no arguments", async ({
    page,
  }) => {
    await openFunctionBrowser(page);
    await functionBrowser(page)
      .getByPlaceholder("Search functions…", { exact: true })
      .pressSequentially("now");
    await functionBrowser(page).getByText("now", { exact: true }).click();
    await expectCustomExpressionValue(page, "now()");
  });
});

test.describe("scenarios > question > custom column > splitPart", () => {
  test.beforeEach(async ({ mb, page }) => {
    test.skip(
      !process.env.PW_QA_DB_ENABLED,
      "Requires the QA Postgres12 database and its postgres-12 snapshot (set PW_QA_DB_ENABLED)",
    );
    await mb.restore("postgres-12");
    await mb.signInAsAdmin();

    await startNewQuestion(page);
    await miniPicker(page).getByText("QA Postgres12", { exact: true }).click();
    await miniPicker(page).getByText("People", { exact: true }).click();

    await page.getByLabel("Custom column", { exact: true }).click();
  });

  test("should be possible to split a custom column", async ({ page }) => {
    const CC_NAME = "Split Title";

    await enterCustomColumnDetails(page, {
      formula: "splitPart([Name], ' ', 1)",
      name: CC_NAME,
    });
    await popover(page)
      .getByRole("button", { name: "Done", exact: true })
      .click();

    await page.getByLabel("Row limit", { exact: true }).click();
    const limit = page.getByPlaceholder("Enter a limit", { exact: true });
    await limit.fill("1");
    await limit.blur();

    await visualize(page);

    await scrollTableRight(page);
    await assertLastColumnData(page, { title: CC_NAME, value: "Hudson" });
  });

  test("should show a message when index is below 1", async ({ page }) => {
    await enterCustomColumnDetails(page, {
      formula: "splitPart([Name], ' ', 0)",
    });

    await expect(
      expressionEditorWidget(page).getByRole("button", {
        name: "Done",
        exact: true,
      }),
    ).toBeDisabled();
    await expect(expressionEditorWidget(page)).toContainText(
      "Expected positive integer but found 0",
    );
  });
});

test.describe("exercise today() function", () => {
  test.beforeEach(async ({ mb }) => {
    test.skip(
      !process.env.PW_QA_DB_ENABLED,
      "Requires the QA Postgres12 database and its postgres-12 snapshot (set PW_QA_DB_ENABLED)",
    );
    await mb.restore("postgres-12");
    await mb.signInAsAdmin();
  });

  test("should show today's date", async ({ page }) => {
    await startNewQuestion(page);
    await miniPicker(page).getByText("QA Postgres12", { exact: true }).click();
    await miniPicker(page).getByText("Products", { exact: true }).click();

    await getNotebookStep(page, "data")
      .getByRole("button", { name: "Pick columns", exact: true })
      .click();
    await popover(page).getByText("Select all", { exact: true }).click();
    await page.keyboard.press("Escape");

    await visualize(page);
    await assertQueryBuilderRowCount(page, 200);
    await openNotebook(page);

    await getNotebookStep(page, "data")
      .getByRole("button", { name: "Custom column", exact: true })
      .click();
    await enterCustomColumnDetails(page, { formula: "today()", name: "TODAY" });
    await popover(page)
      .getByRole("button", { name: "Done", exact: true })
      .click();

    const today = new Date();
    const dateString = today.toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });

    await visualize(page);
    await expect(page.getByTestId("header-cell").nth(1)).toHaveText("TODAY");
    await expect(page.getByTestId("cell-data").nth(3)).toHaveText(dateString);
  });
});

test.describe("scenarios > question > custom column > aggregation", () => {
  test.beforeEach(async ({ mb, page }) => {
    await mb.restore();
    await mb.signInAsNormalUser();
    await openTableNotebook(page, ORDERS_ID);
  });

  const customSumQuestion = {
    query: {
      "source-table": ORDERS_ID,
      aggregation: [
        [
          "aggregation-options",
          ["sum", ["field", ORDERS.TOTAL, null]],
          { name: "Custom Sum", "display-name": "Custom Sum" },
        ],
      ],
    },
  };

  test("should be possible to resolve aggregations from the question", async ({
    page,
    mb,
  }) => {
    await createAndVisitQuestion(page, mb.api, customSumQuestion);
    await openNotebook(page);

    await addAggregation(page);
    await popover(page).getByText("Custom Expression", { exact: true }).click();

    await customExpressionEditorType(page, "[Custom");
    const completion = customExpressionCompletion(page, "Custom Sum");
    await expect(completion).toBeVisible();
    await completion.click();
    await expectCustomExpressionValue(page, "[Custom Sum]");
    await customExpressionEditorType(page, "+ 1");
    await formatExpression(page);

    await setExpressionName(page, "Derived");
    await popover(page)
      .getByRole("button", { name: "Done", exact: true })
      .click();

    await visualize(page);
    await assertTableData(page, { columns: ["Custom Sum", "Derived"] });
  });

  test("should be possible to resolve aggregations from the question directly", async ({
    page,
    mb,
  }) => {
    await createAndVisitQuestion(page, mb.api, customSumQuestion);
    await openNotebook(page);

    await addAggregation(page);
    await popover(page).getByText("Custom Expression", { exact: true }).click();

    await customExpressionEditorType(page, "[Custom");
    const completion = customExpressionCompletion(page, "Custom Sum");
    await expect(completion).toBeVisible();
    await completion.click();
    await expectCustomExpressionValue(page, "[Custom Sum]");
    await formatExpression(page);

    await setExpressionName(page, "Derived");
    await popover(page)
      .getByRole("button", { name: "Done", exact: true })
      .click();

    await visualize(page);
    await assertTableData(page, { columns: ["Custom Sum", "Derived"] });
  });

  test("should be possible to resolve aggregations from the previous stage", async ({
    page,
    mb,
  }) => {
    await createAndVisitQuestion(page, mb.api, customSumQuestion);
    await openNotebook(page);

    await page.getByLabel("Custom column", { exact: true }).nth(1).click();
    await customExpressionEditorType(page, "[Custom S");
    const completion = customExpressionCompletion(page, "Custom Sum");
    await expect(completion).toBeVisible();
    await completion.click();
    await expectCustomExpressionValue(page, "[Custom Sum]");
    await formatExpression(page);

    await setExpressionName(page, "Derived");
    await popover(page)
      .getByRole("button", { name: "Done", exact: true })
      .click();

    await visualize(page);
    await assertTableData(page, { columns: ["Custom Sum", "Derived"] });
  });

  test("should not be possible to create cycles in custom aggregations", async ({
    page,
    mb,
  }) => {
    await createAndVisitQuestion(page, mb.api, customSumQuestion);
    await openNotebook(page);

    await addAggregation(page);
    await popover(page).getByText("Custom Expression", { exact: true }).click();
    await customExpressionEditorType(page, "[Custom Sum] + 1");
    await setExpressionName(page, "Custom Sum 2");
    await popover(page)
      .getByRole("button", { name: "Done", exact: true })
      .click();

    await getNotebookStep(page, "summarize")
      .getByText("Custom Sum", { exact: true })
      .click();
    await clearCustomExpressionEditor(page);
    await customExpressionEditorType(page, "[Custom Sum 2]");

    await expect(
      expressionEditorWidget(page).getByText(
        "Cycle detected: Custom Sum → Custom Sum 2 → Custom Sum",
        { exact: true },
      ),
    ).toBeVisible();
  });

  test("should be possible to create aggregations with the same name", async ({
    page,
    mb,
  }) => {
    await createAndVisitQuestion(page, mb.api, {
      query: {
        "source-table": ORDERS_ID,
        aggregation: [
          [
            "aggregation-options",
            ["sum", ["field", ORDERS.TOTAL, null]],
            { name: "Foo", "display-name": "Foo" },
          ],
        ],
      },
    });
    await openNotebook(page);

    await addAggregation(page);
    await popover(page).getByText("Custom Expression", { exact: true }).click();
    await customExpressionEditorType(page, "Min([Total])");
    await setExpressionName(page, "Foo");
    await popover(page)
      .getByRole("button", { name: "Done", exact: true })
      .click();

    await expect(
      getNotebookStep(page, "summarize").getByText("Foo", { exact: true }),
    ).toHaveCount(2);
  });

  test("should be possible to reorder aggregations with the same name", async ({
    page,
    mb,
  }) => {
    await createAndVisitQuestion(page, mb.api, {
      query: { "source-table": ORDERS_ID },
    });
    await openNotebook(page);

    await summarizeNotebook(page);

    await popover(page).getByText("Custom Expression", { exact: true }).click();
    await customExpressionEditorType(page, "Count() + 1");
    await setExpressionName(page, "Count");
    await popover(page)
      .getByRole("button", { name: "Done", exact: true })
      .click();

    await addAggregation(page);
    await popover(page).getByText("Custom Expression", { exact: true }).click();
    await customExpressionEditorType(page, "[Count] + 1");
    await setExpressionName(page, "Count");
    await popover(page)
      .getByRole("button", { name: "Done", exact: true })
      .click();

    await addAggregation(page);
    await popover(page).getByText("Custom Expression", { exact: true }).click();
    await customExpressionEditorType(page, "[Count] + 2");
    await setExpressionName(page, "Final");
    await popover(page)
      .getByRole("button", { name: "Done", exact: true })
      .click();

    // Both the second Count and Final should reference the first Count
    await visualize(page);
    await assertTableData(page, {
      columns: ["Count", "Count", "Final"],
      firstRows: [["18,761", "18,762", "18,763"]],
    });

    await openNotebook(page);

    // Move the second Count to be the first
    const counts = getNotebookStep(page, "summarize").getByText("Count", {
      exact: true,
    });
    await expect(counts).toHaveCount(2);
    await moveDnDKitElementSynthetic(counts.last(), { horizontal: -400 });

    // The values should not have changed, but the order should have
    await visualize(page);
    await assertTableData(page, {
      columns: ["Count", "Count", "Final"],
      firstRows: [["18,762", "18,761", "18,763"]],
    });
  });

  test.describe(
    "scenarios > question > custom column > aggregation > in a follow up stage",
    () => {
      test.beforeEach(async ({ mb, page }) => {
        await createAndVisitQuestion(page, mb.api, {
          query: {
            "source-table": ORDERS_ID,
            aggregation: [
              [
                "aggregation-options",
                ["min", ["field", ORDERS.SUBTOTAL, { "base-type": "type/Float" }]],
                { name: "Foo", "display-name": "Foo" },
              ],
              [
                "aggregation-options",
                [
                  "+",
                  ["aggregation", 0, { "base-type": "type/Float" }],
                  ["avg", ["field", ORDERS.TAX, { "base-type": "type/Float" }]],
                ],
                { name: "Bar", "display-name": "Bar" },
              ],
            ],
          },
        });
        await openNotebook(page);
      });

      test("should be possible to use nested aggregations in custom columns of a follow up stage", async ({
        page,
      }) => {
        await addCustomColumnInStep(getNotebookStep(page, "summarize"));

        await customExpressionEditorType(page, "[Foo] + [Bar]");
        await setExpressionName(page, "Sum");
        await popover(page)
          .getByRole("button", { name: "Done", exact: true })
          .click();

        await visualize(page);

        await assertTableData(page, {
          columns: ["Foo", "Bar", "Sum"],
          firstRows: [["15.69", "19.55", "35.24"]],
        });
      });

      test("should be possible to use nested aggregations in join clause of a follow up stage", async ({
        page,
      }) => {
        await joinInStep(getNotebookStep(page, "summarize"));

        await joinTable(page, "Products");
        await popover(page).getByText("Foo", { exact: true }).click();
        await popover(page).getByText("Price", { exact: true }).click();

        await getNotebookStep(page, "join", { stage: 1 })
          .getByRole("button", { name: "Pick columns", exact: true })
          .click();
        await popover(page).getByText("Select all", { exact: true }).click();
        await popover(page).getByText("ID", { exact: true }).click();

        await visualize(page);
        await assertTableData(page, {
          columns: ["Foo", "Bar", "Products - Foo → ID"],
          firstRows: [["15.69", "19.55", "61"]],
        });
      });
    },
  );

  test.describe(
    "scenarios > question > custom column > aggregation with breakout > in a follow up stage",
    () => {
      test.beforeEach(async ({ mb, page }) => {
        await createAndVisitQuestion(page, mb.api, {
          query: {
            "source-table": ORDERS_ID,
            aggregation: [
              [
                "aggregation-options",
                ["min", ["field", ORDERS.SUBTOTAL, { "base-type": "type/Float" }]],
                { name: "Foo", "display-name": "Foo" },
              ],
              [
                "aggregation-options",
                [
                  "+",
                  ["aggregation", 0, { "base-type": "type/Float" }],
                  ["avg", ["field", ORDERS.TAX, { "base-type": "type/Float" }]],
                ],
                { name: "Bar", "display-name": "Bar" },
              ],
            ],
            breakout: [
              [
                "field",
                ORDERS.CREATED_AT,
                { "base-type": "type/DateTime", "temporal-unit": "month" },
              ],
            ],
          },
        });
        await openNotebook(page);
      });

      test("should be possible to use nested aggregations in custom columns of a follow up stage", async ({
        page,
      }) => {
        await addCustomColumnInStep(getNotebookStep(page, "summarize"));
        await customExpressionEditorType(page, "[Foo] + [Bar]");
        await setExpressionName(page, "Sum");
        await popover(page)
          .getByRole("button", { name: "Done", exact: true })
          .click();

        await visualize(page);

        await assertTableData(page, {
          columns: ["Created At: Month", "Foo", "Bar", "Sum"],
          firstRows: [["April 2025", "49.54", "52.76", "102.29"]],
        });
      });

      test("should be possible to use nested aggregations in filter clause of a follow up stage", async ({
        page,
      }) => {
        await filterInStep(getNotebookStep(page, "summarize"));
        await popover(page).getByText("Bar", { exact: true }).click();
        await popover(page).getByPlaceholder("Min", { exact: true }).fill("5");
        await popover(page).getByPlaceholder("Max", { exact: true }).fill("20");
        await popover(page)
          .getByRole("button", { name: "Add filter", exact: true })
          .click();
        await visualize(page);
        await assertTableData(page, {
          columns: ["Created At: Month", "Foo", "Bar"],
          firstRows: [["September 2025", "15.69", "18.57"]],
        });
      });

      test("should be possible to use nested aggregations in join clause of a follow up stage", async ({
        page,
      }) => {
        await joinInStep(getNotebookStep(page, "summarize"));
        await joinTable(page, "Products");

        await popover(page).getByText("Foo", { exact: true }).click();
        await popover(page).getByText("Price", { exact: true }).click();

        await getNotebookStep(page, "join", { stage: 1 })
          .getByRole("button", { name: "Pick columns", exact: true })
          .click();
        await popover(page).getByText("Select all", { exact: true }).click();
        await popover(page).getByText("ID", { exact: true }).click();

        await visualize(page);
        await assertTableData(page, {
          columns: ["Created At: Month", "Foo", "Bar", "Products - Foo → ID"],
          firstRows: [["April 2025", "49.54", "52.76", "34"]],
        });
      });

      test("should be possible to use nested aggregations in order by clause of a follow up stage", async ({
        page,
      }) => {
        await sortInStep(getNotebookStep(page, "summarize"));
        await popover(page).getByText("Bar", { exact: true }).click();

        await visualize(page);
        await assertTableData(page, {
          columns: ["Created At: Month", "Foo", "Bar"],
          firstRows: [["April 2026", "15.69", "18.21"]],
        });
      });

      test("should be possible to use nested aggregations in breakout of a follow up stage", async ({
        page,
      }) => {
        await summarizeInStep(getNotebookStep(page, "summarize"));

        await popover(page).getByText("Count of rows", { exact: true }).click();

        await visualize(page);
        await assertTableData(page, {
          columns: ["Count"],
          firstRows: [["49"]],
        });
      });

      test("should be possible reference both aggregations with same name in follow up stage", async ({
        page,
      }) => {
        await openTableNotebook(page, ORDERS_ID);

        await summarizeNotebook(page);

        await popover(page)
          .getByText("Custom Expression", { exact: true })
          .click();
        await customExpressionEditorType(page, "Count() + 1");
        await setExpressionName(page, "Count");
        await popover(page)
          .getByRole("button", { name: "Done", exact: true })
          .click();

        await addAggregation(page);
        await popover(page)
          .getByText("Custom Expression", { exact: true })
          .click();
        await customExpressionEditorType(page, "[Count] + 1");
        await setExpressionName(page, "Count");
        await popover(page)
          .getByRole("button", { name: "Done", exact: true })
          .click();

        await getNotebookStep(page, "summarize")
          .getByText("Pick a column to group by", { exact: true })
          .click();
        // The breakout picker lists Created At once at the top level (FK
        // groups are collapsed); .first() mirrors the Cypress findByText.
        await popover(page).getByText("Created At", { exact: true }).first().click();

        // Filter by the first Count
        await filterInStep(getNotebookStep(page, "summarize"));
        await expect(
          popover(page).getByText("Count", { exact: true }),
        ).toHaveCount(2);
        await popover(page).getByText("Count", { exact: true }).nth(0).click();
        // if this was referencing the second Count, it would filter out all rows
        await popover(page).getByPlaceholder("Max", { exact: true }).fill("2.5");
        await popover(page)
          .getByRole("button", { name: "Add filter", exact: true })
          .click();

        // Filter by the second Count
        await getNotebookStep(page, "filter", { stage: 1 })
          .locator(".Icon-add")
          .click();
        await expect(
          popover(page).getByText("Count", { exact: true }),
        ).toHaveCount(2);
        await popover(page).getByText("Count", { exact: true }).nth(1).click();
        // if this was referencing the first Count, it would filter out all rows
        await popover(page).getByPlaceholder("Min", { exact: true }).fill("2.5");
        await popover(page)
          .getByRole("button", { name: "Add filter", exact: true })
          .click();

        await visualize(page);
        await assertTableData(page, {
          columns: ["Created At: Month", "Count", "Count"],
          firstRows: [["April 2025", "2", "3"]],
        });

        // Swapping the aggregation clauses should not change the results, but
        // the column order will be different
        await openNotebook(page);
        const counts = getNotebookStep(page, "summarize").getByText("Count", {
          exact: true,
        });
        await expect(counts).toHaveCount(2);
        await moveDnDKitElementSynthetic(counts.last(), { horizontal: -400 });

        await visualize(page);
        await assertTableData(page, {
          columns: ["Created At: Month", "Count", "Count"],
          firstRows: [["April 2025", "3", "2"]],
        });
      });
    },
  );

  test("should show a custom error when there are no aggregations in a custom aggregation", async ({
    page,
  }) => {
    await openTableNotebook(page, ORDERS_ID);
    await summarizeNotebook(page);
    await popover(page).getByText("Custom Expression", { exact: true }).click();
    await customExpressionEditorType(page, "1 + 1");
    await expect(
      expressionEditorWidget(page).getByText(
        "Aggregations should contain at least one aggregation function.",
        { exact: true },
      ),
    ).toBeVisible();
  });
});
