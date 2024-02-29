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

const isValidUnitOfTime = (x: unknown): x is UnitOfTime =>
  typeof x === "string" && ["hours", "minutes", "seconds", "days"].includes(x);

export type GetConfigByModelId = Map<number, CacheConfig>;

export type Model =
  | "root"
  | "database"
  | "collection"
  | "dashboard"
  | "question";

const isValidModel = (x: unknown): x is Model =>
  typeof x === "string" &&
  ["root", "database", "collection", "dashboard", "question"].includes(x);

interface StrategyMap {
  type: StrategyName;
}

interface DoNotCacheStrategy extends StrategyMap {
  type: "nocache";
}

interface TimeToLiveStrategy extends StrategyMap {
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

/** Cache invalidation strategy */
export type Strategy =
  | DoNotCacheStrategy
  | TimeToLiveStrategy
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
  model: Model,
  modelId: number,
  newStrategy: Partial<Strategy> | null,
) => void;

export type DBStrategySetter = (
  modelId: number,
  newStrategy: Partial<Strategy> | null,
) => void;

export type RootStrategySetter = (
  newStrategy: Partial<Strategy> | null,
) => void;

export const isValidStrategy = (x: unknown): x is Strategy => {
  if (!hasType(x)) {
    return false;
  }
  if (x.type === "nocache") {
    return true;
  }
  if (x.type === "ttl") {
    return (
      typeof x.min_duration === "number" && typeof x.multiplier === "number"
    );
  }
  if (x.type === "duration") {
    return typeof x.duration === "number" && isValidUnitOfTime(x.unit);
  }
  if (x.type === "schedule") {
    return x.type === "schedule" && typeof x.schedule === "string";
  }
  if (x.type === "query") {
    return (
      typeof x.field_id === "number" &&
      ["max", "count"].includes(x.aggregation) &&
      typeof x.schedule === "string"
    );
  }
  return false;
};

type NonNullObject = {
  [key: string]: any;
};

type StrategyFromAPI = {
  strategy: Strategy;
  config: any;
};

const isValidObject = (x: unknown): x is NonNullObject => {
  if (typeof x !== "object") {
    return false;
  }
  if (x === null) {
    return false;
  }
  return true;
};

export const isValidConfigFromAPI = (x: unknown): x is StrategyFromAPI => {
  if (!isValidObject(x)) {
    return false;
  }
  return "strategy" in x && "config" in x;
};

const hasType = (x: unknown): x is NonNullObject & { type: any } =>
  isValidObject(x) && "type" in x;
const hasValidModel = (x: unknown): x is NonNullObject & { model: Model } =>
  isValidObject(x) && "model" in x && isValidModel(x.model);
const hasValidModelId = (
  x: unknown,
): x is NonNullObject & { model_id: number } =>
  isValidObject(x) && "model_id" in x && typeof x.model_id === "number";
const hasValidStrategy = (
  x: unknown,
): x is NonNullObject & { strategy: Strategy } =>
  isValidObject(x) && "strategy" in x && isValidStrategy(x.strategy);
export const isValidCacheConfig = (x: unknown): x is CacheConfig =>
  hasValidModel(x) && hasValidModelId(x) && hasValidStrategy(x);

export enum TabId {
  DataCachingSettings = "dataCachingSettings",
  DashboardAndQuestionCaching = "dashboardAndQuestionCaching",
  ModelPersistence = "modelPersistence",
  CachingStats = "cachingStats",
}
export const isValidTabId = (tab: unknown): tab is TabId =>
  typeof tab === "string" && Object.values(TabId).map(String).includes(tab);
