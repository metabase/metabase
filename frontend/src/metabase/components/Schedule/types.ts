import type { ScheduleSettings } from "metabase-types/api";

type ScheduleProperty = keyof ScheduleSettings;
export type ScheduleChangeProp = { name: ScheduleProperty; value: unknown };

export type HandleChangeProperty = (
  name: ScheduleProperty,
  value: ScheduleSettings[typeof name],
) => void;
