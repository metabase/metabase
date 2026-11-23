import userEvent from "@testing-library/user-event";
import { useState } from "react";

import { createMockMetadata } from "__support__/metadata";
import { setupDatabaseEndpoints } from "__support__/server-mocks";
import {
  createMockQueryBuilderState,
  createMockState,
} from "__support__/state";
import {
  act,
  getIcon,
  queryIcon,
  renderWithProviders,
  screen,
  waitFor,
} from "__support__/ui";
import { checkNotNull } from "metabase/utils/types";
import * as Lib from "metabase-lib";
import {
  SAMPLE_PROVIDER,
  createMetadataProvider,
} from "metabase-lib/test-helpers";
import {
  createMockCard,
  createMockStructuredDatasetQuery,
} from "metabase-types/api/mocks";
import {
  ORDERS,
  ORDERS_ID,
  PRODUCTS_ID,
  SAMPLE_DB_ID,
  createSampleDatabase,
} from "metabase-types/api/mocks/presets";

import { DEFAULT_QUESTION, createMockNotebookStep } from "../../test-utils";
import type { NotebookStep } from "../../types";

import { AggregateStep } from "./AggregateStep";

function createMetricAggregatedQuery() {
  const metric = createMockCard({
    id: 1,
    name: "Revenue",
    type: "metric",
    table_id: ORDERS_ID,
    dataset_query: createMockStructuredDatasetQuery({
      database: SAMPLE_DB_ID,
      query: {
        "source-table": ORDERS_ID,
        aggregation: [["sum", ["field", ORDERS.SUBTOTAL, null]]],
      },
    }),
  });
  const metadata = createMockMetadata({
    databases: [createSampleDatabase()],
    questions: [metric],
  });

  return Lib.createTestQuery(createMetadataProvider({ metadata }), {
    stages: [
      {
        source: { type: "table", id: ORDERS_ID },
        aggregations: [{ type: "metric", id: metric.id }],
        breakouts: [
          {
            type: "column",
            name: "CREATED_AT",
            unit: "month",
          },
        ],
      },
    ],
  });
}

function createAggregatedQuery() {
  return Lib.createTestQuery(SAMPLE_PROVIDER, {
    stages: [
      {
        source: {
          type: "table",
          id: ORDERS_ID,
        },
        aggregations: [
          {
            type: "operator",
            operator: "avg",
            args: [{ type: "column", name: "QUANTITY" }],
          },
        ],
      },
    ],
  });
}

function createQueryWithBracketNamedExpressions() {
  const onePlusOne = {
    type: "operator",
    operator: "+",
    args: [
      { type: "literal", value: 1 },
      { type: "literal", value: 1 },
    ],
  } as const;

  return Lib.createTestQuery(SAMPLE_PROVIDER, {
    stages: [
      {
        source: { type: "table", id: ORDERS_ID },
        expressions: [
          { name: "Other [2026]", value: onePlusOne },
          { name: "MyCC [2027]", value: onePlusOne },
        ],
        aggregations: [
          {
            type: "operator",
            operator: "sum",
            args: [{ type: "column", name: "MyCC [2027]" }],
          },
        ],
      },
    ],
  });
}

interface SetupOpts {
  step?: NotebookStep;
}

function setup({ step = createMockNotebookStep() }: SetupOpts = {}) {
  const updateQuery = jest.fn();

  setupDatabaseEndpoints(createSampleDatabase());

  renderWithProviders(
    <AggregateStep
      step={step}
      stageIndex={step.stageIndex}
      query={step.query}
      color="core-summarize"
      isLastOpened={false}
      reportTimezone="UTC"
      updateQuery={updateQuery}
    />,
    {
      storeInitialState: createMockState({
        qb: createMockQueryBuilderState({
          card: createMockCard(),
        }),
      }),
    },
  );

  function getNextQuery(): Lib.Query {
    const [lastCall] = updateQuery.mock.calls.slice(-1);
    return lastCall[0];
  }

  function getRecentAggregationClause() {
    const query = getNextQuery();
    const [clause] = Lib.aggregations(query, 0);
    return Lib.displayInfo(query, 0, clause);
  }

  return {
    getNextQuery,
    getRecentAggregationClause,
    updateQuery,
  };
}

interface SetupWithQueryUpdatesOpts {
  query: Lib.Query;
}

function setupWithQueryUpdates({ query }: SetupWithQueryUpdatesOpts) {
  const onQueryChange = jest.fn<void, [Lib.Query]>();

  setupDatabaseEndpoints(createSampleDatabase());

  function AggregateStepWithQueryUpdates() {
    const [currentQuery, setCurrentQuery] = useState(query);
    const step = createMockNotebookStep({ query: currentQuery });

    const handleUpdateQuery = async (nextQuery: Lib.Query) => {
      setCurrentQuery(nextQuery);
      onQueryChange(nextQuery);
    };

    return (
      <AggregateStep
        step={step}
        stageIndex={step.stageIndex}
        query={step.query}
        color="core-summarize"
        isLastOpened={false}
        reportTimezone="UTC"
        updateQuery={handleUpdateQuery}
      />
    );
  }

  renderWithProviders(<AggregateStepWithQueryUpdates />, {
    storeInitialState: createMockState({
      qb: createMockQueryBuilderState({
        card: createMockCard(),
      }),
    }),
  });

  function getRecentAggregation() {
    expect(onQueryChange).toHaveBeenCalled();
    const [recentQuery] = checkNotNull(onQueryChange.mock.lastCall);
    const aggregations = Lib.aggregations(recentQuery, 0);
    expect(aggregations).toHaveLength(1);
    const [aggregation] = aggregations;
    const parts = Lib.expressionParts(recentQuery, 0, aggregation);
    return {
      displayName: Lib.displayInfo(recentQuery, 0, aggregation).displayName,
      parts,
      predicateColumnName: getPredicateColumnName(recentQuery, parts),
    };
  }

  return { getRecentAggregation };
}

/** The display name of the column that `countIf(in(column, …))` tests. */
function getPredicateColumnName(
  query: Lib.Query,
  parts: Lib.ExpressionParts,
): string | undefined {
  const [predicate] = parts.args;
  if (!Lib.isExpressionParts(predicate)) {
    return undefined;
  }
  const [column] = predicate.args;
  return Lib.isColumnMetadata(column)
    ? Lib.displayInfo(query, 0, column).displayName
    : undefined;
}

async function enterCustomExpression({
  formula,
  name,
}: {
  formula: string;
  name: string;
}) {
  const input = await screen.findByTestId("custom-expression-query-editor");
  await waitFor(() => expect(input).toHaveProperty("readOnly", false));
  await userEvent.clear(input);
  await userEvent.type(input, formula);
  await act(async () => {
    input.blur();
  });

  const nameInput = screen.getByTestId("expression-name");
  await userEvent.clear(nameInput);
  await userEvent.type(nameInput, name);
}

describe("AggregateStep", () => {
  it("should render correctly without an aggregation", () => {
    setup();
    expect(screen.getByText("Pick a function or metric")).toBeInTheDocument();
  });

  it("should render correctly with an aggregation", () => {
    setup({ step: createMockNotebookStep({ query: createAggregatedQuery() }) });
    expect(screen.getByText("Average of Quantity")).toBeInTheDocument();
  });

  it("should use foreign key name for foreign table columns", () => {
    setup({
      step: createMockNotebookStep({
        query: Lib.createTestQuery(SAMPLE_PROVIDER, {
          stages: [
            {
              source: {
                type: "table",
                id: ORDERS_ID,
              },
              aggregations: [
                {
                  type: "operator",
                  operator: "avg",
                  args: [
                    {
                      type: "column",
                      name: "RATING",
                      sourceFieldId: ORDERS.PRODUCT_ID,
                    },
                  ],
                },
              ],
            },
          ],
        }),
      }),
    });
    expect(screen.getByText("Average of Product → Rating")).toBeInTheDocument();
  });

  it("should add an aggregation with a basic operator", async () => {
    const { getRecentAggregationClause } = setup();

    await userEvent.click(screen.getByText("Pick a function or metric"));
    await userEvent.click(screen.getByText("Average of ..."));
    await userEvent.click(screen.getByText("Quantity"));

    const clause = getRecentAggregationClause();
    expect(clause).toEqual(
      expect.objectContaining({
        name: "avg",
        displayName: "Average of Quantity",
      }),
    );
  });

  it("should change an aggregation operator", async () => {
    const { getNextQuery, getRecentAggregationClause } = setup({
      step: createMockNotebookStep({ query: createAggregatedQuery() }),
    });

    await userEvent.click(screen.getByText("Average of Quantity"));
    await userEvent.click(screen.getByText("Average of ...")); // go back to operator selection
    await userEvent.click(screen.getByText("Count of rows"));

    const nextQuery = getNextQuery();
    const clause = getRecentAggregationClause();
    expect(Lib.aggregations(nextQuery, 0)).toHaveLength(1);
    expect(clause).toEqual(
      expect.objectContaining({
        name: "count",
        displayName: "Count",
      }),
    );
  });

  it("should change an aggregation column", async () => {
    const { getNextQuery, getRecentAggregationClause } = setup({
      step: createMockNotebookStep({ query: createAggregatedQuery() }),
    });

    await userEvent.click(screen.getByText("Average of Quantity"));
    await userEvent.click(screen.getByText("Total"));

    const nextQuery = getNextQuery();
    const clause = getRecentAggregationClause();
    expect(Lib.aggregations(nextQuery, 0)).toHaveLength(1);
    expect(clause).toEqual(
      expect.objectContaining({
        name: "avg",
        displayName: "Average of Total",
      }),
    );
  });

  it("should remove an aggregation", async () => {
    const { getNextQuery } = setup({
      step: createMockNotebookStep({ query: createAggregatedQuery() }),
    });

    await userEvent.click(getIcon("close"));

    const nextQuery = getNextQuery();
    expect(Lib.aggregations(nextQuery, 0)).toHaveLength(0);
  });

  it("should open a metric aggregation with a breakout in the expression editor", async () => {
    setup({
      step: createMockNotebookStep({ query: createMetricAggregatedQuery() }),
    });

    await userEvent.click(screen.getByText("Revenue"));

    await waitFor(() =>
      expect(screen.getByTestId("custom-expression-query-editor")).toHaveValue(
        "[Revenue]",
      ),
    );
  });

  it("should update a named custom aggregation that uses `in` to use `notIn`", async () => {
    const { getRecentAggregation } = setupWithQueryUpdates({
      query: Lib.createTestQuery(SAMPLE_PROVIDER, {
        stages: [{ source: { type: "table", id: PRODUCTS_ID } }],
      }),
    });

    await userEvent.click(screen.getByText("Pick a function or metric"));
    await userEvent.click(await screen.findByText("Custom Expression"));
    await enterCustomExpression({
      formula: "countIf(in([[ID], 1, 2))",
      name: "CountIfIn",
    });
    await userEvent.click(screen.getByRole("button", { name: "Done" }));

    expect(await screen.findByText("CountIfIn")).toBeInTheDocument();
    expect(getRecentAggregation()).toMatchObject({
      displayName: "CountIfIn",
      parts: {
        operator: "count-where",
        args: [{ operator: "in", args: [expect.anything(), 1, 2] }],
      },
      predicateColumnName: "ID",
    });

    await userEvent.click(screen.getByText("CountIfIn"));
    await enterCustomExpression({
      formula: "countIf(notIn([[ID], 1, 2))",
      name: "CountIfIn",
    });
    await userEvent.click(screen.getByRole("button", { name: "Update" }));

    expect(await screen.findByText("CountIfIn")).toBeInTheDocument();
    expect(getRecentAggregation()).toMatchObject({
      displayName: "CountIfIn",
      parts: {
        operator: "count-where",
        args: [{ operator: "not-in", args: [expect.anything(), 1, 2] }],
      },
      predicateColumnName: "ID",
    });
  });

  it("should escape brackets of a custom column name when converting an aggregation to a custom expression (metabase#15316)", async () => {
    setup({
      step: createMockNotebookStep({
        query: createQueryWithBracketNamedExpressions(),
      }),
    });

    await userEvent.click(screen.getByText("Sum of MyCC [2027]"));
    const backButton = await screen.findByRole("button", { name: "Back" });
    expect(backButton).toHaveTextContent("Sum of ...");
    await userEvent.click(backButton);
    await userEvent.click(await screen.findByText("Custom Expression"));

    await waitFor(() =>
      expect(screen.getByTestId("custom-expression-query-editor")).toHaveValue(
        "Sum([MyCC \\[2027\\]])",
      ),
    );
  });

  describe("metrics", () => {
    it("should not allow to remove an existing aggregation or add another one", () => {
      const query = createAggregatedQuery();
      const question = DEFAULT_QUESTION.setType("metric").setQuery(query);
      const step = createMockNotebookStep({ question, query });
      setup({ step });

      expect(screen.getByText("Average of Quantity")).toBeInTheDocument();
      expect(queryIcon("close")).not.toBeInTheDocument();
      expect(queryIcon("add")).not.toBeInTheDocument();
    });

    // TODO: unskip this once we enable "Compare to the past" again
    // eslint-disable-next-line jest/no-disabled-tests
    it.skip("should not allow to use temporal comparisons for metrics", async () => {
      const query = Lib.createTestQuery(SAMPLE_PROVIDER, {
        stages: [
          {
            source: {
              type: "table",
              id: ORDERS_ID,
            },
            aggregations: [{ type: "operator", operator: "count", args: [] }],
          },
        ],
      });
      const question = DEFAULT_QUESTION.setType("metric").setQuery(query);
      const step = createMockNotebookStep({ question, query });
      setup({ step });

      await userEvent.click(screen.getByText("Count"));
      expect(await screen.findByText("Average of ...")).toBeInTheDocument();
      expect(screen.queryByText(/compare/i)).not.toBeInTheDocument();
    });

    // TODO: unskip this once we enable "Compare to the past" again
    // eslint-disable-next-line jest/no-disabled-tests
    it.skip("should allow to use temporal comparisons for non-metrics", async () => {
      const query = Lib.createTestQuery(SAMPLE_PROVIDER, {
        stages: [
          {
            source: {
              type: "table",
              id: ORDERS_ID,
            },
            aggregations: [{ type: "operator", operator: "count", args: [] }],
          },
        ],
      });
      const question = DEFAULT_QUESTION.setType("question").setQuery(query);
      const step = createMockNotebookStep({ question, query });
      setup({ step });

      await userEvent.click(screen.getByText("Count"));
      expect(screen.getByText(/compare/i)).toBeInTheDocument();
    });
  });
});
