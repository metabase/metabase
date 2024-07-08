import {
  DIMENSIONS,
  OTHER_SLICE_KEY,
} from "metabase/visualizations/echarts/pie/constants";
import type { PieChartFormatters } from "metabase/visualizations/echarts/pie/format";
import type { PieChartModel } from "metabase/visualizations/echarts/pie/model/types";
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
    items: chartModel.slices
      .filter(s => s.data.includeInLegend)
      .map(s => {
        const label = s.data.isOther
          ? OTHER_SLICE_KEY // need to use this instead of `s.data.key` to ensure type is string
          : formatters.formatDimension(s.data.key);

        return {
          name: label,
          percent:
            settings["pie.percent_visibility"] === "legend"
              ? formatters.formatPercent(s.data.normalizedPercentage, "legend")
              : undefined,
          color: s.data.color,
          key: String(s.data.key),
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
