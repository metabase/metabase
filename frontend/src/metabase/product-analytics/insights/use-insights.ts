import { useMemo } from "react";
import _ from "underscore";

import { skipToken, useGetAdhocQueryQuery } from "metabase/api";
import { useMetadataProvider } from "metabase/metadata-store";
import * as Lib from "metabase-lib";
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
import type { SegmentDraft } from "../segments/types";
import { usePaletteSegments } from "../segments/use-palette-segments";
import type { AnalysisSpec } from "../spec/types";
import { type InsightsQuery, planInsights } from "../sql/analyses/insights";
import {
  getDatasetError,
  toNativeDatasetQuery,
  useCompiledBase,
} from "../use-analysis-query";
import { useStableValue } from "../use-stable-value";

import { getInsightAttributes } from "./candidates";
import { indexCounts } from "./counts";
import { getEventAttributes } from "./event-candidates";
import {
  getExploreCard,
  getExploreData,
  getExploreSegmentLabel,
} from "./explore";
import { DEFAULT_INSIGHT_OPTIONS } from "./options";
import { planOverlapPairs, planPairs } from "./plan-pairs";
import { parseCountRows, parseQuestionLabels } from "./rows";
import { findInsights, findSingleDiscoveries } from "./search";
import {
  getInsightSegments,
  getMinSegmentSize,
  isDescending,
} from "./segments";
import type {
  GroupCounts,
  Insight,
  InsightAttribute,
  InsightAttributeKind,
  InsightQuestion,
  InsightsAnalysis,
} from "./types";

const NO_DRAFTS: SegmentDraft[] = [];
const NO_ATTRIBUTE_KINDS: readonly InsightAttributeKind[] = [];

export type InsightsState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "error"; error: string }
  | {
      status: "done";
      insights: Insight[];
      attributes: InsightAttribute[];
      questions: InsightQuestion[];
      /** How many actors the search looked at. */
      checkedCount: number;
      /** What pairs of attributes are counted for; see `InsightsAnalysis`. */
      pairsFor: InsightsAnalysis["pairs"];
      /** Pairs of attributes are still being searched. */
      isFindingPairs: boolean;
      /** Single-attribute insights are still shown when pairs fail. */
      pairsError: string | undefined;
    };

export type InsightExplore = {
  /** The explore question, to open in the query builder. */
  card: UnsavedCard;
  /** Its result, from the counts the insights came from. */
  series: SingleSeries<UnsavedCard>;
};

type UseInsightsArgs = {
  spec: AnalysisSpec | undefined;
  /** Undefined when the analysis has no insights. */
  analysis: InsightsAnalysis | undefined;
  tableId: ConcreteTableId | undefined;
  /** Must keep its identity while unchanged. */
  base: BaseQueryInput;
  context: AnalysisContext;
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

const parseLabels = (dataset: Dataset | undefined): Map<number, string> =>
  dataset?.data !== undefined && !dataset.error
    ? parseQuestionLabels(
        dataset.data.cols.map(({ name }) => name),
        dataset.data.rows,
      )
    : new Map();

/**
 * Finds what's different about the actors who have an analysis's outcome at
 * each of its questions: counts by single attributes, then by pairs of the
 * most promising ones, and searches them. Single-attribute insights arrive
 * first. Idle while `analysis` is undefined or doesn't apply to the spec.
 */
export const useInsights = ({
  spec,
  analysis,
  tableId,
  base,
  context,
}: UseInsightsArgs) => {
  const activeSpec =
    spec !== undefined && analysis?.appliesTo(spec) ? spec : undefined;
  const isActive = activeSpec !== undefined;
  const outcome =
    activeSpec !== undefined ? analysis?.getOutcome(activeSpec) : undefined;
  const metadataProvider = useMetadataProvider(context.table?.db_id ?? null);
  const attributeKinds = analysis?.attributeKinds ?? NO_ATTRIBUTE_KINDS;
  const comparesByEvents = attributeKinds.includes("event");
  const comparesByColumns = attributeKinds.includes("column");
  const eventSegments = usePaletteSegments(
    comparesByEvents ? tableId : undefined,
    "event",
    NO_DRAFTS,
  );
  const focusColumn = analysis?.getFocusColumn?.(base);

  const attributes = useMemo((): InsightAttribute[] => {
    if (!isActive) {
      return [];
    }
    const tableMetadata =
      comparesByEvents && tableId !== undefined
        ? Lib.tableOrCardMetadata(metadataProvider, tableId)
        : null;
    const events =
      tableMetadata !== null
        ? getEventAttributes({
            segments: eventSegments.saved,
            tableQuery: Lib.queryFromTableOrCardMetadata(
              metadataProvider,
              tableMetadata,
            ),
            metadataProvider,
            excluded: base.events.map(({ event }) => event),
          })
        : [];
    const columns = comparesByColumns
      ? getInsightAttributes({
          context,
          roles: base.columns,
          stepColumns: new Set(
            base.events.flatMap(({ event }) =>
              getEventFilterColumns(metadataProvider, event),
            ),
          ),
          focusColumn,
        })
      : [];
    // Each kind numbers its own from 1, so they're renumbered together.
    return [...columns, ...events].map((attribute, index) => ({
      ...attribute,
      id: `attr_${index + 1}`,
    }));
  }, [
    isActive,
    comparesByEvents,
    comparesByColumns,
    tableId,
    eventSegments.saved,
    metadataProvider,
    base,
    context,
    focusColumn,
  ]);
  const attributeIds = useMemo(
    () => attributes.map(({ id }) => id),
    [attributes],
  );

  const insightsBase = useStableValue<BaseQueryInput>({
    ...base,
    events: [
      ...base.events,
      ..._.uniq(
        attributes.flatMap((attribute) =>
          attribute.kind === "event"
            ? [{ flag: attribute.flag, event: attribute.event }]
            : [],
        ),
        false,
        ({ flag }) => flag,
      ),
    ],
    extraColumns: [
      ...base.extraColumns,
      ...attributes.flatMap((attribute) =>
        attribute.kind === "column"
          ? [
              {
                as: attribute.id,
                column: attribute.column,
                from: attribute.from,
              },
            ]
          : [],
      ),
    ],
  });
  const compiledBase = useCompiledBase({
    isReady: isActive && attributes.length > 0,
    tableId,
    base: insightsBase,
  });
  const { compiled } = compiledBase;

  const toSql = (query: InsightsQuery) => {
    const population =
      activeSpec !== undefined
        ? analysis?.getPopulation(activeSpec, attributes)
        : undefined;
    return activeSpec !== undefined &&
      population !== undefined &&
      compiled !== undefined
      ? buildSql(
          activeSpec,
          compiled.sql,
          compiled.columns,
          planInsights(population, query),
        ).sql
      : undefined;
  };
  const toQuery = (query: InsightsQuery, maxRows?: number) => {
    const sql = toSql(query);
    return sql !== undefined && compiled !== undefined
      ? toNativeDatasetQuery(sql, compiled.databaseId, maxRows)
      : undefined;
  };

  const singlesQuery =
    isActive && attributeIds.length > 0
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
  const labels = useMemo(
    () => parseLabels(singles.currentData),
    [singles.currentData],
  );

  const pairsFor = analysis?.pairs ?? "search";
  const pairValues = useMemo(() => {
    if (singleRows === undefined) {
      return undefined;
    }
    const singlesIndex = indexCounts({
      rows: singleRows,
      singleAttributes: attributeIds,
    });
    return pairsFor === "search"
      ? planPairs(singlesIndex, attributeIds)
      : planOverlapPairs(findSingleDiscoveries(singlesIndex));
  }, [singleRows, attributeIds, pairsFor]);
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

  const counts = useMemo(
    () =>
      singleRows !== undefined
        ? indexCounts({
            rows:
              pairsFor === "search"
                ? [...singleRows, ...(pairRows ?? [])]
                : singleRows,
            overlapRows: pairsFor === "overlaps" ? pairRows : undefined,
            singleAttributes: attributeIds,
            pairValues,
          })
        : undefined,
    [singleRows, pairRows, attributeIds, pairValues, pairsFor],
  );
  const insights = useMemo(
    () => (counts !== undefined ? findInsights(counts) : undefined),
    [counts],
  );

  const getExplore = (insight: Insight): InsightExplore | undefined => {
    const total = counts?.totals.get(insight.question);
    if (
      counts === undefined ||
      total === undefined ||
      compiled === undefined ||
      outcome === undefined
    ) {
      return undefined;
    }
    const insightAttributes = insight.conditions.flatMap(
      ({ attributeId }) =>
        attributes.find(({ id }) => id === attributeId) ?? [],
    );
    const sql = toSql({
      kind: "explore",
      question: insight.question,
      attributes: insightAttributes.map(({ id }) => id),
      segmentLabel: getExploreSegmentLabel(insightAttributes),
      countColumn: outcome.explore.countColumn,
      rateColumn: outcome.explore.rateColumn,
      expectedRateColumn: outcome.explore.expectedRateColumn,
      minSize: getMinSegmentSize(total.reached),
      isDescending: isDescending(insight),
    });
    if (sql === undefined) {
      return undefined;
    }
    const card = getExploreCard(
      toNativeDatasetQuery(sql, compiled.databaseId),
      insightAttributes,
      outcome,
    );
    const segments = getInsightSegments(counts, insight);
    return {
      card,
      series: {
        card,
        data: getExploreData(segments, insightAttributes, sql, outcome),
      },
    };
  };

  const state = ((): InsightsState => {
    if (activeSpec === undefined || analysis === undefined) {
      return { status: "idle" };
    }
    const isLoadingSegments = comparesByEvents && eventSegments.isLoading;
    if (context.table === undefined || isLoadingSegments) {
      return { status: "loading" };
    }
    if (attributes.length === 0) {
      return {
        status: "done",
        insights: [],
        attributes,
        questions: [],
        checkedCount: 0,
        pairsFor,
        isFindingPairs: false,
        pairsError: undefined,
      };
    }
    const error = compiledBase.error ?? getDatasetError(singles);
    if (error !== undefined) {
      return { status: "error", error };
    }
    const isFindingPairs = pairsQuery !== undefined && pairs.isFetching;
    // Overlaps only leave insights out, so they're waited for rather than
    // making insights disappear once they arrive.
    const isFindingOverlaps = pairsFor === "overlaps" && isFindingPairs;
    if (
      singleRows === undefined ||
      insights === undefined ||
      isFindingOverlaps
    ) {
      return { status: "loading" };
    }
    const totals = singleRows.filter(
      ({ conditions }) => conditions.length === 0,
    );
    const questions = analysis.getQuestions(activeSpec, totals, labels);
    return {
      status: "done",
      insights,
      attributes,
      questions,
      checkedCount: analysis.getCheckedCount(questions),
      pairsFor,
      isFindingPairs,
      pairsError: pairsQuery !== undefined ? getDatasetError(pairs) : undefined,
    };
  })();

  return { state, outcome, getExplore };
};

export type Insights = ReturnType<typeof useInsights>;
