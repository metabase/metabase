import moment from "moment";

import {
  parseFieldBucketing,
  expandTimeIntervalFilter,
  computeFilterTimeRange,
  absolute,
  generateTimeFilterValuesDescriptions,
} from "metabase/lib/query_time";

describe("query_time", () => {
  describe("parseFieldBucketing()", () => {
    it("supports the standard DatetimeField format", () => {
      expect(
        parseFieldBucketing(["datetime-field", ["field-id", 3], "week"]),
      ).toBe("week");
      expect(
        parseFieldBucketing(["datetime-field", ["field-id", 3], "day"]),
      ).toBe("day");
    });

    it("supports the legacy DatetimeField format", () => {
      expect(
        parseFieldBucketing(["datetime-field", ["field-id", 3], "as", "week"]),
      ).toBe("week");
      expect(
        parseFieldBucketing(["datetime-field", ["field-id", 3], "day"]),
      ).toBe("day");
    });
    it("returns the default unit for FK reference", () => {
      pending();
    });
    it("returns the default unit for local field reference", () => {
      pending();
    });
    it("returns the default unit for other field types", () => {
      pending();
    });
  });

  describe("expandTimeIntervalFilter", () => {
    it('translate ["current" "month"] correctly', () => {
      expect(
        expandTimeIntervalFilter(["time-interval", 100, "current", "month"]),
      ).toEqual([
        "=",
        ["datetime-field", 100, "as", "month"],
        ["relative-datetime", "current"],
      ]);
    });
    it('translate [-30, "day"] correctly', () => {
      expect(
        expandTimeIntervalFilter(["time-interval", 100, -30, "day"]),
      ).toEqual([
        "BETWEEN",
        ["datetime-field", 100, "as", "day"],
        ["relative-datetime", -31, "day"],
        ["relative-datetime", -1, "day"],
      ]);
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
      ).toBe(
        moment()
          .subtract(1, "month")
          .format("YYYY-MM-DD HH"),
      );
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
      ).toEqual(["Past 30 Days"]);
      expect(
        generateTimeFilterValuesDescriptions([
          "time-interval",
          null,
          1,
          "month",
        ]),
      ).toEqual(["Next 1 Month"]);
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
      ).toEqual(["Past 1 Month"]);
      expect(
        generateTimeFilterValuesDescriptions([
          "time-interval",
          null,
          -2,
          "month",
        ]),
      ).toEqual(["Past 2 Months"]);
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
    it("should format legacy 'TIME_INTERVAL' correctly", () => {
      expect(
        generateTimeFilterValuesDescriptions([
          "TIME_INTERVAL",
          null,
          -30,
          "day",
        ]),
      ).toEqual(["Past 30 Days"]);
    });
  });

  describe("computeFilterTimeRange", () => {
    describe("absolute dates", () => {
      it('should handle "="', () => {
        let [start, end] = computeFilterTimeRange(["=", 1, "2009-08-07"]);
        expect(start.format("YYYY-MM-DD HH:mm:ss")).toEqual(
          "2009-08-07 00:00:00",
        );
        expect(end.format("YYYY-MM-DD HH:mm:ss")).toEqual(
          "2009-08-07 23:59:59",
        );
      });
      it('should handle "<"', () => {
        let [start, end] = computeFilterTimeRange(["<", 1, "2009-08-07"]);
        expect(start.year()).toBeLessThan(-10000);
        expect(end.format("YYYY-MM-DD HH:mm:ss")).toEqual(
          "2009-08-07 00:00:00",
        );
      });
      it('should handle ">"', () => {
        let [start, end] = computeFilterTimeRange([">", 1, "2009-08-07"]);
        expect(start.format("YYYY-MM-DD HH:mm:ss")).toEqual(
          "2009-08-07 23:59:59",
        );
        expect(end.year()).toBeGreaterThan(10000);
      });
      it('should handle "BETWEEN"', () => {
        let [start, end] = computeFilterTimeRange([
          "BETWEEN",
          1,
          "2009-08-07",
          "2009-08-09",
        ]);
        expect(start.format("YYYY-MM-DD HH:mm:ss")).toEqual(
          "2009-08-07 00:00:00",
        );
        expect(end.format("YYYY-MM-DD HH:mm:ss")).toEqual(
          "2009-08-09 23:59:59",
        );
      });
    });

    describe("relative dates", () => {
      it('should handle "="', () => {
        let [start, end] = computeFilterTimeRange([
          "=",
          1,
          ["relative-datetime", "current"],
        ]);
        expect(start.format("YYYY-MM-DD HH:mm:ss")).toEqual(
          moment().format("YYYY-MM-DD 00:00:00"),
        );
        expect(end.format("YYYY-MM-DD HH:mm:ss")).toEqual(
          moment().format("YYYY-MM-DD 23:59:59"),
        );
      });
      it('should handle "<"', () => {
        let [start, end] = computeFilterTimeRange([
          "<",
          1,
          ["relative-datetime", "current"],
        ]);
        expect(start.year()).toBeLessThan(-10000);
        expect(end.format("YYYY-MM-DD HH:mm:ss")).toEqual(
          moment().format("YYYY-MM-DD 00:00:00"),
        );
      });
      it('should handle ">"', () => {
        let [start, end] = computeFilterTimeRange([
          ">",
          1,
          ["relative-datetime", "current"],
        ]);
        expect(start.format("YYYY-MM-DD HH:mm:ss")).toEqual(
          moment().format("YYYY-MM-DD 23:59:59"),
        );
        expect(end.year()).toBeGreaterThan(10000);
      });
      it('should handle "BETWEEN"', () => {
        let [start, end] = computeFilterTimeRange([
          "BETWEEN",
          1,
          ["relative-datetime", -1, "day"],
          ["relative-datetime", 1, "day"],
        ]);
        expect(start.format("YYYY-MM-DD HH:mm:ss")).toEqual(
          moment()
            .subtract(1, "day")
            .format("YYYY-MM-DD 00:00:00"),
        );
        expect(end.format("YYYY-MM-DD HH:mm:ss")).toEqual(
          moment()
            .add(1, "day")
            .format("YYYY-MM-DD 23:59:59"),
        );
      });
    });

    describe("time-interval", () => {
      it('should handle "Past x days"', () => {
        let [start, end] = computeFilterTimeRange([
          "time-interval",
          1,
          -7,
          "day",
        ]);
        expect(start.format("YYYY-MM-DD HH:mm:ss")).toEqual(
          moment()
            .subtract(8, "day")
            .format("YYYY-MM-DD 00:00:00"),
        );
        expect(end.format("YYYY-MM-DD HH:mm:ss")).toEqual(
          moment()
            .subtract(1, "day")
            .format("YYYY-MM-DD 23:59:59"),
        );
      });
      // it ('should handle "last week"', () => {
      //     let [start, end] = computeFilterTimeRange(["time-interval", 1, "last", "week"]);
      //     expect(start.format("YYYY-MM-DD HH:mm:ss")).toEqual(moment().subtract(1, "week").startOf("week").format("YYYY-MM-DD 00:00:00"));
      //     expect(end.format("YYYY-MM-DD HH:mm:ss")).toEqual(moment().subtract(1, "week").endOf("week")..format("YYYY-MM-DD 23:59:59"));
      // });
    });
  });
});
