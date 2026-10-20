import { useCallback, useMemo, useState } from "react";

import type { ClickAction, ClickObject } from "metabase/visualizations/types";
import type {
  ConcreteTableId,
  SingleSeries,
  UnsavedCard,
} from "metabase-types/api";

import type { AnalysisContext } from "../analyses/types";
import type { BaseQueryInput } from "../base-query";
import {
  getRetentionCurvesData,
  getRetentionCurvesSettings,
} from "../cohorts/retention-curves";
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
import {
  getClickedStep,
  getClickedTransition,
} from "../insights/clicked-transition";
import {
  type FunnelInsights,
  useFunnelInsights,
} from "../insights/use-funnel-insights";
import { type PathSteps, usePathSteps } from "../path-steps/use-path-steps";
import type { AnalysisSpec, FunnelSpec } from "../spec/types";
import { periodOf } from "../sql/analyses/cohorts";
import type { FunnelPathsRange } from "../sql/analyses/funnel-paths";
import type { AnalysisQueryResult } from "../use-analysis-query";

import { getShowInsightsAction, getShowPathsAction } from "./click-actions";

type UseSupportingAnalysesArgs = {
  spec: AnalysisSpec | undefined;
  tableId: ConcreteTableId | undefined;
  /** Must keep its identity while unchanged. */
  base: BaseQueryInput;
  context: AnalysisContext;
  /** The primary query, for supporting charts that re-read its result. */
  query: AnalysisQueryResult;
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

export type FunnelInsightsSupport = {
  insights: FunnelInsights;
  focus: InsightsFocus | undefined;
};

/** The supporting analyses a funnel shows below its chart. */
export type FunnelSupport = {
  /** Undefined when the funnel has no paths to show, e.g. unordered steps. */
  paths: FunnelPathsSupport | undefined;
  insights: FunnelInsightsSupport;
};

/** The retention curves below the cohort table, from the table's own result. */
export type CohortsSupport = {
  /** The line chart, once the cohort query's result is in. */
  series: SingleSeries<UnsavedCard> | undefined;
  isLoading: boolean;
  error: string | undefined;
};

export type SupportingAnalyses = {
  /** Set while the analysis is a funnel. */
  funnel: FunnelSupport | undefined;
  /** Set while the analysis is paths: the steps across them. */
  paths: PathSteps | undefined;
  /** Set while the analysis is cohorts. */
  cohorts: CohortsSupport | undefined;
  /** The chart click actions that lead to a supporting analysis. */
  getClickActions: (clicked: ClickObject) => ClickAction[];
};

/**
 * The supporting analyses below an analysis's primary chart, and the chart
 * click actions that bring one of them into view. Each kind of analysis
 * contributes its own: a funnel shows the paths between its steps and the
 * insights into who converts, paths show their steps' entrances and exits,
 * and cohorts show their retention curves.
 */
export const useSupportingAnalyses = ({
  spec,
  tableId,
  base,
  context,
  query,
}: UseSupportingAnalysesArgs): SupportingAnalyses => {
  const isFunnel = spec?.kind === "funnel";
  const isCohorts = spec?.kind === "cohorts";
  const isPaths = spec?.kind === "paths";

  const { dataset, datasetQuery } = query;
  const cohortsSeries = useMemo((): SingleSeries<UnsavedCard> | undefined => {
    if (
      spec?.kind !== "cohorts" ||
      dataset?.data === undefined ||
      datasetQuery === undefined
    ) {
      return undefined;
    }
    return {
      card: {
        display: "line",
        dataset_query: datasetQuery,
        visualization_settings: getRetentionCurvesSettings(spec),
      },
      data: getRetentionCurvesData(dataset.data, periodOf(spec)),
    };
  }, [spec, dataset, datasetQuery]);

  const insights = useFunnelInsights({ spec, tableId, base, context });
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
              getShowInsightsAction(() =>
                setInsightsFocus((focus) => ({
                  transition,
                  id: (focus?.id ?? 0) + 1,
                })),
              ),
            ]
          : []),
      ];
    },
    [spec, pathsFunnel, insights.state],
  );

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
          insights: { insights, focus: insightsFocus },
        }
      : undefined,
    paths: isPaths ? pathSteps : undefined,
    cohorts: isCohorts
      ? {
          series: cohortsSeries,
          isLoading: query.isLoading,
          error: query.error,
        }
      : undefined,
    getClickActions,
  };
};
