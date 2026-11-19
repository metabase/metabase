import { getTypedComputedSettings } from "metabase/viz-core";
import type { ProductAnalyticsKind } from "metabase-types/api";

import { HABIT_CONFIG } from "./habit";
import type {
  AnalysisConfig,
  AnalysisContext,
  AnalysisSettingsByKind,
} from "./types";

const ANALYSIS_CONFIGS: {
  [K in ProductAnalyticsKind]: AnalysisConfig<K>;
} = {
  habit: HABIT_CONFIG,
};

const getAnalysisConfig = <K extends ProductAnalyticsKind>(
  kind: K,
): AnalysisConfig<K> => ANALYSIS_CONFIGS[kind];

/**
 * Every setting a kind of analysis has: the stored values that are valid for
 * the context, and defaults for the rest. Stored keys the kind doesn't have
 * are dropped.
 */
export const computeAnalysisSettings = <K extends ProductAnalyticsKind>(
  kind: K,
  context: AnalysisContext,
  stored: Record<string, unknown>,
): AnalysisSettingsByKind[K] =>
  getTypedComputedSettings(getAnalysisConfig(kind).settings, context, stored);
