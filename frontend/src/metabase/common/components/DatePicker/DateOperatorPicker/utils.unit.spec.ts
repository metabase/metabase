import type { DatePickerValue, DatePickerTruncationUnit } from "../types";
import { setOptionType } from "./utils";

const DATE = new Date();

const SPECIFIC_VALUES: DatePickerValue[] = [
  { type: "specific", operator: "=", values: [DATE] },
  { type: "specific", operator: ">", values: [DATE] },
  { type: "specific", operator: "<", values: [DATE] },
  { type: "specific", operator: "between", values: [DATE, DATE] },
];

const RELATIVE_VALUES: DatePickerValue[] = [
  { type: "relative", value: 1, unit: "hour" },
  { type: "relative", value: -1, unit: "minute" },
  { type: "relative", value: "current", unit: "day" },
];

const EXCLUDE_VALUES: DatePickerValue[] = [
  { type: "exclude", operator: "!=", values: [1], unit: "day-of-week" },
  { type: "exclude", operator: "is-null", values: [] },
  { type: "exclude", operator: "not-null", values: [] },
];

describe("setOptionType", () => {
  beforeAll(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date(2020, 0, 1));
  });

  describe("current", () => {
    it.each([...SPECIFIC_VALUES, ...EXCLUDE_VALUES])(
      'should return default value for "$operator" operator',
      value => {
        expect(setOptionType(value, "current")).toEqual({
          type: "relative",
          value: "current",
          unit: "day",
        });
      },
    );

    describe.each<DatePickerTruncationUnit>(["minute", "hour"])(
      'should use default unit for "%s" unit',
      unit => {
        it.each([-10, 10])('"%d" interval', interval => {
          const value: DatePickerValue = {
            type: "relative",
            value: interval,
            unit,
          };
          expect(setOptionType(value, "current")).toEqual({
            type: "relative",
            value: "current",
            unit: "day",
          });
        });
      },
    );

    describe.each<DatePickerTruncationUnit>([
      "day",
      "week",
      "month",
      "quarter",
      "year",
    ])('should preserve unit for "%s" unit', unit => {
      it.each([-10, 10])('"%d" interval', interval => {
        const value: DatePickerValue = {
          type: "relative",
          value: interval,
          unit,
        };
        expect(setOptionType(value, "current")).toEqual({
          type: "relative",
          value: "current",
          unit,
        });
      });
    });
  });

  describe("!=", () => {
    it.each([...SPECIFIC_VALUES, ...RELATIVE_VALUES, ...EXCLUDE_VALUES])(
      'should ignore "$operator" operator',
      value => {
        expect(setOptionType(value, "!=")).toBeUndefined();
      },
    );
  });

  describe("is-null", () => {
    it.each([...SPECIFIC_VALUES, ...RELATIVE_VALUES, ...EXCLUDE_VALUES])(
      'should return default value for "$operator" operator',
      value => {
        expect(setOptionType(value, "is-null")).toEqual({
          type: "exclude",
          operator: "is-null",
          values: [],
        });
      },
    );
  });

  describe("not-null", () => {
    it.each([...SPECIFIC_VALUES, ...RELATIVE_VALUES, ...EXCLUDE_VALUES])(
      'should return default value for "$operator" operator',
      value => {
        expect(setOptionType(value, "not-null")).toEqual({
          type: "exclude",
          operator: "not-null",
          values: [],
        });
      },
    );
  });
});
