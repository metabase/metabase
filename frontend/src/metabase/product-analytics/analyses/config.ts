import { PRODUCT_ANALYTICS_KINDS } from "metabase-types/api";
import { isProductAnalyticsKind } from "metabase-types/guards";

import type { StoredSettings } from "../settings/types";
import type { AnalysisKind } from "../spec/types";

import { COHORTS_CONFIG } from "./cohorts";
import { FUNNEL_CONFIG } from "./funnel";
import { HABIT_CONFIG } from "./habit";
import { LIFECYCLE_CONFIG } from "./lifecycle";
import { PATHS_CONFIG } from "./paths";
import type { AnalysisConfig } from "./types";

export const ANALYSIS_KINDS = PRODUCT_ANALYTICS_KINDS;

export const isAnalysisKind = isProductAnalyticsKind;

const ANALYSIS_CONFIG: { [K in AnalysisKind]: AnalysisConfig<K> } = {
  funnel: FUNNEL_CONFIG,
  paths: PATHS_CONFIG,
  habit: HABIT_CONFIG,
  lifecycle: LIFECYCLE_CONFIG,
  cohorts: COHORTS_CONFIG,
};

export const getAnalysisConfig = <K extends AnalysisKind>(
  kind: K,
): AnalysisConfig<K> => ANALYSIS_CONFIG[kind];

/** The stored settings a kind reads: its own and the common ones. */
export const pickSettingsForKind = (
  kind: AnalysisKind,
  stored: StoredSettings,
): StoredSettings => {
  const keys = new Set(Object.keys(getAnalysisConfig(kind).settings));
  return Object.fromEntries(
    Object.entries(stored).filter(([key]) => keys.has(key)),
  );
};
