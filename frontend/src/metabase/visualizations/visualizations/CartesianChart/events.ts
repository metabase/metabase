import _ from "underscore";

import { NULL_DISPLAY_VALUE } from "metabase/lib/constants";
import { getObjectKeys } from "metabase/lib/objects";
import { isNotNull } from "metabase/lib/types";
import {
  ORIGINAL_INDEX_DATA_KEY,
  X_AXIS_DATA_KEY,
} from "metabase/visualizations/echarts/cartesian/constants/dataset";
import type {
  BaseCartesianChartModel,
  ChartDataset,
  DataKey,
  Datum,
  DimensionModel,
  SeriesModel,
} from "metabase/visualizations/echarts/cartesian/model/types";
import type { TimelineEventsModel } from "metabase/visualizations/echarts/cartesian/timeline-events/types";
import type {
  EChartsSeriesMouseEvent,
  EChartsSeriesBrushEndEvent,
} from "metabase/visualizations/echarts/types";
import {
  hasClickBehavior,
  isRemappedToString,
} from "metabase/visualizations/lib/renderer_utils";
import { dimensionIsTimeseries } from "metabase/visualizations/lib/timeseries";
import { formatValueForTooltip } from "metabase/visualizations/lib/tooltip";
import type {
  ComputedVisualizationSettings,
  DataPoint,
  OnChangeCardAndRun,
  TooltipRowModel,
} from "metabase/visualizations/types";
import type { ClickObject, ClickObjectDimension } from "metabase-lib";
import * as Lib from "metabase-lib";
import Question from "metabase-lib/v1/Question";
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

export const getEventColumnsData = (
  chartModel: BaseCartesianChartModel,
  seriesIndex: number,
  dataIndex: number,
): DataPoint[] => {
  const datum = chartModel.dataset[dataIndex];

  const seriesModel = chartModel.seriesModels[seriesIndex];
  const isBreakoutSeries =
    seriesModel != null && "breakoutColumn" in seriesModel;

  const seriesModelsByDataKey = _.indexBy(chartModel.seriesModels, "dataKey");
  return getSameCardDataKeys(datum, seriesModel)
    .map(dataKey => {
      const value = datum[dataKey];

      const { breakoutValue } = parseDataKey(dataKey);

      const isDifferentBreakoutSeries =
        isBreakoutSeries && String(seriesModel.breakoutValue) !== breakoutValue;

      if (isDifferentBreakoutSeries) {
        return null;
      }

      const col = chartModel.columnByDataKey[dataKey];
      const columnSeriesModel = seriesModelsByDataKey[dataKey];
      const key =
        columnSeriesModel == null || "breakoutColumn" in columnSeriesModel
          ? col.display_name
          : columnSeriesModel?.name;
      const displayValue =
        isBreakoutSeries && seriesModel.breakoutColumn === col
          ? seriesModel.name
          : value ?? NULL_DISPLAY_VALUE;

      return {
        key,
        value: displayValue,
        col,
      };
    })
    .filter(isNotNull);
};

export const getStackedTooltipModel = (
  chartModel: BaseCartesianChartModel,
  settings: ComputedVisualizationSettings,
  seriesIndex: number,
  dataIndex: number,
) => {
  const column =
    chartModel.leftAxisModel?.column ?? chartModel.rightAxisModel?.column;

  const formatter = (value: unknown) =>
    String(
      formatValueForTooltip({
        value,
        settings,
        column,
      }),
    );

  const rows: TooltipRowModel[] = chartModel.seriesModels.map(seriesModel => {
    return {
      name: seriesModel.name,
      color: seriesModel.color,
      value: chartModel.dataset[dataIndex][seriesModel.dataKey],
      formatter,
    };
  });
  const [headerRows, bodyRows] = _.partition(
    rows,
    (_row, index) => index === seriesIndex,
  );

  const dimensionValue = chartModel.dataset[dataIndex][X_AXIS_DATA_KEY];

  const headerTitle = String(
    formatValueForTooltip({
      value: dimensionValue,
      column: chartModel.dimensionModel.column,
      settings,
    }),
  );

  return {
    headerTitle,
    headerRows,
    bodyRows: bodyRows.filter(row => row.value != null),
    totalFormatter: formatter,
    showTotal: true,
    showPercentages: true,
  };
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

export const getSeriesHoverData = (
  chartModel: BaseCartesianChartModel,
  settings: ComputedVisualizationSettings,
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

  const data = getEventColumnsData(chartModel, seriesIndex, dataIndex);
  const target = (event.event.event.target ?? undefined) as Element | undefined;

  // TODO: For some reason ECharts sometimes trigger series mouse move element with the root SVG as target
  // Find a better fix
  if (target?.nodeName === "svg") {
    return;
  }

  const stackedTooltipModel =
    settings["graph.tooltip_type"] === "series_comparison"
      ? getStackedTooltipModel(chartModel, settings, seriesIndex, dataIndex)
      : undefined;

  return {
    settings,
    index: seriesIndex,
    datumIndex: dataIndex,
    event: event.event.event,
    element: target,
    data,
    stackedTooltipModel,
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

  if (element?.nodeName !== "image") {
    return null;
  }

  return {
    element,
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
  chartModel: BaseCartesianChartModel,
  event: EChartsSeriesBrushEndEvent,
) => {
  const range = event.areas[0].coordRange;
  const isTimeSeries = dimensionIsTimeseries(
    rawSeries[0].data,
    chartModel.dimensionModel.columnIndex,
  );

  if (range) {
    const column = chartModel.dimensionModel.column;
    const card = rawSeries[0].card;
    const question = new Question(card, {}); // FIXME: pass metadata
    const query = question.query();
    const stageIndex = -1;

    const [start, end] = range;

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
    } else {
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
    }
  }

  return null;
};
