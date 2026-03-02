import type { CollectionEssentials } from "metabase-types/api/search";

import type { SortDirection } from "./sorting";

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
  refresh_automatically: boolean;
}

export interface InheritStrategy extends CacheStrategyBase {
  type: "inherit";
}

export interface ScheduleStrategy extends CacheStrategyBase {
  type: "schedule";
  schedule: string;
  refresh_automatically: boolean;
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

export type CacheSortColumn = "name" | "collection" | "policy";

export interface ListCacheConfigsRequest {
  model?: CacheableModel[];
  collection?: number;
  id?: number;
  limit?: number;
  offset?: number;
  sort_column?: CacheSortColumn;
  sort_direction?: SortDirection;
}

/** Cache config with hydrated name and collection data */
export interface CacheConfigWithDetails extends CacheConfig {
  name?: string;
  collection?: CollectionEssentials | null;
}

export interface ListCacheConfigsResponse {
  data: CacheConfigWithDetails[];
  total: number;
  limit: number | null;
  offset: number | null;
}
