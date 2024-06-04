import type { PieChartFormatters } from "metabase/visualizations/echarts/pie/format";
import type { PieChartModel } from "metabase/visualizations/echarts/pie/model/types";
import type { ComputedVisualizationSettings } from "metabase/visualizations/types";

import { Legend } from "../Legend";
import { calculateLegendRows } from "../Legend/utils";

const FONT = {
  lineHeight: 20,
  size: 14,
  weight: 700,
};

export function getPieChartLegend(
  chartModel: PieChartModel,
  formatters: PieChartFormatters,
  settings: ComputedVisualizationSettings,
  width: number,
  top: number,
) {
  if (!settings["pie.show_legend"] || chartModel.slices.length <= 1) {
    return { legendHeight: 0, Legend: () => null };
  }

  const legendRows = calculateLegendRows({
    items: chartModel.slices.map(s => ({
      name:
        settings["pie.percent_visibility"] === "legend"
          ? `${s.key} - ${formatters.formatPercent(s.normalizedPercentage)}`
          : s.key,
      color: s.color,
      key: s.key,
    })),
    width,
    lineHeight: FONT.lineHeight,
    fontSize: FONT.size,
    fontWeight: FONT.weight,
  });
  if (!legendRows) {
    throw Error("Error calculating legend rows");
  }

  const { height: legendHeight, items } = legendRows;

  return {
    legendHeight,
    Legend: () => (
      <Legend
        items={items}
        top={top}
        fontSize={FONT.size}
        fontWeight={FONT.weight}
      />
    ),
  };
}
