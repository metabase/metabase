import { WRITABLE_DB_ID } from "e2e/support/cypress_data";
import type { NativeQuestionDetails } from "e2e/support/helpers";
import {
  type AdaptiveStrategy,
  CacheDurationUnit,
  type DoNotCacheStrategy,
  type DurationStrategy,
  type ScheduleStrategy,
} from "metabase-types/api";

import type { StrategyBearer } from "./types";

export const TEST_TABLE = "cached_table";

export const sampleAdaptiveStrategy: AdaptiveStrategy = {
  type: "ttl",
  multiplier: 5,
  min_duration_ms: 0,
};
export const sampleDurationStrategy: DurationStrategy = {
  type: "duration",
  duration: 48,
  unit: CacheDurationUnit.Hours,
  refresh_automatically: false,
};
export const sampleScheduleStrategy: ScheduleStrategy = {
  type: "schedule",
  schedule: "0 0 * * * ?", // Invalidate hourly at the start of the hour
  refresh_automatically: false,
};
export const sampleDoNotCacheStrategy: DoNotCacheStrategy = { type: "nocache" };

/** In milliseconds */
export const questionRuntime = 1000;

export const sampleQuestion: StrategyBearer & {
  name: string;
} & NativeQuestionDetails = {
  model: "question",
  name: "Slow question",
  database: WRITABLE_DB_ID,
  native: {
    query: `SELECT * FROM ${TEST_TABLE}, pg_sleep(${questionRuntime / 1000})`,
  },
};

export const sampleDashboard: StrategyBearer & { name: string } = {
  model: "dashboard",
  name: "Dashboard with a slow question",
};

export const sampleDatabase: StrategyBearer = {
  model: "database",
  name: "Writable Postgres12",
};

export const instanceDefault: StrategyBearer = {
  model: "root",
  name: "Default policy",
};
