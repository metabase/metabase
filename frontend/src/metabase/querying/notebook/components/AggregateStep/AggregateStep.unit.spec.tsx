import userEvent from "@testing-library/user-event";

import { createMockMetadata } from "__support__/metadata";
import { setupDatabaseEndpoints } from "__support__/server-mocks";
import {
  createMockQueryBuilderState,
  createMockState,
} from "__support__/state";
import {
  getIcon,
  queryIcon,
  renderWithProviders,
  screen,
  waitFor,
} from "__support__/ui";
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
            sourceName: "ORDERS",
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
            args: [{ type: "column", sourceName: "ORDERS", name: "QUANTITY" }],
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
