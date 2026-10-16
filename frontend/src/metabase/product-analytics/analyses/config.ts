import { PRODUCT_ANALYTICS_KINDS } from "metabase-types/api";

import type { AnalysisKind } from "../spec/types";

import { COHORTS_CONFIG } from "./cohorts";
import { FUNNEL_CONFIG } from "./funnel";
import { HABIT_CONFIG } from "./habit";
import { LIFECYCLE_CONFIG } from "./lifecycle";
import { PATHS_CONFIG } from "./paths";
import type { AnalysisConfig } from "./types";

export const ANALYSIS_KINDS = PRODUCT_ANALYTICS_KINDS;

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

/** What the analysis picker shows for each kind. */
export type AnalysisSummary = Pick<
  AnalysisConfig<AnalysisKind>,
  "kind" | "name" | "question"
>;
