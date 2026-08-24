import type { SelectProps } from "metabase/ui";

import { getDefaultsWithoutHour } from "./test-utils";
import type { ScheduleBuilderValue, ScheduleValue } from "./types";
import {
  changeScheduleType,
  combineConsecutiveStrings,
  getLongestSelectLabel,
  getScheduleDefaults,
  isScheduleComplete,
  normalizeScheduleValue,
} from "./utils";

describe("Schedule utility functions", () => {
  describe("getLongestSelectLabel", () => {
    it("should return the longest label from an array of strings", () => {
      const data: SelectProps["data"] = [
        "short",
        "medium length",
        "the longest string in the array",
      ];
      const result = getLongestSelectLabel(data);
      expect(result).toBe("the longest string in the array");
    });

    it("should return the longest label from an array of objects", () => {
      const data: SelectProps["data"] = [
        { value: "short", label: "short" },
        { value: "medium", label: "medium length" },
        { value: "long", label: "the longest string in the array" },
      ];
      const result = getLongestSelectLabel(data);
      expect(result).toBe("the longest string in the array");
    });

    it("should return an empty string if data is empty", () => {
      const data: SelectProps["data"] = [];
      const result = getLongestSelectLabel(data);
      expect(result).toBe("");
    });

    it("should return an empty string if all objects have no labels", () => {
      const data = [{ value: "first" }, { value: "second" }];
      const result = getLongestSelectLabel(data);
      expect(result).toBe("");
    });

    it("should handle empty labels in objects", () => {
      const data: SelectProps["data"] = [
        { value: "first", label: "" },
        { value: "second", label: "valid label" },
      ];
      const result = getLongestSelectLabel(data);
      expect(result).toBe("valid label");
    });
  });
});

describe("combineConsecutiveStrings", () => {
  it("should combine consecutive strings into one", () => {
    const input = ["hello", "world", 42, "foo", "bar", null, "baz"];
    const expectedOutput = ["hello world", 42, "foo bar", null, "baz"];
    expect(combineConsecutiveStrings(input)).toEqual(expectedOutput);
  });

  it("should handle arrays without consecutive strings correctly", () => {
    const input = [42, "hello", null, undefined, "world"];
    const expectedOutput = [42, "hello", null, undefined, "world"];
    expect(combineConsecutiveStrings(input)).toEqual(expectedOutput);
  });

  it("should handle an empty array correctly", () => {
    const input: any[] = [];
    const expectedOutput: any[] = [];
    expect(combineConsecutiveStrings(input)).toEqual(expectedOutput);
  });

  it("should handle an array with only one type of element correctly", () => {
    const input = ["hello", "world", "foo", "bar"];
    const expectedOutput = ["hello world foo bar"];
    expect(combineConsecutiveStrings(input)).toEqual(expectedOutput);
  });

  it("should handle an array with no strings correctly", () => {
    const input = [42, null, undefined, true, false];
    const expectedOutput = [42, null, undefined, true, false];
    expect(combineConsecutiveStrings(input)).toEqual(expectedOutput);
  });

  it("should handle array with consecutive and non-consecutive strings correctly", () => {
    const input = ["one", "two", 3, "four", "five", 6, "seven"];
    const expectedOutput = ["one two", 3, "four five", 6, "seven"];
    expect(combineConsecutiveStrings(input)).toEqual(expectedOutput);
  });
});

describe("isScheduleComplete", () => {
  it.each(["daily", "weekly", "monthly"] as const)(
    "should be false when a %s schedule has no hour",
    (schedule_type) => {
      expect(isScheduleComplete({ schedule_type, schedule_hour: null })).toBe(
        false,
      );
    },
  );

  it.each<ScheduleBuilderValue>([
    { schedule_type: "daily", schedule_hour: 8 },
    { schedule_type: "weekly", schedule_hour: 8, schedule_day: "mon" },
    { schedule_type: "monthly", schedule_hour: 8, schedule_frame: "first" },
  ])("should be true for a complete $schedule_type schedule", (schedule) => {
    expect(isScheduleComplete(schedule)).toBe(true);
  });

  it("should be false when a weekly schedule has no day", () => {
    expect(
      isScheduleComplete({
        schedule_type: "weekly",
        schedule_hour: 8,
        schedule_day: null,
      }),
    ).toBe(false);
  });

  it("should be false when a monthly schedule has no frame", () => {
    expect(
      isScheduleComplete({
        schedule_type: "monthly",
        schedule_hour: 8,
        schedule_frame: null,
      }),
    ).toBe(false);
  });

  it("should treat midnight as a picked hour", () => {
    expect(
      isScheduleComplete({ schedule_type: "daily", schedule_hour: 0 }),
    ).toBe(true);
  });

  it.each(["every_n_minutes", "hourly"] as const)(
    "should be true for a %s schedule, which needs no hour",
    (schedule_type) => {
      expect(isScheduleComplete({ schedule_type })).toBe(true);
    },
  );

  it("should be true for a raw cron expression", () => {
    expect(
      isScheduleComplete({ schedule_type: "cron", cron: "0 0 8 * * ? *" }),
    ).toBe(true);
  });
});

describe("normalizeScheduleValue", () => {
  it("should fill in values the user has not picked", () => {
    expect(
      normalizeScheduleValue(
        { schedule_type: "daily", schedule_hour: null },
        getScheduleDefaults,
      ),
    ).toEqual({
      schedule_type: "daily",
      schedule_day: null,
      schedule_frame: null,
      schedule_hour: 8,
      schedule_minute: 0,
    });
  });

  it("should keep picked values", () => {
    expect(
      normalizeScheduleValue(
        {
          schedule_type: "weekly",
          schedule_day: "fri",
          schedule_hour: 20,
          schedule_minute: 15,
        },
        getScheduleDefaults,
      ),
    ).toEqual({
      schedule_type: "weekly",
      schedule_day: "fri",
      schedule_frame: null,
      schedule_hour: 20,
      schedule_minute: 15,
    });
  });

  it("should leave a raw cron expression untouched", () => {
    const value: ScheduleValue = {
      schedule_type: "cron",
      cron: "0 0 8 * * ? *",
    };
    expect(normalizeScheduleValue(value, getScheduleDefaults)).toEqual(value);
  });
});

describe("changeScheduleType", () => {
  const daily: ScheduleBuilderValue = {
    schedule_type: "daily",
    schedule_day: null,
    schedule_frame: null,
    schedule_hour: 20,
    schedule_minute: 0,
  };

  it("should apply the defaults of the new type", () => {
    expect(
      changeScheduleType(
        { schedule_type: "hourly" },
        "weekly",
        getScheduleDefaults,
      ),
    ).toEqual({
      schedule_type: "weekly",
      schedule_day: "mon",
      schedule_frame: null,
      schedule_hour: 8,
      schedule_minute: 0,
    });
  });

  it("should keep the time the user already picked", () => {
    expect(changeScheduleType(daily, "weekly", getScheduleDefaults)).toEqual({
      schedule_type: "weekly",
      schedule_day: "mon",
      schedule_frame: null,
      schedule_hour: 20,
      schedule_minute: 0,
    });
  });

  it("should keep the weekday the user already picked", () => {
    expect(
      changeScheduleType(
        { ...daily, schedule_type: "weekly", schedule_day: "fri" },
        "monthly",
        getScheduleDefaults,
      ),
    ).toEqual({
      schedule_type: "monthly",
      schedule_day: "fri",
      schedule_frame: "first",
      schedule_hour: 20,
      schedule_minute: 0,
    });
  });

  it("should keep the monthly frame the previous schedule was on", () => {
    expect(
      changeScheduleType(
        { ...daily, schedule_frame: "mid" },
        "monthly",
        getScheduleDefaults,
      ),
    ).toEqual({
      schedule_type: "monthly",
      schedule_day: null,
      schedule_frame: "mid",
      schedule_hour: 20,
      schedule_minute: 0,
    });
  });

  it("should not keep a weekday on a monthly schedule set to the 15th", () => {
    expect(
      changeScheduleType(
        {
          schedule_type: "monthly",
          schedule_day: "fri",
          schedule_frame: "mid",
          schedule_hour: 20,
          schedule_minute: 0,
        },
        "monthly",
        getScheduleDefaults,
      ),
    ).toMatchObject({ schedule_day: null, schedule_frame: "mid" });
  });

  it("should keep the minute the user already picked past the hour", () => {
    expect(
      changeScheduleType(
        { schedule_type: "hourly", schedule_minute: 15 },
        "daily",
        getScheduleDefaults,
      ),
    ).toMatchObject({ schedule_type: "daily", schedule_minute: 15 });
  });

  it("should not read a by-the-minute interval as a minute past the hour", () => {
    expect(
      changeScheduleType(
        { schedule_type: "every_n_minutes", schedule_minute: 30 },
        "hourly",
        getScheduleDefaults,
      ),
    ).toMatchObject({ schedule_type: "hourly", schedule_minute: 0 });

    expect(
      changeScheduleType(
        { schedule_type: "hourly", schedule_minute: 45 },
        "every_n_minutes",
        getScheduleDefaults,
      ),
    ).toMatchObject({
      schedule_type: "every_n_minutes",
      schedule_minute: 10,
    });
  });

  it("should give no hour to a type that does not need one", () => {
    expect(
      changeScheduleType(daily, "hourly", getScheduleDefaults),
    ).toMatchObject({
      schedule_type: "hourly",
      schedule_hour: null,
    });
  });

  it("should leave the hour unpicked when neither the previous schedule nor the defaults supply one", () => {
    expect(
      changeScheduleType(
        { schedule_type: "hourly" },
        "weekly",
        getDefaultsWithoutHour,
      ),
    ).toMatchObject({ schedule_type: "weekly", schedule_hour: null });
  });

  it("should keep the hour the user picked even when the defaults supply none", () => {
    expect(
      changeScheduleType(daily, "weekly", getDefaultsWithoutHour),
    ).toMatchObject({ schedule_type: "weekly", schedule_hour: 20 });
  });
});
