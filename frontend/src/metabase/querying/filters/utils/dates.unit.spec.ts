import type { DateFilterValue } from "metabase/querying/filters/types";
import * as Lib from "metabase-lib";
import { columnFinder, createQuery } from "metabase-lib/test-helpers";

import { getDateFilterClause } from "./dates";

type DateFilterClauseCase = {
  value: DateFilterValue;
  displayName: string;
};

describe("getDateFilterClause", () => {
  const query = createQuery();
  const stageIndex = 0;
  const columns = Lib.filterableColumns(query, stageIndex);
  const findColumn = columnFinder(query, columns);
  const column = findColumn("ORDERS", "CREATED_AT");

  it.each<DateFilterClauseCase>([
    {
      value: { type: "relative", value: "current", unit: "day" },
      displayName: "Created At is today",
    },
  ])(
    "should convert a filter value to a filter clause",
    ({ value, displayName }) => {
      const filter = getDateFilterClause(column, value);
      expect(Lib.displayInfo(query, stageIndex, filter)).toMatchObject({
        displayName,
      });
    },
  );
});
