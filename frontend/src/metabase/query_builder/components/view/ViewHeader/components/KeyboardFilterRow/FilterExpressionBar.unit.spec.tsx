import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";
import { useState } from "react";

import { render, renderWithProviders, screen } from "__support__/ui";
import { checkNotNull } from "metabase/utils/types";
import * as Lib from "metabase-lib";
import { DEFAULT_TEST_QUERY, SAMPLE_PROVIDER } from "metabase-lib/test-helpers";

import { FilterExpressionBar } from "./FilterExpressionBar";
import { toFilterClause } from "./tokens";

describe("FilterExpressionBar", () => {
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
    fetchMock.get("path:/api/prototype/field-categories", []);
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
