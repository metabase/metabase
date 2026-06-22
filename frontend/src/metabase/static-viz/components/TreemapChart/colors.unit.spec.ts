import Color from "color";

import type { TreemapTree } from "metabase/visualizations/echarts/graph/treemap/model/types";

import { getMonochromeTreemapColors } from "./colors";

function makeTree(values: Record<string, number>): TreemapTree {
  return Object.entries(values).map(([name, value]) => ({
    rawName: name,
    displayName: name,
    value,
    rowIndices: [],
  }));
}

const BASE = "#509ee3";

describe("getMonochromeTreemapColors", () => {
  it("keeps the base color for the largest node and darkens smaller ones by rank", () => {
    const colors = getMonochromeTreemapColors(
      makeTree({ small: 10, large: 100, medium: 50 }),
      BASE,
    );

    expect(colors.large).toBe(Color(BASE).hex());
    const lightnesses = ["large", "medium", "small"].map((name) =>
      Color(colors[name]).lightness(),
    );
    expect(lightnesses[0]).toBeGreaterThan(lightnesses[1]);
    expect(lightnesses[1]).toBeGreaterThan(lightnesses[2]);
  });

  it("uses the base color for a single node", () => {
    const colors = getMonochromeTreemapColors(makeTree({ only: 42 }), BASE);

    expect(colors.only).toBe(Color(BASE).hex());
  });

  it("returns an empty map for an empty tree", () => {
    expect(getMonochromeTreemapColors([], BASE)).toEqual({});
  });
});
