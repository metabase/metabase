import type { TreemapLayoutNode } from "./labels";
import {
  getTreemapLabelLayout,
  getTreemapLabelLayouts,
} from "./labels";

describe("getTreemapLabelLayout", () => {
  // Inset from each tile edge (matches the option's `label.position`).
  const padding = 12;
  const minTileWidth = 100;
  const minTileHeight = 40;
  const config = { minTileWidth, minTileHeight, padding };

  it("shows the label and wraps to the inset width when the tile is wide enough", () => {
    expect(getTreemapLabelLayout({ width: 200, height: 80 }, config)).toEqual({
      show: true,
      width: 200 - 2 * 12, // 176
    });
  });

  it("hides the label when the tile is narrower than the minimum width", () => {
    expect(getTreemapLabelLayout({ width: 80, height: 300 }, config)).toEqual({
      show: false,
      width: 80 - 2 * 12, // 56
    });
  });

  it("shows the label when the tile is exactly the minimum width", () => {
    expect(getTreemapLabelLayout({ width: 100, height: 80 }, config)).toEqual({
      show: true,
      width: 100 - 2 * 12, // 76
    });
  });

  it("hides the label in a tall, thin sliver regardless of its area", () => {
    // Large area (40 * 600) but only 40px wide → below the width threshold.
    expect(getTreemapLabelLayout({ width: 40, height: 600 }, config)).toEqual({
      show: false,
      width: 40 - 2 * 12, // 16
    });
  });

  it("hides the label in a wide, short tile below the minimum height", () => {
    // Wide enough (200px) but only 30px tall → below the height threshold, so
    // the single label line can't be drawn legibly and would be truncated.
    expect(getTreemapLabelLayout({ width: 200, height: 30 }, config)).toEqual({
      show: false,
      width: 200 - 2 * 12, // 176
    });
  });

  it("shows the label when the tile is exactly the minimum height", () => {
    expect(getTreemapLabelLayout({ width: 200, height: 40 }, config)).toEqual({
      show: true,
      width: 200 - 2 * 12, // 176
    });
  });

  it("clamps the wrap width to zero for a degenerate tile", () => {
    expect(getTreemapLabelLayout({ width: 0, height: 0 }, config)).toEqual({
      show: false,
      width: 0,
    });
  });
});

describe("getTreemapLabelLayouts", () => {
  const config = { minTileWidth: 100, minTileHeight: 40, padding: 12 };

  function leaf(id: string, width: number, height: number): TreemapLayoutNode {
    return { id, rect: { width, height }, isLeaf: true };
  }

  it("returns one layout per leaf, keyed by node id", () => {
    const nodes = [
      leaf("0-0", 200, 80), // wide and tall enough
      leaf("0-1", 40, 300), // narrow sliver
      leaf("0-2", 300, 20), // wide but too short
    ];
    expect(getTreemapLabelLayouts(nodes, config)).toEqual({
      "0-0": { show: true, width: 176 },
      "0-1": { show: false, width: 16 },
      "0-2": { show: false, width: 276 },
    });
  });

  it("ignores group nodes (which render a header chip, not a tile label)", () => {
    const nodes: TreemapLayoutNode[] = [
      { id: "0", rect: { width: 300, height: 300 }, isLeaf: false },
      leaf("0-0", 200, 80),
    ];
    expect(getTreemapLabelLayouts(nodes, config)).toEqual({
      "0-0": { show: true, width: 176 },
    });
  });

  it("returns an empty map when there are no nodes", () => {
    expect(getTreemapLabelLayouts([], config)).toEqual({});
  });
});
