import type { ReactNode } from "react";

import type { VisualizationProps } from "metabase/visualizations/types";
import ChartWithLegend from "metabase/visualizations/components/ChartWithLegend";

import {
  computeLegendDecimals,
  formatPercent,
} from "metabase/visualizations/visualizations/PieChart/utils";
import type { PieLegendItem } from "metabase/visualizations/shared/echarts/pie/types";
import { formatDimension, getSlices } from "./utils";
import type { OnChartDimensionChange } from "./utils";

export function PieChartLegend(
  props: VisualizationProps & {
    legend: PieLegendItem[];
    onChartDimensionChange: OnChartDimensionChange;
    children: ReactNode;
  },
) {
  // TODO clean this code up, maybe reuse logic with showPercentages mixin
  const slices = getSlices({ props });
  const percentages = slices.map(s => s.percentage);
  const legendDecimals = computeLegendDecimals({ percentages });

  const legendTitles = slices.map(s => [
    s.key === "Other" ? s.key : formatDimension({ value: s.key, props }),
    props.settings["pie.percent_visibility"] === "legend"
      ? formatPercent({
          percent: s.percentage,
          decimals: legendDecimals ?? 0,
          settings: props.settings,
          cols: props.data.cols,
        })
      : undefined,
  ]);
  const legendColors = slices.map(s => s.color);

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
