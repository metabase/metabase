import {
  getSettingsWidgets,
  getTypedComputedSettings,
} from "metabase/viz-core";
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

export const getAnalysisConfig = <K extends ProductAnalyticsKind>(
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

export const getAnalysisSettingWidgets = <K extends ProductAnalyticsKind>(
  kind: K,
  context: AnalysisContext,
  stored: Record<string, unknown>,
  settings: AnalysisSettingsByKind[K],
  onChangeSettings: (changes: Partial<AnalysisSettingsByKind[K]>) => void,
) =>
  getSettingsWidgets(
    getAnalysisConfig(kind).settings,
    stored,
    settings,
    context,
    (changes) => {
      const settingChanges: unknown = changes;
      // The engine passes `{ [key]: value }` with what a widget gave its
      // `onChange`, which `withWidgetProps` types by the setting's value.
      onChangeSettings(settingChanges as Partial<AnalysisSettingsByKind[K]>);
    },
  );

export type AnalysisSettingWidget = ReturnType<
  typeof getAnalysisSettingWidgets
>[number];
