import type { EChartsType } from "echarts/core";
import { type MouseEvent, useCallback, useMemo, useRef, useState } from "react";
import { useSet } from "react-use";

import { isNotNull } from "metabase/lib/types";
import { extractRemappings } from "metabase/visualizations";
import ChartWithLegend from "metabase/visualizations/components/ChartWithLegend";
import { ResponsiveEChartsRenderer } from "metabase/visualizations/components/EChartsRenderer";
import { getPieChartFormatters } from "metabase/visualizations/echarts/pie/format";
import { getPieChartModel } from "metabase/visualizations/echarts/pie/model";
import { getPieChartOption } from "metabase/visualizations/echarts/pie/option";
import { getTooltipOption } from "metabase/visualizations/echarts/pie/tooltip";
import { getArrayFromMapValues } from "metabase/visualizations/echarts/pie/util";
import {
  useCloseTooltipOnScroll,
  usePieChartValuesColorsClasses,
} from "metabase/visualizations/echarts/tooltip";
import { useBrowserRenderingContext } from "metabase/visualizations/hooks/use-browser-rendering-context";
import type { VisualizationProps } from "metabase/visualizations/types";
import { useTooltipMouseLeave } from "metabase/visualizations/visualizations/CartesianChart/use-tooltip-mouse-leave";

import { PIE_CHART_DEFINITION } from "./chart-definition";
import { useChartEvents } from "./use-chart-events";

Object.assign(PieChart, PIE_CHART_DEFINITION);

export function PieChart(props: VisualizationProps) {
  const {
    fontFamily,
    rawSeries,
    settings,
    onRender,
    isDashboard,
    isDocument,
    isFullscreen,
  } = props;
  const hoveredIndex = props.hovered?.index;
  const hoveredSliceKeyPath = props.hovered?.pieSliceKeyPath;

  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<EChartsType>();
  const [sideLength, setSideLength] = useState(0);

  const [hiddenSlices, { toggle: toggleSliceVisibility }] = useSet<
    string | number
  >();

  const showWarning = useCallback(
    (warning: string) => onRender({ warnings: [warning] }),
    [onRender],
  );

  const renderingContext = useBrowserRenderingContext({
    fontFamily,
    isDashboard,
    isFullscreen,
  });
  const seriesToRender = useMemo(
    () => extractRemappings(rawSeries),
    [rawSeries],
  );

  const chartModel = useMemo(
    () =>
      getPieChartModel(
        seriesToRender,
        settings,
        Array.from(hiddenSlices),
        renderingContext,
        showWarning,
      ),
    [seriesToRender, settings, hiddenSlices, renderingContext, showWarning],
  );
  const formatters = useMemo(
    () => getPieChartFormatters(chartModel, settings),
    [chartModel, settings],
  );
  const option = useMemo(
    () => ({
      ...getPieChartOption(
        chartModel,
        formatters,
        settings,
        renderingContext,
        sideLength,
        hoveredIndex,
        hoveredSliceKeyPath,
      ),
      tooltip: getTooltipOption(chartModel, formatters, containerRef),
    }),
    [
      chartModel,
      formatters,
      settings,
      renderingContext,
      sideLength,
      hoveredIndex,
      hoveredSliceKeyPath,
    ],
  );

  const valuesColorsCss = usePieChartValuesColorsClasses(chartModel);

  const handleInit = useCallback((chart: EChartsType) => {
    chartRef.current = chart;
  }, []);

  const handleResize = useCallback(
    (width: number, height: number) => setSideLength(Math.min(width, height)),
    [],
  );

  const eventHandlers = useChartEvents(props, chartRef, chartModel);

  const slices = useMemo(
    () => getArrayFromMapValues(chartModel.sliceTree),
    [chartModel.sliceTree],
  );
  const legendTitles = useMemo(
    () =>
      slices
        .filter((s) => s.includeInLegend)
        .map((s) => {
          const label = s.name;

          // Hidden slices don't have a percentage
          const sliceHidden = s.normalizedPercentage === 0;
          const percentDisabled =
            settings["pie.percent_visibility"] !== "legend" &&
            settings["pie.percent_visibility"] !== "both";

          if (sliceHidden || percentDisabled) {
            return [label];
          }

          return [
            label,
            formatters.formatPercent(s.normalizedPercentage, "legend"),
          ];
        }),
    [formatters, settings, slices],
  );

  const hiddenSlicesLegendIndices = slices
    .filter((s) => s.includeInLegend)
    .map((s, index) => (hiddenSlices.has(s.key) ? index : null))
    .filter(isNotNull);

  const legendColors = slices
    .filter((s) => s.includeInLegend)
    .map((s) => s.color);

  const showLegend = settings["pie.show_legend"];

  const onHoverChange = (hoverData: any) =>
    props.onHoverChange(
      hoverData && {
        ...hoverData,
        pieLegendHoverIndex: hoverData.index,
      },
    );

  const handleToggleSeriesVisibility = (
    _event: MouseEvent,
    sliceIndex: number,
  ) => {
    const slice = slices[sliceIndex];
    const willShowSlice = hiddenSlices.has(slice.key);
    const hasMoreVisibleSlices = slices.length - hiddenSlices.size > 1;
    if (hasMoreVisibleSlices || willShowSlice) {
      toggleSliceVisibility(slice.key);
    }
  };

  useCloseTooltipOnScroll(chartRef);
  useTooltipMouseLeave(chartRef, onHoverChange, containerRef);

  return (
    <ChartWithLegend
      legendTitles={legendTitles}
      legendHiddenIndices={hiddenSlicesLegendIndices}
      legendColors={legendColors}
      showLegend={showLegend}
      onHoverChange={onHoverChange}
      className={props.className}
      gridSize={props.gridSize}
      hovered={props.hovered}
      isDashboard={isDashboard}
      onToggleSeriesVisibility={handleToggleSeriesVisibility}
      isDocument={isDocument}
    >
      <ResponsiveEChartsRenderer
        ref={containerRef}
        option={option}
        onInit={handleInit}
        onResize={handleResize}
        eventHandlers={eventHandlers}
        // By default this is `true` for other charts, however for the pie chart
        // we need it to be `false`, otherwise echarts will bug out and be stuck
        // in emphasis state after hovering a slice
        notMerge={false}
      />
      {valuesColorsCss}
    </ChartWithLegend>
  );
}
