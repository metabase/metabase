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
  /** Schema used to validate the value. This field can optionally be set to a function that returns a schema. This helps ensure that calls to ttag functions do not run until after the locale is set */
  validationSchema: AnySchema | (() => AnySchema);
};

export enum PerformanceTabId {
  Databases = "databases",
  Models = "models",
}
