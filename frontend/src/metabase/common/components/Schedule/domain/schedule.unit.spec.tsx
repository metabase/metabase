import { getDefaultsWithoutHour } from "../test-utils";

import {
  changeScheduleType,
  getScheduleDefaults,
  isScheduleComplete,
  normalizeScheduleValue,
  setScheduleField,
} from "./schedule";
import type {
  NormalizedScheduleBuilderValue,
  NormalizedScheduleValue,
  ScheduleBuilderValue,
  ScheduleValue,
} from "./types";

describe("isScheduleComplete", () => {
  it.each<NormalizedScheduleValue>([
    {
      schedule_type: "daily",
      schedule_hour: null,
      schedule_minute: 0,
      schedule_day: null,
      schedule_frame: null,
    },
    {
      schedule_type: "weekly",
      schedule_hour: null,
      schedule_minute: 0,
      schedule_day: "mon",
      schedule_frame: null,
    },
    {
      schedule_type: "monthly",
      schedule_hour: null,
      schedule_minute: 0,
      schedule_day: null,
      schedule_frame: "first",
    },
  ])(
    "should be false when a $schedule_type schedule has no hour",
    (schedule) => {
      expect(isScheduleComplete(schedule)).toBe(false);
    },
  );

  it.each<NormalizedScheduleValue>([
    {
      schedule_type: "daily",
      schedule_hour: 8,
      schedule_minute: 0,
      schedule_day: null,
      schedule_frame: null,
    },
    {
      schedule_type: "weekly",
      schedule_hour: 8,
      schedule_minute: 0,
      schedule_day: "mon",
      schedule_frame: null,
    },
    {
      schedule_type: "monthly",
      schedule_hour: 8,
      schedule_minute: 0,
      schedule_day: null,
      schedule_frame: "first",
    },
  ])("should be true for a complete $schedule_type schedule", (schedule) => {
    expect(isScheduleComplete(schedule)).toBe(true);
  });

  it("should be false when a weekly schedule has no day", () => {
    expect(
      isScheduleComplete({
        schedule_type: "weekly",
        schedule_hour: 8,
        schedule_minute: 0,
        schedule_day: null,
        schedule_frame: null,
      }),
    ).toBe(false);
  });

  it("should be false when a monthly schedule has no frame", () => {
    expect(
      isScheduleComplete({
        schedule_type: "monthly",
        schedule_hour: 8,
        schedule_minute: 0,
        schedule_day: null,
        schedule_frame: null,
      }),
    ).toBe(false);
  });

  it("should treat midnight as a picked hour", () => {
    expect(
      isScheduleComplete({
        schedule_type: "daily",
        schedule_hour: 0,
        schedule_minute: 0,
        schedule_day: null,
        schedule_frame: null,
      }),
    ).toBe(true);
  });

  it.each<NormalizedScheduleValue>([
    {
      schedule_type: "every_n_minutes",
      schedule_minute: null,
      schedule_hour: null,
      schedule_day: null,
      schedule_frame: null,
    },
    {
      schedule_type: "hourly",
      schedule_minute: null,
      schedule_hour: null,
      schedule_day: null,
      schedule_frame: null,
    },
  ])(
    "should be true for a $schedule_type schedule, which needs no hour",
    (schedule) => {
      expect(isScheduleComplete(schedule)).toBe(true);
    },
  );

  it("should be true for a raw cron expression", () => {
    expect(
      isScheduleComplete({ schedule_type: "cron", cron: "0 0 8 * * ? *" }),
    ).toBe(true);
  });
});

describe("normalizeScheduleValue", () => {
  it.each<NormalizedScheduleBuilderValue>([
    {
      schedule_type: "every_n_minutes",
      schedule_minute: 10,
      schedule_hour: null,
      schedule_day: null,
      schedule_frame: null,
    },
    {
      schedule_type: "hourly",
      schedule_minute: 0,
      schedule_hour: null,
      schedule_day: null,
      schedule_frame: null,
    },
    {
      schedule_type: "daily",
      schedule_hour: 8,
      schedule_minute: 0,
      schedule_day: null,
      schedule_frame: null,
    },
    {
      schedule_type: "weekly",
      schedule_day: "mon",
      schedule_hour: 8,
      schedule_minute: 0,
      schedule_frame: null,
    },
    {
      schedule_type: "monthly",
      schedule_frame: "first",
      schedule_day: null,
      schedule_hour: 8,
      schedule_minute: 0,
    },
  ])(
    "should build the default $schedule_type schedule from the domain table",
    (expected) => {
      expect(
        normalizeScheduleValue(
          { schedule_type: expected.schedule_type },
          getScheduleDefaults,
        ),
      ).toEqual(expected);
    },
  );

  it("should keep picked values", () => {
    expect(
      normalizeScheduleValue(
        {
          schedule_type: "weekly",
          schedule_day: "fri",
          schedule_hour: 20,
          schedule_minute: 0,
        },
        getScheduleDefaults,
      ),
    ).toEqual({
      schedule_type: "weekly",
      schedule_day: "fri",
      schedule_frame: null,
      schedule_hour: 20,
      schedule_minute: 0,
    });
  });

  it("should keep a minute the type cannot show", () => {
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
    ).toMatchObject({ schedule_minute: 15 });
  });

  it("should drop values the type does not use", () => {
    expect(
      normalizeScheduleValue(
        {
          schedule_type: "hourly",
          schedule_day: "mon",
          schedule_frame: "first",
          schedule_hour: 8,
        },
        getScheduleDefaults,
      ),
    ).toEqual({
      schedule_type: "hourly",
      schedule_day: null,
      schedule_frame: null,
      schedule_hour: null,
      schedule_minute: 0,
    });
  });

  it("should clear the day when the frame is mid", () => {
    expect(
      normalizeScheduleValue(
        {
          schedule_type: "monthly",
          schedule_frame: "mid",
          schedule_day: "mon",
          schedule_hour: 8,
        },
        getScheduleDefaults,
      ),
    ).toMatchObject({ schedule_frame: "mid", schedule_day: null });
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

  it("should keep the weekday when leaving monthly", () => {
    expect(
      changeScheduleType(
        {
          schedule_type: "monthly",
          schedule_frame: "first",
          schedule_day: "fri",
          schedule_hour: 20,
          schedule_minute: 0,
        },
        "weekly",
        getScheduleDefaults,
      ),
    ).toEqual({
      schedule_type: "weekly",
      schedule_day: "fri",
      schedule_frame: null,
      schedule_hour: 20,
      schedule_minute: 0,
    });
  });

  it("should fall back to the default weekday when the previous type had none picked", () => {
    expect(
      changeScheduleType(
        {
          schedule_type: "monthly",
          schedule_frame: "mid",
          schedule_day: null,
          schedule_hour: 20,
          schedule_minute: 0,
        },
        "weekly",
        getScheduleDefaults,
      ),
    ).toMatchObject({ schedule_type: "weekly", schedule_day: "mon" });
  });

  it("should not carry a minute past the hour into a type that hides it", () => {
    expect(
      changeScheduleType(
        { schedule_type: "hourly", schedule_minute: 15 },
        "daily",
        getScheduleDefaults,
      ),
    ).toMatchObject({ schedule_type: "daily", schedule_minute: 0 });
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

  it("should not carry a minute the previous type hid into a type that shows it", () => {
    const dailyWithMinute = { ...daily, schedule_minute: 30 };

    expect(
      changeScheduleType(
        dailyWithMinute,
        "every_n_minutes",
        getScheduleDefaults,
      ),
    ).toMatchObject({ schedule_type: "every_n_minutes", schedule_minute: 10 });

    expect(
      changeScheduleType(dailyWithMinute, "hourly", getScheduleDefaults),
    ).toMatchObject({ schedule_type: "hourly", schedule_minute: 0 });
  });

  it("should reset a minute the type hides even when the type stays the same", () => {
    expect(
      changeScheduleType(
        { ...daily, schedule_minute: 15 },
        "daily",
        getScheduleDefaults,
      ),
    ).toMatchObject({ schedule_type: "daily", schedule_minute: 0 });
  });

  it("should not carry a minute the previous type hid into a type that hides it too", () => {
    expect(
      changeScheduleType(
        { ...daily, schedule_minute: 30 },
        "weekly",
        getScheduleDefaults,
      ),
    ).toMatchObject({ schedule_type: "weekly", schedule_minute: 0 });
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

describe("setScheduleField", () => {
  const monthly: NormalizedScheduleBuilderValue = {
    schedule_type: "monthly",
    schedule_frame: "first",
    schedule_day: "mon",
    schedule_hour: 8,
    schedule_minute: 0,
  };

  it("should set the field and keep the rest", () => {
    expect(setScheduleField(monthly, "schedule_hour", 20)).toEqual({
      ...monthly,
      schedule_hour: 20,
    });
  });

  it("should reset a minute the type cannot show", () => {
    expect(
      setScheduleField(
        { ...monthly, schedule_minute: 30 },
        "schedule_hour",
        20,
      ),
    ).toMatchObject({ schedule_hour: 20, schedule_minute: 0 });
  });

  it("should clear the day when the frame becomes mid", () => {
    expect(setScheduleField(monthly, "schedule_frame", "mid")).toEqual({
      ...monthly,
      schedule_frame: "mid",
      schedule_day: null,
    });
  });

  it("should leave the day unpicked when the frame leaves mid", () => {
    const mid = setScheduleField(monthly, "schedule_frame", "mid");
    expect(setScheduleField(mid, "schedule_frame", "last")).toEqual({
      ...monthly,
      schedule_frame: "last",
      schedule_day: null,
    });
  });

  it("should not fill in a value the user cleared", () => {
    expect(setScheduleField(monthly, "schedule_day", null)).toEqual({
      ...monthly,
      schedule_day: null,
    });
  });

  it("should reject a field the type does not use", () => {
    expect(() =>
      setScheduleField(
        {
          ...monthly,
          schedule_type: "daily",
          schedule_frame: null,
          schedule_day: null,
        },
        "schedule_day",
        "mon",
      ),
    ).toThrow();
  });
});
