import { c, t } from "ttag";
import type { AnySchema } from "yup";

import {
  strategyValidationSchema,
  doNotCacheStrategyValidationSchema,
  ttlStrategyValidationSchema,
  durationStrategyValidationSchema,
  inheritStrategyValidationSchema,
} from "./validation";

type StrategyData = {
  label: string;
  shortLabel?: string;
  validateWith: AnySchema;
};

export type StrategyType = "nocache" | "ttl" | "duration" | "inherit";

/** Cache invalidation strategies and related metadata */
export const Strategies: Record<StrategyType, StrategyData> = {
  ttl: {
    label: t`TTL: When the time-to-live (TTL) expires`,
    shortLabel: c("'TTL' is short for 'time-to-live'").t`TTL`,
    validateWith: ttlStrategyValidationSchema,
  },
  duration: {
    label: t`Duration: after a specific number of hours`,
    validateWith: durationStrategyValidationSchema,
    shortLabel: t`Duration`,
  },
  nocache: {
    label: t`Don't cache results`,
    validateWith: doNotCacheStrategyValidationSchema,
    shortLabel: t`No caching`,
  },
  inherit: {
    label: t`Use default`,
    validateWith: inheritStrategyValidationSchema,
  },
};

export const getStrategyLabel = (strategy?: Strategy) => {
  return strategy ? Strategies[strategy.type].label : null;
};

export const getShortStrategyLabel = (strategy?: Strategy) => {
  if (!strategy) {
    return null;
  }
  const type = Strategies[strategy.type];
  return type.shortLabel ?? type.label;
};

export const isValidStrategyName = (
  strategy: string,
): strategy is StrategyType => {
  return Object.keys(Strategies).includes(strategy);
};

export type Model =
  | "root"
  | "database"
  | "collection"
  | "dashboard"
  | "question";

interface StrategyBase {
  type: StrategyType;
}

export interface TTLStrategy extends StrategyBase {
  type: "ttl";
  multiplier: number;
  min_duration_ms: number;
}

export interface DoNotCacheStrategy extends StrategyBase {
  type: "nocache";
}

export enum DurationUnit {
  Hours = "hours",
  Minutes = "minutes",
  Seconds = "seconds",
  Days = "days",
}

export interface DurationStrategy extends StrategyBase {
  type: "duration";
  duration: number;
  unit: DurationUnit;
}

export interface InheritStrategy extends StrategyBase {
  type: "inherit";
}

/** Cache invalidation strategy */
export type Strategy =
  | DoNotCacheStrategy
  | TTLStrategy
  | DurationStrategy
  | InheritStrategy;

/** Cache invalidation configuration */
export interface Config {
  /** The type of cacheable object this configuration concerns */
  model: Model;
  model_id: number;
  /** Cache invalidation strategy */
  strategy: Strategy;
}

export const isValidStrategy = (x: unknown): x is Strategy => {
  return strategyValidationSchema.isValidSync(x);
};

export enum TabId {
  DataCachingSettings = "dataCachingSettings",
  DashboardAndQuestionCaching = "dashboardAndQuestionCaching",
  ModelPersistence = "modelPersistence",
  CachingStats = "cachingStats",
}
const validTabIds = new Set(Object.values(TabId).map(String))

export const isValidTabId = (tab: unknown): tab is TabId =>
  typeof tab === "string" && validTabIds.has(tab);

export type SafelyUpdateTargetId = (
  newTargetId: number | null,
  isFormDirty: boolean,
) => void;

export type LeaveConfirmationData =
  | {
      isModalOpen: false;
    }
  | { isModalOpen: true; onConfirm: () => void };

export type CacheConfigAPIResponse = {
  data: Config[];
};
