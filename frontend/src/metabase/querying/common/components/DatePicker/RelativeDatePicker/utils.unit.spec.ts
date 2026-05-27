import type {
  DatePickerTruncationUnit,
  RelativeDatePickerValue,
  RelativeIntervalDirection,
} from "metabase/querying/common/types";

import { CURRENT_TAB, LAST_TAB, NEXT_TAB } from "./constants";
import type { Tab } from "./types";
import {
  getAvailableTabs,
  getDefaultValue,
  isOutOfBounds,
  setDirection,
} from "./utils";

describe("setDirection", () => {
  describe("current", () => {
    it.each<DatePickerTruncationUnit>([
      "minute",
      "hour",
      "day",
      "week",
      "month",
      "quarter",
      "year",
    ])('should remove the value for "%s" unit', (unit) => {
      const value: RelativeDatePickerValue = {
        type: "relative",
        value: 1,
        unit,
      };
      expect(setDirection(value, "current")).toBeUndefined();
    });
  });

  describe("past", () => {
    it("should convert a current value", () => {
      const value: RelativeDatePickerValue = {
        type: "relative",
        value: 0,
        unit: "week",
      };
      expect(setDirection(value, "past")).toEqual({
        type: "relative",
        value: -30,
        unit: "week",
      });
    });

    it("should convert an interval value", () => {
      const value: RelativeDatePickerValue = {
        type: "relative",
        value: 20,
        unit: "year",
      };
      expect(setDirection(value, "past")).toEqual({
        type: "relative",
        value: -20,
        unit: "year",
        offsetValue: undefined,
      });
    });

    it("should convert an interval value with offset", () => {
      const value: RelativeDatePickerValue = {
        type: "relative",
        value: 20,
        unit: "day",
        offsetValue: 10,
        offsetUnit: "month",
      };
      expect(setDirection(value, "past")).toEqual({
        type: "relative",
        value: -20,
        unit: "day",
        offsetValue: -10,
        offsetUnit: "month",
      });
    });
  });

  describe("future", () => {
    it("should convert a current value", () => {
      const value: RelativeDatePickerValue = {
        type: "relative",
        value: 0,
        unit: "week",
      };
      expect(setDirection(value, "future")).toEqual({
        type: "relative",
        value: 30,
        unit: "week",
      });
    });

    it("should convert an interval value", () => {
      const value: RelativeDatePickerValue = {
        type: "relative",
        value: -20,
        unit: "year",
      };
      expect(setDirection(value, "future")).toEqual({
        type: "relative",
        value: 20,
        unit: "year",
        offsetValue: undefined,
      });
    });

    it("should convert an interval value with offset", () => {
      const value: RelativeDatePickerValue = {
        type: "relative",
        value: -20,
        unit: "day",
        offsetValue: -10,
        offsetUnit: "month",
      };
      expect(setDirection(value, "future")).toEqual({
        type: "relative",
        value: 20,
        unit: "day",
        offsetValue: 10,
        offsetUnit: "month",
      });
    });
  });
});

type GetDefaultValueTestCase = {
  availableDirections: RelativeIntervalDirection[];
  expectedValue: RelativeDatePickerValue | undefined;
};

describe("getDefaultValue", () => {
  it.each<GetDefaultValueTestCase>([
    {
      availableDirections: [],
      expectedValue: { type: "relative", value: -30, unit: "day" },
    },
    {
      availableDirections: ["past", "current", "future"],
      expectedValue: { type: "relative", value: -30, unit: "day" },
    },
    {
      availableDirections: ["past", "current"],
      expectedValue: { type: "relative", value: -30, unit: "day" },
    },
    {
      availableDirections: ["current", "current"],
      expectedValue: undefined,
    },
  ])(
    "should compute the default value based on available directions",
    ({ availableDirections, expectedValue }) => {
      expect(getDefaultValue(availableDirections)).toEqual(expectedValue);
    },
  );
});

type GetAvailableTabsTestCase = {
  initialValue: RelativeDatePickerValue | undefined;
  availableDirections: RelativeIntervalDirection[];
  expectedTabs: Tab[];
};

describe("getAvailableTabs", () => {
  it.each<GetAvailableTabsTestCase>([
    {
      initialValue: undefined,
      availableDirections: [],
      expectedTabs: [LAST_TAB],
    },
    {
      initialValue: undefined,
      availableDirections: ["current", "future"],
      expectedTabs: [CURRENT_TAB, NEXT_TAB],
    },
    {
      initialValue: undefined,
      availableDirections: ["past", "current", "future"],
      expectedTabs: [LAST_TAB, CURRENT_TAB, NEXT_TAB],
    },
    {
      initialValue: { type: "relative", value: 0, unit: "day" },
      availableDirections: ["current", "future"],
      expectedTabs: [CURRENT_TAB, NEXT_TAB],
    },
    {
      initialValue: { type: "relative", value: 30, unit: "day" },
      availableDirections: ["current", "future"],
      expectedTabs: [CURRENT_TAB, NEXT_TAB],
    },
    {
      initialValue: { type: "relative", value: -30, unit: "day" },
      availableDirections: ["current", "future"],
      expectedTabs: [LAST_TAB, CURRENT_TAB, NEXT_TAB],
    },
    {
      initialValue: { type: "relative", value: -30, unit: "day" },
      availableDirections: ["past", "current"],
      expectedTabs: [LAST_TAB, CURRENT_TAB],
    },
  ])(
    "should compute the default value based on available directions",
    ({ initialValue, availableDirections, expectedTabs }) => {
      expect(getAvailableTabs(initialValue, availableDirections)).toEqual(
        expectedTabs,
      );
    },
  );
});

describe("isOutOfBounds", () => {
  const past = (days: number): RelativeDatePickerValue => ({
    type: "relative",
    value: -days,
    unit: "day",
  });
  const future = (days: number): RelativeDatePickerValue => ({
    type: "relative",
    value: days,
    unit: "day",
  });

  beforeAll(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date(2026, 0, 31));
  });

  it("is in bounds when no min or max is set", () => {
    expect(isOutOfBounds(past(365))).toBe(false);
  });

  it("is out of bounds when a past range starts before minDate", () => {
    expect(isOutOfBounds(past(365), new Date(2026, 0, 1))).toBe(true);
  });

  it("is in bounds when a past range starts on or after minDate", () => {
    expect(isOutOfBounds(past(7), new Date(2026, 0, 1))).toBe(false);
  });

  it("is out of bounds when a future range ends after maxDate", () => {
    expect(isOutOfBounds(future(365), undefined, new Date(2026, 1, 1))).toBe(
      true,
    );
  });

  it("is in bounds when a future range ends on or before maxDate", () => {
    expect(isOutOfBounds(future(7), undefined, new Date(2026, 2, 1))).toBe(
      false,
    );
  });

  it("respects offsetValue and offsetUnit when checking minDate", () => {
    expect(
      isOutOfBounds(
        { ...past(7), offsetValue: -365, offsetUnit: "day" },
        new Date(2026, 0, 1),
      ),
    ).toBe(true);
  });
});
