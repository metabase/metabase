import moment from "moment-timezone"; // eslint-disable-line no-restricted-imports -- deprecated usage

import {
  absolute,
  generateTimeFilterValuesDescriptions,
  parseFieldBucketing,
} from "metabase-lib/v1/queries/utils/query-time";

describe("query_time", () => {
  describe("parseFieldBucketing()", () => {
    it("supports the standard DatetimeField format", () => {
      expect(
        parseFieldBucketing(["field", 3, { "temporal-unit": "week" }]),
      ).toBe("week");
      expect(
        parseFieldBucketing(["field", 3, { "temporal-unit": "day" }]),
      ).toBe("day");
    });
  });

  describe("absolute", () => {
    it("should pass through absolute dates", () => {
      expect(
        absolute("2009-08-07T06:05:04Z").format("YYYY-MM-DD HH:mm:ss"),
      ).toBe(moment("2009-08-07 06:05:04Z").format("YYYY-MM-DD HH:mm:ss"));
    });

    it('should convert relative-datetime "current"', () => {
      expect(
        absolute(["relative-datetime", "current"]).format("YYYY-MM-DD HH"),
      ).toBe(moment().format("YYYY-MM-DD HH"));
    });

    it('should convert relative-datetime -1 "month"', () => {
      expect(
        absolute(["relative-datetime", -1, "month"]).format("YYYY-MM-DD HH"),
      ).toBe(moment().subtract(1, "month").format("YYYY-MM-DD HH"));
    });
  });

  describe("generateTimeFilterValuesDescriptions", () => {
    it("should format simple operator values correctly", () => {
      expect(
        generateTimeFilterValuesDescriptions(["<", null, "2016-01-01"]),
      ).toEqual(["January 1, 2016"]);
    });

    it("should format 'time-interval' correctly", () => {
      expect(
        generateTimeFilterValuesDescriptions([
          "time-interval",
          null,
          -30,
          "day",
        ]),
      ).toEqual(["Previous 30 Days"]);
      expect(
        generateTimeFilterValuesDescriptions([
          "time-interval",
          null,
          1,
          "month",
        ]),
      ).toEqual(["Next Month"]);
      expect(
        generateTimeFilterValuesDescriptions([
          "time-interval",
          null,
          2,
          "month",
        ]),
      ).toEqual(["Next 2 Months"]);
      expect(
        generateTimeFilterValuesDescriptions([
          "time-interval",
          null,
          0,
          "month",
        ]),
      ).toEqual(["This Month"]);
      expect(
        generateTimeFilterValuesDescriptions([
          "time-interval",
          null,
          -1,
          "month",
        ]),
      ).toEqual(["Previous Month"]);
      expect(
        generateTimeFilterValuesDescriptions([
          "time-interval",
          null,
          -2,
          "month",
        ]),
      ).toEqual(["Previous 2 Months"]);
    });

    it("should format 'time-interval' short names correctly", () => {
      expect(
        generateTimeFilterValuesDescriptions([
          "time-interval",
          null,
          -1,
          "day",
        ]),
      ).toEqual(["Yesterday"]);
      expect(
        generateTimeFilterValuesDescriptions(["time-interval", null, 0, "day"]),
      ).toEqual(["Today"]);
      expect(
        generateTimeFilterValuesDescriptions([
          "time-interval",
          null,
          "current",
          "day",
        ]),
      ).toEqual(["Today"]);
      expect(
        generateTimeFilterValuesDescriptions(["time-interval", null, 1, "day"]),
      ).toEqual(["Tomorrow"]);
    });
  });
});
