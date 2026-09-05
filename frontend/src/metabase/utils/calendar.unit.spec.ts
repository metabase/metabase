import dayjs from "dayjs";

import {
  formatDisplayDate,
  getDisplayCalendar,
  setDisplayCalendar,
} from "./calendar";

describe("display calendar", () => {
  afterEach(() => setDisplayCalendar("gregory"));

  it("keeps Gregorian formatting as the default", () => {
    expect(formatDisplayDate(dayjs("2024-03-20"), "YYYY/M/D")).toBe(
      "2024/3/20",
    );
  });

  it("formats an ISO date in the Persian calendar", () => {
    expect(formatDisplayDate(dayjs("2024-03-20"), "YYYY/M/D", "persian")).toBe(
      "1403/1/1",
    );
  });

  it("changes only the presentation setting", () => {
    setDisplayCalendar("persian");
    expect(getDisplayCalendar()).toBe("persian");
    expect(dayjs("2024-03-20").format("YYYY-MM-DD")).toBe("2024-03-20");
  });
});
