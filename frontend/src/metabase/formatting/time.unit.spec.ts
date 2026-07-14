import { formatDurationLong, formatTime, formatTimeWithUnit } from "./time";

describe("time", () => {
  describe("formatTime", () => {
    const FORMAT_TIME_TESTS = [
      ["01:02:03.456+07:00", "1:02 AM"],
      ["01:02", "1:02 AM"],
      ["22:29:59.26816+01:00", "10:29 PM"],
      ["22:29:59.412459+01:00", "10:29 PM"],
      ["19:14:42.926221+01:00", "7:14 PM"],
      ["19:14:42.13202+01:00", "7:14 PM"],
      ["13:38:58.987352+01:00", "1:38 PM"],
      ["13:38:58.001001+01:00", "1:38 PM"],
      ["17:01:23+01:00", "5:01 PM"],
    ] as const;

    test.each(FORMAT_TIME_TESTS)(
      `formatTime(%p) to be %p`,
      (value, resultStr) => {
        const result = formatTime(value);
        expect(result).toBe(resultStr);
      },
    );

    it("should use options when formatting times", () => {
      const value = "20:34:56";
      const t12 = formatTime(value, "default", {});
      expect(t12).toBe("8:34 PM");
      const t24 = formatTime(value, "default", {
        time_enabled: "minutes",
        time_style: "HH:mm",
      });
      expect(t24).toBe("20:34");
    });
  });

  describe("formatTimeWithUnit", () => {
    it("should format hour-of day with default options", () => {
      expect(formatTimeWithUnit(8, "hour-of-day")).toEqual("8:00 AM");
    });

    it("should format hour-of-day with 12 hour clock", () => {
      const options = {
        time_style: "h:mm A",
      };

      expect(formatTimeWithUnit(14, "hour-of-day", options)).toEqual("2:00 PM");
    });

    it("should format hour-of-day with 24 hour clock", () => {
      const options = {
        time_style: "HH:mm",
      };

      expect(formatTimeWithUnit(14, "hour-of-day", options)).toEqual("14:00");
    });

    it("should format hour-of-day with custom precision", () => {
      const options = {
        time_style: "HH:mm",
        time_enabled: "seconds" as const,
      };

      expect(formatTimeWithUnit(14.4, "hour-of-day", options)).toEqual(
        "14:00:00",
      );
    });

    it("should format hour-of-day with a custom format", () => {
      const options = {
        time_format: "HH",
      };

      expect(formatTimeWithUnit(14.4, "hour-of-day", options)).toEqual("14");
    });
  });

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
});
