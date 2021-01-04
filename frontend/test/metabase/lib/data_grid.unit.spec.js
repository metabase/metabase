import { pivot, multiLevelPivot } from "metabase/lib/data_grid";

import { TYPE } from "metabase/lib/types";

const D1 = {
  name: "D1",
  display_name: "Dimension 1",
  base_type: TYPE.Text,
  source: "breakout",
};
const D2 = {
  name: "D2",
  display_name: "Dimension 2",
  base_type: TYPE.Text,
  source: "breakout",
};
const M = { name: "M", display_name: "Metric", base_type: TYPE.Integer };

const GRAND_TOTALS_ROW = [
  [
    [
      {
        isGrandTotal: true,
        isSubtotal: true,
        span: 1,
        value: "Grand totals",
      },
    ],
  ],
];

function makeData(rows) {
  return {
    rows: rows,
    cols: [D1, D2, M],
  };
}

function makePivotData(rows, cols) {
  cols = cols || [D1, D2, M];

  const primaryGroup = 0;
  return {
    rows: rows.map(row => [...row, primaryGroup]),
    cols: [...cols, { name: "pivot-grouping", base_type: TYPE.Text }],
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
    const extractValues = rows => rows.map(row => row.map(item => item.value));

    const data = makePivotData([
      ["a", "x", 1],
      ["a", "y", 2],
      ["a", "z", 3],
      ["b", "x", 4],
      ["b", "y", 5],
      ["b", "z", 6],
    ]);
    it("should produce multi-level top index", () => {
      const { topIndex, leftIndex, rowCount, columnCount } = multiLevelPivot(
        data,
        [0, 1],
        [],
        [2],
      );
      expect(topIndex).toEqual([
        [
          [{ span: 3, value: "a" }],
          [
            { span: 1, value: "x" },
            { span: 1, value: "y" },
            { span: 1, value: "z" },
          ],
        ],
        [
          [{ span: 3, value: "b" }],
          [
            { span: 1, value: "x" },
            { span: 1, value: "y" },
            { span: 1, value: "z" },
          ],
        ],
        [[{ span: 1, value: "Row totals" }], [{ span: 1, value: "Metric" }]],
      ]);
      expect(leftIndex).toEqual([]);
      expect(rowCount).toEqual(1);
      expect(columnCount).toEqual(3);
    });
    it("should produce multi-level left index", () => {
      const { topIndex, leftIndex, rowCount, columnCount } = multiLevelPivot(
        data,
        [],
        [0, 1],
        [2],
      );
      expect(leftIndex).toEqual([
        [
          [
            [{ value: "a", span: 3 }],
            [
              { value: "x", span: 1 },
              { value: "y", span: 1 },
              { value: "z", span: 1 },
            ],
          ],
          [[{ isSubtotal: true, span: 1, value: "Totals for a" }]],
        ],
        [
          [
            [{ value: "b", span: 3 }],
            [
              { value: "x", span: 1 },
              { value: "y", span: 1 },
              { value: "z", span: 1 },
            ],
          ],
          [[{ isSubtotal: true, span: 1, value: "Totals for b" }]],
        ],
        GRAND_TOTALS_ROW,
      ]);
      expect(topIndex).toEqual([[[{ value: "Metric", span: 1 }]]]);
      expect(rowCount).toEqual(3);
      expect(columnCount).toEqual(1);
    });
    it("should allow unspecified values", () => {
      const data = makePivotData([
        ["a", "x", 1],
        ["a", "y", 2],
        ["b", "x", 3],
        // ["b", "y", ...], not present
      ]);
      const { leftIndex, topIndex, getRowSection } = multiLevelPivot(
        data,
        [0],
        [1],
        [2],
      );
      expect(leftIndex).toEqual([
        [[[{ value: "x", span: 1 }]]],
        [[[{ value: "y", span: 1 }]]],
        GRAND_TOTALS_ROW,
      ]);
      expect(topIndex).toEqual([
        [[{ value: "a", span: 1 }]],
        [[{ value: "b", span: 1 }]],
        [[{ span: 1, value: "Row totals" }], [{ value: "Metric", span: 1 }]],
      ]);
      expect(extractValues(getRowSection(0, 0))).toEqual([["1"]]);
      expect(extractValues(getRowSection(1, 1))).toEqual([[null]]);
    });
    it("should handle multiple value columns", () => {
      const data = makePivotData(
        [["a", "b", 1, 2]],
        [
          D1,
          D2,
          { name: "M1", display_name: "Metric 1", base_type: TYPE.Integer },
          { name: "M2", display_name: "Metric 2", base_type: TYPE.Integer },
        ],
      );

      const { topIndex, leftIndex, getRowSection } = multiLevelPivot(
        data,
        [0],
        [1],
        [2, 3],
      );
      expect(topIndex).toEqual([
        [
          [{ value: "a", span: 2 }],
          [{ value: "Metric 1", span: 1 }, { value: "Metric 2", span: 1 }],
        ],
      ]);
      expect(leftIndex).toEqual([[[[{ value: "b", span: 1 }]]]]);
      expect(extractValues(getRowSection(0, 0))).toEqual([["1", "2"]]);
    });
    it("should work with three levels of row grouping", () => {
      // three was picked because there was a bug during development that showed up with at least three
      const data = makePivotData(
        [
          ["a1", "b1", "c1", 1],
          ["a1", "b1", "c2", 1],
          ["a1", "b2", "c1", 1],
          ["a1", "b2", "c2", 1],
          ["a2", "b1", "c1", 1],
          ["a2", "b1", "c2", 1],
          ["a2", "b2", "c1", 1],
          ["a2", "b2", "c2", 1],
        ],
        [
          D1,
          D2,
          {
            name: "D3",
            display_name: "Dimension 3",
            base_type: TYPE.Text,
            source: "breakout",
          },
          { name: "M1", display_name: "Metric", base_type: TYPE.Integer },
        ],
      );

      const { topIndex, leftIndex } = multiLevelPivot(data, [], [0, 1, 2], [3]);
      expect(topIndex).toEqual([[[{ span: 1, value: "Metric" }]]]);
      expect(leftIndex).toEqual([
        [
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
          [[{ isSubtotal: true, span: 1, value: "Totals for a1" }]],
        ],
        [
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
          [[{ isSubtotal: true, span: 1, value: "Totals for a2" }]],
        ],
        GRAND_TOTALS_ROW,
      ]);
    });
    it("should format values", () => {
      const data = makePivotData(
        [[1, "2020-01-01T00:00:00", 1000]],
        [
          {
            name: "D1",
            display_name: "Dimension 1",
            base_type: TYPE.Float,
            binning_info: { bin_width: 10 },
            source: "breakout",
          },
          {
            name: "D2",
            display_name: "Dimension 2",
            base_type: TYPE.DateTime,
            source: "breakout",
          },
          {
            name: "M1",
            display_name: "Metric",
            base_type: TYPE.Integer,
            special_type: "type/Currency",
          },
        ],
      );

      const { getRowSection } = multiLevelPivot(data, [0], [1], [2]);
      expect(extractValues(getRowSection(0, 0))).toEqual([["1,000"]]);
    });
    it("should format values without a pivoted column or row", () => {
      const data = makePivotData(
        [[1, 1000]],
        [
          {
            name: "D1",
            display_name: "Dimension 1",
            base_type: TYPE.Float,
            source: "breakout",
          },
          {
            name: "M1",
            display_name: "Metric",
            base_type: TYPE.Integer,
            special_type: "type/Currency",
          },
        ],
      );
      let getRowSection;
      ({ getRowSection } = multiLevelPivot(data, [0], [], [1]));
      expect(extractValues(getRowSection(0, 0))).toEqual([["1,000"]]);
      ({ getRowSection } = multiLevelPivot(data, [], [0], [1]));
      expect(extractValues(getRowSection(0, 0))).toEqual([["1,000"]]);
    });
    it("should format multiple values", () => {
      const data = makePivotData(
        [
          [1, 1, "2020-01-01T00:00:00", 1000],
          [1, 2, "2020-01-01T00:00:00", 1000],
          [2, 1, "2020-01-01T00:00:00", 1000],
        ],
        [
          D1,
          D2,
          {
            name: "M1",
            display_name: "Metric 1",
            base_type: TYPE.DateTime,
          },
          {
            name: "M2",
            display_name: "Metric 2",
            base_type: TYPE.Integer,
            special_type: "type/Currency",
          },
        ],
      );

      const { getRowSection } = multiLevelPivot(data, [0], [1], [2, 3]);
      expect(extractValues(getRowSection(0, 0))).toEqual([
        ["January 1, 2020, 12:00 AM", "1,000"],
      ]);
      expect(extractValues(getRowSection(1, 1))).toEqual([[null, null]]);
    });

    it("should return subtotals in each section", () => {
      const cols = [D1, D2, M];
      const primaryGroup = 0;
      const subtotalOne = 2;
      const subtotalTwo = 1;
      const subtotalThree = 3;
      const rows = [
        ["a", "x", 1, primaryGroup],
        ["a", "y", 2, primaryGroup],
        ["b", "x", 3, primaryGroup],
        ["b", "y", 4, primaryGroup],
        ["a", null, 3, subtotalOne],
        ["b", null, 7, subtotalOne],
        [null, "x", 4, subtotalTwo],
        [null, "y", 6, subtotalTwo],
        [null, null, 10, subtotalThree],
      ];
      const data = {
        rows,
        cols: [...cols, { name: "pivot-grouping", base_type: TYPE.Text }],
      };
      const { getRowSection, rowCount, columnCount } = multiLevelPivot(
        data,
        [],
        [0, 1],
        [2],
      );
      expect(rowCount).toEqual(3);
      expect(columnCount).toEqual(1);
      expect(extractValues(getRowSection(0, 0))).toEqual([["1"], ["2"], ["3"]]);
      expect(extractValues(getRowSection(0, 1))).toEqual([["3"], ["4"], ["7"]]);
      expect(extractValues(getRowSection(0, 2))).toEqual([["10"]]);
    });
  });
});
