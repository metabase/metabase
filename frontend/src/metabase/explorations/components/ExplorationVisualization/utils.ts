import { msgid, ngettext, t } from "ttag";

import { createSeriesCard } from "metabase/common/utils/series";
import { TIMELINE_INTERESTINGNESS_SCORE_THRESHOLD } from "metabase/explorations/constants";
import { getColorsForValues } from "metabase/ui/colors/charts";
import { getAccentColors } from "metabase/ui/colors/groups";
import { isCartesianChart } from "metabase/visualizations";
import { getColorplethColorScale } from "metabase/visualizations/components/ChoroplethMap";
import {
  formatBreakoutValue,
  getSeriesVizSettingsKey,
} from "metabase/visualizations/echarts/cartesian/model/series";
import { buildColorScale } from "metabase/visualizations/lib/choropleth";
import { getColumnKey } from "metabase-lib/v1/queries/utils/column-key";
import {
  isCountry,
  isDate,
  isNumeric,
  isState,
} from "metabase-lib/v1/types/utils/isa";
import type {
  CardDisplayType,
  Dataset,
  DatasetColumn,
  DimensionId,
  ExplorationDocument,
  ExplorationQuery,
  ExplorationQueryId,
  ExplorationQueryParams,
  ExplorationQueryType,
  ExplorationThread,
  RowValue,
  RowValues,
  SeriesSettings,
  SingleSeries,
  TimelineId,
  VisualizationDisplay,
  VisualizationSettings,
} from "metabase-types/api";

const SHOULD_STACK_CUTOFF = 8;
const MIN_SEGMENTS_TO_SHOW_HEATMAP = 4;
const MIN_ROWS_TO_SHOW_LINE_OR_BAR = 3;

interface BuildSeriesGroupsParams {
  queries: ExplorationQuery[];
  datasets: Dataset[];
  selectedTimelineId: TimelineId | null;
}

export interface LegendItem {
  name: string;
  color: string;
}

export interface SeriesGroup {
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
  legendItems: LegendItem[];
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

const QUERY_TYPE_TO_LABEL_MAP: Record<
  ExplorationQueryType,
  () => string | null
> = {
  ["default"]: () => null,
  ["top-n-other"]: () => null,
  ["temporal-pattern-day"]: () => t`Day of week`,
  // Hour of day is pluralized on the backend, so we need to pluralize it here
  // otherwise building the translation files will fail
  ["temporal-pattern-hour"]: () =>
    ngettext(msgid`Hour of day`, `Hours of day`, 1),
  ["time-facet"]: () => t`Over time`,
  ["filtered-subset"]: () => null,
  ["per-value-time-series"]: () => null,
};

interface CategoryColors {
  barColorByRawString: Record<string, string>;
  overtimeOrder: string[];
}

function getCategoryColumn(
  dataset: Dataset,
): { col: DatasetColumn; index: number } | null {
  const cols = dataset.data.cols;
  const first = cols[0];
  if (cols.length < 2 || first == null || isDate(first)) {
    return null;
  }
  return { col: first, index: 0 };
}

/**
 * Query types that participate in category-color matching: the regular category
 * bar (`default`) and its "Over time" companion (`time-facet`). Special charts —
 * day-of-week, hour-of-day, top-N, etc. — are deliberately excluded; their bars
 * keep the default single color rather than being painted per category.
 */
const CATEGORY_COLOR_QUERY_TYPES = new Set<ExplorationQueryType>([
  "default",
  "time-facet",
]);

function distinctCategoryRawValues(
  query: ExplorationQueryWithDataset,
): RowValue[] {
  const category = getCategoryColumn(query.dataset);
  if (!category) {
    return [];
  }
  const seen = new Set<string>();
  const values: RowValue[] = [];
  for (const row of query.dataset.data.rows) {
    const value = row[category.index];
    if (!seen.has(String(value))) {
      seen.add(String(value));
      values.push(value);
    }
  }
  return values;
}

/**
 * Compute one canonical color/order assignment per dimension from the leaf's
 * single-query `default` (bar) and `time-facet` (over-time) groups. The bar is
 * the order authority; categories are linked to the over-time line by raw value
 * so the line's baked keys come from its OWN column (and therefore match its
 * series models) while still following the bar's order. Multi-query (segment)
 * groups are colored by their own segment logic and are skipped here.
 */
function computeCategoryColorsByDimension(
  groups: ExplorationQueryWithDataset[][],
): Map<DimensionId, CategoryColors> {
  const byDimensionQueryMap = new Map<
    DimensionId,
    { bar?: ExplorationQueryWithDataset; line?: ExplorationQueryWithDataset }
  >();
  for (const group of groups) {
    const query = group[0];
    if (
      !query ||
      !CATEGORY_COLOR_QUERY_TYPES.has(query.query_type) ||
      !getCategoryColumn(query.dataset)
    ) {
      continue;
    }
    const entry = byDimensionQueryMap.get(query.dimension_id) ?? {};
    if (query.query_type === "default" && !entry.bar) {
      entry.bar = query;
    } else if (query.query_type === "time-facet" && !entry.line) {
      entry.line = query;
    }
    byDimensionQueryMap.set(query.dimension_id, entry);
  }

  const result = new Map<string, CategoryColors>();
  for (const [dimensionId, { bar, line }] of byDimensionQueryMap) {
    const orderQuery = bar ?? line;
    if (!orderQuery) {
      continue;
    }
    const orderCol = getCategoryColumn(orderQuery.dataset)?.col;
    const shouldColorBars = !isNumeric(orderCol) || line != null; // We don't want to apply custom colors to a standalone numeric/binned bar
    if (!orderCol || !shouldColorBars) {
      continue;
    }

    const orderedRaw = distinctCategoryRawValues(orderQuery);
    if (isNumeric(orderCol)) {
      orderedRaw.sort((a, b) => Number(a) - Number(b));
    }
    const orderedFormatted = orderedRaw.map((v) =>
      formatBreakoutValue(v, orderCol),
    );

    const colorByFormatted = getColorsForValues(orderedFormatted);
    const barColorByRawString: Record<string, string> = {};

    orderedRaw.forEach((raw, i) => {
      const color = colorByFormatted[orderedFormatted[i]];
      if (color != null) {
        barColorByRawString[String(raw)] = color;
        // Alias by the bar's formatted value too, in case the x-axis holds it.
        barColorByRawString[orderedFormatted[i]] = color;
      }
    });

    let overtimeOrder: string[] = [];
    if (line) {
      const lineCol = getCategoryColumn(line.dataset)?.col;
      if (!lineCol) {
        continue;
      }

      overtimeOrder = [...orderedFormatted];
    }

    result.set(dimensionId, {
      barColorByRawString,
      overtimeOrder,
    });
  }
  return result;
}

function seriesSettingsFromColors(
  byFormatted: Record<string, string>,
): Record<string, SeriesSettings> {
  const settings: Record<string, SeriesSettings> = {};
  for (const [value, color] of Object.entries(byFormatted)) {
    settings[value] = { color };
  }
  return settings;
}

function numericMetricValues(query: ExplorationQueryWithDataset): number[] {
  const metricIndex = query.dataset.data.cols.length - 1;
  return query.dataset.data.rows
    .map((row) => row[metricIndex])
    .filter((v): v is number => typeof v === "number");
}

function computeGeoTopNColorsByDimension(
  groups: ExplorationQueryWithDataset[][],
): Map<DimensionId, Record<string, string>> {
  const geoByDimension = new Map<DimensionId, ExplorationQueryWithDataset>();
  const topNByDimension = new Map<DimensionId, ExplorationQueryWithDataset>();
  for (const group of groups) {
    const query = group.length === 1 ? group[0] : undefined;
    const category = query && getCategoryColumn(query.dataset);
    if (!query || !category) {
      continue;
    }
    if (
      query.query_type === "default" &&
      (isState(category.col) || isCountry(category.col))
    ) {
      geoByDimension.set(query.dimension_id, query);
    } else if (query.query_type === "top-n-other") {
      topNByDimension.set(query.dimension_id, query);
    }
  }

  const result = new Map<DimensionId, Record<string, string>>();
  for (const [dimensionId, geoQuery] of geoByDimension) {
    const topNQuery = topNByDimension.get(dimensionId);
    if (!topNQuery) {
      continue;
    }
    const domain = Array.from(new Set(numericMetricValues(geoQuery)));
    if (domain.length === 0) {
      continue;
    }
    // Reproduce the map's ramp: a choropleth scale seeded by the single-series
    // "(All)" color — the same input `buildSeries` feeds the region map.
    const baseColor = getColorsForValues([t`(All)`])[t`(All)`];
    const { colorScale } = buildColorScale(
      domain,
      getColorplethColorScale(baseColor),
    );
    const categoryCol = getCategoryColumn(topNQuery.dataset);
    if (!categoryCol) {
      continue;
    }
    const categoryIndex = categoryCol.index;
    const metricIndex = topNQuery.dataset.data.cols.length - 1;
    const colors: Record<string, string> = {};
    for (const row of topNQuery.dataset.data.rows) {
      const value = row[metricIndex];
      if (typeof value === "number") {
        colors[String(row[categoryIndex])] = colorScale(value);
      }
    }
    result.set(dimensionId, colors);
  }
  return result;
}

export function buildSeriesGroups({
  queries,
  datasets,
  ...rest
}: BuildSeriesGroupsParams): {
  seriesGroups: SeriesGroup[];
  layoutStrategy: ChartLayout;
  chartsForDocumentEmbed: ExplorationChartForDocumentEmbed[];
} {
  const queriesWithDatasetGroups = groupQueriesWithDatasets({
    queries,
    datasets,
  });

  const categoryColorsByDimension = computeCategoryColorsByDimension(
    queriesWithDatasetGroups,
  );
  const geoTopNColorsByDimension = computeGeoTopNColorsByDimension(
    queriesWithDatasetGroups,
  );

  const seriesGroups = queriesWithDatasetGroups
    .map((queriesWithDatasets) => {
      const dimensionId = queriesWithDatasets[0]?.dimension_id ?? "";
      return buildSeriesGroup({
        ...rest,
        queriesWithDatasets,
        categoryColors: categoryColorsByDimension.get(dimensionId),
        topNBarColors: geoTopNColorsByDimension.get(dimensionId),
      });
    })
    .filter((group) => group.series.length > 0);

  const layoutStrategy = getChartsGroupLayoutStrategy(seriesGroups);

  if (
    layoutStrategy === "two-small-charts-down" ||
    layoutStrategy === "two-small-tables-down"
  ) {
    const bottomLeftChartLabel = getChartLabel(seriesGroups[1]);
    if (bottomLeftChartLabel) {
      seriesGroups[1].chartLabel = bottomLeftChartLabel;
    }

    const bottomRightChartLabel = getChartLabel(seriesGroups[2]);
    if (bottomRightChartLabel) {
      seriesGroups[2].chartLabel = bottomRightChartLabel;
    }
  }

  if (
    layoutStrategy === "two-same-size-charts-vertically" ||
    layoutStrategy === "chart-and-table-vertically"
  ) {
    const bottomChartLabel = getChartLabel(seriesGroups[1]);
    if (bottomChartLabel) {
      seriesGroups[1].chartLabel = bottomChartLabel;
    }
  }

  const chartsForDocumentEmbed = seriesGroups.flatMap((group, i) =>
    composeChartsForGroup(
      group,
      queriesWithDatasetGroups[i].map((q) => q.id),
    ),
  );

  return { seriesGroups, layoutStrategy, chartsForDocumentEmbed };
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
  categoryColors?: CategoryColors;
  topNBarColors?: Record<string, string>;
};

export function buildSeriesGroup({
  queriesWithDatasets,
  selectedTimelineId,
  categoryColors,
  topNBarColors,
}: BuildSeriesParams): SeriesGroup {
  let isTimeseries = false;
  let stackCount: number | undefined;

  const segmentNames = queriesWithDatasets.map(
    (q) => q.segment_name ?? t`(All)`,
  );
  const colors = getColorsForValues(segmentNames);
  const legendItems: LegendItem[] = segmentNames.map((name) => ({
    name,
    color: colors[name],
  }));

  const series = queriesWithDatasets
    .filter((queryWithDataset) => queryWithDataset.dataset.data.rows.length > 0)
    .map((queryWithDataset, i) => {
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
        selectedTimelineId,
      );
      isTimeseries = isTimeseries || Boolean(isTimeseriesForQuery);
      // this works because we should always get the same stackCount for all queries in a group
      // but that's only because we don't run queries for segments and breakouts at the same time
      // so this is somewhat fragile and will need to be revisited if we ever support that
      stackCount = stackCountForQuery;
      const isCartesian = isCartesianChart(display);
      const cardVizSettings: VisualizationSettings = { ...settings };
      if (isCartesian) {
        // disable axis labels unless explicitly set
        if (!cardVizSettings["graph.y_axis.labels_enabled"]) {
          cardVizSettings["graph.y_axis.labels_enabled"] = false;
        }
        if (!cardVizSettings["graph.x_axis.labels_enabled"]) {
          cardVizSettings["graph.x_axis.labels_enabled"] = false;
        }

        if (categoryColors && queriesWithDatasets.length === 1) {
          if (
            display === "bar" &&
            query.query_type === "default" &&
            Object.keys(categoryColors.barColorByRawString).length > 0
          ) {
            cardVizSettings["graph._dimension_value_colors"] =
              categoryColors.barColorByRawString;
          } else if (
            display === "line" &&
            query.query_type === "time-facet" &&
            dataset.data.cols.length === 3
          ) {
            cardVizSettings.series_settings = {
              ...cardVizSettings.series_settings,
              ...seriesSettingsFromColors(categoryColors.barColorByRawString),
            };
            // Order the over-time series to match the regular bar's category
            // order (the top chart). `graph.series_order` is only honored when
            // every entry carries a color AND `graph.series_order_dimension`
            // matches the breakout dimension (`graph.dimensions[1]`) — otherwise
            // the chart falls back to the default order. We must set both.
            const breakoutDimension =
              cardVizSettings["graph.dimensions"]?.[1] ??
              dataset.data.cols[0]?.name;
            if (breakoutDimension != null) {
              cardVizSettings["graph.series_order_dimension"] =
                breakoutDimension;
              cardVizSettings["graph.series_order"] =
                categoryColors.overtimeOrder.map((key) => ({
                  key,
                  name: key,
                  color: categoryColors.barColorByRawString[key],
                  enabled: true,
                }));
            }
          }
        }

        if (
          topNBarColors &&
          display === "bar" &&
          query.query_type === "top-n-other"
        ) {
          // Color a "Top N" bar (`top-n-other`) by the choropleth shade each value gets on the companion region map, so the bar matches the map.
          cardVizSettings["graph._dimension_value_colors"] = topNBarColors;
        }
      } else if (display === "map") {
        const segmentName = segmentNames[i];
        const color = colors[segmentName];
        if (color) {
          cardVizSettings["map.colors"] = getColorplethColorScale(color);
        }
      }
      const card = createSeriesCard(
        query.id,
        query.name,
        display,
        cardVizSettings,
        query.dataset_query,
      );
      return { card, data: dataset.data };
    });

  return {
    series: getFinalSeries({ series, legendItems }),
    isTimeseries,
    stackCount,
    queryType: queriesWithDatasets[0]?.query_type || "default",
    params: queriesWithDatasets[0]?.params,
    legendItems,
  };
}

interface GetDisplayResult {
  display: CardDisplayType;
  settings?: VisualizationSettings;
  stackCount?: number;
  isTimeseries?: boolean;
}

function getDisplay(
  queryWithDataset: ExplorationQueryWithDataset,
  numQueries: number,
  numSegmentQueries: number,
  selectedTimelineId: TimelineId | null,
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
        // the page header tells you the breakout column, not the date column
        // so we need an x axis label here
        "graph.x_axis.labels_enabled": true,
        "timeline.selected_timeline_ids":
          selectedTimelineId != null ? [selectedTimelineId] : undefined,
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
        "timeline.selected_timeline_ids":
          selectedTimelineId != null ? [selectedTimelineId] : undefined,
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
    return { display: "table", stackCount: numQueries };
  }
  return { display: "bar" };
}

export interface ExplorationChartForDocumentEmbed {
  queryIds: ExplorationQueryId[];
  label: string;
  display: VisualizationDisplay;
  visualization_settings: VisualizationSettings;
}

const CARTESIAN_SERIES_COL_NAME = "Series";

function composeChartsForGroup(
  group: SeriesGroup,
  queryIds: ExplorationQueryId[],
): ExplorationChartForDocumentEmbed[] {
  const firstSeries = group.series[0];
  const display = firstSeries.card.display;

  // Maps render one `<Visualization>` per series side-by-side (no
  // `graph.split_panels` analogue), so the user perceives each map as a
  // standalone chart. Expand a multi-series map group into N picker
  // entries — each appends a single-snapshot embed (the N=1
  // pass-through path through `composite/combine` server-side).
  if (display === "map" && group.series.length > 1) {
    return group.series.map((s, i) => ({
      queryIds: [queryIds[i]],
      label: s.card.name ?? group.chartLabel ?? "Chart",
      display: s.card.display,
      visualization_settings: s.card.visualization_settings ?? {},
    }));
  }

  const label = group.chartLabel ?? firstSeries.card.name ?? "Chart";
  let visualization_settings: VisualizationSettings =
    firstSeries.card.visualization_settings ?? {};

  if (group.series.length > 1 && isCartesianChart(display)) {
    // The BE will append a "Series" column. Pin `graph.dimensions` so
    // the rendered chart reads the new column as the series breakout.
    const cols = firstSeries.data.cols;
    const xCol = cols.find(isDate)?.name ?? cols[0]?.name;
    if (xCol) {
      visualization_settings = {
        ...visualization_settings,
        "graph.dimensions": [xCol, CARTESIAN_SERIES_COL_NAME],
      };
    }
  }

  return [{ queryIds, label, display, visualization_settings }];
}

interface GetFinalSeriesParams {
  series: SingleSeries[];
  legendItems: LegendItem[];
}

function getFinalSeries({
  series,
  legendItems,
}: GetFinalSeriesParams): SingleSeries[] {
  if (series.length === 0) {
    return series;
  }

  const firstSeries = series[0];
  const display = firstSeries.card.display;
  const { rows } = firstSeries.data;

  if (display === "table") {
    return getHeatMapSeries({ series, legendItems });
  }

  const fallbackDisplay = getFallbackDisplay(series);
  // if we have a bar chart with null values, make sure the x-axis is ordinal, or they won't be displayed
  const ensureXAxisIsOrdinal =
    fallbackDisplay === "bar" && rows.some((row) => row[0] == null);
  const finalSeries = series.map((s) => ({
    ...s,
    card: {
      ...s.card,
      display: fallbackDisplay,
      visualization_settings: ensureXAxisIsOrdinal
        ? {
            ...s.card.visualization_settings,
            "graph.x_axis.scale": "ordinal" as const,
          }
        : s.card.visualization_settings,
    },
  }));

  return combineSeriesSettings({ series: finalSeries, legendItems });
}

// fallback to a row chart for small datasets
// for a line, it doesn't make sense to display a time series with only a few rows
// for a bar, the bars are very wide and don't use the space well with only a few rows
function getFallbackDisplay(series: SingleSeries[]): VisualizationDisplay {
  const firstSeries = series[0];
  const { card, data } = firstSeries;
  const { display } = card;
  const { rows, cols } = data;

  if (series.length > 1) {
    // never fall back to row if there are multiple series due to segments
    // it's too easy to trigger the row chart's "Other" grouping, which hides the segments
    // and sums the metrics, which is arguably a correctness issue (see #39146)
    return display;
  }

  let numRows: number;
  if (cols.length === 3) {
    // time-facet - here we'll consider the number of "rows" the number of unique dates
    const dates = new Set<RowValue>();
    for (const row of rows) {
      dates.add(row[1]);
    }
    numRows = dates.size;
  } else {
    numRows = rows.length;
  }
  if (
    (display === "line" || display === "bar") &&
    numRows <= MIN_ROWS_TO_SHOW_LINE_OR_BAR
  ) {
    return "row";
  }
  return display;
}

function combineSeriesSettings({
  series,
  legendItems,
}: GetFinalSeriesParams): SingleSeries[] {
  if (isCartesianChart(series[0]?.card.display) && series.length > 1) {
    // use the segment names in the legend and tooltip
    const seriesVizSettingsKeys = series.map((s, i) =>
      getSeriesVizSettingsKey(
        s.data.cols[1], // column
        true, // hasMultipleCards
        i === 0, // isFirstCard
        1, // metricsCount
        null, // breakoutName
        s.card.name, // cardName
      ),
    );
    const seriesSettings: Record<string, SeriesSettings> = {};
    seriesVizSettingsKeys.forEach((key, i) => {
      seriesSettings[key] = {
        title: legendItems[i].name,
        color: legendItems[i].color,
      };
    });
    // getStoredSettingsForSeries only looks at settings on the first series
    return series.map((s, i) =>
      i !== 0
        ? s
        : {
            ...s,
            card: {
              ...s.card,
              visualization_settings: {
                ...s.card.visualization_settings,
                series_settings: {
                  ...s.card.visualization_settings.series_settings,
                  ...seriesSettings,
                },
              },
            },
          },
    );
  }
  return series;
}

// the Table viz only supports one series, so we have to combine them
export function getHeatMapSeries({
  series,
  legendItems,
}: GetFinalSeriesParams): SingleSeries[] {
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
    const segmentName = legendItems[i].name;
    // the backend returns rows sorted by the metric value
    // but for numeric dimensions in the heat map, we should sort by the dimension value
    const seriesRows = isNumeric(s.data.cols[0])
      ? s.data.rows.toSorted((a, b) => Number(a[0]) - Number(b[0]))
      : s.data.rows;
    for (const row of seriesRows) {
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
    column_settings: {
      [getColumnKey(cols[0])]: {
        date_abbreviate: true,
        text_align: "middle",
      },
      [getColumnKey(cols[1])]: {
        text_align: "middle",
      },
    },
  };
  return [
    {
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
    },
  ];
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
  | "chart-and-table-vertically"
  | "two-same-size-charts-vertically";

const SPECIAL_QUERY_TYPES: ExplorationQueryType[] = [
  "top-n-other",
  "temporal-pattern-day",
  "temporal-pattern-hour",
  "time-facet",
  "filtered-subset",
  "per-value-time-series",
];

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
    SPECIAL_QUERY_TYPES.includes(seriesGroups[1].queryType);

  if (isTwoChartsWithOneSpecial) {
    if (
      seriesGroups[0].series[0].card.display !== "table" &&
      seriesGroups[1].series[0].card.display === "table"
    ) {
      return "chart-and-table-vertically";
    }
    return "two-same-size-charts-vertically";
  }

  return "default";
};
