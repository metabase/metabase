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
  getEventColumnsData,
  getEventDimensionsData,
  getStackedTooltipModel,
} from "metabase/visualizations/visualizations/CartesianChart/utils";

export function CartesianChart({
  rawSeries,
  settings,
  card,
  fontFamily,
  width,
  showTitle,
  headerIcon,
  actionButtons,
  isQueryBuilder,
  isFullscreen,
  hovered,
  visualizationIsClickable,
  onHoverChange,
  onVisualizationClick,
  onChangeCardAndRun,
}: VisualizationProps) {
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
    () => getCartesianChartModel(rawSeries, settings, renderingContext),
    [rawSeries, renderingContext, settings],
  );

  const legendItems = useMemo(() => getLegendItems(chartModel), [chartModel]);
  const hasLegend = legendItems.length > 1;

  const option = useMemo(
    () => getCartesianChartOption(chartModel, settings, renderingContext),
    [chartModel, renderingContext, settings],
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
            seriesId,
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
    ],
    [
      chartModel,
      onHoverChange,
      onVisualizationClick,
      openQuestion,
      settings,
      visualizationIsClickable,
    ],
  );

  useEffect(() => {
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
    const eChartsSeriesIndex = (option?.series as LineSeriesOption[]).findIndex(
      series => series.id === seriesId,
    );

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
  }, [chartModel.seriesModels, hovered, option?.series]);

  const handleInit = useCallback((chart: EChartsType) => {
    chartRef.current = chart;
  }, []);

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
    <CartesianChartRoot>
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
