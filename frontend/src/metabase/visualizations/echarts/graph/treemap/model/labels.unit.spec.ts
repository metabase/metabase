import {
  getTreemapLabelLayout,
  getTreemapLabelLayouts,
  getTreemapParentLabelLayouts,
} from "./labels";
import type { TreemapLayoutNode } from "./types";

describe("getTreemapLabelLayout", () => {
  // Inset from each tile edge (matches the option's `label.position`).
  const padding = 12;
  const minTileWidth = 100;
  const minTileHeight = 40;
  const minFullTileHeight = 100;
  const config = { minTileWidth, minTileHeight, minFullTileHeight, padding };

  // Most name-threshold cases below pass a value width of 0 so the value never
  // gates the result — they're exercising the width/height label thresholds, not
  // the full-block decision. The full-block cases pass an explicit value width.

  it("shows the full block when the tile clears the block height and the value fits", () => {
    // 200px wide (inset 176) ≥ value 120px, and 120px tall ≥ minFullTileHeight.
    expect(
      getTreemapLabelLayout({ width: 200, height: 120 }, 120, config),
    ).toEqual({
      show: true,
      detail: "full",
      width: 176,
    });
  });

  it("falls back to label-only when the tile fits the name but not the block height", () => {
    // 80px tall: clears minTileHeight (40) but not minFullTileHeight (100).
    expect(
      getTreemapLabelLayout({ width: 200, height: 80 }, 0, config),
    ).toEqual({
      show: true,
      detail: "labelOnly",
      width: 176,
    });
  });

  it("falls back to label-only when the value string is wider than the inset tile", () => {
    // Tall enough for the block, but value (200px) exceeds the inset width
    // (176px), so the value would wrap — show the name only instead.
    expect(
      getTreemapLabelLayout({ width: 200, height: 120 }, 200, config),
    ).toEqual({
      show: true,
      detail: "labelOnly",
      width: 176,
    });
  });

  it("shows the full block when the value fits the inset width exactly", () => {
    expect(
      getTreemapLabelLayout({ width: 200, height: 120 }, 176, config),
    ).toEqual({
      show: true,
      detail: "full",
      width: 176,
    });
  });

  it("shows the full block when the tile is exactly the block height", () => {
    expect(
      getTreemapLabelLayout({ width: 200, height: 100 }, 100, config),
    ).toEqual({
      show: true,
      detail: "full",
      width: 176,
    });
  });

  it("hides the label when the tile is narrower than the minimum width", () => {
    expect(
      getTreemapLabelLayout({ width: 80, height: 300 }, 0, config),
    ).toEqual({
      show: false,
      detail: "none",
      width: 80 - 2 * 12, // 56
    });
  });

  it("shows the label when the tile is exactly the minimum width", () => {
    expect(
      getTreemapLabelLayout({ width: 100, height: 80 }, 0, config),
    ).toEqual({
      show: true,
      detail: "labelOnly",
      width: 100 - 2 * 12, // 76
    });
  });

  it("hides the label in a tall, thin sliver regardless of its area", () => {
    // Large area (40 * 600) but only 40px wide → below the width threshold.
    expect(
      getTreemapLabelLayout({ width: 40, height: 600 }, 0, config),
    ).toEqual({
      show: false,
      detail: "none",
      width: 40 - 2 * 12, // 16
    });
  });

  it("hides the label in a wide, short tile below the minimum height", () => {
    // Wide enough (200px) but only 30px tall → below the height threshold, so
    // the single label line can't be drawn legibly and would be truncated.
    expect(
      getTreemapLabelLayout({ width: 200, height: 30 }, 0, config),
    ).toEqual({
      show: false,
      detail: "none",
      width: 200 - 2 * 12, // 176
    });
  });

  it("shows the label when the tile is exactly the minimum height", () => {
    expect(
      getTreemapLabelLayout({ width: 200, height: 40 }, 0, config),
    ).toEqual({
      show: true,
      detail: "labelOnly",
      width: 200 - 2 * 12, // 176
    });
  });

  it("clamps the wrap width to zero for a degenerate tile", () => {
    expect(getTreemapLabelLayout({ width: 0, height: 0 }, 0, config)).toEqual({
      show: false,
      detail: "none",
      width: 0,
    });
  });
});

describe("getTreemapLabelLayouts", () => {
  const config = {
    minTileWidth: 100,
    minTileHeight: 40,
    minFullTileHeight: 100,
    padding: 12,
  };

  function leaf(id: string, width: number, height: number): TreemapLayoutNode {
    return { id, rect: { width, height }, isLeaf: true };
  }

  it("defaults to label-only (no full block) when no value widths are provided", () => {
    // Without `getValueLabelWidth` the value width defaults to Infinity, so even
    // a big tile can't qualify for "full" — it stays at "labelOnly".
    const nodes = [
      leaf("0-0", 200, 120), // big, but no value width → labelOnly
      leaf("0-1", 40, 300), // narrow sliver
      leaf("0-2", 300, 20), // wide but too short
    ];
    expect(getTreemapLabelLayouts(nodes, config)).toEqual({
      "0-0": { show: true, detail: "labelOnly", width: 176 },
      "0-1": { show: false, detail: "none", width: 16 },
      "0-2": { show: false, detail: "none", width: 276 },
    });
  });

  it("uses the per-leaf value width to promote big tiles to the full block", () => {
    const nodes = [
      leaf("0-0", 200, 120), // big + value fits → full
      leaf("0-1", 200, 120), // big but value too wide → labelOnly
    ];
    const valueWidths: Record<string, number> = { "0-0": 100, "0-1": 500 };
    expect(
      getTreemapLabelLayouts(nodes, {
        ...config,
        getValueLabelWidth: (id) => valueWidths[id],
      }),
    ).toEqual({
      "0-0": { show: true, detail: "full", width: 176 },
      "0-1": { show: true, detail: "labelOnly", width: 176 },
    });
  });

  it("ignores group nodes (which render a header chip, not a tile label)", () => {
    const nodes: TreemapLayoutNode[] = [
      { id: "0", rect: { width: 300, height: 300 }, isLeaf: false },
      leaf("0-0", 200, 80),
    ];
    expect(getTreemapLabelLayouts(nodes, config)).toEqual({
      "0-0": { show: true, detail: "labelOnly", width: 176 },
    });
  });

  it("returns an empty map when there are no nodes", () => {
    expect(getTreemapLabelLayouts([], config)).toEqual({});
  });
});

describe("getTreemapParentLabelLayouts", () => {
  // 6px per character keeps the arithmetic easy to follow in the assertions.
  const measureTextWidth = (text: string) => text.length * 6;
  const padding = 12;
  // minVisibleChars defaults to 3, so the readable prefix is 3 chars = 18px.

  function group(id: string, width: number): TreemapLayoutNode {
    return { id, rect: { width, height: 32 }, isLeaf: false };
  }

  function leaf(id: string, width: number): TreemapLayoutNode {
    return { id, rect: { width, height: 80 }, isLeaf: true };
  }

  const labels: Record<string, string> = {
    "0": "Africa",
    "1": "Oceania",
    "2": "US",
  };
  const config = {
    measureTextWidth,
    getLabel: (id: string) => labels[id],
    padding,
  };

  it("shows the text when the chip fits the full label", () => {
    // "Africa" prefix "Afr" = 18px; available = 200 - 24 = 176px.
    expect(getTreemapParentLabelLayouts([group("0", 200)], config)).toEqual({
      "0": { showText: true, showValuePercent: false },
    });
  });

  it("keeps the text (for ECharts to truncate) when only a readable prefix fits", () => {
    // available = 60 - 24 = 36px: too narrow for full "Oceania" (42px) but wide
    // enough for the 3-char prefix "Oce" (18px), so the text stays and ECharts
    // ellipsis-truncates it rather than hiding it.
    expect(getTreemapParentLabelLayouts([group("1", 60)], config)).toEqual({
      "1": { showText: true, showValuePercent: false },
    });
  });

  it("hides the text when the chip is too narrow for even a readable prefix", () => {
    // available = 30 - 24 = 6px: not even the 3-char prefix "Oce" (18px) fits.
    expect(getTreemapParentLabelLayouts([group("1", 30)], config)).toEqual({
      "1": { showText: false, showValuePercent: false },
    });
  });

  it("shows the text when the readable prefix fits exactly", () => {
    // available = 42 - 24 = 18px == prefix "Afr" (18px).
    expect(getTreemapParentLabelLayouts([group("0", 42)], config)).toEqual({
      "0": { showText: true, showValuePercent: false },
    });
  });

  it("measures the whole label when it is shorter than the prefix length", () => {
    // "US" (2 chars) < minVisibleChars; measure it whole = 12px. available =
    // 30 - 24 = 6px → doesn't fit, so hide.
    expect(getTreemapParentLabelLayouts([group("2", 30)], config)).toEqual({
      "2": { showText: false, showValuePercent: false },
    });
  });

  it("respects a custom minVisibleChars", () => {
    // available = 60 - 24 = 36px. With minVisibleChars 7 the whole "Oceania"
    // (42px) must fit → hidden, unlike the default-3 case above.
    expect(
      getTreemapParentLabelLayouts([group("1", 60)], {
        ...config,
        minVisibleChars: 7,
      }),
    ).toEqual({ "1": { showText: false, showValuePercent: false } });
  });

  it("ignores leaf nodes (they render their own tile label)", () => {
    expect(
      getTreemapParentLabelLayouts([group("0", 200), leaf("0-0", 30)], config),
    ).toEqual({ "0": { showText: true, showValuePercent: false } });
  });

  it("skips groups with no resolvable label", () => {
    expect(getTreemapParentLabelLayouts([group("99", 200)], config)).toEqual(
      {},
    );
  });

  it("returns an empty map when there are no nodes", () => {
    expect(getTreemapParentLabelLayouts([], config)).toEqual({});
  });

  describe("value + percentage cluster", () => {
    // "Afr" prefix = 18px, gap defaults to HEADER_VALUE_PERCENT_GAP (8px).
    it("shows the value+% when the prefix, gap, and cluster all fit the chip", () => {
      // available = 200 - 24 = 176px; 18 + 8 + 100 = 126 ≤ 176 → both fit.
      // nameColumnWidth = available - gap - cluster = 176 - 8 - 100 = 68.
      expect(
        getTreemapParentLabelLayouts([group("0", 200)], {
          ...config,
          getValuePercentWidth: () => 100,
        }),
      ).toEqual({
        "0": { showText: true, showValuePercent: true, nameColumnWidth: 68 },
      });
    });

    it("omits the value+% (but keeps the name) when the cluster doesn't fit", () => {
      // available = 110 - 24 = 86px; name 18 fits, but 18 + 8 + 100 = 126 > 86.
      expect(
        getTreemapParentLabelLayouts([group("0", 110)], {
          ...config,
          getValuePercentWidth: () => 100,
        }),
      ).toEqual({ "0": { showText: true, showValuePercent: false } });
    });

    it("omits the value+% when even the name prefix doesn't fit", () => {
      // available = 30 - 24 = 6px; the prefix itself doesn't fit, so neither does
      // the cluster — showText false implies showValuePercent false.
      expect(
        getTreemapParentLabelLayouts([group("1", 30)], {
          ...config,
          getValuePercentWidth: () => 0,
        }),
      ).toEqual({ "1": { showText: false, showValuePercent: false } });
    });

    it("shows the value+% when the prefix, gap, and cluster fit exactly", () => {
      // available = 150 - 24 = 126px; 18 + 8 + 100 = 126 == available.
      // nameColumnWidth = 126 - 8 - 100 = 18.
      expect(
        getTreemapParentLabelLayouts([group("0", 150)], {
          ...config,
          getValuePercentWidth: () => 100,
        }),
      ).toEqual({
        "0": { showText: true, showValuePercent: true, nameColumnWidth: 18 },
      });
    });

    it("respects a custom valuePercentGap", () => {
      // available = 150 - 24 = 126px; with gap 9, 18 + 9 + 100 = 127 > 126 → omit.
      expect(
        getTreemapParentLabelLayouts([group("0", 150)], {
          ...config,
          getValuePercentWidth: () => 100,
          valuePercentGap: 9,
        }),
      ).toEqual({ "0": { showText: true, showValuePercent: false } });
    });
  });
});
