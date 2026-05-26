import type { TreemapTree } from "../model/types";

import { getTreemapChartOption } from "./option";

describe("getTreemapChartOption (1-level)", () => {
  it("produces a single treemap series", () => {
    const tree: TreemapTree = [
      { rawName: "A", displayName: "A", value: 10, rowIndices: [0] },
    ];

    const option = getTreemapChartOption(tree);

    expect(option.series).toMatchObject({ type: "treemap" });
  });

  it("emits one series data entry per top-level node", () => {
    const tree: TreemapTree = [
      { rawName: "A", displayName: "A", value: 10, rowIndices: [0, 2] },
      { rawName: "B", displayName: "B", value: 25, rowIndices: [1] },
      { rawName: "C", displayName: "C", value: 7, rowIndices: [3] },
    ];

    const option = getTreemapChartOption(tree);
    // @ts-expect-error -- echarts series union narrowing not worth fighting in tests
    const data = option.series.data;

    expect(data).toHaveLength(3);
    expect(data[0]).toMatchObject({ name: "A", value: 10 });
    expect(data[1]).toMatchObject({ name: "B", value: 25 });
    expect(data[2]).toMatchObject({ name: "C", value: 7 });
  });

  it("preserves rowIndices and rawName on each data node for downstream drill-through", () => {
    const tree: TreemapTree = [
      { rawName: null, displayName: "", value: 4, rowIndices: [0, 1] },
      { rawName: "A", displayName: "A", value: 8, rowIndices: [2] },
    ];

    const option = getTreemapChartOption(tree);
    // @ts-expect-error -- see above
    const data = option.series.data;

    expect(data[0]).toMatchObject({
      rawName: null,
      rowIndices: [0, 1],
    });
    expect(data[1]).toMatchObject({
      rawName: "A",
      rowIndices: [2],
    });
  });

  it("returns an empty data array for an empty tree", () => {
    const option = getTreemapChartOption([]);
    // @ts-expect-error -- see above
    expect(option.series.data).toEqual([]);
  });
});
