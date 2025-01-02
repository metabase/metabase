import type { EChartsType } from "echarts/core";
import {
  type MouseEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useSet } from "react-use";

import { isDesktopSafari } from "metabase/lib/browser";
import { ChartRenderingErrorBoundary } from "metabase/visualizations/components/ChartRenderingErrorBoundary";
import { ResponsiveEChartsRenderer } from "metabase/visualizations/components/EChartsRenderer";
import LegendCaption from "metabase/visualizations/components/legend/LegendCaption";
import { getLegendItems } from "metabase/visualizations/echarts/cartesian/model/legend";
import {
  useCartesianChartSeriesColorsClasses,
  useCloseTooltipOnScroll,
} from "metabase/visualizations/echarts/tooltip";
import type { VisualizationProps } from "metabase/visualizations/types";
import {
  CartesianChartLegendLayout,
  CartesianChartRoot,
} from "metabase/visualizations/visualizations/CartesianChart/CartesianChart.styled";
import { useChartEvents } from "metabase/visualizations/visualizations/CartesianChart/use-chart-events";

import { useChartDebug } from "./use-chart-debug";
import { useModelsAndOption } from "./use-models-and-option";
import { getGridSizeAdjustedSettings, validateChartModel } from "./utils";

function _CartesianChart(props: VisualizationProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  // The width and height from props reflect the dimensions of the entire container which includes legend,
  // however, for correct ECharts option calculation we need to use the dimensions of the chart viewport
  const [chartSize, setChartSize] = useState({ width: 0, height: 0 });

  const [hiddenSeries, { toggle: toggleSeriesVisibility }] = useSet<string>();

  const {
    showAllLegendItems,
    rawSeries,
    settings: originalSettings,
    card,
    getHref,
    gridSize,
    width: outerWidth,
    height: outerHeight,
    showTitle,
    headerIcon,
    actionButtons,
    isQueryBuilder,
    isFullscreen,
    hovered,
    onChangeCardAndRun,
    onHoverChange,
    canToggleSeriesVisibility,
    canRemoveSeries,
    onRemoveSeries,
  } = props;

  const settings = useMemo(
    () => getGridSizeAdjustedSettings(originalSettings, gridSize),
    [originalSettings, gridSize],
  );

  const { chartModel, timelineEventsModel, option } = useModelsAndOption(
    {
      ...props,
      width: chartSize.width,
      height: chartSize.height,
      hiddenSeries,
      settings,
    },
    containerRef,
  );
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

    // HACK: clip paths cause glitches in Safari on multiseries line charts on dashboards (metabase#51383)
    if (isDesktopSafari()) {
      chartRef.current.on("finished", () => {
        const svg = containerRef.current?.querySelector("svg");
        if (svg) {
          const clipPaths = svg.querySelectorAll('defs > clipPath[id^="zr"]');
          clipPaths.forEach(cp => cp.remove());
        }
      });
    }
  }, []);

  const handleToggleSeriesVisibility = useCallback(
    (event: MouseEvent, seriesIndex: number) => {
      const seriesModel = chartModel.seriesModels[seriesIndex];
      const willShowSeries = hiddenSeries.has(seriesModel.dataKey);
      const hasMoreVisibleSeries =
        chartModel.seriesModels.length - hiddenSeries.size > 1;
      if (hasMoreVisibleSeries || willShowSeries) {
        toggleSeriesVisibility(seriesModel.dataKey);
      }
    },
    [chartModel, hiddenSeries, toggleSeriesVisibility],
  );

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
  const seriesColorsCss = useCartesianChartSeriesColorsClasses(
    chartModel,
    settings,
  );

  useCloseTooltipOnScroll(chartRef);

  return (
    <CartesianChartRoot isQueryBuilder={isQueryBuilder}>
      {hasTitle && (
        <LegendCaption
          title={title}
          description={description}
          icon={headerIcon}
          actionButtons={actionButtons}
          getHref={canSelectTitle ? getHref : undefined}
          onSelectTitle={
            canSelectTitle ? () => onOpenQuestion(card.id) : undefined
          }
          width={outerWidth}
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
        onToggleSeriesVisibility={
          canToggleSeriesVisibility && handleToggleSeriesVisibility
        }
        canRemoveSeries={canRemoveSeries}
        onRemoveSeries={onRemoveSeries}
        onHoverChange={onHoverChange}
        width={outerWidth}
        height={outerHeight}
      >
        <ResponsiveEChartsRenderer
          ref={containerRef}
          option={option}
          eventHandlers={eventHandlers}
          onResize={handleResize}
          onInit={handleInit}
        />
      </CartesianChartLegendLayout>
      {seriesColorsCss}
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
