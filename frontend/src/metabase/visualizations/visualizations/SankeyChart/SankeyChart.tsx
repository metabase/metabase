import type { EChartsType } from "echarts/core";
import { useCallback, useMemo, useRef, useState } from "react";

import { assignLazily } from "metabase/utils/merge-lazily";
import { ResponsiveEChartsRenderer } from "metabase/visualizations/components/EChartsRenderer";
import type { LegendItemData } from "metabase/visualizations/components/legend/LegendItem";
import { LegendLayout } from "metabase/visualizations/components/legend/LegendLayout";
import { useBrowserRenderingContext } from "metabase/visualizations/hooks/use-browser-rendering-context";
import type { VisualizationProps } from "metabase/visualizations/types";
import { useTooltipMouseLeave } from "metabase/visualizations/visualizations/CartesianChart/use-tooltip-mouse-leave";
import {
  extractRemappings,
  getSankeyChartModel,
  getSankeyChartOption,
  getSankeyLayout,
  getTooltipOption,
  useCloseTooltipOnScroll,
  useSankeyChartColorsClasses,
} from "metabase/viz-core";

import { SANKEY_CHART_DEFINITION } from "./definition";
import { useChartEvents } from "./events";

/**
 * A legend item per breakout value, in the order their flows first appear.
 * Empty without a breakout.
 */
const getBreakoutLegendItems = ({
  data,
}: ReturnType<typeof getSankeyChartModel>): LegendItemData[] => {
  const items = new Map<string, LegendItemData>();
  for (const { label, color } of data.links) {
    if (label !== undefined && color !== undefined && !items.has(label)) {
      items.set(label, { key: label, name: label, color });
    }
  }
  return [...items.values()];
};

const SankeyChartComponent = ({
  rawSeries,
  settings,
  fontFamily,
  clicked,
  width,
  height,
  hideLegend,
  isFullscreen,
  isQueryBuilder,
  onVisualizationClick,
  onHoverChange,
}: VisualizationProps) => {
  // The legend takes some of the card, so the layout uses what's left.
  const [chartSize, setChartSize] = useState<{
    width: number;
    height: number;
  } | null>(null);
  const handleResize = useCallback(
    (width: number, height: number) => setChartSize({ width, height }),
    [],
  );
  const rawSeriesWithRemappings = useMemo(
    () => extractRemappings(rawSeries),
    [rawSeries],
  );

  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<EChartsType>(undefined);
  const renderingContext = useBrowserRenderingContext({ fontFamily });
  const chartModel = useMemo(
    () => getSankeyChartModel(rawSeriesWithRemappings, settings),
    [rawSeriesWithRemappings, settings],
  );
  const legendItems = useMemo(
    () => getBreakoutLegendItems(chartModel),
    [chartModel],
  );
  // Only when color is what tells the flows apart.
  const hasLegend = !hideLegend && legendItems.length > 1;
  const chartWidth = chartSize?.width ?? width;
  const chartHeight = chartSize?.height ?? height;
  const layout = useMemo(
    () =>
      getSankeyLayout(
        chartModel,
        settings,
        chartWidth,
        chartHeight,
        renderingContext,
      ),
    [chartModel, settings, chartWidth, chartHeight, renderingContext],
  );
  const option = useMemo(
    () => ({
      ...getSankeyChartOption(chartModel, layout, settings, renderingContext),
      tooltip: getTooltipOption(containerRef, chartModel),
    }),
    [chartModel, layout, settings, renderingContext],
  );

  const handleInit = useCallback((chart: EChartsType) => {
    chartRef.current = chart;
  }, []);

  const { eventHandlers } = useChartEvents(
    chartRef,
    chartModel.sankeyColumns,
    rawSeriesWithRemappings,
    settings,
    onVisualizationClick,
    clicked,
  );

  useCloseTooltipOnScroll(chartRef);
  useTooltipMouseLeave(chartRef, onHoverChange, containerRef);

  const sankeyColorsCss = useSankeyChartColorsClasses(chartModel);

  const chart = (
    <ResponsiveEChartsRenderer
      ref={containerRef}
      option={option}
      eventHandlers={eventHandlers}
      onInit={handleInit}
      onResize={handleResize}
    />
  );

  return (
    <>
      {hasLegend ? (
        <LegendLayout
          items={legendItems}
          width={width}
          height={height}
          hasLegend
          isFullscreen={isFullscreen}
          isQueryBuilder={isQueryBuilder}
          fontFamily={renderingContext.fontFamily}
          measureText={renderingContext.measureText}
        >
          {chart}
        </LegendLayout>
      ) : (
        chart
      )}
      {sankeyColorsCss}
    </>
  );
};

export const SankeyChart = assignLazily(
  SankeyChartComponent,
  SANKEY_CHART_DEFINITION,
);
