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
import { getRowFromDataPoint } from "metabase/visualizations/components/ChartTooltip/KeyValuePairChartTooltip/KeyValuePairChartTooltip";
import {
  getPercent,
  getTotalValue,
} from "metabase/visualizations/components/ChartTooltip/StackedDataTooltip/utils";
import { formatValueForTooltip } from "metabase/visualizations/components/ChartTooltip/utils";
import {
  ORIGINAL_INDEX_DATA_KEY,
  X_AXIS_DATA_KEY,
} from "metabase/visualizations/echarts/cartesian/constants/dataset";
import {
  isBreakoutSeries,
  isQuarterInterval,
  isTimeSeriesAxis,
} from "metabase/visualizations/echarts/cartesian/model/guards";
import type {
  BaseCartesianChartModel,
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
import { getFriendlyName } from "metabase/visualizations/lib/utils";
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
import type {
  CardId,
  RawSeries,
  TimelineEvent,
  TimelineEventId,
} from "metabase-types/api";

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

  return chartModel.seriesModels.findIndex(seriesModel =>
    [seriesId, chartModel.seriesIdToDataKey?.[seriesId]].includes(
      seriesModel.dataKey,
    ),
  );
};

const getSameCardDataKeys = (
  datum: Datum,
  seriesModel: SeriesModel,
): DataKey[] => {
  return getObjectKeys(datum).filter(dataKey => {
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
    .map(dataKey => chartModel.columnByDataKey[dataKey])
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
    dimension => dimension.column.source !== "query-transform",
  );
};

const getEventColumnsData = (
  chartModel: BaseCartesianChartModel,
  seriesIndex: number,
  dataIndex: number,
): DataPoint[] => {
  const datum = chartModel.dataset[dataIndex];
  const seriesModel = chartModel.seriesModels[seriesIndex];

  const seriesModelsByDataKey = _.indexBy(chartModel.seriesModels, "dataKey");

  const dataPoints: DataPoint[] = getSameCardDataKeys(datum, seriesModel)
    .map(dataKey => {
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
          ? getFriendlyName(col)
          : columnSeriesModel.tooltipName;
      const displayValue =
        isBreakoutSeries(seriesModel) && seriesModel.breakoutColumn === col
          ? seriesModel.name
          : value ?? NULL_DISPLAY_VALUE;

      return {
        key,
        value: displayValue,
        col,
      };
    })
    .filter(isNotNull);

  return dataPoints;
};

const computeDiffWithPreviousPeriod = (
  chartModel: BaseCartesianChartModel,
  seriesIndex: number,
  dataIndex: number,
): string | null => {
  if (!isTimeSeriesAxis(chartModel.xAxisModel)) {
    return null;
  }

  const datum = chartModel.dataset[dataIndex];
  const seriesModel = chartModel.seriesModels[seriesIndex];

  const currentValue = datum[seriesModel.dataKey];
  const currentDate = parseTimestamp(datum[X_AXIS_DATA_KEY]);
  const previousValue =
    chartModel.dataset[dataIndex - 1]?.[seriesModel.dataKey];

  if (previousValue == null || currentValue == null) {
    return null;
  }
  const previousDate = parseTimestamp(
    chartModel.dataset[dataIndex - 1][X_AXIS_DATA_KEY],
  );

  const unit = isQuarterInterval(chartModel.xAxisModel.interval)
    ? "quarter"
    : chartModel.xAxisModel.interval.unit;

  const dateDifference = currentDate.diff(
    previousDate,
    chartModel.xAxisModel.interval.unit,
    true,
  );

  let isOneIntervalAgo =
    Math.abs(dateDifference - chartModel.xAxisModel.interval.count) <=
    getDaylightSavingsChangeTolerance(chartModel.xAxisModel.interval.unit);

  // Comparing the 2nd and 1st quarter of the year needs to be checked
  // specially, because there are fewer days in this period due to Feburary
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
  onChangeCardAndRun?: OnChangeCardAndRun,
) => {
  const hasCombinedCards = series.length > 1;
  const hasBrushableDimension =
    settings["graph.x_axis.scale"] != null &&
    !["ordinal", "histogram"].includes(settings["graph.x_axis.scale"]);

  return (
    !!onChangeCardAndRun &&
    hasBrushableDimension &&
    !hasCombinedCards &&
    !isNative(series[0].card) &&
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

  const originalDataIndex =
    transformedDataset[echartsDataIndex][ORIGINAL_INDEX_DATA_KEY];
  return originalDataIndex ?? echartsDataIndex;
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

export const getSeriesHoverData = (
  chartModel: BaseCartesianChartModel,
  settings: ComputedVisualizationSettings,
  echartsDataIndex: number,
  seriesId: DataKey,
) => {
  const dataIndex = getDataIndex(
    chartModel.transformedDataset,
    echartsDataIndex,
  );
  const seriesIndex = findSeriesModelIndexById(chartModel, seriesId);

  if (seriesIndex < 0 || dataIndex == null) {
    return;
  }

  return {
    settings,
    isAlreadyScaled: true,
    index: seriesIndex,
    datumIndex: dataIndex,
  };
};

export const getTooltipModel = (
  chartModel: BaseCartesianChartModel,
  settings: ComputedVisualizationSettings,
  echartsDataIndex: number,
  seriesDataKey: DataKey,
): EChartsTooltipModel | null => {
  const dataIndex = getDataIndex(
    chartModel.transformedDataset,
    echartsDataIndex,
  );

  if (dataIndex == null) {
    return null;
  }
  const datum = chartModel.dataset[dataIndex];
  const seriesIndex = chartModel.seriesModels.findIndex(
    seriesModel => seriesModel.dataKey === seriesDataKey,
  );
  const hoveredSeries = chartModel.seriesModels[seriesIndex];
  const seriesStack = chartModel.stackModels.find(stackModel =>
    stackModel.seriesKeys.includes(hoveredSeries.dataKey),
  );

  const shouldShowAllColumnValuesTooltip =
    settings["graph.tooltip_type"] === "default";
  if (shouldShowAllColumnValuesTooltip) {
    return getAllColumnsTooltipModel(
      chartModel,
      settings,
      dataIndex,
      seriesDataKey,
    );
  }

  const shouldShowStackedTooltip = seriesStack != null;
  if (shouldShowStackedTooltip) {
    return getStackedTooltipModel(
      chartModel,
      settings,
      seriesStack,
      seriesDataKey,
      dataIndex,
      datum,
    );
  }

  return getSeriesOnlyTooltipModel(
    chartModel,
    settings,
    datum,
    dataIndex,
    seriesDataKey,
  );
};

const getAllColumnsTooltipModel = (
  chartModel: BaseCartesianChartModel,
  settings: ComputedVisualizationSettings,
  dataIndex: number,
  seriesDataKey: DataKey,
): EChartsTooltipModel | null => {
  const seriesIndex = findSeriesModelIndexById(chartModel, seriesDataKey);
  const rows = getEventColumnsData(chartModel, seriesIndex, dataIndex)
    .map(getRowFromDataPoint)
    .map(dataPoint => {
      return {
        name: dataPoint.key,
        values: [
          formatValueForTooltip({
            isAlreadyScaled: true,
            value: dataPoint.value,
            column: dataPoint.col,
            settings,
          }),
        ],
      };
    });

  return {
    rows,
  };
};

export const getSeriesOnlyTooltipModel = (
  chartModel: BaseCartesianChartModel,
  settings: ComputedVisualizationSettings,
  datum: Datum,
  dataIndex: number,
  seriesDataKey: DataKey,
): EChartsTooltipModel | null => {
  const header = String(
    formatValueForTooltip({
      value: datum[X_AXIS_DATA_KEY],
      column: chartModel.dimensionModel.column,
      settings,
    }),
  );

  const rows: EChartsTooltipRow[] = chartModel.seriesModels
    .filter(seriesModel => seriesModel.visible)
    .map((seriesModel, seriesIndex) => {
      const prevValue = computeDiffWithPreviousPeriod(
        chartModel,
        seriesIndex,
        dataIndex,
      );
      return {
        isFocused:
          chartModel.seriesModels.length > 1 &&
          seriesModel.dataKey === seriesDataKey,
        name: seriesModel.name,
        markerColorClass: getMarkerColorClass(seriesModel.color),
        values: [
          formatValueForTooltip({
            value: datum[seriesModel.dataKey],
            column: seriesModel.column,
            settings,
            isAlreadyScaled: true,
          }),
          prevValue,
        ],
      };
    });

  return {
    header,
    rows,
  };
};

export const getStackedTooltipModel = (
  chartModel: BaseCartesianChartModel,
  settings: ComputedVisualizationSettings,
  seriesStack: StackModel,
  seriesDataKey: DataKey,
  dataIndex: number,
  datum: Datum,
): EChartsTooltipModel | null => {
  const stackSeriesRows = chartModel.seriesModels
    .filter(
      seriesModel =>
        seriesModel.visible &&
        seriesStack?.seriesKeys.includes(seriesModel.dataKey),
    )
    .map(seriesModel => {
      return {
        isFocused: seriesModel.dataKey === seriesDataKey,
        name: seriesModel.name,
        color: seriesModel.color,
        value: chartModel.dataset[dataIndex][seriesModel.dataKey],
        dataKey: seriesModel.dataKey,
      };
    });

  // Reverse rows as they appear reversed on the stacked chart to match the order
  stackSeriesRows.reverse();

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

  const formattedTooltipRows: EChartsTooltipRow[] = stackSeriesRows
    .filter(row => row.value != null)
    .map(tooltipRow => {
      return {
        isFocused: tooltipRow.isFocused,
        name: tooltipRow.name,
        markerColorClass: tooltipRow.color
          ? getMarkerColorClass(tooltipRow.color)
          : undefined,
        values: [
          formatter(tooltipRow.value),
          formatPercent(getPercent(rowsTotal, tooltipRow.value) ?? 0),
        ],
      };
    });

  return {
    header,
    rows: formattedTooltipRows,
    footer: isShowingTotalSensible
      ? {
          name: t`Total`,
          values: [
            formatter(rowsTotal),
            formatPercent(getPercent(rowsTotal, rowsTotal) ?? 0),
          ],
        }
      : undefined,
  };
};

export const getTimelineEventsForEvent = (
  timelineEventsModel: TimelineEventsModel,
  event: EChartsSeriesMouseEvent,
) => {
  return timelineEventsModel.find(
    timelineEvents => timelineEvents.date === event.value,
  )?.events;
};

export const hasSelectedTimelineEvents = (
  timelineEvents: TimelineEvent[],
  selectedTimelineEventIds?: TimelineEventId[],
) => {
  return (
    selectedTimelineEventIds != null &&
    selectedTimelineEventIds.length > 0 &&
    timelineEvents.some(timelineEvent =>
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
) => {
  const element = event.event.event.target as Element;

  if (element?.nodeName !== "text") {
    return null;
  }

  return {
    element,
    data: [
      {
        col: null,
        key: settings["graph.goal_label"] ?? "",
        value: settings["graph.goal_value"] ?? "",
      },
    ],
  };
};

export const getSeriesClickData = (
  chartModel: BaseCartesianChartModel,
  settings: ComputedVisualizationSettings,
  event: EChartsSeriesMouseEvent,
): ClickObject | undefined => {
  const { seriesId, dataIndex: echartsDataIndex } = event;
  const dataIndex = getDataIndex(
    chartModel.transformedDataset,
    echartsDataIndex,
  );
  const seriesIndex = findSeriesModelIndexById(chartModel, seriesId);
  const seriesModel = chartModel.seriesModels[seriesIndex];

  if (seriesIndex < 0 || dataIndex == null) {
    return;
  }

  const datum = chartModel.dataset[dataIndex];

  const data = getEventColumnsData(chartModel, seriesIndex, dataIndex);
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
  metadata: Metadata,
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
      column,
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
    column,
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
