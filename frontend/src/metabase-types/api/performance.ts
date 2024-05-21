/** 'Model' as in 'type of object' */
export type CacheableModel = "root" | "database" | "dashboard" | "question";

export type CacheStrategyType =
  | "nocache"
  | "ttl" // aka Adaptive
  | "duration"
  | "schedule"
  | "inherit";

interface CacheStrategyBase {
  type: CacheStrategyType;
}

export enum CacheDurationUnit {
  Hours = "hours",
  Minutes = "minutes",
  Seconds = "seconds",
  Days = "days",
}

export interface AdaptiveStrategy extends CacheStrategyBase {
  type: "ttl";
  multiplier: number;
  min_duration_ms: number;
  min_duration_seconds?: number;
}

export interface DoNotCacheStrategy extends CacheStrategyBase {
  type: "nocache";
}

export interface DurationStrategy extends CacheStrategyBase {
  type: "duration";
  duration: number;
  unit: CacheDurationUnit;
}

export interface InheritStrategy extends CacheStrategyBase {
  type: "inherit";
}

export interface ScheduleStrategy extends CacheStrategyBase {
  type: "schedule";
  schedule: string;
}

/** Cache invalidation strategy */
export type CacheStrategy =
  | DoNotCacheStrategy
  | AdaptiveStrategy
  | DurationStrategy
  | InheritStrategy
  | ScheduleStrategy;

/** Cache invalidation configuration */
export interface CacheConfig {
  /** The type of cacheable object this configuration concerns */
  model: CacheableModel;
  model_id: number;
  /** Cache invalidation strategy */
  strategy: CacheStrategy;
}

export type CacheConfigAPIResponse = {
  data: CacheConfig[];
};
