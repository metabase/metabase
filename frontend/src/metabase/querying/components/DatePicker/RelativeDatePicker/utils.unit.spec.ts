import type {
  DatePickerTruncationUnit,
  RelativeDatePickerValue,
} from "../types";
import { setDirection } from "./utils";

describe("setDirection", () => {
  describe("current", () => {
    it.each<DatePickerTruncationUnit>([
      "minute",
      "hour",
      "day",
      "week",
      "month",
      "quarter",
      "year",
    ])('should fallback to "hour" for "%s" unit', unit => {
      const value: RelativeDatePickerValue = {
        type: "relative",
        value: 1,
        unit,
      };
      expect(setDirection(value, "current")).toEqual({
        type: "relative",
        value: "current",
        unit: "hour",
      });
    });
  });

  describe("last", () => {
    it("should convert a current value", () => {
      const value: RelativeDatePickerValue = {
        type: "relative",
        value: "current",
        unit: "week",
      };
      expect(setDirection(value, "last")).toEqual({
        type: "relative",
        value: -30,
        unit: "week",
      });
    });

    it("should convert an interval value", () => {
      const value: RelativeDatePickerValue = {
        type: "relative",
        value: 20,
        unit: "year",
      };
      expect(setDirection(value, "last")).toEqual({
        type: "relative",
        value: -20,
        unit: "year",
        offsetValue: undefined,
      });
    });

    it("should convert an interval value with offset", () => {
      const value: RelativeDatePickerValue = {
        type: "relative",
        value: 20,
        unit: "day",
        offsetValue: 10,
        offsetUnit: "month",
      };
      expect(setDirection(value, "last")).toEqual({
        type: "relative",
        value: -20,
        unit: "day",
        offsetValue: -10,
        offsetUnit: "month",
      });
    });
  });

  describe("next", () => {
    it("should convert a current value", () => {
      const value: RelativeDatePickerValue = {
        type: "relative",
        value: "current",
        unit: "week",
      };
      expect(setDirection(value, "next")).toEqual({
        type: "relative",
        value: 30,
        unit: "week",
      });
    });

    it("should convert an interval value", () => {
      const value: RelativeDatePickerValue = {
        type: "relative",
        value: -20,
        unit: "year",
      };
      expect(setDirection(value, "next")).toEqual({
        type: "relative",
        value: 20,
        unit: "year",
        offsetValue: undefined,
      });
    });

    it("should convert an interval value with offset", () => {
      const value: RelativeDatePickerValue = {
        type: "relative",
        value: -20,
        unit: "day",
        offsetValue: -10,
        offsetUnit: "month",
      };
      expect(setDirection(value, "next")).toEqual({
        type: "relative",
        value: 20,
        unit: "day",
        offsetValue: 10,
        offsetUnit: "month",
      });
    });
  });
});
