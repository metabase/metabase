import dayjs from "dayjs";
import { t } from "ttag";

import { createSeriesCard } from "metabase/common/utils/series";
import { OTHER_BUCKET_LABEL } from "metabase/explorations/constants";
import { getColorsForValues } from "metabase/ui/colors/charts";
import { getAccentColors } from "metabase/ui/colors/groups";
import { NULL_DISPLAY_VALUE } from "metabase/utils/constants";
import { isCartesianChart } from "metabase/visualizations";
import { getSeriesVizSettingsKey } from "metabase/visualizations/echarts/cartesian/model/series";
import { formatValue } from "metabase/visualizations/lib/formatting";
import { formatDateTimeRangeWithUnit } from "metabase/visualizations/lib/formatting/date";
import type {
  BrushClickObject,
  BrushRange,
  ClickObject,
  ComputedVisualizationSettings,
  HighlightedObject,
} from "metabase/visualizations/types";
import { isBrushClickObject } from "metabase/visualizations/types";
import { getColorplethColorScale } from "metabase/visualizations/visualizations/Map/map-color-scale";
import { getColumnKey } from "metabase-lib/v1/queries/utils/column-key";
import {
  isCountry,
  isDate,
  isDateWithoutTime,
  isNumeric,
  isState,
} from "metabase-lib/v1/types/utils/isa";
import type {
  CardDisplayType,
  ColumnSettings,
  Dataset,
  DatasetColumn,
  DateTimeAbsoluteUnit,
  ExplorationBlockNodeType,
  ExplorationExploreFilter,
  ExplorationQuery,
  ExplorationQueryType,
  RowValue,
  RowValues,
  SeriesSettings,
  SingleSeries,
  VisualizationDisplay,
  VisualizationSettings,
} from "metabase-types/api";
import { isAbsoluteDateTimeUnit } from "metabase-types/guards/date-time";

const SHOULD_STACK_CUTOFF = 8;
const MIN_SEGMENTS_TO_SHOW_HEATMAP = 4;
const MIN_ROWS_TO_SHOW_LINE_OR_BAR = 3;

interface ExplorationQueryWithDataset extends ExplorationQuery {
  dataset: Dataset;
}

interface BuildSeriesGroupParams {
  queriesWithDatasets: ExplorationQueryWithDataset[];
}

export interface LegendItem {
  name: string;
  color: string;
}

export interface SeriesGroup {
  series: SingleSeries[];
  isTimeseries: boolean;
  stackCount?: number;
  legendItems: LegendItem[];
}

export function buildSeriesGroup({
  queriesWithDatasets,
}: BuildSeriesGroupParams): SeriesGroup {
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
    return { display: "table", stackCount: numQueries };
  }
  return { display: "bar" };
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
    const dateColIndex = cols.findIndex(isDate);
    if (dateColIndex === -1) {
      return display;
    }
    const dates = new Set<RowValue>();
    for (const row of rows) {
      dates.add(row[dateColIndex]);
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

export function formatColumnValue(
  value: RowValue,
  column: DatasetColumn,
  columnSettings?: ColumnSettings,
): string {
  const settings = columnSettings ?? { column };
  return String(formatValue(value ?? NULL_DISPLAY_VALUE, settings));
}

function getClickedColumnSettings(
  clicked: ClickObject,
  column: DatasetColumn,
): ColumnSettings {
  // Brush clicks stash ComputedVisualizationSettings on ClickObject.settings
  // (typed as a loose record on the shared ClickObject shape).
  const settings = clicked.settings as
    | ComputedVisualizationSettings
    | undefined;
  return settings?.column?.(column) ?? { column };
}

/** Same clamp as Lib.updateTemporalFilter: keep only unit buckets whose dots fall inside the brush. */
function clampTemporalBrushRange(
  start: string,
  end: string,
  unit: DateTimeAbsoluteUnit,
  column: DatasetColumn,
): { start: string; end: string } | null {
  const dateFormat = isDateWithoutTime(column)
    ? "YYYY-MM-DD"
    : "YYYY-MM-DDTHH:mm:ss";
  const clampedStart = dayjs(start)
    .add(1, unit)
    .startOf(unit)
    .format(dateFormat);
  const clampedEnd = dayjs(end).startOf(unit).format(dateFormat);
  if (dayjs(clampedStart).isAfter(dayjs(clampedEnd))) {
    return null;
  }
  return { start: clampedStart, end: clampedEnd };
}

function formatBrushRangeDisplayValue(
  brushRange: BrushRange,
  column: DatasetColumn,
  columnSettings: ColumnSettings,
): string {
  if (
    brushRange.type === "temporal" &&
    column.unit != null &&
    isAbsoluteDateTimeUnit(column.unit)
  ) {
    return String(
      formatDateTimeRangeWithUnit(
        [brushRange.start, brushRange.end],
        column.unit,
        columnSettings,
      ),
    );
  }

  return `${formatColumnValue(brushRange.start, column, columnSettings)} - ${formatColumnValue(brushRange.end, column, columnSettings)}`;
}

function getBrushExploreFurtherFilters(
  clicked: BrushClickObject,
): ExplorationExploreFilter[] {
  const { column, brushRange } = clicked;
  if (column.field_ref == null) {
    return [];
  }

  const columnSettings = getClickedColumnSettings(clicked, column);

  if (brushRange.type === "temporal") {
    const clamped =
      column.unit != null && isAbsoluteDateTimeUnit(column.unit)
        ? clampTemporalBrushRange(
            brushRange.start,
            brushRange.end,
            column.unit,
            column,
          )
        : { start: brushRange.start, end: brushRange.end };
    if (clamped == null) {
      return [];
    }

    const clampedRange: BrushRange = {
      type: "temporal",
      start: clamped.start,
      end: clamped.end,
    };

    if (clamped.start === clamped.end) {
      return [
        {
          operator: "=",
          field_ref: column.field_ref,
          value: clamped.start,
          display_value: formatColumnValue(
            clamped.start,
            column,
            columnSettings,
          ),
        },
      ];
    }

    return [
      {
        operator: "between",
        field_ref: column.field_ref,
        values: [clamped.start, clamped.end],
        display_value: formatBrushRangeDisplayValue(
          clampedRange,
          column,
          columnSettings,
        ),
      },
    ];
  }

  return [
    {
      operator: "between",
      field_ref: column.field_ref,
      values: [brushRange.start, brushRange.end],
      display_value: formatBrushRangeDisplayValue(
        brushRange,
        column,
        columnSettings,
      ),
    },
  ];
}

export function getExploreFurtherFilters(
  clicked: ClickObject,
): ExplorationExploreFilter[] {
  if (isBrushClickObject(clicked)) {
    return getBrushExploreFurtherFilters(clicked);
  }

  return (clicked.dimensions ?? []).flatMap(({ column, value }) =>
    column.field_ref != null
      ? [
          {
            operator: "=" as const,
            field_ref: column.field_ref,
            value,
            display_value: formatColumnValue(value, column),
          },
        ]
      : [],
  );
}

export function canExploreFurther(
  clicked: ClickObject,
  blockType: ExplorationBlockNodeType,
  queryType: ExplorationQueryType,
): boolean {
  // disable for dimension blocks - every query in a dimension block is cut by the same dimension
  // so filtering on a single dimension value doesn't provide a new view of the data
  if (blockType === "dimension") {
    return false;
  }

  if (isBrushClickObject(clicked)) {
    return getExploreFurtherFilters(clicked).length > 0;
  }

  const dimensions = clicked.dimensions ?? [];
  if (dimensions.length === 0) {
    return false;
  }
  // OTHER_BUCKET_LABEL is not a real dimension value, so filtering on it won't return anything
  if (
    queryType === "top-n-other" &&
    dimensions.some(({ value }) => value === OTHER_BUCKET_LABEL)
  ) {
    return false;
  }
  return true;
}

export function getCommentLabel(
  highlighted?: HighlightedObject,
  seriesGroup?: SeriesGroup,
  computedSettings?: ComputedVisualizationSettings,
): string | null | undefined {
  if (!highlighted || !seriesGroup) {
    return null;
  }

  const seriesIndex =
    seriesGroup.series.length === 1
      ? 0
      : seriesGroup.series.findIndex((s) => s.card.id === highlighted.cardId);
  const series = seriesGroup.series[seriesIndex];
  if (!series) {
    return null;
  }

  const labels: string[] = [];

  for (const dimension of highlighted.dimensions ?? []) {
    const column = series.data.cols.find(
      (col) => col.name === dimension.columnName,
    );
    if (!column) {
      continue;
    }
    const columnSettings = computedSettings?.column?.(column) ?? { column };
    labels.push(formatColumnValue(dimension.value, column, columnSettings));
  }

  if (highlighted.cardId && seriesGroup.series.length > 1) {
    const segmentName = seriesGroup.legendItems[seriesIndex].name;
    if (segmentName) {
      labels.push(segmentName);
    }
  }

  return labels.join(", ");
}
