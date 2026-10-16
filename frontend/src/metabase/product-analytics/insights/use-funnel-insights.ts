import { useMemo } from "react";
import _ from "underscore";

import { skipToken, useGetAdhocQueryQuery } from "metabase/api";
import { useMetadataProvider } from "metabase/metadata-store";
import type {
  ConcreteTableId,
  Dataset,
  SingleSeries,
  UnsavedCard,
} from "metabase-types/api";

import type { AnalysisContext } from "../analyses/types";
import type { BaseQueryInput } from "../base-query";
import { buildSql } from "../build-sql";
import { getEventFilterColumns } from "../events/filter-columns";
import {
  FUNNEL_PATHS_MAX_NODES,
  FUNNEL_PATHS_STEPS,
} from "../funnel-paths/options";
import { getPathsFunnel, getTransitionRanges } from "../funnel-paths/range";
import { getFunnelPathsVizSettings } from "../funnel-paths/viz-settings";
import type { AnalysisSpec } from "../spec/types";
import {
  type FunnelInsightsQuery,
  planFunnelInsights,
} from "../sql/analyses/funnel-insights";
import { planFunnelPaths } from "../sql/analyses/funnel-paths";
import type { QueryPlan } from "../sql/compose";
import {
  getDatasetError,
  toNativeDatasetQuery,
  useCompiledBase,
} from "../use-analysis-query";
import { useStableValue } from "../use-stable-value";

import { getInsightAttributes } from "./candidates";
import { indexCounts } from "./counts";
import {
  getExploreData,
  getExploreSegmentLabel,
  getSegmentConversionVizSettings,
} from "./explore";
import {
  FIRST_EVENT_ATTRIBUTE_ID,
  isFirstEventInsight,
  parseFunnelPathsResult,
} from "./first-events";
import { DEFAULT_INSIGHT_OPTIONS } from "./options";
import { planPairs } from "./plan-pairs";
import { parseCountRows } from "./rows";
import { findInsights } from "./search";
import {
  getInsightSegments,
  getMinSegmentSize,
  isDescending,
} from "./segments";
import type { GroupCounts, Insight, InsightAttribute } from "./types";

export type FunnelTransition = {
  /** Step k → step k+1, numbered from 1. */
  transition: number;
  from: string;
  to: string;
  reached: number;
  converted: number;
};

export type FunnelInsightsState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "error"; error: string }
  | {
      status: "done";
      insights: Insight[];
      attributes: InsightAttribute[];
      transitions: FunnelTransition[];
      /** Pairs of attributes are still being counted. */
      isFindingPairs: boolean;
      /** Single-attribute insights are still shown when pairs fail. */
      pairsError: string | undefined;
      /** What people did after each step is still being counted. */
      isFindingPaths: boolean;
      /** The other insights are still shown when paths fail. */
      pathsError: string | undefined;
    };

type UseFunnelInsightsArgs = {
  spec: AnalysisSpec | undefined;
  tableId: ConcreteTableId | undefined;
  /** Must keep its identity while unchanged. */
  base: BaseQueryInput;
  context: AnalysisContext;
  /** Nothing is queried until enabled. */
  isEnabled: boolean;
};

const parseDataset = (
  dataset: Dataset | undefined,
  attributeIds: readonly string[],
): GroupCounts[] | undefined =>
  dataset?.data !== undefined && !dataset.error
    ? parseCountRows(
        dataset.data.cols.map(({ name }) => name),
        dataset.data.rows,
        attributeIds,
      )
    : undefined;

const getTransitions = (
  spec: AnalysisSpec,
  rows: readonly GroupCounts[],
): FunnelTransition[] => {
  const steps = spec.funnel?.steps ?? [];
  return rows
    .filter(({ conditions }) => conditions.length === 0)
    .flatMap(({ transition, reached, converted }) => {
      const from = steps[transition - 1];
      const to = steps[transition];
      return from !== undefined && to !== undefined
        ? [{ transition, from: from.label, to: to.label, reached, converted }]
        : [];
    })
    .sort((a, b) => a.transition - b.transition);
};

/**
 * Finds what's different about people who convert at each funnel step:
 * counts by single attributes, then by pairs of the most promising ones, and
 * searches them. Single-attribute insights arrive first.
 */
export const useFunnelInsights = ({
  spec,
  tableId,
  base,
  context,
  isEnabled,
}: UseFunnelInsightsArgs) => {
  const isFunnel = isEnabled && spec?.kind === "funnel";
  const metadataProvider = useMetadataProvider(context.table?.db_id ?? null);

  const attributes = useMemo(() => {
    if (!isFunnel) {
      return [];
    }
    const stepColumns = new Set(
      base.events.flatMap(({ event }) =>
        getEventFilterColumns(metadataProvider, event),
      ),
    );
    return getInsightAttributes({ context, roles: base.columns, stepColumns });
  }, [isFunnel, metadataProvider, base, context]);
  const attributeIds = useMemo(
    () => attributes.map(({ id }) => id),
    [attributes],
  );

  const insightsBase = useStableValue<BaseQueryInput>({
    ...base,
    extraColumns: [
      ...base.extraColumns,
      ...attributes.map(({ id, column, from }) => ({ as: id, column, from })),
    ],
  });
  const compiledBase = useCompiledBase({
    isReady: isFunnel,
    tableId,
    base: insightsBase,
  });
  const { compiled } = compiledBase;

  const toPlannedSql = (planFor: (spec: AnalysisSpec) => QueryPlan) =>
    spec !== undefined && compiled !== undefined
      ? buildSql(spec, compiled.sql, compiled.columns, planFor(spec)).sql
      : undefined;
  const toSql = (query: FunnelInsightsQuery) =>
    toPlannedSql((spec) => planFunnelInsights(spec, query));
  const toDatasetQuery = (sql: string | undefined, maxRows?: number) =>
    sql !== undefined && compiled !== undefined
      ? toNativeDatasetQuery(sql, compiled.databaseId, maxRows)
      : undefined;
  const toQuery = (query: FunnelInsightsQuery, maxRows?: number) =>
    toDatasetQuery(toSql(query), maxRows);

  // With no attributes, this still counts each transition's totals.
  const singlesQuery = isFunnel
    ? toQuery(
        { kind: "singles", attributes: attributeIds },
        DEFAULT_INSIGHT_OPTIONS.pairRowBudget,
      )
    : undefined;
  const singles = useGetAdhocQueryQuery(singlesQuery ?? skipToken);
  const singleRows = useMemo(
    () => parseDataset(singles.currentData, attributeIds),
    [singles.currentData, attributeIds],
  );

  const pairValues = useMemo(
    () =>
      singleRows !== undefined
        ? planPairs(
            indexCounts({ rows: singleRows, singleAttributes: attributeIds }),
            attributeIds,
          )
        : undefined,
    [singleRows, attributeIds],
  );
  const pairsQuery =
    pairValues !== undefined && pairValues.size > 0
      ? toQuery(
          { kind: "pairs", kept: pairValues },
          DEFAULT_INSIGHT_OPTIONS.pairRowBudget,
        )
      : undefined;
  const pairs = useGetAdhocQueryQuery(pairsQuery ?? skipToken);
  const pairRows = useMemo(
    () => parseDataset(pairs.currentData, attributeIds),
    [pairs.currentData, attributeIds],
  );

  const pathsFunnel = isFunnel ? getPathsFunnel(spec) : undefined;
  const transitionRanges = useMemo(
    () =>
      pathsFunnel !== undefined ? getTransitionRanges(pathsFunnel) : undefined,
    [pathsFunnel],
  );
  const pathsQuery =
    transitionRanges !== undefined
      ? toDatasetQuery(
          toPlannedSql((spec) =>
            planFunnelPaths(spec, {
              ranges: transitionRanges,
              steps: FUNNEL_PATHS_STEPS,
              maxNodes: FUNNEL_PATHS_MAX_NODES,
              withFirstEvents: true,
            }),
          ),
          DEFAULT_INSIGHT_OPTIONS.pairRowBudget,
        )
      : undefined;
  const paths = useGetAdhocQueryQuery(pathsQuery ?? skipToken);
  const pathsResult = useMemo(() => {
    const data = paths.currentData?.data;
    return data !== undefined &&
      !paths.currentData?.error &&
      transitionRanges !== undefined
      ? parseFunnelPathsResult(data, transitionRanges)
      : undefined;
  }, [paths.currentData, transitionRanges]);
  // Their own family: the people who did something after the step, not everyone.
  const pathInsights = useMemo(
    () =>
      pathsResult !== undefined
        ? findInsights(
            indexCounts({
              rows: pathsResult.counts,
              singleAttributes: [FIRST_EVENT_ATTRIBUTE_ID],
            }),
          )
        : [],
    [pathsResult],
  );

  const counts = useMemo(
    () =>
      singleRows !== undefined
        ? indexCounts({
            rows: [...singleRows, ...(pairRows ?? [])],
            singleAttributes: attributeIds,
            pairValues,
          })
        : undefined,
    [singleRows, pairRows, attributeIds, pairValues],
  );
  const insights = useMemo(
    () =>
      counts !== undefined
        ? _.sortBy(
            [...findInsights(counts), ...pathInsights],
            (insight) => -Math.abs(insight.excess),
          )
        : undefined,
    [counts, pathInsights],
  );

  const getPathsSeries = (
    transition: number,
  ): SingleSeries<UnsavedCard> | undefined => {
    const chart = pathsResult?.charts.get(transition);
    return chart !== undefined && pathsQuery !== undefined
      ? {
          card: {
            display: "sankey",
            dataset_query: pathsQuery,
            visualization_settings: getFunnelPathsVizSettings(),
          },
          data: chart,
        }
      : undefined;
  };

  /**
   * A chart of the insight from results already fetched: the transition's
   * paths for what people did next, otherwise conversion by each value of the
   * insight's attributes.
   */
  const getExploreSeries = (
    insight: Insight,
  ): SingleSeries<UnsavedCard> | undefined => {
    if (isFirstEventInsight(insight)) {
      return getPathsSeries(insight.transition);
    }
    const total = counts?.totals.get(insight.transition);
    if (counts === undefined || total === undefined || compiled === undefined) {
      return undefined;
    }
    const insightAttributes = insight.conditions.flatMap(
      ({ attributeId }) =>
        attributes.find(({ id }) => id === attributeId) ?? [],
    );
    const segmentLabel = getExploreSegmentLabel(insightAttributes);
    const sql = toSql({
      kind: "explore",
      transition: insight.transition,
      attributes: insightAttributes.map(({ id }) => id),
      segmentLabel,
      minPeople: getMinSegmentSize(total.reached),
      isDescending: isDescending(insight),
    });
    if (sql === undefined) {
      return undefined;
    }
    const card: UnsavedCard = {
      display: "bar",
      dataset_query: toNativeDatasetQuery(sql, compiled.databaseId),
      visualization_settings: getSegmentConversionVizSettings(segmentLabel),
    };
    const segments = getInsightSegments(counts, insight);
    return { card, data: getExploreData(segments, segmentLabel, sql) };
  };

  const state = ((): FunnelInsightsState => {
    if (!isFunnel || spec === undefined) {
      return { status: "idle" };
    }
    if (context.table === undefined) {
      return { status: "loading" };
    }
    const error = compiledBase.error ?? getDatasetError(singles);
    if (error !== undefined) {
      return { status: "error", error };
    }
    if (singleRows === undefined || insights === undefined) {
      return { status: "loading" };
    }
    return {
      status: "done",
      insights,
      attributes,
      transitions: getTransitions(spec, singleRows),
      isFindingPairs: pairsQuery !== undefined && pairs.isFetching,
      pairsError: pairsQuery !== undefined ? getDatasetError(pairs) : undefined,
      isFindingPaths: pathsQuery !== undefined && paths.isFetching,
      pathsError: pathsQuery !== undefined ? getDatasetError(paths) : undefined,
    };
  })();

  return { state, getExploreSeries };
};

export type FunnelInsights = ReturnType<typeof useFunnelInsights>;
