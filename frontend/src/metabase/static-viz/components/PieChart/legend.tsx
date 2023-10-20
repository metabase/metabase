import type { ComputedVisualizationSettings } from "metabase/visualizations/types";
import type { PieChartFormatters } from "metabase/visualizations/echarts/pie/format";
import type { PieChartModel } from "metabase/visualizations/echarts/pie/model/types";

import { calculateLegendRows } from "../Legend/utils";
import { Legend } from "../Legend";

export function getPieChartLegend(
  chartModel: PieChartModel,
  formatters: PieChartFormatters,
  settings: ComputedVisualizationSettings,
  width: number,
  top: number,
) {
  if (!settings["pie.show_legend"]) {
    return { legendHeight: 0, Legend: () => null };
  }

  const legendRows = calculateLegendRows(
    chartModel.slices.map(s => ({
      name:
        settings["pie.percent_visibility"] === "legend"
          ? `${s.key} - ${formatters.formatPercent(s.normalizedPercentage)}`
          : s.key,
      color: s.color,
    })),
    width,
    24,
    18,
    400,
  );
  if (!legendRows) {
    throw Error("Error calculating legend rows");
  }

  const { height: legendHeight, items } = legendRows;

  return {
    legendHeight,
    Legend: () => (
      <Legend items={items} top={top} fontSize={18} fontWeight={400} />
    ),
  };
}
