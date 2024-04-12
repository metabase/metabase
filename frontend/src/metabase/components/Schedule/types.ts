import type { ScheduleSettings } from "metabase-types/api";

type ScheduleProperty = keyof ScheduleSettings;
export type ScheduleChangeProp = { name: ScheduleProperty; value: unknown };

export type UpdateSchedule = (
  field: ScheduleProperty,
  value: ScheduleSettings[typeof field],
) => void;
