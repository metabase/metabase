import { AM, PM } from "./constants";
import {
  cronToBuilderValue,
  formatCron,
  hourTo24HourFormat,
  hourToTwelveHourFormat,
  scheduleValueToCron,
} from "./cron";
import type { ScheduleBuilderValue } from "./domain";

describe("formatCron", () => {
  it("converts every_n_minutes schedule to cron", () => {
    const settings: ScheduleBuilderValue = {
      schedule_type: "every_n_minutes",
      schedule_minute: 10,
      schedule_hour: null,
    };
    const cron = formatCron(settings);
    expect(cron).toEqual("0 0/10 * * * ? *");
  });

  it("converts hourly schedule to cron", () => {
    const settings: ScheduleBuilderValue = {
      schedule_type: "hourly",
      schedule_minute: 1,
      schedule_hour: 1,
    };
    const cron = formatCron(settings);
    expect(cron).toEqual("0 1 1 * * ? *");
  });

  it("converts daily schedule to cron", () => {
    const settings: ScheduleBuilderValue = {
      schedule_type: "daily",
      schedule_minute: 30,
      schedule_hour: 14,
    };
    const cron = formatCron(settings);
    expect(cron).toEqual("0 30 14 * * ? *");
  });

  it("converts weekly schedule to cron", () => {
    const settings: ScheduleBuilderValue = {
      schedule_type: "weekly",
      schedule_day: "mon",
      schedule_minute: 0,
      schedule_hour: 12,
    };
    const cron = formatCron(settings);
    expect(cron).toEqual("0 0 12 ? * 2 *");
  });

  it("converts 'first Wednesday of the month at 9:15am' to cron", () => {
    const settings: ScheduleBuilderValue = {
      schedule_type: "monthly",
      schedule_day: "wed",
      schedule_frame: "first",
      schedule_minute: 15,
      schedule_hour: 9,
    };
    const cron = formatCron(settings);
    expect(cron).toEqual("0 15 9 ? * 4#1 *");
  });

  it("converts 'last calendar day of the month' to cron", () => {
    const settings: ScheduleBuilderValue = {
      schedule_type: "monthly",
      schedule_frame: "last",
      schedule_minute: 45,
      schedule_hour: 16,
    };
    const cron = formatCron(settings);
    expect(cron).toEqual("0 45 16 L * ? *");
  });

  it("converts 'monthly on the 15th' to cron", () => {
    const settings: ScheduleBuilderValue = {
      schedule_type: "monthly",
      schedule_frame: "mid",
      schedule_minute: 5,
      schedule_hour: 23,
    };
    const cron = formatCron(settings);
    expect(cron).toEqual("0 5 23 15 * ? *");
  });

  it("missing minute and hour should default to wildcard", () => {
    const settings: ScheduleBuilderValue = {
      schedule_type: "daily",
    };
    const cron = formatCron(settings);
    expect(cron).toEqual("0 * * * * ? *");
  });
});

describe("cronToBuilderValue", () => {
  it("returns default schedule when input is null or undefined", () => {
    const defaultSchedule = {
      schedule_type: "hourly",
      schedule_minute: 0,
    };
    expect(cronToBuilderValue(null)).toEqual(defaultSchedule);
    expect(cronToBuilderValue(undefined)).toEqual(defaultSchedule);
  });

  it("returns null when month is specified in cron", () => {
    const cron = "0 15 10 15 1 ?";
    expect(cronToBuilderValue(cron)).toBeNull();
  });

  describe("schedule type determination", () => {
    it('sets schedule type to "every_n_minutes" when minute is "0/15"', () => {
      const cron = `0 0/15 * * * ?`;
      expect(cronToBuilderValue(cron)?.schedule_type).toBe("every_n_minutes");
    });

    it('sets schedule type to "hourly" when hour is "*" and both dayOfMonth and dayOfWeek are "*"', () => {
      const cron = "0 30 * * * *";
      expect(cronToBuilderValue(cron)?.schedule_type).toBe("hourly");
    });

    it('sets schedule type to "daily" when dayOfMonth and dayOfWeek are "*", and hour is specified', () => {
      const cron = "0 30 8 * * *";
      expect(cronToBuilderValue(cron)?.schedule_type).toBe("daily");
    });

    it('sets schedule type to "weekly" when dayOfWeek is specified', () => {
      const cron = "0 30 8 ? * 1";
      expect(cronToBuilderValue(cron)?.schedule_type).toBe("weekly");
    });

    it('sets schedule type to "monthly" when dayOfMonth is specific', () => {
      const cron = "0 30 8 15 * ?";
      expect(cronToBuilderValue(cron)?.schedule_type).toBe("monthly");
    });
  });

  describe("monthly schedule determination", () => {
    it('sets schedule frame to "mid" when dayOfMonth is "15"', () => {
      const cron = "0 30 8 15 * ?";
      expect(cronToBuilderValue(cron)?.schedule_frame).toBe("mid");
    });

    it('sets schedule frame to "first" when dayOfMonth is "1"', () => {
      const cron = "0 30 8 1 * ?";
      expect(cronToBuilderValue(cron)?.schedule_frame).toBe("first");
    });

    it('sets schedule frame to "last" when dayOfMonth is "L"', () => {
      const cron = "0 30 8 L * ?";
      expect(cronToBuilderValue(cron)?.schedule_frame).toBe("last");
    });
  });

  describe("weekly schedule determination", () => {
    it('sets schedule_day to "sun" when dayOfWeek is 1', () => {
      const cron = "0 30 8 ? * 1";
      expect(cronToBuilderValue(cron)?.schedule_day).toBe("sun");
    });

    it('sets schedule_day to "mon" when dayOfWeek is 2', () => {
      const cron = "0 30 8 ? * 2";
      expect(cronToBuilderValue(cron)?.schedule_day).toBe("mon");
    });

    it('sets schedule_day to "tue" when dayOfWeek is 3', () => {
      const cron = "0 30 8 ? * 3";
      expect(cronToBuilderValue(cron)?.schedule_day).toBe("tue");
    });

    it('sets schedule_day to "wed" when dayOfWeek is 4', () => {
      const cron = "0 30 8 ? * 4";
      expect(cronToBuilderValue(cron)?.schedule_day).toBe("wed");
    });

    it('sets schedule_day to "thu" when dayOfWeek is 5', () => {
      const cron = "0 30 8 ? * 5";
      expect(cronToBuilderValue(cron)?.schedule_day).toBe("thu");
    });

    it('sets schedule_day to "fri" when dayOfWeek is 6', () => {
      const cron = "0 30 8 ? * 6";
      expect(cronToBuilderValue(cron)?.schedule_day).toBe("fri");
    });

    it('sets schedule_day to "sat" when dayOfWeek is 7', () => {
      const cron = "0 30 8 ? * 7";
      expect(cronToBuilderValue(cron)?.schedule_day).toBe("sat");
    });

    it('sets schedule_day to undefined if dayOfWeek is "?"', () => {
      const cron = "0 30 8 ? * ?";
      expect(cronToBuilderValue(cron)?.schedule_day).toBeUndefined();
    });
  });

  describe("hours and minutes extraction", () => {
    it("correctly extracts the hour and minute from the cron", () => {
      const cron = "0 20 3 * * *";
      const result = cronToBuilderValue(cron);
      expect(result).toEqual(
        expect.objectContaining({
          schedule_minute: 20,
          schedule_hour: 3,
        }),
      );
    });
  });

  describe("units it cannot read", () => {
    it("leaves the hour unpicked when the cron increments it", () => {
      expect(cronToBuilderValue("0 0 */2 * * ? *")).toEqual(
        expect.objectContaining({
          schedule_type: "daily",
          schedule_minute: 0,
          schedule_hour: null,
        }),
      );
    });

    it("leaves the minute unpicked when the cron increments it without a start", () => {
      expect(cronToBuilderValue("0 */5 * * * ? *")).toEqual(
        expect.objectContaining({
          schedule_type: "hourly",
          schedule_minute: null,
          schedule_hour: null,
        }),
      );
    });
  });

  describe("every n minutes schedule determination", () => {
    it('sets schedule type to "every_n_minutes" when minute is "0/15"', () => {
      const cron = `0 0/15 * * * ?`;
      expect(cronToBuilderValue(cron)).toEqual(
        expect.objectContaining({
          schedule_type: "every_n_minutes",
          schedule_minute: 15,
          schedule_hour: null,
        }),
      );
    });
  });

  describe("specific cron strings", () => {
    it("converts 0 0 22 ? * 2L correctly", () => {
      const cron = "0 0 22 ? * 2L";
      expect(cronToBuilderValue(cron)).toEqual({
        schedule_type: "monthly",
        schedule_minute: 0,
        schedule_hour: 22,
        schedule_day: "mon",
        schedule_frame: "last",
      });
    });

    it("converts 0 0 6 ? * 6#1 correctly", () => {
      const cron = "0 0 6 ? * 6#1";
      expect(cronToBuilderValue(cron)).toEqual({
        schedule_type: "monthly",
        schedule_minute: 0,
        schedule_hour: 6,
        schedule_day: "fri",
        schedule_frame: "first",
      });
    });
  });
});

describe("hourToTwelveHourFormat", () => {
  it("converts 24-hour format to 12-hour format correctly", () => {
    expect(hourToTwelveHourFormat(0)).toBe(12);
    expect(hourToTwelveHourFormat(13)).toBe(1);
    expect(hourToTwelveHourFormat(23)).toBe(11);
    expect(hourToTwelveHourFormat(12)).toBe(12);
  });

  it("does not change hours that are already in 12-hour format", () => {
    expect(hourToTwelveHourFormat(11)).toBe(11);
    expect(hourToTwelveHourFormat(10)).toBe(10);
    expect(hourToTwelveHourFormat(1)).toBe(1);
  });
});

describe("hourTo24HourFormat", () => {
  // Test AM cases
  it("converts 12 AM to 0", () => {
    expect(hourTo24HourFormat(12, AM)).toBe(0);
  });

  it("converts 1 AM to 1", () => {
    expect(hourTo24HourFormat(1, AM)).toBe(1);
  });

  it("converts 11 AM to 11", () => {
    expect(hourTo24HourFormat(11, AM)).toBe(11);
  });

  // Test PM cases
  it("converts 12 PM to 12", () => {
    expect(hourTo24HourFormat(12, PM)).toBe(12);
  });

  it("converts 1 PM to 13", () => {
    expect(hourTo24HourFormat(1, PM)).toBe(13);
  });

  it("converts 11 PM to 23", () => {
    expect(hourTo24HourFormat(11, PM)).toBe(23);
  });

  // Edge cases
  it("converts 0 AM to 0", () => {
    expect(hourTo24HourFormat(0, AM)).toBe(0);
  });

  it("converts 0 PM to 12", () => {
    expect(hourTo24HourFormat(0, PM)).toBe(12);
  });

  it("converts NaN PM to NaN", () => {
    expect(hourTo24HourFormat(NaN, PM)).toBeNaN();
  });
});

describe("scheduleValueToCron", () => {
  it("returns a raw cron expression as is", () => {
    expect(
      scheduleValueToCron({ schedule_type: "cron", cron: "0 15 9 ? * 4#1 *" }),
    ).toBe("0 15 9 ? * 4#1 *");
  });

  it("leaves a value the user has not picked out of the expression", () => {
    expect(
      scheduleValueToCron({
        schedule_type: "daily",
        schedule_day: null,
        schedule_frame: null,
        schedule_hour: null,
        schedule_minute: 0,
      }),
    ).toBe("0 0 * * * ? *");
  });
});
