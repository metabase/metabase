import { useCallback, useMemo } from "react";
import type * as React from "react";
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
  visualizationIsClickable,
  onVisualizationClick,
  onChangeCardAndRun,
}: VisualizationProps) {
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
      onVisualizationClick,
      openQuestion,
      settings,
      visualizationIsClickable,
    ],
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
        isFullscreen={isFullscreen}
        isQueryBuilder={isQueryBuilder}
        onSelectSeries={handleSelectSeries}
      >
        <CartesianChartRenderer option={option} eventHandlers={eventHandlers} />
      </CartesianChartLegendLayout>
    </CartesianChartRoot>
  );
}
