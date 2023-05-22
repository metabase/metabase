import React from "react";
import userEvent from "@testing-library/user-event";
import { render, screen, within } from "__support__/ui";
import * as Lib from "metabase-lib";
import { createQuery } from "metabase-lib/test-helpers";
import { AggregationPicker } from "./AggregationPicker";

function setup({ query = createQuery() } = {}) {
  const operators = Lib.availableAggregationOperators(query);
  const onSelect = jest.fn();

  function handleSelect(clause: Lib.AggregationClause) {
    const nextQuery = Lib.aggregate(query, clause);
    const aggregations = Lib.aggregations(nextQuery);
    const recentAggregation = aggregations[aggregations.length - 1];
    onSelect(Lib.displayInfo(nextQuery, recentAggregation));
  }

  render(
    <AggregationPicker
      query={query}
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
  });
});
