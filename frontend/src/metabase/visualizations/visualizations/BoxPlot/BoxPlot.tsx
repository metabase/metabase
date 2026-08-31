import type { EChartsType } from "echarts/core";
import { type MouseEvent, useCallback, useMemo, useRef, useState } from "react";
import { useSet } from "react-use";

import { isReducedMotionPreferred } from "metabase/utils/dom";
import { ChartRenderingErrorBoundary } from "metabase/visualizations/components/ChartRenderingErrorBoundary";
import { DataPointsVisiblePopover } from "metabase/visualizations/components/DataPointsVisiblePopover/DataPointsVisiblePopover";
import { ResponsiveEChartsRenderer } from "metabase/visualizations/components/EChartsRenderer";
import { LegendCaption } from "metabase/visualizations/components/legend/LegendCaption";
import { useBrowserRenderingContext } from "metabase/visualizations/hooks/use-browser-rendering-context";
import type { VisualizationProps } from "metabase/visualizations/types";
import {
  CartesianChartLegendLayout,
  CartesianChartRoot,
} from "metabase/visualizations/visualizations/CartesianChart/CartesianChart.styled";
import { useTooltipMouseLeave } from "metabase/visualizations/visualizations/CartesianChart/use-tooltip-mouse-leave";
import {
  extractRemappings,
  getBoxPlotLayoutModel,
  getBoxPlotModel,
  getBoxPlotOption,
  getBoxPlotTooltipOption,
  getChartLayout,
  getDashboardAdjustedSettings,
  getLegendItems,
  useClickedStateTooltipSync,
  useCloseTooltipOnScroll,
} from "metabase/viz-core";

import { BOXPLOT_CHART_DEFINITION } from "./definition";
import { useBoxPlotEvents } from "./events";

function BoxPlotInner({
  rawSeries,
  settings: originalSettings,
  autoAdjustSettings,
  fontFamily,
  card,
  width,
  height,
  isDashboard,
  isVisualizer,
  isEditing,
  isQueryBuilder,
  isFullscreen,
  hovered,
  clicked,
  showTitle,
  headerIcon,
  actionButtons,
  getHref,
  showAllLegendItems,
  onVisualizationClick,
  onHoverChange,
  visualizationIsClickable,
  onChangeCardAndRun,
  onRender,
  titleMenuItems,
}: VisualizationProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<EChartsType>();
  const [chartInstance, setChartInstance] = useState<EChartsType>();
  const [chartSize, setChartSize] = useState({ width: 0, height: 0 });
  const [hiddenSeries, { toggle: toggleSeriesVisibility }] = useSet<string>();

  const rawSeriesWithRemappings = useMemo(
    () => extractRemappings(rawSeries),
    [rawSeries],
  );

  const settings = useMemo(
    () =>
      autoAdjustSettings
        ? getDashboardAdjustedSettings({
            settings: originalSettings,
            height,
            width,
          })
        : originalSettings,
    [originalSettings, height, width, autoAdjustSettings],
  );

  const renderingContext = useBrowserRenderingContext({ fontFamily });

  const showWarning = useCallback(
    (warning: string) => onRender?.({ warnings: [warning] }),
    [onRender],
  );

  const chartModel = useMemo(
    () =>
      getBoxPlotModel(
        rawSeriesWithRemappings,
        settings,
        Array.from(hiddenSeries),
        showWarning,
      ),
    [rawSeriesWithRemappings, settings, hiddenSeries, showWarning],
  );

  const description = settings["card.description"];

  const legendItems = useMemo(
    () => getLegendItems(chartModel.seriesModels, showAllLegendItems),
    [chartModel, showAllLegendItems],
  );
  const hasLegend = legendItems.length > 0;

  const canSelectTitle = !!onChangeCardAndRun;

  const handleToggleSeriesVisibility = useCallback(
    (_event: MouseEvent, seriesIndex: number) => {
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

  const cartesianLayout = useMemo(
    () =>
      getChartLayout(
        { ...chartModel, dataset: chartModel.boxDataset },
        settings,
        false,
        chartSize.width,
        chartSize.height,
        renderingContext,
      ),
    [chartModel, settings, chartSize.width, chartSize.height, renderingContext],
  );

  const layoutModel = useMemo(
    () =>
      getBoxPlotLayoutModel({
        chartModel,
        cartesianLayout,
        settings,
        chartWidth: chartSize.width,
        renderingContext,
      }),
    [chartModel, cartesianLayout, settings, chartSize.width, renderingContext],
  );

  const option = useMemo(() => {
    if (chartSize.width === 0 || chartSize.height === 0) {
      return null;
    }

    const shouldAnimate = !isReducedMotionPreferred();

    return {
      ...getBoxPlotOption(
        chartModel,
        layoutModel,
        settings,
        shouldAnimate,
        renderingContext,
      ),
      tooltip: getBoxPlotTooltipOption(chartModel, settings, containerRef),
    };
  }, [chartModel, layoutModel, settings, chartSize, renderingContext]);

  const { eventHandlers } = useBoxPlotEvents({
    chartRef,
    chartModel,
    rawSeries,
    settings,
    hovered,
    onHoverChange,
    onVisualizationClick,
    visualizationIsClickable,
    onChangeCardAndRun,
  });

  // The popover subscribes to the instance in an effect, and a ref mutation
  // would not re-run it, so the instance is held in state as well.
  const handleInit = useCallback((chart: EChartsType) => {
    chartRef.current = chart;
    setChartInstance(chart);
  }, []);

  const handleResize = useCallback((width: number, height: number) => {
    setChartSize({ width, height });
  }, []);

  useCloseTooltipOnScroll(chartRef);
  useTooltipMouseLeave(chartRef, onHoverChange, containerRef);
  useClickedStateTooltipSync(chartRef.current, clicked);

  const hasValidOption = option !== null;

  return (
    <CartesianChartRoot isQueryBuilder={isQueryBuilder}>
      {showTitle && (
        <LegendCaption
          title={settings["card.title"] ?? card.name}
          description={description}
          icon={headerIcon}
          actionButtons={actionButtons}
          hasInfoTooltip={!isDashboard || !isEditing}
          getHref={canSelectTitle ? getHref : undefined}
          onSelectTitle={
            canSelectTitle
              ? () => onChangeCardAndRun({ nextCard: card })
              : undefined
          }
          width={width}
          titleMenuItems={titleMenuItems}
        />
      )}
      <CartesianChartLegendLayout
        isReversed={settings["legend.is_reversed"]}
        hasLegend={hasLegend}
        items={legendItems}
        actionButtons={!showTitle ? actionButtons : undefined}
        hovered={hovered}
        isFullscreen={isFullscreen}
        isQueryBuilder={isQueryBuilder}
        onToggleSeriesVisibility={handleToggleSeriesVisibility}
        onHoverChange={onHoverChange}
        width={width}
        height={height}
      >
        <ResponsiveEChartsRenderer
          key={hasValidOption ? "chart" : "measuring"}
          ref={containerRef}
          option={option ?? {}}
          eventHandlers={hasValidOption ? eventHandlers : undefined}
          onInit={handleInit}
          onResize={handleResize}
        >
          <DataPointsVisiblePopover
            isDashboard={isDashboard}
            isVisualizer={isVisualizer}
            chartInstance={chartInstance}
          />
        </ResponsiveEChartsRenderer>
      </CartesianChartLegendLayout>
    </CartesianChartRoot>
  );
}

function BoxPlotComponent(props: VisualizationProps) {
  return (
    <ChartRenderingErrorBoundary onRenderError={props.onRenderError}>
      <BoxPlotInner {...props} />
    </ChartRenderingErrorBoundary>
  );
}

export const BoxPlot = Object.assign(
  BoxPlotComponent,
  BOXPLOT_CHART_DEFINITION,
);
