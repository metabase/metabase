import type { DateFilterValue } from "metabase/querying/filters/types";

import { deserializeDateFilter, serializeDateFilter } from "./dates";

type TestCase = {
  text: string;
  value: DateFilterValue;
};

describe("serializeDateFilter", () => {
  it.each<TestCase>([
    {
      text: "2020-01-02",
      value: {
        type: "specific",
        operator: "=",
        values: [new Date(2020, 0, 2)],
        hasTime: false,
      },
    },
    {
      text: "2020-01-02T00:00:00",
      value: {
        type: "specific",
        operator: "=",
        values: [new Date(2020, 0, 2)],
        hasTime: true,
      },
    },
    {
      text: "2020-01-02T10:20:00",
      value: {
        type: "specific",
        operator: "=",
        values: [new Date(2020, 0, 2, 10, 20)],
        hasTime: true,
      },
    },
    {
      text: "~2020-12-31",
      value: {
        type: "specific",
        operator: "<",
        values: [new Date(2020, 11, 31)],
        hasTime: false,
      },
    },
    {
      text: "~2020-12-31T10:20:00",
      value: {
        type: "specific",
        operator: "<",
        values: [new Date(2020, 11, 31, 10, 20)],
        hasTime: true,
      },
    },
    {
      text: "2020-01-01~",
      value: {
        type: "specific",
        operator: ">",
        values: [new Date(2020, 0, 1)],
        hasTime: false,
      },
    },
    {
      text: "2020-01-01T10:20:00~",
      value: {
        type: "specific",
        operator: ">",
        values: [new Date(2020, 0, 1, 10, 20)],
        hasTime: true,
      },
    },
    {
      text: "2020-01-01~2021-12-31",
      value: {
        type: "specific",
        operator: "between",
        values: [new Date(2020, 0, 1), new Date(2021, 11, 31)],
        hasTime: false,
      },
    },
    {
      text: "2020-01-01T05:08:00~2021-12-31T10:20:00",
      value: {
        type: "specific",
        operator: "between",
        values: [new Date(2020, 0, 1, 5, 8), new Date(2021, 11, 31, 10, 20)],
        hasTime: true,
      },
    },
    {
      text: "thisday",
      value: {
        type: "relative",
        value: "current",
        unit: "day",
      },
    },
    {
      text: "thisyear",
      value: {
        type: "relative",
        value: "current",
        unit: "year",
      },
    },
    {
      text: "past1days",
      value: {
        type: "relative",
        value: -1,
        unit: "day",
      },
    },
    {
      text: "past10months",
      value: {
        type: "relative",
        value: -10,
        unit: "month",
      },
    },
    {
      text: "past2years~",
      value: {
        type: "relative",
        value: -2,
        unit: "year",
        options: { includeCurrent: true },
      },
    },
    {
      text: "next1hours",
      value: {
        type: "relative",
        value: 1,
        unit: "hour",
      },
    },
    {
      text: "next10quarters",
      value: {
        type: "relative",
        value: 10,
        unit: "quarter",
      },
    },
    {
      text: "next2years~",
      value: {
        type: "relative",
        value: 2,
        unit: "year",
        options: { includeCurrent: true },
      },
    },
    {
      text: "past10days-from-2months",
      value: {
        type: "relative",
        value: -10,
        unit: "day",
        offsetValue: -2,
        offsetUnit: "month",
      },
    },
    {
      text: "next3months-from-4quarters",
      value: {
        type: "relative",
        value: 3,
        unit: "month",
        offsetValue: 4,
        offsetUnit: "quarter",
      },
    },
    {
      text: "exclude-hours-0",
      value: {
        type: "exclude",
        operator: "!=",
        unit: "hour-of-day",
        values: [0],
      },
    },
    {
      text: "exclude-hours-1-2-23",
      value: {
        type: "exclude",
        operator: "!=",
        unit: "hour-of-day",
        values: [1, 2, 23],
      },
    },
    {
      text: "exclude-days-Wed",
      value: {
        type: "exclude",
        operator: "!=",
        unit: "day-of-week",
        values: [3],
      },
    },
    {
      text: "exclude-days-Mon-Tue-Wed-Thu-Fri-Sat-Sun",
      value: {
        type: "exclude",
        operator: "!=",
        unit: "day-of-week",
        values: [1, 2, 3, 4, 5, 6, 7],
      },
    },
    {
      text: "exclude-months-Mar",
      value: {
        type: "exclude",
        operator: "!=",
        unit: "month-of-year",
        values: [3],
      },
    },
    {
      text: "exclude-months-Jan-Feb-Mar-Apr-May-Jun-Jul-Aug-Sep-Oct-Nov-Dec",
      value: {
        type: "exclude",
        operator: "!=",
        unit: "month-of-year",
        values: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
      },
    },
    {
      text: "exclude-quarters-1",
      value: {
        type: "exclude",
        operator: "!=",
        unit: "quarter-of-year",
        values: [1],
      },
    },
    {
      text: "exclude-quarters-1-2-3-4",
      value: {
        type: "exclude",
        operator: "!=",
        unit: "quarter-of-year",
        values: [1, 2, 3, 4],
      },
    },
    {
      text: "2020-01",
      value: {
        type: "month",
        year: 2020,
        month: 1,
      },
    },
    {
      text: "2024-12",
      value: {
        type: "month",
        year: 2024,
        month: 12,
      },
    },
  ])("should serialize and deserialize $text", ({ text, value }) => {
    expect(serializeDateFilter(value)).toEqual(text);
    expect(deserializeDateFilter(text)).toEqual(value);
  });

  it.each<string>([
    "",
    "aaa",
    "2020-12-aa",
    "2020-12-aa~",
    "~2020-12-aa",
    "2020-12-10~2020-12-aa",
    "2020-12-aa~2020-12-20",
    "past10abcs",
    "next10abcs",
    "past2days-from-10abcs",
    "next2days-from-10abcs",
    "exclude-seconds-20",
    "exclude-hours-24",
    "exclude-hours-abc",
    "exclude-days-abc",
    "exclude-months-abc",
    "exclude-quarters-5",
    "exclude-quarters-abc",
    "2024-ab",
  ])("should ignore invalid input %s", text => {
    expect(deserializeDateFilter(text)).toBeUndefined();
  });
});
