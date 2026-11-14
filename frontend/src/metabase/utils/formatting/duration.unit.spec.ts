import { formatDuration, formatDurationLong } from "./duration";

describe("formatDurationLong", () => {
  it("formats 0 and sub-second durations in ms", () => {
    expect(formatDurationLong(0)).toBe("0ms");
    expect(formatDurationLong(1)).toBe("1ms");
    expect(formatDurationLong(999)).toBe("999ms");
  });

  it("formats sub-minute durations as seconds with one decimal", () => {
    expect(formatDurationLong(1_000)).toBe("1.0s");
    expect(formatDurationLong(1_500)).toBe("1.5s");
    expect(formatDurationLong(59_900)).toBe("59.9s");
  });

  it("formats sub-hour durations as Xm Ys", () => {
    expect(formatDurationLong(60_000)).toBe("1m 0s");
    expect(formatDurationLong(90_000)).toBe("1m 30s");
    expect(formatDurationLong(522_000)).toBe("8m 42s");
    expect(formatDurationLong(3_599_000)).toBe("59m 59s");
  });

  it("promotes to the next unit when display rounding hits the boundary", () => {
    expect(formatDurationLong(59_999)).toBe("1m 0s");
    expect(formatDurationLong(59_951)).toBe("1m 0s");
    expect(formatDurationLong(59_949)).toBe("59.9s");
    expect(formatDurationLong(3_599_999)).toBe("1h 0m");
  });

  it("formats hour-plus durations as Xh Ym", () => {
    expect(formatDurationLong(3_600_000)).toBe("1h 0m");
    expect(formatDurationLong(5_400_000)).toBe("1h 30m");
    expect(formatDurationLong(7_320_000)).toBe("2h 2m");
  });

  it("does not wrap total hours past 24 for long backfills", () => {
    expect(formatDurationLong(90_000_000)).toBe("25h 0m");
  });

  it("clamps negative values to 0ms (defends against clock skew)", () => {
    expect(formatDurationLong(-1)).toBe("0ms");
    expect(formatDurationLong(-99_999)).toBe("0ms");
  });
});

describe("formatDuration", () => {
  it("formats seconds as digital clock by default", () => {
    expect(formatDuration(0)).toBe("0:00:00");
    expect(formatDuration(72)).toBe("0:01:12");
    expect(formatDuration(3723)).toBe("1:02:03");
  });

  it("keeps counting hours past one day", () => {
    expect(formatDuration(108_245)).toBe("30:04:05");
    expect(formatDuration(4_442_706)).toBe("1,234:05:06");
  });

  it("reads value in configured unit", () => {
    expect(
      formatDuration(72_000_000_000, { duration_unit: "nanosecond" }),
    ).toBe("0:01:12");
    expect(formatDuration(72_000_000, { duration_unit: "microsecond" })).toBe(
      "0:01:12",
    );
    expect(formatDuration(72_000, { duration_unit: "millisecond" })).toBe(
      "0:01:12",
    );
    expect(formatDuration(62, { duration_unit: "minute" })).toBe("1:02:00");
    expect(formatDuration(1.5, { duration_unit: "hour" })).toBe("1:30:00");
    expect(formatDuration(1, { duration_unit: "day" })).toBe("24:00:00");
    expect(formatDuration(1, { duration_unit: "week" })).toBe("168:00:00");
  });

  it("rounds to configured precision", () => {
    expect(formatDuration(3723.25, { duration_precision: "minutes" })).toBe(
      "1:02",
    );
    expect(formatDuration(3723.25, { duration_precision: "seconds" })).toBe(
      "1:02:03",
    );
    expect(
      formatDuration(3723.25, { duration_precision: "milliseconds" }),
    ).toBe("1:02:03.250");
    expect(formatDuration(59.6)).toBe("0:01:00");
  });

  it("formats narrow style with nonzero units only", () => {
    expect(formatDuration(3723, { duration_style: "narrow" })).toBe("1h 2m 3s");
    expect(formatDuration(108_245, { duration_style: "narrow" })).toBe(
      "1d 6h 4m 5s",
    );
    expect(formatDuration(3600, { duration_style: "narrow" })).toBe("1h");
    expect(
      formatDuration(3723.25, {
        duration_style: "narrow",
        duration_precision: "milliseconds",
      }),
    ).toBe("1h 2m 3s 250ms");
    expect(
      formatDuration(3723.25, {
        duration_style: "narrow",
        duration_precision: "minutes",
      }),
    ).toBe("1h 2m");
  });

  it("formats zero in smallest shown unit for narrow style", () => {
    expect(formatDuration(0, { duration_style: "narrow" })).toBe("0s");
    expect(
      formatDuration(10, {
        duration_style: "narrow",
        duration_precision: "minutes",
      }),
    ).toBe("0m");
  });

  it("prefixes negative values with minus sign", () => {
    expect(formatDuration(-72)).toBe("-0:01:12");
    expect(formatDuration(-72, { duration_style: "narrow" })).toBe("-1m 12s");
    expect(formatDuration(-0.2)).toBe("0:00:00");
  });

  it("uses configured number separators", () => {
    expect(
      formatDuration(4_442_706.5, {
        duration_precision: "milliseconds",
        number_separators: ",.",
      }),
    ).toBe("1.234:05:06,500");
    expect(
      formatDuration(4_442_706, {
        number_separators: ".",
      }),
    ).toBe("1234:05:06");
    expect(
      formatDuration(86_400_000, {
        duration_style: "narrow",
        number_separators: ", ",
      }),
    ).toBe("1 000d");
  });
});
