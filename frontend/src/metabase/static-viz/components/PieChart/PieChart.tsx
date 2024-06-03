import { getPieChartModel } from "metabase/visualizations/echarts/pie/model";

import type { StaticChartProps } from "../StaticVisualization";

import { computeStaticPieChartSettings } from "./settings";

export function PieChart({
  rawSeries,
  dashcardSettings,
  renderingContext,
}: StaticChartProps) {
  const computedVizSettings = computeStaticPieChartSettings(
    rawSeries,
    dashcardSettings,
  );
  const chartModel = getPieChartModel(
    rawSeries,
    computedVizSettings,
    renderingContext,
  );
  console.log("chartModel", chartModel);

  return (
    <svg xmlns="http://www.w3.org/2000/svg" width={500} height={500}>
      <text
        id="outer-text"
        fill="black"
        dominantBaseline="central"
        transform="translate(50 50)"
      >
        Placeholder
      </text>
    </svg>
  );
}
