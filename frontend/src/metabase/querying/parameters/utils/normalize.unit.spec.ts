import type { DateFilterValue } from "metabase/querying/filters/types";
import type { ParameterValueOrArray } from "metabase-types/api";

import {
  normalizeBooleanParameterValue,
  normalizeDateParameterValue,
  normalizeNumberParameterValue,
  normalizeStringParameterValue,
} from "./normalize";

type StringParameterCase = {
  value: ParameterValueOrArray | null | undefined;
  expectedValue: string[];
};

describe("normalizeStringParameterValue", () => {
  it.each<StringParameterCase>([
    { value: null, expectedValue: [] },
    { value: undefined, expectedValue: [] },
    { value: "", expectedValue: [] },
    { value: [""], expectedValue: [] },
    { value: ["abc"], expectedValue: ["abc"] },
    { value: ["a", "b", "", "c"], expectedValue: ["a", "b", "c"] },
    { value: [1, 2, 3], expectedValue: ["1", "2", "3"] },
    { value: [true, false], expectedValue: ["true", "false"] },
  ])("should normalize string parameter value", ({ value, expectedValue }) => {
    expect(normalizeStringParameterValue(value)).toEqual(expectedValue);
  });
});

type NumberParameterCase = {
  value: ParameterValueOrArray | null | undefined;
  expectedValue: number[];
};

describe("normalizeNumberParameterValue", () => {
  it.each<NumberParameterCase>([
    { value: null, expectedValue: [] },
    { value: undefined, expectedValue: [] },
    { value: "", expectedValue: [] },
    { value: [""], expectedValue: [] },
    { value: ["abc"], expectedValue: [] },
    { value: NaN, expectedValue: [] },
    { value: [NaN], expectedValue: [] },
    { value: [true, false], expectedValue: [] },
    { value: 1, expectedValue: [1] },
    { value: "1", expectedValue: [1] },
    { value: 1.5, expectedValue: [1.5] },
    { value: "1.5", expectedValue: [1.5] },
    { value: [1, 2, 3], expectedValue: [1, 2, 3] },
    { value: ["1", "2", "3"], expectedValue: [1, 2, 3] },
  ])("should normalize number parameter value", ({ value, expectedValue }) => {
    expect(normalizeNumberParameterValue(value)).toEqual(expectedValue);
  });
});

type BooleanParameterCase = {
  value: ParameterValueOrArray | null | undefined;
  expectedValue: boolean[];
};

describe("normalizeBooleanParameterValue", () => {
  it.each<BooleanParameterCase>([
    { value: null, expectedValue: [] },
    { value: undefined, expectedValue: [] },
    { value: "", expectedValue: [] },
    { value: [""], expectedValue: [] },
    { value: ["abc"], expectedValue: [] },
    { value: 1, expectedValue: [] },
    { value: NaN, expectedValue: [] },
    { value: [NaN], expectedValue: [] },
    { value: true, expectedValue: [true] },
    { value: false, expectedValue: [false] },
    { value: [true, false], expectedValue: [true, false] },
    { value: "true", expectedValue: [true] },
    { value: "false", expectedValue: [false] },
    { value: ["true", "false"], expectedValue: [true, false] },
  ])("should normalize boolean parameter value", ({ value, expectedValue }) => {
    expect(normalizeBooleanParameterValue(value)).toEqual(expectedValue);
  });
});

type DateParameterCase = {
  value: ParameterValueOrArray | null | undefined;
  expectedValue: DateFilterValue | undefined;
};

describe("normalizeDateParameterValue", () => {
  it.each<DateParameterCase>([
    { value: null, expectedValue: undefined },
    { value: undefined, expectedValue: undefined },
    { value: "abc", expectedValue: undefined },
    { value: 10, expectedValue: undefined },
    { value: true, expectedValue: undefined },
    {
      value: "Q3-2020",
      expectedValue: { type: "quarter", year: 2020, quarter: 3 },
    },
  ])("should normalize date parameter value", ({ value, expectedValue }) => {
    expect(normalizeDateParameterValue(value)).toEqual(expectedValue);
  });
});
