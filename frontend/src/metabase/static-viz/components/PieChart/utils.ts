import { init } from "echarts/core";
import { t } from "ttag";

import { sanitizeSvgForBatik } from "metabase/static-viz/lib/svg";
import { measureTextWidth } from "metabase/static-viz/lib/text";
import { registerEChartsModules } from "metabase/visualizations/echarts";
import type { LegendItem } from "metabase/visualizations/echarts/cartesian/model/types";
import { DIMENSIONS } from "metabase/visualizations/echarts/pie/constants";
import type { PieChartFormatters } from "metabase/visualizations/echarts/pie/format";
import type { PieChartModel } from "metabase/visualizations/echarts/pie/model/types";
import type { getPieChartOption } from "metabase/visualizations/echarts/pie/option";
import { getArrayFromMapValues } from "metabase/visualizations/echarts/pie/util";
import type {
  ComputedVisualizationSettings,
  RenderingContext,
} from "metabase/visualizations/types";

import {
  DEFAULT_LEGEND_FONT_SIZE,
  DEFAULT_LEGEND_FONT_WEIGHT,
  DEFAULT_LEGEND_LINE_HEIGHT,
  LEGEND_CIRCLE_MARGIN_RIGHT,
  LEGEND_CIRCLE_SIZE,
  LEGEND_ITEM_MARGIN_RIGHT_GRID,
} from "../Legend/constants";
import {
  calculateLegendRows,
  calculateLegendRowsWithColumns,
  calculateNumRowsCols,
} from "../Legend/utils";

registerEChartsModules();

// Synthetic key for the "And N more" legend overflow row.
const MORE_LEGEND_KEY = "___PIE_LEGEND_MORE___";

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

function moreLegendItem(
  count: number,
  renderingContext: RenderingContext,
): LegendItem {
  return {
    name: t`And ${count} more`,
    color: renderingContext.getColor("text-secondary"),
    key: MORE_LEGEND_KEY,
  };
}

/**
 * Lay out a wrapped multi-column legend for below the circle. `maxWidth` caps the grid width;
 * given a `maxHeight`, overflow collapses into a final "And N more" cell. Returns positioned
 * items plus the rendered block dimensions.
 */
export function getPieChartBottomLegendLayout(
  chartModel: PieChartModel,
  formatters: PieChartFormatters,
  settings: ComputedVisualizationSettings,
  maxWidth: number = DIMENSIONS.maxSideLength,
  maxHeight?: number,
  renderingContext?: RenderingContext,
) {
  const horizontalPadding = DIMENSIONS.padding.side;
  let items = getPieLegendItems(chartModel, formatters, settings);

  if (maxHeight != null && renderingContext != null && items.length > 0) {
    // The height budget caps rows (hence items); the rest collapse into "And N more".
    const { numCols } = calculateNumRowsCols(
      items,
      maxWidth - 2 * horizontalPadding,
      DEFAULT_LEGEND_FONT_SIZE,
      DEFAULT_LEGEND_FONT_WEIGHT,
      LEGEND_ITEM_MARGIN_RIGHT_GRID,
    );
    const maxRows = Math.max(
      1,
      Math.floor(maxHeight / DEFAULT_LEGEND_LINE_HEIGHT),
    );
    const maxItems = maxRows * numCols;
    if (items.length > maxItems) {
      items = [
        ...items.slice(0, maxItems - 1),
        moreLegendItem(items.length - (maxItems - 1), renderingContext),
      ];
    }
  }

  const {
    height: legendHeight,
    width: legendWidth,
    items: positioned,
  } = calculateLegendRowsWithColumns({
    items,
    width: maxWidth,
    horizontalPadding,
  });

  return { items: positioned, legendHeight, legendWidth };
}

/**
 * Lay out a single-column legend for beside the circle. `maxWidth` caps the column width,
 * `maxHeight` the row count; overflow collapses into a final "And N more" row. Returns
 * positioned items plus the rendered block dimensions.
 */
export function getPieChartSideLegendLayout(
  chartModel: PieChartModel,
  formatters: PieChartFormatters,
  settings: ComputedVisualizationSettings,
  maxWidth: number,
  maxHeight: number,
  renderingContext: RenderingContext,
) {
  let items = getPieLegendItems(chartModel, formatters, settings);
  if (items.length === 0) {
    return { items: [], legendHeight: 0, legendWidth: 0 };
  }

  const maxRows = Math.max(
    1,
    Math.floor(maxHeight / DEFAULT_LEGEND_LINE_HEIGHT),
  );
  if (items.length > maxRows) {
    const shown = items.slice(0, maxRows - 1);
    items = [
      ...shown,
      moreLegendItem(items.length - shown.length, renderingContext),
    ];
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

export function renderPieSvg(
  option: ReturnType<typeof getPieChartOption>,
  side: number,
  isStorybook?: boolean,
) {
  const chart = init(null, null, {
    renderer: "svg",
    ssr: true,
    width: side,
    height: side,
  });
  chart.setOption(option);
  const chartSvg = sanitizeSvgForBatik(
    chart.renderToSVGString(),
    isStorybook ?? false,
  );
  chart.dispose();
  return chartSvg;
}
