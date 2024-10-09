import userEvent from "@testing-library/user-event";

import {
  getIcon,
  queryIcon,
  renderWithProviders,
  screen,
} from "__support__/ui";
import * as Lib from "metabase-lib";
import { createQueryWithClauses } from "metabase-lib/test-helpers";
import { createMockCard } from "metabase-types/api/mocks";
import {
  createMockQueryBuilderState,
  createMockState,
} from "metabase-types/store/mocks";

import { DEFAULT_QUESTION, createMockNotebookStep } from "../../test-utils";
import type { NotebookStep } from "../../types";

import { AggregateStep } from "./AggregateStep";

function createAggregatedQuery() {
  return createQueryWithClauses({
    aggregations: [
      { operatorName: "avg", tableName: "ORDERS", columnName: "QUANTITY" },
    ],
  });
}

interface SetupOpts {
  step?: NotebookStep;
}

function setup({ step = createMockNotebookStep() }: SetupOpts = {}) {
  const updateQuery = jest.fn();

  renderWithProviders(
    <AggregateStep
      step={step}
      stageIndex={step.stageIndex}
      query={step.query}
      color="summarize"
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
    expect(
      screen.getByText("Pick the metric you want to see"),
    ).toBeInTheDocument();
  });

  it("should render correctly with an aggregation", () => {
    setup({ step: createMockNotebookStep({ query: createAggregatedQuery() }) });
    expect(screen.getByText("Average of Quantity")).toBeInTheDocument();
  });

  it("should use foreign key name for foreign table columns", () => {
    setup({
      step: createMockNotebookStep({
        query: createQueryWithClauses({
          aggregations: [
            {
              operatorName: "avg",
              tableName: "PRODUCTS",
              columnName: "RATING",
            },
          ],
        }),
      }),
    });
    expect(screen.getByText("Average of Product → Rating")).toBeInTheDocument();
  });

  it("should add an aggregation with a basic operator", async () => {
    const { getRecentAggregationClause } = setup();

    await userEvent.click(screen.getByText("Pick the metric you want to see"));
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
      const query = createQueryWithClauses({
        aggregations: [{ operatorName: "count" }],
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
      const query = createQueryWithClauses({
        aggregations: [{ operatorName: "count" }],
      });
      const question = DEFAULT_QUESTION.setType("question").setQuery(query);
      const step = createMockNotebookStep({ question, query });
      setup({ step });

      await userEvent.click(screen.getByText("Count"));
      expect(screen.getByText(/compare/i)).toBeInTheDocument();
    });
  });
});
