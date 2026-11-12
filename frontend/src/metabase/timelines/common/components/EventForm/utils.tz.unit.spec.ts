import {
  getTimeInputValue,
  getTimestampWithDate,
  getTimestampWithTime,
} from "./utils";

describe("getTimestampWithDate", () => {
  it("should save the picked date at UTC midnight when the time does not matter (#24701)", () => {
    expect(
      getTimestampWithDate("2025-06-15T10:30:00.000Z", "2026-01-01", false),
    ).toBe("2026-01-01T00:00:00.000Z");
  });

  it("should keep the time of day when the time matters (#24701)", () => {
    expect(
      getTimestampWithDate("2025-06-15T23:30:00.000Z", "2026-01-01", true),
    ).toBe("2026-01-01T23:30:00.000Z");
  });
});

describe("getTimestampWithTime", () => {
  it("should save the picked time without changing the date (#24701)", () => {
    expect(
      getTimestampWithTime(
        "2026-01-01T00:00:00.000Z",
        new Date(2025, 5, 15, 23, 30),
      ),
    ).toBe("2026-01-01T23:30:00.000Z");
  });
});

describe("getTimeInputValue", () => {
  it("should show the saved time of day (#24701)", () => {
    const value = getTimeInputValue("2026-01-01T23:30:00Z");

    expect([value.getHours(), value.getMinutes()]).toEqual([23, 30]);
  });
});
