import type { NativeQuestionDetails } from "e2e/support/helpers/e2e-question-helpers";

import {
  type AdaptiveStrategy,
  CacheDurationUnit,
  type DoNotCacheStrategy,
  type DurationStrategy,
  type ScheduleStrategy,
} from "metabase-types/api";

import type { StrategyBearer } from "./types";

export const sampleAdaptiveStrategy: AdaptiveStrategy = {
  type: "ttl",
  multiplier: 5,
  min_duration_ms: 0,
};
export const sampleDurationStrategy: DurationStrategy = {
  type: "duration",
  duration: 48,
  unit: CacheDurationUnit.Hours,
};
export const sampleScheduleStrategy: ScheduleStrategy = {
  type: "schedule",
  schedule: "0 0 * * * ?", // Invalidate hourly at the start of the hour
};
export const sampleDoNotCacheStrategy: DoNotCacheStrategy = { type: "nocache" };

/** In milliseconds */
export const questionRuntime = 1000;

export const sampleQuestion: StrategyBearer & {
  name: string;
} & NativeQuestionDetails = {
  model: "question",
  name: "Slow question",
  database: 2, // This is the "QA Postgres12" database
  native: {
    // Selecting an MD5 string makes it easy to see whether the result is cached
    query: `select (MD5(random()::text)), pg_sleep(${questionRuntime / 1000})`,
  },
};

export const sampleDashboard: StrategyBearer & { name: string } = {
  model: "dashboard",
  name: "Dashboard with a slow question",
};

export const sampleDatabase: StrategyBearer = {
  model: "database",
  name: "QA Postgres12",
};

export const instanceDefault: StrategyBearer = {
  model: "root",
  name: "Default policy",
};
