import type { PieChartFormatters } from "metabase/visualizations/echarts/pie/format";
import type { PieChartModel } from "metabase/visualizations/echarts/pie/model/types";
import type { ComputedVisualizationSettings } from "metabase/visualizations/types";

import { Legend } from "../Legend";
import { calculateLegendRowsWithColumns } from "../Legend/utils";

export function getPieChartLegend(
  chartModel: PieChartModel,
  formatters: PieChartFormatters,
  settings: ComputedVisualizationSettings,
  width: number,
  top: number,
) {
  const { height: legendHeight, items } = calculateLegendRowsWithColumns({
    items: chartModel.slices.map(s => {
      const label =
        s.key === "Other" ? s.key : formatters.formatDimension(s.key);

      return {
        name: label,
        percent:
          settings["pie.percent_visibility"] === "legend"
            ? formatters.formatPercent(s.normalizedPercentage, "legend")
            : undefined,
        color: s.color,
        key: String(s.key),
      };
    }),
    width,
  });

  return {
    legendHeight,
    Legend: () => <Legend items={items} top={top} />,
  };
}
