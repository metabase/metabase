import { render, screen } from "__support__/ui";
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
});
