import type {
  DatePickerRelativeDirection,
  DatePickerTruncationUnit,
  RelativeDatePickerValue,
} from "metabase/querying/filters/types";

import { CURRENT_TAB, LAST_TAB, NEXT_TAB } from "./constants";
import type { Tab } from "./types";
import { getAvailableTabs, getDefaultValue, setDirection } from "./utils";

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

  describe("last", () => {
    it("should convert a current value", () => {
      const value: RelativeDatePickerValue = {
        type: "relative",
        value: 0,
        unit: "week",
      };
      expect(setDirection(value, "last")).toEqual({
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
      expect(setDirection(value, "last")).toEqual({
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
      expect(setDirection(value, "last")).toEqual({
        type: "relative",
        value: -20,
        unit: "day",
        offsetValue: -10,
        offsetUnit: "month",
      });
    });
  });

  describe("next", () => {
    it("should convert a current value", () => {
      const value: RelativeDatePickerValue = {
        type: "relative",
        value: 0,
        unit: "week",
      };
      expect(setDirection(value, "next")).toEqual({
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
      expect(setDirection(value, "next")).toEqual({
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
      expect(setDirection(value, "next")).toEqual({
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
  availableDirections: DatePickerRelativeDirection[];
  expectedValue: RelativeDatePickerValue | undefined;
};

describe("getDefaultValue", () => {
  it.each<GetDefaultValueTestCase>([
    {
      availableDirections: [],
      expectedValue: { type: "relative", value: -30, unit: "day" },
    },
    {
      availableDirections: ["last", "current", "next"],
      expectedValue: { type: "relative", value: -30, unit: "day" },
    },
    {
      availableDirections: ["last", "current"],
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
  availableDirections: DatePickerRelativeDirection[];
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
      availableDirections: ["current", "next"],
      expectedTabs: [CURRENT_TAB, NEXT_TAB],
    },
    {
      initialValue: undefined,
      availableDirections: ["last", "current", "next"],
      expectedTabs: [LAST_TAB, CURRENT_TAB, NEXT_TAB],
    },
    {
      initialValue: { type: "relative", value: 0, unit: "day" },
      availableDirections: ["current", "next"],
      expectedTabs: [CURRENT_TAB, NEXT_TAB],
    },
    {
      initialValue: { type: "relative", value: 30, unit: "day" },
      availableDirections: ["current", "next"],
      expectedTabs: [CURRENT_TAB, NEXT_TAB],
    },
    {
      initialValue: { type: "relative", value: -30, unit: "day" },
      availableDirections: ["current", "next"],
      expectedTabs: [LAST_TAB, CURRENT_TAB, NEXT_TAB],
    },
    {
      initialValue: { type: "relative", value: -30, unit: "day" },
      availableDirections: ["last", "current"],
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
