import { useCallback, useMemo, useState } from "react";
import { t } from "ttag";

import type { ClickAction, ClickObject } from "metabase/visualizations/types";
import type {
  ConcreteTableId,
  SingleSeries,
  UnsavedCard,
} from "metabase-types/api";

import type { AnalysisContext } from "../analyses/types";
import type { BaseQueryInput } from "../base-query";
import { getCohortTableSettings } from "../cohorts/retention-curves";
import type { InsightsFocus } from "../components/supporting/InsightsPanel";
import {
  getFunnelPathsRange,
  getPathsFunnel,
  getPathsRangeInto,
} from "../funnel-paths/range";
import {
  type FunnelPaths,
  useFunnelPaths,
} from "../funnel-paths/use-funnel-paths";
import { BOUNCE_INSIGHTS } from "../insights/bounce-analysis";
import {
  getClickedStep,
  getClickedTransition,
} from "../insights/clicked-transition";
import { FUNNEL_INSIGHTS } from "../insights/funnel-analysis";
import { HABIT_INSIGHTS } from "../insights/habit-analysis";
import { LIFECYCLE_INSIGHTS } from "../insights/lifecycle-analysis";
import type { InsightsAnalysis } from "../insights/types";
import { type Insights, useInsights } from "../insights/use-insights";
import { type PathSteps, usePathSteps } from "../path-steps/use-path-steps";
import type { AnalysisSpec, FunnelSpec } from "../spec/types";
import type { FunnelPathsRange } from "../sql/analyses/funnel-paths";
import { useAnalysisQuery } from "../use-analysis-query";

import { getShowInsightsAction, getShowPathsAction } from "./click-actions";

type UseSupportingAnalysesArgs = {
  spec: AnalysisSpec | undefined;
  tableId: ConcreteTableId | undefined;
  /** Must keep its identity while unchanged. */
  base: BaseQueryInput;
  context: AnalysisContext;
  /** A chart click asked for insights; the side panel should open. */
  onShowInsights: () => void;
};

/** The paths through a funnel's steps, for a chosen range of them. */
export type FunnelPathsSupport = {
  funnel: FunnelSpec;
  range: FunnelPathsRange;
  paths: FunnelPaths;
  /** Changes with each request to bring the paths into view. */
  focusId: number | undefined;
  onChangeRange: (range: FunnelPathsRange) => void;
};

/** The insights side panel's content, for kinds that have insights. */
export type InsightsSupport = {
  insights: Insights;
  focus: InsightsFocus | undefined;
  /** Shown while the analysis isn't set up enough for insights. */
  idleLabel: string;
};

/** The supporting analyses a funnel shows below its chart. */
export type FunnelSupport = {
  /** Undefined when the funnel has no paths to show, e.g. unordered steps. */
  paths: FunnelPathsSupport | undefined;
};

/** The steps across a paths analysis. */
export type PathsSupport = {
  steps: PathSteps;
};

/** The cohort table below the retention curves. */
export type CohortsSupport = {
  /** The table, once the per-cohort query's result is in. */
  series: SingleSeries<UnsavedCard> | undefined;
  isLoading: boolean;
  error: string | undefined;
};

export type SupportingAnalyses = {
  /** Set while the analysis is a funnel. */
  funnel: FunnelSupport | undefined;
  /** Set while the analysis is paths. */
  paths: PathsSupport | undefined;
  /** Set while the analysis is cohorts. */
  cohorts: CohortsSupport | undefined;
  /** The insights side panel's content; every kind has one. */
  insights: InsightsSupport;
  /** The chart click actions that lead to a supporting analysis. */
  getClickActions: (clicked: ClickObject) => ClickAction[];
};

const getInsightsAnalysis = (
  spec: AnalysisSpec | undefined,
): InsightsAnalysis | undefined => {
  switch (spec?.kind) {
    case "funnel":
      return FUNNEL_INSIGHTS;
    case "paths":
      return BOUNCE_INSIGHTS;
    case "lifecycle":
      return LIFECYCLE_INSIGHTS;
    case "habit":
      return HABIT_INSIGHTS;
    default:
      return undefined;
  }
};

/**
 * The supporting analyses below an analysis's primary chart, and the chart
 * click actions that bring one of them into view. Each kind of analysis
 * contributes its own: a funnel shows the paths between its steps and the
 * insights into who converts, paths show their steps' entrances and exits
 * and the insights into who bounces, and cohorts show their table.
 */
export const useSupportingAnalyses = ({
  spec,
  tableId,
  base,
  context,
  onShowInsights,
}: UseSupportingAnalysesArgs): SupportingAnalyses => {
  const isFunnel = spec?.kind === "funnel";
  const isCohorts = spec?.kind === "cohorts";
  const isPaths = spec?.kind === "paths";

  // A row per cohort even when the chart shows their average. When the chart
  // shows each cohort, the SQL is the same and the result comes from the cache.
  const cohortTableSpec = useMemo(
    (): AnalysisSpec | undefined =>
      spec?.kind === "cohorts"
        ? { ...spec, output: { ...spec.output, cohortsLines: "each" } }
        : undefined,
    [spec],
  );
  const cohortTable = useAnalysisQuery({
    spec: cohortTableSpec,
    tableId,
    base,
  });
  const cohortsSeries = useMemo((): SingleSeries<UnsavedCard> | undefined => {
    const { dataset, datasetQuery } = cohortTable;
    if (
      cohortTableSpec === undefined ||
      dataset?.data === undefined ||
      datasetQuery === undefined
    ) {
      return undefined;
    }
    return {
      card: {
        display: "cohort",
        dataset_query: datasetQuery,
        visualization_settings: getCohortTableSettings(cohortTableSpec),
      },
      data: dataset.data,
    };
  }, [cohortTableSpec, cohortTable]);

  const insights = useInsights({
    spec,
    analysis: getInsightsAnalysis(spec),
    tableId,
    base,
    context,
  });
  const pathSteps = usePathSteps({ spec, tableId, base });
  const [insightsFocus, setInsightsFocus] = useState<InsightsFocus>();

  const pathsFunnel = getPathsFunnel(spec);
  const [chosenPathsRange, setChosenPathsRange] = useState<FunnelPathsRange>();
  const pathsRange =
    pathsFunnel !== undefined
      ? getFunnelPathsRange(pathsFunnel, chosenPathsRange)
      : undefined;
  const paths = useFunnelPaths({ spec, tableId, base, range: pathsRange });
  const [pathsFocusId, setPathsFocusId] = useState<number>();

  const getClickActions = useCallback(
    (clicked: ClickObject): ClickAction[] => {
      if (clicked.dimensions == null) {
        return [];
      }
      const step = getClickedStep(spec, clicked);
      const range =
        pathsFunnel !== undefined && step !== undefined
          ? getPathsRangeInto(pathsFunnel, step)
          : undefined;
      const transition = getClickedTransition(spec, insights.state, clicked);
      return [
        ...(range !== undefined
          ? [
              getShowPathsAction(() => {
                setChosenPathsRange(range);
                setPathsFocusId((id) => (id ?? 0) + 1);
              }),
            ]
          : []),
        ...(transition !== undefined
          ? [
              getShowInsightsAction(() => {
                setInsightsFocus((focus) => ({
                  question: transition,
                  id: (focus?.id ?? 0) + 1,
                }));
                onShowInsights();
              }),
            ]
          : []),
      ];
    },
    [spec, pathsFunnel, insights.state, onShowInsights],
  );

  const insightsIdleLabel = (() => {
    switch (spec?.kind) {
      case "funnel":
        return t`Finish setting up the funnel to see insights.`;
      case "lifecycle":
        return t`Finish setting up the lifecycle to see insights.`;
      case "paths":
        return t`Start the paths at the start of a visit to see insights.`;
      case "habit":
        return t`Finish setting up the habit analysis to see insights.`;
      case "cohorts":
        return t`Insights aren't available for cohorts yet.`;
      default:
        return t`Finish setting up this analysis to see insights.`;
    }
  })();

  return {
    funnel: isFunnel
      ? {
          paths:
            pathsFunnel !== undefined && pathsRange !== undefined
              ? {
                  funnel: pathsFunnel,
                  range: pathsRange,
                  paths,
                  focusId: pathsFocusId,
                  onChangeRange: setChosenPathsRange,
                }
              : undefined,
        }
      : undefined,
    paths: isPaths ? { steps: pathSteps } : undefined,
    cohorts: isCohorts
      ? {
          series: cohortsSeries,
          isLoading: cohortTable.isLoading,
          error: cohortTable.error,
        }
      : undefined,
    insights: { insights, focus: insightsFocus, idleLabel: insightsIdleLabel },
    getClickActions,
  };
};
