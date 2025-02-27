import dayjs from "dayjs";

import { parseTimestamp } from "metabase/lib/time-dayjs";

describe("parseTimestamp", () => {
  afterEach(() => {
    dayjs.updateLocale(dayjs.locale(), { weekStart: 0 });
  });

  it("should parse week of year correctly", () => {
    const daysOfWeek = [0, 1, 2, 3, 4, 5, 6];
    daysOfWeek.forEach(dayOfWeek => {
      dayjs.updateLocale(dayjs.locale(), { weekStart: dayOfWeek });
      expect(parseTimestamp(1, "week-of-year").isoWeek()).toBe(1);
      expect(parseTimestamp(2, "week-of-year").isoWeek()).toBe(2);
      expect(parseTimestamp(52, "week-of-year").isoWeek()).toBe(52);
      expect(parseTimestamp(53, "week-of-year").isoWeek()).toBe(53);
    });
  });
});
