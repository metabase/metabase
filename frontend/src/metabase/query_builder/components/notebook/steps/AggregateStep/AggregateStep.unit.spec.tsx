import userEvent from "@testing-library/user-event";
import { renderWithProviders, screen, getIcon } from "__support__/ui";
import * as Lib from "metabase-lib";
import {
  createQuery,
  columnFinder,
  findAggregationOperator,
} from "metabase-lib/test-helpers";
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
      query={step.query}
      topLevelQuery={step.topLevelQuery}
      color="summarize"
      isLastOpened={false}
      reportTimezone="UTC"
      updateQuery={updateQuery}
    />,
  );

  function getNextQuery() {
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
    setup(createMockNotebookStep({ topLevelQuery: createAggregatedQuery() }));
    expect(screen.getByText("Average of Quantity")).toBeInTheDocument();
  });

  it("should use foreign key name for foreign table columns", () => {
    setup(
      createMockNotebookStep({
        topLevelQuery: createAggregatedQuery({
          table: "PRODUCTS",
          column: "RATING",
        }),
      }),
    );
    expect(screen.getByText("Average of Product → Rating")).toBeInTheDocument();
  });

  it("should add an aggregation with a basic operator", () => {
    const { getRecentAggregationClause } = setup();

    userEvent.click(screen.getByText("Pick the metric you want to see"));
    userEvent.click(screen.getByText("Average of ..."));
    userEvent.click(screen.getByText("Quantity"));

    const clause = getRecentAggregationClause();
    expect(clause).toEqual(
      expect.objectContaining({
        name: "avg",
        displayName: "Average of Quantity",
      }),
    );
  });

  it("should change an aggregation operator", () => {
    const { getNextQuery, getRecentAggregationClause } = setup(
      createMockNotebookStep({ topLevelQuery: createAggregatedQuery() }),
    );

    userEvent.click(screen.getByText("Average of Quantity"));
    userEvent.click(screen.getByText("Average of ...")); // go back to operator selection
    userEvent.click(screen.getByText("Count of rows"));

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

  it("should change an aggregation column", () => {
    const { getNextQuery, getRecentAggregationClause } = setup(
      createMockNotebookStep({ topLevelQuery: createAggregatedQuery() }),
    );

    userEvent.click(screen.getByText("Average of Quantity"));
    userEvent.click(screen.getByText("Total"));

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

  it("should remove an aggregation", () => {
    const { getNextQuery } = setup(
      createMockNotebookStep({ topLevelQuery: createAggregatedQuery() }),
    );

    userEvent.click(getIcon("close"));

    const nextQuery = getNextQuery();
    expect(Lib.aggregations(nextQuery, 0)).toHaveLength(0);
  });
});
