import { t } from "ttag";

import type { CacheableModel } from "metabase-types/api";

import type { StrategyData } from "../types";

import {
  doNotCacheStrategyValidationSchema,
  getAdaptiveStrategyValidationSchema,
  inheritStrategyValidationSchema,
} from "./validationSchemas";

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
    shortLabel: () => t`Use default`,
    validationSchema: inheritStrategyValidationSchema,
  },
  ttl: {
    label: () =>
      t`Adaptive: use a query's average execution time to determine how long to cache its results`,
    shortLabel: () => t`Adaptive`,
    validationSchema: getAdaptiveStrategyValidationSchema,
  },
  nocache: {
    label: () => t`Don't cache results`,
    shortLabel: () => t`No caching`,
    validationSchema: doNotCacheStrategyValidationSchema,
  },
} as Record<string, StrategyData>;
