import { c, t } from "ttag";
import type { AnySchema } from "yup";
import * as Yup from "yup";
import type { SchemaObjectDescription } from "yup/lib/schema";

import type { Config, Strategy, StrategyType } from "metabase-types/api";
import { DurationUnit } from "metabase-types/api";

export type UpdateTargetId = (
  newTargetId: number | null,
  isFormDirty: boolean,
) => void;

type StrategyData = {
  label: string;
  shortLabel?: string;
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
export const ttlStrategyValidationSchema = Yup.object({
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

export const translateConfig = (
  config: Config,
  direction: "fromAPI" | "toAPI",
): Config => {
  const translated: Config = { ...config };
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
