import { t } from "ttag";
import * as Yup from "yup";

import type { CacheableModel } from "metabase-types/api";

import type { StrategyData } from "../types";
import { isValidStrategyName } from "../utils";

import { defaultMinDurationMs } from "./simple";

export const positiveInteger = Yup.number()
  .positive(t`Enter a positive number.`)
  .integer(t`Enter an integer.`);

export const inheritStrategyValidationSchema = Yup.object({
  type: Yup.string().equals(["inherit"]),
});

export const doNotCacheStrategyValidationSchema = Yup.object({
  type: Yup.string().equals(["nocache"]),
});

export const adaptiveStrategyValidationSchema = Yup.object({
  type: Yup.string().equals(["ttl"]),
  min_duration_ms: positiveInteger.default(defaultMinDurationMs),
  min_duration_seconds: positiveInteger.default(
    Math.ceil(defaultMinDurationMs / 1000),
  ),
  multiplier: positiveInteger.default(10),
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
    const schema = strategies[type].validateWith;
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

export const strategies = {
  inherit: {
    label: (model?: CacheableModel) => {
      switch (model) {
        case "dashboard":
          return t`Use default: each question will use its own policy or the database policy`;
        case "question":
          return t`Use default: use the database or dashboard policy`;
        default:
          return t`Use default`;
      }
    },
    shortLabel: t`Use default`,
    validateWith: inheritStrategyValidationSchema,
  },
  // NOTE: The strategy is called 'ttl' in the BE, but we've renamed it 'Adaptive' in the FE
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
} as Record<string, StrategyData>;
