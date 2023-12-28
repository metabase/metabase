import { renderHook } from "@testing-library/react-hooks";
import type { DatePickerValue } from "metabase/querying/components/DatePicker";
import * as Lib from "metabase-lib";
import { columnFinder, createQuery } from "metabase-lib/test-helpers";
import { useDateFilter } from "./use-date-filter";

describe("useDateFilter", () => {
  const defaultQuery = createQuery();
  const stageIndex = 0;
  const availableColumns = Lib.filterableColumns(defaultQuery, stageIndex);
  const column = columnFinder(defaultQuery, availableColumns)(
    "ORDERS",
    "CREATED_AT",
  );
  const testCases = getTestCases(defaultQuery, stageIndex, column);

  it.each(testCases)(
    "should allow to create a filter: $displayName",
    ({ value, displayName }) => {
      const { result } = renderHook(() =>
        useDateFilter({
          query: defaultQuery,
          stageIndex,
          column,
        }),
      );

      const { getFilterClause } = result.current;
      const newFilter = getFilterClause(value);

      expect(
        Lib.displayInfo(defaultQuery, stageIndex, newFilter),
      ).toMatchObject({
        displayName,
      });
    },
  );

  it.each(testCases)(
    "should allow to update a filter: $displayName",
    ({ value, expression }) => {
      const query = Lib.filter(defaultQuery, stageIndex, expression);
      const [filter] = Lib.filters(query, stageIndex);

      const { result } = renderHook(() =>
        useDateFilter({
          query,
          stageIndex,
          column,
          filter,
        }),
      );

      expect(result.current.value).toEqual(value);
    },
  );

  it("should return available operators and units for the column", () => {
    const { result } = renderHook(() =>
      useDateFilter({
        query: defaultQuery,
        stageIndex,
        column,
      }),
    );

    const { availableOperators, availableUnits } = result.current;
    expect(availableOperators).toEqual([
      "!=",
      "=",
      "<",
      ">",
      "between",
      "is-null",
      "not-null",
    ]);
    expect(availableUnits).toEqual([
      "hour-of-day",
      "day-of-week",
      "month-of-year",
      "quarter-of-year",
    ]);
  });
});

interface TestCase {
  value: DatePickerValue;
  expression: Lib.ExpressionClause;
  displayName: string;
}

function getTestCases(
  query: Lib.Query,
  stageIndex: number,
  column: Lib.ColumnMetadata,
): TestCase[] {
  const date1 = new Date(2020, 0, 1);
  const date2 = new Date(2020, 2, 3);

  return [
    {
      value: {
        type: "specific",
        operator: "=",
        values: [date1],
      },
      expression: Lib.specificDateFilterClause(query, stageIndex, {
        operator: "=",
        column,
        values: [date1],
      }),
      displayName: "Created At is on Jan 1, 2020",
    },
    {
      value: {
        type: "specific",
        operator: "<",
        values: [date1],
      },
      expression: Lib.specificDateFilterClause(query, stageIndex, {
        operator: "<",
        column,
        values: [date1],
      }),
      displayName: "Created At is before Jan 1, 2020",
    },
    {
      value: {
        type: "specific",
        operator: ">",
        values: [date1],
      },
      expression: Lib.specificDateFilterClause(query, stageIndex, {
        operator: ">",
        column,
        values: [date1],
      }),
      displayName: "Created At is after Jan 1, 2020",
    },
    {
      value: {
        type: "specific",
        operator: "between",
        values: [date1, date2],
      },
      expression: Lib.specificDateFilterClause(query, stageIndex, {
        operator: "between",
        column,
        values: [date1, date2],
      }),
      displayName: "Created At is Jan 1 – Mar 3, 2020",
    },
    {
      value: {
        type: "relative",
        value: -10,
        unit: "month",
        offsetValue: undefined,
        offsetUnit: undefined,
        options: {},
      },
      expression: Lib.relativeDateFilterClause({
        column,
        value: -10,
        bucket: "month",
        offsetValue: null,
        offsetBucket: null,
        options: {},
      }),
      displayName: "Created At is in the previous 10 months",
    },
    {
      value: {
        type: "relative",
        value: 10,
        unit: "month",
        offsetValue: undefined,
        offsetUnit: undefined,
        options: {},
      },
      expression: Lib.relativeDateFilterClause({
        column,
        value: 10,
        bucket: "month",
        offsetValue: null,
        offsetBucket: null,
        options: {},
      }),
      displayName: "Created At is in the next 10 months",
    },
    {
      value: {
        type: "relative",
        value: -10,
        unit: "month",
        offsetValue: -2,
        offsetUnit: "year",
        options: {},
      },
      expression: Lib.relativeDateFilterClause({
        column,
        value: -10,
        bucket: "month",
        offsetValue: -2,
        offsetBucket: "year",
        options: {},
      }),
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
        options: {},
      },
      expression: Lib.relativeDateFilterClause({
        column,
        value: 10,
        bucket: "month",
        offsetValue: 2,
        offsetBucket: "year",
        options: {},
      }),
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
      expression: Lib.excludeDateFilterClause(query, stageIndex, {
        operator: "!=",
        column,
        bucket: "hour-of-day",
        values: [10],
      }),
      displayName: "Created At excludes the hour of 10 AM",
    },
    {
      value: {
        type: "exclude",
        operator: "!=",
        unit: "day-of-week",
        values: [2],
      },
      expression: Lib.excludeDateFilterClause(query, stageIndex, {
        operator: "!=",
        column,
        bucket: "day-of-week",
        values: [2],
      }),
      displayName: "Created At excludes Tuesdays",
    },
    {
      value: {
        type: "exclude",
        operator: "!=",
        unit: "month-of-year",
        values: [2],
      },
      expression: Lib.excludeDateFilterClause(query, stageIndex, {
        operator: "!=",
        column,
        bucket: "month-of-year",
        values: [2],
      }),
      displayName: "Created At excludes each Mar",
    },
    {
      value: {
        type: "exclude",
        operator: "!=",
        unit: "quarter-of-year",
        values: [2],
      },
      expression: Lib.excludeDateFilterClause(query, stageIndex, {
        operator: "!=",
        column,
        bucket: "quarter-of-year",
        values: [2],
      }),
      displayName: "Created At excludes Q2 each year",
    },
    {
      value: {
        type: "exclude",
        operator: "is-null",
        values: [],
      },
      expression: Lib.excludeDateFilterClause(query, stageIndex, {
        operator: "is-null",
        column,
        bucket: null,
        values: [],
      }),
      displayName: "Created At is empty",
    },
    {
      value: {
        type: "exclude",
        operator: "not-null",
        values: [],
      },
      expression: Lib.excludeDateFilterClause(query, stageIndex, {
        operator: "not-null",
        column,
        bucket: null,
        values: [],
      }),
      displayName: "Created At is not empty",
    },
  ];
}
