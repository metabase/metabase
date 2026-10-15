import { useMemo } from "react";

import { skipToken, useGetAdhocQueryQuery } from "metabase/api";
import { useMetadataProvider } from "metabase/metadata-store";
import type { ConcreteTableId, Dataset, UnsavedCard } from "metabase-types/api";

import type { AnalysisContext } from "../analyses/types";
import type { BaseQueryInput } from "../base-query";
import { buildSql } from "../build-sql";
import { getEventFilterColumns } from "../events/filter-columns";
import type { AnalysisSpec } from "../spec/types";
import {
  type FunnelInsightsQuery,
  planFunnelInsights,
} from "../sql/analyses/funnel-insights";
import {
  getDatasetError,
  toNativeDatasetQuery,
  useCompiledBase,
} from "../use-analysis-query";
import { useStableValue } from "../use-stable-value";

import { getInsightAttributes } from "./candidates";
import { indexCounts } from "./counts";
import { getExploreCard, getExploreSegmentLabel } from "./explore";
import { DEFAULT_INSIGHT_OPTIONS } from "./options";
import { planPairs } from "./plan-pairs";
import { parseCountRows } from "./rows";
import { findInsights } from "./search";
import type { GroupCounts, Insight, InsightAttribute } from "./types";

export type FunnelTransition = {
  /** Step k → step k+1, numbered from 1. */
  transition: number;
  from: string;
  to: string;
  reached: number;
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
    .flatMap(({ transition, reached }) => {
      const from = steps[transition - 1];
      const to = steps[transition];
      return from !== undefined && to !== undefined
        ? [{ transition, from: from.label, to: to.label, reached }]
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
    isReady: isFunnel && attributes.length > 0,
    tableId,
    base: insightsBase,
  });
  const { compiled } = compiledBase;

  const toQuery = (query: FunnelInsightsQuery, maxRows?: number) =>
    spec !== undefined && compiled !== undefined
      ? toNativeDatasetQuery(
          buildSql(
            spec,
            compiled.sql,
            compiled.columns,
            planFunnelInsights(spec, query),
          ).sql,
          compiled.databaseId,
          maxRows,
        )
      : undefined;

  const singlesQuery =
    isFunnel && attributeIds.length > 0
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

  const insights = useMemo(
    () =>
      singleRows !== undefined
        ? findInsights(
            indexCounts({
              rows: [...singleRows, ...(pairRows ?? [])],
              singleAttributes: attributeIds,
              pairValues,
            }),
          )
        : undefined,
    [singleRows, pairRows, attributeIds, pairValues],
  );

  const getExploreCardFor = (insight: Insight): UnsavedCard | undefined => {
    const insightAttributes = insight.conditions.flatMap(
      ({ attributeId }) =>
        attributes.find(({ id }) => id === attributeId) ?? [],
    );
    const datasetQuery = toQuery({
      kind: "explore",
      transition: insight.transition,
      attributes: insightAttributes.map(({ id }) => id),
      segmentLabel: getExploreSegmentLabel(insightAttributes),
    });
    return datasetQuery !== undefined
      ? getExploreCard(datasetQuery, insightAttributes)
      : undefined;
  };

  const state = ((): FunnelInsightsState => {
    if (!isFunnel || spec === undefined) {
      return { status: "idle" };
    }
    if (context.table === undefined) {
      return { status: "loading" };
    }
    if (attributes.length === 0) {
      return {
        status: "done",
        insights: [],
        attributes,
        transitions: [],
        isFindingPairs: false,
        pairsError: undefined,
      };
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
    };
  })();

  return { state, getExploreCard: getExploreCardFor };
};
