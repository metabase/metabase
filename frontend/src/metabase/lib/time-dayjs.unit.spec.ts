import dayjs from "dayjs";

import { parseTime, parseTimestamp } from "metabase/lib/time-dayjs";

describe("time-dayjs", () => {
  describe("parseTimestamp", () => {
    afterEach(() => {
      dayjs.updateLocale(dayjs.locale(), { weekStart: 0 });
    });

    it("should parse week of year correctly", () => {
      const daysOfWeek = [0, 1, 2, 3, 4, 5, 6];
      daysOfWeek.forEach((dayOfWeek) => {
        dayjs.updateLocale(dayjs.locale(), { weekStart: dayOfWeek });
        expect(parseTimestamp(1, "week-of-year").isoWeek()).toBe(1);
        expect(parseTimestamp(2, "week-of-year").isoWeek()).toBe(2);
        expect(parseTimestamp(52, "week-of-year").isoWeek()).toBe(52);
        expect(parseTimestamp(53, "week-of-year").isoWeek()).toBe(53);
      });
    });

    it("should correctly parse milliseconds with trailing zeros", () => {
      const timestamp = "2025-03-11T20:45:17.01-07:00";
      const parsed = parseTimestamp(timestamp);

      expect(parsed.isValid()).toBe(true);
      expect(parsed.millisecond()).toBe(10);
      expect(parsed.format("MMMM D, YYYY, h:mm:ss.SSS A")).toBe(
        "March 11, 2025, 8:45:17.010 PM",
      );
    });

    it("should handle various millisecond formats", () => {
      const testCases = [
        {
          input: "2025-03-11T20:45:17.1-07:00",
          expectedMs: 100,
          expectedFormat: "100",
        },
        {
          input: "2025-03-11T20:45:17.01-07:00",
          expectedMs: 10,
          expectedFormat: "010",
        },
        {
          input: "2025-03-11T20:45:17.001-07:00",
          expectedMs: 1,
          expectedFormat: "001",
        },
        {
          input: "2025-03-11T20:45:17.123-07:00",
          expectedMs: 123,
          expectedFormat: "123",
        },
      ];

      testCases.forEach(({ input, expectedMs, expectedFormat }) => {
        const parsed = parseTimestamp(input);
        expect(parsed.isValid()).toBe(true);
        expect(parsed.millisecond()).toBe(expectedMs);
        expect(parsed.format("SSS")).toBe(expectedFormat);
      });
    });
  });

  describe("parseTime", () => {
    const PARSE_TIME_TESTS = [
      ["01:02:03.456+07:00", "1:02 AM"],
      ["01:02", "1:02 AM"],
      ["22:29:59.26816+01:00", "10:29 PM"],
      ["22:29:59.412459+01:00", "10:29 PM"],
      ["19:14:42.926221+01:00", "7:14 PM"],
      ["19:14:42.13202+01:00", "7:14 PM"],
      ["13:38:58.987352+01:00", "1:38 PM"],
      ["13:38:58.001001+01:00", "1:38 PM"],
      ["17:01:23+01:00", "5:01 PM"],
    ];

    test.each(PARSE_TIME_TESTS)(
      `parseTime(%p) to be %p`,
      (value, resultStr) => {
        const result = parseTime(value);
        expect(result.format("h:mm A")).toBe(resultStr);
      },
    );
  });
});
