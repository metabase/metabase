/** 'Model' as in 'type of object' */
export type CacheableModel = "root" | "database" | "dashboard" | "question";

export type StrategyType =
  | "nocache"
  | "ttl" // aka Query duration multiplier
  | "duration"
  | "schedule"
  | "inherit";

interface StrategyBase {
  type: StrategyType;
}

export enum DurationUnit {
  Hours = "hours",
  Minutes = "minutes",
  Seconds = "seconds",
  Days = "days",
}

export interface AdaptiveStrategy extends StrategyBase {
  type: "ttl";
  multiplier: number;
  min_duration_ms: number;
  min_duration_seconds?: number;
}

export interface DoNotCacheStrategy extends StrategyBase {
  type: "nocache";
}

export interface DurationStrategy extends StrategyBase {
  type: "duration";
  duration: number;
  unit: DurationUnit;
}

export interface InheritStrategy extends StrategyBase {
  type: "inherit";
}

export interface ScheduleStrategy extends StrategyBase {
  type: "schedule";
  schedule: string;
}

/** Cache invalidation strategy */
export type Strategy =
  | DoNotCacheStrategy
  | AdaptiveStrategy
  | DurationStrategy
  | InheritStrategy
  | ScheduleStrategy;

/** Cache invalidation configuration */
export interface Config {
  /** The type of cacheable object this configuration concerns */
  model: CacheableModel;
  model_id: number;
  /** Cache invalidation strategy */
  strategy: Strategy;
}

export type CacheConfigAPIResponse = {
  data: Config[];
};
