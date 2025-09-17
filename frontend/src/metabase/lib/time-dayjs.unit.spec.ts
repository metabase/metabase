import dayjs from "dayjs";

import { parseTimestamp, timezoneToUTCOffset } from "metabase/lib/time-dayjs";

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
