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
});
