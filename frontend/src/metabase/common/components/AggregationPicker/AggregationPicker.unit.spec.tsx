import React from "react";
import userEvent from "@testing-library/user-event";
import { render, screen, within } from "__support__/ui";
import * as Lib from "metabase-lib";
import {
  createQuery,
  columnFinder,
  findAggregationOperator,
} from "metabase-lib/test-helpers";
import { AggregationPicker } from "./AggregationPicker";

function createQueryWithCountAggregation() {
  const initialQuery = createQuery();
  const count = findAggregationOperator(initialQuery, "count");
  const clause = Lib.aggregationClause(count);
  return Lib.aggregate(initialQuery, 0, clause);
}

function createQueryWithMaxAggregation() {
  const initialQuery = createQuery();
  const max = findAggregationOperator(initialQuery, "max");
  const findColumn = columnFinder(
    initialQuery,
    Lib.aggregationOperatorColumns(max),
  );
  const quantity = findColumn("ORDERS", "QUANTITY");
  const clause = Lib.aggregationClause(max, quantity);
  return Lib.aggregate(initialQuery, 0, clause);
}

function setup({ query = createQuery() } = {}) {
  const clause = Lib.aggregations(query, 0)[0];

  const operators = clause
    ? Lib.selectedAggregationOperators(
        Lib.availableAggregationOperators(query, 0),
        clause,
      )
    : Lib.availableAggregationOperators(query, 0);

  const onSelect = jest.fn();

  function handleSelect(clause: Lib.AggregationClause) {
    const nextQuery = Lib.aggregate(query, 0, clause);
    const aggregations = Lib.aggregations(nextQuery, 0);
    const recentAggregation = aggregations[aggregations.length - 1];
    onSelect(Lib.displayInfo(nextQuery, 0, recentAggregation));
  }

  render(
    <AggregationPicker
      query={query}
      stageIndex={0}
      operators={operators}
      onSelect={handleSelect}
    />,
  );

  function getRecentClause() {
    const [lastCall] = onSelect.mock.calls.slice(-1);
    return lastCall?.[0];
  }

  return { getRecentClause };
}

describe("AggregationPicker", () => {
  describe("basic operators", () => {
    it("should list basic operators", () => {
      setup();

      expect(screen.getByText("Basic Metrics")).toBeInTheDocument();

      [
        "Count of rows",
        "Sum of ...",
        "Average of ...",
        "Number of distinct values of ...",
        "Cumulative sum of ...",
        "Cumulative count of rows",
        "Standard deviation of ...",
        "Minimum of ...",
        "Maximum of ...",
      ].forEach(name => {
        expect(screen.getByRole("option", { name })).toBeInTheDocument();
      });
    });

    it("should show operator descriptions", () => {
      setup();

      const sumOfOption = screen.getByRole("option", { name: "Sum of ..." });
      const infoIcon = within(sumOfOption).getByRole("img", {
        name: "question icon",
      });
      userEvent.hover(infoIcon);

      expect(screen.getByRole("tooltip")).toHaveTextContent(
        "Sum of all the values of a column",
      );
    });

    it("should apply a column-less operator", () => {
      const { getRecentClause } = setup();

      userEvent.click(screen.getByText("Count of rows"));

      expect(getRecentClause()).toEqual(
        expect.objectContaining({
          name: "count",
          displayName: "Count",
        }),
      );
    });

    it("should apply an operator requiring columns", () => {
      const { getRecentClause } = setup();

      userEvent.click(screen.getByText("Average of ..."));
      userEvent.click(screen.getByText("Quantity"));

      expect(getRecentClause()).toEqual(
        expect.objectContaining({
          name: "avg_QUANTITY",
          displayName: "Average of Quantity",
        }),
      );
    });

    it("should allow picking a foreign column", () => {
      const { getRecentClause } = setup();

      userEvent.click(screen.getByText("Average of ..."));
      userEvent.click(screen.getByText("Product"));
      userEvent.click(screen.getByText("Rating"));

      expect(getRecentClause()).toEqual(
        expect.objectContaining({
          name: "avg_RATING",
          displayName: "Average of Rating",
        }),
      );
    });

    it("should highlight selected operator", () => {
      setup({ query: createQueryWithCountAggregation() });

      expect(
        screen.getByRole("option", { name: "Count of rows" }),
      ).toHaveAttribute("aria-selected", "true");
      expect(
        screen.getByRole("option", { name: "Sum of ..." }),
      ).not.toHaveAttribute("aria-selected");
    });

    it("should highlight selected operator column", () => {
      setup({ query: createQueryWithMaxAggregation() });

      expect(screen.getByRole("option", { name: "Quantity" })).toHaveAttribute(
        "aria-selected",
        "true",
      );
      expect(
        screen.getByRole("option", { name: "Discount" }),
      ).not.toHaveAttribute("aria-selected");
    });

    it("shouldn't list columns for column-less operators", () => {
      setup();

      userEvent.click(screen.getByText("Count of rows"));

      expect(screen.queryByText("Quantity")).not.toBeInTheDocument();
      // check that we're still in the same step
      expect(screen.getByText("Average of ...")).toBeInTheDocument();
    });

    it("should allow to change an operator for existing aggregation", () => {
      const { getRecentClause } = setup({
        query: createQueryWithMaxAggregation(),
      });

      userEvent.click(screen.getByText("Maximum of ...")); // go back
      userEvent.click(screen.getByText("Average of ..."));
      userEvent.click(screen.getByText("Quantity"));

      expect(getRecentClause()).toEqual(
        expect.objectContaining({
          name: "avg_QUANTITY",
          displayName: "Average of Quantity",
        }),
      );
    });

    it("should allow to change a column for existing aggregation", () => {
      const { getRecentClause } = setup({
        query: createQueryWithMaxAggregation(),
      });

      userEvent.click(screen.getByText("Quantity"));

      expect(getRecentClause()).toEqual(
        expect.objectContaining({
          name: "max_QUANTITY",
          displayName: "Max of Quantity",
        }),
      );
    });
  });
});
