import { useMemo } from "react";
import { PIE_CHART_SETTINGS } from "metabase/visualizations/visualizations/PieChart/constants";
import type { VisualizationProps } from "metabase/visualizations/types";

import { buildPieChart } from "metabase/visualizations/shared/echarts/pie";
import { measureTextWidth } from "metabase/lib/measure-text";
import { formatValue } from "metabase/lib/formatting/value";
import { color } from "metabase/lib/colors";
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
  const { option, legend } = useMemo(
    () =>
      buildPieChart(props.rawSeries, {
        getColor: color,
        measureText: measureTextWidth,
        formatValue: formatValue,
      }),
    [],
  );

  const { sideLength, onChartDimensionChange } = useChartDimension();

  return (
    <PieChartLegend
      legend={legend}
      onChartDimensionChange={onChartDimensionChange}
      {...props}
    >
      <EChartsRenderer
        config={{ option, eventHandlers: [], zrEventHandlers: [] }}
        width={sideLength}
        height={sideLength}
      />
    </PieChartLegend>
  );
}
