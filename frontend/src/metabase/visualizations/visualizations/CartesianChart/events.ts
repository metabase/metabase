import _ from "underscore";
import type {
  CartesianChartModel,
  DataKey,
} from "metabase/visualizations/echarts/cartesian/model/types";
import type {
  CardDisplayType,
  CardId,
  RawSeries,
  TimelineEvent,
  TimelineEventId,
} from "metabase-types/api";
import { isNotNull } from "metabase/lib/types";
import { getObjectEntries } from "metabase/lib/objects";
import type { ClickObjectDimension } from "metabase-lib";
import type {
  ComputedVisualizationSettings,
  OnChangeCardAndRun,
  TooltipRowModel,
} from "metabase/visualizations/types";
import { formatValueForTooltip } from "metabase/visualizations/lib/tooltip";
import {
  hasClickBehavior,
  isRemappedToString,
} from "metabase/visualizations/lib/renderer_utils";
import type {
  EChartsSeriesMouseEvent,
  EChartsSeriesBrushEndEvent,
} from "metabase/visualizations/echarts/types";
import { dimensionIsTimeseries } from "metabase/visualizations/lib/timeseries";
import type { TimelineEventsModel } from "metabase/visualizations/echarts/cartesian/timeline-events/types";
import { getSeriesIdFromECharts } from "metabase/visualizations/echarts/cartesian/utils/id";
import { checkWaterfallChartModel } from "metabase/visualizations/echarts/cartesian/waterfall/utils";
import { NULL_DISPLAY_VALUE } from "metabase/lib/constants";
import { X_AXIS_DATA_KEY } from "metabase/visualizations/echarts/cartesian/constants/dataset";
import { isStructured } from "metabase-lib/queries/utils/card";
import Question from "metabase-lib/Question";
import {
  updateDateTimeFilter,
  updateNumericFilter,
} from "metabase-lib/queries/utils/actions";

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

export const getEventDimensionsData = (
  chartModel: CartesianChartModel,
  seriesIndex: number,
  dataIndex: number,
  display: CardDisplayType,
) => {
  const datum = chartModel.dataset[dataIndex];
  const seriesModel = chartModel.seriesModels[seriesIndex];

  const isWaterfallTotal =
    display === "waterfall" && dataIndex === chartModel.dataset.length;
  const dimensionValue = isWaterfallTotal ? null : datum[X_AXIS_DATA_KEY];

  const dimensions: ClickObjectDimension[] = [
    {
      column: chartModel.dimensionModel.column,
      value: dimensionValue,
    },
  ];

  if ("breakoutColumn" in seriesModel) {
    dimensions.push({
      column: seriesModel.breakoutColumn,
      value: seriesModel.breakoutValue,
    });
  }

  return {
    dimensions,
    dimensionValue,
  };
};

export const getEventColumnsData = (
  chartModel: CartesianChartModel,
  seriesIndex: number,
  dataIndex: number,
  display: CardDisplayType,
) => {
  const seriesModel = chartModel.seriesModels[seriesIndex];

  const isWaterfallTotal =
    display === "waterfall" && dataIndex === chartModel.dataset.length;
  if (isWaterfallTotal) {
    return [
      {
        key: seriesModel.name,
        value: checkWaterfallChartModel(chartModel).total,
        col: seriesModel.column,
      },
    ];
  }

  const datum = chartModel.dataset[dataIndex];
  const isBreakoutSeries = "breakoutColumn" in seriesModel;

  return getObjectEntries(datum)
    .map(([dataKey, value]) => {
      if (dataKey === X_AXIS_DATA_KEY) {
        return null;
      }

      const { cardId, breakoutValue } = parseDataKey(dataKey);

      const isSameCard = cardId === seriesModel.cardId;
      const isDifferentBreakoutSeries =
        isBreakoutSeries && String(seriesModel.breakoutValue) !== breakoutValue;

      const shouldIncludeValue = isSameCard && !isDifferentBreakoutSeries;
      if (!shouldIncludeValue) {
        return null;
      }

      const col = chartModel.columnByDataKey[dataKey];

      return {
        key: col.display_name, // TODO: use the title from the viz settings
        value: value ?? NULL_DISPLAY_VALUE,
        col,
      };
    })
    .filter(isNotNull);
};

export const getStackedTooltipModel = (
  chartModel: CartesianChartModel,
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
    bodyRows,
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
    isStructured(series[0].card) &&
    !isRemappedToString(series) &&
    !hasClickBehavior(series)
  );
};

export const getSeriesHoverData = (
  chartModel: CartesianChartModel,
  settings: ComputedVisualizationSettings,
  event: EChartsSeriesMouseEvent,
  display: CardDisplayType,
) => {
  const { dataIndex, seriesId: rawSeriesId } = event;
  const seriesId = getSeriesIdFromECharts(rawSeriesId, display);
  const seriesIndex = chartModel.seriesModels.findIndex(
    seriesModel => seriesModel.dataKey === seriesId,
  );

  if (seriesIndex < 0 || dataIndex == null) {
    return;
  }

  const data = getEventColumnsData(chartModel, seriesIndex, dataIndex, display);
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

export const getSeriesClickData = (
  chartModel: CartesianChartModel,
  settings: ComputedVisualizationSettings,
  event: EChartsSeriesMouseEvent,
  display: CardDisplayType,
) => {
  const { seriesId: rawSeriesId, dataIndex } = event;
  const seriesId = getSeriesIdFromECharts(rawSeriesId, display);
  const seriesIndex = chartModel.seriesModels.findIndex(
    seriesModel => seriesModel.dataKey === seriesId,
  );
  if (seriesIndex < 0 || dataIndex == null) {
    return;
  }

  const data = getEventColumnsData(chartModel, seriesIndex, dataIndex, display);
  const { dimensions, dimensionValue } = getEventDimensionsData(
    chartModel,
    seriesIndex,
    dataIndex,
    display,
  );
  const column = chartModel.seriesModels[seriesIndex].column;

  return {
    event: event.event.event,
    value: dimensionValue,
    column,
    data,
    dimensions,
    settings,
  };
};

export const getBrushData = (
  rawSeries: RawSeries,
  chartModel: CartesianChartModel,
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
    const query = new Question(card).legacyQuery({
      useStructuredQuery: true,
    });
    const [start, end] = range;
    if (isTimeSeries) {
      return {
        nextCard: updateDateTimeFilter(query, column, start, end)
          .question()
          .card(),
        previousCard: card,
      };
    } else {
      return {
        nextCard: updateNumericFilter(query, column, start, end)
          .question()
          .card(),
        previousCard: card,
      };
    }
  }

  return null;
};
