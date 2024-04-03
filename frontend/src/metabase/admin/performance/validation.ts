import { t } from "ttag";
import * as Yup from "yup";

import type { StrategyType } from "./types";
import { Strategies, TabId } from "./types";

export const unitOfTimeRegex = /hours|minutes|seconds|days/;

const positiveInteger = Yup.number()
  .positive(t`The minimum query duration must be a positive number.`)
  .integer(t`The minimum query duration must be an integer.`);

export const isValidPositiveInteger = (value: unknown) =>
  positiveInteger.isValidSync(value);

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

const validStrategyNames = new Set(Object.keys(Strategies));
const isValidStrategyName = (strategy: string): strategy is StrategyType =>
  validStrategyNames.has(strategy);

const validTabIds = new Set(Object.values(TabId).map(String));
export const isValidTabId = (tab: unknown): tab is TabId =>
  typeof tab === "string" && validTabIds.has(tab);
