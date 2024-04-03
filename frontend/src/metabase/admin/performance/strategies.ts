import { c, t } from "ttag";
import type { AnySchema } from "yup";
import * as Yup from "yup";
import type { SchemaObjectDescription } from "yup/lib/schema";

export type StrategyType = "nocache" | "ttl" | "duration" | "inherit";

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
export enum TabId {
  DataCachingSettings = "dataCachingSettings",
  DashboardAndQuestionCaching = "dashboardAndQuestionCaching",
  ModelPersistence = "modelPersistence",
  CachingStats = "cachingStats",
}

export type UpdateTargetId = (
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

type StrategyData = {
  label: string;
  shortLabel?: string;
  validateWith: AnySchema;
};

export const rootId = 0;

export const unitOfTimeRegex = /hours|minutes|seconds|days/;

const positiveInteger = Yup.number()
  .positive(t`The minimum query duration must be a positive number.`)
  .integer(t`The minimum query duration must be an integer.`);

export const inheritStrategyValidationSchema = Yup.object({
  type: Yup.string().equals(["inherit"]),
});

export const doNotCacheStrategyValidationSchema = Yup.object({
  type: Yup.string().equals(["nocache"]),
});

export const ttlStrategyValidationSchema = Yup.object({
  type: Yup.string().equals(["ttl"]),
  min_duration_ms: positiveInteger.default(60000),
  multiplier: positiveInteger.default(10),
});

export const durationStrategyValidationSchema = Yup.object({
  type: Yup.string().equals(["duration"]),
  duration: positiveInteger.default(24),
  unit: Yup.string().matches(unitOfTimeRegex),
});

export const strategyValidationSchema = Yup.object().test(
  "strategy-validation",
  "The object must match one of the strategy validation schemas",
  function (value) {
    if (!value) {
      return this.createError({
        message: `Strategy is falsy`,
      });
    }
    const { type } = value as unknown as { type: string }; // TODO: fix
    if (!isValidStrategyName(type)) {
      return this.createError({
        message: `"${type}" is not a valid strategy name`,
        path: "type",
      });
    }
    const schema = Strategies[type].validateWith;
    try {
      schema.validateSync(value);
      return true;
    } catch (error: unknown) {
      if (error instanceof Yup.ValidationError) {
        return this.createError({
          message: error.message,
          path: error.path,
        });
      } else {
        console.error("Unhandled error:", error);
        return false;
      }
    }
  },
) as Yup.AnySchema;

const validTabIds = new Set(Object.values(TabId).map(String));
export const isValidTabId = (tab: unknown): tab is TabId =>
  typeof tab === "string" && validTabIds.has(tab);

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

const validStrategyNames = new Set(Object.keys(Strategies));
const isValidStrategyName = (strategy: string): strategy is StrategyType =>
  validStrategyNames.has(strategy);

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

export const getFieldsForStrategyType = (strategyType: StrategyType) => {
  const strategy = Strategies[strategyType];
  const validationSchemaDescription =
    strategy.validateWith.describe() as SchemaObjectDescription;
  const fieldRecord = validationSchemaDescription.fields;
  const fields = Object.keys(fieldRecord);
  return fields;
};
