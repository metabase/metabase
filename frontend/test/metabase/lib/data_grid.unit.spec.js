import _ from "underscore";

import {
  pivot,
  multiLevelPivot,
  COLUMN_SPLIT_SETTING,
  COLLAPSED_ROWS_SETTING,
  COLUMN_SORT_ORDER,
  COLUMN_SHOW_TOTALS,
} from "metabase/lib/data_grid";

import { TYPE } from "metabase/lib/types";

const dimension = i => ({
  name: "D" + i,
  display_name: "Dimension " + i,
  base_type: TYPE.Text,
  source: "breakout",
});

const D1 = dimension(1);
const D2 = dimension(2);
const D3 = dimension(3);
const D4 = dimension(4);

const M = { name: "M", display_name: "Metric", base_type: TYPE.Integer };

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
      expect(pivotedData.cols[0].name).toEqual(expect.any(String));
      expect(pivotedData.cols[0].display_name).toEqual(expect.any(String));
      expect(pivotedData.cols[1].name).toEqual(expect.any(String));
      expect(pivotedData.cols[1].display_name).toEqual(expect.any(String));
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
    const getValues = items => _.pluck(items, "value");
    const getPathsAndValues = items =>
      items.map(item => _.pick(item, "path", "value"));

    // This function adds fake field_refs so the settings can be associated with columns in the data
    const multiLevelPivotForIndexes = (
      data,
      columns,
      rows,
      values,
      { collapsedRows = [], columnSorts = [], columnShowTotals = [] } = {},
    ) => {
      const settings = {
        column: column => {
          const columnIndex = column.field_ref[1];
          return {
            column,
            [COLUMN_SHOW_TOTALS]: columnShowTotals[columnIndex],
            [COLUMN_SORT_ORDER]: columnSorts[columnIndex],
          };
        },
        [COLUMN_SPLIT_SETTING]: _.mapObject(
          { columns, rows, values },
          indexes => indexes.map(index => ["fake field ref", index]),
        ),
        [COLLAPSED_ROWS_SETTING]: { value: collapsedRows },
      };
      data = {
        ...data,
        cols: data.cols.map((col, index) => ({
          ...col,
          field_ref: ["fake field ref", index],
        })),
      };
      return multiLevelPivot(data, settings);
    };

    const data = makePivotData([
      ["a", "x", 1],
      ["a", "y", 2],
      ["a", "z", 3],
      ["b", "x", 4],
      ["b", "y", 5],
      ["b", "z", 6],
    ]);
    it("should produce multi-level top header", () => {
      const {
        topHeaderItems,
        leftHeaderItems,
        rowCount,
        columnCount,
      } = multiLevelPivotForIndexes(data, [0, 1], [], [2]);
      expect(getPathsAndValues(topHeaderItems)).toEqual([
        { value: "a", path: ["a"] },
        { value: "x", path: ["a", "x"] },
        { value: "y", path: ["a", "y"] },
        { value: "z", path: ["a", "z"] },
        { value: "b", path: ["b"] },
        { value: "x", path: ["b", "x"] },
        { value: "y", path: ["b", "y"] },
        { value: "z", path: ["b", "z"] },
        { value: "Row totals", path: null },
      ]);
      expect(leftHeaderItems).toEqual([]);
      expect(rowCount).toEqual(1);
      expect(columnCount).toEqual(7);
    });
    it("should produce multi-level left header", () => {
      const {
        topHeaderItems,
        leftHeaderItems,
        rowCount,
        columnCount,
      } = multiLevelPivotForIndexes(data, [], [0, 1], [2]);
      expect(getPathsAndValues(leftHeaderItems)).toEqual([
        { value: "a", path: ["a"] },
        { value: "x", path: ["a", "x"] },
        { value: "y", path: ["a", "y"] },
        { value: "z", path: ["a", "z"] },
        { value: "Totals for a", path: ["a"] },
        { value: "b", path: ["b"] },
        { value: "x", path: ["b", "x"] },
        { value: "y", path: ["b", "y"] },
        { value: "z", path: ["b", "z"] },
        { value: "Totals for b", path: ["b"] },
        { value: "Grand totals", path: null },
      ]);
      expect(getValues(topHeaderItems)).toEqual(["Metric"]);
      expect(rowCount).toEqual(9);
      expect(columnCount).toEqual(1);
    });
    it("should allow unspecified values", () => {
      const data = makePivotData([
        ["a", "x", 1],
        ["a", "y", 2],
        ["b", "x", 3],
        // ["b", "y", ...], not present
      ]);
      const {
        topHeaderItems,
        leftHeaderItems,
        getRowSection,
      } = multiLevelPivotForIndexes(data, [0], [1], [2]);
      expect(getValues(leftHeaderItems)).toEqual(["x", "y", "Grand totals"]);
      expect(getValues(topHeaderItems)).toEqual(["a", "b", "Row totals"]);
      expect(getValues(getRowSection(0, 0))).toEqual(["1"]);
      expect(getValues(getRowSection(1, 1))).toEqual([null]);
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

      const {
        topHeaderItems,
        leftHeaderItems,
        getRowSection,
      } = multiLevelPivotForIndexes(data, [0], [1], [2, 3]);
      expect(getValues(topHeaderItems)).toEqual(["a", "Metric 1", "Metric 2"]);
      expect(getValues(leftHeaderItems)).toEqual(["b"]);
      expect(getValues(getRowSection(0, 0))).toEqual(["1", "2"]);
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

      const {
        rowCount,
        columnCount,
        topHeaderItems,
        leftHeaderItems,
      } = multiLevelPivotForIndexes(data, [], [0, 1, 2], [3]);
      expect(getValues(topHeaderItems)).toEqual(["Metric"]);
      expect(getPathsAndValues(leftHeaderItems)).toEqual([
        { path: ["a1"], value: "a1" },
        { path: ["a1", "b1"], value: "b1" },
        { path: ["a1", "b1", "c1"], value: "c1" },
        { path: ["a1", "b1", "c2"], value: "c2" },
        { path: ["a1", "b1"], value: "Totals for b1" },
        { path: ["a1", "b2"], value: "b2" },
        { path: ["a1", "b2", "c1"], value: "c1" },
        { path: ["a1", "b2", "c2"], value: "c2" },
        { path: ["a1", "b2"], value: "Totals for b2" },
        { path: ["a1"], value: "Totals for a1" },
        { path: ["a2"], value: "a2" },
        { path: ["a2", "b1"], value: "b1" },
        { path: ["a2", "b1", "c1"], value: "c1" },
        { path: ["a2", "b1", "c2"], value: "c2" },
        { path: ["a2", "b1"], value: "Totals for b1" },
        { path: ["a2", "b2"], value: "b2" },
        { path: ["a2", "b2", "c1"], value: "c1" },
        { path: ["a2", "b2", "c2"], value: "c2" },
        { path: ["a2", "b2"], value: "Totals for b2" },
        { path: ["a2"], value: "Totals for a2" },
        { path: null, value: "Grand totals" },
      ]);
      expect(rowCount).toEqual(15);
      expect(columnCount).toEqual(1);
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
            semantic_type: "type/Currency",
          },
        ],
      );

      const {
        getRowSection,
        topHeaderItems,
        leftHeaderItems,
      } = multiLevelPivotForIndexes(data, [0], [1], [2]);
      expect(getValues(topHeaderItems)).toEqual(["1  –  11"]);
      expect(getValues(leftHeaderItems)).toEqual(["January 1, 2020, 12:00 AM"]);
      expect(getValues(getRowSection(0, 0))).toEqual(["1,000"]);
    });
    it("should format values without a pivoted column or row", () => {
      const data = makePivotData(
        [[1, 1000]],
        [
          D1,
          {
            name: "M1",
            display_name: "Metric",
            base_type: TYPE.Integer,
            semantic_type: "type/Currency",
          },
        ],
      );
      let getRowSection;
      ({ getRowSection } = multiLevelPivotForIndexes(data, [0], [], [1]));
      expect(getValues(getRowSection(0, 0))).toEqual(["1,000"]);
      ({ getRowSection } = multiLevelPivotForIndexes(data, [], [0], [1]));
      expect(getValues(getRowSection(0, 0))).toEqual(["1,000"]);
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
            semantic_type: "type/Currency",
          },
        ],
      );

      const { getRowSection } = multiLevelPivotForIndexes(
        data,
        [0],
        [1],
        [2, 3],
      );
      expect(getValues(getRowSection(0, 0))).toEqual([
        "January 1, 2020, 12:00 AM",
        "1,000",
      ]);
      expect(getValues(getRowSection(1, 1))).toEqual([null, null]);
    });

    it("should return subtotals in each section", () => {
      const cols = [D1, D2, M];
      const primaryGroup = 0;
      const subtotalOne = 2;
      const subtotalTwo = 3;
      const rows = [
        ["a", "x", 1, primaryGroup],
        ["a", "y", 2, primaryGroup],
        ["b", "x", 3, primaryGroup],
        ["b", "y", 4, primaryGroup],
        ["a", null, 3, subtotalOne],
        ["b", null, 7, subtotalOne],
        [null, null, 10, subtotalTwo],
      ];
      const data = {
        rows,
        cols: [...cols, { name: "pivot-grouping", base_type: TYPE.Text }],
      };
      const {
        getRowSection,
        rowCount,
        columnCount,
      } = multiLevelPivotForIndexes(data, [], [0, 1], [2]);
      expect(rowCount).toEqual(7);
      expect(columnCount).toEqual(1);
      expect(_.range(rowCount).map(i => getRowSection(0, i)[0].value)).toEqual([
        "1",
        "2",
        "3",
        "3",
        "4",
        "7",
        "10",
      ]);
    });
    describe("sorting", () => {
      it("sorts multiple columns ascending", () => {
        const { leftHeaderItems } = multiLevelPivotForIndexes(
          data,
          [],
          [0, 1],
          [2],
          {
            columnSorts: ["ascending", "ascending"],
          },
        );
        expect(getValues(leftHeaderItems).slice(0, 4)).toEqual([
          "a",
          "x",
          "y",
          "z",
        ]);
      });

      it("sorts multiple columns descending", () => {
        const { leftHeaderItems } = multiLevelPivotForIndexes(
          data,
          [],
          [0, 1],
          [2],
          {
            columnSorts: ["descending", "descending"],
          },
        );
        expect(getValues(leftHeaderItems).slice(0, 4)).toEqual([
          "b",
          "z",
          "y",
          "x",
        ]);
      });

      it("should sort letters with accents correctly", () => {
        const data = makePivotData([["a", 0], ["à", 0], ["b", 0]], [D1, M]);

        let { leftHeaderItems } = multiLevelPivotForIndexes(
          data,
          [],
          [0],
          [1],
          { columnSorts: ["ascending"] },
        );
        expect(getValues(leftHeaderItems).slice(0, 3)).toEqual(["a", "à", "b"]);
        ({ leftHeaderItems } = multiLevelPivotForIndexes(data, [], [0], [1], {
          columnSorts: ["descending"],
        }));
        expect(getValues(leftHeaderItems).slice(0, 3)).toEqual(["b", "à", "a"]);
      });

      it("should numbers correctly", () => {
        const D = {
          name: "D",
          display_name: "Dimension",
          base_type: TYPE.Float,
          binning_info: { bin_width: 1 },
          source: "breakout",
        };

        const data = makePivotData([[0, 0], [1, 0], [2, 0]], [D, M]);

        let { leftHeaderItems } = multiLevelPivotForIndexes(
          data,
          [],
          [0],
          [1],
          { columnSorts: ["ascending"] },
        );
        expect(getValues(leftHeaderItems).slice(0, 3)).toEqual([
          "0  –  1",
          "1  –  2",
          "2  –  3",
        ]);

        ({ leftHeaderItems } = multiLevelPivotForIndexes(data, [], [0], [1], {
          columnSorts: ["descending"],
        }));
        expect(getValues(leftHeaderItems).slice(0, 3)).toEqual([
          "2  –  3",
          "1  –  2",
          "0  –  1",
        ]);
      });
    });

    describe("row collapsing", () => {
      const cols = [D1, D2, M];
      const primaryGroup = 0;
      const subtotalOne = 2;
      const rows = [
        ["a", "x", 1, primaryGroup],
        ["a", "y", 2, primaryGroup],
        ["b", "x", 3, primaryGroup],
        ["b", "y", 4, primaryGroup],
        ["a", null, 3, subtotalOne],
        ["b", null, 7, subtotalOne],
      ];
      const data = {
        rows,
        cols: [...cols, { name: "pivot-grouping", base_type: TYPE.Text }],
      };
      it("hides single collapsed rows", () => {
        const {
          getRowSection,
          leftHeaderItems,
          rowCount,
        } = multiLevelPivotForIndexes(data, [], [0, 1], [2], {
          collapsedRows: ['["a"]'],
        });
        expect(rowCount).toEqual(5);
        expect(leftHeaderItems[0].value).toEqual("Totals for a"); // a is collapsed
        expect(getRowSection(0, 0)).toEqual([{ isSubtotal: true, value: "3" }]);
      });
      it("hides collapsed columns", () => {
        const {
          getRowSection,
          leftHeaderItems,
          rowCount,
        } = multiLevelPivotForIndexes(data, [], [0, 1], [2], {
          collapsedRows: ["1"],
        });
        expect(rowCount).toEqual(3);
        expect(leftHeaderItems[0].value).toEqual("Totals for a"); // a is collapsed
        expect(leftHeaderItems[1].value).toEqual("Totals for b"); // b is also collapsed
        expect(getRowSection(0, 0)).toEqual([{ isSubtotal: true, value: "3" }]);
        expect(getRowSection(0, 1)).toEqual([{ isSubtotal: true, value: "7" }]);
      });
    });

    it("should hide totals based on a column setting", () => {
      const { leftHeaderItems } = multiLevelPivotForIndexes(
        data,
        [],
        [0, 1],
        [2],
        { columnShowTotals: [false, null] },
      );

      // check that none of the "totals for" values are there
      expect(getValues(leftHeaderItems)).toEqual([
        "a",
        "x",
        "y",
        "z",
        "b",
        "x",
        "y",
        "z",
        "Grand totals",
      ]);
    });

    it("should return multiple levels of subtotals in body cells", () => {
      const cols = [D1, D2, D3, D4, M];
      const primaryGroup = 0;
      const subtotalOne = 4;
      const subtotalTwo = 6;
      const subtotalThree = 7;
      const subtotalFour = 8;
      const subtotalFive = 12;
      const subtotalSix = 14;
      const rows = [
        // primary rows
        ["a", "i", "x", "t1", 1, primaryGroup],
        ["a", "i", "y", "t1", 2, primaryGroup],
        ["a", "j", "x", "t1", 3, primaryGroup],
        ["a", "j", "y", "t1", 4, primaryGroup],
        ["a", "i", "x", "t2", 0, primaryGroup],

        ["a", "i", null, "t1", 3, subtotalOne],
        ["a", "j", null, "t1", 7, subtotalOne],
        ["a", null, null, "t1", 10, subtotalTwo],
        [null, null, null, "t1", 10, subtotalThree],
        ["a", "i", "x", null, 1, subtotalFour],
        ["a", "i", "y", null, 2, subtotalFour],
        ["a", "j", "x", null, 3, subtotalFour],
        ["a", "j", "y", null, 4, subtotalFour],
        ["a", "i", null, null, 3, subtotalFive],
        ["a", "j", null, null, 7, subtotalFive],
        ["a", null, null, null, 10, subtotalSix],
      ];
      const data = {
        rows,
        cols: [...cols, { name: "pivot-grouping", base_type: TYPE.Text }],
      };
      const {
        rowCount,
        columnCount,
        getRowSection,
      } = multiLevelPivotForIndexes(data, [3], [0, 1, 2], [4]);
      const firstColumn = ["1", "2", "3", "3", "4", "7", "10"];
      const lastColumn = ["1", "2", "3", "3", "4", "7", "10"];
      expect(_.range(rowCount).map(i => getRowSection(0, i)[0].value)).toEqual(
        firstColumn,
      );
      expect(
        _.range(rowCount).map(i => getRowSection(columnCount - 1, i)[0].value),
      ).toEqual(lastColumn);
    });
  });
});
