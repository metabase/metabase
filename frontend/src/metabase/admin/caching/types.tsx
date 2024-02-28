import { t } from "ttag";

type StrategyTypeData = {
  label: string;
  defaults?: Record<string, string | number>;
};

export type StrategyName =
  | "nocache"
  | "ttl"
  | "duration"
  | "schedule"
  | "query";

export const Strategies: Record<StrategyName, StrategyTypeData> = {
  nocache: { label: t`Don't cache` },
  ttl: {
    label: t`When the TTL expires`,
    defaults: { min_duration: 1, multiplier: 1 },
  },
  duration: { label: t`On a regular duration` },
  schedule: { label: t`On a schedule` },
  query: {
    label: t`When the data updates`,
    defaults: { field_id: 0, aggregation: "", schedule: "" },
  },
};
export const isValidStrategyName = (
  strategy: string,
): strategy is StrategyName => {
  return Object.keys(Strategies).includes(strategy);
};

export type UnitOfTime = "hours" | "minutes" | "seconds" | "days";

export type GetConfigByModelId = Map<number, CacheConfig>;

export type Model =
  | "root"
  | "database"
  | "collection"
  | "dashboard"
  | "question";

interface StrategyMap {
  type: StrategyName;
}

interface NoCacheStrategy extends StrategyMap {
  type: "nocache";
}

interface TtlStrategy extends StrategyMap {
  type: "ttl";
  multiplier: number;
  min_duration: number;
}

interface DurationStrategy extends StrategyMap {
  type: "duration";
  duration: number;
  unit: "hours" | "minutes" | "seconds" | "days";
}

interface ScheduleStrategy extends StrategyMap {
  type: "schedule";
  schedule: string;
}

interface QueryStrategy extends StrategyMap {
  type: "query";
  field_id: number;
  aggregation: "max" | "count";
  schedule: string;
}

export type Strategy =
  | NoCacheStrategy
  | TtlStrategy
  | DurationStrategy
  | ScheduleStrategy
  | QueryStrategy;

export interface CacheConfig {
  model: Model;
  model_id: number;
  strategy: Strategy;
}

// This currently has a different shape than CacheConfig
export interface CacheConfigFromAPI {
  model: Model;
  model_id: number;
  strategy: StrategyName;
  config: Omit<Strategy, "type">;
}

export type StrategySetter = (
  databaseId: number,
  newStrategy: Partial<Strategy> | null,
) => void;
