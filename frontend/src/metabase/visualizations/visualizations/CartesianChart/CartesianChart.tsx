import type { EChartsType } from "echarts/core";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { ChartRenderingErrorBoundary } from "metabase/visualizations/components/ChartRenderingErrorBoundary";
import LegendCaption from "metabase/visualizations/components/legend/LegendCaption";
import { getLegendItems } from "metabase/visualizations/echarts/cartesian/model/legend";
import type { VisualizationProps } from "metabase/visualizations/types";
import {
  CartesianChartLegendLayout,
  CartesianChartRenderer,
  CartesianChartRoot,
} from "metabase/visualizations/visualizations/CartesianChart/CartesianChart.styled";
import { useChartEvents } from "metabase/visualizations/visualizations/CartesianChart/use-chart-events";

import { useChartDebug } from "./use-chart-debug";
import { useModelsAndOption } from "./use-models-and-option";
import { getGridSizeAdjustedSettings, validateChartModel } from "./utils";

function _CartesianChart(props: VisualizationProps) {
  // The width and height from props reflect the dimensions of the entire container which includes legend,
  // however, for correct ECharts option calculation we need to use the dimensions of the chart viewport
  const [chartSize, setChartSize] = useState({ width: 0, height: 0 });

  const {
    showAllLegendItems,
    rawSeries,
    settings: originalSettings,
    card,
    href,
    gridSize,
    width,
    showTitle,
    headerIcon,
    actionButtons,
    isQueryBuilder,
    isFullscreen,
    hovered,
    onChangeCardAndRun,
    onHoverChange,
    canRemoveSeries,
    onRemoveSeries,
  } = props;

  const settings = useMemo(
    () => getGridSizeAdjustedSettings(originalSettings, gridSize),
    [originalSettings, gridSize],
  );

  const { chartModel, timelineEventsModel, option } = useModelsAndOption({
    ...props,
    width: chartSize.width,
    height: chartSize.height,
    settings,
  });
  useChartDebug({ isQueryBuilder, rawSeries, option, chartModel });

  const chartRef = useRef<EChartsType>();

  const hasTitle = showTitle && settings["card.title"];
  const title = settings["card.title"] || card.name;
  const description = settings["card.description"];

  const legendItems = useMemo(
    () => getLegendItems(chartModel.seriesModels, showAllLegendItems),
    [chartModel, showAllLegendItems],
  );
  const hasLegend = legendItems.length > 0;

  useEffect(() => {
    validateChartModel(chartModel);
  }, [chartModel]);

  const handleInit = useCallback((chart: EChartsType) => {
    chartRef.current = chart;
  }, []);

  const { onSelectSeries, onOpenQuestion, eventHandlers } = useChartEvents(
    chartRef,
    chartModel,
    timelineEventsModel,
    option,
    props,
  );

  const handleResize = useCallback((width: number, height: number) => {
    setChartSize({ width, height });
  }, []);

  const canSelectTitle = !!onChangeCardAndRun;

  return (
    <CartesianChartRoot isQueryBuilder={isQueryBuilder}>
      {hasTitle && (
        <LegendCaption
          title={title}
          description={description}
          icon={headerIcon}
          actionButtons={actionButtons}
          href={canSelectTitle ? href : undefined}
          onSelectTitle={canSelectTitle ? onOpenQuestion : undefined}
          width={width}
        />
      )}
      <CartesianChartLegendLayout
        isReversed={settings["legend.is_reversed"]}
        hasLegend={hasLegend}
        items={legendItems}
        actionButtons={!hasTitle ? actionButtons : undefined}
        hovered={hovered}
        isFullscreen={isFullscreen}
        isQueryBuilder={isQueryBuilder}
        onSelectSeries={onSelectSeries}
        canRemoveSeries={canRemoveSeries}
        onRemoveSeries={onRemoveSeries}
        onHoverChange={onHoverChange}
      >
        {/**@ts-expect-error emotion does not properly provide prop types due */}
        <CartesianChartRenderer
          // to it not working with the `WrappedComponent` class defined in
          // ExplicitSize
          option={option}
          eventHandlers={eventHandlers}
          onResize={handleResize}
          onInit={handleInit}
        />
      </CartesianChartLegendLayout>
    </CartesianChartRoot>
  );
}

export function CartesianChart(props: VisualizationProps) {
  return (
    <ChartRenderingErrorBoundary onRenderError={props.onRenderError}>
      <_CartesianChart {...props} />
    </ChartRenderingErrorBoundary>
  );
}
