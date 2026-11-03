import { render, screen } from "__support__/ui";
import * as Lib from "metabase-lib";
import {
  DEFAULT_TEST_QUERY,
  SAMPLE_PROVIDER,
  columnFinder,
} from "metabase-lib/test-helpers";

import { ExpressionBar } from "./ExpressionBar";
import { toFilterClause } from "./tokens";

describe("ExpressionBar", () => {
  it.each([
    { hasSourceFilters: true, hasStageFilters: true, separators: 1 },
    { hasSourceFilters: false, hasStageFilters: true, separators: 0 },
    { hasSourceFilters: true, hasStageFilters: false, separators: 0 },
  ])(
    "shows $separators then separators with source filters=$hasSourceFilters and stage filters=$hasStageFilters",
    ({ hasSourceFilters, hasStageFilters, separators }) => {
      const query = Lib.createTestQuery(SAMPLE_PROVIDER, DEFAULT_TEST_QUERY);
      const column = columnFinder(query, Lib.filterableColumns(query, 0))(
        "ORDERS",
        "TOTAL",
      );
      const filteredQuery = Lib.filter(
        query,
        0,
        toFilterClause(
          query,
          0,
          Lib.numberFilterClause({ operator: ">", column, values: [10] }),
        ),
      );

      render(
        <ExpressionBar
          query={hasSourceFilters ? filteredQuery : query}
          stageIndex={0}
          isAutoApply
          onChange={jest.fn()}
          trailing={hasStageFilters && <span>Next stage filters</span>}
        />,
      );

      expect(screen.queryAllByText("then")).toHaveLength(separators);
    },
  );
});
