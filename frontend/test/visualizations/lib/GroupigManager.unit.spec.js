import {GroupingManager} from "metabase/visualizations/lib/GroupingManager";
import {TYPE} from "metabase/lib/types";
import type {Row} from "metabase/meta/types/Dataset";

function makeData(rows) {
  return {
    rows: rows,
    cols: [
      {name: "C1", display_name: "Column 1", base_type: TYPE.Text},
      {name: "C2", display_name: "Column 2", base_type: TYPE.Text},
      {name: "C3", display_name: "Column 3", base_type: TYPE.Numeric},
    ],
  };
}

function newStyleWithTop(top: Number) {
  return {height: 1, top: top};
}

const styleMock = newStyleWithTop(0);
const rowVisibleRangeMock = {start: 0, stop: 100};
const newGroupingManager = (columnsIndexesForGrouping: number[], rows: Row[]) => new GroupingManager(1, columnsIndexesForGrouping, rows);
const newSimpleGroupingManager = (rows: Row[]) => newGroupingManager([0], rows);

describe("GroupingManager", () => {
  describe("given empty GroupingManager", () => {
    const gm = newSimpleGroupingManager([]);
    it("should return empty array", () => {
      expect(gm.rowsOrdered).toEqual([]);
    });
  });

  describe("given rows in correct order", () => {
    const data = makeData([
      ["a", "x", 1],
      ["a", "y", 2],
      ["a", "z", 3],
      ["b", "z", 4],
      ["b", "x", 5],
      ["b", "y", 6],
    ]);
    const gm = newSimpleGroupingManager(data.rows);
    it("should return rows in the the same order", () => {
      expect(gm.rowsOrdered).toEqual(data.rows);
    });

    const hiddenCells = [1, 2, 4, 5];
    hiddenCells.forEach(rn => it("should hide row: " + rn, () => expect(gm.isVisible(rn, 0, rowVisibleRangeMock)).toEqual(false)));

    const visibleCells = [0, 3];
    visibleCells.forEach(rn => it("should display row: " + rn, () => expect(gm.isVisible(rn, 0, rowVisibleRangeMock)).toEqual(true)));
  });

  describe("given rows in correct order and columns for grouping (1)", () => {
    const columnsIndexesForGrouping = [0, 1];
    const data = makeData([
      ["a", "x", 0],
      ["a", "x", 1],
      ["a", "z", 2],
      ["b", "x", 3],
      ["b", "x", 4],
      ["b", "z", 5],

    ]);
    const gm = newGroupingManager(columnsIndexesForGrouping, data.rows);
    it("should return rows in the the same order", () => {
      expect(gm.rowsOrdered).toEqual(data.rows);
    });

    const hiddenCells0 = [1, 2, 4, 5];
    hiddenCells0.forEach(rn => it("should hide row: " + rn, () => expect(gm.isVisible(rn, 0,  rowVisibleRangeMock)).toEqual(false)));

    const visibleRows0 = [0, 3];
    visibleRows0.forEach(rn => it("should display row: " + rn, () => expect(gm.isVisible(rn, 0, rowVisibleRangeMock)).toEqual(true)));

    const hiddenCells1 = [1,4];
    hiddenCells1.forEach(rn => it("should hide row: " + rn, () => expect(gm.isVisible(rn, 1,  rowVisibleRangeMock)).toEqual(false)));

    const visibleRows1 = [0,2, 3, 5];
    visibleRows1.forEach(rn => it("should display row: " + rn, () => expect(gm.isVisible(rn, 1, rowVisibleRangeMock)).toEqual(true)));


    it("should have correct row height", () => {
      expect(gm.mapStyle(0, 0, rowVisibleRangeMock, styleMock).height).toEqual(3);
      expect(gm.mapStyle(3, 1, rowVisibleRangeMock, styleMock).height).toEqual(2);
      expect(gm.mapStyle(5, 1, rowVisibleRangeMock, styleMock).height).toEqual(1);
    });

  });

  describe("given rows in correct order and columns for grouping (3)", () => {
    const columnsIndexesForGrouping = [0, 1];
    const data = makeData([
      ["a", "x", 0],
      ["b", "x", 1],
      ["c", "z", 2],
      ["d", "x", 3],
      ["e", "x", 4],
      ["f", "z", 5],

    ]);
    const gm = newGroupingManager(columnsIndexesForGrouping, data.rows);
    it("should return rows in the the same order", () => {
      expect(gm.rowsOrdered).toEqual(data.rows);
    });

    const visibleRows0 = [0, 1, 2, 3, 4, 5];
    visibleRows0.forEach(rn => it("should display row: " + rn, () => expect(gm.isVisible(rn, 0, rowVisibleRangeMock)).toEqual(true)));


    const visibleRows1 = [0, 1, 2, 3, 4, 5];
    visibleRows1.forEach(rn => it("should display row: " + rn, () => expect(gm.isVisible(rn, 1, rowVisibleRangeMock)).toEqual(true)));


    const rows = [0, 1, 2, 3, 4, 5];
    rows.forEach(rowIndex =>
    it("should have correct row height", () => {
      expect(gm.mapStyle(rowIndex, 0, rowVisibleRangeMock, styleMock).height).toEqual(1);
      expect(gm.mapStyle(rowIndex, 1, rowVisibleRangeMock, styleMock).height).toEqual(1);
    }));

  });
    describe("given rows in correct order and columns for grouping (2)", () => {
    const columnsIndexesForGrouping2 = [1, 0];
    const data2 = makeData([
      ["a", "x", 0],
      ["a", "x", 1],
      ["b", "x", 2],
      ["b", "x", 3],
      ["a", "z", 4],
      ["b", "z", 5],
    ]);
    const gm = newGroupingManager(columnsIndexesForGrouping2, data2.rows);
    it("should return rows in the the same order", () => {
      expect(gm.rowsOrdered).toEqual(data2.rows);
    });

    const hiddenCells1 = [1, 2, 3, 5];
    hiddenCells1.forEach(rn => it("should hide row: " + rn, () => expect(gm.isVisible(rn, 1,  rowVisibleRangeMock)).toEqual(false)));

    const visibleRows1 = [0, 4];
    visibleRows1.forEach(rn => it("should display row: " + rn, () => expect(gm.isVisible(rn, 1, rowVisibleRangeMock)).toEqual(true)));

      const hiddenCells0 = [1, 3];
      hiddenCells0.forEach(rn => it("should hide row: " + rn, () => expect(gm.isVisible(rn, 0,  rowVisibleRangeMock)).toEqual(false)));

      const visibleRows0 = [0, 2,4,5];
      visibleRows0.forEach(rn => it("should display row: " + rn, () => expect(gm.isVisible(rn, 0, rowVisibleRangeMock)).toEqual(true)));


      it("should have correct row height", () => {
        expect(gm.mapStyle(0, 1, rowVisibleRangeMock, styleMock).height).toEqual(4);
        expect(gm.mapStyle(2, 0, rowVisibleRangeMock, styleMock).height).toEqual(2);
        expect(gm.mapStyle(4, 0, rowVisibleRangeMock, styleMock).height).toEqual(1);
        expect(gm.mapStyle(4, 1, rowVisibleRangeMock, styleMock).height).toEqual(2);
      });
  });

  describe("given rows in incorrect order", () => {
    const data = makeData([
      ["a", "x", 1],
      ["c", "z", 4],
      ["b", "x", 5],
      ["a", "y", 2],
      ["a", "z", 3],
      ["b", "y", 6],
    ]);
    const expectedData = makeData([
      ["a", "x", 1],
      ["a", "y", 2],
      ["a", "z", 3],
      ["c", "z", 4],
      ["b", "x", 5],
      ["b", "y", 6],
    ]);
    const gm = newSimpleGroupingManager(data.rows);
    it("should return rows in group order", () => {
      expect(gm.rowsOrdered).toEqual(expectedData.rows);
    });

    const hiddenRows = [1, 2, 5];
    hiddenRows.forEach(rn => it("should display cell: " + rn + ",0", () => expect(gm.isVisible(rn, 0, rowVisibleRangeMock)).toEqual(false)));

    const visibleRows = [0, 3, 4];
    visibleRows.forEach(rn => it("should hide cell: " + rn + ",0", () => expect(gm.isVisible(rn, 0, rowVisibleRangeMock)).toEqual(true)));

    it("should have correct row height", () => {
      expect(gm.mapStyle(0, 0, rowVisibleRangeMock, styleMock).height).toEqual(3);
      expect(gm.mapStyle(3, 0, rowVisibleRangeMock, styleMock).height).toEqual(1);
      expect(gm.mapStyle(4, 0, rowVisibleRangeMock, styleMock).height).toEqual(2);
    });
  });


  describe("given rows in incorrect order and columns for grouping", () => {
    const columnsIndexesForGrouping1 = [1, 0];
    const data = makeData([
      ["a", "x", 1],
      ["a", "z", 3],
      ["c", "z", 4],
      ["b", "x", 2],
      ["a", "y", 5],
      ["b", "y", 6],
    ]);
    const expectedData = makeData([
      ["a", "x", 1],
      ["b", "x", 2],
      ["a", "z", 3],
      ["c", "z", 4],
      ["a", "y", 5],
      ["b", "y", 6],
    ]);
    const gm = newGroupingManager(columnsIndexesForGrouping1, data.rows);
    it("should return rows in group order", () => {
      expect(gm.rowsOrdered).toEqual(expectedData.rows);
    }); });

  describe("given range of visible rows with lower boundary", () => {
    const index3 = 3;
    const index6 = 6;
    const rowVisibleRange = {start: index3, stop: 100};

    const data = makeData([
      ["a", "x", 0],
      ["a", "z", 1],
      ["a", "x", 2],
      ["a", "y", index3],
      ["a", "z", 4],
      ["a", "y", 5],
      ["b", "z", index6],
      ["b", "x", 7],
      ["b", "y", 8],
      ["b", "z", 9],
      ["b", "y", 10],
    ]);

    const gm = newSimpleGroupingManager(data.rows);
    it("should return rows in the the same order", () =>
      expect(gm.rowsOrdered).toEqual(data.rows)
    );

    const hiddenRows = [0, 1, 2, 4, 5, 7, 8, 9, 10];

    hiddenRows.forEach(rn =>
      it("should hide row: " + rn, () => expect(gm.isVisible(rn, 0, rowVisibleRange)).toEqual(false)));

    const visibleRows = [index3, index6];
    visibleRows.forEach(rn => it("should display row: " + rn, () =>
      expect(gm.isVisible(rn, 0, rowVisibleRange)).toEqual(true))
    );


    it(`row number ${index3} should has correct height and top `, () => {
      const top = 3;
      const style = gm.mapStyle(index3, 0, rowVisibleRange, newStyleWithTop(top));
      expect(style.height).toEqual(3);
      expect(style.top).toEqual(top);
    });

    it(`row number ${index6} should has correct height and top `, () => {
      const top = 6;
      const style = gm.mapStyle(index6, 0, rowVisibleRange, newStyleWithTop(top));
      expect(style.height).toEqual(5);
      expect(style.top).toEqual(top);
    });
  });
});
