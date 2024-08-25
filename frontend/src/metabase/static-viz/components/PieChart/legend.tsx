import { DIMENSIONS } from "metabase/visualizations/echarts/pie/constants";
import type { PieChartFormatters } from "metabase/visualizations/echarts/pie/format";
import type { PieChartModel } from "metabase/visualizations/echarts/pie/model/types";
import { getInnerRingSlices } from "metabase/visualizations/echarts/pie/util";
import type { ComputedVisualizationSettings } from "metabase/visualizations/types";

import { Legend } from "../Legend";
import { LEGEND_ITEM_MARGIN_RIGHT_GRID } from "../Legend/constants";
import { calculateLegendRowsWithColumns } from "../Legend/utils";

export function getPieChartLegend(
  chartModel: PieChartModel,
  formatters: PieChartFormatters,
  settings: ComputedVisualizationSettings,
) {
  const {
    height: legendHeight,
    width: legendWidth,
    items,
  } = calculateLegendRowsWithColumns({
    items: getInnerRingSlices(chartModel)
      .filter(s => s.includeInLegend)
      .map(s => {
        return {
          name: s.name,
          percent:
            settings["pie.percent_visibility"] === "legend" ||
            settings["pie.percent_visibility"] === "both"
              ? formatters.formatPercent(s.normalizedPercentage, "legend")
              : undefined,
          color: s.color,
          key: String(s.key),
        };
      }),
    width: DIMENSIONS.maxSideLength,
    horizontalPadding: DIMENSIONS.padding.side,
  });

  return {
    legendHeight,
    Legend: () => (
      <Legend
        items={items}
        top={DIMENSIONS.maxSideLength + DIMENSIONS.padding.legend}
        left={
          (DIMENSIONS.maxSideLength -
            DIMENSIONS.padding.side * 2 -
            legendWidth) /
          2
        }
        legendItemMarginRight={LEGEND_ITEM_MARGIN_RIGHT_GRID}
      />
    ),
  };
}
