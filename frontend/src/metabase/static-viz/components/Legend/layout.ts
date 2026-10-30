import _ from "underscore";

import { getChartHeight } from "metabase/static-viz/lib/utils";
import type { LegendItem, Padding } from "metabase/viz-core";

import {
  DEFAULT_LEGEND_FONT_SIZE,
  DEFAULT_LEGEND_FONT_WEIGHT,
  LEGEND_PADDING,
} from "./constants";
import type { PositionedLegendItem } from "./types";
import { calculateItemWidth, calculateLegendRows } from "./utils";

// A legend that fits within bounds trades height with the chart, whose plot
// can shift with its height; this caps the passes should the two never agree.
const MAX_LAYOUT_PASSES = 3;

/** The horizontal span the chart draws its plot in, between the axes. */
export interface PlotBounds {
  left: number;
  width: number;
}

export interface BottomLegend {
  height: number;
  items: PositionedLegendItem[];
}

const EMPTY_LEGEND: BottomLegend = { height: 0, items: [] };

export const getPlotBounds = (
  padding: Pick<Padding, "left" | "right">,
  chartWidth: number,
): PlotBounds => ({
  left: padding.left,
  width: Math.max(chartWidth - padding.left - padding.right, 0),
});

interface BottomLegendInput {
  items: LegendItem[];
  chartWidth: number;
  plot: PlotBounds;
  isReversed?: boolean;
}

/**
 * Lays every legend item out in rows centered under the plot, as the
 * interactive bottom legend is. Items wrap onto further rows rather than
 * hiding behind a "+ N more" a static image cannot open. Only when the plot
 * is too narrow for an item the whole chart width fits do the rows span the
 * chart instead, as the interactive legend also gives up its indent then.
 */
export function calculateBottomLegend({
  items,
  chartWidth,
  plot,
  isReversed,
}: BottomLegendInput): BottomLegend {
  if (items.length === 0) {
    return EMPTY_LEGEND;
  }

  const layoutRows = (width: number) =>
    calculateLegendRows({
      items,
      width,
      verticalPadding: LEGEND_PADDING,
      isReversed,
    });

  const plotRows = layoutRows(plot.width);
  if (!hasTruncatedItem(plotRows.items, items, isReversed)) {
    return centerRows(plotRows, plot);
  }

  const chartBounds: PlotBounds = {
    left: LEGEND_PADDING,
    width: chartWidth - LEGEND_PADDING * 2,
  };
  const chartRows = layoutRows(chartBounds.width);
  return hasTruncatedItem(chartRows.items, items, isReversed)
    ? centerRows(plotRows, plot)
    : centerRows(chartRows, chartBounds);
}

function hasTruncatedItem(
  positionedItems: PositionedLegendItem[],
  items: LegendItem[],
  isReversed?: boolean,
): boolean {
  const orderedItems = isReversed ? [...items].reverse() : items;
  return positionedItems.some(
    (item, index) => item.name !== orderedItems[index].name,
  );
}

function centerRows(
  { height, items }: ReturnType<typeof calculateLegendRows>,
  bounds: PlotBounds,
): BottomLegend {
  const rows = Object.values(_.groupBy(items, "top"));
  const centeredItems = rows.flatMap((row) => {
    const first = row[0];
    const last = row[row.length - 1];
    const rowWidth =
      last.left +
      calculateItemWidth(
        last,
        DEFAULT_LEGEND_FONT_SIZE,
        DEFAULT_LEGEND_FONT_WEIGHT,
      ) -
      first.left;
    const offset =
      bounds.left + Math.max(bounds.width - rowWidth, 0) / 2 - first.left;
    return row.map((item) => ({ ...item, left: item.left + offset }));
  });
  return { height, items: centeredItems };
}

interface ChartWithBottomLegendInput<TLayout> extends Omit<
  BottomLegendInput,
  "plot"
> {
  height: number;
  fitWithinBounds: boolean;
  getLayout: (chartHeight: number) => TLayout;
  getPlot: (layout: TLayout) => PlotBounds;
}

export interface ChartWithBottomLegend<TLayout> {
  chartHeight: number;
  /** The chart's layout at `chartHeight`, to draw it with. */
  layout: TLayout;
  legend: BottomLegend;
}

/**
 * The legend below a chart, the height the chart keeps and its layout at that
 * height. The legend lines up with the plot of that layout, which with
 * `fitWithinBounds` is the height the legend leaves the chart.
 */
export function layoutChartWithBottomLegend<TLayout>({
  height,
  fitWithinBounds,
  getLayout,
  getPlot,
  ...legendInput
}: ChartWithBottomLegendInput<TLayout>): ChartWithBottomLegend<TLayout> {
  let chartHeight = getChartHeight({
    fitWithinBounds,
    height,
    legendHeight: 0,
  });
  let layout = getLayout(chartHeight);
  let legend = EMPTY_LEGEND;

  for (let pass = 0; pass < MAX_LAYOUT_PASSES; pass++) {
    legend = calculateBottomLegend({
      ...legendInput,
      plot: getPlot(layout),
    });
    const nextChartHeight = getChartHeight({
      fitWithinBounds,
      height,
      legendHeight: legend.height,
    });
    if (nextChartHeight === chartHeight) {
      break;
    }
    chartHeight = nextChartHeight;
    layout = getLayout(chartHeight);
  }

  return { chartHeight, layout, legend };
}
