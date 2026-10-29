import {
  getAllParentLabelLayouts,
  getAllTileLabelLayouts,
  getTileLabelLayout,
} from "./labels";
import type { TreemapLayoutNode } from "./types";

function leaf(id: string, width: number, height: number): TreemapLayoutNode {
  return { id, rect: { width, height }, isLeaf: true };
}

function group(id: string, width: number): TreemapLayoutNode {
  return { id, rect: { width, height: 32 }, isLeaf: false };
}

describe("getTreemapLabelLayout", () => {
  it("returns full detail for large tiles when the value block fits", () => {
    expect(
      getTileLabelLayout({
        rect: { width: 200, height: 120 },
        valueLabelWidth: 120,
      }),
    ).toEqual({
      detail: "full",
      width: 176,
    });
  });

  it("degrades to labelOnly or none when constraints are not met", () => {
    expect(
      getTileLabelLayout({
        rect: { width: 200, height: 120 },
        valueLabelWidth: 200,
      }),
    ).toEqual({
      detail: "labelOnly",
      width: 176,
    });

    expect(
      getTileLabelLayout({
        rect: { width: 80, height: 300 },
        valueLabelWidth: 0,
      }),
    ).toEqual({
      detail: "none",
      width: 56,
    });
  });
});

describe("getTreemapLabelLayouts", () => {
  it("keeps leaf nodes only and applies per-leaf value widths", () => {
    const nodes: TreemapLayoutNode[] = [
      group("0", 300),
      leaf("0-0", 200, 120),
      leaf("0-1", 200, 120),
    ];
    const valueWidths: Record<string, number> = { "0-0": 100, "0-1": 500 };

    expect(
      getAllTileLabelLayouts(nodes, {
        getValueLabelWidth: (id) => valueWidths[id],
      }),
    ).toEqual({
      "0-0": { detail: "full", width: 176 },
      "0-1": { detail: "labelOnly", width: 176 },
    });
  });

  it("measures leaf value width only when a tile can show full detail", () => {
    const nodes: TreemapLayoutNode[] = [
      leaf("0-0", 80, 120),
      leaf("0-1", 200, 80),
      leaf("0-2", 200, 120),
    ];
    const getValueLabelWidth = jest.fn(() => 100);

    expect(
      getAllTileLabelLayouts(nodes, {
        getValueLabelWidth,
      }),
    ).toEqual({
      "0-0": { detail: "none", width: 56 },
      "0-1": { detail: "labelOnly", width: 176 },
      "0-2": { detail: "full", width: 176 },
    });
    expect(getValueLabelWidth).toHaveBeenCalledTimes(1);
    expect(getValueLabelWidth).toHaveBeenCalledWith("0-2");
  });

  it("renders no leaf labels when leaf labels are turned off", () => {
    const nodes: TreemapLayoutNode[] = [
      group("0", 300),
      leaf("0-0", 200, 120),
      leaf("0-1", 200, 120),
    ];
    const getValueLabelWidth = jest.fn(() => 100);

    expect(
      getAllTileLabelLayouts(nodes, {
        getValueLabelWidth,
        showLeafLabels: false,
      }),
    ).toEqual({
      "0-0": { detail: "none", width: 176 },
      "0-1": { detail: "none", width: 176 },
    });
    expect(getValueLabelWidth).not.toHaveBeenCalled();
  });
});

describe("getTreemapParentLabelLayouts", () => {
  const labels: Record<string, string> = { "0": "Quinoa", "1": "Lentils" };
  const parentConfig = {
    measureTextWidth: (text: string) => text.length * 6,
    getLabel: (id: string) => labels[id],
    getValuePercentWidth: () => 100,
  };

  it("shows text and value-percent only when both prefix and cluster fit", () => {
    expect(
      getAllParentLabelLayouts([group("0", 200), group("1", 60)], parentConfig),
    ).toEqual({
      "0": { showText: true, showValuePercent: true, nameColumnWidth: 68 },
      "1": { showText: true, showValuePercent: false },
    });
  });

  it("skips value-percent measurement when the label text does not fit", () => {
    const getValuePercentWidth = jest.fn(() => 100);

    expect(
      getAllParentLabelLayouts([group("0", 200), group("1", 30)], {
        ...parentConfig,
        getValuePercentWidth,
      }),
    ).toEqual({
      "0": { showText: true, showValuePercent: true, nameColumnWidth: 68 },
      "1": { showText: false, showValuePercent: false },
    });
    expect(getValuePercentWidth).toHaveBeenCalledTimes(1);
    expect(getValuePercentWidth).toHaveBeenCalledWith("0");
  });
});
