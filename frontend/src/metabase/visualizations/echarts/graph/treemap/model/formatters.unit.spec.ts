import { createMockColumn } from "metabase-types/api/mocks/dataset";

import { getTreemapFormatters } from "./formatters";
import type { TreemapChartColumns, TreemapTree } from "./types";

const valueColumn = createMockColumn({
  name: "Amount",
  display_name: "Amount",
  base_type: "type/Number",
  semantic_type: "type/Number",
});

const columns: TreemapChartColumns = {
  grouping: {
    index: 0,
    column: createMockColumn({ name: "Category", base_type: "type/Text" }),
  },
  value: { index: 1, column: valueColumn },
};

function makeTree(...values: number[]): TreemapTree {
  return values.map((value, index) => ({
    rawName: `n${index}`,
    displayName: `n${index}`,
    value,
    rowIndices: [index],
  }));
}

type SetupOpts = {
  tree: TreemapTree;
};

function setup({ tree }: SetupOpts) {
  return getTreemapFormatters(columns, { column: () => ({}) }, tree);
}

describe("getTreemapFormatters percent", () => {
  it("keeps a dominant share honest instead of rounding it to 100%", () => {
    const total = 100001;
    const { percent } = setup({ tree: makeTree(100000, 1) });

    expect(percent(100000 / total)).toBe("99.999%");
    expect(percent(1 / total)).toBe("0.001%");
  });

  it("uses two decimals by default for evenly split values", () => {
    const { percent } = setup({ tree: makeTree(1, 1, 1) });

    expect(percent(1 / 3)).toBe("33.33%");
  });

  it("renders an exact whole share without decimals", () => {
    const { percent } = setup({ tree: makeTree(10) });

    expect(percent(1)).toBe("100%");
  });

  it("considers leaf shares when picking the decimal count", () => {
    const total = 100001;
    const tree: TreemapTree = [
      {
        rawName: "root",
        displayName: "root",
        value: total,
        rowIndices: [0, 1],
        children: makeTree(100000, 1),
      },
    ];
    const { percent } = setup({ tree });

    expect(percent(100000 / total)).toBe("99.999%");
  });
});
