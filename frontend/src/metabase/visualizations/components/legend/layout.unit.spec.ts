import type { LegendPosition } from "metabase-types/api";

import type { LegendItemData } from "./LegendItem";
import {
  LEGEND_PADDING,
  LEGEND_SIZES,
  type LegendSize,
  getLegendLayout,
  getLegendSize,
} from "./layout";

const CHAR_WIDTH = 6;

const measureText = (text: string) => text.length * CHAR_WIDTH;

const createItems = (names: string[]): LegendItemData[] =>
  names.map((name) => ({ key: name, name, color: "red" }));

interface LayoutOpts {
  position?: LegendPosition;
  width?: number;
  height?: number;
  chartHeight?: number;
  size?: LegendSize;
  horizontalWidth?: number;
  isReversed?: boolean;
}

const layout = (
  names: string[],
  {
    position = "auto",
    width = 600,
    height = 300,
    chartHeight,
    size = "sm",
    horizontalWidth,
    isReversed,
  }: LayoutOpts = {},
) =>
  getLegendLayout({
    items: createItems(names),
    position,
    width,
    height,
    chartHeight,
    size,
    horizontalWidth,
    fontFamily: "Lato",
    measureText,
    isReversed,
  });

const bottomRow = (visibleCount: number) => ({
  type: "horizontal",
  isBeforeChart: false,
  visibleCount,
});

describe("getLegendLayout", () => {
  it("should hide the legend when there are no items", () => {
    expect(layout([])).toEqual({ type: "hidden" });
  });

  it("should hide the legend on cards smaller than 420×200", () => {
    expect(layout(["a", "b"], { width: 419, height: 300 })).toEqual({
      type: "hidden",
    });
    expect(layout(["a", "b"], { width: 600, height: 199 })).toEqual({
      type: "hidden",
    });
    expect(layout(["a", "b"], { width: 420, height: 200 })).toEqual(
      bottomRow(2),
    );
  });

  it("should lay items out horizontally when they fit in one row", () => {
    // item = 8 + 6 + 5 * 6 = 44, two items + 12 gap = 100, card 420 - 32 = 388
    expect(layout(["12345", "12345"], { width: 420 })).toEqual(bottomRow(2));
  });

  it("should switch to the vertical layout when the row overflows", () => {
    const names = Array.from({ length: 10 }, (_, i) => `series ${i}`);
    // item = 8 + 6 + 8 * 6 = 62, 10 items + 9 * 12 gap = 728 > 388
    expect(layout(names, { width: 420, height: 400 })).toEqual({
      type: "vertical",
      isBeforeChart: false,
      width: 66,
      visibleCount: 10,
    });
  });

  it("should switch to the vertical layout when the items do not fit within the indented legend width", () => {
    const names = ["first", "other", "third", "fourth", "fifth"];

    expect(layout(names, { width: 420 })).toEqual(bottomRow(5));
    expect(
      layout(names, {
        width: 420,
        horizontalWidth: 232,
      }),
    ).toMatchObject({ type: "vertical", visibleCount: 5 });
  });

  it("should cap the vertical legend width at 25% of the available width", () => {
    const names = ["a".repeat(40), ...Array(6).fill("12345")];
    // longest item = 254 > 25% of (600 - 32) = 142 < 200
    expect(layout(names, { width: 600 })).toMatchObject({
      type: "vertical",
      width: 146,
    });
  });

  it("should cap the vertical legend width at the size's maximum", () => {
    const names = ["a".repeat(40), "b".repeat(40), ...Array(10).fill("12345")];
    // 25% of (900 - 32) = 217 > 200
    expect(layout(names, { width: 900 })).toMatchObject({
      type: "vertical",
      width: LEGEND_SIZES.sm.maxVerticalWidth + LEGEND_PADDING * 2,
    });
    // 25% of (1200 - 48) = 288 > 256
    expect(layout(names, { width: 1200, size: "md" })).toMatchObject({
      type: "vertical",
      width: LEGEND_SIZES.md.maxVerticalWidth + LEGEND_PADDING * 2,
    });
  });

  it("should keep the vertical legend when at most half of the items are truncated", () => {
    // 25% of 568 = 142, label room = 128 → 22 chars fit
    const names = [
      "a".repeat(40),
      "b".repeat(40),
      "c".repeat(10),
      "d".repeat(10),
    ];
    expect(layout(names, { width: 600 })).toMatchObject({
      type: "vertical",
      visibleCount: 4,
    });
  });

  it("should hide the legend when more than half of the items are truncated", () => {
    const names = [
      "a".repeat(40),
      "b".repeat(40),
      "c".repeat(40),
      "d".repeat(10),
    ];
    expect(layout(names, { width: 600 })).toEqual({ type: "hidden" });
  });

  it("should reserve the last row for the overflow label when rows do not fit", () => {
    const names = Array.from({ length: 20 }, (_, i) => `series ${i}`);
    // (200 - 16 + 8) / (14 + 8) = 8 rows, 7 items + "+ 13 more"
    expect(layout(names, { width: 420, height: 200 })).toEqual({
      type: "vertical",
      isBeforeChart: false,
      width: 72,
      visibleCount: 7,
    });
  });

  it("should fit rows into the measured chart height when it is known", () => {
    const names = Array.from({ length: 20 }, (_, i) => `series ${i}`);
    // (100 + 8) / (14 + 8) = 4 rows, 3 items + "+ 17 more"
    expect(
      layout(names, { width: 420, height: 300, chartHeight: 100 }),
    ).toEqual({
      type: "vertical",
      isBeforeChart: false,
      width: 72,
      visibleCount: 3,
    });
  });

  it("should use the larger metrics for the md size", () => {
    const names = ["12345", "12345", "12345", "12345"];
    // sm: item = 8 + 6 + 30 = 44, 4 items + 3 * 12 = 212 <= 388
    expect(layout(names, { width: 420 })).toEqual(bottomRow(4));
    // md: item = 14 + 8 + 30 = 52, 4 items + 3 * 16 = 256 <= 372
    expect(layout(names, { width: 420, size: "md" })).toEqual(bottomRow(4));
    // md: 8 items = 416 + 112 = 528 > 372
    expect(layout([...names, ...names], { width: 420, size: "md" })).toEqual({
      type: "vertical",
      isBeforeChart: false,
      width: 56,
      visibleCount: 8,
    });
  });
});

describe("getLegendLayout overflow label", () => {
  it("should widen the column to fit the '+ N more' label", () => {
    const names = Array.from({ length: 20 }, () => "ab");
    // item = 8 + 6 + 12 = 26 < "+ 13 more" = 9 * 6 = 54
    expect(
      getLegendLayout({
        items: names.map((name, i) => ({ key: `${i}`, name, color: "red" })),
        position: "auto",
        width: 420,
        height: 200,
        size: "sm",
        fontFamily: "Lato",
        measureText,
      }),
    ).toEqual({
      type: "vertical",
      isBeforeChart: false,
      width: 58,
      visibleCount: 7,
    });
  });
});

describe("getLegendLayout truncation at the rendered width", () => {
  it("should hide the legend when all names are truncated by the 25% squeeze, even if they would fit a wider card", () => {
    // labels 180 fit the 200px cap but not the squeezed 142px column
    const names = Array.from({ length: 4 }, (_, i) => `${i}`.padEnd(30, "a"));
    expect(layout(names, { width: 600 })).toEqual({ type: "hidden" });
  });
});

describe("getLegendLayout alwaysVisible", () => {
  const opts = {
    position: "auto" as const,
    size: "sm" as const,
    fontFamily: "Lato",
    measureText,
    alwaysVisible: true,
  };

  it("should show the legend on cards below the minimum size", () => {
    expect(
      getLegendLayout({
        items: createItems(["a", "b"]),
        width: 300,
        height: 150,
        ...opts,
      }),
    ).toEqual(bottomRow(2));
  });

  it("should show at least one row even when nothing fits", () => {
    const names = Array.from({ length: 8 }, () => "a".repeat(40));
    expect(
      getLegendLayout({
        items: createItems(names),
        width: 300,
        height: 40,
        chartHeight: 10,
        ...opts,
      }),
    ).toMatchObject({ type: "vertical", visibleCount: 1 });
  });
});

describe("getLegendSize", () => {
  it("should pick lg for large dashboard cards and sm otherwise", () => {
    expect(getLegendSize({ width: 640, height: 360 })).toBe("lg");
    expect(getLegendSize({ width: 639, height: 360 })).toBe("sm");
    expect(getLegendSize({ width: 640, height: 359 })).toBe("sm");
  });

  it("should always pick md in the query builder and fullscreen", () => {
    expect(
      getLegendSize({ width: 300, height: 200, isQueryBuilder: true }),
    ).toBe("md");
    expect(
      getLegendSize({ width: 2000, height: 900, isFullscreen: true }),
    ).toBe("md");
  });
});

describe("getLegendLayout lg size", () => {
  it("should use the roomier lg metrics for row fitting", () => {
    const names = Array.from({ length: 20 }, (_, i) => `series ${i}`);
    // (200 + 12) / (13.8 + 12) = 8 rows, 7 items + the overflow label
    expect(
      layout(names, { width: 700, height: 400, chartHeight: 200, size: "lg" }),
    ).toMatchObject({ type: "vertical", visibleCount: 7 });
  });
});

describe("getLegendLayout with an explicit position", () => {
  const SMALL_CARD = { width: 300, height: 150 };
  const MOSTLY_TRUNCATED_NAMES = [
    "a".repeat(40),
    "b".repeat(40),
    "c".repeat(40),
    "d".repeat(10),
  ];

  it("should hide the legend when the position is off", () => {
    expect(layout(["a", "b"], { position: "off" })).toEqual({
      type: "hidden",
    });
  });

  it.each<LegendPosition>(["top", "bottom", "left", "right"])(
    "should hide a %s legend on a card below the minimum size",
    (position) => {
      expect(layout(["a", "b"], { ...SMALL_CARD, position })).toEqual({
        type: "hidden",
      });
    },
  );

  it("should keep a row instead of switching to a column when the items overflow", () => {
    const names = Array.from({ length: 10 }, (_, i) => `series ${i}`);
    // item = 62, 4 items + 3 gaps = 284, + 12 gap + "+ 6 more" 54 = 350 <= 388
    expect(layout(names, { width: 420, position: "top" })).toEqual({
      type: "horizontal",
      isBeforeChart: true,
      visibleCount: 4,
    });
  });

  describe("in the query builder with the chart indent", () => {
    // outer width 880 holds the md card padding 48 and the 73px indent, so
    // the row's items get 880 - 48 - 73 - 2 * 2 = 755px
    const QUERY_BUILDER_ROW = {
      width: 880,
      horizontalWidth: 880 - 73,
      size: "md" as const,
    };
    // md item = 14 + 8 + 3 * 6 = 40, one item per 40 + 16 gap
    const names = Array.from({ length: 49 }, (_, i) => `S${i + 10}`);

    it("should budget the row after both the card padding and the indent", () => {
      // 12 items = 12 * 56 - 16 = 656, + 16 gap + "+ 37 more" 54 = 726 <= 755
      // 13 items = 13 * 56 - 16 = 712, + 16 gap + "+ 36 more" 54 = 782 > 755
      expect(layout(names, { ...QUERY_BUILDER_ROW, position: "top" })).toEqual({
        type: "horizontal",
        isBeforeChart: true,
        visibleCount: 12,
      });
    });

    it("should keep the automatic row fit on its own budget", () => {
      // 14 items = 14 * 56 - 16 = 768, within min(880 - 48, 807 - 4) = 803
      expect(layout(names.slice(0, 14), QUERY_BUILDER_ROW)).toEqual(
        bottomRow(14),
      );
      // the same items overflow the explicit row's 755px
      expect(
        layout(names.slice(0, 14), {
          ...QUERY_BUILDER_ROW,
          position: "bottom",
        }),
      ).toEqual({
        type: "horizontal",
        isBeforeChart: false,
        visibleCount: 12,
      });
    });
  });

  it("should keep at least one item in the row when even one item does not fit", () => {
    const names = ["a".repeat(100), "b", "c"];
    expect(layout(names, { width: 420, position: "bottom" })).toEqual({
      type: "horizontal",
      isBeforeChart: false,
      visibleCount: 1,
    });
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

  it("should hide a column when most labels would be truncated", () => {
    expect(layout(MOSTLY_TRUNCATED_NAMES, { position: "left" })).toEqual({
      type: "hidden",
    });
  });

  it.each<LegendPosition>(["top", "bottom"])(
    "should keep a %s row when most labels would be truncated in a column",
    (position) => {
      expect(layout(MOSTLY_TRUNCATED_NAMES, { position })).toMatchObject({
        type: "horizontal",
        isBeforeChart: position === "top",
      });
    },
  );

  it("should keep at least one item in the column when its height fits none", () => {
    expect(
      layout(["a", "b"], { chartHeight: 10, position: "right" }),
    ).toMatchObject({ type: "vertical", visibleCount: 1 });
  });
});
