import { useCallback, useEffect, useMemo, useRef } from "react";
import type { EChartsType } from "echarts";
import type * as React from "react";
import type { LineSeriesOption } from "echarts/types/dist/echarts";
import { color } from "metabase/lib/colors";
import { formatValue } from "metabase/lib/formatting/value";
import { measureTextWidth } from "metabase/lib/measure-text";
import { getCartesianChartModel } from "metabase/visualizations/echarts/cartesian/model";
import type {
  RenderingContext,
  VisualizationProps,
} from "metabase/visualizations/types";
import { getCartesianChartOption } from "metabase/visualizations/echarts/cartesian/option";
import {
  CartesianChartLegendLayout,
  CartesianChartRenderer,
  CartesianChartRoot,
} from "metabase/visualizations/visualizations/CartesianChart/CartesianChart.styled";
import LegendCaption from "metabase/visualizations/components/legend/LegendCaption";
import { getLegendItems } from "metabase/visualizations/echarts/cartesian/model/legend";
import type { EChartsEventHandler } from "metabase/visualizations/types/echarts";
import {
  canBrush,
  getEventColumnsData,
  getEventDimensionsData,
  getStackedTooltipModel,
} from "metabase/visualizations/visualizations/CartesianChart/utils";
import { dimensionIsTimeseries } from "metabase/visualizations/lib/timeseries";
import { getTimelineEventsModel } from "metabase/visualizations/echarts/cartesian/timeline-events/model";
import Question from "metabase-lib/Question";
import {
  updateDateTimeFilter,
  updateNumericFilter,
} from "metabase-lib/queries/utils/actions";

export function CartesianChart({
  rawSeries,
  series: transformedSeries,
  isPlaceholder,
  settings,
  card,
  fontFamily,
  width,
  showTitle,
  headerIcon,
  actionButtons,
  isQueryBuilder,
  isFullscreen,
  timelineEvents = [],
  selectedTimelineEventIds = [],
  hovered,
  visualizationIsClickable,
  onHoverChange,
  onVisualizationClick,
  onChangeCardAndRun,
}: VisualizationProps) {
  const seriesToRender = useMemo(
    () => (isPlaceholder ? transformedSeries : rawSeries),
    [isPlaceholder, rawSeries, transformedSeries],
  );

  const isBrushing = useRef<boolean>();
  const chartRef = useRef<EChartsType>();

  const hasTitle = showTitle && settings["card.title"];
  const title = settings["card.title"] || card.name;
  const description = settings["card.description"];

  const renderingContext: RenderingContext = useMemo(
    () => ({
      getColor: color,
      formatValue: (value, options) => String(formatValue(value, options)),
      measureText: measureTextWidth,
      fontFamily: fontFamily,
    }),
    [fontFamily],
  );

  const chartModel = useMemo(
    () => getCartesianChartModel(seriesToRender, settings, renderingContext),
    [seriesToRender, renderingContext, settings],
  );

  const timelineEventsModel = useMemo(
    () =>
      getTimelineEventsModel(
        chartModel,
        timelineEvents,
        settings,
        width,
        renderingContext,
      ),
    [chartModel, timelineEvents, settings, width, renderingContext],
  );

  const legendItems = useMemo(() => getLegendItems(chartModel), [chartModel]);
  const hasLegend = legendItems.length > 1;

  const option = useMemo(
    () =>
      getCartesianChartOption(
        chartModel,
        timelineEventsModel,
        selectedTimelineEventIds,
        settings,
        renderingContext,
      ),
    [
      chartModel,
      renderingContext,
      selectedTimelineEventIds,
      settings,
      timelineEventsModel,
    ],
  );

  const openQuestion = useCallback(() => {
    if (onChangeCardAndRun) {
      onChangeCardAndRun({
        nextCard: card,
        seriesIndex: 0,
      });
    }
  }, [card, onChangeCardAndRun]);

  const eventHandlers: EChartsEventHandler[] = useMemo(
    () => [
      {
        eventName: "mouseout",
        query: "series",
        handler: () => {
          onHoverChange?.(null);
        },
      },
      {
        eventName: "mousemove",
        query: "series",
        handler: event => {
          if (isBrushing.current) {
            return;
          }

          const { dataIndex, seriesId } = event;
          const seriesIndex = chartModel.seriesModels.findIndex(
            seriesModel => seriesModel.dataKey === seriesId,
          );

          if (seriesIndex < 0) {
            return;
          }

          const data = getEventColumnsData(chartModel, seriesIndex, dataIndex);

          // TODO: For some reason ECharts sometimes trigger series mouse move element with the root SVG as target
          // Find a better fix
          if (event.event.event.target.nodeName === "svg") {
            return;
          }

          const isStackedChart = settings["stackable.stack_type"] != null;
          const stackedTooltipModel = isStackedChart
            ? getStackedTooltipModel(
                chartModel,
                settings,
                seriesIndex,
                dataIndex,
              )
            : undefined;

          onHoverChange?.({
            settings,
            index: seriesIndex,
            datumIndex: dataIndex,
            event: event.event.event,
            element: dataIndex != null ? event.event.event.target : null,
            data,
            stackedTooltipModel,
          });
        },
      },
      {
        eventName: "click",
        handler: event => {
          const { seriesId, dataIndex } = event;
          const seriesIndex = chartModel.seriesModels.findIndex(
            seriesModel => seriesModel.dataKey === seriesId,
          );
          if (seriesIndex < 0) {
            return;
          }

          const datum = chartModel.dataset[dataIndex];

          const data = getEventColumnsData(chartModel, seriesIndex, dataIndex);
          const dimensions = getEventDimensionsData(
            chartModel,
            seriesIndex,
            dataIndex,
          );
          const column = chartModel.seriesModels[seriesIndex].column;

          const clickData = {
            event: event.event.event,
            value: datum[chartModel.dimensionModel.dataKey],
            column,
            data,
            dimensions,
            settings,
          };

          if (!visualizationIsClickable(clickData)) {
            openQuestion();
          }

          onVisualizationClick?.(clickData);
        },
      },
      {
        eventName: "brush",
        handler: () => {
          isBrushing.current = true;
        },
      },
      {
        eventName: "brushEnd",
        handler: event => {
          isBrushing.current = false;
          const range = event.areas[0].coordRange;
          const isTimeSeries = dimensionIsTimeseries(
            rawSeries[0].data,
            chartModel.dimensionModel.columnIndex,
          );

          if (range) {
            const column = chartModel.dimensionModel.column;
            const card = rawSeries[0].card;
            const query = new Question(card).query();
            const [start, end] = range;
            if (isTimeSeries) {
              onChangeCardAndRun({
                nextCard: updateDateTimeFilter(query, column, start, end)
                  .question()
                  .card(),
                previousCard: card,
              });
            } else {
              onChangeCardAndRun({
                nextCard: updateNumericFilter(query, column, start, end)
                  .question()
                  .card(),
                previousCard: card,
              });
            }
          }
        },
      },
    ],
    [
      chartModel,
      onChangeCardAndRun,
      onHoverChange,
      onVisualizationClick,
      openQuestion,
      rawSeries,
      settings,
      visualizationIsClickable,
    ],
  );

  useEffect(
    function handleHoverStates() {
      const chart = chartRef.current;
      if (!chart) {
        return;
      }

      if (hovered?.index == null) {
        return;
      }

      const { datumIndex, index } = hovered;
      const seriesId = chartModel.seriesModels[index].dataKey;

      // ECharts series contain goal line, trend lines, and timeline events so the series index
      // is different from one in chartModel.seriesModels
      const eChartsSeriesIndex = (
        option?.series as LineSeriesOption[]
      ).findIndex(series => series.id === seriesId);

      chart.dispatchAction({
        type: "highlight",
        dataIndex: datumIndex,
        seriesIndex: eChartsSeriesIndex,
      });

      return () => {
        chart.dispatchAction({
          type: "downplay",
          dataIndex: datumIndex,
          seriesIndex: eChartsSeriesIndex,
        });
      };
    },
    [chartModel.seriesModels, hovered, option?.series],
  );

  const handleInit = useCallback((chart: EChartsType) => {
    chartRef.current = chart;
  }, []);

  // In order to keep brushing always enabled we have to re-enable it on every model change
  useEffect(
    function enableBrushing() {
      if (!canBrush(rawSeries, settings, onChangeCardAndRun)) {
        return;
      }

      setTimeout(() => {
        chartRef.current?.dispatchAction({
          type: "takeGlobalCursor",
          key: "brush",
          brushOption: {
            brushType: "lineX",
            brushMode: "single",
          },
        });
      }, 0);
    },
    [onChangeCardAndRun, option, rawSeries, settings],
  );

  const handleSelectSeries = useCallback(
    (event: React.MouseEvent, seriesIndex: number) => {
      const seriesModel = chartModel.seriesModels[seriesIndex];
      const hasBreakout = "breakoutColumn" in seriesModel;
      const dimensions = hasBreakout
        ? [
            {
              column: seriesModel.breakoutColumn,
              value: seriesModel.breakoutValue,
            },
          ]
        : undefined;

      const clickData = {
        column: seriesModel.column,
        dimensions,
        settings,
      };

      if (hasBreakout && visualizationIsClickable(clickData)) {
        onVisualizationClick({
          ...clickData,
          element: event.currentTarget,
        });
      } else {
        openQuestion();
      }
    },
    [
      chartModel.seriesModels,
      onVisualizationClick,
      openQuestion,
      settings,
      visualizationIsClickable,
    ],
  );

  const canSelectTitle = !!onChangeCardAndRun;

  return (
    <CartesianChartRoot isQueryBuilder={isQueryBuilder}>
      {hasTitle && (
        <LegendCaption
          title={title}
          description={description}
          icon={headerIcon}
          actionButtons={actionButtons}
          onSelectTitle={canSelectTitle ? openQuestion : undefined}
          width={width}
        />
      )}
      <CartesianChartLegendLayout
        hasLegend={hasLegend}
        labels={legendItems.map(item => item.name)}
        colors={legendItems.map(item => item.color)}
        actionButtons={!hasTitle ? actionButtons : undefined}
        hovered={hovered}
        isFullscreen={isFullscreen}
        isQueryBuilder={isQueryBuilder}
        onSelectSeries={handleSelectSeries}
        onHoverChange={onHoverChange}
      >
        <CartesianChartRenderer
          option={option}
          eventHandlers={eventHandlers}
          onInit={handleInit}
        />
      </CartesianChartLegendLayout>
    </CartesianChartRoot>
  );
}
