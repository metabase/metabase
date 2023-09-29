import { useMemo } from "react";
import type { VisualizationProps } from "metabase/visualizations/types";

import { buildPieChart } from "metabase/visualizations/shared/echarts/pie";
import { measureTextWidth } from "metabase/lib/measure-text";
import { formatValue } from "metabase/lib/formatting/value";
import { color } from "metabase/lib/colors";
import { PIE_CHART_SETTINGS } from "metabase/visualizations/echarts/visualizations/PieChart/settings";
import { EChartsRenderer } from "../../EChartsRenderer";
import { PieChartLegend } from "./PieChartLegend";
import { useChartDimension } from "./utils";

Object.assign(PieChart, {
  uiName: "Pie 2",
  identifier: "pie2",
  iconName: "pie",
  settings: PIE_CHART_SETTINGS,
});

export function PieChart(props: VisualizationProps) {
  const { option, legend, eventHandlers } = useMemo(
    () =>
      buildPieChart(
        props.rawSeries,
        props.settings,
        {
          getColor: color,
          measureText: measureTextWidth,
          formatValue: formatValue,
        },
        props.onHoverChange,
        props.hovered,
        props.onVisualizationClick,
      ),
    [
      props.rawSeries,
      props.settings,
      props.onHoverChange,
      props.hovered?.index,
      props.onVisualizationClick,
    ],
  );

  const { sideLength, onChartDimensionChange } = useChartDimension();

  return (
    <PieChartLegend
      legend={legend}
      onChartDimensionChange={onChartDimensionChange}
      {...props}
    >
      <EChartsRenderer
        config={{ option, eventHandlers, zrEventHandlers: [] }}
        width={sideLength}
        height={sideLength}
      />
    </PieChartLegend>
  );
}
