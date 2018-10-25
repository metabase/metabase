import { pivot } from "metabase/lib/data_grid";

import { TYPE } from "metabase/lib/types";

function makeData(rows) {
  return {
    rows: rows,
    cols: [
      { name: "D1", display_name: "Dimension 1", base_type: TYPE.Text },
      { name: "D2", display_name: "Dimension 2", base_type: TYPE.Text },
      { name: "M", display_name: "Metric", base_type: TYPE.Integer },
    ],
  };
}

describe("data_grid", () => {
  describe("pivot", () => {
    it("should pivot values correctly", () => {
      let data = makeData([
        ["a", "x", 1],
        ["a", "y", 2],
        ["a", "z", 3],
        ["b", "x", 4],
        ["b", "y", 5],
        ["b", "z", 6],
      ]);
      let pivotedData = pivot(data, 0, 1, 2);
      expect(pivotedData.cols.map(col => col.display_name)).toEqual([
        "Dimension 1",
        "x",
        "y",
        "z",
      ]);
      expect(pivotedData.rows.map(row => [...row])).toEqual([
        ["a", 1, 2, 3],
        ["b", 4, 5, 6],
      ]);
    });
    it("should pivot values correctly with columns flipped", () => {
      let data = makeData([
        ["a", "x", 1],
        ["a", "y", 2],
        ["a", "z", 3],
        ["b", "x", 4],
        ["b", "y", 5],
        ["b", "z", 6],
      ]);
      let pivotedData = pivot(data, 1, 0, 2);
      expect(pivotedData.cols.map(col => col.display_name)).toEqual([
        "Dimension 2",
        "a",
        "b",
      ]);
      expect(pivotedData.rows.map(row => [...row])).toEqual([
        ["x", 1, 4],
        ["y", 2, 5],
        ["z", 3, 6],
      ]);
    });

    it("should not return null column names from null values", () => {
      let data = makeData([[null, null, 1]]);
      let pivotedData = pivot(data, 0, 1, 2);
      console.log("pivotedData", pivotedData);
      expect(pivotedData.rows.length).toEqual(1);
      expect(pivotedData.cols.length).toEqual(2);
      expect(pivotedData.cols[0].name).toEqual(jasmine.any(String));
      expect(pivotedData.cols[0].display_name).toEqual(jasmine.any(String));
      expect(pivotedData.cols[1].name).toEqual(jasmine.any(String));
      expect(pivotedData.cols[1].display_name).toEqual(jasmine.any(String));
    });

    it("should infer sort order of sparse data correctly", () => {
      let data = makeData([
        ["a", "x", 1],
        ["a", "z", 3],
        ["b", "x", 4],
        ["b", "y", 5],
        ["b", "z", 6],
      ]);
      let pivotedData = pivot(data, 0, 1, 2);
      expect(pivotedData.cols.map(col => col.display_name)).toEqual([
        "Dimension 1",
        "x",
        "y",
        "z",
      ]);
      expect(pivotedData.rows.map(row => [...row])).toEqual([
        ["a", 1, null, 3],
        ["b", 4, 5, 6],
      ]);
    });
  });
});
