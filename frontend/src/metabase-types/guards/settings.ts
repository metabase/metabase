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
  // Unjustified type cast. FIXME
  return engineKeys.includes(value as EngineKey);
}

export function isScheduleDay(value: string): value is ScheduleDayType {
  // Unjustified type cast. FIXME
  return SCHEDULE_DAY.includes(value as ScheduleDayType);
}
