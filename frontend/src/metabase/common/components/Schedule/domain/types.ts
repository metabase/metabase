import type {
  ScheduleDayType,
  ScheduleFrameType,
  ScheduleSettings,
  ScheduleType,
} from "metabase-types/api";

export type CronString = string;

export type ScheduleValueType = ScheduleType | "every_n_minutes" | "cron";
export type ScheduleBuilderType = Exclude<ScheduleValueType, "cron">;
export type ScheduleFields = Omit<ScheduleSettings, "schedule_type">;
export type ScheduleBuilderValue = ScheduleFields & {
  schedule_type: ScheduleBuilderType;
};

export type ScheduleCronValue = {
  schedule_type: "cron";
  cron: CronString;
};

export type ScheduleValue = ScheduleBuilderValue | ScheduleCronValue;

export type ScheduleField = keyof ScheduleFields;

type NormalizedEveryNMinutesSchedule = {
  schedule_type: "every_n_minutes";
  schedule_minute: number | null;
  schedule_hour: null;
  schedule_day: null;
  schedule_frame: null;
};

type NormalizedHourlySchedule = {
  schedule_type: "hourly";
  schedule_minute: number | null;
  schedule_hour: null;
  schedule_day: null;
  schedule_frame: null;
};

type NormalizedDailySchedule = {
  schedule_type: "daily";
  schedule_hour: number | null;
  schedule_minute: number;
  schedule_day: null;
  schedule_frame: null;
};

type NormalizedWeeklySchedule = {
  schedule_type: "weekly";
  schedule_day: ScheduleDayType | null;
  schedule_hour: number | null;
  schedule_minute: number;
  schedule_frame: null;
};

type NormalizedMonthlySchedule = {
  schedule_type: "monthly";
  schedule_frame: ScheduleFrameType | null;
  schedule_day: ScheduleDayType | null;
  schedule_hour: number | null;
  schedule_minute: number;
};

export type NormalizedScheduleBuilderValue =
  | NormalizedEveryNMinutesSchedule
  | NormalizedHourlySchedule
  | NormalizedDailySchedule
  | NormalizedWeeklySchedule
  | NormalizedMonthlySchedule;

export type NormalizedScheduleValue =
  | NormalizedScheduleBuilderValue
  | ScheduleCronValue;

export type ScheduleDefaults = Partial<ScheduleFields>;

export type GetScheduleDefaults = (
  scheduleType: ScheduleBuilderType,
) => ScheduleDefaults;

type ScheduleUnit = "interval" | "minute" | "hour" | "weekday" | "frame";

type ScheduleVariable = { unit: ScheduleUnit; nullable?: true };

export type ScheduleSpecification = {
  variables: Partial<Record<ScheduleField, ScheduleVariable>>;
  constants: {
    [TField in ScheduleField]?: NonNullable<ScheduleFields[TField]>;
  };
  defaults: ScheduleDefaults;
};
