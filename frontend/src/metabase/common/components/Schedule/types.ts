import type { ScheduleSettings, ScheduleType } from "metabase-types/api";

type ScheduleProperty = keyof ScheduleSettings;
export type ScheduleChangeProp = { name: ScheduleProperty; value: unknown };

export type UpdateSchedule = (
  field: ScheduleProperty,
  value: ScheduleSettings[typeof field],
) => void;

/** A default schedule should assign a value or null to
 * each property of ScheduleSettings
 * */
export type ScheduleDefaults = Record<
  ScheduleType,
  Required<Omit<ScheduleSettings, "schedule_type">>
>;
