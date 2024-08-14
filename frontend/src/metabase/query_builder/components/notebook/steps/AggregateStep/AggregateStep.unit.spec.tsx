import userEvent from "@testing-library/user-event";

import { getIcon, renderWithProviders, screen } from "__support__/ui";
import * as Lib from "metabase-lib";
import {
  columnFinder,
  createQuery,
  findAggregationOperator,
} from "metabase-lib/test-helpers";
import { createMockCard } from "metabase-types/api/mocks";
import {
  createMockQueryBuilderState,
  createMockState,
} from "metabase-types/store/mocks";

import { createMockNotebookStep } from "../../test-utils";

import { AggregateStep } from "./AggregateStep";

function createAggregatedQuery({
  table = "ORDERS",
  column = "QUANTITY",
}: { table?: string; column?: string } = {}) {
  const initialQuery = createQuery();
  const average = findAggregationOperator(initialQuery, "avg");
  const findColumn = columnFinder(
    initialQuery,
    Lib.aggregationOperatorColumns(average),
  );
  const quantity = findColumn(table, column);
  const clause = Lib.aggregationClause(average, quantity);
  return Lib.aggregate(initialQuery, 0, clause);
}

function setup(step = createMockNotebookStep()) {
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
    setup(createMockNotebookStep({ query: createAggregatedQuery() }));
    expect(screen.getByText("Average of Quantity")).toBeInTheDocument();
  });

  it("should use foreign key name for foreign table columns", () => {
    setup(
      createMockNotebookStep({
        query: createAggregatedQuery({
          table: "PRODUCTS",
          column: "RATING",
        }),
      }),
    );
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
    const { getNextQuery, getRecentAggregationClause } = setup(
      createMockNotebookStep({ query: createAggregatedQuery() }),
    );

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
    const { getNextQuery, getRecentAggregationClause } = setup(
      createMockNotebookStep({ query: createAggregatedQuery() }),
    );

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
    const { getNextQuery } = setup(
      createMockNotebookStep({ query: createAggregatedQuery() }),
    );

    await userEvent.click(getIcon("close"));

    const nextQuery = getNextQuery();
    expect(Lib.aggregations(nextQuery, 0)).toHaveLength(0);
  });
});
