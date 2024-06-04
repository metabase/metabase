import { t } from "ttag";
import * as Yup from "yup";

import { DurationUnit } from "metabase-types/api";

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
