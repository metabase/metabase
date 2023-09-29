import type { ReactNode } from "react";

import type { VisualizationProps } from "metabase/visualizations/types";
import ChartWithLegend from "metabase/visualizations/components/ChartWithLegend";

import type { PieLegendItem } from "metabase/visualizations/shared/echarts/pie/types";
import type { OnChartDimensionChange } from "./utils";

export function PieChartLegend(
  props: VisualizationProps & {
    legend: PieLegendItem[];
    onChartDimensionChange: OnChartDimensionChange;
    children: ReactNode;
  },
) {
  return (
    <ChartWithLegend
      className={props.className}
      legendTitles={props.legend.map(item => item.title)}
      legendColors={props.legend.map(item => item.color)}
      gridSize={props.gridSize}
      hovered={props.hovered}
      showLegend={props.settings["pie.show_legend"]}
      isDashboard={props.isDashboard}
      onChartDimensionChange={props.onChartDimensionChange}
    >
      {props.children}
    </ChartWithLegend>
  );
}
