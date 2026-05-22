import { DIMENSIONS } from "metabase/visualizations/echarts/pie/constants";
import {
  type PieChartFormatters,
  getPiePercentDecimals,
} from "metabase/visualizations/echarts/pie/format";
import type { PieChartModel } from "metabase/visualizations/echarts/pie/model/types";
import { getArrayFromMapValues } from "metabase/visualizations/echarts/pie/util";
import { reconcilePercentagesIfNeeded } from "metabase/visualizations/lib/percent";
import type { ComputedVisualizationSettings } from "metabase/visualizations/types";

import { Legend } from "../Legend";
import { LEGEND_ITEM_MARGIN_RIGHT_GRID } from "../Legend/constants";
import { calculateLegendRowsWithColumns } from "../Legend/utils";

export function getPieChartLegend(
  chartModel: PieChartModel,
  formatters: PieChartFormatters,
  settings: ComputedVisualizationSettings,
) {
  const legendSlices = getArrayFromMapValues(chartModel.sliceTree).filter(
    (s) => s.includeInLegend,
  );
  const rawPercentages = legendSlices.map((s) => s.normalizedPercentage);
  const decimals = getPiePercentDecimals(chartModel, settings, "legend");
  const adjustedPercentages =
    decimals !== undefined
      ? reconcilePercentagesIfNeeded(rawPercentages, decimals)
      : [...rawPercentages];

  const {
    height: legendHeight,
    width: legendWidth,
    items,
  } = calculateLegendRowsWithColumns({
    items: legendSlices.map((s, index) => {
      return {
        name: s.name,
        percent:
          settings["pie.percent_visibility"] === "legend" ||
          settings["pie.percent_visibility"] === "both"
            ? formatters.formatPercent(adjustedPercentages[index], "legend")
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
