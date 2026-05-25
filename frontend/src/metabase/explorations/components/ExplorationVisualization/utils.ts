import { t } from "ttag";

import { TIMELINE_INTERESTINGNESS_SCORE_THRESHOLD } from "metabase/explorations/constants";
import { createSeriesCard } from "metabase/metrics/utils/series";
import { getAccentColors } from "metabase/ui/colors/groups";
import { isCartesianChart } from "metabase/visualizations";
import { getColorplethColorScale } from "metabase/visualizations/components/ChoroplethMap";
import { isCountry, isDate, isState } from "metabase-lib/v1/types/utils/isa";
import type {
  CardDisplayType,
  CardId,
  Dataset,
  DatasetColumn,
  ExplorationDocument,
  ExplorationQuery,
  ExplorationQueryParams,
  ExplorationQueryType,
  ExplorationThread,
  ExplorationThreadMetric,
  RowValue,
  RowValues,
  SingleSeries,
  TimelineId,
  VisualizationSettings,
} from "metabase-types/api";

interface BuildSeriesGroupsParams {
  queries: ExplorationQuery[];
  datasets: Dataset[];
  metricsById: Map<CardId, ExplorationThreadMetric>;
  queryColors: Record<string, string>;
}

interface SeriesGroup {
  series: SingleSeries[];
  queryType: ExplorationQueryType;
  isTimeseries: boolean;
  stackCount?: number;
  chartLabel?: string;
  /**
   * Variant-specific params from the BE plan row (e.g. `k` for
   * `top-n-other`). All queries in a group share the same params shape
   * upstream, so we copy off the first one in `buildSeries`.
   */
  params?: ExplorationQueryParams | null;
}

/**
 * Per-group chart title used by the labeled layout strategies. Falls back
 * to the static `QUERY_TYPE_TO_LABEL_MAP`, with a dynamic case for
 * `top-n-other` so the title reflects the actual `k` from the query plan.
 */
function getChartLabel(group: SeriesGroup): string | null {
  if (group.queryType === "top-n-other") {
    const k = group.params?.k;
    return typeof k === "number" ? t`Top ${k}` : null;
  }
  return QUERY_TYPE_TO_LABEL_MAP[group.queryType]?.() ?? null;
}

const SHOULD_STACK_CUTOFF = 8;

const QUERY_TYPE_TO_LABEL_MAP: Record<
  ExplorationQueryType,
  () => string | null
> = {
  ["default"]: () => null,
  ["top-n-other"]: () => null,
  ["temporal-pattern-day"]: () => t`Day of week`,
  ["temporal-pattern-hour"]: () => t`Hour of day`,
  ["time-facet"]: () => t`Over time`,
  ["filtered-subset"]: () => null,
  ["per-value-time-series"]: () => null,
};

export function buildSeriesGroups({
  queries,
  datasets,
  ...rest
}: BuildSeriesGroupsParams): {
  seriesGroups: SeriesGroup[];
  layoutStrategy: ChartLayout;
} {
  const queriesWithDatasetGroups = groupQueriesWithDatasets({
    queries,
    datasets,
  });
  const seriesGroups = queriesWithDatasetGroups.map((queriesWithDatasets) =>
    buildSeries({ ...rest, queriesWithDatasets }),
  );

  const layoutStrategy = getChartsGroupLayoutStrategy(seriesGroups);

  if (
    layoutStrategy === "two-small-charts-down" ||
    layoutStrategy === "two-small-tables-down"
  ) {
    seriesGroups[0].series = removeAxisTitlesFromAllSeries(
      seriesGroups[0].series,
    );

    const bottomLeftChartLabel = getChartLabel(seriesGroups[1]);
    if (bottomLeftChartLabel) {
      seriesGroups[1].chartLabel = bottomLeftChartLabel;
    }

    const bottomRightChartLabel = getChartLabel(seriesGroups[2]);
    if (bottomRightChartLabel) {
      seriesGroups[2].chartLabel = bottomRightChartLabel;
    }
  }

  if (layoutStrategy === "two-same-size-charts-vertically") {
    seriesGroups[0].series = removeAxisTitlesFromAllSeries(
      seriesGroups[0].series,
    );
    seriesGroups[1].series = removeAxisTitlesFromAllSeries(
      seriesGroups[1].series,
    );

    const bottomChartLabel = getChartLabel(seriesGroups[1]);
    if (bottomChartLabel) {
      seriesGroups[1].chartLabel = bottomChartLabel;
    }
  }

  return { seriesGroups, layoutStrategy };
}

function removeAxisTitlesFromAllSeries(series: SingleSeries[]) {
  return series.map((series) => ({
    ...series,
    card: {
      ...series.card,
      visualization_settings: {
        ...series.card.visualization_settings,
        "graph.x_axis.title_text": "",
        "graph.y_axis.title_text": "",
      },
    },
  }));
}

interface ExplorationQueryWithDataset extends ExplorationQuery {
  dataset: Dataset;
}

function groupQueriesWithDatasets({
  queries,
  datasets,
}: Pick<
  BuildSeriesGroupsParams,
  "queries" | "datasets"
>): ExplorationQueryWithDataset[][] {
  const groups: Record<string, ExplorationQueryWithDataset[]> = {};
  queries.forEach((query, i) => {
    const key = `${query.dimension_id}-${query.query_type}`;
    let group = groups[key];
    if (!group) {
      group = [];
      groups[key] = group;
    }
    group.push({ ...query, dataset: datasets[i] });
  });
  return Object.values(groups);
}

type BuildSeriesParams = Omit<
  BuildSeriesGroupsParams,
  "queries" | "datasets"
> & {
  queriesWithDatasets: ExplorationQueryWithDataset[];
};

export function buildSeries({
  queriesWithDatasets,
  metricsById,
  queryColors,
}: BuildSeriesParams): SeriesGroup {
  let isTimeseries = false;
  let stackCount: number | undefined;

  const series = queriesWithDatasets.map((queryWithDataset) => {
    const { dataset, ...query } = queryWithDataset;

    const queriesWithSegments = queriesWithDatasets.filter(
      (query) => query.segment_id != null,
    );

    const {
      display,
      settings,
      isTimeseries: isTimeseriesForQuery,
      stackCount: stackCountForQuery,
    } = getDisplay(
      queryWithDataset,
      queriesWithDatasets.length,
      queriesWithSegments.length,
    );
    isTimeseries = isTimeseries || Boolean(isTimeseriesForQuery);
    // this works because we should always get the same stackCount for all queries in a group
    // but that's only because we don't run queries for segments and breakouts at the same time
    // so this is somewhat fragile and will need to be revisited if we ever support that
    stackCount = stackCountForQuery;
    const isCartesian = isCartesianChart(display);
    const cardSettings: VisualizationSettings = { ...settings };
    if (isCartesian) {
      cardSettings["graph.y_axis.title_text"] = metricsById.get(
        query.card_id,
      )?.card?.name;
    } else if (display === "map") {
      const color = queryColors[String(query.id)];
      if (color) {
        cardSettings["map.colors"] = getColorplethColorScale(color);
      }
    }
    const card = createSeriesCard(
      query.id,
      query.name,
      display,
      cardSettings,
      query.dataset_query,
    );
    return { card, data: dataset.data };
  });

  return {
    series,
    isTimeseries,
    stackCount,
    queryType: queriesWithDatasets[0]?.query_type || "default",
    params: queriesWithDatasets[0]?.params,
  };
}

interface GetDisplayResult {
  display: CardDisplayType;
  settings?: VisualizationSettings;
  stackCount?: number;
  isTimeseries?: boolean;
}

const MIN_SEGMENTS_TO_SHOW_HEATMAP = 4;

function getDisplay(
  queryWithDataset: ExplorationQueryWithDataset,
  numQueries: number,
  numSegmentQueries: number,
): GetDisplayResult {
  const { cols, rows } = queryWithDataset.dataset.data;
  const isTimeseries = cols.some(isDate);

  if (cols.length === 3 && isTimeseries) {
    // The second column is the date column and should be the x-axis;
    // the first column is the breakout. Provide the dimensions explicitly,
    // otherwise viz settings might swap them based on cardinality.
    const dimensions = [cols[1]?.name, cols[0]?.name].filter(
      (name): name is string => typeof name === "string",
    );

    // here, we use the number of unique breakout values to determine whether to stack
    let shouldStack = true;
    const breakoutValues = new Set<RowValue>();
    for (const row of rows) {
      breakoutValues.add(row[0]);
      if (breakoutValues.size > SHOULD_STACK_CUTOFF) {
        shouldStack = false;
        break;
      }
    }
    return {
      display: "line",
      settings: {
        "graph.dimensions": dimensions,
        "graph.split_panels": shouldStack,
      },
      stackCount: shouldStack ? breakoutValues.size : undefined,
      isTimeseries,
    };
  }

  if (isTimeseries) {
    // here we use the number of queries (i.e. number of segments) to determine whether to stack
    const shouldStack = numQueries <= SHOULD_STACK_CUTOFF;
    return {
      display: "line",
      settings: {
        "graph.split_panels": shouldStack,
      },
      stackCount: shouldStack ? numQueries : undefined,
      isTimeseries,
    };
  }

  if (cols.length === 2 && isState(cols[0])) {
    return {
      display: "map",
      settings: { "map.type": "region", "map.region": "us_states" },
    };
  }

  if (cols.length === 2 && isCountry(cols[0])) {
    return {
      display: "map",
      settings: { "map.type": "region", "map.region": "world_countries" },
    };
  }

  // if we have multiple queries (segments), show a heat map rather than a bar chart
  if (numSegmentQueries >= MIN_SEGMENTS_TO_SHOW_HEATMAP) {
    return { display: "table" };
  }
  return { display: "bar" };
}

interface GetHeatMapSeriesParams {
  series: SingleSeries[];
}

/**
 * Recovers the segment name from a segment-filtered query's name.
 *
 * The query plan names each segmented query `"<base> (<segment>)"` — see
 * `with-segment-suffix` in `metabase.explorations.query-plan.variants`. Every
 * series in a heat-map group shares the same `<base>` (the unsegmented
 * baseline's name), so the bare segment name is what remains once that prefix
 * is stripped. Falls back to the full name when it doesn't match the shape.
 */
function getSegmentName(seriesName: string, baseName: string): string {
  const prefix = `${baseName} (`;
  if (
    baseName.length > 0 &&
    seriesName.startsWith(prefix) &&
    seriesName.endsWith(")")
  ) {
    return seriesName.slice(prefix.length, -1);
  }
  return seriesName;
}

// the Table viz only supports one series, so we have to combine them
export function getHeatMapSeries({
  series,
}: GetHeatMapSeriesParams): SingleSeries {
  const { card, data } = series[0];
  const segmentCol: DatasetColumn = {
    name: "Segment",
    display_name: "Segment",
    source: "breakout",
  };
  const cols = [...data.cols, segmentCol];
  const rows: RowValues[] = [];
  let minValue: number | undefined;
  let maxValue: number | undefined;
  series.forEach((s, i) => {
    // The unsegmented baseline query is always first; the rest are
    // segment-filtered variants of it.
    const segmentName =
      i === 0 ? t`(All)` : getSegmentName(s.card.name, card.name);
    for (const row of s.data.rows) {
      rows.push([...row, segmentName]);
      const value = row[1];
      if (typeof value !== "number") {
        continue;
      }
      if (minValue == null || value < minValue) {
        minValue = value;
      }
      if (maxValue == null || value > maxValue) {
        maxValue = value;
      }
    }
  });
  const settings: VisualizationSettings = {
    "table.columns": cols.map((col) => ({
      name: col.name,
      enabled: true,
    })),
    "table.pivot": true,
    "table.pivot_column": cols[0].name,
    "table.cell_column": cols[1].name,
    "table.column_formatting": [
      {
        columns: [cols[1].name],
        type: "range",
        colors: ["transparent", getAccentColors()[0]],
        min_type: null,
        max_type: null,
        min_value: minValue,
        max_value: maxValue,
      },
    ],
  };
  return {
    card: {
      ...card,
      visualization_settings: {
        ...card.visualization_settings,
        ...settings,
      },
    },
    data: {
      ...data,
      cols,
      rows,
    },
  };
}

/**
 * Aggregates `timeline_interestingness` across queries by taking the max
 * score per timeline. Used by group pages so a timeline counts as
 * interesting if any sub-query finds it interesting.
 *
 * Queries without `timeline_interestingness` (BE may omit the field) and
 * entries with `null` scores are ignored.
 */
export function getMaxTimelineInterestingness(
  queries: ExplorationQuery[],
): Map<TimelineId, number> {
  const map = new Map<TimelineId, number>();
  for (const q of queries) {
    for (const e of q.timeline_interestingness ?? []) {
      if (e.interestingness_score == null) {
        continue;
      }
      const prev = map.get(e.timeline_id);
      if (prev == null || e.interestingness_score > prev) {
        map.set(e.timeline_id, e.interestingness_score);
      }
    }
  }
  return map;
}

/**
 * Set of timeline ids whose max-aggregated score across `queries` passes
 * the global interestingness threshold (see `metabase/explorations/constants`).
 * Used by `TimelineDropdown` to decide which items get the
 * `PotentiallyInterestingMarker`.
 */
export function getInterestingTimelineIds(
  queries: ExplorationQuery[],
): ReadonlySet<TimelineId> {
  const result = new Set<TimelineId>();
  for (const [id, score] of getMaxTimelineInterestingness(queries)) {
    if (score >= TIMELINE_INTERESTINGNESS_SCORE_THRESHOLD) {
      result.add(id);
    }
  }
  return result;
}

/**
 * Picks the most-interesting timeline for `queries` restricted to the
 * timelines actually available in the dropdown. Returns `null` when no
 * candidate passes the threshold or when no scored timeline is available.
 *
 * Drives the auto-default selection on threads where the user hasn't
 * manually picked a timeline yet.
 */
export function getMostInterestingTimelineId(
  queries: ExplorationQuery[],
  availableTimelineIds: ReadonlySet<TimelineId>,
): TimelineId | null {
  if (availableTimelineIds.size === 1) {
    const id = availableTimelineIds.values().next().value;
    if (id) {
      return id;
    }
  }

  let best: { id: TimelineId; score: number } | null = null;
  for (const [id, score] of getMaxTimelineInterestingness(queries)) {
    if (!availableTimelineIds.has(id)) {
      continue;
    }
    if (score < TIMELINE_INTERESTINGNESS_SCORE_THRESHOLD) {
      continue;
    }
    if (best == null || score > best.score) {
      best = { id, score };
    }
  }
  return best?.id ?? null;
}

export function getDocumentsForDocumentMenu(
  explorationThread: ExplorationThread,
): ExplorationDocument[] {
  return (explorationThread.documents ?? []).filter(
    (d) => d.id !== explorationThread.ai_summary_document_id,
  );
}

// Pre-defined chart layouts; the value drives the `data-chart-layout` attribute
// the grid CSS keys off. New layouts are added here and in the CSS module - ./ExplorationVisualization.module.css
export type ChartLayout =
  | "default"
  | "two-small-charts-down"
  | "two-small-tables-down"
  | "two-same-size-charts-vertically";

export const getChartsGroupLayoutStrategy = (
  seriesGroups: SeriesGroup[],
): ChartLayout => {
  const isTwoSmallChartsDownStrategy =
    seriesGroups.length === 3 &&
    seriesGroups[1].queryType === "temporal-pattern-day" &&
    seriesGroups[2].queryType === "temporal-pattern-hour";

  if (isTwoSmallChartsDownStrategy) {
    const bottomChartsAreTables =
      isTwoSmallChartsDownStrategy &&
      seriesGroups[1].series[0].card.display === "table" &&
      seriesGroups[2].series[0].card.display === "table";

    return bottomChartsAreTables
      ? "two-small-tables-down"
      : "two-small-charts-down";
  }

  const isTwoChartsWithOneSpecial =
    seriesGroups.length === 2 &&
    seriesGroups[0].queryType === "default" &&
    (seriesGroups[1].queryType === "time-facet" ||
      seriesGroups[1].queryType === "top-n-other");

  if (isTwoChartsWithOneSpecial) {
    return "two-same-size-charts-vertically";
  }

  return "default";
};
