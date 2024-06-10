import type { AnySchema } from "yup";

import type { CacheableModel } from "metabase-types/api";

export type UpdateTargetId = (
  newTargetId: number | null,
  isFormDirty: boolean,
) => void;

export type StrategyLabel = string | ((model?: CacheableModel) => string);

export type StrategyData = {
  /**
   * The human-readable label for the strategy, which can be a string or a function that takes a model and returns a string */
  label: StrategyLabel;
  shortLabel?: StrategyLabel;
  validateWith: AnySchema;
};

export enum PerformanceTabId {
  DataCachingSettings = "dataCachingSettings",
  ModelPersistence = "modelPersistence",
}
