import { formatDurationLong, formatDurationShort } from "./duration";

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

describe("formatDurationShort", () => {
  it.each([
    [-5_000, "0s"],
    [45_000, "45s"],
    [12 * 60_000, "12m"],
    [3_600_000, "1h"],
    [(3 * 60 + 20) * 60_000, "3h 20m"],
    [24 * 3_600_000, "1d"],
    [(2 * 24 + 4) * 3_600_000, "2d 4h"],
    // Rounds up into the next day rather than showing "1d 24h"
    [(2 * 24 * 60 - 10) * 60_000, "2d"],
  ])("formats %d ms as %s", (durationMs, expected) => {
    expect(formatDurationShort(durationMs)).toBe(expected);
  });
});
