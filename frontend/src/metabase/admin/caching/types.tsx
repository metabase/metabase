import { t } from "ttag";

export const CacheStrategyTypes = {
  nocache: t`Don't cache`,
  ttl: t`When the TTL expires`,
  duration: t`On a regular duration`,
  schedule: t`On a schedule`,
  query: t`When the data updates`,
};
export type CacheStrategyType = keyof typeof CacheStrategyTypes;
export const isValidCacheStrategyType = (
  strategy: string,
): strategy is CacheStrategyType => {
  return Object.keys(CacheStrategyTypes).includes(strategy);
};

export type UnitOfTime = "hours" | "minutes" | "seconds" | "days";

export type GetConfigByModelId = Map<number, CacheConfig>;

export type Model =
  | "root"
  | "database"
  | "collection"
  | "dashboard"
  | "question";

interface CacheStrategyMap {
  type: CacheStrategyType;
}

interface NoCacheStrategy extends CacheStrategyMap {
  type: "nocache";
}

interface TtlStrategy extends CacheStrategyMap {
  type: "ttl";
  multiplier: number;
  min_duration: number;
}

interface DurationStrategy extends CacheStrategyMap {
  type: "duration";
  duration: number;
  unit: "hours" | "minutes" | "seconds" | "days";
}

interface ScheduleStrategy extends CacheStrategyMap {
  type: "schedule";
  schedule: string;
}

interface QueryStrategy extends CacheStrategyMap {
  type: "query";
  field_id: number;
  aggregation: "max" | "count";
  schedule: string;
}

export type CacheStrategy =
  | NoCacheStrategy
  | TtlStrategy
  | DurationStrategy
  | ScheduleStrategy
  | QueryStrategy;

export interface CacheConfig {
  model: Model;
  model_id: number;
  strategy: CacheStrategy;
}
