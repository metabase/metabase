import type { DateFilterValue } from "metabase/querying/filters/types";
import * as Lib from "metabase-lib";
import { columnFinder, createQuery } from "metabase-lib/test-helpers";

import { getDateFilterClause, getDateFilterTitle } from "./dates";

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
      value: {
        type: "specific",
        operator: "=",
        values: [new Date(2024, 1, 2)],
        hasTime: false,
      },
      displayName: "Created At is on Feb 2, 2024",
    },
    {
      value: {
        type: "specific",
        operator: "=",
        values: [new Date(2024, 1, 2)],
        hasTime: true,
      },
      displayName: "Created At is Feb 2, 2024, 12:00 AM",
    },
    {
      value: {
        type: "specific",
        operator: ">",
        values: [new Date(2024, 1, 2)],
        hasTime: false,
      },
      displayName: "Created At is after Feb 2, 2024",
    },
    {
      value: {
        type: "specific",
        operator: "<",
        values: [new Date(2024, 1, 2)],
        hasTime: false,
      },
      displayName: "Created At is before Feb 2, 2024",
    },
    {
      value: {
        type: "specific",
        operator: "between",
        values: [new Date(2024, 1, 2), new Date(2024, 11, 20)],
        hasTime: false,
      },
      displayName: "Created At is Feb 2 – Dec 20, 2024",
    },
    {
      value: { type: "relative", value: "current", unit: "day" },
      displayName: "Created At is today",
    },
    {
      value: { type: "relative", value: -2, unit: "year" },
      displayName: "Created At is in the previous 2 years",
    },
    {
      value: {
        type: "relative",
        value: -2,
        unit: "year",
        offsetValue: -1,
        offsetUnit: "year",
      },
      displayName: "Created At is in the previous 2 years, starting 1 year ago",
    },
    {
      value: { type: "relative", value: 4, unit: "month" },
      displayName: "Created At is in the next 4 months",
    },
    {
      value: {
        type: "relative",
        value: 4,
        unit: "month",
        offsetValue: 2,
        offsetUnit: "quarter",
      },
      displayName:
        "Created At is in the next 4 months, starting 2 quarters from now",
    },
    {
      value: { type: "exclude", operator: "is-null", values: [] },
      displayName: "Created At is empty",
    },
    {
      value: { type: "exclude", operator: "not-null", values: [] },
      displayName: "Created At is not empty",
    },
    {
      value: {
        type: "exclude",
        operator: "!=",
        values: [23],
        unit: "hour-of-day",
      },
      displayName: "Created At excludes the hour of 11 PM",
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

type DateFilterTitleCase = {
  value: DateFilterValue;
  title: string;
};

describe("getDateFilterTitle", () => {
  it.each<DateFilterTitleCase>([
    {
      value: { type: "relative", value: "current", unit: "day" },
      title: "Today",
    },
    {
      value: { type: "relative", value: "current", unit: "year" },
      title: "This Year",
    },
    {
      value: { type: "relative", value: -1, unit: "day" },
      title: "Yesterday",
    },
    {
      value: { type: "relative", value: -1, unit: "year" },
      title: "Previous Year",
    },
  ])(
    "should generate a title for a relative date filter",
    ({ value, title }) => {
      expect(getDateFilterTitle(value)).toEqual(title);
    },
  );
});
