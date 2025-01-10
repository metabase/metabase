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
    {
      value: { type: "month", year: 2024, month: 1 },
      displayName: "Created At is Jan 1–31, 2024",
    },
    {
      value: { type: "month", year: 2024, month: 12 },
      displayName: "Created At is Dec 1–31, 2024",
    },
    {
      value: { type: "quarter", year: 2020, quarter: 1 },
      displayName: "Created At is Jan 1 – Mar 31, 2020",
    },
    {
      value: { type: "quarter", year: 2020, quarter: 4 },
      displayName: "Created At is Oct 1 – Dec 31, 2020",
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
