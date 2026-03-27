import type { DateFilterValue } from "metabase/querying/common/types";
import type { ParameterValueOrArray } from "metabase-types/api";

import {
  deserializeBooleanParameterValue,
  deserializeDateParameterValue,
  deserializeNumberParameterValue,
  deserializeStringParameterValue,
  deserializeTemporalUnitParameterValue,
  serializeDateParameterValue,
  serializeNumberParameterValue,
} from "./parsing";

describe("string parameters", () => {
  it.each([
    { value: ["abc"], expectedValue: ["abc"] },
    { value: ["a", "b", "", "c"], expectedValue: ["a", "b", "c"] },
    { value: [1, 2, 3], expectedValue: ["1", "2", "3"] },
    { value: [true, false], expectedValue: ["true", "false"] },
  ])("should deserialize $value", ({ value, expectedValue }) => {
    expect(deserializeStringParameterValue(value)).toEqual(expectedValue);
  });

  it.each([null, undefined, "", [""]])(
    "should ignore invalid value %s",
    (value) => {
      expect(deserializeStringParameterValue(value)).toEqual([]);
    },
  );
});

describe("number parameters", () => {
  it.each([
    { value: [0], expectedValue: [0] },
    { value: [1], expectedValue: [1] },
    { value: [-1], expectedValue: [-1] },
    { value: [10.1], expectedValue: [10.1] },
    { value: [-10.1], expectedValue: [-10.1] },
    { value: [10, 9007199254740993n], expectedValue: [10, "9007199254740993"] },
    { value: [10, 20], expectedValue: [10, 20] },
    { value: [10, null], expectedValue: [10, null] },
    { value: [null, 20], expectedValue: [null, 20] },
  ])("should serialize $value", ({ value, expectedValue }) => {
    expect(serializeNumberParameterValue(value)).toEqual(expectedValue);
  });

  describe.each(["number/=", "number/!=", "number/>=", "number/<="])(
    "%s",
    (type) => {
      it.each([
        { value: 1, expectedValue: [1] },
        { value: "1", expectedValue: [1] },
        { value: 1.5, expectedValue: [1.5] },
        { value: "1.5", expectedValue: [1.5] },
        {
          value: ["9007199254740993"],
          expectedValue: [9007199254740993n],
        },
      ])("should deserialize $value", ({ value, expectedValue }) => {
        expect(deserializeNumberParameterValue(type, value)).toEqual(
          expectedValue,
        );
      });
    },
  );

  describe.each(["number/=", "number/!="])("%s", (type) => {
    it.each([
      { value: [1, 2, 3], expectedValue: [1, 2, 3] },
      { value: ["1", "2", "3"], expectedValue: [1, 2, 3] },
      {
        value: ["9007199254740993", "9007199254740995"],
        expectedValue: [9007199254740993n, 9007199254740995n],
      },
      {
        value: [10, "9007199254740993"],
        expectedValue: [10, 9007199254740993n],
      },
    ])("should deserialize $value", ({ value, expectedValue }) => {
      expect(deserializeNumberParameterValue(type, value)).toEqual(
        expectedValue,
      );
    });
  });

  describe.each(["number/between"])("%s", (type) => {
    it.each([
      {
        value: [10, "9007199254740993"],
        expectedValue: [10, 9007199254740993n],
      },
      {
        value: ["9007199254740993", "9007199254740995"],
        expectedValue: [9007199254740993n, 9007199254740995n],
      },
      { value: [10, 20], expectedValue: [10, 20] },
      { value: [10, null], expectedValue: [10, null] },
      {
        value: ["9007199254740993", null],
        expectedValue: [9007199254740993n, null],
      },
      { value: [null, 20], expectedValue: [null, 20] },
      {
        value: [null, "9007199254740993"],
        expectedValue: [null, 9007199254740993n],
      },
    ])("should deserialize $value", ({ value, expectedValue }) => {
      expect(deserializeNumberParameterValue(type, value)).toEqual(
        expectedValue,
      );
    });
  });

  describe.each(["number/=", "number/!=", "number/>=", "number/<="])(
    "%s",
    (type) => {
      it.each([
        null,
        undefined,
        "",
        [""],
        ["abc"],
        NaN,
        [NaN],
        [true, false],
        [null, null],
      ])("should ignore invalid value %s", (value) => {
        expect(deserializeNumberParameterValue(type, value)).toEqual([]);
      });
    },
  );
});

describe("boolean parameters", () => {
  it.each([
    { value: true, expectedValue: [true] },
    { value: false, expectedValue: [false] },
    { value: [true, false], expectedValue: [true, false] },
    { value: "true", expectedValue: [true] },
    { value: "false", expectedValue: [false] },
    { value: ["true", "false"], expectedValue: [true, false] },
  ])("should deserialize $value", ({ value, expectedValue }) => {
    expect(deserializeBooleanParameterValue(value)).toEqual(expectedValue);
  });

  it.each([null, undefined, "", [""], ["abc"], 1, NaN, [NaN]])(
    "should ignore invalid value %s",
    (value) => {
      expect(deserializeBooleanParameterValue(value)).toEqual([]);
    },
  );
});

type DateParameterCase = {
  value: ParameterValueOrArray;
  expectedValue: DateFilterValue;
};

describe("date parameters", () => {
  it.each<DateParameterCase>([
    {
      value: "2020-01-02",
      expectedValue: {
        type: "specific",
        operator: "=",
        values: [new Date(2020, 0, 2)],
        hasTime: false,
      },
    },
    {
      value: "2020-01-02T00:00:00",
      expectedValue: {
        type: "specific",
        operator: "=",
        values: [new Date(2020, 0, 2)],
        hasTime: true,
      },
    },
    {
      value: "2020-01-02T10:20:00",
      expectedValue: {
        type: "specific",
        operator: "=",
        values: [new Date(2020, 0, 2, 10, 20)],
        hasTime: true,
      },
    },
    {
      value: "~2020-12-31",
      expectedValue: {
        type: "specific",
        operator: "<",
        values: [new Date(2020, 11, 31)],
        hasTime: false,
      },
    },
    {
      value: "~2020-12-31T10:20:00",
      expectedValue: {
        type: "specific",
        operator: "<",
        values: [new Date(2020, 11, 31, 10, 20)],
        hasTime: true,
      },
    },
    {
      value: "2020-01-01~",
      expectedValue: {
        type: "specific",
        operator: ">",
        values: [new Date(2020, 0, 1)],
        hasTime: false,
      },
    },
    {
      value: "2020-01-01T10:20:00~",
      expectedValue: {
        type: "specific",
        operator: ">",
        values: [new Date(2020, 0, 1, 10, 20)],
        hasTime: true,
      },
    },
    {
      value: "2020-01-01~2021-12-31",
      expectedValue: {
        type: "specific",
        operator: "between",
        values: [new Date(2020, 0, 1), new Date(2021, 11, 31)],
        hasTime: false,
      },
    },
    {
      value: "2020-01-01T05:08:00~2021-12-31T10:20:00",
      expectedValue: {
        type: "specific",
        operator: "between",
        values: [new Date(2020, 0, 1, 5, 8), new Date(2021, 11, 31, 10, 20)],
        hasTime: true,
      },
    },
    {
      value: "thisday",
      expectedValue: {
        type: "relative",
        value: 0,
        unit: "day",
      },
    },
    {
      value: "thisyear",
      expectedValue: {
        type: "relative",
        value: 0,
        unit: "year",
      },
    },
    {
      value: "past1days",
      expectedValue: {
        type: "relative",
        value: -1,
        unit: "day",
      },
    },
    {
      value: "past10months",
      expectedValue: {
        type: "relative",
        value: -10,
        unit: "month",
      },
    },
    {
      value: "past2years~",
      expectedValue: {
        type: "relative",
        value: -2,
        unit: "year",
        options: { includeCurrent: true },
      },
    },
    {
      value: "next1hours",
      expectedValue: {
        type: "relative",
        value: 1,
        unit: "hour",
      },
    },
    {
      value: "next10quarters",
      expectedValue: {
        type: "relative",
        value: 10,
        unit: "quarter",
      },
    },
    {
      value: "next2years~",
      expectedValue: {
        type: "relative",
        value: 2,
        unit: "year",
        options: { includeCurrent: true },
      },
    },
    {
      value: "past10days-from-2months",
      expectedValue: {
        type: "relative",
        value: -10,
        unit: "day",
        offsetValue: -2,
        offsetUnit: "month",
      },
    },
    {
      value: "next3months-from-4quarters",
      expectedValue: {
        type: "relative",
        value: 3,
        unit: "month",
        offsetValue: 4,
        offsetUnit: "quarter",
      },
    },
    {
      value: "exclude-hours-0",
      expectedValue: {
        type: "exclude",
        operator: "!=",
        unit: "hour-of-day",
        values: [0],
      },
    },
    {
      value: "exclude-hours-1-2-23",
      expectedValue: {
        type: "exclude",
        operator: "!=",
        unit: "hour-of-day",
        values: [1, 2, 23],
      },
    },
    {
      value: "exclude-days-Wed",
      expectedValue: {
        type: "exclude",
        operator: "!=",
        unit: "day-of-week",
        values: [3],
      },
    },
    {
      value: "exclude-days-Mon-Tue-Wed-Thu-Fri-Sat-Sun",
      expectedValue: {
        type: "exclude",
        operator: "!=",
        unit: "day-of-week",
        values: [1, 2, 3, 4, 5, 6, 7],
      },
    },
    {
      value: "exclude-months-Mar",
      expectedValue: {
        type: "exclude",
        operator: "!=",
        unit: "month-of-year",
        values: [3],
      },
    },
    {
      value: "exclude-months-Jan-Feb-Mar-Apr-May-Jun-Jul-Aug-Sep-Oct-Nov-Dec",
      expectedValue: {
        type: "exclude",
        operator: "!=",
        unit: "month-of-year",
        values: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
      },
    },
    {
      value: "exclude-quarters-1",
      expectedValue: {
        type: "exclude",
        operator: "!=",
        unit: "quarter-of-year",
        values: [1],
      },
    },
    {
      value: "exclude-quarters-1-2-3-4",
      expectedValue: {
        type: "exclude",
        operator: "!=",
        unit: "quarter-of-year",
        values: [1, 2, 3, 4],
      },
    },
    {
      value: "2020-01",
      expectedValue: {
        type: "month",
        year: 2020,
        month: 1,
      },
    },
    {
      value: "2024-12",
      expectedValue: {
        type: "month",
        year: 2024,
        month: 12,
      },
    },
    {
      value: "Q1-2020",
      expectedValue: {
        type: "quarter",
        year: 2020,
        quarter: 1,
      },
    },
    {
      value: "Q4-2020",
      expectedValue: {
        type: "quarter",
        year: 2020,
        quarter: 4,
      },
    },
  ])("should serialize and deserialize $value", ({ value, expectedValue }) => {
    expect(serializeDateParameterValue(expectedValue)).toEqual(value);
    expect(deserializeDateParameterValue(value)).toEqual(expectedValue);
  });

  it.each([
    null,
    undefined,
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
    "Q5-2020",
  ])("should ignore invalid value %s", (value) => {
    expect(deserializeDateParameterValue(value)).toBeNull();
  });
});

describe("temporal unit parameters", () => {
  it.each([
    { value: "day", expectedValue: "day" },
    { value: "year", expectedValue: "year" },
    { value: "day-of-year", expectedValue: "day-of-year" },
  ])("should deserialize $value", ({ value, expectedValue }) => {
    expect(deserializeTemporalUnitParameterValue(value)).toEqual(expectedValue);
  });

  it.each([null, undefined, "", [""], ["abc"], ["year"], 1, NaN, [NaN]])(
    "should ignore invalid value %s",
    (value) => {
      expect(deserializeTemporalUnitParameterValue(value)).toEqual(null);
    },
  );
});
