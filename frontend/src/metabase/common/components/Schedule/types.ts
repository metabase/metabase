import type { ScheduleSettings, ScheduleType } from "metabase-types/api";

import type { AM, PM } from "./constants";

type ScheduleProperty = keyof ScheduleSettings;
export type ScheduleChangeProp = { name: ScheduleProperty; value: unknown };

export type CronString = string;

export type AmPm = typeof AM | typeof PM;

export type ScheduleValueType = ScheduleType | "every_n_minutes" | "cron";
export type ScheduleBuilderType = Exclude<ScheduleValueType, "cron">;
export type ScheduleBuilderValue = Omit<ScheduleSettings, "schedule_type"> & {
  schedule_type: ScheduleBuilderType;
};

export type ScheduleCronValue = {
  schedule_type: "cron";
  cron: CronString;
};

export type ScheduleValue = ScheduleBuilderValue | ScheduleCronValue;

export const isScheduleCronValue = (
  value: ScheduleValue,
): value is ScheduleCronValue => value.schedule_type === "cron";

export type ScheduleChangeEvent = {
  value: ScheduleValue;
  /** Null while a required field is unpicked, rather than a cron with invented
   * values. */
  cronString: CronString | null;
};

export type UpdateSchedule = (
  field: ScheduleProperty,
  value: ScheduleSettings[typeof field],
) => void;
