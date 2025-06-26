import { t } from "ttag";
import * as Yup from "yup";

import { defaultMinDurationMs } from "./simple";

export const getPositiveIntegerSchema = () =>
  Yup.number()
    .positive(t`Enter a positive number.`)
    .integer(t`Enter an integer.`);

export const inheritStrategyValidationSchema = Yup.object({
  type: Yup.string().equals(["inherit"]),
});

export const doNotCacheStrategyValidationSchema = Yup.object({
  type: Yup.string().equals(["nocache"]),
});

export const getAdaptiveStrategyValidationSchema = () => {
  const positiveInteger = getPositiveIntegerSchema();
  return Yup.object({
    type: Yup.string().equals(["ttl"]),
    min_duration_ms: positiveInteger.default(defaultMinDurationMs),
    min_duration_seconds: positiveInteger.default(
      Math.ceil(defaultMinDurationMs / 1000),
    ),
    multiplier: positiveInteger.default(10),
  });
};
