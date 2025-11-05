import { t } from "ttag";
import _ from "underscore";

import { NULL_DISPLAY_VALUE } from "metabase/lib/constants";
import { formatChangeWithSign } from "metabase/lib/formatting";
import { getObjectKeys } from "metabase/lib/objects";
import {
  getDaylightSavingsChangeTolerance,
  parseTimestamp,
} from "metabase/lib/time-dayjs";
import { checkNumber, isNotNull } from "metabase/lib/types";
import { formatPercent } from "metabase/static-viz/lib/numbers";
import type {
  EChartsTooltipModel,
  EChartsTooltipRow,
} from "metabase/visualizations/components/ChartTooltip/EChartsTooltip";
import {
  getPercent,
  getTotalValue,
} from "metabase/visualizations/components/ChartTooltip/StackedDataTooltip/utils";
import { formatValueForTooltip } from "metabase/visualizations/components/ChartTooltip/utils";
import {
  INDEX_KEY,
  IS_WATERFALL_TOTAL_DATA_KEY,
  OTHER_DATA_KEY,
  X_AXIS_DATA_KEY,
  X_AXIS_RAW_VALUE_DATA_KEY,
} from "metabase/visualizations/echarts/cartesian/constants/dataset";
import {
  isBreakoutSeries,
  isQuarterInterval,
  isTimeSeriesAxis,
} from "metabase/visualizations/echarts/cartesian/model/guards";
import { getOtherSeriesAggregationLabel } from "metabase/visualizations/echarts/cartesian/model/other-series";
import type {
  AxisFormatter,
  BaseCartesianChartModel,
  BaseSeriesModel,
  ChartDataset,
  DataKey,
  Datum,
  DimensionModel,
  SeriesModel,
  StackModel,
} from "metabase/visualizations/echarts/cartesian/model/types";
import type { TimelineEventsModel } from "metabase/visualizations/echarts/cartesian/timeline-events/types";
import { getMarkerColorClass } from "metabase/visualizations/echarts/tooltip";
import type {
  EChartsSeriesBrushEndEvent,
  EChartsSeriesMouseEvent,
} from "metabase/visualizations/echarts/types";
import { computeChange } from "metabase/visualizations/lib/numeric";
import {
  hasClickBehavior,
  isRemappedToString,
} from "metabase/visualizations/lib/renderer_utils";
import { dimensionIsTimeseries } from "metabase/visualizations/lib/timeseries";
import type {
  ComputedVisualizationSettings,
  DataPoint,
  OnChangeCardAndRun,
} from "metabase/visualizations/types";
import type { ClickObject, ClickObjectDimension } from "metabase-lib";
import * as Lib from "metabase-lib";
import Question from "metabase-lib/v1/Question";
import type Metadata from "metabase-lib/v1/metadata/Metadata";
import { isNative } from "metabase-lib/v1/queries/utils/card";
import { getColumnKey } from "metabase-lib/v1/queries/utils/column-key";
import type {
  CardDisplayType,
  CardId,
  RawSeries,
  TimelineEvent,
  TimelineEventId,
} from "metabase-types/api";
import { isSavedCard } from "metabase-types/guards";

export const parseDataKey = (dataKey: DataKey) => {
  let cardId: Nullable<CardId> = null;

  // breakoutValue can contain ":" so we need to split the dataKey by ":" and then join the rest of the parts
  const [cardIdString, columnName, ...breakoutValueParts] = dataKey.split(":");

  const parsedCardId = parseInt(cardIdString, 10);
  if (!isNaN(parsedCardId)) {
    cardId = parsedCardId;
  }

  const breakoutValue =
    breakoutValueParts.length === 0 ? undefined : breakoutValueParts.join(":");

  return { cardId, columnName, breakoutValue };
};

const findSeriesModelIndexById = (
  chartModel: BaseCartesianChartModel,
  seriesId?: string,
) => {
  if (seriesId == null) {
    return -1;
  }

  return chartModel.seriesModels.findIndex((seriesModel) =>
    [seriesId, chartModel.seriesIdToDataKey?.[seriesId]].includes(
      seriesModel.dataKey,
    ),
  );
};

const getSameCardDataKeys = (
  datum: Datum,
  seriesModel: SeriesModel,
): DataKey[] => {
  return getObjectKeys(datum).filter((dataKey) => {
    if (dataKey === X_AXIS_DATA_KEY) {
      return false;
    }

    const { cardId } = parseDataKey(dataKey);
    return cardId == null || cardId === seriesModel.cardId;
  });
};

export const getEventDimensions = (
  chartModel: BaseCartesianChartModel,
  datum: Datum,
  dimensionModel: DimensionModel,
  seriesModel: SeriesModel,
) => {
  const sameCardDataKeys = getSameCardDataKeys(datum, seriesModel);
  const sameCardDatumColumns = sameCardDataKeys
    .map((dataKey) => chartModel.columnByDataKey[dataKey])
    .filter(isNotNull);
  const dimensionColumn =
    seriesModel.cardId != null
      ? dimensionModel.columnByCardId[seriesModel.cardId]
      : dimensionModel.column;

  const hasDimensionValue = sameCardDatumColumns.includes(dimensionColumn);
  const dimensions: ClickObjectDimension[] = [];

  if (hasDimensionValue) {
    const dimensionValue = datum[X_AXIS_DATA_KEY];
    dimensions.push({
      column: dimensionColumn,
      value: dimensionValue,
    });
  }

  if (seriesModel != null && "breakoutColumn" in seriesModel) {
    dimensions.push({
      column: seriesModel.breakoutColumn,
      value: seriesModel.breakoutValue,
    });
  }

  return dimensions.filter(
    (dimension) => dimension.column.source !== "query-transform",
  );
};

const getEventColumnsData = (
  chartModel: BaseCartesianChartModel,
  seriesModel: SeriesModel,
  datum: Datum,
): DataPoint[] => {
  const seriesModelsByDataKey = _.indexBy(chartModel.seriesModels, "dataKey");

  const dataPoints: DataPoint[] = getSameCardDataKeys(datum, seriesModel)
    .map((dataKey) => {
      const value = datum[dataKey];
      const col = chartModel.columnByDataKey[dataKey];
      if (!col) {
        return null;
      }

      const { breakoutValue } = parseDataKey(dataKey);

      const isDifferentBreakoutSeries =
        isBreakoutSeries(seriesModel) &&
        String(seriesModel.breakoutValue) !== breakoutValue;

      if (isDifferentBreakoutSeries) {
        return null;
      }

      const columnSeriesModel = seriesModelsByDataKey[dataKey];
      const key =
        columnSeriesModel == null
          ? col.display_name
          : columnSeriesModel.tooltipName;
      const displayValue =
        isBreakoutSeries(seriesModel) && seriesModel.breakoutColumn === col
          ? seriesModel.name
          : (value ?? NULL_DISPLAY_VALUE);

      return {
        key,
        value: displayValue,
        col,
      };
    })
    .filter(isNotNull);

  return dataPoints;
};

const getXAxisDataForComparison = (datum: Datum) => {
  const rawValue = datum[X_AXIS_RAW_VALUE_DATA_KEY] ?? datum[X_AXIS_DATA_KEY];

  if (rawValue == null) {
    return null;
  }

  return parseTimestamp(rawValue);
};

const computeDiffWithPreviousPeriod = (
  chartModel: BaseCartesianChartModel,
  seriesModel: BaseSeriesModel,
  datum: Datum,
  previousDatum: Datum | null,
): string | null => {
  const { xAxisModel } = chartModel;
  if (!isTimeSeriesAxis(xAxisModel) || previousDatum == null) {
    return null;
  }

  const currentValue = datum[seriesModel.dataKey];
  const currentDate = getXAxisDataForComparison(datum);
  const previousValue = previousDatum?.[seriesModel.dataKey];

  if (previousValue == null || currentValue == null || currentDate == null) {
    return null;
  }

  const previousDate = getXAxisDataForComparison(previousDatum);
  const unit = isQuarterInterval(xAxisModel.interval)
    ? "quarter"
    : xAxisModel.interval.unit;
  const dateDifference = currentDate.diff(
    previousDate,
    xAxisModel.interval.unit,
    true,
  );
  let isOneIntervalAgo =
    Math.abs(dateDifference - xAxisModel.interval.count) <=
    getDaylightSavingsChangeTolerance(xAxisModel.interval.unit);

  // Comparing the 2nd and 1st quarter of the year needs to be checked
  // specially, because there are fewer days in this period due to February
  // being shorter than a normal month (89 days in a normal year, 90 days in a
  // leap year).
  if (!isOneIntervalAgo && unit === "quarter") {
    const diffInDays = currentDate.diff(previousDate, "day");
    if (diffInDays === 89 || diffInDays === 90) {
      isOneIntervalAgo = true;
    }
  }

  if (!isOneIntervalAgo) {
    return null;
  }

  const change = computeChange(previousValue, currentValue);

  return formatChangeWithSign(change);
};

export const canBrush = (
  series: RawSeries,
  settings: ComputedVisualizationSettings,
  onChangeCardAndRun?: OnChangeCardAndRun | null,
) => {
  const hasCombinedCards = series.length > 1;
  const hasBrushableDimension =
    settings["graph.x_axis.scale"] != null &&
    !["ordinal", "histogram"].includes(settings["graph.x_axis.scale"]);

  return (
    !!onChangeCardAndRun &&
    hasBrushableDimension &&
    !hasCombinedCards &&
    (!isNative(series[0].card) || isSavedCard(series[0].card)) &&
    !isRemappedToString(series) &&
    !hasClickBehavior(series)
  );
};

function getDataIndex(
  transformedDataset: ChartDataset,
  echartsDataIndex: number | undefined,
) {
  if (echartsDataIndex == null) {
    return undefined;
  }

  return transformedDataset[echartsDataIndex][INDEX_KEY];
}

export const getSeriesHovered = (
  chartModel: BaseCartesianChartModel,
  event: EChartsSeriesMouseEvent,
) => {
  const { dataIndex: echartsDataIndex, seriesId } = event;
  const dataIndex = getDataIndex(
    chartModel.transformedDataset,
    echartsDataIndex,
  );
  const seriesIndex = findSeriesModelIndexById(chartModel, seriesId);

  if (seriesIndex < 0 || dataIndex == null) {
    return;
  }

  return {
    index: seriesIndex,
    datumIndex: dataIndex,
  };
};

const getAdditionalTooltipRowsData = (
  chartModel: BaseCartesianChartModel,
  settings: ComputedVisualizationSettings,
  seriesModel: SeriesModel,
  datum: Datum,
): EChartsTooltipRow[] => {
  const additionalColumns = new Set(settings["graph.tooltip_columns"]);
  const data = getEventColumnsData(chartModel, seriesModel, datum);

  return data
    .filter(
      (entry) =>
        entry.col != null && additionalColumns.has(getColumnKey(entry.col)),
    )
    .map((data) => {
      return {
        isSecondary: true,
        name: data.key,
        values: [
          formatValueForTooltip({
            value: data.value,
            column: data.col,
            settings,
            isAlreadyScaled: true,
          }),
        ],
      };
    });
};

const getDatumByEChartsDataIndex = (
  chartModel: BaseCartesianChartModel,
  echartsDataIndex: number,
) => {
  const displayDatum = chartModel.transformedDataset[echartsDataIndex];
  const rawDatumIndex = displayDatum[INDEX_KEY];
  // A datum without an original dataset index is an interpolated point
  // that was generated during processing and doesn't exist in the raw dataset
  const isInterpolatedDatum = typeof rawDatumIndex !== "number";
  if (isInterpolatedDatum) {
    const datum = { ...displayDatum };

    // For interpolated data points, replace the processed x-axis value with its raw value
    // This ensures tooltips display the original, meaningful value rather than the transformed for presentation by ECharts
    datum[X_AXIS_DATA_KEY] = datum[X_AXIS_RAW_VALUE_DATA_KEY];
    return datum;
  }

  return chartModel.dataset[rawDatumIndex];
};

export const getTooltipModel = (
  chartModel: BaseCartesianChartModel,
  settings: ComputedVisualizationSettings,
  echartsDataIndex: number,
  display: CardDisplayType,
  seriesDataKey: DataKey,
): EChartsTooltipModel | null => {
  const datum = getDatumByEChartsDataIndex(chartModel, echartsDataIndex);
  const transformedDatum = chartModel.transformedDataset[echartsDataIndex];
  const previousDatum =
    echartsDataIndex > 0
      ? getDatumByEChartsDataIndex(chartModel, echartsDataIndex - 1)
      : null;

  if (seriesDataKey === OTHER_DATA_KEY) {
    return getOtherSeriesTooltipModel(
      chartModel,
      settings,
      datum,
      previousDatum,
      transformedDatum,
    );
  }

  const seriesIndex = findSeriesModelIndexById(chartModel, seriesDataKey);
  const hoveredSeries = chartModel.seriesModels[seriesIndex];

  if (!hoveredSeries) {
    return null;
  }

  const seriesStack = chartModel.stackModels.find((stackModel) =>
    stackModel.seriesKeys.includes(hoveredSeries.dataKey),
  );

  if (settings["graph.tooltip_type"] === "default") {
    return getSingleSeriesTooltipModel(
      chartModel,
      datum,
      settings,
      hoveredSeries,
      display,
    );
  }

  const shouldShowStackedTooltip = seriesStack != null;
  if (shouldShowStackedTooltip) {
    return getStackedTooltipModel(
      chartModel,
      settings,
      seriesStack,
      seriesDataKey,
      datum,
      transformedDatum,
      hoveredSeries,
    );
  }
  return getSeriesComparisonTooltipModel(
    chartModel,
    settings,
    datum,
    transformedDatum,
    previousDatum,
    hoveredSeries,
  );
};

const getSingleSeriesTooltipModel = (
  chartModel: BaseCartesianChartModel,
  datum: Datum,
  settings: ComputedVisualizationSettings,
  hoveredSeries: SeriesModel,
  display: CardDisplayType,
): EChartsTooltipModel | null => {
  const header = String(
    formatValueForTooltip({
      value: datum[X_AXIS_DATA_KEY],
      column: chartModel.dimensionModel.column,
      settings,
    }),
  );

  const additionalColumnsRows = getAdditionalTooltipRowsData(
    chartModel,
    settings,
    hoveredSeries,
    datum,
  );

  const seriesToShow = chartModel.seriesModels.filter(
    (series) => series === hoveredSeries || !isBreakoutSeries(series),
  );
  const seriesTooltipRows = seriesToShow.map((series) => {
    const isFocused =
      hoveredSeries.dataKey === series.dataKey && seriesToShow.length > 1;

    return {
      isFocused,
      name: series.name,
      markerColorClass: getMarkerColorClass(
        getSeriesOnlyTooltipRowColor(series, datum, settings, display),
      ),
      values: [
        formatValueForTooltip({
          value: datum[series.dataKey],
          column: series.column,
          settings,
          isAlreadyScaled: true,
        }),
      ],
    };
  });

  const rows: EChartsTooltipRow[] = [
    ...seriesTooltipRows,
    ...additionalColumnsRows,
  ];

  return {
    header,
    rows,
  };
};

export const mergeSeriesRowsAndAdditionalColumnsRows = (
  seriesRows: EChartsTooltipRow[],
  additionalColumnsRows: EChartsTooltipRow[],
  hoveredSeries: SeriesModel,
) => {
  const rows = [...seriesRows];
  if (isBreakoutSeries(hoveredSeries)) {
    // For breakout series we show additional columns right below the series values
    const additionalColumnsIndex =
      seriesRows.findIndex((row) => row.isFocused) + 1;
    rows.splice(additionalColumnsIndex, 0, ...additionalColumnsRows);
  } else {
    rows.push(...additionalColumnsRows);
  }

  return rows;
};

const getSeriesComparisonTooltipModel = (
  chartModel: BaseCartesianChartModel,
  settings: ComputedVisualizationSettings,
  datum: Datum,
  transformedDatum: Datum,
  previousDatum: Datum | null,
  hoveredSeries: SeriesModel,
): EChartsTooltipModel | null => {
  const header = String(
    formatValueForTooltip({
      value: datum[X_AXIS_DATA_KEY],
      column: chartModel.dimensionModel.column,
      settings,
    }),
  );

  const seriesRows: EChartsTooltipRow[] = chartModel.seriesModels
    .filter((seriesModel) => seriesModel.visible)
    .map((seriesModel) => {
      const isHoveredSeries = seriesModel.dataKey === hoveredSeries.dataKey;
      const isFocused = isHoveredSeries && chartModel.seriesModels.length > 1;

      const value =
        seriesModel.dataKey === OTHER_DATA_KEY
          ? transformedDatum[OTHER_DATA_KEY]
          : datum[seriesModel.dataKey];

      const prevValue =
        seriesModel.dataKey === OTHER_DATA_KEY
          ? null
          : computeDiffWithPreviousPeriod(
              chartModel,
              seriesModel,
              datum,
              previousDatum,
            );

      return {
        isFocused,
        name: seriesModel.name,
        markerColorClass: getMarkerColorClass(seriesModel.color),
        values: [
          formatValueForTooltip({
            value: value,
            column: seriesModel.column,
            settings,
            isAlreadyScaled: true,
          }),
          prevValue,
        ].filter(isNotNull),
      };
    });

  const additionalColumnsRows = getAdditionalTooltipRowsData(
    chartModel,
    settings,
    hoveredSeries,
    datum,
  );

  const rows = mergeSeriesRowsAndAdditionalColumnsRows(
    seriesRows,
    additionalColumnsRows,
    hoveredSeries,
  );

  return {
    header,
    rows,
  };
};

const getSeriesOnlyTooltipRowColor = (
  seriesModel: SeriesModel,
  datum: Datum,
  settings: ComputedVisualizationSettings,
  display: CardDisplayType,
) => {
  const value = datum[seriesModel.dataKey];
  if (display === "waterfall" && typeof value === "number") {
    let color;

    if (datum[IS_WATERFALL_TOTAL_DATA_KEY]) {
      color = settings["waterfall.total_color"];
    } else {
      color =
        value >= 0
          ? settings["waterfall.increase_color"]
          : settings["waterfall.decrease_color"];
    }

    return color ?? seriesModel.color;
  }
  return seriesModel.color;
};

const signs = ["+", "-"] as const;
type Sign = (typeof signs)[number];

export const getStackedTooltipModel = (
  chartModel: BaseCartesianChartModel,
  settings: ComputedVisualizationSettings,
  seriesStack: StackModel,
  seriesDataKey: DataKey,
  datum: Datum,
  transformedDatum: Datum,
  hoveredSeries: SeriesModel,
): EChartsTooltipModel | null => {
  const stackSeriesRows = chartModel.seriesModels
    .filter(
      (seriesModel) =>
        seriesModel.visible &&
        seriesStack?.seriesKeys.includes(seriesModel.dataKey),
    )
    .map((seriesModel) => {
      const value =
        seriesModel.dataKey === OTHER_DATA_KEY
          ? transformedDatum[OTHER_DATA_KEY]
          : datum[seriesModel.dataKey];

      return {
        isFocused: seriesModel.dataKey === seriesDataKey,
        name: seriesModel.name,
        color: seriesModel.color,
        dataKey: seriesModel.dataKey,
        value,
      };
    });

  type SeriesSlice = { total: number; series: typeof stackSeriesRows };
  let stackSeriesRowsBySign: Record<Sign, SeriesSlice> = {
    "+": { total: 0, series: [] },
    "-": { total: 0, series: [] },
  };
  stackSeriesRowsBySign = stackSeriesRows.reduce((acc, row) => {
    if (typeof row.value !== "number") {
      return acc;
    }
    const sign = row.value < 0 ? "-" : "+";
    const slice = acc[sign];
    slice.series.push(row);
    slice.total += row.value;
    return acc;
  }, stackSeriesRowsBySign);

  // Reverse positive rows as they appear reversed on the stacked chart to match the order
  stackSeriesRowsBySign["+"].series.reverse();

  const formatter = (value: unknown) =>
    String(
      formatValueForTooltip({
        isAlreadyScaled: true,
        value,
        settings,
        column:
          chartModel.leftAxisModel?.column ?? chartModel.rightAxisModel?.column,
      }),
    );

  const rowsTotal = getTotalValue(stackSeriesRows);
  const isShowingTotalSensible = stackSeriesRows.length > 1;
  const header = String(
    formatValueForTooltip({
      value: datum[X_AXIS_DATA_KEY],
      column: chartModel.dimensionModel.column,
      settings,
    }),
  );

  const hasPositivesAndNegatives =
    stackSeriesRowsBySign["+"].total > 0 &&
    stackSeriesRowsBySign["-"].total < 0;

  const formattedSeriesRows: EChartsTooltipRow[] = signs
    .map((sign) => {
      const slice = stackSeriesRowsBySign[sign];
      return [
        ...slice.series
          .filter((row) => row.value != null)
          .map((tooltipRow) => {
            return {
              isFocused: tooltipRow.isFocused,
              name: tooltipRow.name,
              markerColorClass: tooltipRow.color
                ? getMarkerColorClass(tooltipRow.color)
                : undefined,
              values: [
                formatter(tooltipRow.value),
                formatPercent(
                  slice.total
                    ? (getPercent(slice.total, tooltipRow.value) ?? 0)
                    : 0,
                ),
              ],
            };
          }),
        ...(hasPositivesAndNegatives
          ? [
              {
                name: sign === "-" ? t`Total negative` : t`Total positive`,
                markerColorClass: " ",
                values: [formatter(slice.total)],
              },
            ]
          : []),
      ];
    })
    .flat();

  const additionalColumnsRows = getAdditionalTooltipRowsData(
    chartModel,
    settings,
    hoveredSeries,
    datum,
  );

  const rows = mergeSeriesRowsAndAdditionalColumnsRows(
    formattedSeriesRows,
    additionalColumnsRows,
    hoveredSeries,
  );

  return {
    header,
    rows,
    footer: isShowingTotalSensible
      ? {
          name: t`Total`,
          values: [
            formatter(rowsTotal),
            hasPositivesAndNegatives
              ? ""
              : formatPercent(getPercent(rowsTotal, rowsTotal) ?? 0),
          ],
        }
      : undefined,
  };
};

export const getOtherSeriesTooltipModel = (
  chartModel: BaseCartesianChartModel,
  settings: ComputedVisualizationSettings,
  datum: Datum,
  previousDatum: Datum | null,
  transforedDatum: Datum,
) => {
  const { groupedSeriesModels = [] } = chartModel;

  const rows = groupedSeriesModels
    .map((seriesModel) => ({
      name: seriesModel.name,
      column: seriesModel.column,
      value: datum[seriesModel.dataKey],
      prevValue: computeDiffWithPreviousPeriod(
        chartModel,
        seriesModel,
        datum,
        previousDatum,
      ),
    }))
    .sort((a, b) => {
      if (typeof a.value === "number" && typeof b.value === "number") {
        return b.value - a.value;
      }
      return a.value === undefined ? 1 : -1;
    })
    .map((row) => ({
      name: row.name,
      values: [
        formatValueForTooltip({
          value: row.value,
          column: row.column,
          isAlreadyScaled: true,
          settings,
        }),
        row.prevValue,
      ],
    }));

  rows.push({
    name: getOtherSeriesAggregationLabel(
      settings["graph.other_category_aggregation_fn"],
    ),
    values: [
      String(
        formatValueForTooltip({
          isAlreadyScaled: true,
          value: transforedDatum[OTHER_DATA_KEY],
          settings,
          column:
            chartModel.leftAxisModel?.column ??
            chartModel.rightAxisModel?.column,
        }),
      ),
    ],
  });

  return {
    header: String(
      formatValueForTooltip({
        value: datum[X_AXIS_DATA_KEY],
        column: chartModel.dimensionModel.column,
        settings,
      }),
    ),
    rows,
  };
};

export const getTimelineEventsForEvent = (
  timelineEventsModel: TimelineEventsModel,
  event: EChartsSeriesMouseEvent,
) => {
  return timelineEventsModel.find(
    (timelineEvents) => timelineEvents.date === event.value,
  )?.events;
};

export const hasSelectedTimelineEvents = (
  timelineEvents: TimelineEvent[],
  selectedTimelineEventIds?: TimelineEventId[],
) => {
  return (
    selectedTimelineEventIds != null &&
    selectedTimelineEventIds.length > 0 &&
    timelineEvents.some((timelineEvent) =>
      selectedTimelineEventIds.includes(timelineEvent.id),
    )
  );
};

export const getTimelineEventsHoverData = (
  timelineEventsModel: TimelineEventsModel,
  event: EChartsSeriesMouseEvent,
) => {
  const hoveredTimelineEvents = getTimelineEventsForEvent(
    timelineEventsModel,
    event,
  );
  const element = event.event.event.target as Element;

  return {
    element: element?.nodeName === "image" ? element : undefined,
    timelineEvents: hoveredTimelineEvents,
  };
};

export const getGoalLineHoverData = (
  settings: ComputedVisualizationSettings,
  event: EChartsSeriesMouseEvent,
  formatGoal?: AxisFormatter,
) => {
  const element = event.event.event.target as Element;

  if (element?.nodeName !== "text") {
    return null;
  }

  const goalValue = settings["graph.goal_value"] ?? "";

  return {
    element,
    data: [
      {
        col: null,
        key: settings["graph.goal_label"] ?? "",
        value: formatGoal ? formatGoal(goalValue) : goalValue,
      },
    ],
  };
};

export const getSeriesClickData = (
  chartModel: BaseCartesianChartModel,
  settings: ComputedVisualizationSettings,
  event: EChartsSeriesMouseEvent,
): ClickObject | null => {
  const { seriesId, dataIndex: echartsDataIndex } = event;
  const dataIndex = getDataIndex(
    chartModel.transformedDataset,
    echartsDataIndex,
  );
  const seriesIndex = findSeriesModelIndexById(chartModel, seriesId);
  const seriesModel = chartModel.seriesModels[seriesIndex];

  if (
    seriesIndex < 0 ||
    dataIndex == null ||
    seriesModel?.dataKey === OTHER_DATA_KEY
  ) {
    return null;
  }

  const datum = chartModel.dataset[dataIndex];

  const data = getEventColumnsData(chartModel, seriesModel, datum);
  const dimensions = getEventDimensions(
    chartModel,
    datum,
    chartModel.dimensionModel,
    seriesModel,
  );

  return {
    cardId: seriesModel.cardId,
    event: event.event.event,
    value: datum[seriesModel.dataKey],
    column: seriesModel.column,
    data,
    dimensions,
    settings,
  };
};

export const getBrushData = (
  rawSeries: RawSeries,
  metadata: Metadata | undefined,
  chartModel: BaseCartesianChartModel,
  event: EChartsSeriesBrushEndEvent,
) => {
  const range = event.areas[0].coordRange;
  const isTimeSeries = dimensionIsTimeseries(
    rawSeries[0].data,
    chartModel.dimensionModel.columnIndex,
  );

  if (!range) {
    return null;
  }

  const column = chartModel.dimensionModel.column;
  const card = rawSeries[0].card;
  const question = new Question(card, metadata);
  const query = question.query();
  const stageIndex = -1;

  // https://echarts.apache.org/en/api.html#action.brush
  // `coordRange` will be a nested array only if `brushType` is `rect` or
  // `polygon`, but since we only use `lineX` we can assert the values to be
  // numbers
  const start = checkNumber(range[0]);
  const end = checkNumber(range[1]);

  if (isTimeSeries) {
    const nextQuery = Lib.updateTemporalFilter(
      query,
      stageIndex,
      Lib.fromLegacyColumn(query, stageIndex, column),
      question.id(),
      new Date(start).toISOString(),
      new Date(end).toISOString(),
    );
    const updatedQuestion = question.setQuery(nextQuery);
    const nextCard = updatedQuestion.card();

    return {
      nextCard,
      previousCard: card,
    };
  }

  const nextQuery = Lib.updateNumericFilter(
    query,
    stageIndex,
    Lib.fromLegacyColumn(query, stageIndex, column),
    question.id(),
    start,
    end,
  );
  const updatedQuestion = question.setQuery(nextQuery);
  const nextCard = updatedQuestion.card();

  return {
    nextCard,
    previousCard: card,
  };
};
