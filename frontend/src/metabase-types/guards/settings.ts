import {
  type EngineKey,
  type ScheduleDayType,
  engineKeys,
} from "metabase-types/api";

export const SCHEDULE_DAY: ScheduleDayType[] = [
  "sun",
  "mon",
  "tue",
  "wed",
  "thu",
  "fri",
  "sat",
];

export function isEngineKey(value: string | undefined): value is EngineKey {
  return engineKeys.includes(value as EngineKey);
}

export function isScheduleDay(value: string): value is ScheduleDayType {
  return SCHEDULE_DAY.includes(value as ScheduleDayType);
}
