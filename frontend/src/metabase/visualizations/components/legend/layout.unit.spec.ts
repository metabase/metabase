import type { LegendItemData } from "./LegendItem";
import {
  LEGEND_PADDING,
  LEGEND_SIZES,
  type LegendSize,
  getLegendLayout,
} from "./layout";

const CHAR_WIDTH = 6;

const measureText = (text: string) => text.length * CHAR_WIDTH;

const createItems = (names: string[]): LegendItemData[] =>
  names.map((name) => ({ key: name, name, color: "red" }));

interface LayoutOpts {
  width?: number;
  height?: number;
  size?: LegendSize;
}

const layout = (
  names: string[],
  { width = 600, height = 300, size = "sm" }: LayoutOpts = {},
) =>
  getLegendLayout({
    items: createItems(names),
    width,
    height,
    size,
    fontFamily: "Lato",
    measureText,
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
    expect(layout(["a", "b"], { width: 420, height: 200 })).toEqual({
      type: "horizontal",
    });
  });

  it("should lay items out horizontally when they fit in one row", () => {
    // item = 8 + 6 + 5 * 6 = 44, two items + 12 gap = 100, card 420 - 32 = 388
    expect(layout(["12345", "12345"], { width: 420 })).toEqual({
      type: "horizontal",
    });
  });

  it("should switch to the vertical layout when the row overflows", () => {
    const names = Array.from({ length: 10 }, (_, i) => `series ${i}`);
    // item = 8 + 6 + 8 * 6 = 62, 10 items + 9 * 12 gap = 728 > 388
    expect(layout(names, { width: 420, height: 400 })).toEqual({
      type: "vertical",
      width: 66,
      visibleCount: 10,
    });
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
      width: 72,
      visibleCount: 7,
    });
  });

  it("should fit rows into the measured chart height when it is known", () => {
    const names = Array.from({ length: 20 }, (_, i) => `series ${i}`);
    // (100 + 8) / (14 + 8) = 4 rows, 3 items + "+ 17 more"
    expect(
      getLegendLayout({
        items: createItems(names),
        width: 420,
        height: 300,
        chartHeight: 100,
        size: "sm",
        fontFamily: "Lato",
        measureText,
      }),
    ).toEqual({ type: "vertical", width: 72, visibleCount: 3 });
  });

  it("should use the larger metrics for the md size", () => {
    const names = ["12345", "12345", "12345", "12345"];
    // sm: item = 8 + 6 + 30 = 44, 4 items + 3 * 12 = 212 <= 388
    expect(layout(names, { width: 420 })).toEqual({ type: "horizontal" });
    // md: item = 14 + 8 + 30 = 52, 4 items + 3 * 16 = 256 <= 372
    expect(layout(names, { width: 420, size: "md" })).toEqual({
      type: "horizontal",
    });
    // md: 8 items = 416 + 112 = 528 > 372
    expect(layout([...names, ...names], { width: 420, size: "md" })).toEqual({
      type: "vertical",
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
        width: 420,
        height: 200,
        size: "sm",
        fontFamily: "Lato",
        measureText,
      }),
    ).toEqual({ type: "vertical", width: 58, visibleCount: 7 });
  });
});

describe("getLegendLayout truncation against the width cap", () => {
  it("should keep the legend when names only truncate because of the 25% squeeze", () => {
    // labels 180 < cap room 200 - 14 = 186, but 25% of 568 = 142 forces ellipsis
    const names = Array.from({ length: 4 }, (_, i) => `${i}`.padEnd(30, "a"));
    expect(layout(names, { width: 600 })).toMatchObject({
      type: "vertical",
      width: 146,
      visibleCount: 4,
    });
  });
});

describe("getLegendLayout alwaysVisible", () => {
  const opts = {
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
    ).toEqual({ type: "horizontal" });
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
