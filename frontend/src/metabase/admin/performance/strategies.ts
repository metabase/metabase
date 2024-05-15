import { t } from "ttag";
import type { AnySchema } from "yup";
import * as Yup from "yup";
import type { SchemaObjectDescription } from "yup/lib/schema";

import type {
  Config,
  CacheableModel,
  Strategy,
  StrategyType,
} from "metabase-types/api";
import { DurationUnit } from "metabase-types/api";

import { defaultCron, getFrequencyFromCron } from "./utils";

export type UpdateTargetId = (
  newTargetId: number | null,
  isFormDirty: boolean,
) => void;

type StrategyLabel = string | ((model?: CacheableModel) => string);

type StrategyData = {
  /**
   * The human-readable label for the strategy, which can be a string or a function that takes a model and returns a string */
  label: StrategyLabel;
  shortLabel?: StrategyLabel;
  validateWith: AnySchema;
};

export const rootId = 0;

const durationUnits = new Set(Object.values(DurationUnit).map(String));

const positiveInteger = Yup.number()
  .positive(t`Enter a positive number.`)
  .integer(t`Enter an integer.`);

export const inheritStrategyValidationSchema = Yup.object({
  type: Yup.string().equals(["inherit"]),
});

export const doNotCacheStrategyValidationSchema = Yup.object({
  type: Yup.string().equals(["nocache"]),
});

export const defaultMinDurationMs = 1000;
export const adaptiveStrategyValidationSchema = Yup.object({
  type: Yup.string().equals(["ttl"]),
  min_duration_ms: positiveInteger.default(defaultMinDurationMs),
  min_duration_seconds: positiveInteger.default(
    Math.ceil(defaultMinDurationMs / 1000),
  ),
  multiplier: positiveInteger.default(10),
});

export const durationStrategyValidationSchema = Yup.object({
  type: Yup.string().equals(["duration"]),
  duration: positiveInteger.default(24),
  unit: Yup.string().test(
    "is-duration-unit",
    "${path} is not a valid duration",
    value => !!value && durationUnits.has(value),
  ),
});

export const scheduleStrategyValidationSchema = Yup.object({
  type: Yup.string().equals(["schedule"]),
  schedule: Yup.string()
    .required(t`A cron expression is required`)
    .default(defaultCron),
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
    const { type } = value as unknown as { type: string };
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

/** Cache invalidation strategies and related metadata */
export const Strategies: Record<StrategyType, StrategyData> = {
  inherit: {
    label: (model?: CacheableModel) => {
      switch (model) {
        case "dashboard":
          return t`Use default: each question will use its own policy or the database policy`;
        default:
          return t`Use default`;
      }
    },
    shortLabel: t`Use default`,
    validateWith: inheritStrategyValidationSchema,
  },
  duration: {
    label: t`Duration: keep the cache for a number of hours`,
    validateWith: durationStrategyValidationSchema,
    shortLabel: t`Duration`,
  },
  schedule: {
    label: t`Schedule: pick when to regularly invalidate the cache`,
    shortLabel: t`Scheduled`,
    validateWith: scheduleStrategyValidationSchema,
  },
  // NOTE: The strategy is called 'ttl' in the BE, but we've renamed it to 'Adaptive' in the FE
  ttl: {
    label: t`Adaptive: use a query’s average execution time to determine how long to cache its results`,
    shortLabel: t`Adaptive`,
    validateWith: adaptiveStrategyValidationSchema,
  },
  nocache: {
    label: t`Don’t cache results`,
    validateWith: doNotCacheStrategyValidationSchema,
    shortLabel: t`No caching`,
  },
};

const validStrategyNames = new Set(Object.keys(Strategies));
const isValidStrategyName = (strategy: string): strategy is StrategyType =>
  validStrategyNames.has(strategy);

export const getLabelString = (label: StrategyLabel, model?: CacheableModel) =>
  typeof label === "string" ? label : label(model);

export const getShortStrategyLabel = (
  strategy?: Strategy,
  model?: CacheableModel,
) => {
  if (!strategy) {
    return null;
  }
  const type = Strategies[strategy.type];
  const mainLabel = getLabelString(type.shortLabel ?? type.label, model);
  if (strategy.type === "schedule") {
    const frequency = getFrequencyFromCron(strategy.schedule);
    return `${mainLabel}: ${frequency}`;
  } else {
    return mainLabel;
  }
};

export const getFieldsForStrategyType = (strategyType: StrategyType) => {
  const strategy = Strategies[strategyType];
  const validationSchemaDescription =
    strategy.validateWith.describe() as SchemaObjectDescription;
  const fieldRecord = validationSchemaDescription.fields;
  const fields = Object.keys(fieldRecord);
  return fields;
};

export const translateConfig = (
  config: Config,
  direction: "fromAPI" | "toAPI",
): Config => {
  const translated: Config = { ...config };

  // If strategy type is unsupported, use a fallback
  if (!isValidStrategyName(translated.strategy.type)) {
    translated.strategy.type =
      translated.model_id === rootId ? "nocache" : "inherit";
  }

  if (translated.strategy.type === "ttl") {
    if (direction === "fromAPI") {
      translated.strategy.min_duration_seconds = Math.ceil(
        translated.strategy.min_duration_ms / 1000,
      );
    } else {
      translated.strategy.min_duration_ms =
        translated.strategy.min_duration_seconds === undefined
          ? defaultMinDurationMs
          : translated.strategy.min_duration_seconds * 1000;
      delete translated.strategy.min_duration_seconds;
    }
  }
  return translated;
};

export const translateConfigFromAPI = (config: Config): Config =>
  translateConfig(config, "fromAPI");
export const translateConfigToAPI = (config: Config): Config =>
  translateConfig(config, "toAPI");
