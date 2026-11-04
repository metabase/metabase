import type { VisualizationTheme } from "../../../types";

export const getRowChartSpacing = ({ cartesian }: VisualizationTheme) => ({
  tickFontSize: cartesian.ticks.fontSize,
  categoryTickMargin: cartesian.ticks.marginY,
  metricTickMargin: cartesian.ticks.marginX,
  axisTitleFontSize: cartesian.axisTitle.fontSize,
  metricAxisTitleMargin: cartesian.axisTitle.marginX,
  dimensionAxisTitleMargin: cartesian.axisTitle.marginY,
});
