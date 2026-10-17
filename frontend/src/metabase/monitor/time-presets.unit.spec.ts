import {
  getTimePresetCutoff,
  getTimePresetOptions,
  parseTimePreset,
  toTimePreset,
} from "./time-presets";

describe("parseTimePreset", () => {
  it("reads a preset from the URL", () => {
    expect(parseTimePreset("week")).toBe("week");
    expect(parseTimePreset(["day", "month"])).toBe("day");
  });

  it("drops a missing or unknown preset", () => {
    expect(parseTimePreset(undefined)).toBeNull();
    expect(parseTimePreset("fortnight")).toBeNull();
  });
});

describe("toTimePreset", () => {
  it("keeps a preset and drops anything else", () => {
    expect(toTimePreset("hour")).toBe("hour");
    expect(toTimePreset("decade")).toBeNull();
    expect(toTimePreset(null)).toBeNull();
  });
});

describe("getTimePresetCutoff", () => {
  beforeEach(() => {
    // mid-January: no daylight-saving change in the month before, in either hemisphere
    jest.useFakeTimers().setSystemTime(new Date("2026-01-15T12:00:00Z"));
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("opens the window one preset's length before now", () => {
    expect(getTimePresetCutoff("hour")).toBe("2026-01-15T11:00:00.000Z");
    expect(getTimePresetCutoff("day")).toBe("2026-01-14T12:00:00.000Z");
    expect(getTimePresetCutoff("week")).toBe("2026-01-08T12:00:00.000Z");
    expect(getTimePresetCutoff("month")).toBe("2025-12-15T12:00:00.000Z");
  });

  it("has no cutoff without a preset", () => {
    expect(getTimePresetCutoff(null)).toBeUndefined();
  });
});

describe("getTimePresetOptions", () => {
  it("offers every preset, shortest first", () => {
    expect(getTimePresetOptions()).toEqual([
      { value: "hour", label: "Past hour" },
      { value: "day", label: "Past day" },
      { value: "week", label: "Past week" },
      { value: "month", label: "Past month" },
    ]);
  });
});
