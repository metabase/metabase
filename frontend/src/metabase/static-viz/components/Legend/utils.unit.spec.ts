import { measureTextWidth } from "metabase/static-viz/lib/text";
import type { LegendItem } from "metabase/visualizations/echarts/cartesian/model/types";

import {
  DEFAULT_LEGEND_FONT_SIZE,
  DEFAULT_LEGEND_FONT_WEIGHT,
  LEGEND_CIRCLE_MARGIN_RIGHT,
  LEGEND_CIRCLE_SIZE,
  LEGEND_ITEM_MARGIN_RIGHT_GRID,
} from "./constants";
import { calculateNumRowsCols } from "./utils";

const FONT_SIZE = DEFAULT_LEGEND_FONT_SIZE;
const FONT_WEIGHT = DEFAULT_LEGEND_FONT_WEIGHT;
const MARGIN = LEGEND_ITEM_MARGIN_RIGHT_GRID;

// A width no realistic legend can exceed, so every item fits and column count is bounded only by
// the item count.
const UNCONSTRAINED_WIDTH = 10_000;

const makeItems = (count: number, name = "Category"): LegendItem[] =>
  Array.from({ length: count }, (_, index) => ({
    name,
    color: "#509ee3",
    key: `item-${index}`,
  }));

// The minimum column width at which one item still fits, matching what the function compares against.
const itemSlotWidth = (item: LegendItem): number =>
  LEGEND_CIRCLE_SIZE +
  LEGEND_CIRCLE_MARGIN_RIGHT +
  measureTextWidth(item.name, FONT_SIZE, FONT_WEIGHT) +
  (item.percent != null
    ? measureTextWidth(item.percent, FONT_SIZE, FONT_WEIGHT)
    : 0) +
  MARGIN;

// A box exactly `cols` slots wide, so `cols` columns fit but `cols + 1` do not (items identical).
const widthForColumns = (item: LegendItem, cols: number): number =>
  cols * Math.ceil(itemSlotWidth(item));

const run = (items: LegendItem[], width: number) =>
  calculateNumRowsCols(items, width, FONT_SIZE, FONT_WEIGHT, MARGIN);

describe("calculateNumRowsCols", () => {
  it("puts a single item in one row and one column", () => {
    expect(run(makeItems(1), UNCONSTRAINED_WIDTH)).toEqual({
      numRows: 1,
      numCols: 1,
    });
  });

  it("uses as many columns as items when the box is wide enough", () => {
    expect(run(makeItems(5), UNCONSTRAINED_WIDTH)).toEqual({
      numRows: 1,
      numCols: 5,
    });
  });

  it("uses the most columns that fit without truncation", () => {
    const items = makeItems(4);
    expect(run(items, widthForColumns(items[0], 2))).toEqual({
      numRows: 2,
      numCols: 2,
    });
  });

  it("falls back to a single full-width column when even two columns don't fit", () => {
    // A width smaller than a single item's slot, so even two columns can't fit and the legend falls
    // back to one full-width column.
    const WIDTH_TOO_NARROW_FOR_TWO_COLUMNS = 8;
    expect(run(makeItems(5), WIDTH_TOO_NARROW_FOR_TWO_COLUMNS)).toEqual({
      numRows: 5,
      numCols: 1,
    });
  });

  it("drops a trailing column that would be entirely empty", () => {
    const items = makeItems(5);
    expect(run(items, widthForColumns(items[0], 4))).toEqual({
      numRows: 2,
      numCols: 3,
    });
  });
});
