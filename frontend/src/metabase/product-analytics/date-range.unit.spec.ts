import type { DatePickerValue } from "metabase/querying/common/types";

import { widenDateRange } from "./date-range";

describe("widenDateRange", () => {
  it.each<[string, DatePickerValue, DatePickerValue]>([
    [
      "past days",
      { type: "relative", value: -90, unit: "day" },
      { type: "relative", value: -120, unit: "day" },
    ],
    [
      "past months, by enough whole months",
      { type: "relative", value: -3, unit: "month" },
      { type: "relative", value: -5, unit: "month" },
    ],
    [
      "the current week",
      { type: "relative", value: 0, unit: "week" },
      {
        type: "relative",
        value: -5,
        unit: "week",
        options: { includeCurrent: true },
      },
    ],
  ])("widens %s", (_name, value, expected) => {
    expect(widenDateRange(value, 30)).toEqual(expected);
  });

  it("moves the start of a specific range back", () => {
    expect(
      widenDateRange(
        {
          type: "specific",
          operator: "between",
          values: [new Date(2026, 2, 1), new Date(2026, 2, 31)],
          hasTime: false,
        },
        30,
      ),
    ).toEqual({
      type: "specific",
      operator: "between",
      values: [new Date(2026, 0, 30), new Date(2026, 2, 31)],
      hasTime: false,
    });
  });

  it("turns a single day into a range ending on it", () => {
    expect(
      widenDateRange(
        {
          type: "specific",
          operator: "=",
          values: [new Date(2026, 2, 1)],
          hasTime: false,
        },
        30,
      ),
    ).toEqual({
      type: "specific",
      operator: "between",
      values: [new Date(2026, 0, 30), new Date(2026, 2, 1)],
      hasTime: false,
    });
  });

  it("leaves ranges without a start alone", () => {
    const before: DatePickerValue = {
      type: "specific",
      operator: "<",
      values: [new Date(2026, 2, 1)],
      hasTime: false,
    };
    const next: DatePickerValue = { type: "relative", value: 7, unit: "day" };

    expect(widenDateRange(before, 30)).toBe(before);
    expect(widenDateRange(next, 30)).toBe(next);
  });
});
