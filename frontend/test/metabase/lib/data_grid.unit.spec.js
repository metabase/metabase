import { pivot, multiLevelPivot } from "metabase/lib/data_grid";

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
      const data = makeData([
        ["a", "x", 1],
        ["a", "y", 2],
        ["a", "z", 3],
        ["b", "x", 4],
        ["b", "y", 5],
        ["b", "z", 6],
      ]);
      const pivotedData = pivot(data, 0, 1, 2);
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
    it("should pivot non-numeric values correctly", () => {
      const data = makeData([
        ["a", "x", "q"],
        ["a", "y", "w"],
        ["a", "z", "e"],
        ["b", "x", "r"],
        ["b", "y", "t"],
        ["b", "z", "y"],
      ]);
      const pivotedData = pivot(data, 0, 1, 2);
      expect(pivotedData.cols.map(col => col.display_name)).toEqual([
        "Dimension 1",
        "x",
        "y",
        "z",
      ]);
      expect(pivotedData.rows.map(row => [...row])).toEqual([
        ["a", "q", "w", "e"],
        ["b", "r", "t", "y"],
      ]);
    });
    it("should pivot values correctly with columns flipped", () => {
      const data = makeData([
        ["a", "x", 1],
        ["a", "y", 2],
        ["a", "z", 3],
        ["b", "x", 4],
        ["b", "y", 5],
        ["b", "z", 6],
      ]);
      const pivotedData = pivot(data, 1, 0, 2);
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
      const data = makeData([[null, null, 1]]);
      const pivotedData = pivot(data, 0, 1, 2);
      expect(pivotedData.rows.length).toEqual(1);
      expect(pivotedData.cols.length).toEqual(2);
      expect(pivotedData.cols[0].name).toEqual(jasmine.any(String));
      expect(pivotedData.cols[0].display_name).toEqual(jasmine.any(String));
      expect(pivotedData.cols[1].name).toEqual(jasmine.any(String));
      expect(pivotedData.cols[1].display_name).toEqual(jasmine.any(String));
    });

    it("should infer sort order of sparse data correctly", () => {
      const data = makeData([
        ["a", "x", 1],
        ["a", "z", 3],
        ["b", "x", 4],
        ["b", "y", 5],
        ["b", "z", 6],
      ]);
      const pivotedData = pivot(data, 0, 1, 2);
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

  describe("multiLevelPivot", () => {
    const data = makeData([
      ["a", "x", 1],
      ["a", "y", 2],
      ["a", "z", 3],
      ["b", "x", 4],
      ["b", "y", 5],
      ["b", "z", 6],
    ]);
    it("should produce header rows with spans", () => {
      const { headerRows } = multiLevelPivot(data, [0, 1], [], [2]);
      expect(headerRows).toEqual([
        [{ span: 3, value: "a" }, { span: 3, value: "b" }],
        [
          { span: 1, value: "x" },
          { span: 1, value: "y" },
          { span: 1, value: "z" },
          { span: 1, value: "x" },
          { span: 1, value: "y" },
          { span: 1, value: "z" },
        ],
      ]);
    });
    it("should produce body rows with spans", () => {
      const { bodyRows } = multiLevelPivot(data, [], [0, 1], [2]);
      expect(bodyRows).toEqual([
        [
          { span: 3, value: "a" },
          { span: 1, value: "x" },
          { span: 1, value: "1" },
        ],
        [{ span: 1, value: "y" }, { span: 1, value: "2" }],
        [{ span: 1, value: "z" }, { span: 1, value: "3" }],
        [
          { span: 3, value: "b" },
          { span: 1, value: "x" },
          { span: 1, value: "4" },
        ],
        [{ span: 1, value: "y" }, { span: 1, value: "5" }],
        [{ span: 1, value: "z" }, { span: 1, value: "6" }],
      ]);
    });
    it("should allow unspecified values", () => {
      const data = makeData([
        ["a", "x", 1],
        ["a", "y", 2],
        ["b", "x", 3],
        // ["b", "y", ...], not present
      ]);
      const { headerRows, bodyRows } = multiLevelPivot(data, [0], [1], [2]);
      expect(headerRows).toEqual([
        [{ span: 1, value: "a" }, { span: 1, value: "b" }],
      ]);
      expect(bodyRows).toEqual([
        [
          { span: 1, value: "x" },
          { span: 1, value: "1" },
          { span: 1, value: "3" },
        ],
        [
          { span: 1, value: "y" },
          { span: 1, value: "2" },
          { span: 1, value: null },
        ],
      ]);
    });
    it("should handle multiple value columns", () => {
      const data = {
        rows: [["a", "b", 1, 2]],
        cols: [
          { name: "D1", display_name: "Dimension 1", base_type: TYPE.Text },
          { name: "D2", display_name: "Dimension 2", base_type: TYPE.Text },
          { name: "M1", display_name: "Metric", base_type: TYPE.Integer },
          { name: "M2", display_name: "Metric", base_type: TYPE.Integer },
        ],
      };

      const { headerRows, bodyRows } = multiLevelPivot(data, [0], [1], [2, 3]);
      expect(headerRows).toEqual([
        [{ span: 2, value: "a" }],
        [{ span: 1, value: "Metric" }, { span: 1, value: "Metric" }],
      ]);
      expect(bodyRows).toEqual([
        [
          { span: 1, value: "b" },
          { span: 1, value: "1" },
          { span: 1, value: "2" },
        ],
      ]);
    });
    it("should format values", () => {
      const data = {
        rows: [[1, "2020-01-01T00:00:00", 1000]],
        cols: [
          {
            name: "D1",
            display_name: "Dimension 1",
            base_type: TYPE.Float,
            binning_info: { bin_width: 10 },
          },
          { name: "D2", display_name: "Dimension 2", base_type: TYPE.DateTime },
          {
            name: "M1",
            display_name: "Metric",
            base_type: TYPE.Integer,
            special_type: "type/Currency",
          },
        ],
      };

      const { headerRows, bodyRows } = multiLevelPivot(data, [0], [1], [2]);
      expect(headerRows).toEqual([[{ span: 1, value: "1  –  11" }]]);
      expect(bodyRows).toEqual([
        [
          { span: 1, value: "January 1, 2020, 12:00 AM" },
          { span: 1, value: "1,000" },
        ],
      ]);
    });
  });
});
