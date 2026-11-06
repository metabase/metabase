import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";
import { useState } from "react";

import { render, renderWithProviders, screen } from "__support__/ui";
import { checkNotNull } from "metabase/utils/types";
import * as Lib from "metabase-lib";
import { DEFAULT_TEST_QUERY, SAMPLE_PROVIDER } from "metabase-lib/test-helpers";

import { FilterExpressionBar } from "./FilterExpressionBar";
import {
  CLOSE_PAREN,
  OPEN_PAREN,
  filterToken,
  opToken,
  toFilterClause,
  writeTokens,
} from "./tokens";

describe("FilterExpressionBar", () => {
  it("lays out nested parentheses of a summary bar with the toggle in the rows bar", async () => {
    const query = Lib.createTestQuery(SAMPLE_PROVIDER, DEFAULT_TEST_QUERY);
    const count = checkNotNull(
      Lib.availableAggregationOperators(query, 0).find(
        (operator) => Lib.displayInfo(query, 0, operator).shortName === "count",
      ),
    );
    const aggregatedQuery = Lib.appendStage(
      Lib.aggregate(query, 0, Lib.aggregationClause(count)),
    );
    const column = Lib.filterableColumns(aggregatedQuery, 1)[0];
    const pill = (value: number) =>
      filterToken(
        toFilterClause(
          aggregatedQuery,
          1,
          Lib.numberFilterClause({ operator: ">", column, values: [value] }),
        ),
      );
    const nestedQuery = writeTokens(aggregatedQuery, 1, [
      pill(1),
      opToken("or"),
      OPEN_PAREN,
      pill(2),
      opToken("and"),
      OPEN_PAREN,
      pill(3),
      opToken("or"),
      pill(4),
      CLOSE_PAREN,
      CLOSE_PAREN,
    ]);

    renderWithProviders(
      <FilterExpressionBar
        query={nestedQuery}
        isAutoApply
        openKey={null}
        onFold={jest.fn()}
        onChange={jest.fn()}
      />,
    );

    const toggle = screen.getByRole("button", {
      name: "Show on multiple rows",
    });
    const [rowsBar, summaryBar] = screen.getAllByTestId(
      "filter-expression-bar",
    );
    expect(summaryBar).toHaveAttribute("data-layout", "line");

    await userEvent.click(toggle);

    expect(summaryBar).toHaveAttribute("data-layout", "rows");
    // The rows bar has no nested parentheses of its own to lay out.
    expect(rowsBar).toHaveAttribute("data-layout", "line");
  });

  it.each([
    { hasSourceFilters: false, isAutoApply: true },
    { hasSourceFilters: true, isAutoApply: true },
    { hasSourceFilters: false, isAutoApply: false },
    { hasSourceFilters: true, isAutoApply: false },
  ])(
    "shows both summary stages with source filters=$hasSourceFilters and auto apply=$isAutoApply",
    ({ hasSourceFilters, isAutoApply }) => {
      let query = Lib.createTestQuery(SAMPLE_PROVIDER, DEFAULT_TEST_QUERY);
      if (hasSourceFilters) {
        query = Lib.filter(
          query,
          0,
          toFilterClause(
            query,
            0,
            Lib.numberFilterClause({
              operator: ">",
              column: checkNotNull(Lib.filterableColumns(query, 0)[0]),
              values: [0],
            }),
          ),
        );
      }
      for (let stageIndex = 0; stageIndex < 2; stageIndex++) {
        const count = checkNotNull(
          Lib.availableAggregationOperators(query, stageIndex).find(
            (operator) =>
              Lib.displayInfo(query, stageIndex, operator).shortName ===
              "count",
          ),
        );
        query = Lib.appendStage(
          Lib.aggregate(query, stageIndex, Lib.aggregationClause(count)),
        );
        const filterStage = stageIndex + 1;
        const column = checkNotNull(
          Lib.filterableColumns(query, filterStage)[0],
        );
        query = Lib.filter(
          query,
          filterStage,
          toFilterClause(
            query,
            filterStage,
            Lib.numberFilterClause({
              operator: ">",
              column,
              values: [stageIndex],
            }),
          ),
        );
      }

      render(
        <FilterExpressionBar
          query={query}
          isAutoApply={isAutoApply}
          openKey={null}
          onFold={jest.fn()}
          onChange={jest.fn()}
        />,
      );

      expect(screen.getAllByTestId("filter-pill")).toHaveLength(
        hasSourceFilters ? 3 : 2,
      );
      expect(screen.getAllByText("then")).toHaveLength(
        hasSourceFilters ? 2 : 1,
      );
    },
  );

  it("clears the filters of every stage and opens a new pill", async () => {
    // The new pill's column list loads these.
    fetchMock.get("path:/api/prototype/filter-usage", []);
    fetchMock.get("path:/api/prototype/samples", { tables: [], columns: [] });
    let query = Lib.createTestQuery(SAMPLE_PROVIDER, DEFAULT_TEST_QUERY);
    const addFilter = (stageIndex: number) => {
      query = Lib.filter(
        query,
        stageIndex,
        toFilterClause(
          query,
          stageIndex,
          Lib.numberFilterClause({
            operator: ">",
            column: checkNotNull(Lib.filterableColumns(query, stageIndex)[0]),
            values: [0],
          }),
        ),
      );
    };
    addFilter(0);
    const count = checkNotNull(
      Lib.availableAggregationOperators(query, 0).find(
        (operator) => Lib.displayInfo(query, 0, operator).shortName === "count",
      ),
    );
    query = Lib.appendStage(
      Lib.aggregate(query, 0, Lib.aggregationClause(count)),
    );
    addFilter(1);
    const onChange = jest.fn();

    function Bar() {
      const [currentQuery, setCurrentQuery] = useState(query);
      return (
        <FilterExpressionBar
          query={currentQuery}
          isAutoApply
          openKey={null}
          onFold={jest.fn()}
          onChange={(newQuery) => {
            onChange(newQuery);
            setCurrentQuery(newQuery);
          }}
        />
      );
    }
    renderWithProviders(<Bar />);
    expect(screen.getAllByTestId("filter-pill")).toHaveLength(2);

    await userEvent.click(
      screen.getByRole("button", { name: "Clear filters" }),
    );

    const clearedQuery = onChange.mock.lastCall[0];
    expect(
      Lib.stageIndexes(clearedQuery).flatMap((stageIndex) =>
        Lib.filters(clearedQuery, stageIndex),
      ),
    ).toHaveLength(0);
    expect(screen.queryByTestId("filter-pill")).not.toBeInTheDocument();
    expect(
      screen.getByPlaceholderText("Start typing to add a filter..."),
    ).toHaveFocus();
    expect(
      screen.queryByRole("button", { name: "Clear filters" }),
    ).not.toBeInTheDocument();
  });
});
