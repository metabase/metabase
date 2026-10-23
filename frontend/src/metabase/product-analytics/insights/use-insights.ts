import { useMemo } from "react";
import _ from "underscore";

import { skipToken, useGetAdhocQueryQuery } from "metabase/api";
import { useMetadataProvider } from "metabase/metadata-store";
import * as Lib from "metabase-lib";
import type { ConcreteTableId, Dataset } from "metabase-types/api";

import type { AnalysisContext } from "../analyses/types";
import type { BaseQueryInput } from "../base-query";
import { buildSql } from "../build-sql";
import { getEventFilterColumns } from "../events/filter-columns";
import type { SegmentDraft } from "../segments/types";
import { usePaletteSegments } from "../segments/use-palette-segments";
import type { AnalysisSpec } from "../spec/types";
import { type InsightsQuery, planInsights } from "../sql/analyses/insights";
import { type Cte, orderCtes } from "../sql/compose";
import {
  getDatasetError,
  toNativeDatasetQuery,
  useCompiledBase,
} from "../use-analysis-query";
import { useStableValue } from "../use-stable-value";

import { getInsightAttributes } from "./candidates";
import { indexCounts } from "./counts";
import { getEventAttributes } from "./event-candidates";
import { DEFAULT_INSIGHT_OPTIONS } from "./options";
import { planPairs } from "./plan-pairs";
import { parseCountRows, parseQuestionLabels } from "./rows";
import { findInsights } from "./search";
import type {
  GroupCounts,
  Insight,
  InsightAttribute,
  InsightQuestion,
  InsightsAnalysis,
} from "./types";

const NO_DRAFTS: SegmentDraft[] = [];

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
      /** Pairs of attributes are still being counted. */
      isFindingPairs: boolean;
      /** Single-attribute insights are still shown when pairs fail. */
      pairsError: string | undefined;
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
  const attributeKind = analysis?.attributeKind;
  const eventSegments = usePaletteSegments(
    attributeKind === "event" ? tableId : undefined,
    "event",
    NO_DRAFTS,
  );

  const attributes = useMemo((): InsightAttribute[] => {
    if (!isActive) {
      return [];
    }
    if (attributeKind === "event") {
      const tableMetadata =
        tableId !== undefined
          ? Lib.tableOrCardMetadata(metadataProvider, tableId)
          : null;
      return tableMetadata !== null
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
    }
    const stepColumns = new Set(
      base.events.flatMap(({ event }) =>
        getEventFilterColumns(metadataProvider, event),
      ),
    );
    return getInsightAttributes({ context, roles: base.columns, stepColumns });
  }, [
    isActive,
    attributeKind,
    tableId,
    eventSegments.saved,
    metadataProvider,
    base,
    context,
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
  // The analysis's CTEs and the population's, over the base with the
  // attribute columns, for Metabot's own queries. Later definitions win, so
  // the population's versions of shared blocks replace the analysis's.
  const population = useMemo(
    () =>
      activeSpec !== undefined
        ? analysis?.getPopulation(activeSpec, attributes)
        : undefined,
    [activeSpec, analysis, attributes],
  );
  const ctes = useMemo((): Cte[] | undefined => {
    if (
      activeSpec === undefined ||
      population === undefined ||
      compiled === undefined
    ) {
      return undefined;
    }
    const analysisCtes = buildSql(
      activeSpec,
      compiled.sql,
      compiled.columns,
    ).ctes;
    return orderCtes([...analysisCtes, ...population.ctes]);
  }, [activeSpec, population, compiled]);

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

  const searchesPairs = analysis?.searchesPairs ?? false;
  const pairValues = useMemo(
    () =>
      singleRows !== undefined && searchesPairs
        ? planPairs(
            indexCounts({ rows: singleRows, singleAttributes: attributeIds }),
            attributeIds,
          )
        : undefined,
    [singleRows, attributeIds, searchesPairs],
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
    () => (counts !== undefined ? findInsights(counts) : undefined),
    [counts],
  );

  const state = ((): InsightsState => {
    if (activeSpec === undefined || analysis === undefined) {
      return { status: "idle" };
    }
    const isLoadingSegments =
      attributeKind === "event" && eventSegments.isLoading;
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
      isFindingPairs: pairsQuery !== undefined && pairs.isFetching,
      pairsError: pairsQuery !== undefined ? getDatasetError(pairs) : undefined,
    };
  })();

  return {
    state,
    outcome,
    ctes,
    /** The CTE with one row per actor per question. */
    populationSource: population?.source,
    databaseId: compiled?.databaseId,
  };
};

export type Insights = ReturnType<typeof useInsights>;
