import userEvent from "@testing-library/user-event";
import { useState } from "react";

import { setupDatabasesEndpoints } from "__support__/server-mocks";
import {
  mockGetBoundingClientRect,
  renderWithProviders,
  screen,
  waitFor,
  within,
} from "__support__/ui";
import { checkNotNull } from "metabase/utils/types";
import * as Lib from "metabase-lib";
import { SAMPLE_METADATA, SAMPLE_PROVIDER } from "metabase-lib/test-helpers";
import Question from "metabase-lib/v1/Question";
import type { DatabaseFeature } from "metabase-types/api";
import {
  COMMON_DATABASE_FEATURES,
  createMockCard,
} from "metabase-types/api/mocks";
import {
  ORDERS_ID,
  PEOPLE_ID,
  PRODUCTS_ID,
  createSampleDatabase,
} from "metabase-types/api/mocks/presets";

import { Notebook } from "../Notebook";

function createTableQuery(tableId: number) {
  return Lib.createTestQuery(SAMPLE_PROVIDER, {
    stages: [{ source: { type: "table", id: tableId } }],
  });
}

/**
 * Renders the real notebook and keeps the question it updates, the way the
 * query builder does, so a committed clause shows up in its step.
 */
function StatefulNotebook({
  initialQuery,
  onUpdateQuestion,
}: {
  initialQuery: Lib.Query;
  onUpdateQuestion: (question: Question) => void;
}) {
  const [question, setQuestion] = useState(() =>
    new Question(createMockCard(), SAMPLE_METADATA).setQuery(initialQuery),
  );
  return (
    <>
      <button>Outside the notebook</button>
      <Notebook
        question={question}
        reportTimezone="UTC"
        isDirty={false}
        isRunnable={false}
        isResultDirty={false}
        hasVisualizeButton={false}
        updateQuestion={async (question) => {
          onUpdateQuestion(question);
          setQuestion(question);
        }}
      />
    </>
  );
}

type SetupOpts = {
  tableId?: number;
  query?: Lib.Query;
  features?: DatabaseFeature[];
};

function setup({
  tableId = PRODUCTS_ID,
  query = createTableQuery(tableId),
  features = COMMON_DATABASE_FEATURES,
}: SetupOpts = {}) {
  const onUpdateQuestion = jest.fn<void, [Question]>();
  setupDatabasesEndpoints([createSampleDatabase({ features })]);
  mockGetBoundingClientRect();
  renderWithProviders(
    <StatefulNotebook
      initialQuery={query}
      onUpdateQuestion={onUpdateQuestion}
    />,
  );

  function getRecentQuery() {
    const [question] = checkNotNull(onUpdateQuestion.mock.lastCall);
    return question.query();
  }

  return { getRecentQuery };
}

function getStep(testId: string) {
  return screen.getByTestId(testId);
}

const CLOSE_MODAL_TITLE = "Keep editing your custom expression?";

function findCloseModal() {
  return screen.findByRole("dialog", { name: CLOSE_MODAL_TITLE });
}

function queryCloseModal() {
  return screen.queryByRole("dialog", { name: CLOSE_MODAL_TITLE });
}

function queryExpressionWidget() {
  return screen.queryByTestId("expression-editor");
}

async function getExpressionInput() {
  const input = await screen.findByTestId("custom-expression-query-editor");
  await waitFor(() => expect(input).toHaveProperty("readOnly", false));
  return input;
}

async function enterFormula(formula: string) {
  const input = await getExpressionInput();
  await userEvent.click(input);
  await userEvent.paste(formula);
  return input;
}

async function addCustomColumn({
  formula,
  name,
}: {
  formula: string;
  name: string;
}) {
  await userEvent.click(screen.getByRole("button", { name: "Custom column" }));
  const input = await enterFormula(formula);
  await userEvent.tab();
  expect(input).toHaveValue(formula);
  await userEvent.type(screen.getByTestId("expression-name"), name);
  const doneButton = screen.getByRole("button", { name: "Done" });
  await waitFor(() => expect(doneButton).toBeEnabled());
  await userEvent.click(doneButton);
  await waitFor(() => expect(queryExpressionWidget()).not.toBeInTheDocument());
  expect(
    within(getStep("step-expression-0-0")).getByText(name),
  ).toBeInTheDocument();
}

async function openFilterColumn(columnName: string) {
  await userEvent.click(screen.getByRole("button", { name: "Filter" }));
  const popover = await screen.findByTestId("clause-popover");
  await userEvent.click(await within(popover).findByText(columnName));
  return popover;
}

async function assertRelativeDateFilter(columnName: string) {
  const popover = await openFilterColumn(columnName);
  expect(
    within(popover).queryByPlaceholderText("Enter a number"),
  ).not.toBeInTheDocument();
  await userEvent.click(within(popover).getByText("Relative date range…"));
  await userEvent.click(within(popover).getByText("Previous"));
  expect(within(popover).getByDisplayValue("days")).toBeInTheDocument();
}

describe("Notebook > custom column > data type", () => {
  it("should understand string functions (metabase#13217)", async () => {
    setup({ tableId: PRODUCTS_ID });
    await addCustomColumn({
      formula: "concat([Category], [Title])",
      name: "CategoryTitle",
    });

    const popover = await openFilterColumn("CategoryTitle");
    expect(
      within(popover).queryByPlaceholderText("Enter a number"),
    ).not.toBeInTheDocument();
    expect(
      within(popover).getByPlaceholderText("Enter some text"),
    ).toBeInTheDocument();
  });

  it("should relay the type of a date field", async () => {
    setup({ tableId: PEOPLE_ID });
    await addCustomColumn({ formula: "[Birth Date]", name: "DoB" });
    await assertRelativeDateFilter("DoB");
  });

  it("should handle COALESCE", async () => {
    setup({ tableId: ORDERS_ID });
    await addCustomColumn({
      formula: "COALESCE([Product → Created At], [Created At])",
      name: "MiscDate",
    });
    await assertRelativeDateFilter("MiscDate");
  });
});

describe("Notebook > custom column > exiting the editor", () => {
  async function openCustomColumn() {
    await userEvent.click(
      screen.getByRole("button", { name: "Custom column" }),
    );
    return getExpressionInput();
  }

  async function addAnotherCustomColumn() {
    await userEvent.click(
      within(getStep("step-expression-0-0")).getByRole("img", {
        name: "add icon",
      }),
    );
    return getExpressionInput();
  }

  it("should only be possible to close the editor by pressing Escape when it is empty", async () => {
    setup();

    // untouched editor
    const input = await openCustomColumn();
    expect(input).toHaveFocus();
    await userEvent.keyboard("{Escape}");
    await waitFor(() =>
      expect(queryExpressionWidget()).not.toBeInTheDocument(),
    );

    // editor with text
    const nextInput = await addAnotherCustomColumn();
    await userEvent.click(nextInput);
    await userEvent.paste("count(");
    await userEvent.keyboard("{Escape}");
    expect(queryExpressionWidget()).toBeInTheDocument();
    expect(nextInput).toHaveValue("count(");

    await userEvent.clear(nextInput);
    expect(nextInput).toHaveValue("");
    await userEvent.keyboard("{Escape}");
    await waitFor(() =>
      expect(queryExpressionWidget()).not.toBeInTheDocument(),
    );
  });

  it("should be possible to exit the editor by clicking outside of it when there is no text", async () => {
    setup();

    // clicking a non-interactive element
    await openCustomColumn();
    await userEvent.click(within(getStep("step-data-0-0")).getByText("Data"));
    expect(queryCloseModal()).not.toBeInTheDocument();
    await waitFor(() =>
      expect(queryExpressionWidget()).not.toBeInTheDocument(),
    );

    // clicking an interactive element
    await addAnotherCustomColumn();
    await userEvent.click(
      within(getStep("step-data-0-0")).getByRole("button", {
        name: "Pick columns",
      }),
    );
    expect(queryCloseModal()).not.toBeInTheDocument();
    await waitFor(() =>
      expect(queryExpressionWidget()).not.toBeInTheDocument(),
    );
    expect(await screen.findByText("Select all")).toBeInTheDocument();
  });

  it("should ask to keep editing or discard changes when clicking outside of the editor with an unsaved expression", async () => {
    setup();

    const input = await openCustomColumn();
    await userEvent.click(input);
    await userEvent.paste("1+1");
    const pickColumnsButton = within(getStep("step-data-0-0")).getByRole(
      "button",
      { name: "Pick columns" },
    );

    await userEvent.click(pickColumnsButton);
    expect(screen.queryByText("Select all")).not.toBeInTheDocument();
    expect(queryExpressionWidget()).toBeInTheDocument();
    let modal = await findCloseModal();
    expect(
      within(modal).getByText("Keep editing your custom expression?"),
    ).toBeInTheDocument();
    expect(
      within(modal).getByRole("button", { name: "Discard changes" }),
    ).toBeEnabled();
    await userEvent.click(
      within(modal).getByRole("button", { name: "Keep editing" }),
    );

    await waitFor(() => expect(queryCloseModal()).not.toBeInTheDocument());
    expect(queryExpressionWidget()).toBeInTheDocument();
    expect(screen.getByTestId("custom-expression-query-editor")).toHaveValue(
      "1+1",
    );

    // discard changes
    await userEvent.click(pickColumnsButton);
    expect(queryExpressionWidget()).toBeInTheDocument();
    expect(screen.queryByText("Select all")).not.toBeInTheDocument();
    modal = await findCloseModal();
    expect(
      within(modal).getByText("Keep editing your custom expression?"),
    ).toBeInTheDocument();
    expect(
      within(modal).getByRole("button", { name: "Keep editing" }),
    ).toBeEnabled();
    await userEvent.click(
      within(modal).getByRole("button", { name: "Discard changes" }),
    );

    await waitFor(() => expect(queryCloseModal()).not.toBeInTheDocument());
    await waitFor(() =>
      expect(queryExpressionWidget()).not.toBeInTheDocument(),
    );
  });

  it("should be possible to discard changes by clicking cancel button", async () => {
    setup();

    const input = await openCustomColumn();
    await userEvent.click(input);
    await userEvent.paste("1+1");
    await userEvent.tab();
    await userEvent.type(screen.getByTestId("expression-name"), "OK");
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Done" })).toBeEnabled(),
    );
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));

    expect(queryCloseModal()).not.toBeInTheDocument();
    await waitFor(() =>
      expect(queryExpressionWidget()).not.toBeInTheDocument(),
    );
    expect(
      within(getStep("step-expression-0-0")).queryByText("OK"),
    ).not.toBeInTheDocument();
  });

  it("should be possible to close the popover when navigating away from the expression editor", async () => {
    setup();

    await openCustomColumn();
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
    await userEvent.click(screen.getByRole("button", { name: "Summarize" }));
    await userEvent.click(await screen.findByText("Custom Expression"));
    const input = await getExpressionInput();
    await userEvent.click(input);
    await userEvent.paste("1+1");
    await userEvent.tab();

    // go back to the aggregation picker
    await userEvent.click(screen.getByText("Custom Expression"));
    expect(await screen.findByText("Count of rows")).toBeInTheDocument();

    // close the popover by clicking outside
    await userEvent.click(
      screen.getByRole("button", { name: "Outside the notebook" }),
    );
    expect(queryCloseModal()).not.toBeInTheDocument();
    await waitFor(() =>
      expect(screen.queryByText("Count of rows")).not.toBeInTheDocument(),
    );
    expect(screen.queryByTestId("clause-popover")).not.toBeInTheDocument();
  });
});

describe("Notebook > custom column > function browser", () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("should not show aggregations unless aggregating", async () => {
    ignoreFunctionBrowserKeyWarning();
    setup();

    await userEvent.click(
      screen.getByRole("button", { name: "Custom column" }),
    );
    await getExpressionInput();
    await userEvent.click(
      screen.getByRole("button", { name: "Function browser" }),
    );
    let functionBrowser = await screen.findByTestId(
      "expression-editor-function-browser",
    );
    await userEvent.type(
      within(functionBrowser).getByPlaceholderText("Search functions…"),
      "Count",
    );
    expect(
      within(functionBrowser).queryByText("Count"),
    ).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
    await waitFor(() =>
      expect(queryExpressionWidget()).not.toBeInTheDocument(),
    );

    await userEvent.click(screen.getByRole("button", { name: "Summarize" }));
    await userEvent.click(await screen.findByText("Custom Expression"));
    await getExpressionInput();
    await userEvent.click(
      screen.getByRole("button", { name: "Function browser" }),
    );
    functionBrowser = await screen.findByTestId(
      "expression-editor-function-browser",
    );
    await userEvent.type(
      within(functionBrowser).getByPlaceholderText("Search aggregations…"),
      "Count",
    );
    expect(within(functionBrowser).getByText("Count")).toBeInTheDocument();
  });
});

describe("Notebook > custom aggregation", () => {
  it("should show the formatted DistinctIf formula when editing it", async () => {
    const { getRecentQuery } = setup({
      features: [...COMMON_DATABASE_FEATURES, "distinct-where"],
    });

    await userEvent.click(screen.getByRole("button", { name: "Summarize" }));
    await userEvent.click(await screen.findByText("Custom Expression"));
    await enterFormula("DistinctIf([ID], [Category] = 'Gadget')");
    await userEvent.tab();
    await userEvent.type(screen.getByTestId("expression-name"), "Distinct");
    const doneButton = screen.getByRole("button", { name: "Done" });
    await waitFor(() => expect(doneButton).toBeEnabled());
    await userEvent.click(doneButton);
    expect(getDistinctIfParts(getRecentQuery())).toEqual({
      name: "Distinct",
      operator: "=",
      value: "Gadget",
    });

    // modify the expression
    const summarizeStep = getStep("step-summarize-0-0");
    await userEvent.click(await within(summarizeStep).findByText("Distinct"));
    const input = await getExpressionInput();
    expect(input).toHaveValue('DistinctIf([ID], [Category] = "Gadget")');
    await userEvent.clear(input);
    await userEvent.paste("DistinctIf([ID], [Category] != 'Gadget')");
    await userEvent.tab();
    const updateButton = screen.getByRole("button", { name: "Update" });
    await waitFor(() => expect(updateButton).toBeEnabled());
    await userEvent.click(updateButton);

    expect(getDistinctIfParts(getRecentQuery())).toEqual({
      name: "Distinct",
      operator: "!=",
      value: "Gadget",
    });
    await userEvent.click(await within(summarizeStep).findByText("Distinct"));
    expect(await getExpressionInput()).toHaveValue(
      'DistinctIf([ID], [Category] != "Gadget")',
    );
  });
});

describe("Notebook > custom aggregation > in a follow up stage", () => {
  function createNestedAggregationQuery({
    hasBreakout,
  }: {
    hasBreakout: boolean;
  }) {
    return Lib.createTestQuery(SAMPLE_PROVIDER, {
      stages: [
        {
          source: { type: "table", id: ORDERS_ID },
          aggregations: [
            {
              name: "Foo",
              value: {
                type: "operator",
                operator: "min",
                args: [{ type: "column", name: "SUBTOTAL" }],
              },
            },
            {
              name: "Bar",
              value: {
                type: "operator",
                operator: "+",
                args: [
                  { type: "column", name: "Foo" },
                  {
                    type: "operator",
                    operator: "avg",
                    args: [{ type: "column", name: "TAX" }],
                  },
                ],
              },
            },
          ],
          breakouts: hasBreakout
            ? [{ type: "column", name: "CREATED_AT", unit: "month" }]
            : [],
        },
      ],
    });
  }

  function getSummarizeStep() {
    return getStep("step-summarize-0-0");
  }

  function getPreviousStageColumnName(
    query: Lib.Query,
    expression: Lib.ExpressionParts | Lib.ExpressionArg,
  ) {
    const info = Lib.displayInfo(query, 1, getColumn(expression));
    expect(info).toMatchObject({ isFromPreviousStage: true });
    return info.displayName;
  }

  it.each([
    { title: "without a breakout", hasBreakout: false },
    { title: "with a breakout", hasBreakout: true },
  ])(
    "should be possible to use nested aggregations in custom columns $title",
    async ({ hasBreakout }) => {
      const { getRecentQuery } = setup({
        query: createNestedAggregationQuery({ hasBreakout }),
      });

      await userEvent.click(
        within(getSummarizeStep()).getByRole("button", {
          name: "Custom column",
        }),
      );
      await enterFormula("[Foo] + [Bar]");
      await userEvent.tab();
      await userEvent.type(screen.getByTestId("expression-name"), "Sum");
      const doneButton = screen.getByRole("button", { name: "Done" });
      await waitFor(() => expect(doneButton).toBeEnabled());
      await userEvent.click(doneButton);

      expect(
        within(getStep("step-expression-1-0")).getByText("Sum"),
      ).toBeInTheDocument();
      const query = getRecentQuery();
      const [expression] = Lib.expressions(query, 1);
      const parts = getOperatorParts(Lib.expressionParts(query, 1, expression));
      expect(parts.operator).toBe("+");
      expect(
        parts.args.map((arg) => getPreviousStageColumnName(query, arg)),
      ).toEqual(["Foo", "Bar"]);
    },
  );

  it("should be possible to use nested aggregations in filter clause", async () => {
    const { getRecentQuery } = setup({
      query: createNestedAggregationQuery({ hasBreakout: true }),
    });

    await userEvent.click(
      within(getSummarizeStep()).getByRole("button", { name: "Filter" }),
    );
    const popover = await screen.findByTestId("clause-popover");
    await userEvent.click(await within(popover).findByText("Bar"));
    await userEvent.type(within(popover).getByPlaceholderText("Min"), "5");
    await userEvent.type(within(popover).getByPlaceholderText("Max"), "20");
    await userEvent.click(
      within(popover).getByRole("button", { name: "Add filter" }),
    );

    expect(
      await within(getStep("step-filter-1-0")).findByText(
        "Bar is between 5 and 20",
      ),
    ).toBeInTheDocument();
    const query = getRecentQuery();
    const [filter] = Lib.filters(query, 1);
    const parts = checkNotNull(Lib.numberFilterParts(query, 1, filter));
    expect(parts.operator).toBe("between");
    expect(parts.values).toEqual([5, 20]);
    expect(getPreviousStageColumnName(query, parts.column)).toBe("Bar");
  });

  // The Sort action of the summarize step sorts the summarized stage itself
  it("should be possible to sort by a nested aggregation", async () => {
    const { getRecentQuery } = setup({
      query: createNestedAggregationQuery({ hasBreakout: true }),
    });

    await userEvent.click(
      within(getSummarizeStep()).getByRole("button", { name: "Sort" }),
    );
    const popover = await screen.findByTestId("clause-popover");
    await userEvent.click(await within(popover).findByText("Bar"));

    expect(
      await within(getStep("step-sort-0-0")).findByText("Bar"),
    ).toBeInTheDocument();
    const query = getRecentQuery();
    expect(Lib.stageCount(query)).toBe(1);
    const [orderBy] = Lib.orderBys(query, 0);
    expect(Lib.displayInfo(query, 0, orderBy)).toMatchObject({
      displayName: "Bar",
      direction: "asc",
    });
    const sortedColumns = Lib.orderableColumns(query, 0)
      .map((column) => Lib.displayInfo(query, 0, column))
      .filter((info) => info.orderByPosition != null);
    expect(sortedColumns).toEqual([
      expect.objectContaining({
        displayName: "Bar",
        isAggregation: true,
        orderByPosition: 0,
      }),
    ]);
  });

  it("should be possible to summarize nested aggregations", async () => {
    const { getRecentQuery } = setup({
      query: createNestedAggregationQuery({ hasBreakout: true }),
    });

    await userEvent.click(
      within(getSummarizeStep()).getByRole("button", { name: "Summarize" }),
    );
    await userEvent.click(await screen.findByText("Count of rows"));

    expect(
      await within(getStep("step-summarize-1-0")).findByText("Count"),
    ).toBeInTheDocument();
    const query = getRecentQuery();
    expect(Lib.stageCount(query)).toBe(2);
    const [aggregation] = Lib.aggregations(query, 1);
    expect(Lib.displayInfo(query, 1, aggregation).displayName).toBe("Count");
  });

  it("should be possible to reference both aggregations with the same name", async () => {
    const query = Lib.createTestQuery(SAMPLE_PROVIDER, {
      stages: [
        {
          source: { type: "table", id: ORDERS_ID },
          aggregations: [
            {
              name: "Count",
              value: {
                type: "operator",
                operator: "+",
                args: [
                  { type: "operator", operator: "count", args: [] },
                  { type: "literal", value: 1 },
                ],
              },
            },
            {
              name: "Count",
              value: {
                type: "operator",
                operator: "+",
                args: [
                  { type: "column", name: "Count" },
                  { type: "literal", value: 1 },
                ],
              },
            },
          ],
          breakouts: [{ type: "column", name: "CREATED_AT", unit: "month" }],
        },
      ],
    });
    const { getRecentQuery } = setup({ query });

    // filter by the first Count
    await userEvent.click(
      within(getSummarizeStep()).getByRole("button", { name: "Filter" }),
    );
    let popover = await screen.findByTestId("clause-popover");
    let counts = await within(popover).findAllByText("Count");
    expect(counts).toHaveLength(2);
    await userEvent.click(counts[0]);
    await userEvent.type(within(popover).getByPlaceholderText("Max"), "2.5");
    await userEvent.click(
      within(popover).getByRole("button", { name: "Add filter" }),
    );

    // filter by the second Count
    await userEvent.click(
      within(getStep("step-filter-1-0")).getByRole("img", { name: "add icon" }),
    );
    popover = await screen.findByTestId("clause-popover");
    counts = await within(popover).findAllByText("Count");
    expect(counts).toHaveLength(2);
    await userEvent.click(counts[1]);
    await userEvent.type(within(popover).getByPlaceholderText("Min"), "2.5");
    await userEvent.click(
      within(popover).getByRole("button", { name: "Add filter" }),
    );

    const nextQuery = getRecentQuery();
    const [firstCount, secondCount] = Lib.filterableColumns(
      nextQuery,
      1,
    ).filter(
      (column) => Lib.displayInfo(nextQuery, 1, column).displayName === "Count",
    );
    const filters = Lib.filters(nextQuery, 1).map((filter) =>
      checkNotNull(Lib.numberFilterParts(nextQuery, 1, filter)),
    );
    expect(filters).toHaveLength(2);
    const [maxFilter, minFilter] = filters;
    expect(maxFilter).toMatchObject({ operator: "<=", values: [2.5] });
    expect(minFilter).toMatchObject({ operator: ">=", values: [2.5] });
    // both columns are named "Count", so tell them apart by their reference
    const getRef = (column: Lib.ColumnMetadata) =>
      Lib.legacyRef(nextQuery, 1, column);
    expect(getRef(firstCount)).not.toEqual(getRef(secondCount));
    expect(getRef(maxFilter.column)).toEqual(getRef(firstCount));
    expect(getRef(minFilter.column)).toEqual(getRef(secondCount));
  });
});

function getOperatorParts(
  parts: Lib.ExpressionParts | Lib.ExpressionArg,
): Lib.ExpressionParts {
  if (!Lib.isExpressionParts(parts)) {
    throw new Error("Expected an operator");
  }
  return parts;
}

function getColumn(
  arg: Lib.ExpressionParts | Lib.ExpressionArg,
): Lib.ColumnMetadata {
  if (!Lib.isColumnMetadata(arg)) {
    throw new Error("Expected a column");
  }
  return arg;
}

function getDistinctIfParts(query: Lib.Query) {
  const [aggregation] = Lib.aggregations(query, 0);
  const parts = getOperatorParts(Lib.expressionParts(query, 0, aggregation));
  expect(parts.operator).toBe("distinct-where");
  const [column, condition] = parts.args;
  expect(Lib.displayInfo(query, 0, getColumn(column)).displayName).toBe("ID");
  const conditionParts = getOperatorParts(condition);
  const [category, value] = conditionParts.args;
  expect(Lib.displayInfo(query, 0, getColumn(category)).displayName).toBe(
    "Category",
  );
  return {
    name: Lib.displayInfo(query, 0, aggregation).displayName,
    operator: conditionParts.operator,
    value,
  };
}

/**
 * `FunctionBrowser` renders each group of functions in a fragment without a
 * key, and the test setup fails a test on that warning. Drop only that warning
 * until the component is fixed.
 */
function ignoreFunctionBrowserKeyWarning() {
  const originalError = console.error;
  jest.spyOn(console, "error").mockImplementation((...args) => {
    const [template, ...rest] = args;
    const isFunctionBrowserKeyWarning =
      typeof template === "string" &&
      template.includes('unique "key" prop') &&
      rest.some(
        (arg) => typeof arg === "string" && arg.includes("FunctionBrowser"),
      );
    if (!isFunctionBrowserKeyWarning) {
      originalError(...args);
    }
  });
}
