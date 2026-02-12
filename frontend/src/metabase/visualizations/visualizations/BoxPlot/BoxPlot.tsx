import type { EChartsType } from "echarts/core";
import { type MouseEvent, useCallback, useMemo, useRef, useState } from "react";
import { useSet } from "react-use";

import { isReducedMotionPreferred } from "metabase/lib/dom";
import { extractRemappings } from "metabase/visualizations";
import { ChartRenderingErrorBoundary } from "metabase/visualizations/components/ChartRenderingErrorBoundary";
import { ResponsiveEChartsRenderer } from "metabase/visualizations/components/EChartsRenderer";
import { LegendCaption } from "metabase/visualizations/components/legend/LegendCaption";
import {
  getBoxPlotLayoutModel,
  getBoxPlotModel,
  getBoxPlotOption,
  getBoxPlotTooltipOption,
} from "metabase/visualizations/echarts/boxplot";
import { getChartMeasurements } from "metabase/visualizations/echarts/cartesian/chart-measurements";
import { getLegendItems } from "metabase/visualizations/echarts/cartesian/model/legend";
import {
  useClickedStateTooltipSync,
  useCloseTooltipOnScroll,
} from "metabase/visualizations/echarts/tooltip";
import { useBrowserRenderingContext } from "metabase/visualizations/hooks/use-browser-rendering-context";
import { getDashboardAdjustedSettings } from "metabase/visualizations/shared/settings-adjustments";
import type { VisualizationProps } from "metabase/visualizations/types";
import {
  CartesianChartLegendLayout,
  CartesianChartRoot,
} from "metabase/visualizations/visualizations/CartesianChart/CartesianChart.styled";
import { useTooltipMouseLeave } from "metabase/visualizations/visualizations/CartesianChart/use-tooltip-mouse-leave";

import { BOXPLOT_CHART_DEFINITION } from "./chart-definition";
import { useBoxPlotEvents } from "./events";

function BoxPlotInner({
  rawSeries,
  settings: originalSettings,
  fontFamily,
  card,
  width,
  height,
  isDashboard,
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
  const [chartSize, setChartSize] = useState({ width: 0, height: 0 });
  const [hiddenSeries, { toggle: toggleSeriesVisibility }] = useSet<string>();

  const rawSeriesWithRemappings = useMemo(
    () => extractRemappings(rawSeries),
    [rawSeries],
  );

  const settings = useMemo(
    () =>
      getDashboardAdjustedSettings(
        originalSettings,
        isDashboard ?? false,
        width,
        height,
      ),
    [originalSettings, isDashboard, width, height],
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

  const chartMeasurements = useMemo(
    () =>
      getChartMeasurements(
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
        chartMeasurements,
        settings,
        chartWidth: chartSize.width,
        renderingContext,
      }),
    [
      chartModel,
      chartMeasurements,
      settings,
      chartSize.width,
      renderingContext,
    ],
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
        null,
        [],
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

  const handleInit = useCallback((chart: EChartsType) => {
    chartRef.current = chart;
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
        />
      </CartesianChartLegendLayout>
    </CartesianChartRoot>
  );
}

export function BoxPlot(props: VisualizationProps) {
  return (
    <ChartRenderingErrorBoundary onRenderError={props.onRenderError}>
      <BoxPlotInner {...props} />
    </ChartRenderingErrorBoundary>
  );
}

Object.assign(BoxPlot, BOXPLOT_CHART_DEFINITION);
