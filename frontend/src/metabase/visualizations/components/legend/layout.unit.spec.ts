import type { LegendPosition } from "metabase-types/api";

import type { LegendItemData } from "./LegendItem";
import { LEGEND_PADDING } from "./constants";
import {
  MIN_CHART_SIDE_MARGIN,
  MIN_LEGEND_CARD_WIDTH,
  getLegendLayout,
  getLegendMargins,
} from "./layout";
import { measureLegend } from "./measure";
import { type ChartSize, mapLegendCandidates } from "./plots";
import { LEGEND_SIZES, type LegendSizeTier } from "./sizes";

const CHAR_WIDTH = 6;
const MIN_PLOT_WIDTH = 150;
const SM = LEGEND_SIZES.smallCard;
const ROW_HEIGHT =
  SM.fontSize * SM.lineHeight +
  SM.contentMargin.bottomLegend.top +
  SM.contentMargin.bottomLegend.bottom +
  LEGEND_PADDING * 2;

const measureText = (text: string) => text.length * CHAR_WIDTH;

const createItems = (names: string[]): LegendItemData[] =>
  names.map((name) => ({ key: name, name, color: "red" }));

const getItemWidth = (name: string) =>
  SM.dotSize + SM.dotGap + measureText(name);

const getRowWidth = (names: string[]) =>
  names.reduce((total, name) => total + getItemWidth(name), 0) +
  SM.itemGap * (names.length - 1);

// the smallest card whose row holds every item without the y-axis indent
const getCardWidthForRow = (names: string[]) =>
  SM.horizontalClearance * 2 + LEGEND_PADDING * 2 + getRowWidth(names);

const getColumnSpace = (columnItemWidth: number) =>
  columnItemWidth + LEGEND_PADDING * 2 + SM.contentMargin.rightLegend.left;

const createSeriesNames = (count: number) =>
  Array.from({ length: count }, (_, i) => `series ${i}`);

// 3 of 4 labels are cut in any column narrower than 254px
const MOSTLY_TRUNCATED_NAMES = [
  "a".repeat(40),
  "b".repeat(40),
  "c".repeat(40),
  "d".repeat(10),
];

// 26px items, narrower than the column's "+ N more" label
const TWO_DIGIT_NAMES = Array.from({ length: 20 }, (_, i) =>
  `${i}`.padStart(2, "0"),
);

const SHORT_CARD = { width: 300, height: 60 };

interface LayoutOpts {
  position?: LegendPosition;
  width?: number;
  height?: number;
  chartAreaHeight?: number;
  size?: LegendSizeTier;
  // the plot's y-axis indent at every size
  indent?: number;
  plotInset?: ChartSize;
  // the narrowest chart that still draws its x-axis labels
  minXAxisLabelsWidth?: number;
  alwaysVisible?: boolean;
  isReversed?: boolean;
}

const layout = (
  names: string[],
  {
    position = "auto",
    width = 600,
    height = 300,
    chartAreaHeight,
    size = "smallCard",
    indent = 0,
    plotInset = { width: 0, height: 0 },
    minXAxisLabelsWidth = 0,
    alwaysVisible,
    isReversed,
  }: LayoutOpts = {},
) => {
  const metrics = measureLegend({
    items: createItems(names),
    width,
    height,
    chartRoom:
      chartAreaHeight === undefined
        ? undefined
        : { width, height: chartAreaHeight },
    size,
    fontFamily: "Lato",
    measureText,
    isReversed,
  });
  const plots = mapLegendCandidates(metrics.chartSizes, (chart) => ({
    width: chart.width - plotInset.width,
    height: chart.height - plotInset.height,
    hasXAxisLabels: chart.width >= minXAxisLabelsWidth,
    indent,
    internalInset: { left: 0, right: 0 },
  }));
  return getLegendLayout(metrics, { position, plots, alwaysVisible });
};

const row = (
  visibleCount: number,
  { isBeforeChart = false, indent = 0 } = {},
) => ({
  type: "horizontal",
  isBeforeChart,
  indent,
  visibleCount,
});

const HIDDEN = { type: "hidden" };

describe("getLegendLayout", () => {
  it("should hide the legend when there are no items", () => {
    expect(layout([])).toEqual(HIDDEN);
  });

  it("should hide the legend when the position is off", () => {
    expect(layout(["a", "b"], { position: "off" })).toEqual(HIDDEN);
  });
});

describe("getLegendLayout auto", () => {
  it("should hide a row that leaves a short card's plot under 60% of its height", () => {
    // 300 x 44 plot, 14.2 under a row; no column under 100px
    expect(layout(["first", "second"], SHORT_CARD)).toEqual(HIDDEN);
  });

  describe("weighing a row against a column", () => {
    // the column takes "second" = 8 + 6 + 36 = 50px + 2 * 2 padding + 24 gap
    const plotInset = { width: 0, height: 20 };

    it("should move the legend to a right column on a wide short card", () => {
      // row plot 900 x 50.2, column plot 822 x 80: 50.2 < 80 * 75%
      expect(
        layout(["first", "second"], {
          width: 900,
          chartAreaHeight: 100,
          plotInset,
        }),
      ).toMatchObject({ type: "vertical", isBeforeChart: false });
    });

    it("should keep the row when the column leaves at most a third more height", () => {
      // row plot 900 x 150.2, column plot 822 x 180: 150.2 >= 180 * 75%
      expect(
        layout(["first", "second"], {
          width: 900,
          chartAreaHeight: 200,
          plotInset,
        }),
      ).toEqual(row(2));
    });

    it("should count only the height a narrow plot can use", () => {
      // column plot (259 - 78) x 97 uses 181 / 3 = 60.3, row plot 259 x 67.2 all of it
      expect(
        layout(["first", "second"], {
          width: 259,
          chartAreaHeight: 131,
          plotInset: { width: 0, height: 34 },
        }),
      ).toEqual(row(2));
    });
  });

  describe("when a column would hide the x-axis labels", () => {
    // the 8x4 card with 90-degree labels: bare plot 311 x 48
    const CRAMPED_CARD = {
      width: 311,
      chartAreaHeight: 131,
      plotInset: { width: 0, height: 83 },
    };

    it("should hide the legend when a row leaves the plot under 60% of its height", () => {
      // row plot 311 x 18.2 < 48 * 60%, column chart 233px wide
      expect(
        layout(["first", "second"], {
          ...CRAMPED_CARD,
          minXAxisLabelsWidth: 300,
        }),
      ).toEqual(HIDDEN);
    });

    it("should show the column when it keeps the labels", () => {
      expect(
        layout(["first", "second"], {
          ...CRAMPED_CARD,
          minXAxisLabelsWidth: 200,
        }),
      ).toMatchObject({ type: "vertical" });
    });

    it("should not count labels the bare chart hides too", () => {
      expect(
        layout(["first", "second"], {
          ...CRAMPED_CARD,
          plotInset: { width: 0, height: 34 },
          minXAxisLabelsWidth: 1000,
        }),
      ).toEqual(row(2));
    });
  });

  it("should size the chart beside each candidate", () => {
    const { chartSizes } = measureLegend({
      items: createItems(createSeriesNames(10)),
      width: 420,
      height: 300,
      chartRoom: { width: 420, height: 200 },
      size: "smallCard",
      fontFamily: "Lato",
      measureText,
    });

    expect(chartSizes).toEqual({
      none: { width: 420, height: 200 },
      row: { width: 420, height: 200 - ROW_HEIGHT },
      column: { width: 420 - getColumnSpace(62), height: 200 },
    });
  });

  it("should switch to a right column when the row overflows and the plot keeps 150px", () => {
    // item = 8 + 6 + 8 * 6 = 62, 10 items + 9 * 12 gap = 728 > 388
    expect(layout(createSeriesNames(10), { width: 420, height: 400 })).toEqual({
      type: "vertical",
      isBeforeChart: false,
      width: 62 + LEGEND_PADDING * 2,
      visibleCount: 10,
    });
  });

  describe("when a column would leave the plot under 150px", () => {
    // (200 - 32) * 25% = 42px column, 200 - 70 = 130 < 150
    const NARROW_CARD = { width: 200, height: 300 };

    it("should fall back to a partial bottom row with at least 2 items", () => {
      const names = Array.from({ length: 10 }, (_, i) => `s${i}`);
      // item = 8 + 6 + 2 * 6 = 26, 3 items + 2 gaps + 12 gap + "+ 7 more" 48 = 162 <= 164
      expect(layout(names, NARROW_CARD)).toEqual(row(3));
    });

    it("should hide the legend when the row fits only 1 item", () => {
      // item = 62, 2 items + gap + 12 gap + "+ 8 more" 48 = 196 > 164
      expect(layout(createSeriesNames(10), NARROW_CARD)).toEqual(HIDDEN);
    });
  });

  it("should show a column with most labels truncated on cards at least 420px wide", () => {
    // 25% of (420 - 32) = 97px column
    expect(
      layout(MOSTLY_TRUNCATED_NAMES, { width: MIN_LEGEND_CARD_WIDTH }),
    ).toEqual({
      type: "vertical",
      isBeforeChart: false,
      width: 97 + LEGEND_PADDING * 2,
      visibleCount: 4,
    });
  });

  it("should skip a column with most labels truncated on narrower cards", () => {
    // the row then fits one 254px item, under the 2 Auto needs
    expect(
      layout(MOSTLY_TRUNCATED_NAMES, { width: MIN_LEGEND_CARD_WIDTH - 1 }),
    ).toEqual(HIDDEN);
  });

  it("should keep a column when at most half of the labels are truncated", () => {
    // 25% of 368 = 92, label room = 78 → 13 chars fit
    const names = [
      "a".repeat(40),
      "b".repeat(40),
      "c".repeat(10),
      "d".repeat(10),
    ];
    expect(layout(names, { width: 400 })).toMatchObject({
      type: "vertical",
      visibleCount: 4,
    });
  });

  it("should leave the y-axis indent when the row fits only across it", () => {
    const names = ["first", "other", "third", "fourth", "fifth"];
    const width = getCardWidthForRow(names);

    expect(layout(names, { width: width + 1, indent: 1 })).toEqual(
      row(5, { indent: 1 }),
    );
    expect(layout(names, { width, indent: 1 })).toEqual(row(5, { indent: 0 }));
  });

  it("should take the plot inset from the room left for the plot", () => {
    const names = createSeriesNames(10);
    const width = 420;
    const insetWidth = width - getColumnSpace(62) - MIN_PLOT_WIDTH;

    expect(
      layout(names, { width, plotInset: { width: insetWidth, height: 0 } }),
    ).toMatchObject({ type: "vertical" });
    // 4 items + 3 gaps + 12 gap + "+ 6 more" 48 = 344 <= 384
    expect(
      layout(names, { width, plotInset: { width: insetWidth + 1, height: 0 } }),
    ).toEqual(row(4));
  });

  it("should cap the column width at 25% of the available width", () => {
    const names = ["a".repeat(40), ...Array(6).fill("12345")];
    // longest item = 254 > 25% of (600 - 32) = 142 < 200
    expect(layout(names, { width: 600 })).toMatchObject({
      type: "vertical",
      width: 146,
    });
  });

  it("should cap the column width at the size's maximum", () => {
    const names = ["a".repeat(40), "b".repeat(40), ...Array(10).fill("12345")];
    // 25% of (900 - 32) = 217 > 200
    expect(layout(names, { width: 900 })).toMatchObject({
      type: "vertical",
      width: LEGEND_SIZES.smallCard.maxVerticalWidth + LEGEND_PADDING * 2,
    });
    // 25% of (1200 - 48) = 288 > 256
    expect(layout(names, { width: 1200, size: "fullscreen" })).toMatchObject({
      type: "vertical",
      width: LEGEND_SIZES.fullscreen.maxVerticalWidth + LEGEND_PADDING * 2,
    });
  });

  it("should reserve the last column row for the overflow label", () => {
    // (200 - 16 - 10 - 4 + 8) / (13.8 + 8) = 8 rows, 7 items + "+ 13 more"
    expect(layout(createSeriesNames(20), { width: 420, height: 200 })).toEqual({
      type: "vertical",
      isBeforeChart: false,
      width: 72,
      visibleCount: 7,
    });
  });

  it("should fit column rows into the measured chart area when it is known", () => {
    // (100 - 10 - 4 + 8) / (13.8 + 8) = 4 rows, 3 items + "+ 17 more"
    expect(
      layout(createSeriesNames(20), {
        width: 420,
        height: 300,
        chartAreaHeight: 100,
      }),
    ).toEqual({
      type: "vertical",
      isBeforeChart: false,
      width: 72,
      visibleCount: 3,
    });
  });

  it("should not reserve outline room below the '+ N more' label", () => {
    // (169 - 2 + 8) / (13.8 + 8) = 8 rows, 7 items + "+ 13 more"
    expect(
      layout(createSeriesNames(20), {
        width: 420,
        height: 300,
        chartAreaHeight: SM.contentMargin.rightLegend.top + 169,
      }),
    ).toMatchObject({ type: "vertical", visibleCount: 7 });
  });

  it("should leave the column's top margin out of its rows", () => {
    // (169 - 10 - 2 + 8) / (13.8 + 8) = 7 rows, 6 items + "+ 14 more"
    expect(
      layout(createSeriesNames(20), {
        width: 420,
        height: 300,
        chartAreaHeight: 169,
      }),
    ).toMatchObject({ type: "vertical", visibleCount: 6 });
  });

  it("should widen the column to fit the '+ N more' label", () => {
    // item = 8 + 6 + 12 = 26 < "+ 13 more" = 9 * 6 = 54
    expect(layout(TWO_DIGIT_NAMES, { width: 420, height: 200 })).toEqual({
      type: "vertical",
      isBeforeChart: false,
      width: 58,
      visibleCount: 7,
    });
  });

  it("should use the larger metrics for the fullscreen tier", () => {
    const names = ["12345", "12345", "12345", "12345"];
    // md: item = 14 + 8 + 30 = 52, 4 items + 3 * 16 = 256 <= 368
    expect(layout(names, { width: 420, size: "fullscreen" })).toEqual(row(4));
    // md: 8 items = 416 + 112 = 528 > 368
    expect(
      layout([...names, ...names], { width: 420, size: "fullscreen" }),
    ).toEqual({
      type: "vertical",
      isBeforeChart: false,
      width: 56,
      visibleCount: 8,
    });
  });

  it("should use the roomier largeCard metrics for column rows", () => {
    // (200 - 4 + 12) / (13.8 + 12) = 8 rows, 7 items + the overflow label
    expect(
      layout(createSeriesNames(20), {
        width: 700,
        height: 400,
        chartAreaHeight:
          LEGEND_SIZES.largeCard.contentMargin.rightLegend.top + 200,
        size: "largeCard",
      }),
    ).toMatchObject({ type: "vertical", visibleCount: 7 });
  });
});

describe("getLegendLayout with an explicit position", () => {
  it.each<LegendPosition>(["top", "bottom"])(
    "should show a %s row on a cramped card where auto hides it",
    (position) => {
      const isBeforeChart = position === "top";
      const card = {
        width: 311,
        chartAreaHeight: 131,
        plotInset: { width: 0, height: 83 },
        minXAxisLabelsWidth: 300,
      };
      expect(layout(["first", "second"], card)).toEqual(HIDDEN);
      expect(layout(["first", "second"], { ...card, position })).toEqual(
        row(2, { isBeforeChart }),
      );
    },
  );

  it.each<LegendPosition>(["top", "bottom"])(
    "should hide a %s row when the plot would be under 150px wide",
    (position) => {
      expect(
        layout(["a", "b"], { width: MIN_PLOT_WIDTH, position }),
      ).toMatchObject({ type: "horizontal" });
      expect(
        layout(["a", "b"], { width: MIN_PLOT_WIDTH - 1, position }),
      ).toEqual(HIDDEN);
      expect(
        layout(["a", "b"], {
          width: 300,
          plotInset: { width: 151, height: 0 },
          position,
        }),
      ).toEqual(HIDDEN);
    },
  );

  it.each<LegendPosition>(["left", "right"])(
    "should hide a %s column when the plot beside it would be under 150px wide",
    (position) => {
      // (200 - 32) * 25% = 42px column, 200 - 70 = 130 < 150
      expect(layout(createSeriesNames(2), { width: 200, position })).toEqual(
        HIDDEN,
      );
      expect(
        layout(createSeriesNames(2), {
          width: 420,
          plotInset: {
            width: 420 - getColumnSpace(62) - MIN_PLOT_WIDTH + 1,
            height: 0,
          },
          position,
        }),
      ).toEqual(HIDDEN);
    },
  );

  it.each<LegendPosition>(["left", "right"])(
    "should show a %s column with most labels truncated on any card it fits",
    (position) => {
      expect(
        layout(MOSTLY_TRUNCATED_NAMES, {
          width: MIN_LEGEND_CARD_WIDTH - 1,
          position,
        }),
      ).toEqual({
        type: "vertical",
        isBeforeChart: position === "left",
        width: 97 + LEGEND_PADDING * 2,
        visibleCount: 4,
      });
    },
  );

  it("should leave the plot the room beside a column widened to fit the '+ N more' label", () => {
    // the 58px column leaves 420 - 58 - 24 = 338px, not 420 - 30 - 24 = 366px
    const card: LayoutOpts = { width: 420, height: 200, position: "right" };
    const insetWidth = 338 - MIN_PLOT_WIDTH;

    expect(
      layout(TWO_DIGIT_NAMES, {
        ...card,
        plotInset: { width: insetWidth, height: 0 },
      }),
    ).toMatchObject({ type: "vertical", width: 58 });
    expect(
      layout(TWO_DIGIT_NAMES, {
        ...card,
        plotInset: { width: insetWidth + 1, height: 0 },
      }),
    ).toEqual(HIDDEN);
  });

  it("should keep a row instead of switching to a column when the items overflow", () => {
    // item = 62, 4 items + 3 gaps = 284, + 12 gap + "+ 6 more" 48 = 344 <= 384
    expect(
      layout(createSeriesNames(10), { width: 420, position: "top" }),
    ).toEqual(row(4, { isBeforeChart: true }));
  });

  it("should keep at least one item in the row when even one item does not fit", () => {
    const names = ["a".repeat(100), "b", "c"];
    expect(layout(names, { width: 420, position: "bottom" })).toEqual(row(1));
  });

  it("should fit the row in the order the legend displays the items", () => {
    const names = ["a".repeat(50), "b", "c", "d", "e"];
    expect(layout(names, { width: 420, position: "top" })).toMatchObject({
      visibleCount: 1,
    });
    expect(
      layout(names, { width: 420, position: "top", isReversed: true }),
    ).toMatchObject({ visibleCount: 4 });
  });

  it("should hide a column when its height fits no item", () => {
    expect(
      layout(["a", "b"], { chartAreaHeight: 10, position: "right" }),
    ).toEqual(HIDDEN);
  });

  describe("in the query builder with the chart indent", () => {
    // outer width 880 holds the md card padding 48 and the 73px indent, so
    // the row's items get 880 - 48 - 73 - 2 * 2 = 755px
    const QUERY_BUILDER_ROW = {
      width: 880,
      indent: 73,
      size: "fullscreen" as const,
    };
    // md item = 14 + 8 + 3 * 6 = 40, one item per 40 + 16 gap
    const names = Array.from({ length: 49 }, (_, i) => `S${i + 10}`);

    it("should budget the row after both the card padding and the indent", () => {
      // 12 items = 12 * 56 - 16 = 656, + 16 gap + "+ 37 more" 54 = 726 <= 755
      // 13 items = 13 * 56 - 16 = 712, + 16 gap + "+ 36 more" 54 = 782 > 755
      expect(layout(names, { ...QUERY_BUILDER_ROW, position: "top" })).toEqual(
        row(12, { isBeforeChart: true, indent: 73 }),
      );
    });

    it("should leave the indent for a row that fits only across it", () => {
      // 14 items = 14 * 56 - 16 = 768 > 755, but within 880 - 48 - 4 = 828
      expect(
        layout(names.slice(0, 14), {
          ...QUERY_BUILDER_ROW,
          position: "bottom",
        }),
      ).toEqual(row(14, { indent: 0 }));
    });
  });
});

describe("getLegendLayout alwaysVisible", () => {
  it.each<LegendPosition>(["auto", "bottom"])(
    "should show a %s legend where the plot would be too narrow",
    (position) => {
      expect(
        layout(["a", "b"], {
          width: 100,
          height: 40,
          alwaysVisible: true,
          position,
        }),
      ).toMatchObject({ type: "horizontal", visibleCount: 2 });
    },
  );

  it("should show at least one item even when nothing fits", () => {
    const names = Array.from({ length: 8 }, (_, i) => `${i}`.repeat(40));
    expect(
      layout(names, {
        width: 300,
        height: 40,
        chartAreaHeight: 10,
        alwaysVisible: true,
      }),
    ).toMatchObject({ visibleCount: 1 });
  });
});

describe("getLegendMargins", () => {
  const NO_INSET = { left: 0, right: 0 };

  it.each(["smallCard", "largeCard", "fullscreen"] as const)(
    "should discount the chart's inset on the legend's own side for the %s tier",
    (size) => {
      const { contentMargin } = LEGEND_SIZES[size];

      expect(getLegendMargins(size, "right", NO_INSET).left).toBe(
        contentMargin.rightLegend.left,
      );
      expect(getLegendMargins(size, "right", { left: 20, right: 8 }).left).toBe(
        contentMargin.rightLegend.left - 8,
      );
      expect(getLegendMargins(size, "left", { left: 8, right: 20 }).right).toBe(
        contentMargin.leftLegend.right - 8,
      );
    },
  );

  it("should keep the minimum margin when the inset exceeds the content margin", () => {
    const gap = LEGEND_SIZES.smallCard.contentMargin.rightLegend.left;

    expect(
      getLegendMargins("smallCard", "right", { left: 0, right: gap }).left,
    ).toBe(MIN_CHART_SIDE_MARGIN);
    expect(
      getLegendMargins("smallCard", "right", { left: 0, right: gap * 3 }).left,
    ).toBe(MIN_CHART_SIDE_MARGIN);
  });

  it("should apply a row's margins as configured, with zero on the sides it does not set", () => {
    const { contentMargin } = LEGEND_SIZES.smallCard;

    expect(
      getLegendMargins("smallCard", "bottom", { left: 8, right: 8 }),
    ).toEqual({
      top: contentMargin.bottomLegend.top,
      bottom: contentMargin.bottomLegend.bottom,
      left: 0,
      right: 0,
    });
    expect(getLegendMargins("fullscreen", "top", NO_INSET)).toEqual({
      top: LEGEND_SIZES.fullscreen.contentMargin.topLegend.top,
      bottom: LEGEND_SIZES.fullscreen.contentMargin.topLegend.bottom,
      left: 0,
      right: 0,
    });
  });
});
