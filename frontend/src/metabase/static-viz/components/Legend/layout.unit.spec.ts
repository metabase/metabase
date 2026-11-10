import { measureTextWidth } from "metabase/static-viz/lib/text";
import type { LegendItem } from "metabase/viz-core";

import {
  DEFAULT_LEGEND_FONT_SIZE,
  DEFAULT_LEGEND_FONT_WEIGHT,
  DEFAULT_LEGEND_LINE_HEIGHT,
  LEGEND_CIRCLE_MARGIN_RIGHT,
  LEGEND_CIRCLE_SIZE,
  LEGEND_ITEM_MARGIN_RIGHT,
  LEGEND_PADDING,
} from "./constants";
import {
  type PlotBounds,
  calculateBottomLegend,
  getPlotBounds,
  layoutChartWithBottomLegend,
} from "./layout";

const makeItems = (names: string[]): LegendItem[] =>
  names.map((name, index) => ({
    name,
    color: "#509ee3",
    key: `item-${index}`,
  }));

const itemWidth = (name: string) =>
  LEGEND_CIRCLE_SIZE +
  LEGEND_CIRCLE_MARGIN_RIGHT +
  measureTextWidth(name, DEFAULT_LEGEND_FONT_SIZE, DEFAULT_LEGEND_FONT_WEIGHT);

const rowWidth = (names: string[]) =>
  names.reduce((total, name) => total + itemWidth(name), 0) +
  LEGEND_ITEM_MARGIN_RIGHT * (names.length - 1);

const CHART_WIDTH = 540;
const PLOT: PlotBounds = { left: 60, width: 440 };

const rowsOf = (legend: ReturnType<typeof calculateBottomLegend>) =>
  Object.values(
    legend.items.reduce<Record<number, string[]>>((rows, item) => {
      (rows[item.top] ??= []).push(item.key);
      return rows;
    }, {}),
  );

describe("getPlotBounds", () => {
  it("spans the chart between its left and right padding", () => {
    expect(getPlotBounds({ left: 50, right: 30 }, CHART_WIDTH)).toEqual({
      left: 50,
      width: 460,
    });
  });

  it("never reports a negative width", () => {
    expect(getPlotBounds({ left: 400, right: 400 }, 540)).toEqual({
      left: 400,
      width: 0,
    });
  });
});

describe("calculateBottomLegend", () => {
  it("is empty without items", () => {
    expect(
      calculateBottomLegend({ items: [], chartWidth: CHART_WIDTH, plot: PLOT }),
    ).toEqual({ height: 0, items: [] });
  });

  it("centers a single row under the plot", () => {
    const names = ["Count", "Average of Total"];
    const legend = calculateBottomLegend({
      items: makeItems(names),
      chartWidth: CHART_WIDTH,
      plot: PLOT,
    });

    const expectedLeft = PLOT.left + (PLOT.width - rowWidth(names)) / 2;
    expect(legend.items.map((item) => item.name)).toEqual(names);
    expect(legend.items[0].left).toBeCloseTo(expectedLeft);
    expect(legend.items[1].left).toBeCloseTo(
      expectedLeft + itemWidth(names[0]) + LEGEND_ITEM_MARGIN_RIGHT,
    );
    expect(legend.items.every((item) => item.top === LEGEND_PADDING)).toBe(
      true,
    );
    expect(legend.height).toBe(DEFAULT_LEGEND_LINE_HEIGHT + LEGEND_PADDING * 2);
  });

  it("wraps items onto further rows inside the plot, keeping every item", () => {
    // Equal names make equal item widths, so the plot fits exactly two per row.
    const names = Array<string>(6).fill("Series");
    const plot: PlotBounds = { left: 60, width: rowWidth(names.slice(0, 2)) };
    const legend = calculateBottomLegend({
      items: makeItems(names),
      chartWidth: CHART_WIDTH,
      plot,
    });

    expect(rowsOf(legend)).toEqual([
      ["item-0", "item-1"],
      ["item-2", "item-3"],
      ["item-4", "item-5"],
    ]);
    expect(legend.height).toBe(
      3 * DEFAULT_LEGEND_LINE_HEIGHT + LEGEND_PADDING * 2,
    );
  });

  it("centers each wrapped row within the plot", () => {
    const names = ["Series", "Series", "Series"];
    const plot: PlotBounds = { left: 60, width: rowWidth(names.slice(0, 2)) };
    const legend = calculateBottomLegend({
      items: makeItems(names),
      chartWidth: CHART_WIDTH,
      plot,
    });

    const [first, , third] = legend.items;
    expect(first.left).toBeCloseTo(plot.left);
    expect(third.left).toBeCloseTo(
      plot.left + (plot.width - itemWidth("Series")) / 2,
    );
    expect(third.top).toBe(LEGEND_PADDING + DEFAULT_LEGEND_LINE_HEIGHT);
  });

  it("reverses the item order when asked", () => {
    const legend = calculateBottomLegend({
      items: makeItems(["First", "Second", "Third"]),
      chartWidth: CHART_WIDTH,
      plot: PLOT,
      isReversed: true,
    });

    expect(legend.items.map((item) => item.name)).toEqual([
      "Third",
      "Second",
      "First",
    ]);
    expect(legend.items[0].left).toBeLessThan(legend.items[2].left);
  });

  it("spans the chart when the plot is too narrow for an item the chart fits", () => {
    const names = ["A rather long series name", "Short"];
    const plot: PlotBounds = { left: 100, width: itemWidth(names[0]) - 20 };
    const legend = calculateBottomLegend({
      items: makeItems(names),
      chartWidth: CHART_WIDTH,
      plot,
    });

    const chartWidth = CHART_WIDTH - LEGEND_PADDING * 2;
    expect(legend.items.map((item) => item.name)).toEqual(names);
    expect(legend.items[0].left).toBeCloseTo(
      LEGEND_PADDING + (chartWidth - rowWidth(names)) / 2,
    );
  });

  it("stays under the plot, truncating, when an item fits neither", () => {
    const name = "A series name far too long to fit anywhere in this chart";
    const plot: PlotBounds = { left: 60, width: 200 };
    const legend = calculateBottomLegend({
      items: makeItems([name]),
      chartWidth: 300,
      plot,
    });

    expect(legend.items).toHaveLength(1);
    expect(legend.items[0].name).not.toBe(name);
    expect(legend.items[0].name.endsWith("…")).toBe(true);
    expect(legend.items[0].left).toBeGreaterThanOrEqual(plot.left);
    expect(
      legend.items[0].left + itemWidth(legend.items[0].name),
    ).toBeLessThanOrEqual(plot.left + plot.width);
  });
});

describe("layoutChartWithBottomLegend", () => {
  const items = makeItems(["Count", "Sum"]);
  const legendHeight = DEFAULT_LEGEND_LINE_HEIGHT + LEGEND_PADDING * 2;
  // a stand-in chart layout: the plot, keyed by the height it was laid out at
  const layoutAt = (chartHeight: number, plot: PlotBounds = PLOT) => ({
    chartHeight,
    plot,
  });
  const getPlot = ({ plot }: ReturnType<typeof layoutAt>) => plot;

  it("keeps the chart height and adds the legend below when not fitting within bounds", () => {
    const getLayout = jest.fn((chartHeight: number) => layoutAt(chartHeight));
    const result = layoutChartWithBottomLegend({
      items,
      chartWidth: CHART_WIDTH,
      height: 360,
      fitWithinBounds: false,
      getLayout,
      getPlot,
    });

    expect(result.chartHeight).toBe(360);
    expect(result.layout).toEqual(layoutAt(360));
    expect(result.legend.height).toBe(legendHeight);
    expect(getLayout).toHaveBeenCalledTimes(1);
  });

  it("gives the legend's height to the chart when fitting within bounds", () => {
    const result = layoutChartWithBottomLegend({
      items,
      chartWidth: CHART_WIDTH,
      height: 360,
      fitWithinBounds: true,
      getLayout: layoutAt,
      getPlot,
    });

    expect(result.chartHeight).toBe(360 - legendHeight);
    expect(result.layout).toEqual(layoutAt(360 - legendHeight));
    expect(result.legend.height).toBe(legendHeight);
  });

  it("lays the legend out against the plot of the final chart height", () => {
    const narrowPlot: PlotBounds = { left: 100, width: 80 };
    const result = layoutChartWithBottomLegend({
      items,
      chartWidth: CHART_WIDTH,
      height: 360,
      fitWithinBounds: true,
      getLayout: (chartHeight) =>
        layoutAt(chartHeight, chartHeight === 360 ? narrowPlot : PLOT),
      getPlot,
    });

    const names = items.map((item) => item.name);
    expect(result.chartHeight).toBe(360 - legendHeight);
    expect(result.legend.items[0].left).toBeCloseTo(
      PLOT.left + (PLOT.width - rowWidth(names)) / 2,
    );
  });

  it("has no legend and keeps the full height without items", () => {
    const result = layoutChartWithBottomLegend({
      items: [],
      chartWidth: CHART_WIDTH,
      height: 360,
      fitWithinBounds: true,
      getLayout: layoutAt,
      getPlot,
    });

    expect(result).toEqual({
      chartHeight: 360,
      layout: layoutAt(360),
      legend: { height: 0, items: [] },
    });
  });
});
