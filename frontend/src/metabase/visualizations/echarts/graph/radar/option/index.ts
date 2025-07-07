import type { RadarSeriesOption } from "echarts/charts";
import type { EChartsCoreOption } from "echarts/core";

import { getColorsForValues } from "metabase/lib/colors/charts";
import type {
  ComputedVisualizationSettings,
  RenderingContext,
} from "metabase/visualizations/types";

import { RADAR_CHART_STYLE } from "../constants/style";
import type { RadarChartModel } from "../model/types";

export const getRadarChartOption = (
  chartModel: RadarChartModel,
  settings: ComputedVisualizationSettings,
  width: number,
  height: number,
  renderingContext: RenderingContext,
): EChartsCoreOption => {
  const { data, formatters, radarColumns } = chartModel;

  if (!radarColumns) {
    return {};
  }

  const colors = getColorsForValues(
    radarColumns.metrics.map((metric) => metric.display_name || metric.name),
  );

  const indicators = data.indicators.map((indicator) => ({
    name: formatters.dimension(indicator.rawName),
    max: indicator.max,
    min: indicator.min,
  }));

  const showArea = settings["radar.show_area"] !== false;
  const showValues = settings["radar.show_values"] !== false;
  const shape = settings["radar.shape"] || "polygon";

  const series: RadarSeriesOption[] = data.series.map((seriesData, index) => ({
    type: "radar",
    name: seriesData.metricName,
    data: [
      {
        value: seriesData.values,
        name: seriesData.metricName,
      },
    ],
    symbol: "circle",
    symbolSize: RADAR_CHART_STYLE.series.symbolSize,
    lineStyle: {
      width: RADAR_CHART_STYLE.series.lineWidth,
      color: colors[seriesData.metricName],
    },
    itemStyle: {
      color: colors[seriesData.metricName],
    },
    areaStyle: showArea
      ? {
          opacity: RADAR_CHART_STYLE.series.areaOpacity,
          color: colors[seriesData.metricName],
        }
      : undefined,
    label: {
      show: showValues,
      formatter: (params: any) => {
        const value = params.value[index];
        return value != null ? formatters.metrics[index](value) : "";
      },
      fontSize: RADAR_CHART_STYLE.label.fontSize,
      fontWeight: RADAR_CHART_STYLE.label.fontWeight,
      fontFamily: renderingContext.fontFamily,
      textBorderWidth: RADAR_CHART_STYLE.label.textBorderWidth,
      textBorderColor: renderingContext.getColor("bg-white"),
      color: renderingContext.getColor("text-dark"),
    },
    emphasis: {
      lineStyle: {
        width: RADAR_CHART_STYLE.series.lineWidth + 1,
      },
      areaStyle: showArea
        ? {
            opacity: RADAR_CHART_STYLE.series.areaOpacity * 2,
          }
        : undefined,
    },
  }));

  const minDimension = Math.min(width, height);
  const radarRadius = Math.max(50, (minDimension * 0.7) / 2);

  return {
    animation: false,
    radar: {
      shape,
      radius: radarRadius,
      center: ["50%", "50%"],
      indicator: indicators,
      axisName: {
        color: renderingContext.getColor("text-dark"),
        fontSize: RADAR_CHART_STYLE.indicator.fontSize,
        fontWeight: RADAR_CHART_STYLE.indicator.fontWeight,
        fontFamily: renderingContext.fontFamily,
      },
      axisLine: {
        lineStyle: {
          color: renderingContext.getColor("border"),
        },
      },
      splitLine: {
        lineStyle: {
          color: renderingContext.getColor("border"),
        },
      },
      splitArea: {
        areaStyle: {
          color: [
            renderingContext.getColor("bg-light"),
            renderingContext.getColor("bg-white"),
          ],
        },
      },
    },
    series,
    legend: {
      show: true,
      bottom: 10,
      data: radarColumns.metrics.map(
        (metric) => metric.display_name || metric.name,
      ),
      textStyle: {
        color: renderingContext.getColor("text-dark"),
        fontFamily: renderingContext.fontFamily,
      },
    },
  };
};
