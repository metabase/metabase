import { dayjs } from "./index";

// A datetime string without an offset must behave as a zero-offset datetime in
// every client timezone, so date arithmetic does not drift into the day before.
describe("parse zone", () => {
  const NAIVE_DATETIME = "2019-11-05T04:00:00";

  it("keeps the time and the zone when no timezone is provided", () => {
    const parsed = dayjs.parseZone(NAIVE_DATETIME);

    expect(parsed.format("YYYY-MM-DD HH:mm:ss")).toBe("2019-11-05 04:00:00");
    expect(parsed.utcOffset()).toBe(0);
  });

  it("stays on the same calendar day when bucketing by day", () => {
    const parsed = dayjs.parseZone(NAIVE_DATETIME);

    expect(parsed.startOf("day").format("YYYY-MM-DD HH:mm:ss")).toBe(
      "2019-11-05 00:00:00",
    );
    expect(parsed.endOf("day").format("YYYY-MM-DD HH:mm:ss")).toBe(
      "2019-11-05 23:59:59",
    );
  });
});
