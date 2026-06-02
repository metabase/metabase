import type { Dataset } from "metabase-types/api";

import {
  getClickedObjectsFromDataSelection,
  getDataSelectionsFromState,
  getFuzzyClickedObjectFromDataPointTarget,
} from "./data-point-mentions";

const result = {
  data: {
    cols: [
      { name: "PRODUCT", display_name: "Product", base_type: "type/Text" },
      { name: "COUNT", display_name: "Count", base_type: "type/Integer" },
    ],
    rows: [
      ["Widget", 1],
      ["Gadget", 1137],
      ["Gizmo", 1],
      ["Doohickey", 42],
    ],
  },
} as unknown as Dataset;

describe("getDataSelectionsFromState", () => {
  it("reads selections from kebab-case or snake_case state keys", () => {
    const selection = { targets: [], label: "x" };
    expect(
      getDataSelectionsFromState({ "data-selections": { a: selection } }),
    ).toEqual({
      a: selection,
    });
    expect(
      getDataSelectionsFromState({ data_selections: { a: selection } }),
    ).toEqual({
      a: selection,
    });
    expect(getDataSelectionsFromState({})).toBeUndefined();
  });
});

describe("getClickedObjectsFromDataSelection", () => {
  it("resolves every target that matches a real chart row", () => {
    const targets = [
      {
        columns: ["PRODUCT", "COUNT"],
        row: ["Widget", 1],
        value_column_index: 1,
      },
      {
        columns: ["PRODUCT", "COUNT"],
        row: ["Gizmo", 1],
        value_column_index: 1,
      },
    ];

    const clicked = getClickedObjectsFromDataSelection(result, targets);

    expect(clicked).toHaveLength(2);
    expect(clicked.map((c) => c.value)).toEqual([1, 1]);
    expect(clicked[0].column?.name).toBe("COUNT");
  });

  it("drops targets that do not exist on the chart", () => {
    const targets = [
      {
        columns: ["PRODUCT", "COUNT"],
        row: ["Widget", 1],
        value_column_index: 1,
      },
      // Not a real row — should be dropped rather than highlighted
      {
        columns: ["PRODUCT", "COUNT"],
        row: ["Ghost", 999],
        value_column_index: 1,
      },
    ];

    expect(getClickedObjectsFromDataSelection(result, targets)).toHaveLength(1);
  });

  it("returns an empty array when there is no result or no targets", () => {
    expect(getClickedObjectsFromDataSelection(null, [])).toEqual([]);
    expect(getClickedObjectsFromDataSelection(result, undefined)).toEqual([]);
  });
});

describe("getFuzzyClickedObjectFromDataPointTarget", () => {
  // The target carries more columns than the rendered result (a superset), as
  // happens when a data point came from a different query than the chart shown.
  const target = {
    columns: ["PRODUCT", "CATEGORY", "COUNT"],
    row: ["Gadget", "Tools", 1137],
    value_column_index: 2,
  };

  it("matches on shared columns and scores by their count", () => {
    const match = getFuzzyClickedObjectFromDataPointTarget(result, target);
    expect(match).not.toBeNull();
    // PRODUCT and COUNT are shared with the result
    expect(match?.score).toBe(2);
    expect(match?.clicked.value).toBe(1137);
    expect(match?.clicked.column?.name).toBe("COUNT");
    expect(match?.clicked.origin?.row).toEqual(["Gadget", 1137]);
  });

  it("returns null when the shared-column match is ambiguous", () => {
    // Two rows share COUNT === 1, so matching on COUNT alone is ambiguous.
    const ambiguous = {
      columns: ["CATEGORY", "COUNT"],
      row: ["Tools", 1],
      value_column_index: 1,
    };
    expect(
      getFuzzyClickedObjectFromDataPointTarget(result, ambiguous),
    ).toBeNull();
  });

  it("returns null when no columns are shared", () => {
    const disjoint = {
      columns: ["STATE", "REVENUE"],
      row: ["CA", 5],
      value_column_index: 1,
    };
    expect(
      getFuzzyClickedObjectFromDataPointTarget(result, disjoint),
    ).toBeNull();
  });
});
