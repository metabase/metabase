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

  // skipped for now until I finalize things
  describe.skip("multiLevelPivot", () => {
    const data = makeData([
      ["a", "x", 1],
      ["a", "y", 2],
      ["a", "z", 3],
      ["b", "x", 4],
      ["b", "y", 5],
      ["b", "z", 6],
    ]);
    it("should produce multi-level top index", () => {
      const { topIndex, leftIndex } = multiLevelPivot(data, [0, 1], [], [2]);
      expect(topIndex).toEqual([
        [
          [{ value: "a", span: 3 }],
          [
            { value: "x", span: 1 },
            { value: "y", span: 1 },
            { value: "z", span: 1 },
          ],
        ],
        [
          [{ value: "b", span: 3 }],
          [
            { value: "x", span: 1 },
            { value: "y", span: 1 },
            { value: "z", span: 1 },
          ],
        ],
      ]);
      expect(leftIndex).toEqual([]);
    });
    it("should produce multi-level left index", () => {
      const { topIndex, leftIndex } = multiLevelPivot(data, [], [0, 1], [2]);
      expect(leftIndex).toEqual([
        [
          [{ value: "a", span: 3 }],
          [
            { value: "x", span: 1 },
            { value: "y", span: 1 },
            { value: "z", span: 1 },
          ],
        ],
        [
          [{ value: "b", span: 3 }],
          [
            { value: "x", span: 1 },
            { value: "y", span: 1 },
            { value: "z", span: 1 },
          ],
        ],
      ]);
      expect(topIndex).toEqual([]);
    });
    it("should allow unspecified values", () => {
      const data = makeData([
        ["a", "x", 1],
        ["a", "y", 2],
        ["b", "x", 3],
        // ["b", "y", ...], not present
      ]);
      const { leftIndex, topIndex } = multiLevelPivot(data, [0], [1], [2]);
      expect(leftIndex).toEqual([
        [[{ value: "x", span: 1 }]],
        [[{ value: "y", span: 1 }]],
      ]);
      expect(topIndex).toEqual([
        [[{ value: "a", span: 1 }]],
        [[{ value: "b", span: 1 }]],
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

      const { topIndex, leftIndex, getRowSection } = multiLevelPivot(
        data,
        [0],
        [1],
        [2, 3],
      );
      expect(topIndex).toEqual([
        [
          [{ value: "a", span: 2 }],
          [{ value: "Metric", span: 1 }, { value: "Metric", span: 1 }],
        ],
      ]);
      expect(leftIndex).toEqual([[[{ value: "b", span: 1 }]]]);
      expect(getRowSection("a", "b")).toEqual([["1", "2"]]);
    });
    it("should work with three levels of row grouping", () => {
      // three was picked because there was a bug during development that showed up with at least three
      const data = {
        rows: [
          ["a1", "b1", "c1", 1],
          ["a1", "b1", "c2", 1],
          ["a1", "b2", "c1", 1],
          ["a1", "b2", "c2", 1],
          ["a2", "b1", "c1", 1],
          ["a2", "b1", "c2", 1],
          ["a2", "b2", "c1", 1],
          ["a2", "b2", "c2", 1],
        ],
        cols: [
          { name: "D1", display_name: "Dimension 1", base_type: TYPE.Text },
          { name: "D2", display_name: "Dimension 2", base_type: TYPE.Text },
          { name: "D3", display_name: "Dimension 3", base_type: TYPE.Text },
          { name: "M1", display_name: "Metric", base_type: TYPE.Integer },
        ],
      };

      const { topIndex, leftIndex } = multiLevelPivot(data, [], [0, 1, 2], [3]);
      expect(topIndex).toEqual([]);
      expect(leftIndex).toEqual([
        [
          [{ span: 4, value: "a1" }],
          [{ span: 2, value: "b1" }, { span: 2, value: "b2" }],
          [
            { span: 1, value: "c1" },
            { span: 1, value: "c2" },
            { span: 1, value: "c1" },
            { span: 1, value: "c2" },
          ],
        ],
        [
          [{ span: 4, value: "a2" }],
          [{ span: 2, value: "b1" }, { span: 2, value: "b2" }],
          [
            { span: 1, value: "c1" },
            { span: 1, value: "c2" },
            { span: 1, value: "c1" },
            { span: 1, value: "c2" },
          ],
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

      const { getRowSection } = multiLevelPivot(data, [0], [1], [2]);
      expect(getRowSection(1, "2020-01-01T00:00:00")).toEqual([["1,000"]]);
    });
    it("should format values without a pivoted column or row", () => {
      const data = {
        rows: [[1, 1000]],
        cols: [
          {
            name: "D1",
            display_name: "Dimension 1",
            base_type: TYPE.Float,
          },
          {
            name: "M1",
            display_name: "Metric",
            base_type: TYPE.Integer,
            special_type: "type/Currency",
          },
        ],
      };
      let getRowSection;
      ({ getRowSection } = multiLevelPivot(data, [0], [], [1]));
      expect(getRowSection(1)).toEqual([["1,000"]]);
      ({ getRowSection } = multiLevelPivot(data, [], [0], [1]));
      expect(getRowSection(undefined, 1)).toEqual([["1,000"]]);
    });
    it("should format multiple values", () => {
      const data = {
        rows: [
          [1, 1, "2020-01-01T00:00:00", 1000],
          [1, 2, "2020-01-01T00:00:00", 1000],
          [2, 1, "2020-01-01T00:00:00", 1000],
        ],
        cols: [
          { name: "D1", display_name: "Dimension 1", base_type: TYPE.Float },
          { name: "D2", display_name: "Dimension 2", base_type: TYPE.Float },
          { name: "D3", display_name: "Dimension 3", base_type: TYPE.DateTime },
          {
            name: "M1",
            display_name: "Metric",
            base_type: TYPE.Integer,
            special_type: "type/Currency",
          },
        ],
      };

      const { getRowSection } = multiLevelPivot(data, [0], [1], [2, 3]);
      expect(getRowSection(1, 1)).toEqual([
        ["January 1, 2020, 12:00 AM", "1,000"],
      ]);
      expect(getRowSection(2, 2)).toEqual([[null, null]]);
    });
  });
});
