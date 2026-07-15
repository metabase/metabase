import { measureTextWidth } from "metabase/static-viz/lib/text";
import type { LegendItem } from "metabase/visualizations/echarts/cartesian/model/types";
import { DIMENSIONS } from "metabase/visualizations/echarts/pie/constants";
import type { PieChartFormatters } from "metabase/visualizations/echarts/pie/format";
import type { PieChartModel } from "metabase/visualizations/echarts/pie/model/types";
import { getArrayFromMapValues } from "metabase/visualizations/echarts/pie/util";
import type { ComputedVisualizationSettings } from "metabase/visualizations/types";

import { Legend } from "../Legend";
import {
  DEFAULT_LEGEND_FONT_SIZE,
  DEFAULT_LEGEND_FONT_WEIGHT,
  LEGEND_CIRCLE_MARGIN_RIGHT,
  LEGEND_CIRCLE_SIZE,
  LEGEND_ITEM_MARGIN_RIGHT_GRID,
} from "../Legend/constants";
import {
  calculateLegendRows,
  calculateLegendRowsWithColumns,
} from "../Legend/utils";

function getPieLegendItems(
  chartModel: PieChartModel,
  formatters: PieChartFormatters,
  settings: ComputedVisualizationSettings,
): LegendItem[] {
  const pieChartVisibility = settings["pie.percent_visibility"];

  return getArrayFromMapValues(chartModel.sliceTree)
    .filter((s) => s.includeInLegend)
    .map((s) => ({
      name: s.name,
      percent:
        pieChartVisibility === "legend" || pieChartVisibility === "both"
          ? formatters.formatPercent(s.normalizedPercentage, "legend")
          : undefined,
      color: s.color,
      key: String(s.key),
    }));
}

function measureLegendItemWidth(item: LegendItem): number {
  const fontSize = DEFAULT_LEGEND_FONT_SIZE;
  const fontWeight = DEFAULT_LEGEND_FONT_WEIGHT;
  const percentWidth =
    item.percent != null
      ? measureTextWidth(item.percent, fontSize, fontWeight)
      : 0;
  return (
    LEGEND_CIRCLE_SIZE +
    LEGEND_CIRCLE_MARGIN_RIGHT +
    measureTextWidth(item.name, fontSize, fontWeight) +
    percentWidth
  );
}

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
    items: getPieLegendItems(chartModel, formatters, settings),
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

/**
 * Build a single-column (vertical) legend for placing to the side of the circle. `maxWidth`
 * caps the column width; item names are truncated to fit. Returns the positioned items plus
 * the rendered legend block dimensions.
 */
export function getPieChartSideLegend(
  chartModel: PieChartModel,
  formatters: PieChartFormatters,
  settings: ComputedVisualizationSettings,
  maxWidth: number,
) {
  const items = getPieLegendItems(chartModel, formatters, settings);
  if (items.length === 0) {
    return { items: [], legendHeight: 0, legendWidth: 0 };
  }
  // Budget the column at (at most) the widest item so two items never share a row -> one column.
  const widest = Math.max(...items.map(measureLegendItemWidth));
  const budget = Math.max(1, Math.min(widest, maxWidth));
  const {
    items: positioned,
    height,
    width,
  } = calculateLegendRows({
    items,
    width: budget,
    horizontalPadding: 0,
  });
  return { items: positioned, legendHeight: height, legendWidth: width };
}
