import React from "react";
import userEvent from "@testing-library/user-event";
import { render, screen, getIcon } from "__support__/ui";
import * as Lib from "metabase-lib";
import {
  createQuery,
  columnFinder,
  findAggregationOperator,
} from "metabase-lib/test-helpers";
import { createMockNotebookStep } from "../../test-utils";
import { AggregateStep } from "./AggregateStep";

function createAggregatedQuery() {
  const initialQuery = createQuery();
  const average = findAggregationOperator(initialQuery, "avg");
  const findColumn = columnFinder(
    initialQuery,
    Lib.aggregationOperatorColumns(average),
  );
  const quantity = findColumn("ORDERS", "QUANTITY");
  const clause = Lib.aggregationClause(average, quantity);
  return Lib.aggregate(initialQuery, clause);
}

function setup(step = createMockNotebookStep()) {
  const updateQuery = jest.fn();

  render(
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
    const [clause] = Lib.aggregations(query);
    return Lib.displayInfo(query, clause);
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

  it("should add an aggregation with a basic operator", () => {
    const { getRecentAggregationClause } = setup();

    userEvent.click(screen.getByText("Pick the metric you want to see"));
    userEvent.click(screen.getByText("Average of ..."));
    userEvent.click(screen.getByText("Quantity"));

    const clause = getRecentAggregationClause();
    expect(clause).toEqual(
      expect.objectContaining({
        name: "avg_QUANTITY",
        displayName: "Average of Quantity",
      }),
    );
  });

  it("should change an aggregation operator", () => {
    const { getNextQuery, getRecentAggregationClause } = setup(
      createMockNotebookStep({ topLevelQuery: createAggregatedQuery() }),
    );

    userEvent.click(screen.getByText("Average of Quantity"));
    userEvent.click(screen.getByText("Count of rows"));

    const nextQuery = getNextQuery();
    const clause = getRecentAggregationClause();
    expect(Lib.aggregations(nextQuery)).toHaveLength(1);
    expect(clause).toEqual(
      expect.objectContaining({
        name: "count",
        displayName: "Count",
      }),
    );
  });

  it("should remove an aggregation", () => {
    const { getNextQuery } = setup(
      createMockNotebookStep({ topLevelQuery: createAggregatedQuery() }),
    );

    userEvent.click(getIcon("close"));

    const nextQuery = getNextQuery();
    expect(Lib.aggregations(nextQuery)).toHaveLength(0);
  });
});
