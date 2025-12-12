import dayjs from "dayjs";

import {
  parseTime,
  parseTimestamp,
  timezoneToUTCOffset,
} from "metabase/lib/time-dayjs";

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

    it("should not parse small numbers as timestamps when non-timestamp unit is provided", () => {
      // When unit="month", small numbers should return an invalid date
      // rather than being interpreted as milliseconds since epoch
      const result = parseTimestamp(1, "month");

      // Small numbers with units like "month", "quarter", "year" don't make sense
      // as timestamps, so parseTimestamp should return an invalid date
      expect(result.isValid()).toBe(false);
    });
  });

  describe("timezoneToUTCOffset", () => {
    it.each([
      ["UTC", "+00:00"],
      ["America/New_York", "-04:00"],
      ["America/Los_Angeles", "-07:00"],
      ["Europe/London", "+01:00"],
      ["Asia/Tokyo", "+09:00"],
      ["Pacific/Auckland", "+12:00"],
    ])(
      "should return the correct UTC offset for %s",
      (timezone, expectedOffset) => {
        expect(timezoneToUTCOffset(timezone)).toBe(expectedOffset);
      },
    );
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
