import type { VisualizationTheme } from "../../../types";

// Every theme-driven row chart text size and margin, read in one place. Each
// axis takes the margins of the side it's drawn on, not of its upright role.
export const getRowChartSpacing = ({ cartesian }: VisualizationTheme) => ({
  tickFontSize: cartesian.ticks.fontSize,
  categoryTickMargin: cartesian.ticks.marginY,
  metricTickMargin: cartesian.ticks.marginX,
  axisTitleFontSize: cartesian.axisTitle.fontSize,
  metricAxisTitleMargin: cartesian.axisTitle.marginX,
  dimensionAxisTitleMargin: cartesian.axisTitle.marginY,
});
