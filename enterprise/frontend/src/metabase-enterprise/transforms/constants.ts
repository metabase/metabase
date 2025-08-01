import type { ScheduleType } from "metabase-types/api";

export const NAME_MAX_LENGTH = 254;

export const DEFAULT_SCHEDULE = "0 0 0 * * ? *";

export const SCHEDULE_OPTIONS: ScheduleType[] = [
  "hourly",
  "daily",
  "weekly",
  "monthly",
];
