import { act, renderHook } from "@testing-library/react-hooks";
import type { DatePickerValue } from "metabase/querying/components/DatePicker";
import * as Lib from "metabase-lib";
import { columnFinder, createQuery } from "metabase-lib/test-helpers";
import { useDateFilter } from "./use-date-filter";

const DATE_1 = new Date(2020, 0, 1);
const DATE_2 = new Date(2020, 2, 3);

interface CreateFilterCase {
  value: DatePickerValue;
  displayName: string;
}

describe("useDateFilter", () => {
  const defaultQuery = createQuery();
  const stageIndex = 0;
  const availableColumns = Lib.filterableColumns(defaultQuery, stageIndex);
  const column = columnFinder(defaultQuery, availableColumns)(
    "ORDERS",
    "CREATED_AT",
  );

  it.each<CreateFilterCase>([
    {
      value: {
        type: "specific",
        operator: "=",
        values: [DATE_1],
      },
      displayName: "Created At is on Jan 1, 2020",
    },
    {
      value: {
        type: "specific",
        operator: "<",
        values: [DATE_1],
      },
      displayName: "Created At is before Jan 1, 2020",
    },
    {
      value: {
        type: "specific",
        operator: ">",
        values: [DATE_1],
      },
      displayName: "Created At is after Jan 1, 2020",
    },
    {
      value: {
        type: "specific",
        operator: "between",
        values: [DATE_1, DATE_2],
      },
      displayName: "Created At is Jan 1 – Mar 3, 2020",
    },
    {
      value: {
        type: "relative",
        value: -10,
        unit: "month",
      },
      displayName: "Created At is in the previous 10 months",
    },
    {
      value: {
        type: "relative",
        value: 10,
        unit: "month",
      },
      displayName: "Created At is in the next 10 months",
    },
    {
      value: {
        type: "relative",
        value: -10,
        unit: "month",
        offsetValue: -2,
        offsetUnit: "year",
      },
      displayName:
        "Created At is in the previous 10 months, starting 2 years ago",
    },
    {
      value: {
        type: "relative",
        value: 10,
        unit: "month",
        offsetValue: 2,
        offsetUnit: "year",
      },
      displayName:
        "Created At is in the next 10 months, starting 2 years from now",
    },
    {
      value: {
        type: "exclude",
        operator: "!=",
        unit: "hour-of-day",
        values: [10],
      },
      displayName: "Created At excludes the hour of 10 AM",
    },
    {
      value: {
        type: "exclude",
        operator: "!=",
        unit: "day-of-week",
        values: [2],
      },
      displayName: "Created At excludes Tuesdays",
    },
    {
      value: {
        type: "exclude",
        operator: "!=",
        unit: "month-of-year",
        values: [2],
      },
      displayName: "Created At excludes each Mar",
    },
    {
      value: {
        type: "exclude",
        operator: "!=",
        unit: "quarter-of-year",
        values: [2],
      },
      displayName: "Created At excludes Q2 each year",
    },
    {
      value: {
        type: "exclude",
        operator: "is-null",
        values: [],
      },
      displayName: "Created At is empty",
    },
    {
      value: {
        type: "exclude",
        operator: "not-null",
        values: [],
      },
      displayName: "Created At is not empty",
    },
  ])(
    "should allow to create a filter: $displayName",
    ({ value, displayName }) => {
      const { result } = renderHook(() =>
        useDateFilter({
          query: defaultQuery,
          stageIndex,
          column,
        }),
      );

      act(() => {
        const { getFilterClause } = result.current;
        const newFilter = getFilterClause(value);

        expect(
          Lib.displayInfo(defaultQuery, stageIndex, newFilter),
        ).toMatchObject({
          displayName,
        });
      });
    },
  );
});
