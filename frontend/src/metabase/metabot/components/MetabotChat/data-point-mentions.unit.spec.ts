import type { Dataset } from "metabase-types/api";

import {
  getClickedObjectsFromDataSelection,
  getDataSelectionsFromState,
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
