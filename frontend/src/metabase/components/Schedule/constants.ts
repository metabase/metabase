import { ScheduleDefaults } from "./types";

export const defaultDay = "mon";
export const defaultHour = 8;

export const defaults: ScheduleDefaults = {
  hourly: {
    schedule_day: null,
    schedule_frame: null,
    schedule_hour: null,
    schedule_minute: 0,
  },
  daily: {
    schedule_day: null,
    schedule_frame: null,
    schedule_hour: defaultHour,
    schedule_minute: 0,
  },
  weekly: {
    schedule_day: defaultDay,
    schedule_frame: null,
    schedule_hour: defaultHour,
    schedule_minute: 0,
  },
  monthly: {
    schedule_day: defaultDay,
    schedule_frame: "first",
    schedule_hour: defaultHour,
    schedule_minute: 0,
  },
};
